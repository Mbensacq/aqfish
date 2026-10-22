import type { CameraPreset } from '../core/capture/capture-params';
import { DEFAULT_DECOR, parseDecor, type DecorItem } from './decor';
import { assertLilyPadSettings, type LilyPadSettings } from './lily-pads';
import { AXOLOTL, CORYDORA, GUPPY, KOI, NEON, type SpeciesId } from './species';
import { assertTerrainSettings, type TerrainSettings } from './terrain';
import {
  DEFAULT_TANK,
  SAND_THICKNESS,
  WATER_LEVEL_RATIO,
  waterVolume,
  type Box3,
  type TankDimensions,
} from './tank';

/**
 * Environnements (issue #87, ADR 0026) : le bac tropical, le bassin, le paludarium (issue #129,
 * ADR 0034), puis le récif. Un environnement est une **donnée** : dimensions, teintes de l'eau et du sol, type
 * de bordure, vue par défaut, décor et population de départ. Le monde (`sim/world.ts`) en
 * tire ses bornes de nage, le rendu (`render/aquarium-scene.ts`) sa scène statique.
 *
 * Les teintes sont des **noms** de couleurs de la palette (`render/palette.ts`) : la
 * simulation ne dépend pas du rendu ; un test du rendu vérifie que chaque nom existe.
 */

/** Identifiants des environnements, dans l'ordre du sélecteur. */
export const ENVIRONMENT_IDS = ['tropical', 'bassin', 'paludarium'] as const;
export type EnvironmentId = (typeof ENVIRONMENT_IDS)[number];

/** Environnement de l'application sans choix explicite (séries de captures existantes). */
export const DEFAULT_ENVIRONMENT_ID: EnvironmentId = 'tropical';

/** Bordure du volume d'eau : parois vitrées (bac) ou margelle de pierre (bassin). */
export type BorderKind = 'verre' | 'pierre';

/** Population de départ d'une espèce. */
export interface EnvironmentPopulation {
  readonly species: SpeciesId;
  readonly count: number;
}

export interface Environment {
  readonly id: EnvironmentId;
  /** Nom affiché dans le sélecteur. */
  readonly name: string;
  /** Dimensions intérieures (repère de `sim/tank.ts`). */
  readonly dimensions: TankDimensions;
  /**
   * Niveau de l'eau, en fraction de la hauteur (`waterVolume`) : `WATER_LEVEL_RATIO` pour le
   * bac et le bassin, plus bas pour le paludarium, dont la berge émerge.
   */
  readonly waterLevel: number;
  /**
   * Sol à berge émergée (paludarium, `sim/terrain.ts`, ADR 0034) ; `null` : dalle plate de
   * `SAND_THICKNESS` (bac, bassin).
   */
  readonly terrain: TerrainSettings | null;
  /** Teintes de l'eau en plein jour : corps du volume et surface (noms de la palette). */
  readonly water: { readonly body: string; readonly surface: string };
  /** Teintes du sol : dessus, côtés, dessous (noms de la palette). */
  readonly ground: { readonly top: string; readonly side: string; readonly bottom: string };
  readonly border: BorderKind;
  /** Vue choisie à l'arrivée dans l'environnement (sans `camera=` dans l'URL). */
  readonly defaultCamera: CameraPreset;
  /** Diffuseur et bulles (bac tropical seulement). */
  readonly bubbles: boolean;
  /**
   * Caustiques sur le sol : dessinées pour le sable clair du bac ; sur le fond sombre du
   * bassin, leurs couleurs de sable masqueraient l'eau.
   */
  readonly caustics: boolean;
  /** Décor de départ, validé dans les dimensions de l'environnement. */
  readonly decor: readonly DecorItem[];
  /**
   * Nénuphars flottants (issue #103, `sim/lily-pads.ts`) : nombre et tailles des feuilles,
   * disposées selon la graine du monde ; `null` : aucun.
   */
  readonly lilyPads: LilyPadSettings | null;
  /**
   * Pluie possible (issue #106, `sim/rain.ts`) : le bassin, à ciel ouvert. Ailleurs, la
   * commande de pluie est sans effet.
   */
  readonly rain: boolean;
  /**
   * Feuilles mortes qui flottent et dérivent (issue #107, `sim/floating-leaves.ts`) : le
   * bassin, sous les arbres.
   */
  readonly floatingLeaves: boolean;
  /**
   * Espèces qui vivent dans l'environnement, dans l'ordre du panneau (issue #88) : seules
   * celles-ci sont proposées au réglage de population et exposées.
   */
  readonly species: readonly SpeciesId[];
  /** Population de départ (espèces de `species`), dans l'ordre de création des poissons. */
  readonly population: readonly EnvironmentPopulation[];
}

/** Population de départ : chaque espèce donnée avec sa population par défaut. */
function defaultPopulation(
  defs: readonly { id: SpeciesId; defaultPopulation: number }[],
): EnvironmentPopulation[] {
  return defs.map((def) => ({ species: def.id, count: def.defaultPopulation }));
}

const TROPICAL_SPECIES = [NEON, GUPPY, CORYDORA] as const;

/** Bac tropical : le bac d'avant l'issue #87, à l'identique. */
export const TROPICAL_TANK: Environment = {
  id: 'tropical',
  name: 'Bac tropical',
  dimensions: DEFAULT_TANK,
  waterLevel: WATER_LEVEL_RATIO,
  terrain: null,
  water: { body: 'eauMoyenne', surface: 'eauClaire' },
  ground: { top: 'sableClair', side: 'sable', bottom: 'sableSombre' },
  border: 'verre',
  defaultCamera: 'three-quarter',
  bubbles: true,
  caustics: true,
  decor: DEFAULT_DECOR,
  lilyPads: null,
  rain: false,
  floatingLeaves: false,
  species: TROPICAL_SPECIES.map((def) => def.id),
  population: defaultPopulation(TROPICAL_SPECIES),
};

