import { BufferAttribute, BufferGeometry, Color } from 'three';

import type {
  SilhouetteId,
  SpeciesColors,
  SpeciesDefinition,
  SpeciesVariant,
} from '../sim/species';

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
  /**
   * Épaisseur du corps par colonne (queue → tête), centrée, pour une silhouette effilée vue
   * de dessus ; absent : `bodyDepth` partout. Chaque valeur est un entier de [1, bodyDepth]
   * de même parité que `bodyDepth`.
   */
  readonly bodyColumnDepths?: readonly number[];
  /**
   * Parties paires (branchies, pattes de l'axolotl, issue #130) : couches de profil, de la
   * plus proche du corps à la plus éloignée, de mêmes dimensions que `body`. Chaque voxel
   * d'une couche `n` est posé des deux côtés du corps, contre la colonne (épaisseur de la
   * colonne, `bodyColumnDepths`) plus `n` voxels : vue de dessus, la partie dépasse du flanc.
   */
  readonly paired?: readonly (readonly string[])[];
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

/**
 * Guppy femelle : corps plus haut et plus long, dos sable sombre, flanc sable, ventre
 * clair avec la tache de gestation sombre (`a`), petite caudale claire.
 */
export const GUPPY_FEMALE_FISH: FishTemplate = {
  body: [
    // queue → tête
    '...kkkkk..',
    '.kkkkkkkk.',
    'ssssssssse',
    '.bbbabbbb.',
    '...bbbb...',
  ],
  tail: ['f.', 'ff', 'ff', 'ff', 'f.'],
  bodyDepth: 2,
  tailDepth: 1,
};

/**
 * Guppy mâle : petit corps gris (`s`) taché de rose (`a`) et d'orange (`f`, couleur de la
 * caudale), grande nageoire caudale en éventail, orange tachée de rose.
 */
export const GUPPY_MALE_FISH: FishTemplate = {
  body: [
    // queue → tête
    '...kkkkk.',
    'fasssasse',
    'ffassbbb.',
    '..fbbb...',
  ],
  tail: ['ff...', 'fff..', 'faff.', 'ffaff', 'faff.', 'fff..', 'ff...'],
  bodyDepth: 2,
  tailDepth: 1,
};

/**
 * Corydora : corps court et haut, plus épais que les autres (3 voxels), ventre plat clair,
 * haute dorsale (`f`), flanc gris taché de noir (`a`), tête massive et arrondie.
 */
export const CORYDORA_FISH: FishTemplate = {
  body: [
    // queue → tête
    '....ff...',
    '...kkkkk.',
    '.kksasskk',
    'sasssasse',
    'ssasssass',
    '.bbbbbbbb',
  ],
  tail: ['f.', 'ff', 'f.', 'ff', 'f.'],
  bodyDepth: 3,
  tailDepth: 1,
};

/**
 * Koï (issue #88) : corps long et large (6 voxels), effilé au pédoncule et au museau vu de
 * dessus (`bodyColumnDepths`). Le dos porte le motif de la robe, lu de dessus : fond (`k`),
 * taches (`a`) et taches secondaires (`s`), dont les couleurs dépendent de la robe
 * (`sim/species.ts`, `KOI`). Large caudale (2 voxels d'épaisseur, visible de dessus).
 */
export const KOI_FISH: FishTemplate = {
  body: [
    // queue → tête
    '..kaaksaakaa.',
    'kskaaksaakaak',
    '.kkbbbbbbbbek',
    '...bbbbbbbb..',
  ],
  tail: ['ff.', 'fff', '.ff', 'fff', 'ff.'],
  bodyDepth: 6,
  tailDepth: 2,
  bodyColumnDepths: [2, 2, 4, 6, 6, 6, 6, 6, 6, 6, 6, 4, 2],
};

/**
 * Axolotl (issue #130) : corps rose, large tête (6 voxels d'épaisseur vue de dessus), crête
 * dorsale le long de l'arrière du corps et longue queue à nageoire. Parties paires : trois
 * branchies de chaque côté de l'arrière de la tête (`a`, rose soutenu), en éventail (vers le
 * haut, vers l'arrière, vers le bas : trois traits distincts de profil), base contre le flanc
 * et pointe un voxel plus loin (vue de dessus) ; quatre pattes (`f`) sous le ventre, pieds
 * écartés d'un voxel, posés à la rangée du bas.
 */
