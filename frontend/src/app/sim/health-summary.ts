import { ichStage } from './disease';
import { finRotStage } from './fin-rot';
import { velvetStage } from './velvet';
import { fungusStage } from './fungus';
import { dropsyStage } from './dropsy';
import { SPECIES, type SpeciesId } from './species';
import { feedsOnPellets, STARVING_HUNGER } from './wellbeing';
import { HEALTH_FLOOR } from './health-scale';
import type { GaugeLevel } from './water-dashboard';

/**
 * Synthèse de la santé des animaux pour le tableau de bord (issue #260, addendum de
 * l'ADR 0059) : santé moyenne, faim moyenne, nombre de malades, de faibles, d'affamés et
 * d'animaux en détresse. Fonctions pures, sans hasard ni horloge : elles lisent la santé et la
 * faim tenues par `sim/wellbeing.ts` (ADR 0054) et n'écrivent rien dans le monde.
 *
 * Règles de lecture, alignées sur `sim/wellbeing.ts` :
 * - une santé non finie compte comme pleine (comme `dullness`), une santé hors bornes est
 *   ramenée dans [`HEALTH_FLOOR`, 1] ;
 * - une faim non finie compte pour 0 (comme `growHunger`), une faim hors bornes est ramenée
 *   dans [0, 1] ;
 * - la faim ne compte que pour les espèces qui mangent les granulés (`feedsOnPellets`) : les
 *   autres ne peuvent pas être nourries, leur faim n'use pas leur santé.
 *
 * Points blancs (issue #366, ADR 0089) : la synthèse compte aussi les animaux qui en
 * montrent les signes (`ich`, `sim/disease.ts`, stades visible et aggravé) ; l'incubation,
 * sans signe, n'est pas comptée. Pourriture des nageoires (issue #485, ADR 0114) : de même, les
 * animaux aux nageoires effilochées (`finRot`, `sim/fin-rot.ts`) ; le début, sans signe, non.
 * Velours (issue #532, ADR 0124) : de même, les animaux au voile visible (`velvet`).
 * Champignons (issue #548, ADR 0128) : de même, les animaux au coton visible (`fungus`).
 * Hydropisie (issue #565, ADR 0132) : de même, les animaux au ventre gonflé (`dropsy`).
 *
 * Seuils : valeurs de jeu (approximations, pas des mesures).
 */

/** Santé à partir de laquelle (comprise) un animal est compté « malade ». */
export const SICK_HEALTH = 0.8;
/** Santé à partir de laquelle (comprise) un animal est « faible » (en détresse). */
export const WEAK_HEALTH = 0.4;
/** Faim moyenne à partir de laquelle (comprise) la jauge de faim passe « à surveiller ». */
export const HUNGRY_AVERAGE = 0.7;

/** Animal vu par la synthèse : espèce, faim, santé et points blancs (`Fish`). */
export interface HealthSubject {
  readonly species: SpeciesId;
  readonly hunger: number;
  readonly health: number;
  /** Âge de l'infection par les points blancs (`sim/disease.ts`) ; absent : sain. */
  readonly ich?: number;
  /** Progression de la pourriture des nageoires (`sim/fin-rot.ts`) ; absente : sain. */
  readonly finRot?: number;
  /** Progression du velours (`sim/velvet.ts`, issue #532) ; absente : sain. */
  readonly velvet?: number;
  /** Progression des champignons (`sim/fungus.ts`, issue #548) ; absente : sain. */
  readonly fungus?: number;
  /** Progression de l'hydropisie (`sim/dropsy.ts`, issue #565) ; absente : sain. */
  readonly dropsy?: number;
}

