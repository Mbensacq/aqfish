import { deriveSeed } from '../core/random/prng';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import type { SpeciesId } from './species';
import { speciesSheet } from './species-sheet';

/**
 * Vieillissement et durée de vie (issue #857, ADR 0187) : chaque animal a un âge, compté en
 * jours de jeu (`DEFAULT_DAY_LENGTH_SECONDS`, comme les saisons, ADR 0186) et des années de
 * `DAYS_PER_YEAR` jours. Passé la durée de vie moyenne de son espèce (milieu de la plage
 * `lifespan` de sa fiche, `sim/species-sheet.ts`), sa vitalité baisse doucement et il finit
 * par mourir de vieillesse, si la mortalité est activée (`World.mortality`, ADR 0137).
 *
 * **Naissance** : `Fish.bornAt`, temps simulé de la naissance en secondes (négatif : avant la
 * création du monde). Absente (animaux du monde neuf, toute sauvegarde antérieure), elle vaut
 * `−initialAgeSeconds(graine, identifiant, espèce)` : un âge adulte tiré de la graine, sans
 * aucun champ écrit, si bien que le monde neuf reste identique au bit près. Un alevin naît
 * au temps de sa naissance ; un animal ajouté en cours de partie arrive adulte.
 *
 * **Déterminisme** : tirages par hachage de (graine, identifiant) ou (graine, pas,
 * identifiant), sans état ni sous-générateur consommé (même principe que `mortalityDraw`).
 *
 * Toutes les valeurs sont des **approximations de jeu** : la plage de durée de vie de chaque
 * fiche en est une (ADR 0113), et aucune source ne chiffre un déclin de fin de vie.
 */

/** Jours de jeu d'une année (sans années bissextiles, comme `sim/pond-season.ts`). */
export const DAYS_PER_YEAR = 365;
/** Secondes simulées d'une année de jeu. */
export const YEAR_SECONDS = DAYS_PER_YEAR * DEFAULT_DAY_LENGTH_SECONDS;
/** Part de la durée de vie déjà vécue par un adulte au plus jeune (monde neuf, ajout). */
export const ADULT_MIN_SHARE = 0.25;
/** Part de la durée de vie déjà vécue par un adulte au plus âgé (monde neuf, ajout). */
export const ADULT_MAX_SHARE = 0.6;
/**
 * Durée du déclin, en part de la durée de vie : la vitalité passe de 1 à 0 entre la durée de
 * vie moyenne et `1 + DECLINE_SHARE` fois celle-ci.
 */
export const DECLINE_SHARE = 0.1;
/**
 * Taux de décès de vieillesse à vitalité nulle, en s⁻¹ : cinq jours de jeu en moyenne. Le taux
 * croît avec le déclin (`oldAgeRate`) : un animal meurt en général pendant son déclin.
 */
export const OLD_AGE_RATE = 1 / (5 * DEFAULT_DAY_LENGTH_SECONDS);

/** Sel du hachage de l'âge initial (séparé des autres usages de la graine). */
const AGE_SALT = 0x0a9e1f00;
/** Sel du hachage des tirages de décès de vieillesse. */
const OLD_AGE_SALT = 0x01d0a6e5;

/** Ce que le vieillissement lit d'un animal. */
export interface AgingSubject {
  readonly id: number;
  readonly species: SpeciesId;
  /** Temps simulé de la naissance, en secondes ; absent : tiré de la graine. */
  readonly bornAt?: number;
}

/** Durée de vie moyenne de `species` en captivité, en années : milieu de la plage de sa fiche. */
export function averageLifespanYears(species: SpeciesId): number {
  const { min, max } = speciesSheet(species).lifespan.value;
  return (min + max) / 2;
}

/** Durée de vie moyenne de `species`, en secondes simulées. */
export function lifespanSeconds(species: SpeciesId): number {
  return averageLifespanYears(species) * YEAR_SECONDS;
}

/**
 * Âge d'adulte tiré de la graine pour l'animal `id` de `species`, en secondes simulées, dans
 * [`ADULT_MIN_SHARE`, `ADULT_MAX_SHARE`] fois la durée de vie moyenne.
 */
export function initialAgeSeconds(seed: number, id: number, species: SpeciesId): number {
  const u = deriveSeed((seed ^ AGE_SALT) >>> 0, id) / 4294967296;
  return (ADULT_MIN_SHARE + (ADULT_MAX_SHARE - ADULT_MIN_SHARE) * u) * lifespanSeconds(species);
}

