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

/** Bit de chaque côté dans un masque de coupe (`cutawayMask`), dans l'ordre de `POND_SIDES`. */
export const POND_SIDE_BITS: Readonly<Record<PondSide, number>> = Object.freeze({
  '+x': 1,
  '-x': 2,
  '+z': 4,
  '-z': 8,
});

/**
 * Masque des côtés à retirer pour une caméra en `(x, y, z)` (repère de la scène : bassin
 * centré en X et Z, fond sur y = 0) : ceux dont la caméra est au-delà de la paroi, si elle est
 * plus basse que `groundTop` (bits `POND_SIDE_BITS`). Un côté est retiré dès que sa paroi se
 * trouve entre la caméra et l'eau. Une position non finie ne retire rien (0, scène entière).
 * Sans allocation : appelée à chaque image (`setViewpoint`, #122).
 */
export function cutawayMask(
  x: number,
  y: number,
  z: number,
  dims: TankDimensions,
  groundTop: number,
): number {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    !Number.isFinite(groundTop) ||
    !(y < groundTop)
  ) {
    return 0;
  }
  const halfX = dims.width / 2;
  const halfZ = dims.depth / 2;
  let mask = 0;
  if (x > halfX) {
    mask |= POND_SIDE_BITS['+x'];
  } else if (x < -halfX) {
    mask |= POND_SIDE_BITS['-x'];
  }
  if (z > halfZ) {
    mask |= POND_SIDE_BITS['+z'];
  } else if (z < -halfZ) {
    mask |= POND_SIDE_BITS['-z'];
  }
  return mask;
}

/** Ensembles figés des côtés de chaque masque (0 à 15), partagés. */
const SIDES_OF_MASK: readonly ReadonlySet<PondSide>[] = Array.from(
  { length: 16 },
  (_, mask) => new Set(POND_SIDES.filter((side) => (mask & POND_SIDE_BITS[side]) !== 0)),
);

/**
 * Côtés d'un masque (`cutawayMask`), ensemble partagé : ne pas le modifier. Un masque hors de
 * [0, 15] ou non entier ne garde que ses quatre bits bas.
 */
export function sidesOfMask(mask: number): ReadonlySet<PondSide> {
  return SIDES_OF_MASK[mask & 15];
}

/**
 * Côtés à retirer pour une caméra en `camera` : `sidesOfMask(cutawayMask(…))`. Ensemble
 * partagé, à ne pas modifier.
 */
export function cutawaySides(
  camera: readonly [number, number, number],
  dims: TankDimensions,
  groundTop: number,
): ReadonlySet<PondSide> {
  return sidesOfMask(cutawayMask(camera[0], camera[1], camera[2], dims, groundTop));
}
