import { compatibility, TEMPERAMENTS, type Compatibility, type Temperament } from './compatibility';
import { ENVIRONMENTS } from './environment';
import { SPECIES_LABELS } from './species-catalog';
import {
  frenchNumber,
  speciesSheet,
  statusText,
  type FieldStatus,
  type SheetField,
  type ValueRange,
} from './species-sheet';
import { SPECIES, type SpeciesId } from './species';

/**
 * Soins d'une espèce pour le wiki, lot 2/2 (issue #291, ADR 0068) : alimentation,
 * cohabitation avec ses raisons et comparaison des besoins avec l'eau du bac courant.
 *
 * Pur, sans état ni hasard. Même règle de sourçage que les fiches (ADR 0058) : chaque valeur
 * propre à ce module porte une référence consultable ou le statut « approximation de jeu ».
 * La cohabitation et les plages comparées ne sont pas recopiées : elles viennent de
 * `compatibility` (ADR 0055) et de `speciesSheet`.
 */

const APPROXIMATION: FieldStatus = Object.freeze({ kind: 'approximation' });

function approx<T>(value: T): SheetField<T> {
  return Object.freeze({ value, status: APPROXIMATION });
}

function sourced<T>(value: T, reference: string): SheetField<T> {
  return Object.freeze({ value, status: Object.freeze({ kind: 'source', reference }) });
}

const ESPECES = 'docs/ESPECES.md';
const ANAPSID = 'https://anapsid.org/bombina.html (secondaire)';

/** Alimentation d'une espèce (textes affichés). */
export interface FeedingGuide {
  /** Type de nourriture. */
  readonly foods: SheetField<string>;
  /** Fréquence des repas. */
  readonly frequency: SheetField<string>;
  /** Quantité prudente par repas. */
  readonly quantity: SheetField<string>;
}

/** Fréquence et quantité : conseils prudents d'usage, non sourcés pendant le cycle 91. */
const FISH_FREQUENCY = approx('une à deux fois par jour, un jour de jeûne par semaine possible');
const AMPHIBIAN_FREQUENCY = approx('deux à trois fois par semaine pour un adulte');
const PRUDENT_QUANTITY = approx(
  'ce qui est mangé en deux minutes environ ; retirer les restes, qui polluent l’eau',
);

/**
 * Alimentation de chaque espèce ; le type impose une entrée pour toute nouvelle espèce. Les
 * types de nourriture viennent de `docs/ESPECES.md` quand il les cite ; sinon, le régime de
 * la fiche est repris avec la mention « aliments précis non vérifiés ».
 */
const FEEDING: Readonly<Record<SpeciesId, FeedingGuide>> = {
  neon: {
    foods: sourced('micro-prédateur omnivore ; aliments précis non vérifiés', `${ESPECES} (néon)`),
    frequency: FISH_FREQUENCY,
    quantity: PRUDENT_QUANTITY,
  },
  guppy: {
    foods: sourced(
      'omnivore ; dans la nature, surtout des débris d’algues ; mange aussi œufs et alevins',
      `${ESPECES} (guppy, synthèse citant Magurran 2005)`,
    ),
    frequency: FISH_FREQUENCY,
    quantity: PRUDENT_QUANTITY,
  },
  corydora: {
    foods: sourced(
      'aliment sec coulant de qualité et petites proies vivantes ou congelées ; ce n’est pas un « nettoyeur » : il doit recevoir sa propre nourriture',
      `${ESPECES} (corydoras)`,
    ),
    frequency: FISH_FREQUENCY,
    quantity: PRUDENT_QUANTITY,
  },
  koi: {
    foods: approx('omnivore ; aliments précis non vérifiés (FishBase à consulter)'),
    frequency: approx('selon la température de l’eau : moins souvent quand elle est froide'),
    quantity: PRUDENT_QUANTITY,
  },
  axolotl: {
    foods: sourced('carnivore ; aliments précis non vérifiés', `${ESPECES} (axolotl)`),
    frequency: AMPHIBIAN_FREQUENCY,
    quantity: PRUDENT_QUANTITY,
  },
  grenouille: {
    foods: sourced('insectes, vers, petites proies', `${ANAPSID} (alimentation)`),
    frequency: AMPHIBIAN_FREQUENCY,
    quantity: PRUDENT_QUANTITY,
  },
  triton: {
    foods: sourced('vers, insectes, crustacés', `${ESPECES} (Caudata Culture)`),
    frequency: AMPHIBIAN_FREQUENCY,
    quantity: PRUDENT_QUANTITY,
  },
  clown: {
    foods: approx('omnivore ; aliments précis non vérifiés'),
    frequency: FISH_FREQUENCY,
    quantity: PRUDENT_QUANTITY,
  },
  chirurgien: {
    foods: sourced('zooplancton et algues', `${ESPECES} (FishBase)`),
    frequency: FISH_FREQUENCY,
    quantity: PRUDENT_QUANTITY,
  },
};

