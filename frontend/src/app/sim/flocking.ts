import { SPECIES, type SchoolingParams } from './species';
import type { Fish, SwimBounds } from './swimmer';
import { keepInShape } from './pond-shape';

/**
 * Comportement de banc : règles de boids (séparation, alignement, cohésion).
 *
 * Fonctions pures et **sans allocation** : chaque résultat est écrit dans un vecteur `out`
 * fourni par l'appelant, qui est aussi renvoyé. Les voisins d'un poisson sont ses congénères
 * (même espèce, identifiant différent) dont le centre est **strictement** à moins du rayon
 * considéré. L'ordre de parcours est celui du tableau (identifiants croissants), ce qui
 * garde les sommes flottantes reproductibles.
 *
 * Toutes les fonctions lisent les positions et caps **courants** : le monde calcule d'abord
 * le pilotage de tous les poissons, puis les fait nager (`computeSchoolSteering`), si bien
 * que le résultat ne dépend pas de l'ordre de mise à jour.
 */

/** Vecteur 3D modifiable, en mètres ou sans dimension selon l'usage. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Paramètres de banc d'une espèce, ou `null` si elle est solitaire. */
export type SchoolingLookup = (fish: Fish) => SchoolingParams | null;

/** Paramètres de banc tirés de la définition d'espèce (`sim/species.ts`). */
export const speciesSchooling: SchoolingLookup = (fish) => SPECIES[fish.species].schooling;

/** Direction de nage unitaire du poisson (convention de `sim/swimmer.ts`). */
export function heading(fish: Fish, out: Vec3): Vec3 {
  const horizontal = Math.cos(fish.pitch);
  out.x = Math.cos(fish.yaw) * horizontal;
  out.y = Math.sin(fish.pitch);
  out.z = Math.sin(fish.yaw) * horizontal;
  return out;
}

/**
 * Séparation : somme, sur les voisins à moins de `radius`, du vecteur unitaire qui s'éloigne
 * du voisin, pondéré par `radius / d - 1` (0 au bord du rayon, 1 à mi-rayon, croissant sans
 * borne au contact). Deux poissons
 * confondus s'écartent selon X : le plus petit identifiant vers −X, l'autre vers +X.
 */
export function separation(self: Fish, fishes: readonly Fish[], radius: number, out: Vec3): Vec3 {
  out.x = 0;
  out.y = 0;
  out.z = 0;
  const r2 = radius * radius;
  for (const other of fishes) {
    if (!isCongener(self, other)) {
      continue;
    }
    const dx = self.x - other.x;
    const dy = self.y - other.y;
    const dz = self.z - other.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (!(d2 < r2)) {
      continue;
    }
    if (d2 === 0) {
      out.x += self.id < other.id ? -1 : 1;
      continue;
    }
    const d = Math.sqrt(d2);
    const k = (radius / d - 1) / d;
    out.x += dx * k;
    out.y += dy * k;
    out.z += dz * k;
  }
  return out;
}

/**
 * Alignement : cap moyen des voisins à moins de `radius`, moins le cap du poisson (vecteur
 * nul s'il n'a aucun voisin ou si tous nagent dans sa direction). Norme ≤ 2.
 */
