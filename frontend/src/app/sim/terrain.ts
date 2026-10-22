import { assertSeed, createPrng } from '../core/random/prng';
import type { Box3 } from './tank';

/**
 * Sol émergé du paludarium (issue #129, ADR 0034) : une carte de hauteurs **pure**. Pour tout
 * point (x, z) du bac, `terrainAt` donne la hauteur du sol, sa nature et s'il est sous l'eau.
 *
 * Profil, de l'eau vers la terre (eau du côté +X par défaut, du côté −X si
 * `waterSide` = −1) :
 * - fond plat à `bedHeight` ;
 * - pente immergée sur `underwaterSlope`, en `(1 − u)²` : nulle au fond, plus raide au bord ;
 * - rivage (hauteur = niveau de l'eau) sur une ligne qui ondule selon z (`shoreWave`) ;
 * - berge sur `landSlope`, en `1 − (1 − v)²` : raide au bord de l'eau, douce vers le haut,
 *   jusqu'à `landRise` au-dessus de l'eau, avec des reliefs (`relief`) et des bosses de
 *   roche (`rock`), qui ne font que monter le sol.
 *
 * Le côté terre du rivage est donc toujours strictement au-dessus de l'eau, le côté eau
 * strictement au-dessous : le rivage est net. Les ondulations et les reliefs sont des sommes
 * de sinusoïdes dont les phases sont tirées de `seed` : même graine, même sol.
 */

/** Réglages du sol d'un environnement à berge (`Environment.terrain`). Longueurs en mètres. */
export interface TerrainSettings {
  /** Graine des phases des ondulations et des reliefs (entier 32 bits non signé). */
  readonly seed: number;
  /** Abscisse moyenne du rivage. */
  readonly shoreX: number;
  /**
   * Côté de l'eau par rapport au rivage, selon x : `1` (défaut) si l'eau est du côté des x
   * plus grands et la terre des x plus petits, `-1` dans l'autre sens (`waterDirection`).
   */
  readonly waterSide?: 1 | -1;
  /** Écart maximal de la ligne de rivage autour de `shoreX`, selon z. */
  readonly shoreWave: number;
  /** Hauteur du fond immergé (au moins le bas du volume d'eau). */
  readonly bedHeight: number;
  /** Largeur de la pente immergée, du rivage au fond plat (> 0). */
  readonly underwaterSlope: number;
  /** Largeur de la berge, du rivage au plateau (> 0). */
  readonly landSlope: number;
  /** Hauteur du plateau au-dessus de l'eau (> 0). */
  readonly landRise: number;
  /** Amplitude des reliefs de la berge (≥ 0). */
  readonly relief: number;
  /** Bosses de roche : seuil du motif dans [0, 1[ et hauteur maximale (≥ 0). */
  readonly rock: { readonly threshold: number; readonly height: number };
}

/** Nature du sol en un point : fond immergé, terre ou roche émergées. */
export type TerrainKind = 'fond' | 'terre' | 'roche';

export interface TerrainSample {
  /** Hauteur du sol, en mètres (repère de `sim/tank.ts`). */
  readonly height: number;
  readonly kind: TerrainKind;
  /** Vrai si le sol est sous la surface de l'eau (côté eau du rivage). */
  readonly submerged: boolean;
}

/**
 * Hauteur de roche en dessous de laquelle le sol reste de la terre (évite des taches de
 * roche d'un millimètre au bord des bosses).
 */
export const ROCK_MIN_HEIGHT = 0.004;

/** Longueurs d'onde (m) des deux ondulations du rivage selon z, et leurs poids. */
const SHORE_WAVES = [
  { length: 0.55, weight: 0.6 },
  { length: 0.23, weight: 0.4 },
] as const;
/** Vecteurs d'onde (rad/m, en x et z) des deux reliefs de la berge. */
const RELIEF_WAVES = [
  [17, 9],
  [-8, 21],
] as const;
/** Fréquences (rad/m, en x puis en z) du motif des bosses de roche. */
const ROCK_FREQUENCY = [19, 23] as const;

