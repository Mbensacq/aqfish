import { deriveSeed, prngOutput } from '../core/random/prng';
import { environmentWater } from './environment';
import { fryScale } from './fry';
import type { SpeciesId } from './species';
import type { Entity, MutableWorld } from './world-types';

/**
 * Mue des crevettes naines et exuvies (issue #859, ADR 0188, `docs/ECOSYSTEME.md` § 3.3).
 *
 * Une crevette grandit en changeant de carapace : elle mue à intervalle régulier, d'autant plus
 * souvent qu'elle est petite, et laisse au sol son exuvie, une carapace vide et claire que le
 * bac recycle en quelques jours. Juste après la mue, sa nouvelle carapace est molle : elle se
 * cache, et aucun poisson ne la prend pendant `MOLT_HIDE_SECONDS`.
 *
 * Fonctions pures du temps simulé et de la graine : la crevette `id` mue aux instants
 * `k · intervalle − décalage` (`moltOffset`, tiré du hachage de la graine et de l'identifiant),
 * si bien que le pas fin et l'avance à gros pas donnent les mêmes mues, et que l'état « cachée »
 * se relit après un rechargement sans champ de plus. Seules les exuvies (`World.exuviae`), posées
 * là où la crevette a mué, sont enregistrées.
 *
 * Valeurs : **approximations de jeu** (temps compressé, un jour de jeu = 1 200 s). En vrai, une
 * jeune Neocaridina mue environ chaque semaine et un adulte toutes les trois à quatre semaines ;
 * la crevette mange souvent son exuvie, qui disparaît en quelques jours.
 */

/** Espèces qui muent (crevettes naines ; écrevisses et crabes : hors périmètre de #859). */
export const MOLT_SPECIES: readonly SpeciesId[] = Object.freeze(['cerise']);

/** Longueur réelle d'une crevette cerise adulte, en centimètres (FishKeeper : 3 cm). */
export const SHRIMP_ADULT_LENGTH_CM = 3;
/**
 * Intervalle entre deux mues par centimètre de crevette, en secondes simulées (approximation
 * de jeu) : un adulte de 3 cm mue tous les trois jours de jeu, un jeune deux fois plus souvent.
 */
export const MOLT_SECONDS_PER_CM = 1200;
/** Intervalle minimal entre deux mues, en secondes simulées (taille nulle ou invalide). */
export const MIN_MOLT_INTERVAL_SECONDS = 600;
/** Durée pendant laquelle une crevette fraîchement muée se cache (approximation de jeu). */
export const MOLT_HIDE_SECONDS = 300;
/** Durée de vie d'une exuvie au sol avant qu'elle se dissolve : trois jours de jeu. */
export const EXUVIA_LIFETIME_SECONDS = 3600;
/**
 * Hauteur d'une exuvie au-dessus du fond, en mètres : elle tombe au sable, même quand la crevette
 * a mué sur un rocher ou en pleine eau (comme un œuf posé, `EGG_SAND_LIFT`).
 */
export const EXUVIA_SAND_LIFT = 0.006;
/** Nombre maximal d'exuvies gardées (les plus anciennes partent d'abord). */
export const MAX_EXUVIAE = 32;

const UINT32_RANGE = 4294967296;
const MOLT_SALT = 0x3017;
/** Marge des fenêtres de temps (même raison que `sim/shrimp-colony.ts`). */
const WINDOW_EPSILON = 1e-9;

/** Exuvie posée au sol : carapace vide laissée par une mue. */
export interface Exuvia {
  readonly species: SpeciesId;
  /** Position, en mètres : sous la crevette au moment de la mue, au sable (`EXUVIA_SAND_LIFT`). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Cap de la crevette au moment de la mue, en radians. */
  readonly yaw: number;
  /** Échelle de la crevette au moment de la mue (`fryScale` : 1 pour un adulte). */
  readonly size: number;
  /** Temps simulé de la mue, en secondes. */
  readonly time: number;
}

/** Vrai si l'espèce mue (`MOLT_SPECIES`). */
export function moltsShell(species: SpeciesId): boolean {
  return MOLT_SPECIES.includes(species);
}

/** Longueur réelle de la crevette, en centimètres : adulte, ou jeune à son jalon de croissance. */
export function shrimpLengthCm(fish: Pick<Entity, 'growth'>): number {
  return SHRIMP_ADULT_LENGTH_CM * fryScale(fish.growth);
}

/**
 * Intervalle entre deux mues d'une crevette de `lengthCm` centimètres, en secondes simulées :
 * proportionnel à la taille, jamais sous `MIN_MOLT_INTERVAL_SECONDS` (taille nulle, négative ou
 * invalide comprise).
 */