/** Synthèse de la santé d'un bac. Objet de données pur. */
export interface HealthSummary {
  /** Nombre d'animaux. */
  readonly animals: number;
  /** Santé moyenne dans [`HEALTH_FLOOR`, 1] ; `null` sans animal. */
  readonly averageHealth: number | null;
  /** Faim moyenne des animaux nourris aux granulés, dans [0, 1] ; `null` s'il n'y en a pas. */
  readonly averageHunger: number | null;
  /**
   * Animaux malades : santé au plus `SICK_HEALTH`, ou points blancs visibles (`ich`, issue
   * #366) ; chacun compté une fois. `sick − ich` : malades sans points blancs visibles.
   */
  readonly sick: number;
  /** Animaux faibles : santé au plus `WEAK_HEALTH` (plancher compris). */
  readonly weak: number;
  /** Animaux affamés : faim maximale (`STARVING_HUNGER`), espèces nourries aux granulés. */
  readonly starving: number;
  /** Animaux en détresse : faibles ou affamés, chacun compté une fois. */
  readonly distressed: number;
  /** Animaux qui montrent les points blancs (stades visible et aggravé, issue #366). */
  readonly ich: number;
  /** Parmi eux, animaux au stade aggravé. */
  readonly ichAggravated: number;
  /**
   * Animaux faibles sans points blancs visibles (issue #370) : la gravité de l'alerte de santé
   * ne tient compte que d'eux, les points blancs ayant leur propre alerte.
   */
  readonly weakWithoutIch: number;
  /** Animaux aux nageoires effilochées (stades effiloché et avancé, issue #485). */
  readonly finRot: number;
  /** Parmi eux, animaux au stade avancé. */
  readonly finRotAdvanced: number;
  /** Animaux couverts du voile du velours (stades voile et avancé, issue #532). */
  readonly velvet: number;
  /** Parmi eux, animaux au stade avancé. */
  readonly velvetAdvanced: number;
  /** Animaux couverts du coton des champignons (stades coton et avancé, issue #548). */
  readonly fungus: number;
  /** Parmi eux, animaux au stade avancé. */
  readonly fungusAdvanced: number;
  /** Animaux au ventre gonflé par l'hydropisie (ventre gonflé et stade avancé, issue #565). */
  readonly dropsy: number;
  /** Parmi eux, animaux aux écailles hérissées (stade avancé). */
  readonly dropsyAdvanced: number;
  /**
   * Animaux qui montrent les signes d'une maladie (points blancs, nageoires effilochées, velours,
   * champignons, hydropisie),
   * chacun compté une fois : ils ont leurs propres alertes, l'alerte de santé parle des autres
   * malades (`sick − diseased`).
   */
  readonly diseased: number;
  /** Animaux faibles sans signe de maladie : gravité de l'alerte de santé (issue #485). */
  readonly weakWithoutDisease: number;
}

/** Comptes de la synthèse (tout sauf l'effectif et les moyennes). */
type HealthCounts = Record<
  Exclude<keyof HealthSummary, 'animals' | 'averageHealth' | 'averageHunger'>,
  number
>;

/** Comptes à zéro, dans l'ordre des champs de `HealthSummary`. */
const ZERO_COUNTS: Readonly<HealthCounts> = {
  sick: 0,
  weak: 0,
  starving: 0,
  distressed: 0,
  ich: 0,
  ichAggravated: 0,
  weakWithoutIch: 0,
  finRot: 0,
  finRotAdvanced: 0,
  velvet: 0,
  velvetAdvanced: 0,
  fungus: 0,
  fungusAdvanced: 0,
  dropsy: 0,
  dropsyAdvanced: 0,
  diseased: 0,
  weakWithoutDisease: 0,
};

/** Noms des comptes, comparés un à un par `sameHealthSummary`. */
const COUNT_KEYS = Object.keys(ZERO_COUNTS) as readonly (keyof HealthCounts)[]; // clés de ZERO_COUNTS, de type connu

/** Synthèse d'un bac sans animal. */
export const EMPTY_HEALTH_SUMMARY: HealthSummary = {
  animals: 0,
  averageHealth: null,
  averageHunger: null,
  ...ZERO_COUNTS,
};

/** Santé lue : non finie → 1, sinon bornée à [`HEALTH_FLOOR`, 1]. */
export function readHealth(health: number): number {
  if (!Number.isFinite(health)) {
    return 1;
  }
  return Math.min(1, Math.max(HEALTH_FLOOR, health));
}

/** Faim lue : non finie → 0, sinon bornée à [0, 1]. */
export function readHunger(hunger: number): number {
  if (!Number.isFinite(hunger)) {
    return 0;
  }
  return Math.min(1, Math.max(0, hunger));
}

/**
 * Règle de lecture d'une maladie : son stade, les stades qui montrent des signes, le stade
 * avancé, et les comptes qu'elle tient. Données pures.
 */
interface DiseaseRule {
  readonly stage: (animal: HealthSubject) => string | null;
  readonly shown: readonly string[];
  readonly advanced: string;
  readonly count: keyof HealthCounts;
  readonly advancedCount: keyof HealthCounts;
}

