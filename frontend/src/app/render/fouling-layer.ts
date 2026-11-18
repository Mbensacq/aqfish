import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three';

import type { TankFouling } from '../sim/fouling';
import type { Box3 } from '../sim/tank';
import type { SceneLayer } from './effect-layer';
import { applyFlatBrightness } from './night-shade';
import { PALETTE } from './palette';

/**
 * Voile d'encrassement des vitres et du sol (issue #607, ADR 0141) : des pixels carrés de
 * dépôts, posés contre la face intérieure des quatre vitres et juste au-dessus du sable, qui
 * apparaissent par touffes à mesure que le niveau (`sim/fouling.ts`) monte : d'abord au pied
 * des vitres, dans les coins et le long de la ligne d'eau, puis vers le milieu.
 *
 * Chaque surface est construite une fois (cases triées par ordre d'apparition) ; le niveau ne
 * fait que régler le nombre de cases dessinées (`setDrawRange`) : ni allocation par image, ni
 * nouvel attribut de shader (couleurs par sommet d'un `MeshBasicMaterial`, comme les algues).
 * Couleurs de la palette commune, sans ajout. Niveau nul : couche masquée, images inchangées
 * à l'octet près.
 */

/** Côté d'une case de voile, en mètres. */
export const FOULING_PIXEL = 0.02;
/** Retrait du voile vers l'intérieur du bac, en mètres : devant les plaques d'algues. */
export const FOULING_GLASS_INSET = 0.002;
/** Hauteur du voile du sol au-dessus du sable, en mètres (`docs/PIEGES.md` : 8 mm au moins). */
export const FOULING_FLOOR_LIFT = 0.008;
/** Distance aux bords au-delà de laquelle une case ne profite plus de leur proximité, en m. */
export const FOULING_EDGE_RANGE = 0.16;

/**
 * Part des cases couvertes à plein voile, par surface : la vitre de devant reste lisible,
 * le sol se couvre davantage.
 */
export const FOULING_REACH = { glass: 0.5, front: 0.3, floor: 0.6 } as const;

/** Couleurs : dépôt brun-gris et touffes vertes (vitres), dépôt et débris sombres (sol). */
export const FOULING_COLORS = {
  depot: PALETTE.sableOmbre,
  touffe: PALETTE.vegetationClaire,
  debris: PALETTE.rocheSombre,
} as const;

/** Surface du voile. */
export type FoulingSurface = 'fond' | 'devant' | 'gauche' | 'droite' | 'sol';

/** Case du voile : centre (repère du bac), surface, ordre d'apparition et couleur. */
export interface FoulingCell {
  readonly surface: FoulingSurface;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Ordre d'apparition, dans [0, 1[ : la case paraît quand le niveau × portée le dépasse. */
  readonly order: number;
  readonly color: 'depot' | 'touffe' | 'debris';
}

