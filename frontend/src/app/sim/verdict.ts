import { TEMPERAMENTS, WATER_CLASSES, type WaterClass } from './compatibility';
import {
  APPROXIMATION,
  source,
  type FieldStatus,
  type HardnessRange,
  type SheetField,
  type ValueRange,
} from './sheet-field';
import { SPECIES, type SpeciesId } from './species';
import { SPECIES_ECOLOGY, type Prey } from './species-ecology';
import { speciesSheet, type Diet } from './species-sheet';
import {
  flagOf,
  LIVES_WITHOUT_FISH,
  LONG_FINS,
  PREDATION_SIZE_FRACTION,
  SLOW_SWIMMERS,
} from './verdict-data';

/**
 * Verdict de compatibilité par paire d'espèces (issue #816, tranche 1 de #730, ADR 0174,
 * `docs/ECOSYSTEME.md` § 3.2) : `compatible`, `precautions` ou `incompatible`, avec chaque
 * raison (eau, prédation, comportement) et sa source ou la mention « approximation de jeu ».
 *
 * Calcul pur, déterministe, sans hasard. Ne remplace pas encore `compatibility()`
 * (`sim/compatibility.ts`), qui pilote les rivalités et l'évitement : ces effets sont inchangés.
 */

/** Niveau d'un verdict, du meilleur au pire. */
export type VerdictLevel = 'compatible' | 'precautions' | 'incompatible';

/** Axe d'une raison. */
export type VerdictAxis = 'eau' | 'predation' | 'comportement';

/** Cause précise d'une raison. */
export type VerdictCause =
  | 'salinite'
  | 'classe-thermique'
  | 'temperature'
  | 'ph'
  | 'durete'
  | 'mange-adultes'
  | 'mange-jeunes'
  | 'taille'
  | 'territoriaux'
  | 'nageoires'
  | 'vitesse'
  | 'sans-poissons';

/** Raison d'un verdict défavorable. */
export interface VerdictReason {
  readonly axis: VerdictAxis;
  readonly cause: VerdictCause;
  readonly level: Exclude<VerdictLevel, 'compatible'>;
  /** Espèce qui agit (mange, mordille, chasse, refuse les poissons) ; `null` pour l'eau et les territoriaux. */
  readonly actor: SpeciesId | null;
  readonly status: FieldStatus;
}

/** Verdict d'une paire : le pire niveau de ses raisons (`compatible` sans raison). */
export interface Verdict {
  readonly level: VerdictLevel;
  readonly reasons: readonly VerdictReason[];
}

/** Plages préférée et tolérée d'un paramètre de l'eau. */
export interface WaterRanges {
  readonly preferred: SheetField<ValueRange>;
  readonly tolerated: SheetField<ValueRange>;
}

/** Ce que le verdict lit d'une espèce (fiche, écologie, données du verdict). */
export interface VerdictProfile {
  readonly species: SpeciesId;
  readonly salinity: 'douce' | 'mer';
  readonly thermal: WaterClass;
  readonly temperature: WaterRanges;
  readonly ph: WaterRanges;
  /** Dureté (GH ou KH) ; `null` si l'espèce n'en a pas : le paramètre n'est pas comparé. */
  readonly hardness: {
    readonly preferred: SheetField<HardnessRange>;
    readonly tolerated: SheetField<HardnessRange>;
  } | null;
  readonly adultSize: number;
  readonly diet: Diet;
  /** Prédateur du jeu (`TEMPERAMENTS`), seul concerné par la règle de taille. */
  readonly predator: boolean;
  readonly prey: SheetField<readonly Prey[]>;
  readonly amphibian: boolean;
  readonly territorial: SheetField<boolean>;
  readonly finNipper: SheetField<boolean>;
  readonly longFins: SheetField<boolean>;
  readonly fastSwimmer: SheetField<boolean>;
  readonly slowSwimmer: SheetField<boolean>;
  readonly livesWithoutFish: SheetField<boolean>;
}

