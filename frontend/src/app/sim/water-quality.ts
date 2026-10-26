import { environmentById, type EnvironmentId } from './environment';
import type { SpeciesId } from './species';
import { freshWater, targetTemperature, WATER_TEMPERATURES, type WaterState } from './water';
import { phBands, phZone, sameBands, type PhBands, type PhZone } from './water-ph';

/**
 * Qualité de l'eau d'un bac (issue #207, ADR 0053) : indicateur global à trois niveaux et
 * échelles des jauges du panneau, lus par l'interface et le rendu (eau trouble). Fonctions
 * pures, sans allocation.
 *
 * Un composé ou un écart de température atteint un niveau dès qu'il **atteint** son seuil
 * (comparaison `>=`) ; l'indicateur global est le pire des quatre. Les seuils sont des
 * **valeurs de jeu**, calées sur `sim/water.ts` : avec la population par défaut du bac
 * tropical et un filtre neuf, l'ammoniaque (~0,8) et les nitrites (~1,3) restent sous le
 * seuil « à surveiller » ; les nitrates (~25 unités par heure simulée au départ) l'atteignent
 * en moins d'une heure, puis « mauvaise » en moins de deux sans changement d'eau.
 */

/** Niveau de l'indicateur global, du meilleur au pire. */
export type WaterQuality = 'bonne' | 'a-surveiller' | 'mauvaise';

/** Niveaux, du meilleur au pire (rang = gravité). */
export const WATER_QUALITIES: readonly WaterQuality[] = ['bonne', 'a-surveiller', 'mauvaise'];

/** Libellé affiché de chaque niveau (le texte porte l'information, pas seulement la couleur). */
export const WATER_QUALITY_LABELS: Readonly<Record<WaterQuality, string>> = {
  bonne: 'Bonne',
  'a-surveiller': 'À surveiller',
  mauvaise: 'Mauvaise',
};

/** Seuils d'un critère : « à surveiller » à partir de `watch`, « mauvaise » à partir de `bad`. */
export interface QualityThresholds {
  readonly watch: number;
  readonly bad: number;
}

/** Composé dissous affiché par une jauge. */
export type WaterCompound = 'ammonia' | 'nitrite' | 'nitrate';

/** Composés, dans l'ordre d'affichage. */
export const WATER_COMPOUNDS: readonly WaterCompound[] = ['ammonia', 'nitrite', 'nitrate'];

/** Seuils de chaque composé, en unités de jeu (`sim/water.ts`). */
export const COMPOUND_THRESHOLDS: Readonly<Record<WaterCompound, QualityThresholds>> = {
  ammonia: { watch: 2, bad: 5 },
  nitrite: { watch: 2, bad: 5 },
  nitrate: { watch: 20, bad: 40 },
};

/**
 * Seuils de l'écart de température à celle de l'environnement (`WATER_TEMPERATURES`), en
 * °C, dans un sens comme dans l'autre : un chauffage réglé trop chaud ou trop froid rend
 * l'eau « à surveiller », puis « mauvaise ».
 */
export const TEMPERATURE_THRESHOLDS: QualityThresholds = { watch: 3, bad: 6 };

/**
 * Plein de chaque jauge, en unités de jeu : une fois et demie le seuil « mauvaise », pour que
 * les trois zones se voient. Une valeur au-delà remplit la jauge.
 */
export const GAUGE_MAX: Readonly<Record<WaterCompound, number>> = {
  ammonia: 7.5,
  nitrite: 7.5,
  nitrate: 60,
};

/**
 * Niveau d'une valeur `value` (positive ou nulle) au regard de `thresholds`. Une valeur non
 * finie (`NaN`, infinie) est « mauvaise » : l'indicateur ne doit jamais rassurer à tort.
 */
export function levelOf(value: number, thresholds: QualityThresholds): WaterQuality {
  if (!Number.isFinite(value) || value >= thresholds.bad) {
    return 'mauvaise';
  }
  return value >= thresholds.watch ? 'a-surveiller' : 'bonne';
}

/** Pire de deux niveaux. */
export function worseQuality(a: WaterQuality, b: WaterQuality): WaterQuality {
  return WATER_QUALITIES.indexOf(b) > WATER_QUALITIES.indexOf(a) ? b : a;
}

/**
 * Indicateur global de l'eau `water` d'un bac de l'environnement `environment` : le pire
 * niveau parmi l'ammoniaque, les nitrites, les nitrates et l'écart de température à celle
 * de l'environnement. Le filtre n'y entre pas : ses effets passent par les composés.
 */
export function waterQuality(water: WaterState, environment: EnvironmentId): WaterQuality {
  let quality = levelOf(
    Math.abs(water.temperature - WATER_TEMPERATURES[environment]),
    TEMPERATURE_THRESHOLDS,
  );
  for (const compound of WATER_COMPOUNDS) {
    quality = worseQuality(quality, levelOf(water[compound], COMPOUND_THRESHOLDS[compound]));
  }
  return quality;
}

