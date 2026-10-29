import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Vector2,
} from 'three';

import { furnitureBlocks } from '../sim/room-furniture';
import { roomBlocks, roomVisibility, type Room, type RoomBlock, type RoomPart } from '../sim/room';
import type { TankDimensions } from '../sim/tank';
import { createOutlineMaterial, SELECTION_COLOR, SELECTION_WIDTH_PX } from './decor-layer';
import type { SceneLayer } from './effect-layer';
import { PALETTE } from './palette';
import { FACES } from './rock-model';

/**
 * Pièce autour du bac (issue #187, ADR 0048) et ses meubles (#188, ADR 0049) : les blocs de
 * `roomBlocks` et de `furnitureBlocks` en deux maillages à
 * couleurs de la palette par sommet. Sol, plinthe et meuble sous un matériau éclairé : ils
 * suivent la lumière du jour comme la margelle du bassin, sans lumière propre. Mur et cimaise
 * à part, en couleurs plates (voir `wallMaterial`), pour être masqués seuls quand la caméra
 * passe derrière le mur.
 *
 * Masquée (pièce masquée ou environnement sans pièce), la couche n'a aucun maillage et sa
 * racine est invisible : la scène rendue est exactement celle d'avant (#187).
 */

/** Couleurs de chaque partie, teinte 0 puis teinte 1 (palette du projet, `docs/DA.md`). */
export const ROOM_COLORS: Readonly<Record<RoomPart, readonly [string, string]>> = {
  parquet: [PALETTE.rocheSombre, PALETTE.koiNoir],
  mur: [PALETTE.koiNoir, PALETTE.koiNoir],
  cimaise: [PALETTE.rocheSombre, PALETTE.rocheSombre],
  plinthe: [PALETTE.sableOmbre, PALETTE.sableOmbre],
  plateau: [PALETTE.sableOmbre, PALETTE.sableOmbre],
  caisson: [PALETTE.sableOmbre, PALETTE.sableOmbre],
  porte: [PALETTE.sableSombre, PALETTE.sableSombre],
  poignee: [PALETTE.rocheSombre, PALETTE.rocheSombre],
  socle: [PALETTE.rocheSombre, PALETTE.rocheSombre],
  // Meubles et plantes de la pièce (#188, ADR 0049).
  bois: [PALETTE.sableSombre, PALETTE.sableOmbre],
  livre: [PALETTE.koiRouge, PALETTE.neonBleu],
  tissu: [PALETTE.eauSombre, PALETTE.verreSombre],
  coussin: [PALETTE.eauMoyenne, PALETTE.eauSombre],
  pot: [PALETTE.roche, PALETTE.koiNoir],
  feuillage: [PALETTE.vegetation, PALETTE.vegetationClaire],
  // Bacs posés (#305, lot 2b) : rendu simplifié, opaque, d'un bac figé.
  cadre: [PALETTE.koiNoir, PALETTE.koiNoir],
  eau: [PALETTE.eauMoyenne, PALETTE.eauSombre],
  substrat: [PALETTE.sable, PALETTE.sable],
};

/** Parties dessinées avec le mur (masquées avec lui). */
const WALL_PARTS: ReadonlySet<RoomPart> = new Set<RoomPart>(['mur', 'cimaise']);

/** Données brutes d'un maillage de blocs (non indexé), testables sans WebGL. */
export interface RoomMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
}

/** Maillage des blocs `blocks` : six faces par bloc, couleur de sa partie (`ROOM_COLORS`). */
export function buildRoomMesh(blocks: readonly RoomBlock[]): RoomMeshData {
  const count = blocks.length * FACES.length * 6;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const linear = new Map<string, Color>();
  let n = 0;
  for (const block of blocks) {
    const hex = ROOM_COLORS[block.part][block.shade];
    let color = linear.get(hex);
    if (!color) {
      color = new Color(hex);
      linear.set(hex, color);
    }
    const { minX, maxX, minY, maxY, minZ, maxZ } = block.box;
    for (const face of FACES) {
      for (const corner of face.corners) {
        positions[n] = corner[0] ? maxX : minX;
        positions[n + 1] = corner[1] ? maxY : minY;
        positions[n + 2] = corner[2] ? maxZ : minZ;
        normals.set(face.d, n);
        colors[n] = color.r;
        colors[n + 1] = color.g;
        colors[n + 2] = color.b;
        n += 3;
      }
    }
  }
  return { positions, normals, colors };
}

/**
 * Coque de contour des blocs `blocks` (« inverted hull » du décor, `createOutlineMaterial`) :
 * les six faces de chaque bloc, normales aux coins dirigées vers l'extérieur du bloc (somme
 * des trois faces), pour le gonflement à l'écran. Contour de sélection d'un meuble (#188).
 */
export function buildRoomHull(blocks: readonly RoomBlock[]): RoomMeshData {
  const data = buildRoomMesh(blocks);
  const { positions, normals } = data;
  const r = 1 / Math.sqrt(3);
  for (let b = 0; b < blocks.length; b++) {
    const { minX, maxX, minY, maxY, minZ, maxZ } = blocks[b].box;
    const start = b * FACES.length * 6 * 3;
    for (let n = start; n < start + FACES.length * 6 * 3; n += 3) {
      normals[n] = positions[n] > (minX + maxX) / 2 ? r : -r;
      normals[n + 1] = positions[n + 1] > (minY + maxY) / 2 ? r : -r;
      normals[n + 2] = positions[n + 2] > (minZ + maxZ) / 2 ? r : -r;
    }
  }
  return data;
}

