import type { EnvironmentId } from './environment';
import { isTankResizable, placeDimensions } from './environment';
import type { RoomBlock, RoomPart, RoomQuarter } from './room';
import { rotateRect } from './room-furniture';
import {
  SUPPORT_CATALOG,
  TANK_SIZES,
  supportRefusal,
  tankDimensionsOf,
  tankPlacementRefusal,
  type RoomState,
  type RoomSupport,
  type RoomTank,
  type SupportKind,
  type TankPlacement,
  type TankSizeId,
} from './room-state';
import type { TankDimensions } from './tank';

/**
 * Pièce de N bacs, lot 2b (#305, ADR 0074) : choix automatique d'un emplacement libre pour un
 * meuble ou un bac ajouté depuis le catalogue « Bacs et meubles », et blocs de rendu des
 * meubles supports et des bacs posés (rendu simplifié, opaque : les bacs posés sont figés).
 *
 * Repère : celui de la pièce (`sim/room-state.ts`), qui est aussi celui du bac affiché en X et
 * Z (bac historique au centre) ; les blocs sont rendus avec le parquet en y = −hauteur du
 * meuble implicite, comme ceux de `sim/room.ts`. Fonctions pures.
 */

/** Rectangle au sol, en mètres (aire de la pièce graphique ou obstacle). */
export interface FloorRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Pas de la recherche d'un emplacement libre, en centimètres. */
export const SPOT_STEP_CM = 10;

/** Jour laissé, si possible, entre un meuble ajouté et ce qui le borde côté centre (cm). */
export const SUPPORT_GAP_CM = 20;

/**
 * Centres candidats, en centimètres entiers, pour une emprise `w` × `d` (cm) dans `area` :
 * du fond (z minimal) vers l'avant, puis du centre vers les côtés (+x d'abord). Ordre fixe :
 * mêmes entrées, même emplacement.
 */
function candidates(area: FloorRect, w: number, d: number): (readonly [number, number])[] {
  const minX = Math.ceil(area.minX * 100 + w / 2);
  const maxX = Math.floor(area.maxX * 100 - w / 2);
  const minZ = Math.ceil(area.minZ * 100 + d / 2);
  const maxZ = Math.floor(area.maxZ * 100 - d / 2);
  const out: (readonly [number, number])[] = [];
  if (minX > maxX || minZ > maxZ) {
    return out;
  }
  const xs: number[] = [];
  const reach = Math.max(Math.abs(minX), Math.abs(maxX));
  for (let k = 0; k <= reach; k += SPOT_STEP_CM) {
    for (const x of k === 0 ? [0] : [k, -k]) {
      if (x >= minX && x <= maxX) {
        xs.push(x);
      }
    }
  }
  for (let z = minZ; z <= maxZ; z += SPOT_STEP_CM) {
    for (const x of xs) {
      out.push([x, z]);
    }
  }
  return out;
}

/** Décalages 0, ±pas, ±2 pas… jusqu'à `reach` (cm), du centre vers les bords. */
function outward(reach: number): number[] {
  const out = [0];
  for (let k = SPOT_STEP_CM; k <= reach; k += SPOT_STEP_CM) {
    out.push(k, -k);
  }
  return out;
}

/**
 * Centres candidats (cm, relatifs au centre du plateau `sw` × `sd`) d'un bac `w` × `d` : centré
 * si le plateau ne peut en porter qu'un dans sa longueur ; sinon rangés depuis le bord gauche,
 * pour en aligner plusieurs (étagère basse et petits bacs).
 */
function plateauCandidates(
  sw: number,
  sd: number,
  w: number,
  d: number,
): (readonly [number, number])[] {
  const reachX = Math.floor((sw - w) / 2);
  const reachZ = Math.floor((sd - d) / 2);
  if (reachX < 0 || reachZ < 0) {
    return [];
  }
  const xs = sw >= 2 * w ? [-reachX, ...outward(reachX).sort((a, b) => a - b)] : outward(reachX);
  const out: (readonly [number, number])[] = [];
  for (const z of outward(reachZ)) {
    for (const x of xs) {
      out.push([x, z]);
    }
  }
  return out;
}

