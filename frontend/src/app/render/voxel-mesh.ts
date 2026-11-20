import type { VoxelSize } from './fish-model';

/**
 * Construction des maillages voxel (`buildVoxelMesh`, `render/fish-model.ts`) : grille d'un
 * gabarit de profil extrudé, émission des faces visibles et parties paires, rangs de taché
 * (#366) et d'effilochage (#485) par voxel. Découpé de `fish-model.ts` (#698).
 */

/** Rang d'effilochage d'un voxel qui n'est pas une nageoire : jamais effiloché. */
export const UNFRAYED_RANK = 1;

/** Part du rang d'effilochage de la caudale donnée par la distance au corps (le reste : hasard). */
const FRAY_TAIL_DISTANCE = 0.4;
/** Rang minimal d'un voxel de nageoire du corps : la caudale s'effiloche avant les autres. */
const FRAY_BODY_MIN = 0.3;

/**
 * Rang d'effilochage d'un voxel (issue #485), dans [0, 1] : un poisson aux nageoires
 * effilochées d'intensité `a` perd les voxels de rang inférieur à `a × FIN_ROT_LOSS_SHARE` et
 * pâlit ceux juste au-dessus (`render/fish-layer.ts`). Caudale (`tail`) : le bout (colonne 0,
 * loin du corps) d'abord, mêlé d'un hachage pour un bord irrégulier. Corps : seuls les voxels
 * de nageoire (`f`) au bord du profil s'effilochent, après la caudale ; les autres jamais
 * (`UNFRAYED_RANK`), pour ne pas trouer le corps.
 */
export function voxelFrayRank(
  part: 'body' | 'tail',
  rows: readonly string[],
  col: number,
  row: number,
  layer: number,
): number {
  const noise = voxelSpotRank(col + 101, row + 37, layer + 7);
  const width = rows[0].length;
  if (part === 'tail') {
    return FRAY_TAIL_DISTANCE * (col / width) + (1 - FRAY_TAIL_DISTANCE) * noise;
  }
  if (rows[row][col] !== 'f') {
    return UNFRAYED_RANK;
  }
  const empty = (c: number, r: number): boolean =>
    c < 0 || c >= width || r < 0 || r >= rows.length || rows[r][c] === '.';
  const edge =
    empty(col - 1, row) || empty(col + 1, row) || empty(col, row - 1) || empty(col, row + 1);
  return edge ? FRAY_BODY_MIN + (1 - FRAY_BODY_MIN) * noise : UNFRAYED_RANK;
}

/**
 * Rang de taché d'un voxel (issue #366), dans [0, 1) : hachage entier sans état de ses
 * coordonnées dans le gabarit. Un poisson aux points blancs d'intensité `a` blanchit les
 * voxels de rang inférieur à `a × ICH_SPOT_SHARE` (`render/fish-layer.ts`) : les mêmes voxels
 * d'une image à l'autre, de plus en plus nombreux quand la maladie s'aggrave.
 */
export function voxelSpotRank(col: number, row: number, layer: number): number {
  let h = Math.imul(col | 0, 0x27d4eb2d) ^ Math.imul(row | 0, 0x165667b1);
  h = Math.imul(h ^ Math.imul(layer | 0, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Rang de taché d'un voxel trop pâle : jamais sous `intensité × ICH_SPOT_SHARE` (au plus
 * 1 × `ICH_SPOT_SHARE` < 1, vérifié par `fish-layer.spec.ts`).
 */
export const UNSPOTTED_RANK = 1;

/** Gabarit de profil extrudé : rangées, dimensions et couches remplies de chaque colonne. */
export interface VoxelGrid {
  readonly rows: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  /** Première et dernière couche (exclue) remplies dans chaque colonne. */
  readonly layerStart: readonly number[];
  readonly layerEnd: readonly number[];
  /** Abscisse du coin gauche du gabarit, en unités de voxel (`anchor`). */
  readonly originX: number;
}

/** Couleurs linéaires des rôles du gabarit, et caractères trop pâles pour un point blanc. */
export interface RoleColors {
  readonly linear: ReadonlyMap<string, readonly [number, number, number]>;
  /** Rôles de couleur trop pâles pour qu'un point blanc s'y voie (issue #370). */
  readonly pale: ReadonlySet<string>;
}

/** Tampons du maillage en construction (`buildVoxelMesh`). */
export interface MeshBuffers {
  readonly positions: number[];
  readonly normals: number[];
  readonly colors: number[];
  readonly spots: number[];
  readonly frays: number[];
  quads: number;
}

/** Un voxel à émettre : position dans le gabarit, couleur linéaire et rangs par sommet. */
export interface Voxel {
  readonly col: number;
  readonly row: number;
  readonly layer: number;
  readonly color: readonly [number, number, number];
  readonly spot: number;
  readonly fray: number;
}

/**
 * Grille d'un gabarit : couches remplies de chaque colonne, centrées (`columnDepths`, sinon
 * `depth` partout).
 * @throws Error si l'épaisseur d'une colonne est invalide (hors de [1, depth], parité).
 */
export function voxelGrid(
  rows: readonly string[],
  depth: number,
  columnDepths: readonly number[] | undefined,
  anchor: 'center' | 'right',
): VoxelGrid {
  const width = rows[0].length;
  const layerStart: number[] = [];
  const layerEnd: number[] = [];
  for (let col = 0; col < width; col++) {
    const d = columnDepths ? columnDepths[col] : depth;
    if (!Number.isInteger(d) || d < 1 || d > depth || (depth - d) % 2 !== 0) {
      throw new Error(`Épaisseur de colonne invalide (colonne ${col}) : ${d}`);
    }
    layerStart.push((depth - d) / 2);
    layerEnd.push((depth + d) / 2);
  }
  const originX = anchor === 'center' ? -width / 2 : -width;
  return { rows, width, height: rows.length, depth, layerStart, layerEnd, originX };
}

/** Rang de taché d'un voxel de rôle `char` (`UNSPOTTED_RANK` pour un rôle trop pâle). */
export function spotRankOf(
  roles: RoleColors,
  char: string,
  col: number,
  row: number,
  layer: number,
): number {
  return roles.pale.has(char) ? UNSPOTTED_RANK : voxelSpotRank(col, row, layer);
}

/** Vrai si le voxel (`col`, `row`, `layer`) du corps est plein (hors du gabarit : vide). */
export function isFilled(grid: VoxelGrid, col: number, row: number, layer: number): boolean {
  return (
    col >= 0 &&
    col < grid.width &&
    row >= 0 &&
    row < grid.height &&
    layer >= grid.layerStart[col] &&
    layer < grid.layerEnd[col] &&
    grid.rows[row][col] !== '.'
  );
}

/**
 * Émet les voxels du corps, rangée par rangée puis colonne par colonne et couche par couche.
 * @throws Error si un caractère du gabarit n'a pas de rôle de couleur.
 */
export function emitBodyVoxels(
  out: MeshBuffers,
  grid: VoxelGrid,
  roles: RoleColors,
  size: VoxelSize,
  part: 'body' | 'tail',
): void {
  const filled = (col: number, row: number, layer: number): boolean =>
    isFilled(grid, col, row, layer);
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const char = grid.rows[row][col];
      if (char === '.') {
        continue;
      }
      const color = roles.linear.get(char);
      if (!color) {
        throw new Error(`Caractère de gabarit sans rôle de couleur : « ${char} »`);
      }
      for (let layer = grid.layerStart[col]; layer < grid.layerEnd[col]; layer++) {
        const spot = spotRankOf(roles, char, col, row, layer);
        const fray = voxelFrayRank(part, grid.rows, col, row, layer);
        emitVoxel(out, grid, size, { col, row, layer, color, spot, fray }, filled);
      }
    }
  }
}