export const AXOLOTL_FISH: FishTemplate = {
  body: [
    // queue → tête
    '.............',
    '..fffff......',
    '.kkkkkkkkkkkk',
    'ssssssssssses',
    '.bbbbbbbbbbbb',
    '.............',
  ],
  tail: ['..fffff', 'ffkkkkk', 'ffsssss', '..fffff'],
  bodyDepth: 6,
  tailDepth: 2,
  bodyColumnDepths: [2, 2, 2, 4, 4, 4, 4, 4, 4, 6, 6, 6, 4],
  paired: [
    [
      '.............',
      '.........a...',
      '........a....',
      '.........a...',
      '...f......f..',
      '...f......f..',
    ],
    [
      '........a....',
      '.............',
      '.......a.....',
      '.............',
      '........a....',
      '..f.......f..',
    ],
  ],
};

/**
 * Grenouille (issue #131) : corps court et trapu, vert `#7bc950` taché de vert sombre (`a`),
 * ventre clair, tête bombée. Parties paires : yeux noirs de chaque côté du haut de la tête, cuisses repliées le long de l'arrière du corps et pieds écartés (`f`), pattes avant sous la
 * tête. La « queue » est la paire de pieds arrière, qui bat à la nage et pendant le saut.
 */
export const FROG_FISH: FishTemplate = {
  body: [
    // queue → tête
    '......kk.',
    '.kkakkkkk',
    'kkkkkakkk',
    'ssassssss',
    '.bbbbbbb.',
  ],
  tail: ['.f', 'ff'],
  bodyDepth: 6,
  tailDepth: 2,
  bodyColumnDepths: [2, 4, 4, 6, 6, 6, 4, 4, 2],
  paired: [
    ['......e..', '.........', '.ff......', 'fff...f..', 'ff....f..'],
    ['.........', '.........', '.........', '.ff......', 'ff.....f.'],
  ],
};

/**
 * Triton (issue #133) : corps long et fin (4 voxels d'épaisseur au plus, contre 6 pour la
 * grenouille), orange `#e07a2f` taché de sombre (`a`, surtout sur les flancs : vu de dessus,
 * le dos reste orange), ventre jaune orangé, tête étroite. Longue queue aplatie, crête
 * orange et bord inférieur sombre (`f`), qui ondule à la nage. Parties paires : quatre
 * pattes courtes (`f`) sous le flanc, pieds écartés d'un voxel (vue de dessus) ; de profil,
 * le triton reste bas et allongé, la grenouille haute et ramassée.
 */
export const NEWT_FISH: FishTemplate = {
  body: [
    // queue → tête
    '.kkkkkkakkk.',
    'kakkkkkkakke',
    'bbbbbbbbbbb.',
    '............',
  ],
  tail: ['...kkkk', 'kkkkkkk', 'kkakkkk', '...ffff'],
  bodyDepth: 4,
  tailDepth: 2,
  bodyColumnDepths: [2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2],
  paired: [
    ['............', '............', '..f.....f...', '.ff.....ff..'],
    ['............', '............', '............', '.f.......f..'],
  ],
};

/**
 * Poisson-clown (issue #150) : corps ovale, haut et court, orange (`s`, `k`, `b`), trois
 * bandes blanches (`a`) cerclées de noir (`e`, couleur de l'œil) : derrière l'œil, au milieu
 * du corps (sous la dorsale) et au pédoncule. Vu de dessus, le dos (`k`) garde les trois
 * bandes. Caudale arrondie orange (`f`) bordée de noir.
 */
export const CLOWN_FISH: FishTemplate = {
  body: [
    // queue → tête
    '...kkeaekeae..',
    'eaesseaeseaese',
    'eaesseaeseaess',
    '..ebbeaebeaeb.',
    '....beaebeae..',
  ],
  tail: ['.f', 'ef', 'ef', 'ef', '.f'],
  bodyDepth: 2,
  tailDepth: 1,
};

