import { createPrng } from '../core/random/prng';

/**
 * Plantes voxel du décor (issue #49, ADR 0016) : modèle généré depuis une graine, pur et
 * déterministe, sans Three.js (ADR 0003).
 *
 * Deux formes : `tall` (deux à quatre longues tiges serrées, portant des feuilles courtes
 * alternées) et `tuft` (touffe basse de brins qui s'écartent). Le modèle est donné au repos ;
 * l'ondulation (`sim/plant-sway.ts`) est appliquée par le rendu à partir du temps simulé.
 * La forme de collision (`plantCollision`) couvre les tiges seules, élargies de la borne
 * de l'ondulation : le feuillage reste traversable.
 */

export const PLANT_FORMS = ['tall', 'tuft'] as const;
export type PlantForm = (typeof PLANT_FORMS)[number];

/** Arête d'un voxel de plante à l'échelle 1, en mètres (plus fin qu'un rocher). */
export const PLANT_VOXEL_SIZE = 0.008;

/** Profondeur de la racine sous la surface du sable, en voxels. */
export const PLANT_SINK_VOXELS = 1;

/** Amplitude de l'ondulation à la pointe, en fraction de la hauteur de la plante. */
export const PLANT_SWAY_RATIO = 0.06;

/** Écart vertical entre deux sphères de collision d'une tige, en voxels. */
export const STEM_SPHERE_SPACING = 2;

/** Rayon de la sphère de collet d'une touffe, en voxels. */
export const TUFT_COLLAR_RADIUS = 2;

/** Voxel plein d'une plante : indices entiers, le voxel occupe [i, i + 1] × [j, j + 1] × [k, k + 1]. */
export interface PlantCell {
  readonly i: number;
  readonly j: number;
  readonly k: number;
  /** Tige (porteuse, avec collision) ou feuillage (traversable). */
  readonly part: 'stem' | 'leaf';
  /** Indice de la tige ou du brin auquel le voxel appartient (phase propre au rendu). */
  readonly strand: number;
  /** Bout d'une tige, d'une feuille ou d'un brin (couleur plus claire). */
  readonly tip: boolean;
}

/** Sphère de collision dans le repère local de la plante, en voxels (Y = 0 à la racine). */
export interface PlantSphere {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
}

/** Modèle d'une plante, dans son repère local (avant rotation et translation). */
export interface PlantModel {
  readonly form: PlantForm;
  /** Arête d'un voxel, en mètres (`PLANT_VOXEL_SIZE · scale`). */
  readonly voxelSize: number;
  /** Hauteur en voxels (plus grand `j` + 1), référence de la hauteur relative de l'ondulation. */
  readonly height: number;
  /** Nombre de tiges (`tall`) ou de brins (`tuft`). */
  readonly strands: number;
  /** Phase de l'ondulation, dans [0, 2π). */
  readonly phase: number;
  /** Amplitude de l'ondulation à la pointe, en mètres. */
  readonly amplitude: number;
  /** Voxels pleins, triés par (j, i, k), sans doublon ; `j ≥ 0`. */
  readonly cells: readonly PlantCell[];
}

/** Décalage de phase entre deux tiges ou brins voisins d'une même plante, en radians. */
export const STRAND_PHASE_STEP = 0.7;

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * Modèle voxel d'une plante tiré de sa graine (même graine, même forme, même phase).
 * @throws RangeError si la forme est inconnue ou si l'échelle n'est pas un réel > 0.
 */