function createGeometry(data: RoomMeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(data.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Couche de la pièce : construite par `setRoom`, cadrée par `setViewpoint`. */
export class RoomLayer implements SceneLayer {
  readonly object = new Object3D();
  private readonly material = new MeshLambertMaterial({ vertexColors: true });
  /**
   * Mur en couleurs plates, non éclairé : éclairé de face par le seul ciel, il tombait sur le
   * fond de la scène ; plus clair, l'eau vue devant lui virait au gris (`docs/PIEGES.md`).
   */
  private readonly wallMaterial = new MeshBasicMaterial({ vertexColors: true });
  /** Contour de l'élément sélectionné (#188), celui de la sélection du décor. */
  private readonly selectionMaterial = createOutlineMaterial(SELECTION_COLOR, SELECTION_WIDTH_PX);
  private wall: Mesh | null = null;
  private rest: Mesh | null = null;
  private hull: Mesh | null = null;
  private dims: TankDimensions | null = null;
  private room: Room | null = null;
  private selected: number | null = null;
  private blockCount = 0;

  constructor() {
    this.object.name = 'piece';
    this.object.visible = false;
  }

  /**
   * Construit la pièce `room` autour d'un bac `dims` (remplace la précédente) ; `available`
   * faux (environnement sans pièce) ou pièce masquée : rien n'est dessiné. `layout` : blocs
   * des meubles supports et des bacs posés de la pièce de N bacs (#305, `roomLayoutBlocks`),
   * dessinés avec le sol et le meuble, seulement si la pièce l'est.
   */
  setRoom(
    dims: TankDimensions,
    room: Room,
    available: boolean,
    layout: readonly RoomBlock[] = [],
  ): void {
    this.clear();
    const base = available ? [...roomBlocks(dims, room), ...furnitureBlocks(room)] : [];
    const blocks = base.length > 0 ? [...base, ...layout] : base;
    this.blockCount = blocks.length;
    if (blocks.length === 0) {
      return;
    }
    this.dims = dims;
    this.wall = new Mesh(
      createGeometry(buildRoomMesh(blocks.filter((b) => WALL_PARTS.has(b.part)))),
      this.wallMaterial,
    );
    this.wall.name = 'piece-mur';
    this.rest = new Mesh(
      createGeometry(buildRoomMesh(blocks.filter((b) => !WALL_PARTS.has(b.part)))),
      this.material,
    );
    this.rest.name = 'piece-sol-meuble';
    this.object.add(this.rest, this.wall);
    this.object.visible = true;
    this.room = room;
    this.buildHull();
  }

  /**
   * Sélectionne l'élément d'indice `index` de `room.items` (contour clair et épais, comme la
   * sélection du décor), ou aucun avec `null` ; gardée quand la pièce est reconstruite tant
   * que l'indice existe (aperçu d'un glissement).
   */
  setSelected(index: number | null): void {
    // `setRoom` reconstruit déjà la coque de la sélection courante : même indice, rien à refaire.
    if (index === this.selected) {
      return;
    }
    this.selected = index;
    this.buildHull();
  }

  /** Indice de l'élément sélectionné s'il est dessiné, `null` sinon (tests). */
  get selectedIndex(): number | null {
    return this.hull ? this.selected : null;
  }

  /** Taille de la cible de rendu, en pixels : épaisseur du contour de sélection. */
  setResolution(width: number, height: number): void {
    (this.selectionMaterial.uniforms['uResolution'].value as Vector2).set(
      Math.max(1, width),
      Math.max(1, height),
    );
  }

  private buildHull(): void {
    if (this.hull) {
      this.object.remove(this.hull);
      this.hull.geometry.dispose();
      this.hull = null;
    }
    const blocks =
      this.room && this.selected !== null && this.blockCount > 0
        ? furnitureBlocks(this.room, this.selected)
        : [];
    if (blocks.length === 0) {
      return;
    }
    this.hull = new Mesh(createGeometry(buildRoomHull(blocks)), this.selectionMaterial);
    this.hull.name = 'piece-selection';
    this.object.add(this.hull);
  }

  /** Masque ce qui cacherait le bac depuis une caméra à la hauteur `y` et à la cote `z`. */
  setViewpoint(y: number, z: number): void {
    if (!this.dims || !this.wall) {
      return;
    }
    const visibility = roomVisibility(this.dims, y, z);
    this.object.visible = visibility.room;
    this.wall.visible = visibility.wall;
  }

  /** Vrai si la pièce est construite (tests). */
  get built(): boolean {
    return this.blockCount > 0;
  }

  /** Nombre de blocs de la pièce construite (tests). */
  get count(): number {
    return this.blockCount;
  }

  /** Vrai si le mur est affiché (tests). */
  get wallVisible(): boolean {
    return this.object.visible && (this.wall?.visible ?? false);
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.wallMaterial.dispose();
    this.selectionMaterial.dispose();
  }

  private clear(): void {
    for (const mesh of [this.wall, this.rest, this.hull]) {
      if (mesh) {
        this.object.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    this.wall = null;
    this.rest = null;
    this.hull = null;
    this.room = null;
    this.dims = null;
    this.blockCount = 0;
    this.object.visible = false;
  }
}