function hitsObstacle(
  x: number,
  z: number,
  w: number,
  d: number,
  obstacles: readonly FloorRect[],
): boolean {
  const minX = (x - w / 2) / 100;
  const maxX = (x + w / 2) / 100;
  const minZ = (z - d / 2) / 100;
  const maxZ = (z + d / 2) / 100;
  return obstacles.some((o) => minX < o.maxX && o.minX < maxX && minZ < o.maxZ && o.minZ < maxZ);
}

/**
 * Premier emplacement libre (quart de tour 0) d'un meuble `kind` au sol : emprise dans
 * `area`, sans obstacle (`obstacles` : meubles de la pièce graphique), pose permise par
 * `supportRefusal`. `null` s'il n'y en a aucun.
 */
export function findSupportSpot(
  room: RoomState,
  kind: SupportKind,
  area: FloorRect,
  obstacles: readonly FloorRect[] = [],
): { readonly x: number; readonly z: number } | null {
  const model = SUPPORT_CATALOG[kind];
  for (const [x, z] of candidates(area, model.width, model.depth)) {
    if (hitsObstacle(x, z, model.width, model.depth, obstacles)) {
      continue;
    }
    const support: RoomSupport = {
      id: room.nextFurnitureId,
      kind,
      x: x / 100,
      z: z / 100,
      quarter: 0,
    };
    if (supportRefusal(room, support) === null) {
      // Un jour de `SUPPORT_GAP_CM` vers l'extérieur, s'il est libre : meubles moins tassés.
      const away = x === 0 ? 0 : Math.sign(x) * SUPPORT_GAP_CM;
      const spaced = { ...support, x: (x + away) / 100 };
      const free =
        away !== 0 &&
        x + away + model.width / 2 <= area.maxX * 100 &&
        x + away - model.width / 2 >= area.minX * 100 &&
        !hitsObstacle(x + away, z, model.width, model.depth, obstacles) &&
        supportRefusal(room, spaced) === null;
      return free ? { x: spaced.x, z: spaced.z } : { x: support.x, z: support.z };
    }
  }
  return null;
}

/** Dimensions d'un bac ajouté : la taille du catalogue si l'environnement est réglable. */
export function addedTankDimensions(environment: EnvironmentId, size: TankSizeId): TankDimensions {
  return isTankResizable(environment) ? TANK_SIZES[size].dimensions : placeDimensions(environment);
}

/**
 * Premier emplacement libre d'un bac `environment` de taille `size`, sur le meuble
 * `supportId` (en partant du centre du plateau) ou au sol (`null` : dans `area`, hors
 * `obstacles`), validé par `tankPlacementRefusal`. `null` s'il n'y en a aucun, si le meuble
 * est inconnu, ou si la pièce n'a aucun bac (modèle du bac sondé).
 */
export function findTankSpot(
  room: RoomState,
  environment: EnvironmentId,
  size: TankSizeId,
  supportId: number | null,
  area: FloorRect,
  obstacles: readonly FloorRect[] = [],
): TankPlacement | null {
  const model = room.tanks[0];
  if (model === undefined) {
    return null;
  }
  const dims = addedTankDimensions(environment, size);
  // Bac sondé : seules ses dimensions et son lieu comptent pour la pose (`tankBox`).
  const probe: RoomTank = {
    id: room.nextTankId,
    name: 'sonde',
    place: 'piece',
    placement: null,
    world: { ...model.world, environment, dimensions: dims },
  };
  const w = Math.round(dims.width * 100);
  const d = Math.round(dims.depth * 100);
  let spots: (readonly [number, number])[];
  if (supportId === null) {
    spots = candidates(area, w, d).filter(([x, z]) => !hitsObstacle(x, z, w, d, obstacles));
  } else {
    const support = room.furniture.find((item) => item.id === supportId);
    if (support === undefined) {
      return null;
    }
    const m = SUPPORT_CATALOG[support.kind];
    const [sw, sd] = support.quarter % 2 === 0 ? [m.width, m.depth] : [m.depth, m.width];
    const cx = Math.round(support.x * 100);
    const cz = Math.round(support.z * 100);
    spots = plateauCandidates(sw, sd, w, d).map(([x, z]) => [cx + x, cz + z] as const);
  }
  for (const [x, z] of spots) {
    const placement: TankPlacement = { supportId, x: x / 100, z: z / 100, quarter: 0 };
    if (tankPlacementRefusal(room, probe, placement) === null) {
      return placement;
    }
  }
  return null;
}

