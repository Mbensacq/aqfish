import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { isIchAge, ICH_AGGRAVATED_AT } from './disease';
import type { EnvironmentId } from './environment';
import { SPECIES_LABELS } from './species-catalog';
import { speciesSheet } from './species-sheet';
import { SPECIES, type SpeciesId } from './species';
import { assertTimeStep } from './time-step';
import { CARBON_MEDICATION_HALF_LIFE, CARBON_TREATMENT_WARNING } from './water-carbon';
import {
  MAX_HEATER_TEMPERATURE,
  MAX_MEDICATION,
  MAX_SALT,
  MEDICATION_TRACE,
  setHeaterInPlace,
  targetTemperature,
  type MutableWaterState,
  type WaterState,
} from './water';

/**
 * Traitements des points blancs, lot 2/2 (issue #361, ADR 0091) : chaleur, sel et
 * médicament, à répéter sur plusieurs jours simulés, avec leurs erreurs classiques.
 * Pur et déterministe : aucun hasard, aucune horloge, aucune allocation par pas.
 *
 * Modèle (simplification de jeu, `docs/SOINS.md` §§ 5.1, 12 et 14) :
 * - **produits dans l'eau** : le sel (`WaterState.salt`, g/L) ne part qu'avec les changements
 *   d'eau ; le médicament (`WaterState.medication`, doses d'étiquette) se dégrade aussi avec le
 *   temps (demi-vie `MEDICATION_HALF_LIFE`) : il faut le redoser ;
 * - **protection** (`ichProtected`) : sel à 5 g/L dans une eau à 24 °C au moins (Merck), ou
 *   médicament à `MEDICATION_EFFECTIVE` dose au moins. Elle tue les formes libres : aucune
 *   nouvelle infection (`stepIchInPlace`) ;
 * - **cure** (`WaterState.ichCure`, dans [0, 1[) : avance tant que le bac est protégé et
 *   compte un malade, d'autant plus vite que l'eau est chaude (`ichCycleDays`) ; les points
 *   reculent avec elle ; à 1, les animaux sont guéris. Une protection interrompue avant
 *   (produit retiré par un changement d'eau, médicament non redosé) efface l'avancement : la
 *   maladie reprend là où elle en est ;
 * - **chaleur** : monte la consigne du chauffage pas à pas, plafonnée à la température
 *   tolérée la plus basse des espèces présentes ; elle ne guérit pas seule, elle raccourcit le
 *   cycle du parasite, donc le traitement.
 *
 * Les valeurs sourcées citent `docs/SOINS.md` ; les autres sont des **approximations de jeu**
 * (temps compressé : une journée simulée dure `TREATMENT_DAY_SECONDS`).
 */

/** Traitements proposés, dans l'ordre du panneau. */
export const TREATMENT_KINDS = ['chaleur', 'sel', 'medicament'] as const;

/** Traitement des points blancs. */
export type TreatmentKind = (typeof TREATMENT_KINDS)[number];

/** Niveau de preuve d'un traitement (`docs/SOINS.md` § 12, `niveau_preuve`). */
export type TreatmentEvidence = 'efficace' | 'soutien';

/** Description d'un traitement pour le panneau « Soins ». */
export interface TreatmentInfo {
  readonly label: string;
  /** Quantité ajoutée par un geste (°C, g/L ou dose). */
  readonly step: number;
  /** Libellé du bouton (« Sel »), court : les trois tiennent sur une ligne du panneau. */
  readonly button: string;
  /** Nom accessible du bouton (« Ajouter 1 g/L de sel »). */
  readonly aria: string;
  /** Référence consultable, ou « approximation de jeu ». */
  readonly source: string;
  /** Source en quelques mots, pour la ligne des sources du panneau. */
  readonly shortSource: string;
  readonly evidence: TreatmentEvidence;
}

/** Durée d'une journée simulée, en secondes (celle de l'horloge du jeu, 20 min). */
export const TREATMENT_DAY_SECONDS = DEFAULT_DAY_LENGTH_SECONDS;

/** Sel contre les points blancs : 5 g/L (Merck, `docs/SOINS.md` § 5.1). */
export const ICH_SALT_DOSE = MAX_SALT;
/** Le sel n'agit qu'à cette température de l'eau au moins, en °C (Merck, § 5.1). */
export const ICH_SALT_MIN_TEMPERATURE = 24;
/**
 * Demi-vie du médicament dans l'eau, en secondes : une journée simulée. Approximation de jeu,
 * choisie pour que le rythme de la notice (une dose tous les deux jours, jours 1 et 3,
 * `docs/SOINS.md` § 1.4) garde l'eau protégée sans surdosage.
 */
