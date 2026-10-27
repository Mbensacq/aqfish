import { SPECIES, type SpeciesId } from './species';
import { feedsOnPellets, HEALTH_FLOOR, STARVING_HUNGER } from './wellbeing';
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
 * Seuils : valeurs de jeu (approximations, pas des mesures).
 */

/** Santé à partir de laquelle (comprise) un animal est compté « malade ». */
export const SICK_HEALTH = 0.8;
/** Santé à partir de laquelle (comprise) un animal est « faible » (en détresse). */
export const WEAK_HEALTH = 0.4;
/** Faim moyenne à partir de laquelle (comprise) la jauge de faim passe « à surveiller ». */
export const HUNGRY_AVERAGE = 0.7;

/** Animal vu par la synthèse : espèce, faim et santé (`Fish`). */
export interface HealthSubject {
  readonly species: SpeciesId;
  readonly hunger: number;
  readonly health: number;
}

/** Synthèse de la santé d'un bac. Objet de données pur. */
export interface HealthSummary {
  /** Nombre d'animaux. */
  readonly animals: number;
  /** Santé moyenne dans [`HEALTH_FLOOR`, 1] ; `null` sans animal. */
  readonly averageHealth: number | null;
  /** Faim moyenne des animaux nourris aux granulés, dans [0, 1] ; `null` s'il n'y en a pas. */
  readonly averageHunger: number | null;
  /** Animaux malades : santé au plus `SICK_HEALTH`. */
  readonly sick: number;
  /** Animaux faibles : santé au plus `WEAK_HEALTH` (plancher compris). */
  readonly weak: number;
  /** Animaux affamés : faim maximale (`STARVING_HUNGER`), espèces nourries aux granulés. */
  readonly starving: number;
  /** Animaux en détresse : faibles ou affamés, chacun compté une fois. */
  readonly distressed: number;
}

/** Synthèse d'un bac sans animal. */
export const EMPTY_HEALTH_SUMMARY: HealthSummary = {
  animals: 0,
  averageHealth: null,
  averageHunger: null,
  sick: 0,
  weak: 0,
  starving: 0,
  distressed: 0,
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

/** Synthèse de la santé des animaux `animals` (ordre indifférent). */
export function healthSummary(animals: Iterable<HealthSubject>): HealthSummary {
  let count = 0;
  let healthSum = 0;
  let fed = 0;
  let hungerSum = 0;
  let sick = 0;
  let weak = 0;
  let starving = 0;
  let distressed = 0;
  for (const animal of animals) {
    count += 1;
    const health = readHealth(animal.health);
    healthSum += health;
    const isWeak = health <= WEAK_HEALTH;
    if (health <= SICK_HEALTH) {
      sick += 1;
    }
    if (isWeak) {
      weak += 1;
    }
    let isStarving = false;
    if (feedsOnPellets(SPECIES[animal.species])) {
      const hunger = readHunger(animal.hunger);
      fed += 1;
      hungerSum += hunger;
      isStarving = hunger >= STARVING_HUNGER;
      if (isStarving) {
        starving += 1;
      }
    }
    if (isWeak || isStarving) {
      distressed += 1;
    }
  }
  if (count === 0) {
    return EMPTY_HEALTH_SUMMARY;
  }
  return {
    animals: count,
    averageHealth: mean(healthSum, count),
    averageHunger: fed === 0 ? null : mean(hungerSum, fed),
    sick,
    weak,
    starving,
    distressed,
  };
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
    a.sick === b.sick &&
    a.weak === b.weak &&
    a.starving === b.starving &&
    a.distressed === b.distressed &&
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
      spoken: `Animaux malades : ${summary.sick} sur ${summary.animals}, ${SPOKEN_LEVELS[sickLevel]}`,
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