/** Bloc local (cm, centré, base au sol du meuble ou du bac). */
interface LocalBlock {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly part: RoomPart;
  readonly shade?: 0 | 1;
}

function place(
  local: readonly LocalBlock[],
  x: number,
  z: number,
  quarter: RoomQuarter,
  baseY: number,
  out: RoomBlock[],
): void {
  const snap = (v: number): number => Math.round(v * 100) / 100;
  for (const b of local) {
    const r = rotateRect(b.minX, b.maxX, b.minZ, b.maxZ, quarter);
    out.push({
      box: {
        minX: snap(x + r.minX / 100),
        maxX: snap(x + r.maxX / 100),
        minY: snap(baseY + b.minY / 100),
        maxY: snap(baseY + b.maxY / 100),
        minZ: snap(z + r.minZ / 100),
        maxZ: snap(z + r.maxZ / 100),
      },
      part: b.part,
      shade: b.shade ?? 0,
    });
  }
}

/** Blocs locaux d'un meuble support (cm) : façade vers +Z. */
function supportLocalBlocks(kind: SupportKind): LocalBlock[] {
  const { width, depth, height } = SUPPORT_CATALOG[kind];
  // Demi-cotes en centimètres entiers (emprises paires au catalogue).
  const hw = width / 2;
  const hd = depth / 2;
  const top = height - 4;
  if (kind === 'commode') {
    const blocks: LocalBlock[] = [
      { minX: -hw, maxX: hw, minY: top, maxY: height, minZ: -hd, maxZ: hd, part: 'plateau' },
      {
        minX: -hw + 1,
        maxX: hw - 1,
        minY: 8,
        maxY: top,
        minZ: -hd + 1,
        maxZ: hd - 2,
        part: 'caisson',
      },
      { minX: -hw + 4, maxX: hw - 4, minY: 0, maxY: 8, minZ: -hd + 4, maxZ: hd - 5, part: 'socle' },
    ];
    const doors = 2 * Math.max(1, Math.round((width - 2) / 80));
    const step = (width - 2) / doors;
    for (let i = 0; i < doors; i++) {
      const left = Math.round(-hw + 1 + i * step) + 1;
      const right = Math.round(-hw + 1 + (i + 1) * step) - 1;
      blocks.push({
        minX: left,
        maxX: right,
        minY: 9,
        maxY: top - 1,
        minZ: hd - 2,
        maxZ: hd - 1,
        part: 'porte',
      });
      const hx = i % 2 === 0 ? right - 4 : left + 2;
      const hy = Math.round(top - (top - 9) / 3);
      blocks.push({
        minX: hx,
        maxX: hx + 2,
        minY: hy - 4,
        maxY: hy + 4,
        minZ: hd - 1,
        maxZ: hd,
        part: 'poignee',
      });
    }
    return blocks;
  }
  // Étagère basse : plateau, deux montants, une tablette basse et un fond ; ouverte devant.
  return [
    { minX: -hw, maxX: hw, minY: top, maxY: height, minZ: -hd, maxZ: hd, part: 'plateau' },
    { minX: -hw, maxX: -hw + 3, minY: 0, maxY: top, minZ: -hd, maxZ: hd, part: 'caisson' },
    { minX: hw - 3, maxX: hw, minY: 0, maxY: top, minZ: -hd, maxZ: hd, part: 'caisson' },
    { minX: -hw + 3, maxX: hw - 3, minY: 4, maxY: 7, minZ: -hd, maxZ: hd - 2, part: 'caisson' },
    { minX: -hw + 3, maxX: hw - 3, minY: 7, maxY: top, minZ: -hd, maxZ: -hd + 2, part: 'porte' },
    { minX: -hw + 6, maxX: hw - 6, minY: 0, maxY: 4, minZ: -hd + 3, maxZ: hd - 5, part: 'socle' },
  ];
}

