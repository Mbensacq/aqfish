import { clampRoom, type Room } from '../sim/room';
import { roomArea, roomItemBounds, type FurnitureBox } from '../sim/room-furniture';
import type { TankDimensions } from '../sim/tank';
import type { Vec3 } from './camera-presets';

/**
 * Éditeur de la pièce (issue #188) : élément ou point du parquet visé par un rayon de la
 * caméra, par des fonctions pures sans Three.js (boîtes alignées sur les axes, repère du bac).
 */

/** Cible d'un rayon dans la pièce : élément touché (point visé sur lui) ou point du parquet. */
export type RoomPick =
  | {
      readonly kind: 'room-item';
      readonly index: number;
      readonly x: number;
      readonly z: number;
      readonly distance: number;
    }
  | { readonly kind: 'floor'; readonly x: number; readonly z: number; readonly distance: number };

/**
 * Distance (paramètre du rayon, direction quelconque) où le rayon entre dans la boîte `box`,
 * méthode des dalles ; 0 si l'origine est dedans ; `null` si le rayon la manque.
 */
export function rayBoxDistance(origin: Vec3, direction: Vec3, box: FurnitureBox): number | null {
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  const bounds: readonly (readonly [number, number])[] = [
    [box.minX, box.maxX],
    [box.minY, box.maxY],
    [box.minZ, box.maxZ],
  ];
  for (let axis = 0; axis < 3; axis++) {
    const [min, max] = bounds[axis];
    const o = origin[axis];
    const d = direction[axis];
    if (Math.abs(d) < 1e-12) {
      if (o < min || o > max) {
        return null;
      }
      continue;
    }
    let t0 = (min - o) / d;
    let t1 = (max - o) / d;
    if (t0 > t1) {
      [t0, t1] = [t1, t0];
    }
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) {
      return null;
    }
  }
  return near;
}

/**
 * Cible du rayon (`origin`, `direction`) dans la pièce `room` autour d'un bac `dims` : le plus
 * proche élément touché (boîte de tout son modèle, `roomItemBounds`), sinon le point du
 * parquet visé dans les limites de la pièce (`roomArea`). `null` si le bac ou son meuble
 * cachent la cible, si la pièce est masquée, ou si le rayon ne touche rien.
 */
export function pickRoom(
  origin: Vec3,
  direction: Vec3,
  dims: TankDimensions,
  room: Room,
): RoomPick | null {
  const { shown, cabinetHeight } = clampRoom(room);
  if (!shown) {
    return null;
  }
  const floorY = -cabinetHeight;
  const area = roomArea(dims);
  // Le meuble et le bac au-dessus (eau, vitres) cachent ce qui est derrière eux.
  const cover: FurnitureBox = {
    ...area.cabinet,
    minY: floorY,
    maxY: dims.height,
  };
  let best: RoomPick | null = null;
  (room.items ?? []).forEach((item, index) => {
    const local = roomItemBounds(item);
    const box = { ...local, minY: local.minY + floorY, maxY: local.maxY + floorY };
    const t = rayBoxDistance(origin, direction, box);
    if (t !== null && (best === null || t < best.distance)) {
      const x = origin[0] + t * direction[0];
      const z = origin[2] + t * direction[2];
      best = { kind: 'room-item', index, x, z, distance: t };
    }
  });
  if (best === null && direction[1] < -1e-9) {
    const t = (floorY - origin[1]) / direction[1];
    const x = origin[0] + t * direction[0];
    const z = origin[2] + t * direction[2];
    if (
      t > 0 &&
      Number.isFinite(t) &&
      x >= area.minX &&
      x <= area.maxX &&
      z >= area.minZ &&
      z <= area.maxZ
    ) {
      best = { kind: 'floor', x, z, distance: t };
    }
  }
  const hidden = rayBoxDistance(origin, direction, cover);
  const found = best as RoomPick | null;
  return found && (hidden === null || hidden >= found.distance) ? found : null;
}
