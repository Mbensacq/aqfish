import {
  BASEBOARD_DEPTH,
  CABINET_OVERHANG,
  clampRoom,
  MAX_ROOM_ITEMS,
  ROOM_MARGIN,
  ROOM_VOXEL,
  WALL_GAP,
  WALL_RISE,
  type Room,
  type RoomBlock,
  type RoomItem,
  type RoomItemKind,
  type RoomPart,
  type RoomQuarter,
} from './room';
import type { TankDimensions } from './tank';

/**
 * Meubles et plantes d'intérieur de la pièce (issue #188, ADR 0049) : catalogue de modèles
 * voxels générés par le code, et pose par gravité **analytique** sur des boîtes alignées sur
 * les axes. Purement graphique : les animaux ne lisent jamais la pièce.
 *
 * Chaque élément a une **boîte de collision** (son volume plein, alignée sur les axes après
 * un quart de tour) : lâché, il descend verticalement et se pose sur le parquet ou sur le
 * dessus de la plus haute boîte que son emprise chevauche. Par construction, deux éléments
 * ne s'interpénètrent jamais. Fonctions pures, sans moteur ni hasard : même pièce et mêmes
 * gestes, même pose.
 *
 * Repère : celui du bac (mètres), parquet en y = −hauteur du meuble ; un élément est décrit
 * par le centre de son emprise (x, z) et la hauteur de sa base au-dessus du parquet.
 */

/** Bloc d'un modèle, en centimètres entiers dans le repère local de l'élément (base en y = 0). */
export interface LocalBlock {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly part: RoomPart;
  readonly shade: 0 | 1;
}

/** Modèle d'un élément du catalogue. */
export interface RoomItemModel {
  /** Nom affiché. */
  readonly name: string;
  /** Boîte de collision, centrée en X et Z, base en y = 0 (centimètres entiers). */
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** Vrai si un autre élément peut se poser dessus (pas sur une plante). */
  readonly supports: boolean;
  /** Blocs voxels du modèle (repère local, face avant vers +Z). */
  readonly blocks: readonly LocalBlock[];
}

function block(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  part: RoomPart,
  shade: 0 | 1 = 0,
): LocalBlock {
  return { minX, maxX, minY, maxY, minZ, maxZ, part, shade };
}

/** Livres d'un rayon : largeurs et hauteurs fixes (cm), puis un vide ; teintes alternées. */
const BOOK_WIDTHS = [3, 2, 4, 3, 2, 3, 0, 4, 2, 3] as const;
const BOOK_HEIGHTS = [24, 20, 27, 22, 25, 19, 0, 26, 21, 23] as const;

function shelfBooks(fromX: number, toX: number, y: number, offset: number): LocalBlock[] {
  const books: LocalBlock[] = [];
  let x = fromX;
  for (let i = 0; i < BOOK_WIDTHS.length; i++) {
    const k = (i + offset) % BOOK_WIDTHS.length;
    const w = BOOK_WIDTHS[k];
    if (w === 0) {
      x += 6;
      continue;
    }
    if (x + w > toX) {
      break;
    }
    books.push(block(x, x + w, y, y + BOOK_HEIGHTS[k], -12, 10, 'livre', (k % 2) as 0 | 1));
    x += w;
  }
  return books;
}

/** Étagère basse à deux rayons : montants, fond, tablettes et livres. */
function shelfModel(): RoomItemModel {
  const blocks: LocalBlock[] = [
    block(-40, -38, 0, 80, -15, 15, 'bois'),
    block(38, 40, 0, 80, -15, 15, 'bois'),
    block(-38, 38, 0, 78, -15, -14, 'bois', 1),
    block(-38, 38, 0, 4, -14, 15, 'bois'),
    block(-38, 38, 40, 42, -14, 15, 'bois'),
    block(-40, 40, 78, 80, -15, 15, 'bois'),
  ];
  blocks.push(...shelfBooks(-37, 37, 4, 0), ...shelfBooks(-30, 37, 42, 3));
  return { name: 'Étagère', width: 80, depth: 30, height: 80, supports: true, blocks };
}