/** Maladies comptées par la synthèse, dans l'ordre des champs de `HealthSubject`. */
const DISEASE_RULES: readonly DiseaseRule[] = [
  {
    stage: (a) => ichStage(a.ich),
    shown: ['visible', 'aggravee'],
    advanced: 'aggravee',
    count: 'ich',
    advancedCount: 'ichAggravated',
  },
  {
    stage: (a) => finRotStage(a.finRot),
    shown: ['effilochee', 'avancee'],
    advanced: 'avancee',
    count: 'finRot',
    advancedCount: 'finRotAdvanced',
  },
  {
    stage: (a) => velvetStage(a.velvet),
    shown: ['voile', 'avance'],
    advanced: 'avance',
    count: 'velvet',
    advancedCount: 'velvetAdvanced',
  },
  {
    stage: (a) => fungusStage(a.fungus),
    shown: ['coton', 'avance'],
    advanced: 'avance',
    count: 'fungus',
    advancedCount: 'fungusAdvanced',
  },
  {
    stage: (a) => dropsyStage(a.dropsy),
    shown: ['gonfle', 'herisse'],
    advanced: 'herisse',
    count: 'dropsy',
    advancedCount: 'dropsyAdvanced',
  },
];

/** Sommes et comptes accumulés animal par animal. */
interface HealthTally {
  count: number;
  healthSum: number;
  fed: number;
  hungerSum: number;
  readonly counts: HealthCounts;
}

/** Synthèse de la santé des animaux `animals` (ordre indifférent). */
export function healthSummary(animals: Iterable<HealthSubject>): HealthSummary {
  const tally: HealthTally = {
    count: 0,
    healthSum: 0,
    fed: 0,
    hungerSum: 0,
    counts: { ...ZERO_COUNTS },
  };
  for (const animal of animals) {
    tallyAnimal(tally, animal);
  }
  if (tally.count === 0) {
    return EMPTY_HEALTH_SUMMARY;
  }
  return {
    animals: tally.count,
    averageHealth: mean(tally.healthSum, tally.count),
    averageHunger: tally.fed === 0 ? null : mean(tally.hungerSum, tally.fed),
    ...tally.counts,
  };
}

/** Ajoute `animal` à `tally`. */
function tallyAnimal(tally: HealthTally, animal: HealthSubject): void {
  const { counts } = tally;
  tally.count += 1;
  const health = readHealth(animal.health);
  tally.healthSum += health;
  const shown = tallyDiseases(counts, animal);
  const signs = (shown & SHOWS_DISEASE) !== 0;
  if (health <= SICK_HEALTH || signs) {
    counts.sick += 1;
  }
  if (signs) {
    counts.diseased += 1;
  }
  const isWeak = health <= WEAK_HEALTH;
  if (isWeak) {
    counts.weak += 1;
    counts.weakWithoutIch += (shown & SHOWS_ICH) !== 0 ? 0 : 1;
    counts.weakWithoutDisease += signs ? 0 : 1;
  }
  const isStarving = tallyHunger(tally, animal);
  if (isWeak || isStarving) {
    counts.distressed += 1;
  }
}

/** Bit de `tallyDiseases` : l'animal montre au moins une maladie. */
const SHOWS_DISEASE = 1;
/** Bit de `tallyDiseases` : l'animal montre les points blancs. */
const SHOWS_ICH = 2;

/**
 * Compte les maladies visibles de `animal` dans `counts` ; renvoie un masque de `SHOWS_DISEASE`
 * (il en montre une) et `SHOWS_ICH` (il montre les points blancs), sans allouer d'objet.
 */
function tallyDiseases(counts: HealthCounts, animal: HealthSubject): number {
  let shown = 0;
  for (const rule of DISEASE_RULES) {
    const stage = rule.stage(animal);
    if (stage === null || !rule.shown.includes(stage)) {
      continue;
    }
    shown |= rule.count === 'ich' ? SHOWS_DISEASE | SHOWS_ICH : SHOWS_DISEASE;
    counts[rule.count] += 1;
    if (stage === rule.advanced) {
      counts[rule.advancedCount] += 1;
    }
  }
  return shown;
}

/** Ajoute la faim de `animal` s'il mange les granulés ; renvoie s'il est affamé. */
function tallyHunger(tally: HealthTally, animal: HealthSubject): boolean {
  if (!feedsOnPellets(SPECIES[animal.species])) {
    return false;
  }
  const hunger = readHunger(animal.hunger);
  tally.fed += 1;
  tally.hungerSum += hunger;
  const isStarving = hunger >= STARVING_HUNGER;
  if (isStarving) {
    tally.counts.starving += 1;
  }
  return isStarving;
}

/**
 * Moyenne arrondie au milliardième : une somme de flottants égaux ne doit pas dériver au-delà
 * d'un seuil (24 animaux au plancher 0,2 donnaient 0,20000000000000007).
 */
function mean(sum: number, count: number): number {
  return Math.round((sum / count) * 1e9) / 1e9;
}

/** Pourcentage entier d'une part dans [0, 1] ; `null` (ou non fini) reste `null`. */
export function percent(share: number | null): number | null {
  return share === null || !Number.isFinite(share) ? null : Math.round(share * 100);
}