export const MEDICATION_HALF_LIFE = TREATMENT_DAY_SECONDS;
/**
 * Médicament qui protège encore, en doses : une dose seule agit log₂ 5 ≈ 2,3 jours.
 * Approximation de jeu.
 */
export const MEDICATION_EFFECTIVE = 0.2;
/**
 * Médicament au-dessus duquel une nouvelle dose est refusée (surdosage), en doses : on
 * redose à partir du lendemain. Approximation de jeu.
 */
export const MEDICATION_REDOSE_AT = 0.5;
/** Écart maximal entre la consigne et l'eau pour monter encore la chaleur, en °C (jeu). */
export const HEAT_MAX_LAG = 2;
/**
 * Cycles du parasite à couvrir pour guérir : au minimum 5 traitements (Texas A&M CIR920,
 * `docs/SOINS.md` § 5.1).
 */
export const ICH_CURE_CYCLES = 5;

/** Traitements : libellé, geste, source et niveau de preuve. */
export const TREATMENTS: Readonly<Record<TreatmentKind, TreatmentInfo>> = {
  chaleur: {
    label: 'chaleur',
    step: 1,
    button: 'Chaleur',
    aria: 'Monter le chauffage de 1 °C',
    source: 'approximation de jeu (cycle plus court au chaud : § 5.1, source secondaire)',
    shortSource: 'approximation de jeu',
    evidence: 'soutien',
  },
  sel: {
    label: 'sel',
    step: 1,
    button: 'Sel',
    aria: 'Ajouter 1 g/L de sel',
    source: 'docs/SOINS.md § 5.1 (Merck : 5 g/L une semaine à 24 °C au moins)',
    shortSource: 'Merck',
    evidence: 'efficace',
  },
  medicament: {
    label: 'médicament (formol et vert de malachite)',
    step: 1,
    button: 'Médicament',
    aria: 'Ajouter 1 dose de médicament',
    source: 'docs/SOINS.md § 1.4 (notice Sera costapur : 1 mL pour 40 L, jours 1 et 3)',
    shortSource: 'notice Sera',
    evidence: 'efficace',
  },
};

/** Groupe d'animaux pour la toxicité des produits. */
export type TreatmentGroup = 'poisson' | 'amphibien' | 'invertebre';

/**
 * Espèces invertébrées (crevettes, escargots) : la crevette nettoyeuse du récif (#422, ADR
 * 0103), la crevette cerise et la néritine zèbre (#425, ADR 0104 : « intolérantes aux
 * médicaments à base de cuivre », FishKeeper) ; toute future espèce invertébrée s'ajoute ici,
 * et sel et médicament lui sont refusés.
 */
export const INVERTEBRATES: ReadonlySet<SpeciesId> = new Set<SpeciesId>([
  'crevette',
  'cerise',
  'neritine',
]);

/** Groupe de l'espèce `species` : amphibien (marcheur ou amphibie), invertébré ou poisson. */
export function treatmentGroup(species: SpeciesId): TreatmentGroup {
  if (INVERTEBRATES.has(species)) {
    return 'invertebre';
  }
  const def = SPECIES[species];
  return def.walker !== undefined || def.amphibian !== undefined ? 'amphibien' : 'poisson';
}

/**
 * Espèces sensibles au sel, à traiter avec prudence : les tétras (UF/IFAS VM86) ; corydoras
 * et loches selon l'usage amateur, non vérifié (`docs/SOINS.md` § 4).
 */
export const SALT_SENSITIVE: ReadonlySet<SpeciesId> = new Set<SpeciesId>([
  'neon',
  'tetra',
  'corydora',
  'kuhli',
]);

/**
 * Raison d'un refus : dose invalide, aucun malade, produit toxique pour un animal du bac,
 * surdosage, chaleur au plafond de l'espèce, chaleur montée trop vite.
 */
export type TreatmentRefusal =
  | 'dose-invalide'
  | 'aucun-malade'
  | 'toxique'
  | 'surdosage'
  | 'plafond-espece'
  | 'montee-trop-rapide';

/** Résultat d'un geste de soin : appliqué (avec un message, parfois une mise en garde) ou refusé. */
export type TreatmentOutcome =
  | {
      readonly ok: true;
      readonly kind: TreatmentKind;
      readonly message: string;
      readonly warning?: string;
    }
  | {
      readonly ok: false;
      readonly kind: TreatmentKind;
      readonly reason: TreatmentRefusal;
      readonly message: string;
    };