/**
 * Voxels des parties paires (nageoires pectorales…), de part et d'autre du corps à la
 * distance de leur couche, par clé `col,row,layer`.
 * @throws Error si une couche n'a pas les dimensions du corps ou si un caractère n'a pas de
 * rôle de couleur.
 */
export function pairedVoxelMap(
  grid: VoxelGrid,
  paired: readonly (readonly string[])[],
  roles: RoleColors,
): Map<string, string> {
  const voxels = new Map<string, string>();
  paired.forEach((layerRows, distance) => {
    if (layerRows.length !== grid.height || layerRows.some((r) => r.length !== grid.width)) {
      throw new Error('Les couches paires doivent avoir les dimensions du corps');
    }
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const char = layerRows[row][col];
        if (char === '.') {
          continue;
        }
        if (!roles.linear.has(char)) {
          throw new Error(`Caractère de gabarit sans rôle de couleur : « ${char} »`);
        }
        voxels.set(`${col},${row},${grid.layerEnd[col] + distance}`, char);
        voxels.set(`${col},${row},${grid.layerStart[col] - 1 - distance}`, char);
      }
    }
  });
  return voxels;
}

/** Émet les faces du voxel `voxel` dont le voisin n'est pas `occupied`. */
export function emitVoxel(
  out: MeshBuffers,
  grid: VoxelGrid,
  size: VoxelSize,
  voxel: Voxel,
  occupied: (col: number, row: number, layer: number) => boolean,
): void {
  const { col, row, layer, color } = voxel;
  // Coin minimal du voxel, en unités de voxel ; la rangée 0 est en haut.
  const x0 = grid.originX + col;
  const y0 = grid.height / 2 - row - 1;
  const z0 = -grid.depth / 2 + layer;
  for (const face of FACES) {
    if (occupied(col + face.dc, row - face.dy, layer + face.dz)) {
      continue;
    }
    out.quads++;
    for (const corner of face.corners) {
      out.positions.push(
        (x0 + corner[0]) * size.x,
        (y0 + corner[1]) * size.y,
        (z0 + corner[2]) * size.z,
      );
      out.normals.push(face.normal[0], face.normal[1], face.normal[2]);
      out.colors.push(color[0], color[1], color[2]);
      out.spots.push(voxel.spot);
      out.frays.push(voxel.fray);
    }
  }
}

type Corner = readonly [number, number, number];

interface Face {
  /** Décalage du voisin : colonne (+X), rangée vers le haut (+Y), couche (+Z). */
  readonly dc: number;
  readonly dy: number;
  readonly dz: number;
  readonly normal: Corner;
  /** Deux triangles, sens antihoraire vu depuis l'extérieur. */
  readonly corners: readonly Corner[];
}

function quad(a: Corner, b: Corner, c: Corner, d: Corner): Corner[] {
  return [a, b, c, a, c, d];
}

const FACES: readonly Face[] = [
  {
    dc: 1,
    dy: 0,
    dz: 0,
    normal: [1, 0, 0],
    corners: quad([1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]),
  },
  {
    dc: -1,
    dy: 0,
    dz: 0,
    normal: [-1, 0, 0],
    corners: quad([0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]),
  },
  {
    dc: 0,
    dy: 1,
    dz: 0,
    normal: [0, 1, 0],
    corners: quad([0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]),
  },
  {
    dc: 0,
    dy: -1,
    dz: 0,
    normal: [0, -1, 0],
    corners: quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]),
  },
  {
    dc: 0,
    dy: 0,
    dz: 1,
    normal: [0, 0, 1],
    corners: quad([0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]),
  },
  {
    dc: 0,
    dy: 0,
    dz: -1,
    normal: [0, 0, -1],
    corners: quad([1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]),
  },
];
