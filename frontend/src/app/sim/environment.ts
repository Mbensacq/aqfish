import type { CameraPreset } from '../core/capture/capture-params';
import { DEFAULT_DECOR, parseDecor, type DecorItem } from './decor';
import { SPECIES, type SpeciesId } from './species';
import { DEFAULT_TANK, waterVolume, type Box3, type TankDimensions } from './tank';

/**
 * Environnements (issue #87, ADR 0026) : le bac tropical, le bassin, puis le paludarium et le
 * récif. Un environnement est une **donnée** : dimensions, teintes de l'eau et du sol, type
 * de bordure, vue par défaut, décor et population de départ. Le monde (`sim/world.ts`) en
 * tire ses bornes de nage, le rendu (`render/aquarium-scene.ts`) sa scène statique.
 *
 * Les teintes sont des **noms** de couleurs de la palette (`render/palette.ts`) : la
 * simulation ne dépend pas du rendu ; un test du rendu vérifie que chaque nom existe.
 */

/** Identifiants des environnements, dans l'ordre du sélecteur. */
export const ENVIRONMENT_IDS = ['tropical', 'bassin'] as const;
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
  /** Population de départ, dans l'ordre de création des poissons. */
  readonly population: readonly EnvironmentPopulation[];
}

/** Bac tropical : le bac d'avant l'issue #87, à l'identique. */
export const TROPICAL_TANK: Environment = {
  id: 'tropical',
  name: 'Bac tropical',
  dimensions: DEFAULT_TANK,
  water: { body: 'eauMoyenne', surface: 'eauClaire' },
  ground: { top: 'sableClair', side: 'sable', bottom: 'sableSombre' },
  border: 'verre',
  defaultCamera: 'three-quarter',
  bubbles: true,
  caustics: true,
  decor: DEFAULT_DECOR,
  population: Object.values(SPECIES).map((def) => ({
    species: def.id,
    count: def.defaultPopulation,
  })),
};

/** Bassin extérieur : 2 × 1,4 m, 40 cm de haut (30 cm d'eau), margelle de pierre. */
export const POND_DIMENSIONS: TankDimensions = { width: 2, height: 0.4, depth: 1.4 };

/**
 * Bassin à koïs (épopée v0.5), vu de dessus : plus large et moins profond que le bac, eau
 * verte-bleutée plus sombre, fond de vase couvert d'algues, quelques pierres. Sans poissons pour
 * l'instant : les koïs arrivent avec l'issue #88 (la population reste réglable au panneau).
 */
export const POND: Environment = {
  id: 'bassin',
  name: 'Bassin',
  dimensions: POND_DIMENSIONS,
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
  population: [],
};

export const ENVIRONMENTS: Readonly<Record<EnvironmentId, Environment>> = {
  tropical: TROPICAL_TANK,
  bassin: POND,
};

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
    water = waterVolume(environmentById(id).dimensions);
    WATER_CACHE.set(id, water);
  }
  return water;
}