/** Ce que le geste lit du bac : environnement, espèces présentes, nombre de malades. */
export interface TreatmentContext {
  readonly environment: EnvironmentId;
  /** Espèces des animaux présents (doublons permis). */
  readonly species: readonly SpeciesId[];
  /** Animaux atteints de points blancs (incubation comprise). */
  readonly infected: number;
}

const PRODUCTS_PAGE = 'voir la page « Produits et traitements » du wiki';

/** Texte d'un nombre au dixième, virgule décimale (« 2,5 »). */
export function tenthText(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace('.', ',');
}

/**
 * Plafond de la chaleur pour les espèces `species`, en °C : la température tolérée la plus
 * basse parmi elles (fiches, `speciesSheet`), au plus `MAX_HEATER_TEMPERATURE`. Sans espèce :
 * `MAX_HEATER_TEMPERATURE`.
 */
export function heatCeiling(species: Iterable<SpeciesId>): number {
  let ceiling = MAX_HEATER_TEMPERATURE;
  for (const id of new Set(species)) {
    ceiling = Math.min(ceiling, speciesSheet(id).temperatureTolerated.value.max);
  }
  return ceiling;
}

/** Espèce qui fixe le plafond de la chaleur (`heatCeiling`), ou `null` sans espèce. */
function ceilingSpecies(species: Iterable<SpeciesId>): SpeciesId | null {
  let found: SpeciesId | null = null;
  let ceiling = Number.POSITIVE_INFINITY;
  for (const id of new Set(species)) {
    const max = speciesSheet(id).temperatureTolerated.value.max;
    if (max < ceiling) {
      ceiling = max;
      found = id;
    }
  }
  return found;
}

/**
 * Durée d'un cycle du parasite, en journées simulées, selon la température de l'eau :
 * 1 au-dessus de 24 °C (traiter chaque jour), 2 de 19 à 24 °C (un jour sur deux ;
 * aquariumscience.org, source secondaire), 4 en eau froide (traitements espacés de 3 à 5
 * jours, Texas A&M CIR920 ; `docs/SOINS.md` § 5.1). Une température non finie compte comme
 * froide.
 */
export function ichCycleDays(temperature: number): number {
  if (temperature >= 24) {
    return 1;
  }
  return temperature >= 19 ? 2 : 4;
}

/** Durée d'un traitement complet à `temperature` °C, en secondes simulées. */
export function ichCureSeconds(temperature: number): number {
  return ICH_CURE_CYCLES * ichCycleDays(temperature) * TREATMENT_DAY_SECONDS;
}

/** Vrai si le sel de `water` protège : 5 g/L au moins dans une eau à 24 °C au moins. */
export function saltProtects(water: WaterState): boolean {
  return (water.salt ?? 0) >= ICH_SALT_DOSE - 1e-9 && water.temperature >= ICH_SALT_MIN_TEMPERATURE;
}

/** Vrai si le médicament de `water` protège encore (`MEDICATION_EFFECTIVE` dose au moins). */
export function medicationProtects(water: WaterState): boolean {
  return (water.medication ?? 0) >= MEDICATION_EFFECTIVE;
}

/** Vrai si un traitement efficace est dans l'eau : il tue les formes libres du parasite. */
export function ichProtected(water: WaterState): boolean {
  return saltProtects(water) || medicationProtects(water);
}

/** Animal vu par le traitement. */
export interface TreatedSubject {
  ich?: number;
}

/**
 * Traitement d'un pas de `dt` secondes, **en place** (aucune allocation) : le médicament se
 * dégrade (demi-vie `MEDICATION_HALF_LIFE`, retiré sous `MEDICATION_TRACE`) ; puis, si le bac
 * est protégé (`ichProtected`, sur l'eau du début du pas) et compte un malade, la cure avance
 * de `dt / ichCureSeconds(température)` et l'âge de chaque infection est ramené sous
 * `(1 − cure) × ICH_AGGRAVATED_AT` (les points reculent) ; à 1, toutes les infections sont
 * effacées et la cure aussi. Sans protection ou sans malade, la cure en cours est effacée
 * (traitement arrêté trop tôt : la maladie reprend). Renvoie le nombre d'animaux guéris
 * pendant ce pas.
 * @throws RangeError si `dt` n'est pas un réel strictement positif (rien n'est modifié).
 */