/**
 * Vrai si deux synthèses affichent la même chose : mêmes effectifs et mêmes moyennes au
 * pour cent près (l'hôte ne notifie l'interface qu'à ce moment-là).
 */
export function sameHealthSummary(a: HealthSummary, b: HealthSummary): boolean {
  return (
    a.animals === b.animals &&
    COUNT_KEYS.every((key) => a[key] === b[key]) &&
    percent(a.averageHealth) === percent(b.averageHealth) &&
    percent(a.averageHunger) === percent(b.averageHunger)
  );
}

/**
 * Niveau de la santé moyenne : vert au-dessus de `SICK_HEALTH`, orange au-dessus de
 * `WEAK_HEALTH`, rouge sinon (seuils compris dans le niveau inférieur). Sans animal : vert.
 */
export function averageHealthLevel(average: number | null): GaugeLevel {
  if (average === null) {
    return 'vert';
  }
  const health = readHealth(average);
  if (health > SICK_HEALTH) {
    return 'vert';
  }
  return health > WEAK_HEALTH ? 'orange' : 'rouge';
}

/**
 * Niveau de la faim moyenne : vert sous `HUNGRY_AVERAGE`, orange en dessous de la faim
 * maximale, rouge à la faim maximale (tous affamés). Sans animal nourri : vert.
 */
export function averageHungerLevel(average: number | null): GaugeLevel {
  if (average === null) {
    return 'vert';
  }
  const hunger = readHunger(average);
  if (hunger < HUNGRY_AVERAGE) {
    return 'vert';
  }
  return hunger < STARVING_HUNGER ? 'orange' : 'rouge';
}

/** Une ligne de la synthèse prête à afficher. Objet de données pur. */
export interface HealthItem {
  readonly id: 'health' | 'hunger' | 'sick' | 'distressed';
  /** Nom court affiché. */
  readonly label: string;
  /** Valeur affichée (« 92 % », « 3 », « – »). */
  readonly value: string;
  readonly level: GaugeLevel;
  /** Texte lu complet (« Santé moyenne : 92 %, bonne »). */
  readonly spoken: string;
}

/** Libellé lu de chaque niveau d'une ligne de santé. */
const SPOKEN_LEVELS: Readonly<Record<GaugeLevel, string>> = {
  vert: 'bon',
  orange: 'à surveiller',
  rouge: 'critique',
};

/** « , dont 2 avec des points blancs » ; rien sans animal atteint. */
function ichSpoken(count: number): string {
  return count > 0 ? `, dont ${count} avec des points blancs` : '';
}

/** Lignes de la synthèse, dans l'ordre d'affichage : santé, faim, malades, détresse. */
export function healthItems(summary: HealthSummary): readonly HealthItem[] {
  const healthPercent = percent(summary.averageHealth);
  const hungerPercent = percent(summary.averageHunger);
  const healthLevel = averageHealthLevel(summary.averageHealth);
  const hungerLevel = averageHungerLevel(summary.averageHunger);
  const sickLevel: GaugeLevel = summary.sick > 0 ? 'orange' : 'vert';
  const distressLevel: GaugeLevel = summary.distressed > 0 ? 'rouge' : 'vert';
  const shown = (value: number | null) => (value === null ? '–' : `${value} %`);
  const spokenShare = (value: number | null, absent: string) =>
    value === null ? absent : `${value} %`;
  return [
    {
      id: 'health',
      label: 'Santé',
      value: shown(healthPercent),
      level: healthLevel,
      spoken: `Santé moyenne : ${spokenShare(healthPercent, 'aucun animal')}, ${SPOKEN_LEVELS[healthLevel]}`,
    },
    {
      id: 'hunger',
      label: 'Faim',
      value: shown(hungerPercent),
      level: hungerLevel,
      spoken: `Faim moyenne : ${spokenShare(hungerPercent, 'aucun animal nourri aux granulés')}, ${SPOKEN_LEVELS[hungerLevel]}`,
    },
    {
      id: 'sick',
      label: 'Malades',
      value: String(summary.sick),
      level: sickLevel,
      spoken: `Animaux malades : ${summary.sick} sur ${summary.animals}${ichSpoken(summary.ich)}, ${SPOKEN_LEVELS[sickLevel]}`,
    },
    {
      id: 'distressed',
      label: 'Détresse',
      value: String(summary.distressed),
      level: distressLevel,
      spoken: `Animaux en détresse ou affamés : ${summary.distressed} sur ${summary.animals}, ${SPOKEN_LEVELS[distressLevel]}`,
    },
  ];
}
