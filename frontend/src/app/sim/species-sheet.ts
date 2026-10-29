import { compatibility, TEMPERAMENTS, type Temperament } from './compatibility';
import { SPECIES_LABELS, type SpeciesLabels } from './species-catalog';
import { confidenceText, legalStatus, legalText, type LegalStatus } from './species-legal';
import { SPECIES, type SpeciesId } from './species';
import { SPECIES_PH, type PhRange } from './water-ph';

/**
 * Fiches d'espèces (issue #237, ADR 0058) : ce dont chaque espèce a besoin, lisible avant de
 * l'ajouter, et avertissements d'ajout (volume, groupe, voisins incompatibles).
 *
 * Données pures, sans rendu ni hasard. **Règle de sourçage** : chaque champ porte un statut,
 * `source` (avec une référence non vide, consultable) ou `approximation de jeu` (valeur choisie
 * pour le jeu, sans source consultable pendant le cycle). Aucune valeur n'est présentée comme
 * sourcée sans référence. Les champs déjà portés par la simulation (pH, tempérament, espèces à
 * éviter) ne sont pas recopiés : la fiche lit `SPECIES_PH`, `TEMPERAMENTS` et `compatibility`.
 */

/** Statut d'un champ de fiche. */
export type FieldStatus =
  { readonly kind: 'source'; readonly reference: string } | { readonly kind: 'approximation' };

/** Valeur d'une fiche et son statut. */
export interface SheetField<T> {
  readonly value: T;
  readonly status: FieldStatus;
}

/** Plage de valeurs, bornes comprises. */
export interface ValueRange {
  readonly min: number;
  readonly max: number;
}

/** Régime alimentaire. */
export type Diet = 'omnivore' | 'carnivore' | 'herbivore';

/** Fiche d'une espèce. */
export interface SpeciesSheet {
  readonly species: SpeciesId;
  /** Taille adulte, en cm. */
  readonly adultSize: SheetField<number>;
  /** Température préférée, en °C (comprise dans la tolérée). */
  readonly temperaturePreferred: SheetField<ValueRange>;
  /** Température tolérée, en °C. */
  readonly temperatureTolerated: SheetField<ValueRange>;
  /** pH préféré : la plage idéale de la simulation (`SPECIES_PH`). */
  readonly phPreferred: SheetField<PhRange>;
  /** pH toléré : la plage tolérée de la simulation (`SPECIES_PH`). */
  readonly phTolerated: SheetField<PhRange>;
  readonly diet: SheetField<Diet>;
  /** Caractère envers les autres espèces (`TEMPERAMENTS`). */
  readonly temperament: SheetField<Temperament>;
  /** Taille de groupe minimale conseillée (1 : peut vivre seul). */
  readonly minGroup: SheetField<number>;
  /** Volume d'eau conseillé, en litres. */
  readonly minLiters: SheetField<number>;
  /** Espèces à éviter (`compatibility`), dans l'ordre de `SPECIES`. */
  readonly avoid: SheetField<readonly SpeciesId[]>;
  /** Statut légal en France (`sim/species-legal.ts`, #269, ADR 0062). */
  readonly legal: SheetField<LegalStatus>;
  /** Mises en garde affichées en tête de fiche (#269), sourcées ou non vérifiées. */
  readonly notes: readonly SheetNote[];
}

/** Mise en garde d'une fiche : texte et statut. */
export interface SheetNote {
  readonly text: string;
  readonly status: FieldStatus;
}

const APPROXIMATION: FieldStatus = Object.freeze({ kind: 'approximation' });

function source(reference: string): FieldStatus {
  return Object.freeze({ kind: 'source', reference });
}

function approx<T>(value: T): SheetField<T> {
  return Object.freeze({ value, status: APPROXIMATION });
}

function sourced<T>(value: T, reference: string): SheetField<T> {
  return Object.freeze({ value, status: source(reference) });
}

function range(min: number, max: number): ValueRange {
  return Object.freeze({ min, max });
}

/** Références de `docs/SOINS.md` § 11 (paramètres cibles par espèce, bibliographie du document). */
const SOINS = 'docs/SOINS.md § 11';

