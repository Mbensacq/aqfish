import { assertSeed, createPrng, deriveSeed, MAX_SEED } from '../core/random/prng';
import { rectCircleGap, rectGap, type Rect } from './corals';
import { decorObstacles, type DecorItem } from './decor';
import type { BoxObstacle } from './obstacles';
import { plantSway, type SwayOffset } from './plant-sway';
import { SAND_THICKNESS, type TankDimensions } from './tank';

/**
 * Anémones du récif (issue #150, ADR 0041) : un pied en colonne de voxels posé sur le sable,
 * couronné d'un tapis de tentacules courts qui ondulent doucement ; les poissons-clowns s'y
 * attachent (`sim/world.ts`, `SpeciesDefinition.anemone`).
 *
 * Comme les coraux (ADR 0040), tout est **dérivé** de la graine du monde, sans état : la
 * disposition (`anemoneLayout`) se tire d'un flux de hasard propre (`ANEMONE_STREAM`), qui ne
 * touche ni aux poissons, ni aux coraux, ni au décor des autres environnements ; la forme
 * (`anemoneModel`) se tire de la graine de chaque anémone. La sauvegarde n'a aucun champ
 * nouveau.
 *
 * Obstacle : la boîte du **pied** seul (`anemoneBox`), au repos. Les tentacules sont
 * traversables (les poissons-clowns s'y glissent) et leur ondulation (`tentacleSway`) ne
 * change jamais cette boîte : l'évitement ne peut pas osciller avec elles.
 * Module pur et déterministe, sans Three.js (ADR 0003).
 */

/** Flux de hasard des anémones, dérivé de la graine du monde (`deriveSeed`). */
export const ANEMONE_STREAM = 0xa4e3;
/** Arête d'un voxel d'anémone à l'échelle 1, en mètres (comme les plantes). */
export const ANEMONE_VOXEL_SIZE = 0.008;
/** Bornes de l'échelle d'une anémone. */
export const ANEMONE_SCALE_LIMITS = { min: 0.5, max: 2 } as const;
/** Rayon du pied, en voxels. */
export const COLUMN_RADIUS = 3;
/** Hauteur du pied, en voxels (base enfoncée de `ANEMONE_SINK_RATIO` voxel). */
export const COLUMN_HEIGHT = 3;
/** Rayon du disque d'où partent les tentacules, en voxels (le disque déborde du pied). */
export const DISC_RADIUS = 4;
/** Longueur d'un tentacule, en voxels, tirée dans [min, max]. */
export const TENTACLE_LENGTH = { min: 4, max: 4 } as const;
/**
 * Amplitude de l'ondulation au bout des tentacules, en fraction de leur longueur maximale
 * (approximation de jeu : plus que les plantes, `PLANT_SWAY_RATIO`, pour des tentacules
 * courts qui se lisent en mouvement, sans écarter les tentacules voisins jusqu'à ouvrir le
 * tapis).
 */
export const TENTACLE_SWAY_RATIO = 0.2;
/**
 * Décalage de phase d'un tentacule au suivant, en radians : faible, pour que des voisins
 * bougent presque ensemble (le tapis ondule en vagues sans se fendre).
 */
export const TENTACLE_PHASE_STEP = 0.25;
/** Enfoncement de la base dans le sable, en fraction de voxel (comme les coraux). */
export const ANEMONE_SINK_RATIO = 0.25;
/** Distance minimale entre l'emprise d'une anémone et les vitres, en mètres. */
export const ANEMONE_EDGE_MARGIN = 0.1;
/** Jeu minimal entre l'emprise d'une anémone et un rocher ou une autre anémone, en mètres. */
export const ANEMONE_GAP = 0.03;
/** Essais de placement par anémone avant de l'omettre. */
export const ANEMONE_ATTEMPTS = 200;
/** Nombre maximal d'anémones d'un environnement. */
export const MAX_ANEMONES = 6;

/** Réglage des anémones d'un environnement (`sim/environment.ts`). */
export interface AnemoneSettings {
  /** Nombre visé, tiré entre `min` et `max` (bornes comprises). */
  readonly count: { readonly min: number; readonly max: number };
  /** Échelle, tirée entre `min` et `max`. */
  readonly scale: { readonly min: number; readonly max: number };
}

/** Anémone posée sur le sable (données pures). */
export interface Anemone {
  /** Rang dans la disposition (0, 1, 2…). */
  readonly id: number;
  /** Centre du pied, dans le repère du bac (mètres). */
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  /** Graine de forme, entier 32 bits non signé. */
  readonly seed: number;
}