/** Temps de naissance de `animal` : `bornAt`, ou l'âge adulte tiré de la graine avant 0. */
export function birthTime(animal: AgingSubject, seed: number): number {
  return animal.bornAt ?? -initialAgeSeconds(seed, animal.id, animal.species);
}

/** Âge de `animal` au temps `time`, en secondes simulées (jamais négatif). */
export function ageSeconds(animal: AgingSubject, seed: number, time: number): number {
  return Math.max(0, time - birthTime(animal, seed));
}

/**
 * Naissance d'un adulte arrivé au temps `time` (ajout au panneau) : `undefined` au temps 0,
 * où l'âge tiré de la graine donne déjà la même naissance (aucun champ écrit), sinon
 * `time − initialAgeSeconds`.
 */
export function adultBornAt(
  seed: number,
  id: number,
  species: SpeciesId,
  time: number,
): number | undefined {
  return time === 0 ? undefined : time - initialAgeSeconds(seed, id, species);
}

/**
 * Vitalité d'un animal de `species` à l'âge `age` (secondes), dans [0, 1] : 1 jusqu'à la durée
 * de vie moyenne comprise, puis baisse linéaire jusqu'à 0 en `DECLINE_SHARE` de celle-ci.
 * Âge non fini : 1 (état corrompu, aucun déclin).
 */
export function vitality(species: SpeciesId, age: number): number {
  const lifespan = lifespanSeconds(species);
  if (!(age > lifespan) || !Number.isFinite(age)) {
    return 1;
  }
  const decline = (age - lifespan) / (DECLINE_SHARE * lifespan);
  return decline >= 1 ? 0 : 1 - decline;
}

/** Taux de décès de vieillesse, en s⁻¹ : `(1 − vitalité) · OLD_AGE_RATE` ; 0 avant le déclin. */
export function oldAgeRate(species: SpeciesId, age: number): number {
  return (1 - vitality(species, age)) * OLD_AGE_RATE;
}

/** Tirage de décès de vieillesse dans [0, 1) pour l'animal `id` au pas `tick`. */
export function oldAgeDraw(seed: number, tick: number, id: number): number {
  const step = deriveSeed(seed, tick >>> 0);
  return deriveSeed((step ^ OLD_AGE_SALT) >>> 0, id) / 4294967296;
}

/** Monde vu par `diesOfOldAge` : graine, pas et temps du pas en cours. */
export interface AgingClock {
  readonly seed: number;
  readonly tick: number;
  readonly time: number;
}

/**
 * Vrai si `animal` meurt de vieillesse pendant ce pas de `dt` secondes : probabilité
 * `1 − e^(−taux·dt)` comparée à `oldAgeDraw` ; aucun tirage avant le déclin.
 */
export function diesOfOldAge(animal: AgingSubject, clock: AgingClock, dt: number): boolean {
  const rate = oldAgeRate(animal.species, ageSeconds(animal, clock.seed, clock.time));
  if (!(rate > 0) || !(dt > 0)) {
    return false;
  }
  return oldAgeDraw(clock.seed, clock.tick, animal.id) < 1 - Math.exp(-rate * dt);
}

/** Vrai si `value` est un temps de naissance relu valide (nombre fini). */
export function isBirthTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Doyen d'un bac (#877) : animal vivant le plus âgé, avec son âge. */
export interface Eldest {
  readonly id: number;
  readonly species: SpeciesId;
  /** Âge au temps du monde, en secondes simulées. */
  readonly age: number;
}

/** Ce qu'`eldest` lit du monde : graine, temps et animaux vivants. */
export interface EldestSubject {
  readonly seed: number;
  readonly time: number;
  readonly entities: readonly AgingSubject[];
}

/**
 * Doyen du bac (#877) : animal vivant le plus âgé au temps du monde ; à âge égal, le plus petit
 * identifiant l'emporte (indépendant de l'ordre des animaux). `null` pour un bac vide.
 */
export function eldest(world: EldestSubject): Eldest | null {
  let best: Eldest | null = null;
  for (const animal of world.entities) {
    const age = ageSeconds(animal, world.seed, world.time);
    if (best === null || age > best.age || (age === best.age && animal.id < best.id)) {
      best = { id: animal.id, species: animal.species, age };
    }
  }
  return best;
}
