import { rockSpheres, type DecorItem } from './decor';
import { EGG_GLASS_INSET, EGG_SAND_LIFT, spawnDraw, type MutableEgg } from './eggs';
import type { LeafClutch } from './eggs-leaf';
import type { Sphere } from './obstacles';
import type { Box3 } from './tank';

/**
 * Capsules d'œufs de la néritine (issue #678, ADR 0184).
 *
 * FishKeeper et Aquarium Breeder : la néritine pond de petites capsules blanches et dures,
 * isolées, sur les surfaces dures du décor ; en eau douce, elles n'éclosent pas (l'eau doit
 * être saumâtre, `NERITE_HATCHES_IN_FRESHWATER` de `sim/shrimp-colony.ts`). Chaque capsule est
 * donc collée, seule, sur le dessus ou le flanc d'un rocher du décor tiré de la ponte : sur la
 * surface d'une de ses sphères de collision (`rockSpheres`), ressortie des sphères voisines
 * qui la recouvriraient, au-dessus du sable. Le bois flotté et les plantes ne reçoivent rien
 * (surfaces dures : les rochers seulement, approximation de jeu).
 */

/** Plus basse composante verticale de la direction d'une capsule sur sa sphère (flancs et dessus). */
export const CAPSULE_MIN_UP = -0.2;

/** Nombre d'essais pour poser une capsule hors des rochers voisins. */
export const CAPSULE_TRIES = 4;

interface Point {
  x: number;
  y: number;
  z: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Rochers du décor (liste vide pour un décor absent). */
export function hardSurfaces(decor: readonly DecorItem[] | null | undefined): DecorItem[] {
  return (decor ?? []).filter((item) => item.kind === 'rock');
}

/**
 * Ponte `spawn` de `species` en capsules (issue #678), au plus `count` : chaque capsule tire un
 * rocher, une de ses sphères et une direction (azimut, hauteur au-dessus de `CAPSULE_MIN_UP`),
 * puis se pose à `EGG_GLASS_INSET` de la surface, hors des autres sphères (`capsulePoint`).
 * Sans rocher (`null`, `undefined`, décor sans rocher), aucune capsule. Toutes dans `water`, au-dessus de `EGG_SAND_LIFT`, âge 0, surface `'rocher'`.
 */
export function layCapsuleClutch(
  clutch: LeafClutch,
  water: Box3,
  decor: readonly DecorItem[] | null | undefined,
): MutableEgg[] {
  const { species, count } = clutch;
  const eggs: MutableEgg[] = [];
  const rocks = hardSurfaces(decor).map(rockSpheres);
  if (count <= 0 || rocks.length === 0) {
    return eggs;
  }
  const all = rocks.flat();
  for (let k = 0; k < count; k++) {
    const p = capsulePoint(clutch, k, rocks, all);
    eggs.push({
      species,
      x: clamp(p.x, water.minX + EGG_GLASS_INSET, water.maxX - EGG_GLASS_INSET),
      y: clamp(p.y, water.minY + EGG_SAND_LIFT, water.maxY - EGG_GLASS_INSET),
      z: clamp(p.z, water.minZ + EGG_GLASS_INSET, water.maxZ - EGG_GLASS_INSET),
      age: 0,
      surface: 'rocher',
    });
  }
  return eggs;
}

/**
 * Point de la capsule `k` : jusqu'à `CAPSULE_TRIES` essais (rocher, sphère, direction tirés du
 * hachage), dont le premier hors de toutes les sphères des rochers `all` est gardé ; sinon le
 * dernier, ressorti des sphères qui le recouvrent (`surfaceOut`).
 */
function capsulePoint(
  { seed, species, spawn }: LeafClutch,
  k: number,
  rocks: readonly (readonly Sphere[])[],
  all: readonly Sphere[],
): Point {
  const draw = (j: number): number => spawnDraw(seed, species, spawn, j);
  const pick = (u: number, n: number): number => Math.min(n - 1, Math.floor(u * n));
  const p = { x: 0, y: 0, z: 0 };
  for (let attempt = 0; attempt < CAPSULE_TRIES; attempt++) {
    const base = 8 + 4 * (k * CAPSULE_TRIES + attempt);
    const spheres = rocks[pick(draw(base), rocks.length)];
    const sphere = spheres[pick(draw(base + 1), spheres.length)];
    const angle = draw(base + 2) * 2 * Math.PI;
    const up = CAPSULE_MIN_UP + (1 - CAPSULE_MIN_UP) * draw(base + 3);
    const flat = Math.sqrt(1 - up * up);
    const r = sphere.radius + EGG_GLASS_INSET;
    p.x = sphere.x + Math.cos(angle) * flat * r;
    p.y = sphere.y + up * r;
    p.z = sphere.z + Math.sin(angle) * flat * r;
    if (!all.some((s) => isInside(p, s))) {
      return p;
    }
  }
  surfaceOut(p, all);
  return p;
}

const isInside = (p: Point, s: Sphere): boolean =>
  Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) < s.radius + EGG_GLASS_INSET - 1e-9;

/**
 * Ressort `p` des sphères de `spheres` qui le contiennent, **en place** : chacune, dans l'ordre,
 * le ramène à `EGG_GLASS_INSET` de sa surface, le long de la droite qui part de son centre.
 */
function surfaceOut(p: Point, spheres: readonly Sphere[]): void {
  for (const s of spheres) {
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const dz = p.z - s.z;
    const d = Math.hypot(dx, dy, dz);
    const r = s.radius + EGG_GLASS_INSET;
    if (d >= r - 1e-9) {
      continue;
    }
    const n = d > 1e-9 ? r / d : 0;
    p.x = s.x + dx * n;
    p.y = d > 1e-9 ? s.y + dy * n : s.y + r;
    p.z = s.z + dz * n;
  }
}
