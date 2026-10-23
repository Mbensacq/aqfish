import { assertSeed, createPrng } from '../core/random/prng';

/**
 * Formes des colonies de corail (issue #149, ADR 0040) : modèle voxel d'une colonie tiré de sa
 * graine selon sa forme (branchu, table, dôme). Module pur et déterministe, sans Three.js
 * (ADR 0003) ; la disposition des colonies est dans `sim/corals.ts`.
 */

/** Formes des colonies. */
export const CORAL_FORMS = ['branchu', 'table', 'dome'] as const;
export type CoralForm = (typeof CORAL_FORMS)[number];

/** Arête d'un voxel de corail à l'échelle 1, en mètres. */
export const CORAL_VOXEL_SIZE = 0.012;
/** Bornes de l'échelle d'une colonie. */
export const CORAL_SCALE_LIMITS = { min: 0.5, max: 2 } as const;

/** Voxel plein : occupe [i, i + 1] × [j, j + 1] × [k, k + 1] ; `tip` : bout de branche. */
export interface CoralCell {
  readonly i: number;
  readonly j: number;
  readonly k: number;
  readonly tip: boolean;
}

/** Modèle voxel d'une colonie, dans son repère local (en voxels, Y = 0 à la base). */
export interface CoralModel {
  readonly voxelSize: number;
  /** Voxels pleins, triés par (j, i, k), sans doublon ; `j ≥ 0`. */
  readonly cells: readonly CoralCell[];
  /** Boîte englobante des voxels, en voxels (bornes max exclues des indices). */
  readonly minI: number;
  readonly maxI: number;
  readonly maxJ: number;
  readonly minK: number;
  readonly maxK: number;
}

/**
 * Modèle voxel d'une colonie, tiré de sa graine selon sa forme :
 * - `dome` : demi-ellipsoïde plein, à peine plus large que haut ;
 * - `table` : pied étroit portant un plateau large et mince à rebord ;
 * - `branchu` : socle bas d'où montent 4 à 6 branches fines et penchées, certaines fourchues.
 * @throws RangeError si la graine ou l'échelle est invalide.
 */
export function coralModel(form: CoralForm, seed: number, scale: number): CoralModel {
  assertSeed(seed);
  if (!(scale >= CORAL_SCALE_LIMITS.min && scale <= CORAL_SCALE_LIMITS.max)) {
    throw new RangeError(`échelle de corail invalide : ${scale}`);
  }
  const rng = createPrng(seed);
  const cells = new Map<string, CoralCell>();
  const add = (i: number, j: number, k: number, tip = false): void => {
    const key = `${i},${j},${k}`;
    if (!cells.has(key) || tip) {
      cells.set(key, { i, j, k, tip });
    }
  };
  if (form === 'dome') {
    const r = 4 + rng.next() * 2.5;
    const h = r * (0.85 + rng.next() * 0.2);
    fillEllipsoid(add, r, h, r * (0.85 + rng.next() * 0.15));
  } else if (form === 'table') {
    const stalk = 4 + Math.floor(rng.next() * 3);
    const rx = 6 + rng.next() * 2.5;
    const rz = rx * (0.75 + rng.next() * 0.25);
    for (let j = 0; j < stalk; j++) {
      for (const [i, k] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ] as const)
        add(i, j, k);
    }
    forEachInDisk(rx, rz, (i, k, edge) => {
      add(i, stalk, k);
      if (edge > 0.7) add(i, stalk + 1, k); // rebord relevé
    });
  } else {
    fillEllipsoid(add, 2, 1.5, 2);
    const branches = 4 + Math.floor(rng.next() * 3);
    for (let b = 0; b < branches; b++) {
      const angle = (2 * Math.PI * (b + rng.next() * 0.6)) / branches;
      const start = 0.5 + rng.next() * 1.5;
      const lean = 0.3 + rng.next() * 0.25;
      const height = 7 + Math.floor(rng.next() * 7);
      const fork = rng.next() < 0.5 ? Math.floor(height * (0.4 + rng.next() * 0.3)) : -1;
      growBranch(add, Math.cos(angle) * start, Math.sin(angle) * start, angle, lean, 1, height);
      if (fork > 0) {
        const x = Math.cos(angle) * (start + lean * fork);
        const z = Math.sin(angle) * (start + lean * fork);
        growBranch(add, x, z, angle + 0.9, lean * 1.3, fork, height - 2);
      }
    }
  }
  const sorted = [...cells.values()].sort((a, b) => a.j - b.j || a.i - b.i || a.k - b.k);
  const bound = (pick: (c: CoralCell) => number, max: boolean): number =>
    sorted.reduce(
      (m, c) => (max ? Math.max(m, pick(c) + 1) : Math.min(m, pick(c))),
      max ? -Infinity : Infinity,
    );
  return {
    voxelSize: CORAL_VOXEL_SIZE * scale,
    cells: sorted,
    minI: bound((c) => c.i, false),
    maxI: bound((c) => c.i, true),
    maxJ: bound((c) => c.j, true),
    minK: bound((c) => c.k, false),
    maxK: bound((c) => c.k, true),
  };
}

type AddCell = (i: number, j: number, k: number, tip?: boolean) => void;

/** Demi-ellipsoïde (j ≥ 0) de demi-axes `rx`, `h`, `rz` : voxels dont le centre est dedans. */
function fillEllipsoid(add: AddCell, rx: number, h: number, rz: number): void {
  for (let j = 0; j < Math.ceil(h); j++) {
    const y = (j + 0.5) / h;
    forEachInDisk(
      rx * Math.sqrt(Math.max(0, 1 - y * y)),
      rz * Math.sqrt(Math.max(0, 1 - y * y)),
      (i, k) => add(i, j, k),
    );
  }
}

/** Voxels du disque elliptique centré (centre du voxel dedans) ; `edge` : rayon relatif. */
function forEachInDisk(
  rx: number,
  rz: number,
  visit: (i: number, k: number, edge: number) => void,
): void {
  for (let i = -Math.ceil(rx); i < Math.ceil(rx); i++) {
    for (let k = -Math.ceil(rz); k < Math.ceil(rz); k++) {
      const e = Math.hypot((i + 0.5) / rx, (k + 0.5) / rz);
      if (e <= 1) visit(i, k, e);
    }
  }
}

/** Branche d'un voxel d'épaisseur, penchée vers `angle`, de `from` à `to` (exclu) ; bout marqué. */
function growBranch(
  add: AddCell,
  x0: number,
  z0: number,
  angle: number,
  lean: number,
  from: number,
  to: number,
): void {
  for (let j = from; j < to; j++) {
    const t = j - from;
    add(
      Math.floor(x0 + Math.cos(angle) * lean * t),
      j,
      Math.floor(z0 + Math.sin(angle) * lean * t),
      j === to - 1,
    );
  }
}