/** Bassin extérieur : 2 × 1,4 m, 40 cm de haut (30 cm d'eau), margelle de pierre. */
export const POND_DIMENSIONS: TankDimensions = { width: 2, height: 0.4, depth: 1.4 };

/**
 * Bassin à koïs (épopée v0.5), vu de dessus : plus large et moins profond que le bac, eau
 * verte-bleutée plus sombre, fond de vase couvert d'algues, quelques pierres, des koïs
 * (issue #88) et des nénuphars (issue #103).
 */
export const POND: Environment = {
  id: 'bassin',
  name: 'Bassin',
  dimensions: POND_DIMENSIONS,
  waterLevel: WATER_LEVEL_RATIO,
  terrain: null,
  water: { body: 'eauSombre', surface: 'eauMoyenne' },
  ground: { top: 'vegetationOmbre', side: 'rocheSombre', bottom: 'rocheSombre' },
  border: 'pierre',
  defaultCamera: 'top',
  bubbles: false,
  caustics: false,
  decor: parseDecor(
    `[
      { "kind": "rock", "x": -0.62, "z": -0.38, "rotation": 0.9, "scale": 1.6, "seed": 12 },
      { "kind": "rock", "x": -0.45, "z": -0.46, "rotation": 2.4, "scale": 1, "seed": 31 },
      { "kind": "rock", "x": 0.55, "z": 0.32, "rotation": 4.4, "scale": 1.4, "seed": 5 },
      { "kind": "rock", "x": 0.18, "z": -0.4, "rotation": 1.7, "scale": 0.8, "seed": 19 }
    ]`,
    POND_DIMENSIONS,
  ),
  lilyPads: assertLilyPadSettings({
    count: { min: 5, max: 8 },
    radius: { min: 0.075, max: 0.13 },
  }),
  rain: true,
  floatingLeaves: true,
  species: [KOI.id],
  population: defaultPopulation([KOI]),
};

/** Paludarium : 1 m × 50 cm, 60 cm de haut, eau à 27 cm. */
export const PALUDARIUM_DIMENSIONS: TankDimensions = { width: 1, height: 0.6, depth: 0.5 };

/**
 * Paludarium (épopée v0.7, issue #129, ADR 0034) : bac vitré dont la moitié +X est en eau et
 * la moitié −X une berge de terre et de roche qui émerge, en pente douce vers l'eau
 * (`sim/terrain.ts`). Axolotls dans l'eau (issue #130) ; grenouilles et tritons (#131) et
 * décor (#132) à venir.
 */
export const PALUDARIUM: Environment = {
  id: 'paludarium',
  name: 'Paludarium',
  dimensions: PALUDARIUM_DIMENSIONS,
  waterLevel: 0.45,
  terrain: assertTerrainSettings({
    seed: 129,
    shoreX: -0.02,
    shoreWave: 0.06,
    bedHeight: SAND_THICKNESS,
    underwaterSlope: 0.24,
    landSlope: 0.26,
    landRise: 0.1,
    relief: 0.025,
    rock: { threshold: 0.55, height: 0.04 },
  }),
  water: { body: 'eauMoyenne', surface: 'eauClaire' },
  // Dessus et côtés : ceux du fond immergé ; la terre et la roche ont leurs couleurs
  // (`render/terrain-mesh.ts`). Dessous : celui du bac tropical.
  ground: { top: 'sable', side: 'sableSombre', bottom: 'sableSombre' },
  border: 'verre',
  defaultCamera: 'three-quarter',
  bubbles: false,
  caustics: false,
  decor: [],
  lilyPads: null,
  rain: false,
  floatingLeaves: false,
  species: [AXOLOTL.id],
  population: defaultPopulation([AXOLOTL]),
};

export const ENVIRONMENTS: Readonly<Record<EnvironmentId, Environment>> = {
  tropical: TROPICAL_TANK,
  bassin: POND,
  paludarium: PALUDARIUM,
};

/** Vrai si l'espèce `species` vit dans l'environnement `id` (`Environment.species`). */
export function livesIn(id: EnvironmentId, species: SpeciesId): boolean {
  return environmentById(id).species.includes(species);
}

/** Vrai si `value` est l'identifiant d'un environnement (clés héritées refusées). */
export function isEnvironmentId(value: unknown): value is EnvironmentId {
  return typeof value === 'string' && Object.hasOwn(ENVIRONMENTS, value);
}

/**
 * Environnement d'identifiant `id`.
 * @throws RangeError si l'environnement est inconnu.
 */
export function environmentById(id: EnvironmentId): Environment {
  if (!isEnvironmentId(id)) {
    throw new RangeError(`environnement inconnu : ${String(id)}`);
  }
  return ENVIRONMENTS[id];
}

/** Volumes d'eau par environnement, calculés une fois (partagés, ne pas modifier). */
const WATER_CACHE = new Map<EnvironmentId, Box3>();

/** Volume d'eau d'un environnement (`waterVolume` de ses dimensions), mis en cache. */
export function environmentWater(id: EnvironmentId): Box3 {
  let water = WATER_CACHE.get(id);
  if (!water) {
    const env = environmentById(id);
    water = waterVolume(env.dimensions, env.waterLevel);
    WATER_CACHE.set(id, water);
  }
  return water;
}