/** Phases tirées de la graine, dans [0, 2π[. */
interface Phases {
  readonly shore: readonly [number, number];
  readonly relief: readonly [number, number];
  readonly rock: readonly [number, number];
}

const PHASES = new WeakMap<TerrainSettings, Phases>();

function phasesOf(settings: TerrainSettings): Phases {
  let phases = PHASES.get(settings);
  if (!phases) {
    const rng = createPrng(assertSeed(settings.seed));
    const angle = () => rng.next() * 2 * Math.PI;
    phases = {
      shore: [angle(), angle()],
      relief: [angle(), angle()],
      rock: [angle(), angle()],
    };
    PHASES.set(settings, phases);
  }
  return phases;
}

/**
 * Vérifie des réglages de sol et les renvoie.
 * @throws RangeError si une valeur est hors de son domaine (voir `TerrainSettings`).
 */
export function assertTerrainSettings(settings: TerrainSettings): TerrainSettings {
  assertSeed(settings.seed);
  const finite: [string, number][] = [
    ['shoreX', settings.shoreX],
    ['bedHeight', settings.bedHeight],
  ];
  const positive: [string, number][] = [
    ['underwaterSlope', settings.underwaterSlope],
    ['landSlope', settings.landSlope],
    ['landRise', settings.landRise],
  ];
  const nonNegative: [string, number][] = [
    ['shoreWave', settings.shoreWave],
    ['relief', settings.relief],
    ['rock.height', settings.rock.height],
  ];
  for (const [name, value] of finite) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`terrain.${name} doit être un réel fini (reçu : ${value})`);
    }
  }
  for (const [name, value] of positive) {
    if (!(value > 0 && Number.isFinite(value))) {
      throw new RangeError(
        `terrain.${name} doit être un réel strictement positif (reçu : ${value})`,
      );
    }
  }
  for (const [name, value] of nonNegative) {
    if (!(value >= 0 && Number.isFinite(value))) {
      throw new RangeError(`terrain.${name} doit être un réel positif ou nul (reçu : ${value})`);
    }
  }
  if (settings.waterSide !== undefined && settings.waterSide !== 1 && settings.waterSide !== -1) {
    throw new RangeError(`terrain.waterSide doit valoir 1 ou -1 (reçu : ${settings.waterSide})`);
  }
  const threshold = settings.rock.threshold;
  if (!(threshold >= 0 && threshold < 1)) {
    throw new RangeError(`terrain.rock.threshold doit être dans [0, 1[ (reçu : ${threshold})`);
  }
  return settings;
}

/** Plus grande hauteur possible du sol au-dessus de la surface de l'eau (plateau, reliefs, roche). */
export function terrainMaxRise(settings: TerrainSettings): number {
  return settings.landRise + settings.relief + settings.rock.height;
}

/**
 * Sens de l'eau selon x : `1` si l'eau est vers +X depuis le rivage, `-1` si elle est vers −X
 * (`TerrainSettings.waterSide`). La terre est dans le sens opposé.
 */
export function waterDirection(settings: TerrainSettings): 1 | -1 {
  return settings.waterSide ?? 1;
}

/** Abscisse du rivage à la profondeur `z` (avant la mise dans le bac de `terrainAt`). */
export function shoreLineX(z: number, settings: TerrainSettings): number {
  const [a, b] = phasesOf(settings).shore;
  const [w1, w2] = SHORE_WAVES;
  const wave =
    w1.weight * Math.sin((2 * Math.PI * z) / w1.length + a) +
    w2.weight * Math.sin((2 * Math.PI * z) / w2.length + b);
  return settings.shoreX + settings.shoreWave * wave;
}

/** Objet de travail de `sampleTerrain` : hauteur et nature d'un point du sol. */
interface TerrainScratch {
  height: number;
  submerged: boolean;
  /** Hauteur des bosses de roche en ce point (0 côté eau). */
  rock: number;
}