/** Données propres aux fiches (le reste vient de la simulation). */
interface SheetData {
  readonly adultSize: SheetField<number>;
  readonly temperaturePreferred: SheetField<ValueRange>;
  readonly temperatureTolerated: SheetField<ValueRange>;
  readonly diet: SheetField<Diet>;
  readonly minGroup: SheetField<number>;
  readonly minLiters: SheetField<number>;
  readonly notes?: readonly SheetNote[];
}

/** Références de `docs/ESPECES.md` (recherche documentaire du 2026-10-27, #262). */
const ESPECES = 'docs/ESPECES.md';

/** Fiche de soins secondaire du sonneur oriental (consultée le 2026-10-27, #270). */
const ANAPSID = 'https://anapsid.org/bombina.html (secondaire)';

/** Fiches Seriously Fish consultées le 2026-10-28 (#238, ADR 0070), suivies du nom de page. */
const SF = 'https://www.seriouslyfish.com/species/';

function note(text: string, status: FieldStatus): SheetNote {
  return Object.freeze({ text, status });
}

/**
 * Données des fiches ; le type impose une entrée pour toute nouvelle espèce. Les plages de
 * température citées par `docs/SOINS.md` § 11 y sont reprises avec la source que ce document
 * indique ; tout le reste (tailles, régimes, groupes, volumes, plages préférées) est une
 * approximation de jeu. Volumes calibrés pour que la population par défaut de chaque
 * environnement ne déclenche aucun avertissement de volume ni de groupe (testé).
 */