/** Table basse : plateau, quatre pieds et tablette basse. */
function tableModel(): RoomItemModel {
  const blocks: LocalBlock[] = [block(-50, 50, 36, 40, -25, 25, 'bois')];
  for (const [x, z] of [
    [-48, -23],
    [44, -23],
    [-48, 19],
    [44, 19],
  ] as const) {
    blocks.push(block(x, x + 4, 0, 36, z, z + 4, 'bois', 1));
  }
  blocks.push(block(-44, 44, 8, 10, -19, 19, 'bois', 1));
  return { name: 'Table basse', width: 100, depth: 50, height: 40, supports: true, blocks };
}

/** Canapé deux places : pieds, assise, dossier, accoudoirs et coussins. */
function sofaModel(): RoomItemModel {
  const blocks: LocalBlock[] = [];
  for (const [x, z] of [
    [-86, -36],
    [80, -36],
    [-86, 30],
    [80, 30],
  ] as const) {
    blocks.push(block(x, x + 6, 0, 8, z, z + 6, 'bois', 1));
  }
  blocks.push(
    block(-90, 90, 8, 36, -40, 40, 'tissu'),
    block(-90, 90, 36, 80, -40, -22, 'tissu'),
    block(-90, -74, 36, 58, -22, 40, 'tissu', 1),
    block(74, 90, 36, 58, -22, 40, 'tissu', 1),
    block(-74, -1, 36, 46, -22, 38, 'coussin'),
    block(1, 74, 36, 46, -22, 38, 'coussin'),
    block(-72, -2, 46, 72, -22, -14, 'coussin', 1),
    block(2, 72, 46, 72, -22, -14, 'coussin', 1),
  );
  return { name: 'Canapé', width: 180, depth: 80, height: 80, supports: true, blocks };
}

/**
 * Plante en pot : pot à rebord, terre, tige et feuillage. La boîte de collision est celle du
 * pot (32 × 32 × 34 cm) : le feuillage reste traversable, comme celui des plantes du bac
 * (ADR 0046) ; rien ne se pose sur une plante.
 */
function plantModel(): RoomItemModel {
  const blocks: LocalBlock[] = [
    block(-14, 14, 0, 28, -14, 14, 'pot'),
    block(-16, 16, 28, 34, 13, 16, 'pot'),
    block(-16, 16, 28, 34, -16, -13, 'pot'),
    block(-16, -13, 28, 34, -13, 13, 'pot'),
    block(13, 16, 28, 34, -13, 13, 'pot'),
    block(-13, 13, 28, 32, -13, 13, 'pot', 1),
    block(-1, 1, 32, 88, -1, 1, 'feuillage'),
  ];
  // Feuilles : [x0, x1, y0, y1, z0, z1, teinte], du bas vers le haut, en couronne.
  const leaves: readonly (readonly [number, number, number, number, number, number, 0 | 1])[] = [
    [-20, -1, 40, 46, -3, 3, 0],
    [1, 19, 44, 50, -3, 3, 1],
    [-3, 3, 48, 54, 1, 18, 0],
    [-3, 3, 52, 58, -18, -1, 1],
    [-16, -1, 60, 66, -2, 4, 1],
    [1, 15, 64, 70, -4, 2, 0],
    [-2, 4, 68, 74, 1, 14, 1],
    [-4, 2, 72, 78, -14, -1, 0],
    [-10, -1, 80, 86, -3, 3, 0],
    [1, 10, 82, 88, -3, 3, 1],
    [-4, 4, 88, 96, -4, 4, 1],
  ];
  for (const [x0, x1, y0, y1, z0, z1, shade] of leaves) {
    blocks.push(block(x0, x1, y0, y1, z0, z1, 'feuillage', shade));
  }
  return { name: 'Plante en pot', width: 32, depth: 32, height: 34, supports: false, blocks };
}

/** Catalogue des éléments de la pièce (#188), par type. */
export const ROOM_CATALOG: Readonly<Record<RoomItemKind, RoomItemModel>> = {
  etagere: shelfModel(),
  'table-basse': tableModel(),
  canape: sofaModel(),
  'plante-pot': plantModel(),
};

/** Boîte alignée sur les axes, en mètres. */
export interface FurnitureBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Voxels de la pièce par mètre (100). */
const VOXELS_PER_METER = Math.round(1 / ROOM_VOXEL);