/** Objets de travail propres à chaque fonction publique : aucun état partagé entre elles. */
const SAMPLE_SCRATCH: TerrainScratch = { height: 0, submerged: false, rock: 0 };
const HEIGHT_SCRATCH: TerrainScratch = { height: 0, submerged: false, rock: 0 };

/**
 * Sol au point (x, z), ramené dans le bac (bornes x et z de `water`) ; la surface de l'eau
 * est `water.maxY`, le fond ne descend jamais sous `water.minY`.
 * Fonction pure : mêmes entrées, même résultat.
 */
export function terrainAt(
  x: number,
  z: number,
  settings: TerrainSettings,
  water: Box3,
): TerrainSample {
  const sample = sampleTerrain(x, z, settings, water, SAMPLE_SCRATCH);
  if (sample.submerged) {
    return { height: sample.height, kind: 'fond', submerged: true };
  }
  return {
    // Au rivage même (d = 0), le sol est au niveau de l'eau, émergé.
    height: sample.height,
    kind: sample.rock >= ROCK_MIN_HEIGHT ? 'roche' : 'terre',
    submerged: false,
  };
}

/**
 * Hauteur du sol au point (x, z), comme `terrainAt(x, z, …).height`, sans allocation :
 * appelée à chaque pas par les espèces qui suivent le fond (`sim/axolotl.ts`).
 */
export function terrainHeightAt(
  x: number,
  z: number,
  settings: TerrainSettings,
  water: Box3,
): number {
  return sampleTerrain(x, z, settings, water, HEIGHT_SCRATCH).height;
}

/**
 * Calcul commun de `terrainAt` et `terrainHeightAt` : écrit la hauteur et la nature du sol
 * au point (x, z) dans `out` et le renvoie (aucune allocation).
 */
function sampleTerrain(
  x: number,
  z: number,
  settings: TerrainSettings,
  water: Box3,
  out: TerrainScratch,
): TerrainScratch {
  const cx = clamp(x, water.minX, water.maxX);
  const cz = clamp(z, water.minZ, water.maxZ);
  const level = water.maxY;
  const bed = Math.min(Math.max(settings.bedHeight, water.minY), level);
  // Distance au rivage, positive côté terre.
  const toShore = shoreLineX(cz, settings) - cx;
  const d = waterDirection(settings) === 1 ? toShore : -toShore;
  if (d < 0) {
    // Côté eau : du rivage (niveau) au fond plat, pente nulle au fond.
    const u = Math.min(-d / settings.underwaterSlope, 1);
    const height = bed + (level - bed) * (1 - u) * (1 - u);
    out.submerged = true;
    out.rock = 0;
    // Au rivage même (u infime), `height` peut arrondir au niveau : rester dessous.
    out.height = Math.min(height, nextDown(level));
    return out;
  }
  // Côté terre : la berge monte, raide au bord de l'eau, puis s'adoucit.
  const v = Math.min(d / settings.landSlope, 1);
  const phases = phasesOf(settings);
  const rise = settings.landRise * (1 - (1 - v) * (1 - v));
  const [k1, k2] = RELIEF_WAVES;
  const noise =
    0.5 * Math.sin(k1[0] * cx + k1[1] * cz + phases.relief[0]) +
    0.5 * Math.sin(k2[0] * cx + k2[1] * cz + phases.relief[1]);
  const relief = settings.relief * v * (noise + 1) * 0.5;
  const pattern =
    Math.sin(ROCK_FREQUENCY[0] * cx + phases.rock[0]) *
    Math.sin(ROCK_FREQUENCY[1] * cz + phases.rock[1]);
  const threshold = settings.rock.threshold;
  const rock =
    pattern > threshold ? (settings.rock.height * v * (pattern - threshold)) / (1 - threshold) : 0;
  out.submerged = false;
  out.rock = rock;
  out.height = level + rise + relief + rock;
  return out;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return (min + max) / 2;
  }
  return Math.min(Math.max(value, min), max);
}

/** Plus grand double strictement inférieur à `value` (fini, positif). */
function nextDown(value: number): number {
  return value - Math.max(Math.abs(value) * Number.EPSILON, Number.MIN_VALUE);
}