const SHEET_DATA: Readonly<Record<SpeciesId, SheetData>> = {
  neon: {
    adultSize: approx(4),
    temperaturePreferred: approx(range(22, 25)),
    temperatureTolerated: sourced(range(20, 26), `${SOINS} (FishBase)`),
    diet: approx('omnivore'),
    minGroup: approx(6),
    minLiters: approx(60),
  },
  guppy: {
    adultSize: approx(5),
    temperaturePreferred: approx(range(23, 27)),
    temperatureTolerated: sourced(range(18, 28), `${SOINS} (FishBase ; Seriously Fish : 17–28 °C)`),
    diet: approx('omnivore'),
    minGroup: approx(3),
    minLiters: approx(60),
  },
  corydora: {
    adultSize: approx(7),
    temperaturePreferred: approx(range(22, 24)),
    temperatureTolerated: sourced(
      range(22, 26),
      `${SOINS} (Seriously Fish ; d'autres sources : 18–24 °C, désaccord)`,
    ),
    diet: approx('omnivore'),
    minGroup: approx(6),
    minLiters: approx(100),
  },
  koi: {
    adultSize: approx(60),
    // Non vérifié (#269) : docs/ESPECES.md prévaut sur docs/SOINS.md tant que FishBase et une
    // source vétérinaire n'ont pas été consultées.
    temperaturePreferred: approx(range(18, 25)),
    temperatureTolerated: approx(range(4, 30)),
    diet: approx('omnivore'),
    minGroup: approx(3),
    minLiters: approx(800),
    notes: [
      note(
        'Fiche non vérifiée : aucun paramètre chiffré confirmé (FishBase et source vétérinaire à consulter)',
        source(`${ESPECES} (koï)`),
      ),
    ],
  },
  axolotl: {
    adultSize: approx(25),
    temperaturePreferred: sourced(range(16, 18), `${SOINS} (WSAVA/VIN ; PMC10948202)`),
    temperatureTolerated: approx(range(14, 22)),
    diet: approx('carnivore'),
    minGroup: approx(1),
    minLiters: approx(75),
  },
  // Sonneur oriental (#270, ADR 0064) : source secondaire unique, consultée au cycle 86.
  grenouille: {
    adultSize: sourced(6, `${ANAPSID} (taille adulte)`),
    temperaturePreferred: sourced(range(20, 24), `${ANAPSID} (température du terrarium)`),
    temperatureTolerated: approx(range(18, 26)),
    diet: sourced('carnivore', `${ANAPSID} (insectes, vers, petites proies)`),
    minGroup: approx(1),
    minLiters: approx(40),
    notes: [
      note(
        'Semi-aquatique : un quart de berge sèche environ, eau peu profonde (une dizaine de cm)',
        source(`${ANAPSID} (milieu semi-aquatique)`),
      ),
      note(
        'Espèce choisie faute d’anoure vérifié dans la documentation du projet : paramètres à recouper',
        source('ADR 0064'),
      ),
    ],
  },
  // Triton à ventre de feu chinois (#270, ADR 0064).
  triton: {
    adultSize: sourced(10, `${ESPECES} (Caudata Culture : 6 à 10,3 cm)`),
    temperaturePreferred: sourced(range(14, 20), `${ESPECES} (Caudata Culture)`),
    temperatureTolerated: approx(range(12, 23)),
    diet: sourced('carnivore', `${ESPECES} (Caudata Culture : vers, insectes, crustacés)`),
    minGroup: approx(1),
    minLiters: approx(40),
    notes: [
      note(
        'Sans poissons ; éviter au-dessus de 23 °C ; préférer les sujets nés en captivité',
        source(`${ESPECES} (Caudata Culture)`),
      ),
    ],
  },
  clown: {
    adultSize: approx(9),
    temperaturePreferred: approx(range(25, 27)),
    temperatureTolerated: sourced(range(24, 28), `${SOINS} (TFH Magazine)`),
    diet: approx('omnivore'),
    minGroup: approx(1),
    minLiters: approx(100),
    notes: [
      note(
        'Vit très bien sans anémone ; les anémones hôtes sont déconseillées au débutant',
        source(`${ESPECES} (Saltcorner, FishLore : sources secondaires)`),
      ),
    ],
  },
  chirurgien: {
    adultSize: sourced(31, 'FishBase, Paracanthurus hepatus (longueur totale)'),
    temperaturePreferred: approx(range(25, 27)),
    temperatureTolerated: sourced(
      range(24, 28),
      `${SOINS} (Holmes-Farley, paramètres de récif généraux)`,
    ),
    diet: approx('omnivore'),
    minGroup: approx(1),
    minLiters: sourced(
      300,
      `${ESPECES} (OATA via un revendeur, secondaire ; 700 L selon ReefApp, désaccord)`,
    ),
    notes: [
      note(
        'Pas pour débutant : 31 cm adulte, 300 L au moins, sujets surtout prélevés dans la nature',
        source(`${ESPECES} (FishBase ; UF/IFAS FA224 ; npj Ocean Sustainability 2023)`),
      ),
    ],
  },
  // Lot 1 d'eau douce (#238, ADR 0070) : tailles en longueur standard (SL), volumes tirés des
  // dimensions de bac minimales de Seriously Fish (base × 30 cm d'eau environ).
  rasbora: {
    adultSize: sourced(4.5, `${SF}trigonostigma-heteromorpha (SL en bac ; 3,2 cm en nature)`),
    temperaturePreferred: approx(range(23, 26)),
    temperatureTolerated: sourced(
      range(21, 28),
      `${SF}trigonostigma-heteromorpha (FishBase 10881 : 22–25 °C, désaccord)`,
    ),
    diet: approx('omnivore'),
    minGroup: sourced(8, `${SF}trigonostigma-heteromorpha (8 à 10 au moins)`),
    minLiters: sourced(54, `${SF}trigonostigma-heteromorpha (base 60 × 30 cm)`),
  },
  tetra: {
    adultSize: sourced(4, `${SF}hyphessobrycon-pulchripinnis (SL)`),
    temperaturePreferred: approx(range(22, 26)),
    temperatureTolerated: sourced(range(20, 28), `${SF}hyphessobrycon-pulchripinnis`),
    diet: sourced('omnivore', `${SF}hyphessobrycon-pulchripinnis (« probablement omnivore »)`),
    minGroup: sourced(8, `${SF}hyphessobrycon-pulchripinnis (8 à 10 au moins)`),
    // Base 80 × 30 cm citée ; le volume en litres est une estimation.
    minLiters: approx(85),
  },
  kuhli: {
    adultSize: sourced(10, `${SF}pangio-kuhlii (SL)`),
    temperaturePreferred: approx(range(23, 25)),
    temperatureTolerated: sourced(range(21, 26), `${SF}pangio-kuhlii`),
    diet: sourced('carnivore', `${SF}pangio-kuhlii (micro-prédateur)`),
    minGroup: sourced(5, `${SF}pangio-kuhlii (5 ou 6 au moins)`),
    minLiters: sourced(54, `${SF}pangio-kuhlii (base 60 × 30 cm)`),
    notes: [
      note(
        'Se cache dans le sable et les racines : sol fin et cachettes indispensables',
        APPROXIMATION,
      ),
    ],
  },
  gourami: {
    adultSize: sourced(8.8, `${SF}trichogaster-lalius (SL ; FishBase 4774 : 9,5 cm TL)`),
    temperaturePreferred: approx(range(24, 27)),
    temperatureTolerated: sourced(
      range(22, 27),
      `${SF}trichogaster-lalius (FishBase 4774 : 25–28 °C, désaccord)`,
    ),
    diet: sourced('omnivore', `${SF}trichogaster-lalius`),
    minGroup: sourced(2, `${SF}trichogaster-lalius (un couple)`),
    minLiters: sourced(56, `${SF}trichogaster-lalius (pour un couple)`),
    notes: [
      note(
        'Un couple plutôt qu’un groupe ; mâle parfois agressif envers les autres poissons à labyrinthe',
        source(`${SF}trichogaster-lalius`),
      ),
    ],
  },
};