export function stepTreatmentInPlace(
  water: MutableWaterState,
  animals: readonly TreatedSubject[],
  dt: number,
): number {
  assertTimeStep(dt);
  const shielded = ichProtected(water);
  if (water.medication !== undefined) {
    const halfLife = water.carbon === true ? CARBON_MEDICATION_HALF_LIFE : MEDICATION_HALF_LIFE;
    water.medication *= Math.exp((-Math.LN2 * dt) / halfLife);
    if (!(water.medication >= MEDICATION_TRACE)) {
      delete water.medication;
    }
  }
  let infected = 0;
  for (const animal of animals) {
    if (isIchAge(animal.ich)) {
      infected += 1;
    }
  }
  if (!shielded || infected === 0) {
    delete water.ichCure;
    return 0;
  }
  const cure = (water.ichCure ?? 0) + dt / ichCureSeconds(water.temperature);
  if (cure >= 1) {
    delete water.ichCure;
    for (const animal of animals) {
      delete animal.ich;
    }
    return infected;
  }
  water.ichCure = cure;
  const ceiling = (1 - cure) * ICH_AGGRAVATED_AT;
  for (const animal of animals) {
    if (isIchAge(animal.ich) && animal.ich > ceiling) {
      animal.ich = ceiling;
    }
  }
  return 0;
}

function speciesList(ids: Iterable<SpeciesId>): string {
  return [...new Set(ids)].map((id) => SPECIES_LABELS[id].plural).join(', ');
}

function refuse(
  kind: TreatmentKind,
  reason: TreatmentRefusal,
  message: string,
): TreatmentOutcome & { readonly ok: false } {
  return { ok: false, kind, reason, message };
}

/**
 * Refus pour toxicité de `kind` (sel ou médicament) avec les espèces `species`, ou `null` ;
 * `groupOf` donne le groupe de chaque espèce (`treatmentGroup` par défaut).
 * Amphibiens : peau qui absorbe les toxiques (Merck), bains de sel et vert de malachite
 * déconseillés (`docs/SOINS.md` § 8, données partielles : prudence). Invertébrés : prudence,
 * toxicité non vérifiée pour ce médicament (approximation de jeu).
 */
export function treatmentHazard(
  kind: TreatmentKind,
  species: readonly SpeciesId[],
  groupOf: (species: SpeciesId) => TreatmentGroup = treatmentGroup,
): (TreatmentOutcome & { readonly ok: false }) | null {
  if (kind === 'chaleur') {
    return null;
  }
  const exposed = species.filter((id) => groupOf(id) !== 'poisson');
  if (exposed.length === 0) {
    return null;
  }
  const what = kind === 'sel' ? 'Sel refusé' : 'Médicament refusé';
  const groups = new Set(exposed.map(groupOf));
  const who = [
    groups.has('amphibien') ? 'les amphibiens (peau qui absorbe les produits)' : '',
    groups.has('invertebre') ? 'les invertébrés' : '',
  ]
    .filter((text) => text !== '')
    .join(' et ');
  return refuse(
    kind,
    'toxique',
    `${what} : toxique pour ${who} ; présents : ${speciesList(exposed)}. Traiter les poissons à part ; ${PRODUCTS_PAGE}.`,
  );
}

/**
 * Geste de soin `kind` de quantité `amount` (°C, g/L ou dose), **en modifiant** `water`
 * seulement s'il est accepté. Refus, sans rien modifier : quantité non finie, nulle ou
 * négative (`dose-invalide`) ; aucun malade (`aucun-malade`) ; sel ou médicament avec un
 * amphibien ou un invertébré (`toxique`) ; sel au-delà de 5 g/L, médicament au-delà d'une
 * dose par geste ou redosé trop tôt (`surdosage`) ; chaleur déjà au plafond des espèces
 * (`plafond-espece`) ou ajoutée avant que l'eau ait rejoint la consigne (`montee-trop-rapide` :
 * un changement brusque stresse les poissons). La chaleur acceptée est plafonnée.
 */