/**
 * Part remplie de la jauge d'un composé, dans [0, 1] (0 pour une valeur négative ou non
 * finie, 1 au-delà du plein `GAUGE_MAX`).
 */
export function gaugeFill(compound: WaterCompound, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(1, value / GAUGE_MAX[compound]);
}

/**
 * Trouble de l'eau rendu pour un niveau (issue #207), dans [0, 1] : la teinte entière quand
 * l'eau est mauvaise, aucune sinon (eau bonne ou à surveiller : rendu inchangé, à l'octet
 * près). Un seul palier : une demi-teinte serait ramenée par la passe palette à l'une des
 * deux couleurs voisines, au hasard du fond (`docs/PIEGES.md`, « Opacité partielle »).
 */
export function waterTurbidity(quality: WaterQuality): number {
  return quality === 'mauvaise' ? 1 : 0;
}

/**
 * Relevé de l'eau affiché par le panneau (issue #207) : valeurs arrondies au dixième, pour
 * que l'interface ne change qu'avec ce qu'elle montre. Objet de données pur.
 */
export interface WaterReadout {
  readonly quality: WaterQuality;
  /** Température de l'eau, en °C. */
  readonly temperature: number;
  /** Température visée (consigne du chauffage, ou celle de l'environnement), en °C. */
  readonly target: number;
  readonly ammonia: number;
  readonly nitrite: number;
  readonly nitrate: number;
  /** pH de l'eau (issue #236). */
  readonly ph: number;
  /** Zone du pH pour les espèces présentes (calculée sur la valeur exacte). */
  readonly phZone: PhZone;
  /** Plages de pH communes aux espèces présentes (zones de la jauge). */
  readonly phBands: PhBands;
}

/** Relevé d'une eau saine du bac tropical peuplé par défaut (valeur initiale de l'interface). */
export const DEFAULT_WATER_READOUT: WaterReadout = waterReadout(
  freshWater('tropical'),
  'tropical',
  environmentById('tropical').population.map((entry) => entry.species),
);

/**
 * Relevé de l'eau `water` d'un bac de l'environnement `environment` peuplé des espèces
 * `species` (doublons permis) : indicateur global et zone du pH (calculés sur les valeurs
 * exactes), valeurs arrondies au dixième.
 */
export function waterReadout(
  water: WaterState,
  environment: EnvironmentId,
  species: Iterable<SpeciesId> = [],
): WaterReadout {
  const bands = phBands(species);
  return {
    quality: waterQuality(water, environment),
    temperature: tenth(water.temperature),
    target: tenth(targetTemperature(water, environment)),
    ammonia: tenth(water.ammonia),
    nitrite: tenth(water.nitrite),
    nitrate: tenth(water.nitrate),
    ph: tenth(water.ph),
    phZone: phZone(water.ph, bands),
    phBands: bands,
  };
}

/** Vrai si deux relevés affichent la même chose. */
export function sameReadout(a: WaterReadout, b: WaterReadout): boolean {
  return (
    a.quality === b.quality &&
    a.temperature === b.temperature &&
    a.target === b.target &&
    a.ammonia === b.ammonia &&
    a.nitrite === b.nitrite &&
    a.nitrate === b.nitrate &&
    a.ph === b.ph &&
    a.phZone === b.phZone &&
    sameBands(a.phBands, b.phBands)
  );
}

/**
 * Eau d'exemple d'un niveau donné (paramètre de capture `eau=`, issue #207) : eau saine de
 * l'environnement, avec des nitrates à 1,25 fois le seuil du niveau (0 pour une eau bonne).
 * Les nitrates ne baissent qu'au changement d'eau : le niveau tient quand le monde avance.
 */
export function sampleWater(environment: EnvironmentId, quality: WaterQuality): WaterState {
  const water = freshWater(environment);
  switch (quality) {
    case 'bonne':
      return water;
    case 'a-surveiller':
      return { ...water, nitrate: 1.25 * COMPOUND_THRESHOLDS.nitrate.watch };
    case 'mauvaise':
      return { ...water, nitrate: 1.25 * COMPOUND_THRESHOLDS.nitrate.bad };
  }
}

/** Vrai si `value` est un niveau de l'indicateur (`bonne`, `a-surveiller`, `mauvaise`). */
export function isWaterQuality(value: unknown): value is WaterQuality {
  return typeof value === 'string' && (WATER_QUALITIES as readonly string[]).includes(value);
}

/** Arrondi au dixième (−0 ramené à 0). */
function tenth(value: number): number {
  return Math.round(value * 10) / 10 + 0;
}
