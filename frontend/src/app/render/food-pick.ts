import { isInsideTank } from '../sim/food';
import { waterVolume, type Box3, type TankDimensions } from '../sim/tank';
import type { Vec3 } from './camera-presets';

/**
 * Nourrissage au clic (issue #67) : fonctions pures, sans Three.js, pour distinguer un clic
 * d'un glisser de caméra et trouver le point visé sur la surface de l'eau.
 */

/**
 * Déplacement maximal du pointeur entre l'appui et le relâchement, en pixels CSS, pour
 * qu'un geste compte comme un clic (au-delà : glisser de caméra, rien n'est déposé).
 */
export const CLICK_TOLERANCE_PX = 4;

/** Appui ou relâchement du pointeur, en pixels CSS. */
export interface PointerSample {
  readonly x: number;
  readonly y: number;
}

/** Vrai si le pointeur a bougé d'au plus `tolerance` pixels entre `down` et `up`. */
export function isClick(
  down: PointerSample,
  up: PointerSample,
  tolerance: number = CLICK_TOLERANCE_PX,
): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= tolerance;
}

/**
 * Coordonnées normalisées (NDC, dans [-1, 1], Y vers le haut) d'un point de l'écran
 * (`clientX`, `clientY`) dans un rectangle d'affichage. `null` si le rectangle est vide ou
 * si le point en sort.
 */
export function toNormalizedDevice(
  clientX: number,
  clientY: number,
  rect: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
): PointerSample | null {
  if (!(rect.width > 0) || !(rect.height > 0)) {
    return null;
  }
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = 1 - ((clientY - rect.top) / rect.height) * 2;
  return Math.abs(x) <= 1 && Math.abs(y) <= 1 ? { x, y } : null;
}

/**
 * Point où le rayon (`origin`, `direction`) coupe le plan de la surface de l'eau du bac
 * `dims`, en (x, z) dans le repère du bac. `null` si le rayon est parallèle au plan, s'il
 * s'en éloigne, ou si le point est hors du bac (clic à côté).
 */
export function waterSurfacePoint(
  origin: Vec3,
  direction: Vec3,
  dims: TankDimensions,
  water: Box3 = waterVolume(dims),
): { x: number; z: number } | null {
  const dy = direction[1];
  if (Math.abs(dy) < 1e-9) {
    return null;
  }
  const t = (water.maxY - origin[1]) / dy;
  if (!(t > 0) || !Number.isFinite(t)) {
    return null;
  }
  const x = origin[0] + t * direction[0];
  const z = origin[2] + t * direction[2];
  return isInsideTank(x, z, water) ? { x, z } : null;
}
