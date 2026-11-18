import { MAX_SEED } from '../core/random/prng';
import type { Box3 } from './tank';

/**
 * Validateurs des sauvegardes (`sim/save.ts`, `sim/room-save.ts`) : prédicats sur des
 * données JSON non vérifiées. Ne lèvent jamais.
 */

/** Tolérance sur les bornes de position, en mètres (arrondis des calculs de nage). */
const POSITION_EPSILON = 1e-9;

/** Objet JSON (ni tableau ni `null`). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Propriété propre seulement : les clés héritées (`constructor`, `__proto__`…) valent
 * `undefined`.
 */
export function own(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export function isNumberIn(value: unknown, min: number, max: number, epsilon = 0): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min - epsilon &&
    value <= max + epsilon
  );
}

export function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function isUint32(value: unknown): value is number {
  return isIntegerIn(value, 0, MAX_SEED);
}

export function insideBox(box: Box3, x: number, y: number, z: number): boolean {
  return (
    isNumberIn(x, box.minX, box.maxX, POSITION_EPSILON) &&
    isNumberIn(y, box.minY, box.maxY, POSITION_EPSILON) &&
    isNumberIn(z, box.minZ, box.maxZ, POSITION_EPSILON)
  );
}

/** Description courte d'une valeur reçue, pour les messages (jamais le texte entier). */
export function describe(value: unknown): string {
  if (typeof value === 'string') {
    return `« ${value.slice(0, 20)}${value.length > 20 ? '…' : ''} »`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return value === undefined ? 'absente' : typeof value;
}
