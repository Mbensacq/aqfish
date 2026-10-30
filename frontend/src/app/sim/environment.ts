import { DEFAULT_POND_SHAPE, type PondShape } from './pond-shape';
import type { CameraPreset } from '../core/capture/capture-params';
import { assertAnemoneSettings, type AnemoneSettings } from './anemones';
import { assertBankDecorSettings, type BankDecorSettings } from './bank-decor';
import { assertCoralSettings, type CoralSettings } from './corals';
import { DEFAULT_DECOR, parseDecor, type DecorItem } from './decor';
import { assertLilyPadSettings, type LilyPadSettings } from './lily-pads';
import {
  AXOLOTL,
  CHIRURGIEN,
  CLOWN,
  CORYDORA,
  GOURAMI,
  GRENOUILLE,
  GUPPY,
  KOI,
  KUHLI,
  NEON,
  RASBORA,
  TETRA,
  TRITON,
  type SpeciesId,
} from './species';
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
 * ADR 0034) et le récif (issue #148). Un environnement est une **donnée** : dimensions, teintes
 * de l'eau et du sol, type de bordure, vue par défaut, décor et population de départ. Le monde (`sim/world.ts`) en
 * tire ses bornes de nage, le rendu (`render/aquarium-scene.ts`) sa scène statique.
 *
 * Les teintes sont des **noms** de couleurs de la palette (`render/palette.ts`) : la
 * simulation ne dépend pas du rendu ; un test du rendu vérifie que chaque nom existe.
 */

/** Identifiants des environnements, dans l'ordre du sélecteur. */
export const ENVIRONMENT_IDS = ['tropical', 'bassin', 'paludarium', 'recif', 'eaufroide'] as const;
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
   * Forme du bassin vue de dessus (issue #190) : seulement dans les données d'un lieu de
   * forme réglée (`placeEnvironmentData`), pour le rendu ; absente, rectangle.
   */
  readonly shape?: PondShape;
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
  /**
   * Tons d'environnement (`ENVIRONMENT_TONES` de `render/palette.ts`, ADR 0039) que la passe
   * palette peut employer ici, en plus de la palette commune : vide sauf au récif.
   */
  readonly tones: readonly string[];
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
   * Coraux (issue #149, `sim/corals.ts`, ADR 0040) : nombre et échelles des colonies,
   * disposées selon la graine du monde autour du décor ; `null` : aucun (sauf au récif).
   */
  readonly corals: CoralSettings | null;
  /**
   * Anémones (issue #150, `sim/anemones.ts`, ADR 0041) : nombre et échelles, disposées selon la
   * graine du monde autour du décor et des coraux ; `null` : aucune (sauf au récif).
   */
  readonly anemones: AnemoneSettings | null;
  /**
   * Nénuphars flottants (issue #103, `sim/lily-pads.ts`) : nombre et tailles des feuilles,
   * disposées selon la graine du monde ; `null` : aucun.
   */
  readonly lilyPads: LilyPadSettings | null;
  /**
   * Mousses et racines de la berge (`sim/bank-decor.ts`, #132, ADR 0038), ou `null` : seulement
   * pour un environnement à berge (`terrain` non nul).
   */
  readonly bankDecor: BankDecorSettings | null;
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
/**
 * Espèces du lot 1 d'eau douce (#238, ADR 0070) : proposées au bac tropical mais absentes de
 * sa population de départ, qui reste celle d'avant (captures identiques à l'octet).
 */
const TROPICAL_ADDABLE = [RASBORA, TETRA, KUHLI, GOURAMI] as const;

/** Bac tropical : le bac d'avant l'issue #87, à l'identique. */
export const TROPICAL_TANK: Environment = {
  id: 'tropical',
  name: 'Bac tropical',
  dimensions: DEFAULT_TANK,
  waterLevel: WATER_LEVEL_RATIO,
  terrain: null,
  water: { body: 'eauMoyenne', surface: 'eauClaire' },
  tones: [],
  ground: { top: 'sableClair', side: 'sable', bottom: 'sableSombre' },
  border: 'verre',
  defaultCamera: 'three-quarter',
  bubbles: true,
  caustics: true,
  decor: DEFAULT_DECOR,
  corals: null,
  anemones: null,
  lilyPads: null,
  bankDecor: null,
  rain: false,
  floatingLeaves: false,
  species: [...TROPICAL_SPECIES, ...TROPICAL_ADDABLE].map((def) => def.id),
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
  tones: [],
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
  corals: null,
  anemones: null,
  lilyPads: assertLilyPadSettings({
    count: { min: 5, max: 8 },
    radius: { min: 0.075, max: 0.13 },
  }),
  bankDecor: null,
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
 * (`sim/terrain.ts`). Sonneurs orientaux entre terre et eau (issue #131, ADR 0064), tritons à
 * ventre de feu plus aquatiques (issue #133) ; mousses et racines (#132).
 *
 * Population par défaut sans axolotl (issue #271, ADR 0065) : il vit seul, dans le bac d'eau
 * froide. Il reste proposé ici (`species`) pour que les anciennes sauvegardes du paludarium
 * mixte se chargent telles quelles ; l'en ajouter déclenche l'alerte de mélange déconseillé.
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
  tones: [],
  // Dessus et côtés : ceux du fond immergé ; la terre et la roche ont leurs couleurs
  // (`render/terrain-mesh.ts`). Dessous : celui du bac tropical.
  ground: { top: 'sable', side: 'sableSombre', bottom: 'sableSombre' },
  border: 'verre',
  defaultCamera: 'three-quarter',
  bubbles: false,
  caustics: false,
  decor: [],
  corals: null,
  anemones: null,
  lilyPads: null,
  bankDecor: assertBankDecorSettings({
    seed: 132,
    moss: { count: { min: 10, max: 13 }, radius: { min: 0.04, max: 0.075 } },
    roots: {
      count: { min: 3, max: 4 },
      length: { min: 0.24, max: 0.34 },
      radius: { min: 0.012, max: 0.017 },
    },
  }),
  rain: false,
  floatingLeaves: false,
  species: [AXOLOTL.id, GRENOUILLE.id, TRITON.id],
  population: defaultPopulation([GRENOUILLE, TRITON]),
};

/** Récif : 1,5 m × 60 cm, 65 cm de haut, plus long, plus large et plus haut que le bac. */
export const REEF_DIMENSIONS: TankDimensions = { width: 1.5, height: 0.65, depth: 0.6 };

/**
 * Récif marin (épopée v0.8, issue #148) : bac vitré plus grand que le bac tropical, eau d'un
 * bleu franc plus clair en surface, sable corallien clair, quelques roches et des colonies de
 * coraux tirées de la graine (issue #149), des anémones et leurs poissons-clowns (issue #150),
 * des chirurgiens bleus en banc à mi-hauteur (issue #151).
 */
export const REEF: Environment = {
  id: 'recif',
  name: 'Récif',
  dimensions: REEF_DIMENSIONS,
  waterLevel: WATER_LEVEL_RATIO,
  terrain: null,
  // Teinte d'entrée saturée (bleu néon) : à travers l'eau translucide, l'image retombe sur
  // les deux tons du récif, `eauRecif` (volume) et `eauRecifClaire` (surface).
  water: { body: 'neonBleu', surface: 'neonBleu' },
  // Violets des coraux (issue #149), orange des poissons-clowns (issue #150) et bleu des
  // chirurgiens (issue #151) : absents de la palette commune.
  tones: [
    'eauRecif',
    'eauRecifClaire',
    'corailViolet',
    'corailVioletClair',
    'clownOrange',
    'chirurgienBleu',
  ],
  // Sable corallien : blanc cassé ; vu de côté, il reste blanc sous l'eau bleue ; vu de
  // dessus, à travers la surface bleue, il se lit en eau très claire, comme un lagon.
  ground: { top: 'koiBlanc', side: 'sableClair', bottom: 'sableSombre' },
  border: 'verre',
  defaultCamera: 'three-quarter',
  bubbles: false,
  caustics: false,
  decor: parseDecor(
    `[
      { "kind": "rock", "x": -0.48, "z": -0.14, "rotation": 0.7, "scale": 1.5, "seed": 148 },
      { "kind": "rock", "x": -0.3, "z": -0.19, "rotation": 2.8, "scale": 0.9, "seed": 61 },
      { "kind": "rock", "x": 0.36, "z": -0.1, "rotation": 4.9, "scale": 1.3, "seed": 23 },
      { "kind": "rock", "x": 0.1, "z": 0.16, "rotation": 1.2, "scale": 0.7, "seed": 77 }
    ]`,
    REEF_DIMENSIONS,
  ),
  corals: assertCoralSettings({ count: { min: 7, max: 9 }, scale: { min: 1, max: 1.5 } }),
  anemones: assertAnemoneSettings({ count: { min: 2, max: 2 }, scale: { min: 1.2, max: 1.4 } }),
  lilyPads: null,
  bankDecor: null,
  rain: false,
  floatingLeaves: false,
  species: [CLOWN.id, CHIRURGIEN.id],
  population: defaultPopulation([CLOWN, CHIRURGIEN]),
};

/** Bac d'eau froide : 1 m × 45 cm, 45 cm de haut (environ 155 L d'eau). */
export const COLD_TANK_DIMENSIONS: TankDimensions = { width: 1, height: 0.45, depth: 0.45 };

/**
 * Bac d'eau froide (issue #271, ADR 0065) : l'axolotl, seul avec ses congénères (« seul ou
 * entre axolotls », `docs/ESPECES.md`), dans une eau fraîche (`WATER_TEMPERATURES`) sans
 * courant (ni diffuseur ni bulles). Fond plat de sable, eau plus sombre que le bac tropical,
 * sans caustiques ; quelques plantes et deux pierres au fond, le long de la vitre arrière :
 * l'axolotl ne contourne pas encore les obstacles en marchant (`sim/axolotl.ts`), le devant
 * reste dégagé.
 */
export const COLD_TANK: Environment = {
  id: 'eaufroide',
  name: 'Bac d’eau froide',
  dimensions: COLD_TANK_DIMENSIONS,
  waterLevel: WATER_LEVEL_RATIO,
  terrain: null,
  water: { body: 'eauSombre', surface: 'eauMoyenne' },
  tones: [],
  ground: { top: 'sable', side: 'sableSombre', bottom: 'sableSombre' },
  border: 'verre',
  defaultCamera: 'three-quarter',
  bubbles: false,
  caustics: false,
  decor: parseDecor(
    `[
      { "kind": "rock", "x": -0.38, "z": -0.15, "rotation": 0.6, "scale": 1.1, "seed": 271 },
      { "kind": "rock", "x": 0.34, "z": -0.16, "rotation": 3.4, "scale": 0.8, "seed": 72 },
      { "kind": "plant", "form": "tall", "x": -0.22, "z": -0.17, "rotation": 1.1, "scale": 0.9, "seed": 171 },
      { "kind": "plant", "form": "tall", "x": 0.05, "z": -0.18, "rotation": 2.7, "scale": 1, "seed": 272 },
      { "kind": "plant", "form": "tall", "x": 0.42, "z": -0.17, "rotation": 4.6, "scale": 0.75, "seed": 373 }
    ]`,
    COLD_TANK_DIMENSIONS,
  ),
  corals: null,
  anemones: null,
  lilyPads: null,
  bankDecor: null,
  rain: false,
  floatingLeaves: false,
  species: [AXOLOTL.id],
  population: defaultPopulation([AXOLOTL]),
};

export const ENVIRONMENTS: Readonly<Record<EnvironmentId, Environment>> = {
  tropical: TROPICAL_TANK,
  bassin: POND,
  paludarium: PALUDARIUM,
  recif: REEF,
  eaufroide: COLD_TANK,
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

/** Volumes d'eau par lieu (`placeKey`), calculés une fois (partagés, ne pas modifier). */
const WATER_CACHE = new Map<string, Box3>();

/**
 * Nombre maximal d'entrées des tables par lieu (`placeKey`) : au-delà, la table est vidée.
 * Les dimensions réglées tombent sur des pas (`TANK_LIMITS`) ; la borne protège seulement
 * d'un appelant qui passerait des dimensions quelconques en boucle.
 */
export const PLACE_CACHE_LIMIT = 256;

/** Volume d'eau d'un environnement ou d'un lieu (`waterVolume` de ses dimensions), mis en cache. */
export function environmentWater(place: Place): Box3 {
  const key = placeKey(place);
  let water = WATER_CACHE.get(key);
  if (!water) {
    water = waterVolume(
      placeDimensions(place),
      environmentById(placeEnvironment(place)).waterLevel,
    );
    if (WATER_CACHE.size >= PLACE_CACHE_LIMIT) {
      WATER_CACHE.clear();
    }
    WATER_CACHE.set(key, water);
  }
  return water;
}

// ---------------------------------------------------------------------------------------
// Dimensions réglables (issue #171, ADR 0047)

/**
 * Lieu de la simulation : un environnement dont les dimensions peuvent être réglées. Un monde
 * (`sim/world.ts`) en est un : `dimensions` absent, ce sont celles de l'environnement.
 */
export interface TankPlace {
  readonly environment: EnvironmentId;
  readonly dimensions?: TankDimensions;
  /**
   * Forme du bassin vue de dessus (issue #190, `sim/pond-shape.ts`) ; absente : rectangle.
   * Seuls les environnements de `SHAPED_ENVIRONMENTS` en ont une autre.
   */
  readonly shape?: PondShape;
}

/** Environnement seul (dimensions d'origine) ou lieu aux dimensions réglées. */
export type Place = EnvironmentId | TankPlace;

/** Environnements dont les dimensions se règlent (le bac tropical seulement). */
export const RESIZABLE_ENVIRONMENTS: readonly EnvironmentId[] = ['tropical'];

/** Vrai si les dimensions de l'environnement `id` se règlent. */
export function isTankResizable(id: EnvironmentId): boolean {
  return RESIZABLE_ENVIRONMENTS.includes(id);
}

/** Environnements dont la forme se règle (issue #190 : le bassin seulement). */
export const SHAPED_ENVIRONMENTS: readonly EnvironmentId[] = ['bassin'];

/** Vrai si la forme de l'environnement `id` se règle (`sim/pond-shape.ts`). */
export function isPondShapeable(id: EnvironmentId): boolean {
  return SHAPED_ENVIRONMENTS.includes(id);
}

/** Forme d'un lieu : la sienne, sinon le rectangle. */
export function placeShape(place: Place): PondShape {
  return typeof place === 'string' ? DEFAULT_POND_SHAPE : (place.shape ?? DEFAULT_POND_SHAPE);
}

/** Environnement d'un lieu. */
export function placeEnvironment(place: Place): EnvironmentId {
  return typeof place === 'string' ? place : place.environment;
}

/** Dimensions d'un lieu : les siennes, sinon celles de son environnement. */
export function placeDimensions(place: Place): TankDimensions {
  if (typeof place !== 'string' && place.dimensions !== undefined) {
    return place.dimensions;
  }
  return environmentById(placeEnvironment(place)).dimensions;
}

/**
 * Clés déjà construites, par objet `dimensions` (#185) : la clé d'un monde redimensionné est
 * lue à chaque pas, son objet `dimensions` ne change qu'au redimensionnement
 * (`setTankDimensionsInPlace`). Les dimensions sont en lecture seule : un objet n'est jamais
 * modifié après sa création. On garde l'environnement avec la clé, au cas où le même objet
 * servirait à deux environnements.
 */
const PLACE_KEYS = new WeakMap<TankDimensions, { environment: EnvironmentId; key: string }>();

/** Nombre de clés de lieu construites (`placeKey`) depuis le chargement du module (tests). */
let placeKeyBuilds = 0;

/** Nombre de clés de lieu construites depuis le chargement du module, pour les tests. */
export function placeKeyBuildCount(): number {
  return placeKeyBuilds;
}

/**
 * Clé d'un lieu pour les tables de valeurs calculées une fois : l'identifiant de
 * l'environnement sans dimensions réglées, sinon l'identifiant suivi des trois dimensions.
 * Aucune allocation, sauf au premier appel pour un objet `dimensions` donné (`PLACE_KEYS`).
 */
export function placeKey(place: Place): string {
  if (typeof place === 'string') {
    return place;
  }
  const d = place.dimensions;
  if (d === undefined) {
    const shape = place.shape;
    return shape === undefined || shape === DEFAULT_POND_SHAPE
      ? place.environment
      : shapedKey(place.environment, shape);
  }
  const hit = PLACE_KEYS.get(d);
  if (hit !== undefined && hit.environment === place.environment) {
    return hit.key;
  }
  placeKeyBuilds += 1;
  const key = `${place.environment}:${d.width}:${d.height}:${d.depth}`;
  PLACE_KEYS.set(d, { environment: place.environment, key });
  return key;
}

/** Clés des lieux de forme réglée (issue #190), construites une fois par couple. */
const SHAPED_KEYS = new Map<EnvironmentId, Map<PondShape, string>>();

function shapedKey(environment: EnvironmentId, shape: PondShape): string {
  let byShape = SHAPED_KEYS.get(environment);
  if (byShape === undefined) {
    byShape = new Map();
    SHAPED_KEYS.set(environment, byShape);
  }
  let key = byShape.get(shape);
  if (key === undefined) {
    placeKeyBuilds += 1;
    key = `${environment}~${shape}`;
    byShape.set(shape, key);
  }
  return key;
}

/** Environnement d'un lieu, avec ses dimensions et sa forme (pour le rendu de la scène). */
export function placeEnvironmentData(place: Place): Environment {
  const env = environmentById(placeEnvironment(place));
  const dimensions = placeDimensions(place);
  const sized = dimensions === env.dimensions ? env : { ...env, dimensions };
  const shape = placeShape(place);
  return shape === DEFAULT_POND_SHAPE || !isPondShapeable(env.id) ? sized : { ...sized, shape };
}

/** Volume d'eau d'un environnement aux dimensions éventuellement réglées (`placeEnvironmentData`). */
export function environmentDataWater(env: Environment): Box3 {
  const base = environmentById(env.id);
  return environmentWater(
    env.dimensions === base.dimensions
      ? env.id
      : { environment: env.id, dimensions: env.dimensions },
  );
}