export function alignment(self: Fish, fishes: readonly Fish[], radius: number, out: Vec3): Vec3 {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let count = 0;
  const r2 = radius * radius;
  for (const other of fishes) {
    if (!isCongener(self, other) || !(distanceSquared(self, other) < r2)) {
      continue;
    }
    const horizontal = Math.cos(other.pitch);
    sx += Math.cos(other.yaw) * horizontal;
    sy += Math.sin(other.pitch);
    sz += Math.sin(other.yaw) * horizontal;
    count++;
  }
  if (count === 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  heading(self, out);
  out.x = sx / count - out.x;
  out.y = sy / count - out.y;
  out.z = sz / count - out.z;
  return out;
}

/**
 * Cohésion : vecteur du poisson vers le barycentre des voisins à moins de `radius`, divisé
 * par `radius` (norme < 1). Vecteur nul sans voisin.
 */
export function cohesion(self: Fish, fishes: readonly Fish[], radius: number, out: Vec3): Vec3 {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let count = 0;
  const r2 = radius * radius;
  for (const other of fishes) {
    if (!isCongener(self, other) || !(distanceSquared(self, other) < r2)) {
      continue;
    }
    sx += other.x;
    sy += other.y;
    sz += other.z;
    count++;
  }
  if (count === 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  out.x = (sx / count - self.x) / radius;
  out.y = (sy / count - self.y) / radius;
  out.z = (sz / count - self.z) / radius;
  return out;
}

const SCRATCH_SEPARATION: Vec3 = { x: 0, y: 0, z: 0 };
const SCRATCH_ALIGNMENT: Vec3 = { x: 0, y: 0, z: 0 };
const SCRATCH_COHESION: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Pilotage de banc d'un poisson : somme pondérée de la séparation (rayon
 * `separationRadius`), de l'alignement et de la cohésion (rayon `neighborRadius`).
 * Sans dimension : il s'ajoute au cap unitaire pour donner la direction voulue
 * (`sim/swimmer.ts`, `stepFish`).
 */
export function schoolSteering(
  self: Fish,
  fishes: readonly Fish[],
  params: SchoolingParams,
  out: Vec3,
): Vec3 {
  const sep = separation(self, fishes, params.separationRadius, SCRATCH_SEPARATION);
  const ali = alignment(self, fishes, params.neighborRadius, SCRATCH_ALIGNMENT);
  const coh = cohesion(self, fishes, params.neighborRadius, SCRATCH_COHESION);
  out.x =
    sep.x * params.separationWeight +
    ali.x * params.alignmentWeight +
    coh.x * params.cohesionWeight;
  out.y =
    sep.y * params.separationWeight +
    ali.y * params.alignmentWeight +
    coh.y * params.cohesionWeight;
  out.z =
    sep.z * params.separationWeight +
    ali.z * params.alignmentWeight +
    coh.z * params.cohesionWeight;
  return out;
}

const SCRATCH_STEERING: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Calcule le pilotage de banc de chaque poisson, à partir des positions courantes, et
 * l'écrit dans `out` (`3 · i`, `3 · i + 1`, `3 · i + 2` pour le poisson `i`). Un poisson
 * d'espèce solitaire reçoit un pilotage nul.
 * @throws RangeError si `out` est trop court (moins de `3 · fishes.length` valeurs).
 */
export function computeSchoolSteering(
  fishes: readonly Fish[],
  out: Float64Array,
  schoolingFor: SchoolingLookup = speciesSchooling,
): void {
  if (out.length < fishes.length * 3) {
    throw new RangeError(
      `out doit contenir au moins ${fishes.length * 3} valeurs (reçu : ${out.length})`,
    );
  }
  for (let i = 0; i < fishes.length; i++) {
    const fish = fishes[i];
    const params = schoolingFor(fish);
    if (params === null) {
      out[3 * i] = 0;
      out[3 * i + 1] = 0;
      out[3 * i + 2] = 0;
      continue;
    }
    const s = schoolSteering(fish, fishes, params, SCRATCH_STEERING);
    out[3 * i] = s.x;
    out[3 * i + 1] = s.y;
    out[3 * i + 2] = s.z;
  }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Espacement minimal entre congénères d'espèce grégaire (`schooling.minDistance`) : chaque
 * paire trop proche est écartée symétriquement, le long de l'axe qui joint les centres
 * (deux centres confondus : selon X, le plus petit identifiant vers −X), puis chaque
 * poisson est ramené dans ses bornes `hard`. Une seule passe, paires dans l'ordre
 * `(i, j)`, `i < j` : déterministe, sans allocation. Une passe suffit pour des
 * chevauchements isolés ; dans un amas, le reliquat est résorbé aux pas suivants.
 * Modifie les positions **en place** (la position précédente, pour l'interpolation, est
 * conservée).
 */
export function enforceMinDistance(
  fishes: readonly Mutable<Fish>[],
  boundsOf: (fish: Fish) => SwimBounds,
  schoolingFor: SchoolingLookup = speciesSchooling,
): void {
  for (let i = 0; i < fishes.length; i++) {
    const a = fishes[i];
    const params = schoolingFor(a);
    if (params === null) {
      continue;
    }
    const min = params.minDistance;
    for (let j = i + 1; j < fishes.length; j++) {
      const b = fishes[j];
      if (!isCongener(a, b)) {
        continue;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (!(d2 < min * min)) {
        continue;
      }
      let ux = 1;
      let uy = 0;
      let uz = 0;
      const d = Math.sqrt(d2);
      if (d > 0) {
        ux = dx / d;
        uy = dy / d;
        uz = dz / d;
      } else if (a.id > b.id) {
        ux = -1;
      }
      const half = (min - d) / 2;
      a.x -= ux * half;
      a.y -= uy * half;
      a.z -= uz * half;
      b.x += ux * half;
      b.y += uy * half;
      b.z += uz * half;
      clampInto(a, boundsOf(a));
      clampInto(b, boundsOf(b));
    }
  }
}

function clampInto(fish: Mutable<Fish>, bounds: SwimBounds): void {
  const { hard } = bounds;
  fish.x = Math.min(Math.max(fish.x, hard.minX), hard.maxX);
  fish.y = Math.min(Math.max(fish.y, hard.minY), hard.maxY);
  fish.z = Math.min(Math.max(fish.z, hard.minZ), hard.maxZ);
  if (bounds.outline !== undefined) {
    keepInShape(fish, bounds.outline, bounds.outlineMargin ?? 0);
  }
}

function isCongener(self: Fish, other: Fish): boolean {
  return other.id !== self.id && other.species === self.species;
}

function distanceSquared(a: Fish, b: Fish): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}
