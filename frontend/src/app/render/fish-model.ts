import { BufferAttribute, BufferGeometry, Color } from 'three';

import type { SpeciesColors, SpeciesDefinition } from '../sim/species';

/**
 * Modèles voxel des poissons, générés par le code à partir des définitions d'espèces
 * (docs/ARCHITECTURE.md, « Modèles »). Aucun fichier 3D externe.
 *
 * Un gabarit est une vue de profil : une chaîne par rangée de voxels, de haut en bas, et un
 * caractère par colonne, de la queue (à gauche) vers la tête (à droite). Chaque caractère
 * désigne un rôle de couleur de l'espèce ; `.` est vide. Le modèle est extrudé sur
 * `depth` voxels selon Z. Repère du modèle : tête vers +X, dos vers +Y.
 */
export interface FishTemplate {
  /** Corps, centré sur l'origine. */
  readonly body: readonly string[];
  /** Nageoire caudale ; son bord droit s'accroche à l'arrière du corps (pivot de la queue). */
  readonly tail: readonly string[];
  /** Épaisseur du corps, en voxels. */
  readonly bodyDepth: number;
  /** Épaisseur de la queue, en voxels. */
  readonly tailDepth: number;
}

/** Rôles de couleur des gabarits. */
const ROLES: Readonly<Record<string, keyof SpeciesColors>> = {
  s: 'stripe',
  a: 'accent',
  k: 'back',
  b: 'belly',
  f: 'fin',
  e: 'eye',
};

/**
 * Silhouette de petit poisson fusiforme (néon) : dos sombre, bande latérale du museau au
 * pédoncule, bande d'accent sur l'arrière du ventre, avant du ventre clair.
 */
export const SLENDER_FISH: FishTemplate = {
  body: [
    // queue → tête
    '..kkkkkk..',
    'sssssssses',
    'aaaaaabbb.',
    '..aaabb...',
  ],
  tail: ['f.', 'ff', 'ff', 'f.'],
  bodyDepth: 2,
  tailDepth: 1,
};

/** Proportions des voxels : hauteur et épaisseur relatives à la longueur d'un voxel. */
const VOXEL_HEIGHT_RATIO = 0.75;
const VOXEL_DEPTH_RATIO = 0.7;

/** Données brutes d'un maillage voxel (non indexé), testables sans WebGL. */
export interface VoxelMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Couleurs par sommet, en espace linéaire (convention Three.js). */
  readonly colors: Float32Array;
  /** Nombre de faces carrées émises. */
  readonly quads: number;
}

export interface VoxelSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Taille d'un voxel du modèle d'une espèce (la longueur du corps couvre ses colonnes). */
export function voxelSize(
  def: SpeciesDefinition,
  template: FishTemplate = SLENDER_FISH,
): VoxelSize {
  const x = def.bodyLength / templateWidth(template.body);
  return { x, y: x * VOXEL_HEIGHT_RATIO, z: x * VOXEL_DEPTH_RATIO };
}

/** Longueur du corps du modèle, en mètres (distance du centre au pivot de la queue × 2). */
export function modelBodyLength(
  def: SpeciesDefinition,
  template: FishTemplate = SLENDER_FISH,
): number {
  return voxelSize(def, template).x * templateWidth(template.body);
}

/**
 * Maillage voxel d'un gabarit de profil. Seules les faces dont le voisin est vide sont
 * émises. `anchor` fixe l'origine : `'center'` centre le gabarit, `'right'` place
 * l'origine au milieu de son bord droit (pivot de la queue).
 * @throws Error si un caractère du gabarit n'a pas de rôle ou si les rangées sont inégales.
 */
export function buildVoxelMesh(
  rows: readonly string[],
  depth: number,
  colors: SpeciesColors,
  size: VoxelSize,
  anchor: 'center' | 'right',
): VoxelMeshData {
  const width = templateWidth(rows);
  const height = rows.length;
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error(`Épaisseur de gabarit invalide : ${depth}`);
  }
  const linear = new Map<string, [number, number, number]>();
  for (const [char, role] of Object.entries(ROLES)) {
    const c = new Color(colors[role]);
    linear.set(char, [c.r, c.g, c.b]);
  }
  const filled = (col: number, row: number, layer: number): boolean =>
    col >= 0 &&
    col < width &&
    row >= 0 &&
    row < height &&
    layer >= 0 &&
    layer < depth &&
    rows[row][col] !== '.';

  const originX = anchor === 'center' ? -width / 2 : -width;
  const positions: number[] = [];
  const normals: number[] = [];
  const vertexColors: number[] = [];
  let quads = 0;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const char = rows[row][col];
      if (char === '.') {
        continue;
      }
      const color = linear.get(char);
      if (!color) {
        throw new Error(`Caractère de gabarit sans rôle de couleur : « ${char} »`);
      }
      for (let layer = 0; layer < depth; layer++) {
        // Coin minimal du voxel, en unités de voxel ; la rangée 0 est en haut.
        const x0 = originX + col;
        const y0 = height / 2 - row - 1;
        const z0 = -depth / 2 + layer;
        for (const face of FACES) {
          if (filled(col + face.dc, row - face.dy, layer + face.dz)) {
            continue;
          }
          quads++;
          for (const corner of face.corners) {
            positions.push(
              (x0 + corner[0]) * size.x,
              (y0 + corner[1]) * size.y,
              (z0 + corner[2]) * size.z,
            );
            normals.push(face.normal[0], face.normal[1], face.normal[2]);
            vertexColors.push(color[0], color[1], color[2]);
          }
        }
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(vertexColors),
    quads,
  };
}

/** Géométrie Three.js du corps ou de la queue d'une espèce. */
export function createFishGeometry(
  def: SpeciesDefinition,
  part: 'body' | 'tail',
  template: FishTemplate = SLENDER_FISH,
): BufferGeometry {
  const size = voxelSize(def, template);
  const data =
    part === 'body'
      ? buildVoxelMesh(template.body, template.bodyDepth, def.colors, size, 'center')
      : buildVoxelMesh(template.tail, template.tailDepth, def.colors, size, 'right');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(data.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function templateWidth(rows: readonly string[]): number {
  if (rows.length === 0) {
    throw new Error('Gabarit vide');
  }
  const width = rows[0].length;
  if (width === 0 || rows.some((r) => r.length !== width)) {
    throw new Error('Les rangées du gabarit doivent avoir la même longueur, non nulle');
  }
  return width;
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
