import type { TankDimensions } from '../sim/tank';

/**
 * Vue en coupe du bassin enterré (issue #105, ADR 0031). Quand la caméra descend sous le
 * niveau du sol (vues de côté, de face, de dessous), le sol et la margelle du côté de la
 * caméra masqueraient toute l'eau : on retire ces côtés-là, comme une coupe de maquette, et
 * l'eau se lit de côté comme dans le bac. Au-dessus du sol, rien n'est retiré.
 */

/** Côté du bassin, désigné par la normale sortante de sa paroi. */
export type PondSide = '+x' | '-x' | '+z' | '-z';

export const POND_SIDES: readonly PondSide[] = ['+x', '-x', '+z', '-z'];

/**
 * Côtés à retirer pour une caméra en `(x, y, z)` (repère de la scène : bassin centré en X et
 * Z, fond sur y = 0) : ceux dont la caméra est au-delà de la paroi, si elle est plus basse
 * que `groundTop`. Un côté est retiré dès que sa paroi se trouve entre la caméra et l'eau.
 * Une position non finie ne retire rien (scène entière).
 */
export function cutawaySides(
  camera: readonly [number, number, number],
  dims: TankDimensions,
  groundTop: number,
): ReadonlySet<PondSide> {
  const [x, y, z] = camera;
  const hidden = new Set<PondSide>();
  if (![x, y, z, groundTop].every(Number.isFinite) || !(y < groundTop)) {
    return hidden;
  }
  const halfX = dims.width / 2;
  const halfZ = dims.depth / 2;
  if (x > halfX) {
    hidden.add('+x');
  } else if (x < -halfX) {
    hidden.add('-x');
  }
  if (z > halfZ) {
    hidden.add('+z');
  } else if (z < -halfZ) {
    hidden.add('-z');
  }
  return hidden;
}