/** Ligne affichée d'une section du wiki : intitulé, valeur, texte du statut. */
export interface CareRow {
  readonly field: string;
  readonly label: string;
  readonly value: string;
  readonly status: string;
}

/**
 * Zone où l'espèce mange dans la simulation (`SpeciesDefinition.feeding`), en tiers de la
 * hauteur d'eau : fond sous 1/3, surface au-delà de 2/3, pleine eau entre les deux.
 */
export function feedingZone(minHeightRatio: number, maxHeightRatio: number): string {
  const parts: string[] = [];
  if (minHeightRatio < 1 / 3) {
    parts.push('fond');
  }
  if (minHeightRatio < 2 / 3 && maxHeightRatio > 1 / 3) {
    parts.push('pleine eau');
  }
  if (maxHeightRatio > 2 / 3) {
    parts.push('surface');
  }
  return parts.length === 3 ? 'toute la hauteur d’eau' : parts.join(' et ');
}

/** Lignes « Alimentation » de la fiche de `id`. */
export function feedingRows(id: SpeciesId): readonly CareRow[] {
  const guide = FEEDING[id];
  const { minHeightRatio, maxHeightRatio } = SPECIES[id].feeding;
  return Object.freeze([
    row('foods', 'Nourriture', guide.foods),
    row('frequency', 'Fréquence', guide.frequency),
    row('quantity', 'Quantité prudente', guide.quantity),
    row('zone', 'Où elle mange dans le jeu', approx(feedingZone(minHeightRatio, maxHeightRatio))),
  ]);
}

function row(field: string, label: string, value: SheetField<string>): CareRow {
  return Object.freeze({ field, label, value: value.value, status: statusText(value.status) });
}

/** Cohabitation avec une autre espèce. */
export interface CohabitationEntry {
  readonly other: SpeciesId;
  /** Verdict de `compatibility` (ADR 0055), jamais recalculé ici. */
  readonly verdict: Compatibility;
  /** Vrai si un environnement du jeu accueille les deux espèces. */
  readonly sameEnvironment: boolean;
  /** Raison lisible du verdict. */
  readonly reason: string;
}

const TEMPERAMENT_WORDS: Readonly<Record<Temperament, string>> = {
  paisible: 'paisible',
  territorial: 'territorial',
  predateur: 'prédateur',
};

function sharesEnvironment(a: SpeciesId, b: SpeciesId): boolean {
  return Object.values(ENVIRONMENTS).some(
    (env) => env.species.includes(a) && env.species.includes(b),
  );
}

/**
 * Raison du verdict `verdict` entre `id` et `other` (règles de `compatibility`). Exportée pour
 * les tests : aucun couple du catalogue n'est « territorial » aujourd'hui.
 */
export function cohabitationReason(
  id: SpeciesId,
  other: SpeciesId,
  verdict: Compatibility,
): string {
  switch (verdict) {
    case 'predateur': {
      const idEats =
        TEMPERAMENTS[id] === 'predateur' && SPECIES[other].bodyLength < SPECIES[id].bodyLength;
      const [big, small] = idEats ? [id, other] : [other, id];
      const smallLabels = SPECIES_LABELS[small];
      return `les ${SPECIES_LABELS[big].plural} mangent ou blessent les ${smallLabels.plural}, plus petit${smallLabels.feminine ? 'e' : ''}s`;
    }
    case 'territorial':
      return 'deux espèces territoriales : elles se disputent l’espace';
    case 'compatible':
      return `aucun conflit de caractère (${TEMPERAMENT_WORDS[TEMPERAMENTS[id]]} et ${TEMPERAMENT_WORDS[TEMPERAMENTS[other]]})`;
  }
}

/**
 * Cohabitation de `id` avec chaque autre espèce du jeu, dans l'ordre de `SPECIES` : verdict
 * de `compatibility`, environnement commun, raison. Statut : approximation de jeu (ADR 0055).
 */