/** Voxel plein d'une anémone : le voxel occupe [i, i + 1] × [j, j + 1] × [k, k + 1]. */
export interface AnemoneCell {
  readonly i: number;
  readonly j: number;
  readonly k: number;
  /** Pied (immobile, obstacle) ou tentacule (ondule, traversable). */
  readonly part: 'column' | 'tentacle';
  /** Indice du tentacule (0 pour le pied). */
  readonly strand: number;
  /** Bout d'un tentacule (renflé, plus clair au rendu). */
  readonly tip: boolean;
}

/** Modèle d'une anémone dans son repère local (Y = 0 à la base du pied, centre en X = Z = 0). */
export interface AnemoneModel {
  /** Arête d'un voxel, en mètres. */
  readonly voxelSize: number;
  /** Nombre de tentacules. */
  readonly tentacles: number;
  /** Phase de l'ondulation, dans [0, 2π). */
  readonly phase: number;
  /** Amplitude de l'ondulation au bout d'un tentacule de longueur maximale, en mètres. */
  readonly amplitude: number;
  /** Plus grande demi-emprise des voxels selon X ou Z, en voxels (tentacules compris). */
  readonly reach: number;
  /** Hauteur totale en voxels (plus grand `j` + 1). */
  readonly height: number;
  /** Voxels pleins, triés par (j, i, k), sans doublon. */
  readonly cells: readonly AnemoneCell[];
}

/**
 * Vérifie un réglage d'anémones : effectifs entiers dans [0, `MAX_ANEMONES`] avec
 * `min ≤ max`, échelles dans `ANEMONE_SCALE_LIMITS` avec `min ≤ max`.
 * @throws RangeError si le réglage est invalide.
 */
export function assertAnemoneSettings(settings: AnemoneSettings): AnemoneSettings {
  const { count, scale } = settings;
  if (
    !Number.isInteger(count.min) ||
    !Number.isInteger(count.max) ||
    count.min < 0 ||
    count.max < count.min ||
    count.max > MAX_ANEMONES
  ) {
    throw new RangeError(`effectif d'anémones invalide : ${JSON.stringify(count)}`);
  }
  if (
    !(scale.min >= ANEMONE_SCALE_LIMITS.min) ||
    !(scale.max <= ANEMONE_SCALE_LIMITS.max) ||
    !(scale.max >= scale.min)
  ) {
    throw new RangeError(`échelle d'anémone invalide : ${JSON.stringify(scale)}`);
  }
  return settings;
}

/**
 * Modèle voxel d'une anémone pour la graine `seed` et l'échelle `scale` : un pied rond de
 * `COLUMN_RADIUS` voxels sur `COLUMN_HEIGHT`, puis un tentacule sur chaque case du disque de
 * `DISC_RADIUS` voxels (tapis serré : un damier laissait le contour noir envahir l'anémone),
 * de `TENTACLE_LENGTH` voxels ; ceux du bord penchent vers l'extérieur. Déterministe.
 * @throws RangeError si la graine ou l'échelle est invalide.
 */
export function anemoneModel(seed: number, scale: number): AnemoneModel {
  assertSeed(seed);
  if (!(scale >= ANEMONE_SCALE_LIMITS.min && scale <= ANEMONE_SCALE_LIMITS.max)) {
    throw new RangeError(`échelle d'anémone invalide : ${scale}`);
  }
  const rng = createPrng(seed);
  const cells = new Map<string, AnemoneCell>();
  const add = (cell: AnemoneCell): void => {
    const key = `${cell.i},${cell.j},${cell.k}`;
    if (!cells.has(key)) {
      cells.set(key, cell);
    }
  };
  for (let j = 0; j < COLUMN_HEIGHT; j++) {
    for (const [i, k] of discCells(COLUMN_RADIUS)) {
      add({ i, j, k, part: 'column', strand: 0, tip: false });
    }
  }
  let strand = 0;
  for (const [i, k] of discCells(DISC_RADIUS)) {
    strand += 1;
    const span = TENTACLE_LENGTH.max - TENTACLE_LENGTH.min + 1;
    const length = TENTACLE_LENGTH.min + Math.floor(rng.next() * span);
    // Centre de la case par rapport à l'axe : les tentacules du bord penchent vers l'extérieur
    // d'un voxel tous les deux rangs.
    const cx = i + 0.5;
    const cz = k + 0.5;
    const outer = Math.hypot(cx, cz) > DISC_RADIUS - 1.5;
    const sx = outer ? Math.sign(cx) * (Math.abs(cx) >= Math.abs(cz) / 2 ? 1 : 0) : 0;
    const sz = outer ? Math.sign(cz) * (Math.abs(cz) >= Math.abs(cx) / 2 ? 1 : 0) : 0;
    for (let r = 0; r < length; r++) {
      const lean = Math.floor(r / 2);
      add({
        i: i + sx * lean,
        j: COLUMN_HEIGHT + r,
        k: k + sz * lean,
        part: 'tentacle',
        strand,
        tip: r === length - 1,
      });
    }
  }
  const sorted = [...cells.values()].sort((a, b) => a.j - b.j || a.i - b.i || a.k - b.k);
  let reach = 0;
  let height = 0;
  for (const c of sorted) {
    reach = Math.max(reach, -c.i, c.i + 1, -c.k, c.k + 1);
    height = Math.max(height, c.j + 1);
  }
  const voxelSize = ANEMONE_VOXEL_SIZE * scale;
  return {
    voxelSize,
    tentacles: strand,
    phase: rng.next() * Math.PI * 2,
    amplitude: TENTACLE_SWAY_RATIO * TENTACLE_LENGTH.max * voxelSize,
    reach,
    height,
    cells: sorted,
  };
}

