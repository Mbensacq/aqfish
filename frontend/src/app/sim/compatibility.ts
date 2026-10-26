import { SPECIES, type SpeciesId } from './species';
import type { Fish, SwimBounds } from './swimmer';

/**
 * Compatibilité des espèces (issue #209, ADR 0055) : tempérament de chaque espèce, verdict
 * par couple, et mélanges déconseillés d'une population.
 *
 * Pur, déterministe, sans hasard. Tempéraments et règles : **approximations de jeu**,
 * inspirées des conseils usuels de maintenance (non sourcés ici), pas des mesures.
 */

/** Tempérament d'une espèce envers les autres espèces. */
export type Temperament = 'paisible' | 'territorial' | 'predateur';

/**
 * Tempérament de chaque espèce ; le type impose une entrée pour toute nouvelle espèce.
 *
 * - `predateur` : mange ou blesse les espèces plus petites qu'elle (koï, axolotl).
 * - `territorial` : défend un territoire contre les autres espèces territoriales
 *   (poisson-clown autour de son anémone).
 * - `paisible` : aucun conflit de son fait.
 */
export const TEMPERAMENTS: Readonly<Record<SpeciesId, Temperament>> = {
  neon: 'paisible',
  guppy: 'paisible',
  corydora: 'paisible',
  koi: 'predateur',
  axolotl: 'predateur',
  grenouille: 'paisible',
  triton: 'paisible',
  clown: 'territorial',
  chirurgien: 'paisible',
};

/** Verdict pour un couple d'espèces. */
export type Compatibility = 'compatible' | 'predateur' | 'territorial';

/** Vrai si `id` est une espèce connue (clé propre de `SPECIES`, pas du prototype). */
function known(id: string): id is SpeciesId {
  return Object.hasOwn(SPECIES, id);
}

/**
 * Compatibilité de deux espèces, symétrique (`compatibility(a, b) === compatibility(b, a)`) :
 *
 * - même espèce, ou espèce inconnue (aucune information) : `'compatible'` ;
 * - un prédateur et une espèce **strictement** plus petite (`bodyLength`) : `'predateur'` ;
 * - deux espèces territoriales différentes : `'territorial'` ;
 * - sinon `'compatible'`.
 *
 * Deux prédateurs de tailles différentes : `'predateur'` (le grand mange le petit).
 */
export function compatibility(a: string, b: string): Compatibility {
  if (a === b || !known(a) || !known(b)) {
    return 'compatible';
  }
  const ta = TEMPERAMENTS[a];
  const tb = TEMPERAMENTS[b];
  const la = SPECIES[a].bodyLength;
  const lb = SPECIES[b].bodyLength;
  if ((ta === 'predateur' && lb < la) || (tb === 'predateur' && la < lb)) {
    return 'predateur';
  }
  if (ta === 'territorial' && tb === 'territorial') {
    return 'territorial';
  }
  return 'compatible';
}

/** Vrai si les deux espèces sont déconseillées ensemble (`compatibility` ≠ `'compatible'`). */
export function incompatible(a: string, b: string): boolean {
  return compatibility(a, b) !== 'compatible';
}

/** Mélange déconseillé d'une population : deux espèces présentes et leur verdict. */
export interface MixWarning {
  readonly first: SpeciesId;
  readonly second: SpeciesId;
  readonly reason: Exclude<Compatibility, 'compatible'>;
}

/**
 * Mélanges déconseillés d'une population : chaque couple d'espèces d'effectif strictement
 * positif (et fini) dont le verdict n'est pas `'compatible'`, dans l'ordre de `order` (couple
 * `(i, j)`, `i < j`). Espèces inconnues et doublons de `order` ignorés.
 */
export function mixWarnings(
  order: readonly string[],
  counts: Readonly<Partial<Record<string, number>>>,
): MixWarning[] {
  const present: SpeciesId[] = [];
  for (const id of order) {
    const count = Object.hasOwn(counts, id) ? counts[id] : undefined;
    if (
      known(id) &&
      !present.includes(id) &&
      count !== undefined &&
      count > 0 &&
      count < Infinity
    ) {
      present.push(id);
    }
  }
  const warnings: MixWarning[] = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const reason = compatibility(present[i], present[j]);
      if (reason !== 'compatible') {
        warnings.push({ first: present[i], second: present[j], reason });
      }
    }
  }
  return warnings;
}

/**
 * Distance minimale, en mètres, entre les centres de deux poissons nageurs d'espèces
 * incompatibles (`enforceRivalDistance`, `sim/flocking.ts`) : approximation de jeu, environ
 * une longueur de koï.
 */
export const RIVAL_MIN_DISTANCE = 0.15;
/** Portée de l'évitement anticipé entre espèces incompatibles (pilotage), en mètres. */
export const RIVAL_AVOID_RADIUS = 0.3;
/** Poids de l'évitement anticipé, ajouté au pilotage de banc. */
export const RIVAL_AVOID_WEIGHT = 2;

