import { mixWarnings, type MixWarning } from './compatibility';
import { FOOD_PER_DROP } from './food';
import {
  averageHungerLevel,
  healthSummary,
  HUNGRY_AVERAGE,
  percent,
  readHunger,
} from './health-summary';
import type { AlertSeverity } from './dashboard-alerts';
import { environmentById, environmentWater } from './environment';
import { populationCounts } from './population';
import { type SpeciesId } from './species';
import { MIX_REASON_TEXT, SPECIES_LABELS } from './species-catalog';
import { comparisonRowOf, tankComparison, type TankComparisonRow } from './species-care';
import {
  AMMONIA_PER_LOAD_LITER,
  NITRITE_CONVERSION,
  WATER_CHANGE_SHARE,
  WATER_TEMPERATURES,
  waterLiters,
  waterLoad,
} from './water';
import {
  compoundLevel,
  formatTenth,
  QUALITY_LEVELS,
  temperatureLevel,
  waterSample,
  type GaugeLevel,
  type WaterSample,
} from './water-dashboard';
import { waterHardness, type Hardness } from './water-hardness';
import {
  COMPOUND_THRESHOLDS,
  levelOf,
  type QualityThresholds,
  type WaterCompound,
} from './water-quality';
import type { World } from './world';

/**
 * Bilan du bac (issue #514, ADR 0117) : les trois points les plus utiles à améliorer, chacun
 * avec une valeur mesurée et une action. Fonctions pures, sans hasard ni horloge ; rien ici
 * n'écrit dans le monde.
 *
 * - **seuils** : ceux des alertes (`COMPOUND_THRESHOLDS`, `temperatureLevel`,
 *   `averageHungerLevel`) et des fiches d'espèces (dureté) ; seuls la densité (dérivée du
 *   modèle de l'eau) et le surnourrissage (`OVERFEEDING_PELLETS`) leur sont propres ;
 * - **ordre** : critiques d'abord, puis l'ordre fixe `REVIEW_ORDER` ;
 * - une valeur non finie donne un point critique « mesure invalide » (jamais rassurant) ;
 * - un bac sain, ou vide à l'eau saine, ne donne aucun point.
 */

/** Sujets du bilan, dans l'ordre retenu à gravité égale. */
export type ReviewPointId =
  'density' | 'nitrogen' | 'feeding' | 'compatibility' | 'hardness' | 'temperature';

/** Ordre des points de même gravité. */
export const REVIEW_ORDER: readonly ReviewPointId[] = [
  'density',
  'nitrogen',
  'feeding',
  'compatibility',
  'hardness',
  'temperature',
];

/** Nombre de points affichés au plus. */
export const MAX_REVIEW_POINTS = 3;

/**
 * Charge par litre (`waterLoad / waterLiters`) à partir de laquelle un filtre neuf ne garde
 * plus les nitrites sous leurs seuils : à l'équilibre, nitrites = `AMMONIA_PER_LOAD_LITER` ×
 * charge par litre / `NITRITE_CONVERSION`. Les populations par défaut restent en dessous.
 */
export const DENSITY_THRESHOLDS: QualityThresholds = {
  watch: (COMPOUND_THRESHOLDS.nitrite.watch * NITRITE_CONVERSION) / AMMONIA_PER_LOAD_LITER,
  bad: (COMPOUND_THRESHOLDS.nitrite.bad * NITRITE_CONVERSION) / AMMONIA_PER_LOAD_LITER,
};

/** Granulés encore dans l'eau au-delà desquels des animaux rassasiés signalent un excès (3 dépôts). */
export const OVERFEEDING_PELLETS = 3 * FOOD_PER_DROP;

/** Un point du bilan. Objet de données pur. */
export interface ReviewPoint {
  readonly id: ReviewPointId;
  readonly severity: AlertSeverity;
  /** Titre court (« Trop d'animaux pour ce bac »). */
  readonly title: string;
  /** Valeur mesurée et cause, lues sur la simulation. */
  readonly measure: string;
  /** Action concrète. */
  readonly action: string;
}

/** Ce que le bilan lit de la simulation. */
export interface ReviewInput {
  readonly sample: WaterSample;
  readonly animals: number;
  /** Charge des habitants (`waterLoad`). */
  readonly load: number;
  readonly liters: number;
  /** Faim moyenne des animaux nourris aux granulés ; `null` : aucun. */
  readonly averageHunger: number | null;
  /** Granulés présents dans l'eau. */
  readonly pellets: number;
  readonly mixes: readonly MixWarning[];
  /** Espèces présentes, sans doublon. */
  readonly species: readonly SpeciesId[];
  /** Dureté du bac ; absente : ce point est ignoré. */
  readonly hardness?: Hardness;
}

