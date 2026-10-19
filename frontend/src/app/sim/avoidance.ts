import type { Vec3 } from './flocking';
import { obstacleBound, obstacleDistance, type Obstacle } from './obstacles';
import type { Box3 } from './tank';

/**
 * Évitement des parois, du sable, de la surface et des obstacles (ADR 0012).
 *
 * Fonctions pures et **sans allocation** : chaque résultat est écrit dans un vecteur `out`
 * fourni par l'appelant, qui est aussi renvoyé. Les forces sont sans dimension : chaque
 * paroi ou obstacle contribue sa normale (dirigée vers l'eau libre) pondérée par sa
 * **proximité** `proximity(d, range)`, nulle au-delà de `range`, 1 au contact.
 */

/**
 * Proximité d'une surface à la distance `d` (mètres) : `1 − d / range` pour `0 < d < range`,
 * 1 pour `d ≤ 0` (contact ou pénétration), 0 au-delà de `range`. Une portée nulle ou
 * négative, ou une distance non finie, donne 0 (aucune force).
 */
export function proximity(d: number, range: number): number {
  if (!(range > 0) || Number.isNaN(d) || !(d < range)) {
    return 0;
  }
  return d <= 0 ? 1 : 1 - d / range;
}

/**
 * Force d'évitement des six faces de la boîte `box` au point `(x, y, z)` : somme des normales
 * intérieures des faces à moins de `range`, pondérées par leur proximité. Chaque composante
 * est dans [−1, 1] ; deux faces opposées également proches s'annulent (boîte réduite à un
 * plan).
 */
export function wallAvoidance(
  x: number,
  y: number,
  z: number,
  box: Box3,
  range: number,
  out: Vec3,
): Vec3 {
  out.x = proximity(x - box.minX, range) - proximity(box.maxX - x, range);
  out.y = proximity(y - box.minY, range) - proximity(box.maxY - y, range);
  out.z = proximity(z - box.minZ, range) - proximity(box.maxZ - z, range);
  return out;
}

const SCRATCH_NORMAL: Vec3 = { x: 0, y: 0, z: 0 };
/** Points échantillonnés sur le segment de prospection (début, milieu, fin). */
const SAMPLES = [0, 0.5, 1] as const;

/**
 * Force d'évitement des obstacles le long du segment de prospection `a → b` (position du
 * poisson → point visé). Pour chaque obstacle, le point du segment le plus proche parmi trois
 * échantillons (début, milieu, fin) donne la distance `d` à la surface, diminuée de
 * `clearance` (marge du poisson) ; l'obstacle contribue sa normale sortante en ce point,
 * pondérée par `proximity(d − clearance, range)`. Échantillonner le segment évite qu'un petit
 * obstacle passe entre la position et le point visé sans être vu.
 */
export function obstacleAvoidance(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  obstacles: readonly Obstacle[],
  clearance: number,
  range: number,
  out: Vec3,
): Vec3 {
  out.x = 0;
  out.y = 0;
  out.z = 0;
  for (const obstacle of obstacles) {
    if (beyondReach(obstacle, ax, ay, az, bx, by, bz, clearance + range)) {
      continue; // contribution nulle de toute façon : proximity(d − clearance, range) = 0
    }
    let best = Infinity;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (const t of SAMPLES) {
      const d = obstacleDistance(
        obstacle,
        ax + (bx - ax) * t,
        ay + (by - ay) * t,
        az + (bz - az) * t,
        SCRATCH_NORMAL,
      );
      if (d < best) {
        best = d;
        nx = SCRATCH_NORMAL.x;
        ny = SCRATCH_NORMAL.y;
        nz = SCRATCH_NORMAL.z;
      }
    }
    const w = proximity(best - clearance, range);
    out.x += nx * w;
    out.y += ny * w;
    out.z += nz * w;
  }
  return out;
}

/**
 * Vrai si les trois échantillons du segment `a → b` sont à `reach` ou plus de la surface de
 * la sphère englobante de l'obstacle : la distance à l'obstacle, qu'elle minore, l'est
 * aussi. Rejet exact (même résultat que le calcul complet), sans racine carrée.
 */
function beyondReach(
  obstacle: Obstacle,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  reach: number,
): boolean {
  const b = obstacleBound(obstacle);
  const limit = b.radius + reach;
  if (!(limit > 0)) {
    return false;
  }
  const limit2 = limit * limit;
  for (const t of SAMPLES) {
    const dx = ax + (bx - ax) * t - b.x;
    const dy = ay + (by - ay) * t - b.y;
    const dz = az + (bz - az) * t - b.z;
    if (dx * dx + dy * dy + dz * dz < limit2) {
      return false;
    }
  }
  return true;
}

/**
 * Transforme une force d'évitement `(fx, fy, fz)` en déviation pour un poisson de cap
 * horizontal `yaw`, pour **contourner** au lieu de freiner. Dans le plan horizontal, si la
 * force s'oppose au cap (composante `dot < 0` le long du cap `u`), sa composante opposée
 * `dot · u` est remplacée par une composante de même grandeur `|dot|` perpendiculaire au cap,
 * du côté `side` : côté des caps croissants (`(−sin yaw, 0, cos yaw)`) si `side ≥ 0`, opposé
 * sinon. Le poisson longe ainsi la paroi ou l'obstacle au lieu de faire demi-tour sur place.
 * La composante verticale `fy` est recopiée (l'inclinaison est réglée à part).
 *
 * Choix (ADR 0012, oscillations constatées au cycle 9) :
 * - le résultat est **continu** en `yaw` (pas de renormalisation) : de petites forces
 *   voisines ne font pas basculer le côté du virage d'un pas à l'autre, notamment dans un
 *   coin ; pile face à la force, c'est `side` (la mémoire du virage du poisson) qui tranche ;
 * - le calcul est fait dans le plan horizontal et non en 3D : en 3D, un poisson incliné vers
 *   une paroi voit la composante opposée surestimée dans ce plan.
 */
export function deflect(
  fx: number,
  fy: number,
  fz: number,
  yaw: number,
  side: number,
  out: Vec3,
): Vec3 {
  out.y = fy;
  const ux = Math.cos(yaw);
  const uz = Math.sin(yaw);
  const dot = fx * ux + fz * uz;
  if (!(dot < 0)) {
    // Force dans le sens du cap : atténuée d'autant que le poisson s'éloigne déjà (nulle s'il
    // fuit tout droit), pour ne pas le faire tourner au-delà de la tangente.
    const norm = Math.sqrt(fx * fx + fz * fz);
    const keep = norm > 0 ? 1 - dot / norm : 1;
    out.x = fx * keep;
    out.z = fz * keep;
    return out;
  }
  const k = side >= 0 ? -dot : dot;
  out.x = fx - dot * ux - uz * k;
  out.z = fz - dot * uz + ux * k;
  return out;
}