/** Hachage entier déterministe vers [0, 1[. */
export function cellHash(i: number, j: number, salt: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(salt, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x1_0000_0000;
}

/** Bruit de valeur lissé (maille de `cell` cases), dans [0, 1[ : des touffes, pas du grain. */
export function clumpNoise(i: number, j: number, salt: number, cell = 4): number {
  const fi = i / cell;
  const fj = j / cell;
  const i0 = Math.floor(fi);
  const j0 = Math.floor(fj);
  const ti = smooth(fi - i0);
  const tj = smooth(fj - j0);
  const a = cellHash(i0, j0, salt);
  const b = cellHash(i0 + 1, j0, salt);
  const c = cellHash(i0, j0 + 1, salt);
  const d = cellHash(i0 + 1, j0 + 1, salt);
  return (a + (b - a) * ti) * (1 - tj) + (c + (d - c) * ti) * tj;
}

/**
 * Ordre d'apparition d'une case à la distance `edge` (mètres) de ses bords : près des bords
 * d'abord, en touffes (`clumpNoise`) au bord irrégulier (grain par case). Dans [0, 1[.
 */
export function foulingOrder(i: number, j: number, salt: number, edge: number): number {
  const near = Math.min(1, Math.max(0, edge) / FOULING_EDGE_RANGE);
  const value = 0.5 * near + 0.38 * clumpNoise(i, j, salt) + 0.12 * cellHash(i, j, salt + 7);
  return Math.min(0.999999, Math.max(0, value));
}

/**
 * Cases du voile d'un volume d'eau `water`, triées par ordre d'apparition croissant, pour les
 * vitres et, si `floor`, pour le sol (sable plat seulement). Seules les cases qui peuvent
 * paraître (ordre sous la portée de leur surface) sont gardées. Déterministe.
 */
export function foulingCells(
  water: Box3,
  floor: boolean,
): { readonly glass: readonly FoulingCell[]; readonly floor: readonly FoulingCell[] } {
  const glass: FoulingCell[] = [];
  const p = FOULING_PIXEL;
  const height = water.maxY - water.minY;
  const rows = Math.max(1, Math.floor(height / p));
  const wall = (
    surface: Exclude<FoulingSurface, 'sol'>,
    length: number,
    salt: number,
    at: (u: number, y: number) => readonly [number, number],
  ) => {
    const cols = Math.max(1, Math.floor(length / p));
    const reach = surface === 'devant' ? FOULING_REACH.front : FOULING_REACH.glass;
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5) * (length / cols);
      for (let r = 0; r < rows; r++) {
        const v = (r + 0.5) * (height / rows);
        // Pied de vitre et coins d'abord, puis la ligne d'eau (à moitié moins attirante).
        const edge = Math.min(v, u, length - u, 2 * (height - v));
        const order = foulingOrder(c, r, salt, edge) / reach;
        if (order >= 1) {
          continue;
        }
        const [x, z] = at(u, v);
        const color = cellHash(c, r, salt + 13) < 0.22 ? 'touffe' : 'depot';
        glass.push({ surface, x, y: water.minY + v, z, order, color });
      }
    }
  };
  const width = water.maxX - water.minX;
  const depth = water.maxZ - water.minZ;
  const gi = FOULING_GLASS_INSET;
  wall('fond', width, 1, (u) => [water.minX + u, water.minZ + gi]);
  wall('devant', width, 2, (u) => [water.maxX - u, water.maxZ - gi]);
  wall('gauche', depth, 3, (u) => [water.minX + gi, water.maxZ - u]);
  wall('droite', depth, 4, (u) => [water.maxX - gi, water.minZ + u]);
  glass.sort(byOrder);

  const ground: FoulingCell[] = [];
  if (floor) {
    const cols = Math.max(1, Math.floor(width / p));
    const lines = Math.max(1, Math.floor(depth / p));
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5) * (width / cols);
      for (let r = 0; r < lines; r++) {
        const w = (r + 0.5) * (depth / lines);
        const edge = Math.min(u, width - u, w, depth - w);
        const order = foulingOrder(c, r, 5, edge) / FOULING_REACH.floor;
        if (order >= 1) {
          continue;
        }
        const color = cellHash(c, r, 18) < 0.3 ? 'debris' : 'depot';
        ground.push({
          surface: 'sol',
          x: water.minX + u,
          y: water.minY + FOULING_FLOOR_LIFT,
          z: water.minZ + w,
          order,
          color,
        });
      }
    }
    ground.sort(byOrder);
  }
  return { glass, floor: ground };
}

/** Nombre de cases (triées) dessinées au niveau `level` : celles dont l'ordre est sous lui. */
export function shownCells(cells: readonly FoulingCell[], level: number): number {
  if (!(level > 0)) {
    return 0;
  }
  // Recherche dichotomique de la première case d'ordre ≥ `level`.
  let lo = 0;
  let hi = cells.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cells[mid].order < level) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** Triangles des cases `cells`, dans leur ordre : 6 sommets par case, face à sa surface. */
export function buildFoulingGeometry(cells: readonly FoulingCell[]): BufferGeometry {
  const positions = new Float32Array(cells.length * 18);
  const colors = new Float32Array(cells.length * 18);
  const palette = {
    depot: new Color(FOULING_COLORS.depot),
    touffe: new Color(FOULING_COLORS.touffe),
    debris: new Color(FOULING_COLORS.debris),
  };
  const h = FOULING_PIXEL / 2;
  let k = 0;
  for (const cell of cells) {
    const corners = cellCorners(cell, h);
    const color = palette[cell.color];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const [x, y, z] = corners[index];
      positions[k] = x;
      positions[k + 1] = y;
      positions[k + 2] = z;
      colors[k] = color.r;
      colors[k + 1] = color.g;
      colors[k + 2] = color.b;
      k += 3;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);
  return geometry;
}