export function plantModel(seed: number, scale: number, form: PlantForm): PlantModel {
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new RangeError(`scale doit être un réel strictement positif (reçu : ${scale})`);
  }
  if (!(PLANT_FORMS as readonly unknown[]).includes(form)) {
    throw new RangeError(`forme de plante inconnue : ${String(form)}`);
  }
  const rng = createPrng(seed);
  const phase = rng.next() * 2 * Math.PI;
  const cells = new Map<string, PlantCell>();
  const add = (cell: PlantCell): void => {
    const key = `${cell.i},${cell.j},${cell.k}`;
    if (!cells.has(key)) {
      cells.set(key, cell);
    }
  };
  let strands: number;
  if (form === 'tall') {
    strands = 2 + Math.floor(rng.next() * 3);
    const spots = shuffled(
      [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((z) => [x, z] as const)),
      () => rng.next(),
    );
    // Les tiges d'abord : une feuille ne prend jamais la place d'une tige.
    const stems = spots.slice(0, strands).map(([x, z]) => ({
      x,
      z,
      height: 30 + Math.floor(rng.next() * 16),
      dir: Math.floor(rng.next() * 4),
    }));
    stems.forEach((stem, s) => {
      for (let j = 0; j < stem.height; j++) {
        add({ i: stem.x, j, k: stem.z, part: 'stem', strand: s, tip: j === stem.height - 1 });
      }
    });
    stems.forEach((stem, s) => {
      let dir = stem.dir;
      for (let j = 4; j < stem.height - 2; j += 3 + Math.floor(rng.next() * 2)) {
        const [dx, dz] = DIRECTIONS[dir % 4];
        dir += 1 + Math.floor(rng.next() * 2);
        const length = j > stem.height * 0.75 ? 2 : 3 + Math.floor(rng.next() * 2);
        for (let n = 1; n <= length; n++) {
          add({
            i: stem.x + dx * n,
            j: j + Math.floor(n / 2),
            k: stem.z + dz * n,
            part: 'leaf',
            strand: s,
            tip: n === length,
          });
        }
      }
    });
  } else {
    strands = 6 + Math.floor(rng.next() * 4);
    for (let b = 0; b < strands; b++) {
      const angle = (2 * Math.PI * b) / strands + rng.next() * 0.6;
      const reach = rng.next() * 1.5;
      const bladeHeight = 6 + Math.floor(rng.next() * 7);
      const lean = 0.3 + rng.next() * 0.2;
      for (let j = 0; j < bladeHeight; j++) {
        const d = reach + j * lean;
        add({
          i: Math.round(Math.cos(angle) * d),
          j,
          k: Math.round(Math.sin(angle) * d),
          part: 'leaf',
          strand: b,
          tip: j === bladeHeight - 1,
        });
      }
    }
  }
  const sorted = [...cells.values()].sort((a, b) => a.j - b.j || a.i - b.i || a.k - b.k);
  const height = sorted.reduce((h, c) => Math.max(h, c.j + 1), 0);
  const voxelSize = PLANT_VOXEL_SIZE * scale;
  return {
    form,
    voxelSize,
    height,
    strands,
    phase,
    amplitude: PLANT_SWAY_RATIO * height * voxelSize,
    cells: sorted,
  };
}

/**
 * Forme de collision d'une plante, en voxels de son repère local.
 *
 * `tall` : une colonne de sphères sur l'axe des tiges, espacées de `STEM_SPHERE_SPACING`,
 * dont le rayon couvre chaque voxel de tige (coin le plus éloigné de l'axe, demi-écart
 * vertical) **plus** la borne de l'ondulation au haut du tronçon : la tige reste dans sa
 * forme à tout instant, et les sphères ne bougent pas. Les feuilles qui dépassent restent
 * traversables. `tuft` : une seule petite sphère au collet, le feuillage est traversable.
 */
export function plantCollision(model: PlantModel): PlantSphere[] {
  const stems = model.cells.filter((c) => c.part === 'stem' && c.j === 0);
  if (stems.length === 0) {
    return [{ x: 0.5, y: 0, z: 0.5, r: TUFT_COLLAR_RADIUS }];
  }
  const ax = stems.reduce((s, c) => s + c.i + 0.5, 0) / stems.length;
  const az = stems.reduce((s, c) => s + c.k + 0.5, 0) / stems.length;
  let core = 0;
  for (const c of stems) {
    const dx = Math.max(Math.abs(c.i - ax), Math.abs(c.i + 1 - ax));
    const dz = Math.max(Math.abs(c.k - az), Math.abs(c.k + 1 - az));
    core = Math.max(core, Math.hypot(dx, dz));
  }
  const stemTop = model.cells.reduce((h, c) => (c.part === 'stem' ? Math.max(h, c.j + 1) : h), 0);
  const half = STEM_SPHERE_SPACING / 2;
  const swayVoxels = model.amplitude / model.voxelSize;
  const spheres: PlantSphere[] = [];
  for (let y = half; y - half < stemTop; y += STEM_SPHERE_SPACING) {
    const h = Math.min(1, (y + half) / model.height);
    spheres.push({ x: ax, y, z: az, r: Math.hypot(core, half) + swayVoxels * h * h });
  }
  return spheres;
}

function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let n = out.length - 1; n > 0; n--) {
    const m = Math.floor(next() * (n + 1));
    [out[n], out[m]] = [out[m], out[n]];
  }
  return out;
}