const INVALID = 'mesure invalide (état de l’eau abîmé)';
const CHANGE_WATER = `Changer l’eau (${Math.round(WATER_CHANGE_SHARE * 100)} % renouvelés)`;

const COMPOUND_TEXTS: Readonly<
  Record<WaterCompound, { name: string; title: string; why: string }>
> = {
  ammonia: {
    name: 'Ammoniaque',
    title: 'Ammoniaque trop présente',
    why: 'déchets toxiques que le filtre n’arrive pas à transformer',
  },
  nitrite: {
    name: 'Nitrites',
    title: 'Nitrites trop présents',
    why: 'composé toxique, étape intermédiaire du travail du filtre',
  },
  nitrate: {
    name: 'Nitrates',
    title: 'Nitrates accumulés',
    why: 'résidu du filtre, que seuls les changements d’eau retirent',
  },
};

const COMPOUND_ORDER: readonly WaterCompound[] = ['ammonia', 'nitrite', 'nitrate'];

function severityOf(level: GaugeLevel): AlertSeverity | null {
  if (level === 'vert') {
    return null;
  }
  return level === 'rouge' ? 'critique' : 'attention';
}

function densityPoint(animals: number, load: number, liters: number): ReviewPoint | null {
  if (animals === 0) {
    return null;
  }
  const density = load / liters;
  const title = 'Trop d’animaux pour ce bac';
  const action = 'Retirer des animaux (Réglages, Population) ou choisir un bac plus grand';
  if (!Number.isFinite(animals) || !(liters > 0) || !Number.isFinite(density)) {
    return { id: 'density', severity: 'critique', title, measure: INVALID, action };
  }
  const severity = severityOf(QUALITY_LEVELS[levelOf(density, DENSITY_THRESHOLDS)]);
  if (severity === null) {
    return null;
  }
  const share = Math.round((density / DENSITY_THRESHOLDS.watch) * 100);
  return {
    id: 'density',
    severity,
    title,
    measure: `${animals} animaux dans ${Math.round(liters)} L : ${share} % de ce que le filtre peut traiter`,
    action,
  };
}

function nitrogenPoint(sample: WaterSample): ReviewPoint | null {
  const ranked = COMPOUND_ORDER.map((compound) => ({
    compound,
    severity: severityOf(compoundLevel(compound, sample[compound])),
  })).filter((entry) => entry.severity !== null);
  const worst = ranked.find((entry) => entry.severity === 'critique') ?? ranked[0];
  if (worst === undefined || worst.severity === null) {
    return null;
  }
  const value = sample[worst.compound];
  const text = COMPOUND_TEXTS[worst.compound];
  return {
    id: 'nitrogen',
    severity: worst.severity,
    title: text.title,
    measure: Number.isFinite(value)
      ? `${text.name} à ${formatTenth(value)} (à garder sous ${COMPOUND_THRESHOLDS[worst.compound].watch}) : ${text.why}`
      : INVALID,
    action: `${CHANGE_WATER} et nourrir moins pendant quelques jours`,
  };
}

function feedingPoint(
  animals: number,
  averageHunger: number | null,
  pellets: number,
): ReviewPoint | null {
  if (animals === 0) {
    return null;
  }
  const hungry = severityOf(averageHungerLevel(averageHunger));
  if (hungry !== null) {
    return {
      id: 'feeding',
      severity: hungry,
      title: 'Animaux affamés',
      measure: `Faim moyenne à ${percent(readHunger(averageHunger as number))} %`,
      action: 'Donner des granulés, un peu à la fois',
    };
  }
  if (!Number.isFinite(pellets)) {
    return {
      id: 'feeding',
      severity: 'critique',
      title: 'Trop de nourriture',
      measure: INVALID,
      action: 'Attendre que les granulés soient mangés',
    };
  }
  if (pellets < OVERFEEDING_PELLETS) {
    return null;
  }
  const fed = averageHunger === null ? '' : `, faim moyenne à ${percent(averageHunger)} %`;
  return {
    id: 'feeding',
    severity: 'attention',
    title: 'Trop de nourriture',
    measure: `${pellets} granulés non mangés dans l’eau${fed}`,
    action: `Attendre que les granulés soient mangés : l’excès pollue l’eau (sous ${Math.round(HUNGRY_AVERAGE * 100)} % de faim, les animaux n’ont pas besoin d’être nourris)`,
  };
}

