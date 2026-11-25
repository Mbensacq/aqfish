import { createPrng, deriveSeed } from '../core/random/prng';

/**
 * Plantes voxel du décor (issue #49, ADR 0016) : modèle généré depuis une graine, pur et
 * déterministe, sans Three.js (ADR 0003).
 *
 * Trois formes : `tall` (deux à quatre longues tiges serrées, portant des feuilles courtes
 * alternées), `tuft` (touffe basse de brins qui s'écartent) et `floating` (radeau de salvinia
 * posé à la surface, issue #824, ADR 0178 : frondes de feuilles plates sur une rangée,
 * racines courtes en dessous, sans ondulation). Le modèle est donné au repos ;
 * l'ondulation (`sim/plant-sway.ts`) est appliquée par le rendu à partir du temps simulé.
 * La forme de collision (`plantCollision`) couvre les tiges seules, élargies de la borne
 * de l'ondulation : le feuillage reste traversable.
 */

export const PLANT_FORMS = ['tall', 'tuft', 'floating'] as const;
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

/**
 * Rangée des feuilles d'une plante flottante, en voxels au-dessus de sa base : les rangées du
 * dessous portent ses racines (issue #824).
 */
export const FLOATING_LEAF_ROW = 2;

/** Rayon du disque où se tirent les frondes d'une plante flottante, en voxels. */
export const FLOATING_RAFT_RADIUS = 7;

/** Nombre de frondes d'une plante flottante : de `min` à `max`, tiré de sa graine. */
export const FLOATING_FRONDS = { min: 7, max: 11 } as const;

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

/** Sel du sous-générateur des feuilles de la pousse d'une tige (issue #477). */
const GROWTH_LEAF_SALT = 0x9e77;

/**
 * Modèle voxel d'une plante tiré de sa graine (même graine, même forme, même phase).
 *
 * `growth` (issue #477, `sim/plant-growth.ts`) : pousse en voxels entiers, ajoutée au haut de
 * chaque tige d'une plante `tall` (sans effet sur une touffe). Le bas de la plante est tiré
 * exactement comme sans pousse (mêmes tirages, dans le même ordre) : à `growth = 0`, le
 * modèle est celui d'avant, à l'octet ; la pousse porte ses propres feuilles, tirées d'un
 * sous-générateur par tige, donc une plante qui grandit garde ses feuilles d'en dessous.
 * @throws RangeError si la forme est inconnue, si l'échelle n'est pas un réel > 0 ou si la
 * pousse n'est pas un entier positif ou nul.
 */
export function plantModel(seed: number, scale: number, form: PlantForm, growth = 0): PlantModel {
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new RangeError(`scale doit être un réel strictement positif (reçu : ${scale})`);
  }
  if (!Number.isInteger(growth) || growth < 0) {
    throw new RangeError(`growth doit être un entier positif ou nul (reçu : ${growth})`);
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
  if (form === 'floating') {
    strands = addFloatingRaft(() => rng.next(), add);
  } else if (form === 'tall') {
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
    const extra = growth;
    stems.forEach((stem, s) => {
      const top = stem.height + extra;
      for (let j = 0; j < top; j++) {
        add({ i: stem.x, j, k: stem.z, part: 'stem', strand: s, tip: j === top - 1 });
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
      // Pousse (issue #477) : feuilles courtes, à la suite de celles d'origine.
      if (extra > 0) {
        const grow = createPrng(deriveSeed(seed, GROWTH_LEAF_SALT + s));
        const top = stem.height + extra;
        for (let j = stem.height + 1; j < top - 2; j += 3 + Math.floor(grow.next() * 2)) {
          const [dx, dz] = DIRECTIONS[dir % 4];
          dir += 1 + Math.floor(grow.next() * 2);
          for (let n = 1; n <= 2; n++) {
            add({
              i: stem.x + dx * n,
              j: j + Math.floor(n / 2),
              k: stem.z + dz * n,
              part: 'leaf',
              strand: s,
              tip: n === 2,
            });
          }
        }
      }
    });
  } else {
    strands = addTuft(() => rng.next(), add);
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
    // Une plante flottante n'ondule pas : elle dérive avec la surface (hors périmètre, #824).
    amplitude: form === 'floating' ? 0 : PLANT_SWAY_RATIO * height * voxelSize,
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
 * `floating` : sans tige non plus, la même petite sphère, au bout de la racine du centre du
 * radeau (sous la surface) ; les feuilles restent traversables.
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

/**
 * Touffe : six à neuf brins qui partent du collet et s'écartent en montant. Mêmes tirages, dans
 * le même ordre, qu'avant l'extraction de cette fonction. Renvoie le nombre de brins.
 */
function addTuft(next: () => number, add: (cell: PlantCell) => void): number {
  const strands = 6 + Math.floor(next() * 4);
  for (let b = 0; b < strands; b++) {
    const angle = (2 * Math.PI * b) / strands + next() * 0.6;
    const reach = next() * 1.5;
    const bladeHeight = 6 + Math.floor(next() * 7);
    const lean = 0.3 + next() * 0.2;
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
  return strands;
}

/**
 * Radeau d'une plante flottante (issue #824) : frondes tirées dans un disque de rayon
 * `FLOATING_RAFT_RADIUS`, la première au centre ; chacune est un carré de 3 × 3 feuilles sur
 * la rangée `FLOATING_LEAF_ROW` (bout clair au milieu de chaque feuille, de part et d'autre du
 * rhizome) et une racine qui pend jusqu'à la base. Renvoie le nombre de frondes.
 */
function addFloatingRaft(next: () => number, add: (cell: PlantCell) => void): number {
  const fronds =
    FLOATING_FRONDS.min + Math.floor(next() * (FLOATING_FRONDS.max - FLOATING_FRONDS.min + 1));
  for (let f = 0; f < fronds; f++) {
    const angle = next() * 2 * Math.PI;
    const d = f === 0 ? 0 : Math.sqrt(next()) * FLOATING_RAFT_RADIUS;
    const ci = Math.round(Math.cos(angle) * d);
    const ck = Math.round(Math.sin(angle) * d);
    const alongI = next() < 0.5;
    for (let u = -1; u <= 1; u++) {
      for (let p = -1; p <= 1; p++) {
        add({
          i: ci + (alongI ? u : p),
          j: FLOATING_LEAF_ROW,
          k: ck + (alongI ? p : u),
          part: 'leaf',
          strand: f,
          tip: u === 0 && p !== 0,
        });
      }
    }
    for (let j = 0; j < FLOATING_LEAF_ROW; j++) {
      add({ i: ci, j, k: ck, part: 'leaf', strand: f, tip: false });
    }
  }
  return fronds;
}

function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let n = out.length - 1; n > 0; n--) {
    const m = Math.floor(next() * (n + 1));
    [out[n], out[m]] = [out[m], out[n]];
  }
  return out;
}