/**
 * Arrondi au centimètre (`ROOM_VOXEL`), par division : `-1.4` reste `-1.4` (multiplier par
 * 0,01 donnerait `-1.4000000000000001`, et une pose enregistrée qui ne se relit pas égale).
 */
function snap(value: number): number {
  return Math.round(value * VOXELS_PER_METER) / VOXELS_PER_METER;
}

/** Tolérance des comparaisons de cotes (les cotes sont des multiples du centimètre). */
const EPS = 1e-6;

/**
 * Coins (x, z) d'un rectangle local tourné de `quarter` quarts de tour (sens direct vu de
 * dessus : la face avant +Z passe vers +X au premier quart).
 */
function rotateRect(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  quarter: RoomQuarter,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  switch (quarter) {
    case 0:
      return { minX, maxX, minZ, maxZ };
    case 1:
      return { minX: minZ, maxX: maxZ, minZ: -maxX, maxZ: -minX };
    case 2:
      return { minX: -maxX, maxX: -minX, minZ: -maxZ, maxZ: -minZ };
    case 3:
      return { minX: -maxZ, maxX: -minZ, minZ: minX, maxZ: maxX };
  }
}

/**
 * Boîte de collision de `item`, en mètres, dans le repère du bac, avec y compté depuis le
 * **parquet** (base en `elevation`).
 */
export function roomItemBox(item: RoomItem): FurnitureBox {
  const model = ROOM_CATALOG[item.kind];
  const r = rotateRect(
    -model.width / 2,
    model.width / 2,
    -model.depth / 2,
    model.depth / 2,
    item.quarter,
  );
  const base = item.elevation ?? 0;
  return {
    minX: item.x + r.minX / 100,
    maxX: item.x + r.maxX / 100,
    minY: base,
    maxY: base + model.height / 100,
    minZ: item.z + r.minZ / 100,
    maxZ: item.z + r.maxZ / 100,
  };
}

/** Vrai si les emprises au sol de `a` et `b` ont un intérieur commun (se toucher est permis). */
function footprintsOverlap(a: FurnitureBox, b: FurnitureBox): boolean {
  return (
    a.minX < b.maxX - EPS && a.maxX > b.minX + EPS && a.minZ < b.maxZ - EPS && a.maxZ > b.minZ + EPS
  );
}

/** Vrai si `a` et `b` ont un intérieur commun. */
export function boxesOverlap(a: FurnitureBox, b: FurnitureBox): boolean {
  return footprintsOverlap(a, b) && a.minY < b.maxY - EPS && a.maxY > b.minY + EPS;
}

/** Raison d'un refus de pose. */
export type RoomDropRefusal =
  | 'plein'
  | 'introuvable'
  | 'hors-piece'
  | 'meuble-bac'
  | 'sur-plante'
  | 'chevauche'
  | 'trop-haut'
  | 'en-l-air';

/** Résultat d'une pose : nouvelle liste et indice de l'élément posé, ou refus. */
export type RoomDropResult =
  | { readonly ok: true; readonly items: readonly RoomItem[]; readonly index: number }
  | { readonly ok: false; readonly reason: RoomDropRefusal };

/** Demande de pose : type, centre visé de l'emprise (mètres) et quart de tour. */
export interface RoomDropRequest {
  readonly kind: RoomItemKind;
  readonly x: number;
  readonly z: number;
  readonly quarter: RoomQuarter;
}

/**
 * Limites de la pièce où une emprise peut se trouver (x, z, mètres), et emprise du meuble du
 * bac (`cabinet`, au sol) : bornes de la pose et du choix d'un point du parquet (#188).
 */
export function roomArea(dims: TankDimensions) {
  const halfW = Math.ceil(dims.width / 2 / ROOM_VOXEL - 1e-9) * ROOM_VOXEL;
  const halfD = Math.ceil(dims.depth / 2 / ROOM_VOXEL - 1e-9) * ROOM_VOXEL;
  return {
    minX: -halfW - ROOM_MARGIN,
    maxX: halfW + ROOM_MARGIN,
    minZ: -halfD - WALL_GAP + BASEBOARD_DEPTH,
    maxZ: halfD + ROOM_MARGIN,
    cabinet: {
      minX: -halfW - CABINET_OVERHANG,
      maxX: halfW + CABINET_OVERHANG,
      minY: 0,
      maxY: 0,
      minZ: -halfD - CABINET_OVERHANG,
      maxZ: halfD + CABINET_OVERHANG,
    },
  };
}