export function applyTreatmentInPlace(
  water: MutableWaterState,
  kind: TreatmentKind,
  amount: number,
  context: TreatmentContext,
): TreatmentOutcome {
  if (!(amount > 0) || !Number.isFinite(amount)) {
    return refuse(kind, 'dose-invalide', 'Dose invalide : une quantité positive est attendue.');
  }
  if (!(context.infected > 0)) {
    return refuse(
      kind,
      'aucun-malade',
      'Aucun animal malade : pas de traitement à donner (un produit inutile use les poissons).',
    );
  }
  const hazard = treatmentHazard(kind, context.species);
  if (hazard !== null) {
    return hazard;
  }
  const outcome =
    kind === 'sel'
      ? addSalt(water, amount, context)
      : kind === 'medicament'
        ? addMedication(water, amount)
        : raiseHeat(water, amount, context);
  // Traitement efficace donné à un bac malade : la cure commence aussitôt (affichée même
  // simulation à l'arrêt).
  if (outcome.ok && water.ichCure === undefined && ichProtected(water)) {
    water.ichCure = 0;
  }
  if (outcome.ok && kind === 'medicament' && water.carbon === true) {
    return { ...outcome, warning: CARBON_TREATMENT_WARNING };
  }
  return outcome;
}

function addSalt(
  water: MutableWaterState,
  amount: number,
  context: TreatmentContext,
): TreatmentOutcome {
  const salt = (water.salt ?? 0) + amount;
  if (salt > MAX_SALT + 1e-9) {
    return refuse(
      'sel',
      'surdosage',
      `Surdosage refusé : ${tenthText(salt)} g/L dépasseraient les 5 g/L du traitement (Merck) ; ${PRODUCTS_PAGE}.`,
    );
  }
  water.salt = Math.min(salt, MAX_SALT);
  const parts = [`Sel : ${tenthText(water.salt)} g/L.`];
  if (water.salt < ICH_SALT_DOSE - 1e-9) {
    parts.push(`Il en faut 5 g/L pour agir.`);
  }
  if (water.temperature < ICH_SALT_MIN_TEMPERATURE) {
    parts.push(`Le sel n'agit qu'à 24 °C au moins (Merck).`);
  }
  const sensitive = context.species.filter((id) => SALT_SENSITIVE.has(id));
  return {
    ok: true,
    kind: 'sel',
    message: parts.join(' '),
    ...(sensitive.length === 0
      ? {}
      : {
          warning: `Prudence : ${speciesList(sensitive)} tolèrent mal le sel (tétras : UF/IFAS ; autres : non vérifié).`,
        }),
  };
}

function addMedication(water: MutableWaterState, amount: number): TreatmentOutcome {
  const current = water.medication ?? 0;
  if (amount > 1 + 1e-9 || current > MEDICATION_REDOSE_AT || current + amount > MAX_MEDICATION) {
    return refuse(
      'medicament',
      'surdosage',
      `Surdosage refusé : la dose précédente agit encore (${tenthText(current)} dose) ; redoser le lendemain au plus tôt, tous les deux jours (notice).`,
    );
  }
  water.medication = current + amount;
  return {
    ok: true,
    kind: 'medicament',
    message: `Dose ajoutée (${tenthText(water.medication)} dans l'eau) : redoser tous les deux jours, jusqu'à la fin.`,
  };
}

function raiseHeat(
  water: MutableWaterState,
  amount: number,
  context: TreatmentContext,
): TreatmentOutcome {
  const target = targetTemperature(water, context.environment);
  const ceiling = heatCeiling(context.species);
  const limiting = ceilingSpecies(context.species);
  const limitText =
    limiting === null ? '' : ` (${SPECIES_LABELS[limiting].plural} : ${tenthText(ceiling)} °C)`;
  if (target >= ceiling - 1e-9) {
    return refuse(
      'chaleur',
      'plafond-espece',
      `Chaleur refusée : au-delà, l'eau sortirait de la plage tolérée${limitText}.`,
    );
  }
  if (target - water.temperature >= HEAT_MAX_LAG || amount > HEAT_MAX_LAG) {
    return refuse(
      'chaleur',
      'montee-trop-rapide',
      `Chaleur refusée : attendre que l'eau rejoigne ${tenthText(target)} °C ; un changement brusque stresse les poissons.`,
    );
  }
  const next = Math.min(target + amount, ceiling);
  const set = setHeaterInPlace(water, next);
  return {
    ok: true,
    kind: 'chaleur',
    message:
      `Chauffage : ${tenthText(set)} °C. Plus chaud, le cycle du parasite raccourcit, donc le traitement.` +
      (next < target + amount ? ` Plafond atteint${limitText}.` : ''),
  };
}

/** Jours simulés avant que `medication` doses tombent sous `MEDICATION_EFFECTIVE`. */
export function medicationDaysLeft(medication: number): number {
  if (!(medication > MEDICATION_EFFECTIVE)) {
    return 0;
  }
  return (
    (Math.log2(medication / MEDICATION_EFFECTIVE) * MEDICATION_HALF_LIFE) / TREATMENT_DAY_SECONDS
  );
}