const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];

const SHEETS: Readonly<Record<SpeciesId, SpeciesSheet>> = Object.fromEntries(
  SPECIES_IDS.map((id) => {
    const { notes, ...data } = SHEET_DATA[id];
    const legal = legalStatus(id);
    const sheet: SpeciesSheet = Object.freeze({
      species: id,
      ...data,
      notes: Object.freeze([...(notes ?? [])]),
      legal: sourced(legal, legal.reference),
      // Source unique : les plages de la simulation (ADR 0057), approximations de jeu.
      phPreferred: approx(SPECIES_PH[id].ideal),
      phTolerated: approx(SPECIES_PH[id].tolerated),
      // Tempérament et voisins à éviter (ADR 0055), approximations de jeu.
      temperament: approx(TEMPERAMENTS[id]),
      avoid: approx(
        Object.freeze(SPECIES_IDS.filter((other) => compatibility(id, other) !== 'compatible')),
      ),
    });
    return [id, sheet];
  }),
) as unknown as Record<SpeciesId, SpeciesSheet>;

/** Fiche de l'espèce `id` (figée, partagée). */
export function speciesSheet(id: SpeciesId): SpeciesSheet {
  return SHEETS[id];
}

/** Champs d'une fiche, dans l'ordre d'affichage. */
export const SHEET_FIELDS = [
  'adultSize',
  'temperaturePreferred',
  'temperatureTolerated',
  'phPreferred',
  'phTolerated',
  'diet',
  'temperament',
  'minGroup',
  'minLiters',
  'avoid',
  'legal',
] as const satisfies readonly (keyof SpeciesSheet)[];

export type SheetFieldName = (typeof SHEET_FIELDS)[number];

/** Intitulé de chaque champ. */
export const SHEET_FIELD_LABELS: Readonly<Record<SheetFieldName, string>> = {
  adultSize: 'Taille adulte',
  temperaturePreferred: 'Température préférée',
  temperatureTolerated: 'Température tolérée',
  phPreferred: 'pH préféré',
  phTolerated: 'pH toléré',
  diet: 'Régime',
  temperament: 'Caractère',
  minGroup: 'Groupe minimal',
  minLiters: 'Volume conseillé',
  avoid: 'À éviter avec',
  legal: 'Statut légal en France',
};

const DIET_LABELS: Readonly<Record<Diet, string>> = {
  omnivore: 'omnivore',
  carnivore: 'carnivore',
  herbivore: 'herbivore',
};