/**
 * Hauteur où se pose un élément d'emprise `box` qui descend depuis la hauteur `from` (base),
 * parmi `others` : dessus de la plus haute boîte chevauchée dont le dessus ne dépasse pas
 * `from`, ou le parquet (0). Renvoie aussi l'élément porteur (`null` : le parquet).
 */
function landing(
  box: FurnitureBox,
  others: readonly RoomItem[],
  from: number,
): { elevation: number; support: RoomItem | null } {
  let elevation = 0;
  let support: RoomItem | null = null;
  for (const other of others) {
    const b = roomItemBox(other);
    if (footprintsOverlap(box, b) && b.maxY <= from + EPS && b.maxY > elevation + EPS) {
      elevation = b.maxY;
      support = other;
    }
  }
  return { elevation: snap(elevation), support };
}

/** Vrai si `upper` repose directement sur `lower` (base sur son dessus, emprises chevauchées). */
function restsOn(upper: RoomItem, lower: RoomItem): boolean {
  const a = roomItemBox(upper);
  const b = roomItemBox(lower);
  return Math.abs(a.minY - b.maxY) <= EPS && footprintsOverlap(a, b);
}

/** Indices des éléments portés, directement ou par empilement, par l'élément `index`. */
export function carriedBy(items: readonly RoomItem[], index: number): Set<number> {
  const carried = new Set<number>();
  const pending = [index];
  while (pending.length > 0) {
    const lower = items[pending.pop() as number];
    items.forEach((item, i) => {
      if (i !== index && !carried.has(i) && restsOn(item, lower)) {
        carried.add(i);
        pending.push(i);
      }
    });
  }
  return carried;
}

/** Élément `item` à l'élévation `elevation` (clé omise au sol). */
function atElevation(item: RoomItem, elevation: number): RoomItem {
  const { kind, x, z, quarter } = item;
  return elevation > EPS ? { kind, x, z, quarter, elevation } : { kind, x, z, quarter };
}

/**
 * Lâche un élément dans la pièce `room` autour d'un bac `dims` : nouveau (`replace` absent)
 * ou en remplacement de l'élément d'indice `replace` (déplacer, tourner). Le centre visé est
 * arrondi au centimètre ; l'élément tombe et se pose sur le parquet ou sur le plus haut
 * élément que son emprise chevauche (jamais sur une plante). Puis les éléments qui
 * reposaient sur l'élément remplacé retombent (`settleRoomItems`).
 *
 * Refus : pièce pleine (`MAX_ROOM_ITEMS`), indice inconnu, emprise hors de la pièce (au-delà
 * des marges ou dans le mur), sur le meuble du bac (il est sous le bac), pose sur une plante,
 * ou dessus plus haut que le haut du mur. Ne modifie jamais `room` ; même entrée, même
 * résultat.
 */