export function moltIntervalSeconds(lengthCm: number): number {
  if (!(lengthCm > 0) || !Number.isFinite(lengthCm)) {
    return MIN_MOLT_INTERVAL_SECONDS;
  }
  return Math.max(MIN_MOLT_INTERVAL_SECONDS, MOLT_SECONDS_PER_CM * lengthCm);
}

/** Décalage du calendrier de mue de la crevette `id`, dans [0, `interval`). */
export function moltOffset(seed: number, id: number, interval: number): number {
  const u = prngOutput(deriveSeed(deriveSeed(seed, id), MOLT_SALT)) / UINT32_RANGE;
  return u * interval;
}

/**
 * Temps de la dernière mue de `fish` à `time` (inclus), d'après son calendrier, ou `null` si
 * aucune mue n'a eu lieu depuis la création du monde (temps strictement positif).
 */
export function lastMoltTime(fish: Entity, seed: number, time: number): number | null {
  if (!moltsShell(fish.species) || !(time > 0)) {
    return null;
  }
  const interval = moltIntervalSeconds(shrimpLengthCm(fish));
  const offset = moltOffset(seed, fish.id, interval);
  const k = Math.floor((time + offset) / interval + WINDOW_EPSILON);
  const molt = k * interval - offset;
  return molt > 0 ? molt : null;
}

/**
 * Vrai si la crevette s'est cachée après une mue récente (moins de `MOLT_HIDE_SECONDS`) :
 * aucun poisson ne la mange (approximation de jeu, `sim/shrimp-colony.ts`).
 */
export function isShrimpHiding(fish: Entity, seed: number, time: number): boolean {
  const molt = lastMoltTime(fish, seed, time);
  return molt !== null && time - molt < MOLT_HIDE_SECONDS;
}

/** Vrai si `fish` mue pendant le pas qui va de `start` (exclu) à `end` (inclus). */
export function moltsDuring(fish: Entity, seed: number, start: number, end: number): boolean {
  const molt = lastMoltTime(fish, seed, end);
  return molt !== null && molt > start;
}

/**
 * Mues et exuvies d'un pas `dt` qui vient de s'achever au temps `world.time`, **en modifiant**
 * `world` : les exuvies plus vieilles que `EXUVIA_LIFETIME_SECONDS` se dissolvent, puis chaque
 * crevette qui mue pendant le pas laisse la sienne au sable, sous elle (au plus `MAX_EXUVIAE`, les plus
 * anciennes partent). Sans exuvie, `world.exuviae` reste absent : un bac sans crevette est
 * inchangé au bit près. Renvoie le nombre de mues.
 */
export function stepMoltsInPlace(world: MutableWorld, dt: number): number {
  const time = world.time;
  const shells = world.exuviae ?? NO_EXUVIAE;
  const expired = shells.some((shell) => time - shell.time >= EXUVIA_LIFETIME_SECONDS);
  const molts = (fish: Entity): boolean => moltsDuring(fish, world.seed, time - dt, time);
  if (!expired && !world.entities.some(molts)) {
    return 0;
  }
  const molting = world.entities.filter(molts);
  const kept = shells.filter((shell) => time - shell.time < EXUVIA_LIFETIME_SECONDS);
  // Dans l'ordre des mues, même quand un gros pas en achève plusieurs.
  const floor = environmentWater(world).minY + EXUVIA_SAND_LIFT;
  const fresh = molting.map((fish) =>
    exuviaOf(fish, floor, lastMoltTime(fish, world.seed, time) ?? time),
  );
  kept.push(...fresh.sort((a, b) => a.time - b.time));
  if (kept.length === 0) {
    delete world.exuviae;
    return 0;
  }
  world.exuviae = kept.slice(Math.max(0, kept.length - MAX_EXUVIAE));
  return molting.length;
}

const NO_EXUVIAE: readonly Exuvia[] = Object.freeze([]);

function exuviaOf(fish: Entity, floor: number, time: number): Exuvia {
  return {
    species: fish.species,
    x: fish.x,
    y: floor,
    z: fish.z,
    yaw: fish.yaw,
    size: fryScale(fish.growth),
    time,
  };
}

/** Âge d'une exuvie à `time`, ramené à [0, 1] de sa durée de vie (0 : fraîche). */
export function exuviaAge(shell: Pick<Exuvia, 'time'>, time: number): number {
  return Math.min(1, Math.max(0, (time - shell.time) / EXUVIA_LIFETIME_SECONDS));
}