/**
 * Blocs locaux d'un bac posé (cm), rendu simplifié et opaque : substrat, eau jusqu'à 90 % de
 * la hauteur, cadre noir en haut, en bas et aux arêtes verticales.
 */
function tankLocalBlocks(dims: TankDimensions): LocalBlock[] {
  const w = Math.round(dims.width * 100);
  const d = Math.round(dims.depth * 100);
  const h = Math.round(dims.height * 100);
  const [x0, x1, z0, z1] = [-w / 2, w / 2, -d / 2, d / 2];
  const water = Math.round(h * 0.9);
  const blocks: LocalBlock[] = [
    { minX: x0 + 1, maxX: x1 - 1, minY: 2, maxY: 6, minZ: z0 + 1, maxZ: z1 - 1, part: 'substrat' },
    { minX: x0 + 1, maxX: x1 - 1, minY: 6, maxY: water, minZ: z0 + 1, maxZ: z1 - 1, part: 'eau' },
    { minX: x0, maxX: x1, minY: 0, maxY: 2, minZ: z0, maxZ: z1, part: 'cadre' },
    { minX: x0, maxX: x1, minY: h - 2, maxY: h, minZ: z0, maxZ: z0 + 1, part: 'cadre' },
    { minX: x0, maxX: x1, minY: h - 2, maxY: h, minZ: z1 - 1, maxZ: z1, part: 'cadre' },
    { minX: x0, maxX: x0 + 1, minY: h - 2, maxY: h, minZ: z0 + 1, maxZ: z1 - 1, part: 'cadre' },
    { minX: x1 - 1, maxX: x1, minY: h - 2, maxY: h, minZ: z0 + 1, maxZ: z1 - 1, part: 'cadre' },
  ];
  for (const [cx, cz] of [
    [x0, z0],
    [x1 - 1, z0],
    [x0, z1 - 1],
    [x1 - 1, z1 - 1],
  ] as const) {
    blocks.push({
      minX: cx,
      maxX: cx + 1,
      minY: 2,
      maxY: h - 2,
      minZ: cz,
      maxZ: cz + 1,
      part: 'cadre',
    });
  }
  return blocks;
}

/**
 * Blocs des meubles supports et des bacs posés de `room`, parquet en y = −`cabinetHeight`.
 * Les bacs à la position historique et le bassin ne sont pas dessinés ici (le premier est
 * le bac affiché, le second est au jardin). Liste vide pour une pièce du lot 1.
 */
export function roomLayoutBlocks(room: RoomState, cabinetHeight: number): RoomBlock[] {
  const out: RoomBlock[] = [];
  const floorY = -cabinetHeight;
  for (const support of room.furniture) {
    place(supportLocalBlocks(support.kind), support.x, support.z, support.quarter, floorY, out);
  }
  for (const tank of room.tanks) {
    const placement = tank.placement;
    if (placement === null || tank.place === 'jardin') {
      continue;
    }
    const support =
      placement.supportId === null
        ? undefined
        : room.furniture.find((item) => item.id === placement.supportId);
    const base = floorY + (support === undefined ? 0 : SUPPORT_CATALOG[support.kind].height / 100);
    place(
      tankLocalBlocks(tankDimensionsOf(tank)),
      placement.x,
      placement.z,
      placement.quarter,
      base,
      out,
    );
  }
  return out;
}