/** Profil d'une espèce du jeu, lu dans sa fiche et ses données d'écologie. */
export function verdictProfile(id: SpeciesId): VerdictProfile {
  const sheet = speciesSheet(id);
  const ecology = SPECIES_ECOLOGY[id];
  return Object.freeze({
    species: id,
    salinity: sheet.hardness.value.kind === 'kh' ? 'mer' : 'douce',
    thermal: WATER_CLASSES[id],
    temperature: { preferred: sheet.temperaturePreferred, tolerated: sheet.temperatureTolerated },
    ph: { preferred: sheet.phPreferred, tolerated: sheet.phTolerated },
    hardness: { preferred: sheet.hardness, tolerated: ecology.hardnessTolerated },
    adultSize: sheet.adultSize.value,
    diet: sheet.diet.value,
    predator: TEMPERAMENTS[id] === 'predateur',
    prey: ecology.prey,
    amphibian: ecology.densityClass.value === 'amphibian',
    territorial: ecology.territorial,
    finNipper: ecology.finNipper,
    longFins: flagOf(LONG_FINS, id),
    fastSwimmer: ecology.fastSwimmer,
    slowSwimmer: flagOf(SLOW_SWIMMERS, id),
    livesWithoutFish: flagOf(LIVES_WITHOUT_FISH, id),
  } satisfies VerdictProfile);
}

/**
 * Statut commun de plusieurs champs : sourcé seulement si tous le sont (références distinctes
 * jointes par « ; »), sinon approximation de jeu.
 */
export function combinedStatus(...statuses: readonly FieldStatus[]): FieldStatus {
  const references: string[] = [];
  for (const status of statuses) {
    if (status.kind !== 'source') {
      return APPROXIMATION;
    }
    if (!references.includes(status.reference)) {
      references.push(status.reference);
    }
  }
  return references.length === 0 ? APPROXIMATION : source(references.join(' ; '));
}

/** Vrai si les deux plages ont au moins une valeur commune (bornes comprises). */
export function overlaps(a: ValueRange, b: ValueRange): boolean {
  return Math.max(a.min, b.min) <= Math.min(a.max, b.max);
}

function waterReason(
  cause: VerdictCause,
  level: VerdictReason['level'],
  status: FieldStatus,
): VerdictReason {
  return Object.freeze({ axis: 'eau', cause, level, actor: null, status });
}

/**
 * Raison d'un paramètre de l'eau : plages préférées communes, aucune ; seules les tolérées,
 * `precautions` (statut des plages préférées) ; aucune, `incompatible` (statut des tolérées).
 */
function rangeReason(cause: VerdictCause, a: WaterRanges, b: WaterRanges): VerdictReason | null {
  if (overlaps(a.preferred.value, b.preferred.value)) {
    return null;
  }
  if (overlaps(a.tolerated.value, b.tolerated.value)) {
    return waterReason(
      cause,
      'precautions',
      combinedStatus(a.preferred.status, b.preferred.status),
    );
  }
  return waterReason(cause, 'incompatible', combinedStatus(a.tolerated.status, b.tolerated.status));
}

/**
 * Raisons de l'eau. Classes différentes (eau douce et mer, ou eau froide et tropicale ;
 * l'eau tempérée du paludarium n'exclut aucune des deux) : `incompatible`, approximation de jeu
 * (classement du jeu), sans comparer les plages. Sinon température, pH et dureté (de même
 * nature, et si les deux espèces en ont une).
 */
function waterReasons(a: VerdictProfile, b: VerdictProfile): VerdictReason[] {
  if (a.salinity !== b.salinity) {
    return [waterReason('salinite', 'incompatible', APPROXIMATION)];
  }
  const thermal = [a.thermal, b.thermal];
  if (thermal.includes('froide') && thermal.includes('tropicale')) {
    return [waterReason('classe-thermique', 'incompatible', APPROXIMATION)];
  }
  const reasons = [
    rangeReason('temperature', a.temperature, b.temperature),
    rangeReason('ph', a.ph, b.ph),
  ];
  if (
    a.hardness &&
    b.hardness &&
    a.hardness.preferred.value.kind === b.hardness.preferred.value.kind
  ) {
    reasons.push(rangeReason('durete', a.hardness, b.hardness));
  }
  return reasons.filter((reason): reason is VerdictReason => reason !== null);
}

function reason(
  axis: Exclude<VerdictAxis, 'eau'>,
  cause: VerdictCause,
  level: VerdictReason['level'],
  actor: SpeciesId | null,
  status: FieldStatus,
): VerdictReason {
  return Object.freeze({ axis, cause, level, actor, status });
}

/**
 * Prédation de `eater` sur `prey` : liste nominative de l'écologie d'abord (adultes mangés :
 * `incompatible` ; jeunes seulement : `precautions`) ; à défaut, règle de taille pour les
 * prédateurs du jeu, non herbivores, dont la proie adulte mesure moins de
 * `PREDATION_SIZE_FRACTION` de leur taille (approximation de jeu).
 */