function compatibilityPoint(mixes: readonly MixWarning[]): ReviewPoint | null {
  if (mixes.length === 0) {
    return null;
  }
  const pairs = mixes.map(
    (m) =>
      `${SPECIES_LABELS[m.first].plural} et ${SPECIES_LABELS[m.second].plural} (${MIX_REASON_TEXT[m.reason]})`,
  );
  return {
    id: 'compatibility',
    severity: 'attention',
    title: 'Espèces mal assorties',
    measure: `${mixes.length} mélange${mixes.length > 1 ? 's' : ''} à risque : ${pairs.join(' ; ')}`,
    action: 'Retirer l’une des espèces : Réglages, Population',
  };
}

/**
 * Dureté (#484) : les espèces du bac hors de leur plage de dureté, toutes comptées (#522) ;
 * une seule est nommée avec sa plage, plusieurs sont comptées puis nommées avec la leur.
 */
function hardnessPoint(
  species: readonly SpeciesId[],
  hardness: Hardness | undefined,
  sample: WaterSample,
): ReviewPoint | null {
  if (hardness === undefined) {
    return null;
  }
  const outside: { readonly id: SpeciesId; readonly row: TankComparisonRow }[] = [];
  for (const id of species) {
    const row = comparisonRowOf(
      tankComparison(id, sample.temperature, sample.ph, hardness),
      'hardness',
    );
    if (row !== undefined && row.fit === 'hors-plage') {
      outside.push({ id, row });
    }
  }
  const first = outside[0];
  if (first === undefined) {
    return null;
  }
  const invalid = outside.some(({ row }) => row.tank === 'inconnue');
  const water = `${first.row.label} (minéraux dissous) à ${first.row.tank}`;
  const ranges = outside.map(({ id, row }) =>
    outside.length === 1
      ? `${SPECIES_LABELS[id].plural} : ${row.preferred}`
      : `${SPECIES_LABELS[id].plural} (${row.preferred})`,
  );
  return {
    id: 'hardness',
    severity: invalid ? 'critique' : 'attention',
    title: 'Dureté de l’eau mal adaptée',
    measure: invalid
      ? INVALID
      : outside.length === 1
        ? `${water}, ${ranges[0]}`
        : `${water}, ${outside.length} espèces hors plage : ${ranges.join(' ; ')}`,
    action: 'Choisir des espèces adaptées à cette eau (Réglages, Population)',
  };
}

function temperaturePoint(sample: WaterSample): ReviewPoint | null {
  const severity = severityOf(temperatureLevel(sample.temperature, sample.environment));
  if (severity === null) {
    return null;
  }
  return {
    id: 'temperature',
    severity,
    title: 'Température à corriger',
    measure: Number.isFinite(sample.temperature)
      ? `Eau à ${formatTenth(sample.temperature)} °C pour ${WATER_TEMPERATURES[sample.environment]} °C attendus`
      : INVALID,
    action: 'Régler le chauffage (Réglages, Eau)',
  };
}

function rank(point: ReviewPoint): number {
  return (point.severity === 'critique' ? 0 : REVIEW_ORDER.length) + REVIEW_ORDER.indexOf(point.id);
}

/** Les points à améliorer, classés par gravité, au plus `MAX_REVIEW_POINTS`. */
export function tankReview(input: ReviewInput): readonly ReviewPoint[] {
  const { sample, animals, load, liters, averageHunger, pellets, mixes, species, hardness } = input;
  return [
    densityPoint(animals, load, liters),
    nitrogenPoint(sample),
    feedingPoint(animals, averageHunger, pellets),
    compatibilityPoint(mixes),
    hardnessPoint(species, hardness, sample),
    temperaturePoint(sample),
  ]
    .filter((point): point is ReviewPoint => point !== null)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_REVIEW_POINTS);
}

/** Bilan du bac `world`, lu sur son état courant. */
export function worldReview(world: World): readonly ReviewPoint[] {
  return tankReview({
    sample: waterSample(world.water, world.environment, world.tick),
    animals: world.entities.length,
    load: waterLoad(world.entities),
    liters: waterLiters(environmentWater(world)),
    averageHunger: healthSummary(world.entities).averageHunger,
    pellets: world.food.length,
    mixes: mixWarnings(environmentById(world.environment).species, populationCounts(world)),
    species: [...new Set(world.entities.map((entity) => entity.species))],
    hardness: waterHardness(world.water, world.environment),
  });
}
