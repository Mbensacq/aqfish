/**
 * Générateur pseudo-aléatoire 32 bits à graine (mulberry32) et dérivation de
 * sous-générateurs par entité.
 *
 * Seule source de hasard autorisée dans la simulation (ADR 0003) : mêmes graines ⇒ mêmes
 * suites, sur tous les navigateurs (opérations entières 32 bits via `Math.imul` et `>>> 0`).
 * Voir docs/ARCHITECTURE.md, section « Simulation déterministe ».
 */

/** Plus grande graine acceptée (entier 32 bits non signé). */
export const MAX_SEED = 0xffffffff;

/** Générateur pseudo-aléatoire à graine. */
export interface Prng {
  /** Prochain réel uniforme dans [0, 1). */
  next(): number;
  /** Prochain entier uniforme dans [0, 2^32). */
  nextUint32(): number;
}

/**
 * Crée un générateur mulberry32 à partir d'une graine entière dans [0, 2^32).
 * @throws RangeError si la graine n'est pas un entier 32 bits non signé.
 */
export function createPrng(seed: number): Prng {
  let state = assertSeed(seed);

  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };

  return {
    nextUint32,
    // Division par 2^32 : le résultat reste strictement inférieur à 1.
    next: () => nextUint32() / 4294967296,
  };
}

/**
 * Dérive la graine du sous-générateur d'une entité à partir de la graine du monde et de
 * l'identifiant de l'entité (hachage murmur3 32 bits d'une clé de 4 octets).
 *
 * Chaque entité tire ainsi son hasard de son propre générateur : ajouter ou retirer une
 * entité ne décale pas la suite des autres.
 * @throws RangeError si la graine ou l'identifiant n'est pas un entier 32 bits non signé.
 */
export function deriveSeed(seed: number, entityId: number): number {
  let h = assertSeed(seed);
  let k = assertUint32(entityId, 'entityId');

  k = Math.imul(k, 0xcc9e2d51);
  k = rotl32(k, 15);
  k = Math.imul(k, 0x1b873593);

  h ^= k;
  h = rotl32(h, 13);
  h = (Math.imul(h, 5) + 0xe6546b64) | 0;

  h ^= 4; // longueur de la clé en octets
  return fmix32(h);
}

/** Sous-générateur d'une entité : `createPrng(deriveSeed(seed, entityId))`. */
export function createEntityPrng(seed: number, entityId: number): Prng {
  return createPrng(deriveSeed(seed, entityId));
}

function rotl32(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

/** Mélange final de murmur3 : diffuse chaque bit d'entrée sur tous les bits de sortie. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Vérifie qu'une graine est un entier 32 bits non signé et la renvoie.
 * @throws RangeError sinon.
 */
export function assertSeed(seed: number): number {
  return assertUint32(seed, 'seed');
}

function assertUint32(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SEED) {
    throw new RangeError(`${name} doit être un entier dans [0, ${MAX_SEED}] (reçu : ${value})`);
  }
  return value;
}