function predationReason(eater: VerdictProfile, prey: VerdictProfile): VerdictReason | null {
  const listed = eater.prey.value.find((entry) => entry.species === prey.species);
  if (listed) {
    const adult = listed.stage === 'adult';
    return reason(
      'predation',
      adult ? 'mange-adultes' : 'mange-jeunes',
      adult ? 'incompatible' : 'precautions',
      eater.species,
      eater.prey.status,
    );
  }
  const bySize =
    eater.predator &&
    eater.diet !== 'herbivore' &&
    prey.adultSize < PREDATION_SIZE_FRACTION * eater.adultSize;
  return bySize
    ? reason('predation', 'taille', 'incompatible', eater.species, APPROXIMATION)
    : null;
}

/** Raisons de comportement où `actor` gêne `other` (règles orientées). */
function orientedBehaviorReasons(actor: VerdictProfile, other: VerdictProfile): VerdictReason[] {
  const reasons: VerdictReason[] = [];
  if (actor.finNipper.value && other.longFins.value) {
    const status = combinedStatus(actor.finNipper.status, other.longFins.status);
    reasons.push(reason('comportement', 'nageoires', 'incompatible', actor.species, status));
  }
  if (actor.fastSwimmer.value && other.slowSwimmer.value) {
    const status = combinedStatus(actor.fastSwimmer.status, other.slowSwimmer.status);
    reasons.push(reason('comportement', 'vitesse', 'precautions', actor.species, status));
  }
  if (actor.livesWithoutFish.value && !other.amphibian) {
    reasons.push(
      reason(
        'comportement',
        'sans-poissons',
        'incompatible',
        actor.species,
        actor.livesWithoutFish.status,
      ),
    );
  }
  return reasons;
}

/** Ordre des niveaux, du meilleur au pire. */
const LEVEL_RANK: Readonly<Record<VerdictLevel, number>> = {
  compatible: 0,
  precautions: 1,
  incompatible: 2,
};

/**
 * Verdict de deux profils, symétrique au niveau près (les raisons orientées sont données de
 * `a` vers `b` puis de `b` vers `a`). Même espèce : `compatible`, sans raison (la cohabitation
 * entre congénères n'est pas de ce verdict). Territoriaux : deux espèces territoriales
 * différentes, `precautions`.
 */
export function profileVerdict(a: VerdictProfile, b: VerdictProfile): Verdict {
  if (a.species === b.species) {
    return Object.freeze({ level: 'compatible', reasons: Object.freeze([]) });
  }
  const reasons = waterReasons(a, b);
  for (const [eater, prey] of [
    [a, b],
    [b, a],
  ] as const) {
    const predation = predationReason(eater, prey);
    if (predation) {
      reasons.push(predation);
    }
  }
  if (a.territorial.value && b.territorial.value) {
    const status = combinedStatus(a.territorial.status, b.territorial.status);
    reasons.push(reason('comportement', 'territoriaux', 'precautions', null, status));
  }
  reasons.push(...orientedBehaviorReasons(a, b), ...orientedBehaviorReasons(b, a));
  let level: VerdictLevel = 'compatible';
  for (const { level: own } of reasons) {
    level = LEVEL_RANK[own] > LEVEL_RANK[level] ? own : level;
  }
  return Object.freeze({ level, reasons: Object.freeze(reasons) });
}

/**
 * Profils des espèces du jeu, calculés une fois. Assertions : les clés de `SPECIES` sont les
 * `SpeciesId`, et `Object.fromEntries` perd le type des clés (même motif que `RIVALS`).
 */
const PROFILES: Readonly<Record<SpeciesId, VerdictProfile>> = Object.fromEntries(
  (Object.keys(SPECIES) as SpeciesId[]).map((id) => [id, verdictProfile(id)]),
) as unknown as Record<SpeciesId, VerdictProfile>;

/**
 * Verdict de deux espèces du jeu (`profileVerdict` de leurs profils).
 *
 * @throws RangeError si l'une des deux n'est pas une espèce du jeu.
 */
export function verdict(a: SpeciesId, b: SpeciesId): Verdict {
  for (const id of [a, b]) {
    if (!Object.hasOwn(PROFILES, id)) {
      throw new RangeError(`Espèce inconnue pour le verdict : « ${String(id)} »`);
    }
  }
  return profileVerdict(PROFILES[a], PROFILES[b]);
}