export function cohabitation(id: SpeciesId): readonly CohabitationEntry[] {
  return Object.freeze(
    (Object.keys(SPECIES) as SpeciesId[])
      .filter((other) => other !== id)
      .map((other) => {
        const verdict = compatibility(id, other);
        return Object.freeze({
          other,
          verdict,
          sameEnvironment: sharesEnvironment(id, other),
          reason: cohabitationReason(id, other, verdict),
        });
      }),
  );
}

/** Statut des raisons de cohabitation (règles de jeu de l'ADR 0055). */
export const COHABITATION_STATUS = statusText(APPROXIMATION);

/** Place d'une valeur du bac face aux plages d'une espèce. */
export type TankFit = 'dans-la-plage' | 'limite' | 'hors-plage';

export const TANK_FIT_LABELS: Readonly<Record<TankFit, string>> = {
  'dans-la-plage': 'dans la plage',
  limite: 'limite',
  'hors-plage': 'hors plage',
};

/**
 * Place de `value` face aux plages `preferred` ⊂ `tolerated`, bornes comprises (ADR 0068) :
 * « dans la plage » dans la plage préférée, « limite » dans la plage tolérée seulement (la
 * marge est l'écart entre les deux plages), « hors plage » au-delà. Une valeur non finie
 * (relevé inconnu) est « hors plage ».
 */
export function tankFit(value: number, preferred: ValueRange, tolerated: ValueRange): TankFit {
  if (value >= preferred.min && value <= preferred.max) {
    return 'dans-la-plage';
  }
  return value >= tolerated.min && value <= tolerated.max ? 'limite' : 'hors-plage';
}

/** Ligne de la comparaison avec le bac. */
export interface TankComparisonRow {
  readonly parameter: 'temperature' | 'ph';
  readonly label: string;
  /** Valeur du bac, arrondie au dixième (« inconnue » si non finie). */
  readonly tank: string;
  /** Plage préférée de l'espèce. */
  readonly preferred: string;
  readonly fit: TankFit;
  readonly fitLabel: string;
  /** Écart lisible à la plage préférée. */
  readonly gap: string;
}

function rangeText({ min, max }: ValueRange, unit: string): string {
  const text = min === max ? frenchNumber(min) : `${frenchNumber(min)} – ${frenchNumber(max)}`;
  return unit === '' ? text : `${text} ${unit}`;
}

function tenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Écart de `value` à la plage `preferred`, arrondi au dixième. */
export function gapText(value: number, preferred: ValueRange, unit: string): string {
  if (!Number.isFinite(value)) {
    return 'valeur du bac inconnue';
  }
  const suffix = unit === '' ? '' : ` ${unit}`;
  if (value > preferred.max) {
    return `${frenchNumber(tenth(value - preferred.max))}${suffix} au-dessus de la plage préférée`;
  }
  if (value < preferred.min) {
    return `${frenchNumber(tenth(preferred.min - value))}${suffix} en dessous de la plage préférée`;
  }
  return 'dans la plage préférée';
}

function comparisonRow(
  parameter: TankComparisonRow['parameter'],
  label: string,
  value: number,
  preferred: ValueRange,
  tolerated: ValueRange,
  unit: string,
): TankComparisonRow {
  const fit = tankFit(value, preferred, tolerated);
  return Object.freeze({
    parameter,
    label,
    tank: Number.isFinite(value)
      ? rangeText({ min: tenth(value), max: tenth(value) }, unit)
      : 'inconnue',
    preferred: rangeText(preferred, unit),
    fit,
    fitLabel: TANK_FIT_LABELS[fit],
    gap: gapText(value, preferred, unit),
  });
}

/**
 * Comparaison des besoins de `id` avec l'eau du bac courant, à `temperature` °C et au pH
 * `ph` : plages préférée et tolérée de la fiche (`speciesSheet`).
 */
export function tankComparison(
  id: SpeciesId,
  temperature: number,
  ph: number,
): readonly TankComparisonRow[] {
  const sheet = speciesSheet(id);
  return Object.freeze([
    comparisonRow(
      'temperature',
      'Température',
      temperature,
      sheet.temperaturePreferred.value,
      sheet.temperatureTolerated.value,
      '°C',
    ),
    comparisonRow('ph', 'pH', ph, sheet.phPreferred.value, sheet.phTolerated.value, ''),
  ]);
}