const TEMPERAMENT_LABELS: Readonly<Record<Temperament, string>> = {
  paisible: 'paisible',
  territorial: 'territorial',
  predateur: 'prédateur des plus petits',
};

/** Nombre écrit à la française (virgule décimale), sans zéro inutile. */
export function frenchNumber(value: number): string {
  return String(value).replace('.', ',');
}

/** Plage écrite à la française : « 6,8 – 7,2 », ou une seule valeur si les bornes sont égales. */
function frenchRange({ min, max }: ValueRange, unit = ''): string {
  const text = min === max ? frenchNumber(min) : `${frenchNumber(min)} – ${frenchNumber(max)}`;
  return unit === '' ? text : `${text} ${unit}`;
}

/** Documentation du projet, telle que nommée à l'écran. */
export const PROJECT_DOCUMENTATION = 'documentation du projet';

/** Chemin d'un document du dépôt (`docs/SOINS.md`), suivi de ses paragraphes éventuels. */
const REPOSITORY_DOCUMENT = /docs\/[A-Za-z0-9_-]+\.md(?:\s*§\s*[\d.]+(?:\s*et\s*§\s*[\d.]+)*)?/g;

/**
 * Référence telle qu'affichée au joueur (#302) : les chemins de documents du dépôt
 * (`docs/SOINS.md § 2 et § 14`) deviennent « documentation du projet » ; la publication
 * citée entre parenthèses est gardée. La référence complète reste dans les données, pour la
 * traçabilité et les tests.
 */