export function dropRoomItem(
  room: Room,
  dims: TankDimensions,
  request: RoomDropRequest,
  replace?: number,
): RoomDropResult {
  const items = room.items ?? [];
  if (replace === undefined && items.length >= MAX_ROOM_ITEMS) {
    return { ok: false, reason: 'plein' };
  }
  if (
    replace !== undefined &&
    !(Number.isInteger(replace) && replace >= 0 && replace < items.length)
  ) {
    return { ok: false, reason: 'introuvable' };
  }
  if (!Number.isFinite(request.x) || !Number.isFinite(request.z)) {
    return { ok: false, reason: 'hors-piece' };
  }
  const candidate: RoomItem = {
    kind: request.kind,
    x: snap(request.x),
    z: snap(request.z),
    quarter: request.quarter,
  };
  const box = roomItemBox(candidate);
  const bounds = roomArea(dims);
  if (
    box.minX < bounds.minX - EPS ||
    box.maxX > bounds.maxX + EPS ||
    box.minZ < bounds.minZ - EPS ||
    box.maxZ > bounds.maxZ + EPS
  ) {
    return { ok: false, reason: 'hors-piece' };
  }
  if (footprintsOverlap(box, bounds.cabinet)) {
    return { ok: false, reason: 'meuble-bac' };
  }
  // Ce que portait l'élément remplacé ne l'arrête pas : il retombe ensuite sur sa nouvelle
  // pose, ou plus bas (rotation sur place : une plante posée sur l'étagère y reste).
  const carried = replace === undefined ? new Set<number>() : carriedBy(items, replace);
  const others = items.filter((_, i) => i !== replace && !carried.has(i));
  const { elevation, support } = landing(box, others, Number.POSITIVE_INFINITY);
  if (support && !ROOM_CATALOG[support.kind].supports) {
    return { ok: false, reason: 'sur-plante' };
  }
  const { cabinetHeight } = clampRoom(room);
  const top = elevation + ROOM_CATALOG[candidate.kind].height / 100;
  if (top > cabinetHeight + dims.height + WALL_RISE + EPS) {
    return { ok: false, reason: 'trop-haut' };
  }
  const placed = atElevation(candidate, elevation);
  const placedBox = roomItemBox(placed);
  if ([...carried].some((i) => boxesOverlap(placedBox, roomItemBox(items[i])))) {
    return { ok: false, reason: 'chevauche' };
  }
  const next =
    replace === undefined
      ? [...items, placed]
      : items.map((item, i) => (i === replace ? placed : item));
  const settled = settleRoomItems(next);
  // Un élément porté qui retomberait sur une plante, sans place au parquet, resterait en
  // l'air (#200, cas 1) : le geste est refusé.
  if (floatingRoomItems(settled).length > 0) {
    return { ok: false, reason: 'en-l-air' };
  }
  return { ok: true, items: settled, index: replace ?? next.length - 1 };
}

/**
 * Retire l'élément d'indice `index` ; ce qu'il portait retombe (`settleRoomItems`). `null`
 * si l'indice est inconnu, ou si un élément porté resterait en l'air (il retomberait sur une
 * plante sans place au parquet, #200 cas 1) : la suppression est alors refusée.
 */
export function removeRoomItem(
  items: readonly RoomItem[],
  index: number,
): readonly RoomItem[] | null {
  if (!(Number.isInteger(index) && index >= 0 && index < items.length)) {
    return null;
  }
  const settled = settleRoomItems(items.filter((_, i) => i !== index));
  return floatingRoomItems(settled).length > 0 ? null : settled;
}

/**
 * Indices des éléments en l'air : base au-dessus du parquet sans reposer sur le dessus d'un
 * élément porteur (une plante ne porte rien). Liste vide pour une pièce posée.
 */
export function floatingRoomItems(items: readonly RoomItem[]): number[] {
  const floating: number[] = [];
  items.forEach((item, i) => {
    if ((item.elevation ?? 0) <= EPS) {
      return;
    }
    const held = items.some(
      (other, j) => j !== i && ROOM_CATALOG[other.kind].supports && restsOn(item, other),
    );
    if (!held) {
      floating.push(i);
    }
  });
  return floating;
}

/**
 * Pièce relue d'une sauvegarde (`readRoom`), éléments rendus cohérents (`tidyRoomItems`) ;
 * sans élément, rendue telle quelle.
 */
export function tidyRoom(room: Room): Room {
  if (!room.items || room.items.length === 0) {
    return room;
  }
  const items = tidyRoomItems(room.items);
  return items.length > 0
    ? { ...room, items }
    : { shown: room.shown, cabinetHeight: room.cabinetHeight };
}

/**
 * Éléments relus d'une sauvegarde, rendus cohérents (#200, cas 2) : reposés par gravité
 * (`settleRoomItems`), puis, dans l'ordre de la liste, un élément qui chevauche un élément
 * gardé avant lui ou qui reste en l'air est écarté, et ainsi de suite jusqu'à une pièce posée
 * (ce qu'il portait retombe). Une liste déjà cohérente est rendue à l'identique. Pur.
 */
export function tidyRoomItems(items: readonly RoomItem[]): readonly RoomItem[] {
  let work = settleRoomItems(items);
  // Chaque tour sans arrêt écarte au moins un élément : au plus `length` tours.
  for (let round = 0; round <= items.length; round++) {
    const kept: RoomItem[] = [];
    for (const item of work) {
      const box = roomItemBox(item);
      if (!kept.some((other) => boxesOverlap(box, roomItemBox(other)))) {
        kept.push(item);
      }
    }
    const floating = new Set(floatingRoomItems(kept));
    if (kept.length === work.length && floating.size === 0) {
      return work;
    }
    work = settleRoomItems(kept.filter((_, i) => !floating.has(i)));
  }
  return work;
}