/** Gabarit de chaque silhouette déclarée par les espèces (`sim/species.ts`). */
export const SILHOUETTES: Readonly<Record<SilhouetteId, FishTemplate>> = {
  fuseau: SLENDER_FISH,
  'guppy-male': GUPPY_MALE_FISH,
  'guppy-femelle': GUPPY_FEMALE_FISH,
  corydora: CORYDORA_FISH,
  koi: KOI_FISH,
  axolotl: AXOLOTL_FISH,
  grenouille: FROG_FISH,
  triton: NEWT_FISH,
  clown: CLOWN_FISH,
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

/**
 * Taille d'un voxel du modèle d'une espèce : la longueur du corps, multipliée par `scale`,
 * couvre les colonnes du gabarit.
 */
export function voxelSize(
  def: SpeciesDefinition,
  template: FishTemplate = SLENDER_FISH,
  scale = 1,
): VoxelSize {
  const x = (def.bodyLength * scale) / templateWidth(template.body);
  return { x, y: x * VOXEL_HEIGHT_RATIO, z: x * VOXEL_DEPTH_RATIO };
}

/** Longueur du corps du modèle, en mètres (distance du centre au pivot de la queue × 2). */
export function modelBodyLength(
  def: SpeciesDefinition,
  template: FishTemplate = SLENDER_FISH,
  scale = 1,
): number {
  return voxelSize(def, template, scale).x * templateWidth(template.body);
}

/**
 * Maillage voxel d'un gabarit de profil. Seules les faces dont le voisin est vide sont
 * émises. `anchor` fixe l'origine : `'center'` centre le gabarit, `'right'` place
 * l'origine au milieu de son bord droit (pivot de la queue). `columnDepths` donne
 * l'épaisseur de chaque colonne, centrée (absent : `depth` partout).
 * @throws Error si un caractère du gabarit n'a pas de rôle, si les rangées sont inégales ou
 * si `columnDepths` est invalide (longueur, valeur hors de [1, depth], parité).
 */
export function buildVoxelMesh(
  rows: readonly string[],
  depth: number,
  colors: SpeciesColors,
  size: VoxelSize,
  anchor: 'center' | 'right',
  columnDepths?: readonly number[],
  paired: readonly (readonly string[])[] = [],
): VoxelMeshData {
  const width = templateWidth(rows);
  const height = rows.length;
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error(`Épaisseur de gabarit invalide : ${depth}`);
  }
  if (columnDepths && columnDepths.length !== width) {
    throw new Error(`columnDepths doit avoir ${width} valeurs (reçu : ${columnDepths.length})`);
  }
  // Première et dernière couche (exclue) remplies dans chaque colonne.
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
    layer >= layerStart[col] &&
    layer < layerEnd[col] &&
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
      for (let layer = layerStart[col]; layer < layerEnd[col]; layer++) {
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
  // Parties paires : après le corps (maillage du corps inchangé pour les autres gabarits).
  const pairedVoxels = new Map<string, string>();
  paired.forEach((layerRows, distance) => {
    if (layerRows.length !== height || layerRows.some((r) => r.length !== width)) {
      throw new Error('Les couches paires doivent avoir les dimensions du corps');
    }
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const char = layerRows[row][col];
        if (char === '.') {
          continue;
        }
        if (!linear.has(char)) {
          throw new Error(`Caractère de gabarit sans rôle de couleur : « ${char} »`);
        }
        pairedVoxels.set(`${col},${row},${layerEnd[col] + distance}`, char);
        pairedVoxels.set(`${col},${row},${layerStart[col] - 1 - distance}`, char);
      }
    }
  });
  const occupied = (col: number, row: number, layer: number): boolean =>
    filled(col, row, layer) || pairedVoxels.has(`${col},${row},${layer}`);
  for (const [key, char] of pairedVoxels) {
    const [col, row, layer] = key.split(',').map(Number);
    const color = linear.get(char)!;
    const x0 = originX + col;
    const y0 = height / 2 - row - 1;
    const z0 = -depth / 2 + layer;
    for (const face of FACES) {
      if (occupied(col + face.dc, row - face.dy, layer + face.dz)) {
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
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(vertexColors),
    quads,
  };
}

/**
 * Géométrie Three.js du corps ou de la queue d'une apparence d'espèce (par défaut :
 * l'apparence par défaut de l'espèce, `silhouette` et `colors`).
 */
export function createFishGeometry(
  def: SpeciesDefinition,
  part: 'body' | 'tail',
  variant: Pick<SpeciesVariant, 'silhouette' | 'scale' | 'colors'> = {
    silhouette: def.silhouette,
    scale: 1,
    colors: def.colors,
  },
): BufferGeometry {
  const template = SILHOUETTES[variant.silhouette];
  const size = voxelSize(def, template, variant.scale);
  const data =
    part === 'body'
      ? buildVoxelMesh(
          template.body,
          template.bodyDepth,
          variant.colors,
          size,
          'center',
          template.bodyColumnDepths,
          template.paired,
        )
      : buildVoxelMesh(template.tail, template.tailDepth, variant.colors, size, 'right');
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