function cellCorners(cell: FoulingCell, h: number): readonly (readonly [number, number, number])[] {
  const { x, y, z } = cell;
  switch (cell.surface) {
    case 'fond':
    case 'devant':
      return [
        [x - h, y - h, z],
        [x + h, y - h, z],
        [x + h, y + h, z],
        [x - h, y + h, z],
      ];
    case 'gauche':
    case 'droite':
      return [
        [x, y - h, z - h],
        [x, y - h, z + h],
        [x, y + h, z + h],
        [x, y + h, z - h],
      ];
    case 'sol':
      return [
        [x - h, y, z - h],
        [x + h, y, z - h],
        [x + h, y, z + h],
        [x - h, y, z + h],
      ];
  }
}

/**
 * Couche du voile : un maillage pour les vitres, un pour le sol, reconstruits seulement quand
 * le volume d'eau change ; `setFouling` ne règle ensuite que le nombre de cases dessinées.
 */
export class FoulingLayer implements SceneLayer {
  readonly object = new Group();
  private readonly material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
  private water: Box3 | null = null;
  private withFloor = false;
  private glassCells: readonly FoulingCell[] = [];
  private floorCells: readonly FoulingCell[] = [];
  private glassMesh: Mesh | null = null;
  private floorMesh: Mesh | null = null;
  private brightnessFactor = 1;
  private shownGlass = 0;
  private shownFloor = 0;

  constructor() {
    this.object.name = 'encrassement';
    this.object.visible = false;
  }

  /**
   * Voile du volume `water` au niveau `fouling` ; `floor` : le sol est du sable plat (sans
   * terrain), donc voilé lui aussi. Niveaux nuls : couche masquée, rien n'est construit.
   */
  setFouling(water: Box3, fouling: TankFouling, floor: boolean): void {
    if (fouling.glass <= 0 && fouling.floor <= 0 && this.glassMesh === null) {
      this.shownGlass = 0;
      this.shownFloor = 0;
      this.object.visible = false;
      return;
    }
    if (this.water === null || !sameBox(this.water, water) || floor !== this.withFloor) {
      this.rebuild(water, floor);
    }
    this.shownGlass = shownCells(this.glassCells, fouling.glass);
    this.shownFloor = floor ? shownCells(this.floorCells, fouling.floor) : 0;
    this.glassMesh?.geometry.setDrawRange(0, this.shownGlass * 6);
    this.floorMesh?.geometry.setDrawRange(0, this.shownFloor * 6);
    if (this.glassMesh) {
      this.glassMesh.visible = this.shownGlass > 0;
    }
    if (this.floorMesh) {
      this.floorMesh.visible = this.shownFloor > 0;
    }
    this.object.visible = this.shownGlass + this.shownFloor > 0;
  }

  private rebuild(water: Box3, floor: boolean): void {
    this.disposeMeshes();
    this.water = { ...water };
    this.withFloor = floor;
    const cells = foulingCells(water, floor);
    this.glassCells = cells.glass;
    this.floorCells = cells.floor;
    this.glassMesh = this.addMesh(cells.glass);
    this.floorMesh = cells.floor.length > 0 ? this.addMesh(cells.floor) : null;
  }

  private addMesh(cells: readonly FoulingCell[]): Mesh {
    const mesh = new Mesh(buildFoulingGeometry(cells), this.material);
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.object.add(mesh);
    return mesh;
  }

  /** Cases dessinées sur les vitres et sur le sol (tests). */
  get counts(): { readonly glass: number; readonly floor: number } {
    return { glass: this.shownGlass, floor: this.shownFloor };
  }

  /**
   * Luminosité des couleurs plates (`render/night-shade.ts`) : 1, couleurs d'origine. Une
   * valeur non finie ou négative est ignorée.
   */
  setBrightness(factor: number): void {
    this.brightnessFactor = applyFlatBrightness(this.material, this.brightnessFactor, factor);
  }

  /** Luminosité appliquée (tests). */
  get brightness(): number {
    return this.brightnessFactor;
  }

  private disposeMeshes(): void {
    for (const mesh of [this.glassMesh, this.floorMesh]) {
      if (mesh) {
        mesh.geometry.dispose();
        this.object.remove(mesh);
      }
    }
    this.glassMesh = null;
    this.floorMesh = null;
  }

  dispose(): void {
    this.disposeMeshes();
    this.material.dispose();
  }
}

function byOrder(a: FoulingCell, b: FoulingCell): number {
  return a.order - b.order;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function sameBox(a: Box3, b: Box3): boolean {
  return (
    a.minX === b.minX &&
    a.maxX === b.maxX &&
    a.minY === b.minY &&
    a.maxY === b.maxY &&
    a.minZ === b.minZ &&
    a.maxZ === b.maxZ
  );
}