/**
 * Fait retomber les éléments qui ne reposent plus sur rien (support retiré ou déplacé,
 * #182 transposé à la pièce) : du plus bas au plus haut (cascade), chacun descend jusqu'au
 * plus haut dessus chevauché sous sa base, ou jusqu'au parquet. S'il tomberait sur une
 * plante, il va au parquet si rien ne l'y gêne, sinon il reste en place. Un élément soutenu
 * garde sa pose à l'identique. Nouvelle liste, dans le même ordre ; ne modifie pas `items`.
 */
export function settleRoomItems(items: readonly RoomItem[]): readonly RoomItem[] {
  const work = [...items];
  const order = work
    .map((item, i) => ({ i, elevation: item.elevation ?? 0 }))
    .filter((e) => e.elevation > EPS)
    .sort((a, b) => a.elevation - b.elevation || a.i - b.i);
  for (const { i } of order) {
    const item = work[i];
    const from = item.elevation ?? 0;
    const others = work.filter((_, j) => j !== i);
    const box = roomItemBox(item);
    const { elevation, support } = landing(box, others, from);
    if (Math.abs(elevation - from) <= EPS) {
      continue;
    }
    if (!support || ROOM_CATALOG[support.kind].supports) {
      work[i] = atElevation(item, elevation);
      continue;
    }
    const grounded = atElevation(item, 0);
    const groundedBox = roomItemBox(grounded);
    if (!others.some((other) => boxesOverlap(groundedBox, roomItemBox(other)))) {
      work[i] = grounded;
    }
  }
  return work;
}

/** Blocs voxels de l'élément `item`, base à la hauteur `floorY` + élévation (repère du bac). */
function itemBlocks(item: RoomItem, floorY: number, out: RoomBlock[]): void {
  const base = floorY + (item.elevation ?? 0);
  for (const b of ROOM_CATALOG[item.kind].blocks) {
    const r = rotateRect(b.minX, b.maxX, b.minZ, b.maxZ, item.quarter);
    out.push({
      box: {
        minX: snap(item.x + r.minX / 100),
        maxX: snap(item.x + r.maxX / 100),
        minY: snap(base + b.minY / 100),
        maxY: snap(base + b.maxY / 100),
        minZ: snap(item.z + r.minZ / 100),
        maxZ: snap(item.z + r.maxZ / 100),
      },
      part: b.part,
      shade: b.shade,
    });
  }
}

/**
 * Blocs voxels des éléments de la pièce `room`, dans le repère du bac
 * (parquet en y = −hauteur du meuble), cotes arrondies au centimètre. Liste vide si la pièce
 * est masquée ou sans élément. Avec `only`, blocs de l'élément d'indice `only` seulement
 * (contour de sélection, #188) ; vide si l'indice est inconnu.
 */
export function furnitureBlocks(room: Room, only?: number): RoomBlock[] {
  const { shown, cabinetHeight } = clampRoom(room);
  if (!shown || !room.items) {
    return [];
  }
  const blocks: RoomBlock[] = [];
  room.items.forEach((item, i) => {
    if (only === undefined || only === i) {
      itemBlocks(item, -cabinetHeight, blocks);
    }
  });
  return blocks;
}

/**
 * Boîte englobant **tout** le modèle de `item` (feuillage compris), en mètres, y compté
 * depuis le parquet : cible du choix d'un élément à la souris (#188), plus large que sa
 * boîte de collision pour une plante.
 */
export function roomItemBounds(item: RoomItem): FurnitureBox {
  const blocks: RoomBlock[] = [];
  itemBlocks(item, 0, blocks);
  const box: { -readonly [K in keyof FurnitureBox]: number } = { ...blocks[0].box };
  for (const { box: b } of blocks) {
    box.minX = Math.min(box.minX, b.minX);
    box.maxX = Math.max(box.maxX, b.maxX);
    box.minY = Math.min(box.minY, b.minY);
    box.maxY = Math.max(box.maxY, b.maxY);
    box.minZ = Math.min(box.minZ, b.minZ);
    box.maxZ = Math.max(box.maxZ, b.maxZ);
  }
  return box;
}