/** Cases (i, k) d'un disque de rayon `radius` voxels centré sur l'axe (centres des cases). */
function discCells(radius: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = -radius; i < radius; i++) {
    for (let k = -radius; k < radius; k++) {
      if ((i + 0.5) ** 2 + (k + 0.5) ** 2 <= radius * radius) {
        out.push([i, k]);
      }
    }
  }
  return out;
}

/** Altitude de la base du pied (repère du bac) : sur le sable, légèrement enfoncée. */
export function anemoneBaseY(voxelSize: number): number {
  return SAND_THICKNESS - ANEMONE_SINK_RATIO * voxelSize;
}

/**
 * Hauteur relative de l'ondulation d'un point de l'anémone d'altitude locale `y` (mètres,
 * 0 à la base) : 0 sur tout le pied (immobile), puis de 0 à 1 le long d'un tentacule de
 * longueur maximale.
 */
export function tentacleHeight(model: AnemoneModel, y: number): number {
  const h = (y / model.voxelSize - COLUMN_HEIGHT) / TENTACLE_LENGTH.max;
  return h > 0 ? (h < 1 ? h : 1) : 0;
}

/**
 * Écrit dans `out` le déplacement horizontal d'un point de tentacule `strand` de hauteur
 * relative `h` (`tentacleHeight`) au temps simulé `time` : l'ondulation des plantes
 * (`plantSway`, ADR 0016), déphasée d'un tentacule à l'autre. Nul sur le pied (h = 0).
 */
export function tentacleSway(
  model: AnemoneModel,
  strand: number,
  h: number,
  time: number,
  out: SwayOffset,
): SwayOffset {
  return plantSway(h, time, model.phase + TENTACLE_PHASE_STEP * strand, model.amplitude, out);
}

/** Emprise au sol (repère du bac) d'une anémone, tentacules au repos compris. */
export function anemoneFootprint(
  model: AnemoneModel,
  x: number,
  z: number,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const r = model.reach * model.voxelSize;
  return { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r };
}

/**
 * Boîte d'obstacle d'une anémone : le pied seul, au repos, identifiant `id`. Ne dépend pas
 * du temps : l'ondulation des tentacules ne la change jamais.
 */
export function anemoneBox(anemone: Anemone, id: number): BoxObstacle {
  const model = anemoneModel(anemone.seed, anemone.scale);
  const half = COLUMN_RADIUS * model.voxelSize;
  const halfY = (COLUMN_HEIGHT * model.voxelSize) / 2;
  return {
    id,
    shape: 'box',
    x: anemone.x,
    y: anemoneBaseY(model.voxelSize) + halfY,
    z: anemone.z,
    halfX: half,
    halfY,
    halfZ: half,
  };
}

/** Obstacles des anémones, identifiants consécutifs à partir de `firstId`, dans l'ordre. */
export function anemoneObstacles(anemones: readonly Anemone[], firstId = 0): BoxObstacle[] {
  return anemones.map((anemone, n) => anemoneBox(anemone, firstId + n));
}

/** Point d'attache d'une anémone pour les poissons-clowns (repère du bac, mètres). */
export interface AnemoneHome {
  readonly x: number;
  /** Au-dessus du tapis de tentacules : là où les poissons-clowns tournent. */
  readonly hoverY: number;
  /** Parmi les tentacules : refuge. */
  readonly refugeY: number;
  readonly z: number;
}

