import { SAND_THICKNESS, type TankDimensions } from '../sim/tank';
import type { Vec3 } from './camera-presets';

/**
 * Éditeur de décor (issue #167) : point visé sur le sable, fonction pure sans Three.js (le
 * choix d'un élément touché passe par `DecorLayer.pickItem`).
 */

/** Résultat d'un clic en mode édition : un élément du décor, un point du sable, ou rien. */
export type DecorPick =
  | { readonly kind: 'item'; readonly index: number }
  | { readonly kind: 'sand'; readonly x: number; readonly z: number }
  | null;

/**
 * Point où le rayon (`origin`, `direction`) coupe le plan du dessus du sable
 * (Y = `SAND_THICKNESS`), en (x, z), **sans** borne au bac : glissement d'un élément (#168),
 * dont la position est bornée ensuite par `clampDecorPosition`. `null` si le rayon est
 * parallèle au plan ou s'en éloigne.
 */
export function sandPlanePoint(origin: Vec3, direction: Vec3): { x: number; z: number } | null {
  const dy = direction[1];
  if (Math.abs(dy) < 1e-9) {
    return null;
  }
  const t = (SAND_THICKNESS - origin[1]) / dy;
  if (!(t > 0) || !Number.isFinite(t)) {
    return null;
  }
  return { x: origin[0] + t * direction[0], z: origin[2] + t * direction[2] };
}

/**
 * Point où le rayon (`origin`, `direction`) coupe le dessus du sable du bac `dims`
 * (Y = `SAND_THICKNESS`), en (x, z) dans le repère du bac. `null` si le rayon est parallèle
 * au sable, s'en éloigne, ou le coupe hors du bac.
 */
export function sandPoint(
  origin: Vec3,
  direction: Vec3,
  dims: TankDimensions,
): { x: number; z: number } | null {
  const p = sandPlanePoint(origin, direction);
  return p && Math.abs(p.x) <= dims.width / 2 && Math.abs(p.z) <= dims.depth / 2 ? p : null;
}
