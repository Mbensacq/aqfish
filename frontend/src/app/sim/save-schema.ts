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

/**
 * Schémas déclaratifs (lot 5 de #686) : un corps de sauvegarde est décrit par une liste de
 * règles, contrôlées dans l'ordre. L'ordre des règles fixe l'ordre des messages, donc le
 * premier message d'un refus.
 */

/** Validateur : vrai si la valeur reçue convient. */
export type Validator = (value: unknown) => boolean;

/** Règle sur un sujet (objet relu) : le contrôle et le message en cas d'échec. */
export interface Rule<T> {
  readonly valid: (subject: T) => boolean;
  readonly message: string | ((subject: T) => string);
}

/** Règle sur un champ propre d'un objet JSON (`own`). */
export type FieldRule = Rule<Record<string, unknown>>;

/** Nombre fini. */
export const finiteNumber: Validator = (value) =>
  typeof value === 'number' && Number.isFinite(value);

/** Nombre fini dans [min − ε, max + ε]. */
export function numberIn(min: number, max: number, epsilon = 0): Validator {
  return (value) => isNumberIn(value, min, max, epsilon);
}

/** Entier dans [min, max]. */
export function integerIn(min: number, max: number): Validator {
  return (value) => isIntegerIn(value, min, max);
}

/** Entier 32 bits non signé. */
export const uint32: Validator = (value) => isUint32(value);

/** Valeur absente (`undefined`) ou valide. */
export function optional(valid: Validator): Validator {
  return (value) => value === undefined || valid(value);
}

/**
 * Règle sur le champ `key` : `message` est fixe, ou calculé à partir de la valeur reçue.
 */
export function field(
  key: string,
  valid: Validator,
  message: string | ((value: unknown) => string),
): FieldRule {
  return {
    valid: (record) => valid(own(record, key)),
    message: typeof message === 'string' ? message : (record) => message(own(record, key)),
  };
}

function messageOf<T>(rule: Rule<T>, subject: T): string {
  return typeof rule.message === 'string' ? rule.message : rule.message(subject);
}

/** Messages de toutes les règles en échec, dans l'ordre des règles. */
export function problemsOf<T>(subject: T, rules: readonly Rule<T>[]): string[] {
  return rules.filter((rule) => !rule.valid(subject)).map((rule) => messageOf(rule, subject));
}

/**
 * Message de la première règle en échec, ou `null` : les règles suivantes ne sont pas
 * évaluées (elles peuvent supposer les précédentes satisfaites).
 */
export function firstProblemOf<T>(subject: T, rules: readonly Rule<T>[]): string | null {
  const failed = rules.find((rule) => !rule.valid(subject));
  return failed === undefined ? null : messageOf(failed, subject);
}

/** Liste bornée d'une sauvegarde : nom du champ et effectif accepté. */
export interface ListRule {
  readonly key: string;
  readonly min?: number;
  readonly max: number;
  /** Message d'un effectif hors de [min, max]. */
  readonly countMessage: (count: number) => string;
}

/**
 * Éléments d'une liste bornée, ou `null` (problème ajouté) si `value` n'est pas une liste ou
 * si son effectif est hors bornes.
 */
export function readList(
  value: unknown,
  rule: ListRule,
  problems: string[],
): readonly unknown[] | null {
  if (!Array.isArray(value)) {
    problems.push(`${rule.key} doit être une liste`);
    return null;
  }
  if (value.length < (rule.min ?? 0) || value.length > rule.max) {
    problems.push(rule.countMessage(value.length));
    return null;
  }
  return value;
}