/** Hauteur de nage au-dessus des tentacules, en mètres (approximation de jeu). */
export const HOVER_CLEARANCE = 0.03;

/** Points d'attache des anémones (dans l'ordre de la disposition). */
export function anemoneHomes(anemones: readonly Anemone[]): AnemoneHome[] {
  return anemones.map((anemone) => {
    const model = anemoneModel(anemone.seed, anemone.scale);
    const base = anemoneBaseY(model.voxelSize);
    const top = base + model.height * model.voxelSize;
    return {
      x: anemone.x,
      z: anemone.z,
      hoverY: top + HOVER_CLEARANCE,
      refugeY: base + (COLUMN_HEIGHT + TENTACLE_LENGTH.min) * model.voxelSize,
    };
  });
}

/**
 * Jeu laissé libre autour d'une anémone, au-delà de ses tentacules, en mètres : les coraux
 * n'y poussent pas, pour que les poissons-clowns puissent y tourner sans que l'évitement
 * d'une colonie voisine ne les entraîne au loin (approximation de jeu).
 */
export const ANEMONE_CLEARING = 0.06;

/**
 * Emprises au sol que les coraux évitent : celle de chaque anémone (tentacules au repos
 * compris), élargie de `ANEMONE_CLEARING`.
 */
export function anemoneFootprints(anemones: readonly Anemone[]): Rect[] {
  return anemones.map((a) => {
    const f = anemoneFootprint(anemoneModel(a.seed, a.scale), a.x, a.z);
    const c = ANEMONE_CLEARING;
    return { minX: f.minX - c, maxX: f.maxX + c, minZ: f.minZ - c, maxZ: f.maxZ + c };
  });
}

/**
 * Disposition des anémones pour la graine `seed` sur le sol du bac `dims`, autour du décor
 * `decor` : nombre, échelles et positions, déterministes. Les anémones sont posées **avant**
 * les coraux, qui les évitent (`coralLayout`, `keepOut`) : le sol libre ne manque jamais aux
 * poissons-clowns. Chaque anémone (tentacules compris) tient dans le sol rétréci de
 * `ANEMONE_EDGE_MARGIN`, à `ANEMONE_GAP` au moins des rochers et des autres anémones ; elle
 * est placée au plus `ANEMONE_ATTEMPTS` fois, puis omise. `settings` nul : aucune anémone.
 * @throws RangeError si la graine ou le réglage est invalide.
 */
export function anemoneLayout(
  seed: number,
  dims: TankDimensions,
  settings: AnemoneSettings | null,
  decor: readonly DecorItem[] = [],
): Anemone[] {
  assertSeed(seed);
  if (settings === null) {
    return [];
  }
  assertAnemoneSettings(settings);
  const rng = createPrng(deriveSeed(seed, ANEMONE_STREAM));
  const rocks = decorObstacles(decor).flatMap((o) => o.spheres);
  const placed: Rect[] = [];
  const target =
    settings.count.min + Math.floor(rng.next() * (settings.count.max - settings.count.min + 1));
  const halfW = dims.width / 2 - ANEMONE_EDGE_MARGIN;
  const halfD = dims.depth / 2 - ANEMONE_EDGE_MARGIN;
  const anemones: Anemone[] = [];
  for (let n = 0; n < target; n++) {
    const scale = settings.scale.min + (settings.scale.max - settings.scale.min) * rng.next();
    const shapeSeed = Math.floor(rng.next() * (MAX_SEED + 1));
    const model = anemoneModel(shapeSeed, scale);
    for (let attempt = 0; attempt < ANEMONE_ATTEMPTS; attempt++) {
      const x = (2 * rng.next() - 1) * halfW;
      const z = (2 * rng.next() - 1) * halfD;
      const f = anemoneFootprint(model, x, z);
      const fits =
        f.minX >= -halfW &&
        f.maxX <= halfW &&
        f.minZ >= -halfD &&
        f.maxZ <= halfD &&
        placed.every((o) => rectGap(f, o) >= ANEMONE_GAP) &&
        rocks.every((s) => rectCircleGap(f, s.x, s.z, s.radius) >= ANEMONE_GAP);
      if (fits) {
        placed.push(f);
        anemones.push({ id: anemones.length, x, z, scale, seed: shapeSeed });
        break;
      }
    }
  }
  return anemones;
}