export function publicReference(reference: string): string {
  return reference
    .replace(/\(via docs\//g, '(via la docs/')
    .replace(REPOSITORY_DOCUMENT, PROJECT_DOCUMENTATION);
}

/** Texte du statut d'un champ, affiché en petit sous la valeur. */
export function statusText(status: FieldStatus): string {
  return status.kind === 'source'
    ? `Source : ${publicReference(status.reference)}`
    : 'Approximation de jeu';
}

/** Ligne affichée d'une fiche. */
export interface SheetRow {
  readonly field: SheetFieldName;
  readonly label: string;
  readonly value: string;
  readonly status: string;
}

function fieldValue(sheet: SpeciesSheet, field: SheetFieldName): string {
  switch (field) {
    case 'adultSize':
      return `${frenchNumber(sheet.adultSize.value)} cm`;
    case 'temperaturePreferred':
      return frenchRange(sheet.temperaturePreferred.value, '°C');
    case 'temperatureTolerated':
      return frenchRange(sheet.temperatureTolerated.value, '°C');
    case 'phPreferred':
      return frenchRange(sheet.phPreferred.value);
    case 'phTolerated':
      return frenchRange(sheet.phTolerated.value);
    case 'diet':
      return DIET_LABELS[sheet.diet.value];
    case 'temperament':
      return TEMPERAMENT_LABELS[sheet.temperament.value];
    case 'minGroup':
      return sheet.minGroup.value <= 1 ? 'peut vivre seul' : `${sheet.minGroup.value} individus`;
    case 'minLiters':
      return `${frenchNumber(sheet.minLiters.value)} L`;
    case 'avoid':
      return sheet.avoid.value.length === 0
        ? 'aucune espèce du jeu'
        : sheet.avoid.value.map((id) => SPECIES_LABELS[id].plural).join(', ');
    case 'legal':
      return legalText(sheet.legal.value);
  }
}

/** Lignes affichées de la fiche de `id`, dans l'ordre de `SHEET_FIELDS`. */
export function sheetRows(id: SpeciesId): readonly SheetRow[] {
  const sheet = SHEETS[id];
  return SHEET_FIELDS.map((field) => ({
    field,
    label: SHEET_FIELD_LABELS[field],
    value: fieldValue(sheet, field),
    status:
      field === 'legal'
        ? `${statusText(sheet.legal.status)} ; ${confidenceText(sheet.legal.value.confidence)}`
        : statusText(sheet[field].status),
  }));
}

/** Mises en garde affichées de la fiche de `id` (#269), avec le texte de leur statut. */
export function sheetNotes(id: SpeciesId): readonly { text: string; status: string }[] {
  return SHEETS[id].notes.map((entry) => ({ text: entry.text, status: statusText(entry.status) }));
}

/** Avertissement à l'ajout d'une espèce dans le bac courant. */
export type AddWarning =
  | {
      readonly kind: 'volume';
      readonly species: SpeciesId;
      readonly liters: number;
      readonly minLiters: number;
    }
  | {
      readonly kind: 'groupe';
      readonly species: SpeciesId;
      readonly count: number;
      readonly minGroup: number;
    }
  | {
      readonly kind: 'incompatible';
      readonly species: SpeciesId;
      readonly other: SpeciesId;
      readonly reason: 'predateur' | 'territorial';
    };

function known(id: string): id is SpeciesId {
  return Object.hasOwn(SPECIES, id);
}

/**
 * Avertissements à l'ajout de l'espèce `species`, dont l'effectif devient `count`, dans un bac
 * de `liters` litres peuplé de `counts` (effectifs après l'ajout, espèce ajoutée comprise) :
 *
 * - `volume` si `liters` est strictement inférieur au volume conseillé (volume exact : rien) ;
 *   rien si `liters` n'est pas un réel strictement positif (volume inconnu) ;
 * - `groupe` si `count` est strictement inférieur au groupe minimal ;
 * - `incompatible` pour chaque autre espèce présente (effectif fini strictement positif), dans
 *   l'ordre de `order` (doublons et espèces inconnues ignorés), déconseillée avec `species`.
 *
 * Aucun avertissement si `count` n'est pas un nombre fini strictement positif (rien d'ajouté).
 */
export function addWarnings(
  species: SpeciesId,
  count: number,
  liters: number,
  counts: Readonly<Partial<Record<string, number>>>,
  order: readonly string[],
): AddWarning[] {
  if (!(count > 0) || !Number.isFinite(count)) {
    return [];
  }
  const sheet = SHEETS[species];
  const warnings: AddWarning[] = [];
  const minLiters = sheet.minLiters.value;
  if (liters > 0 && Number.isFinite(liters) && liters < minLiters) {
    warnings.push({ kind: 'volume', species, liters, minLiters });
  }
  const minGroup = sheet.minGroup.value;
  if (count < minGroup) {
    warnings.push({ kind: 'groupe', species, count, minGroup });
  }
  const seen = new Set<string>();
  for (const other of order) {
    if (other === species || seen.has(other) || !known(other)) {
      continue;
    }
    seen.add(other);
    const n = Object.hasOwn(counts, other) ? counts[other] : undefined;
    if (n === undefined || !(n > 0) || !Number.isFinite(n)) {
      continue;
    }
    const verdict = compatibility(species, other);
    if (verdict !== 'compatible') {
      warnings.push({ kind: 'incompatible', species, other, reason: verdict });
    }
  }
  return warnings;
}

/** Texte affiché d'un avertissement d'ajout (libellés du catalogue, `SPECIES_LABELS`). */
export function addWarningText(warning: AddWarning): string {
  return addWarningTextWith(warning, SPECIES_LABELS);
}

/**
 * `addWarningText` avec des libellés donnés : les tests y exercent les accords sur des libellés
 * de leur choix (#284 ; la loche kuhli, #238, porte le féminin au catalogue).
 */
export function addWarningTextWith(
  warning: AddWarning,
  labels: Readonly<Record<SpeciesId, SpeciesLabels>>,
): string {
  const { singular, plural, feminine } = labels[warning.species];
  switch (warning.kind) {
    case 'volume':
      return `Bac trop petit pour des ${plural} : ${Math.round(warning.liters)} L, ${warning.minLiters} L conseillés`;
    case 'groupe':
      return `Groupe trop petit : ${warning.count} ${warning.count === 1 ? singular : plural}, ${warning.minGroup} au moins conseillé${feminine ? 'e' : ''}s`;
    case 'incompatible':
      return `${capitalize(plural)} déconseillé${feminine ? 'e' : ''}s avec les ${labels[warning.other].plural} (${
        warning.reason === 'predateur' ? 'prédateur' : 'deux espèces territoriales'
      })`;
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