/** Espèces déconseillées avec chaque espèce, calculées une fois (`compatibility`). */
const RIVALS: Readonly<Record<SpeciesId, ReadonlySet<SpeciesId>>> = Object.fromEntries(
  (Object.keys(SPECIES) as SpeciesId[]).map((a) => [
    a,
    new Set((Object.keys(SPECIES) as SpeciesId[]).filter((b) => incompatible(a, b))),
  ]),
) as unknown as Record<SpeciesId, ReadonlySet<SpeciesId>>;

/** Vrai pour un poisson nageur (ni marcheur du fond, ni amphibie) : seuls eux s'évitent. */
export function isSwimmer(fish: Fish): boolean {
  const def = SPECIES[fish.species];
  return def.walker === undefined && def.amphibian === undefined;
}

function rivals(a: Fish, b: Fish): boolean {
  return a.id !== b.id && RIVALS[a.species].has(b.species) && isSwimmer(a) && isSwimmer(b);
}

/**
 * Vrai si au moins deux poissons nageurs de la liste sont d'espèces incompatibles. Sans
 * allocation ; O(n²) au pire, O(n) quand tous sont de la même espèce.
 */
export function hasRivals(fishes: readonly Fish[]): boolean {
  for (let i = 0; i < fishes.length; i++) {
    const a = fishes[i];
    if (RIVALS[a.species].size === 0 || !isSwimmer(a)) {
      continue;
    }
    for (let j = i + 1; j < fishes.length; j++) {
      if (rivals(a, fishes[j])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Évitement anticipé (issue #209) : ajoute au pilotage `out` (même disposition que
 * `computeSchoolSteering`, `3 · i` à `3 · i + 2`) de chaque poisson nageur, pour chaque
 * poisson nageur d'espèce incompatible à moins de `RIVAL_AVOID_RADIUS`, un vecteur qui s'en
 * éloigne, pondéré par `RIVAL_AVOID_WEIGHT · (radius / d − 1)` (comme la séparation du banc).
 * Deux centres confondus : selon X, le plus petit identifiant vers −X. Aucun couple
 * incompatible : `out` n'est pas touché. Lit les positions courantes ; sans allocation.
 */
export function addRivalSteering(fishes: readonly Fish[], out: Float64Array): void {
  const radius = RIVAL_AVOID_RADIUS;
  const r2 = radius * radius;
  for (let i = 0; i < fishes.length; i++) {
    const self = fishes[i];
    if (RIVALS[self.species].size === 0) {
      continue;
    }
    for (const other of fishes) {
      if (!rivals(self, other)) {
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
        out[3 * i] += (self.id < other.id ? -1 : 1) * RIVAL_AVOID_WEIGHT;
        continue;
      }
      const d = Math.sqrt(d2);
      const k = (RIVAL_AVOID_WEIGHT * (radius / d - 1)) / d;
      out[3 * i] += dx * k;
      out[3 * i + 1] += dy * k;
      out[3 * i + 2] += dz * k;
    }
  }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Distance minimale entre poissons nageurs d'espèces incompatibles (issue #209) : chaque
 * paire à moins de `minDistance` est écartée symétriquement le long de l'axe des centres
 * (centres confondus : selon X, le plus petit identifiant vers −X), puis chaque poisson est
 * ramené dans ses bornes `hard`. `passes` passes au plus, arrêtées dès qu'aucune paire n'a
 * bougé : un poisson écarté d'un rival peut en approcher un autre. Paires `(i, j)`, `i < j`,
 * dans l'ordre du tableau : déterministe, sans allocation. Modifie les positions en place.
 */
export function enforceRivalDistance(
  fishes: readonly Mutable<Fish>[],
  boundsOf: (fish: Fish) => SwimBounds,
  minDistance: number = RIVAL_MIN_DISTANCE,
  passes = 4,
): void {
  const min2 = minDistance * minDistance;
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < fishes.length; i++) {
      const a = fishes[i];
      if (RIVALS[a.species].size === 0) {
        continue;
      }
      for (let j = i + 1; j < fishes.length; j++) {
        const b = fishes[j];
        if (!rivals(a, b)) {
          continue;
        }
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (!(d2 < min2)) {
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
        // Légèrement au-delà de la moitié : la paire sort franchement de la distance minimale
        // malgré les arrondis.
        const half = (minDistance - d) / 2 + 1e-6;
        a.x -= ux * half;
        a.y -= uy * half;
        a.z -= uz * half;
        b.x += ux * half;
        b.y += uy * half;
        b.z += uz * half;
        clampInto(a, boundsOf(a));
        clampInto(b, boundsOf(b));
        moved = true;
      }
    }
    if (!moved) {
      return;
    }
  }
}

function clampInto(fish: Mutable<Fish>, bounds: SwimBounds): void {
  const { hard } = bounds;
  fish.x = Math.min(Math.max(fish.x, hard.minX), hard.maxX);
  fish.y = Math.min(Math.max(fish.y, hard.minY), hard.maxY);
  fish.z = Math.min(Math.max(fish.z, hard.minZ), hard.maxZ);
}
