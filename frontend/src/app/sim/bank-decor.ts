import { assertSeed, createPrng } from '../core/random/prng';
import type { Box3 } from './tank';
import {
  shoreLineX,
  terrainAt,
  terrainHeightAt,
  waterDirection,
  type TerrainSettings,
} from './terrain';

/**
 * Décor de la berge du paludarium (issue #132, ADR 0038) : tapis de mousse posés sur le sol
 * émergé et racines noueuses qui partent de la berge et plongent dans l'eau.
 *
 * Comme le sol (ADR 0034), c'est un **aménagement fixe** de l'environnement : la disposition
 * se tire de la graine de `BankDecorSettings` (une donnée de l'environnement), jamais de la
 * graine du monde ; la sauvegarde n'a aucun champ nouveau et la scène statique peut la
 * dessiner. Module pur et déterministe, sans Three.js (ADR 0003).
 *
 * Bornes, garanties par `bankDecorLayout` :
 * - au plus `MAX_ROOTS` racines et `MAX_MOSS_PATCHES` tapis (réglages vérifiés) ;
 * - un tapis est entièrement sur le sol émergé (centre et bord), dans le bac ;
 * - une racine part du sol émergé et finit sous l'eau, sans sortir du bac ;
 * - vus de dessus, deux éléments ne se chevauchent jamais (jeu `BANK_DECOR_GAP`).
 * Un élément qui ne trouve pas de place en `BANK_DECOR_ATTEMPTS` essais est omis.
 */

/** Plus grand nombre de racines d'un réglage (`assertBankDecorSettings`). */
export const MAX_ROOTS = 5;
/** Plus grand nombre de tapis de mousse d'un réglage. */
export const MAX_MOSS_PATCHES = 14;
/** Essais de placement par élément avant de l'omettre. */
export const BANK_DECOR_ATTEMPTS = 80;
/** Jeu minimal, vu de dessus, entre deux éléments (mètres). */
export const BANK_DECOR_GAP = 0.008;
/** Points du bord d'un tapis contrôlés au placement, et facteur de rayon de ce contrôle. */
const MOSS_RIM_SAMPLES = 24;
const MOSS_RIM_SAFETY = 1.05;
/** Distance minimale entre une racine (bord compris) et les vitres (mètres). */
export const ROOT_EDGE_MARGIN = 0.015;
/** Profondeur minimale du dessus du bout d'une racine sous la surface (mètres). */
export const ROOT_TIP_DEPTH = 0.015;
/** Nombre de segments de la ligne d'une racine. */
export const ROOT_SEGMENTS = 12;
/** Rayon du bout d'une racine, en fraction du rayon de sa base. */
export const ROOT_TIP_RATIO = 0.45;
/** Part du rayon d'une racine enfoncée dans le sol (la racine repose, elle ne flotte pas). */
export const ROOT_SINK_RATIO = 0.3;
/** Distance de la base d'une racine au rivage, côté terre (mètres). */
export const ROOT_BASE_DISTANCE = { min: 0.04, max: 0.12 } as const;
/** Écart maximal de la direction d'une racine à la perpendiculaire du rivage (radians). */
export const ROOT_MAX_ANGLE = 0.6;
/** Hauteur de la voûte d'une racine au-dessus du sol (mètres). */
export const ROOT_ARCH = { min: 0.025, max: 0.05 } as const;
/** Amplitude des nœuds (écart latéral) d'une racine (mètres). */
export const ROOT_KINK = { min: 0.004, max: 0.014 } as const;

/** Intervalle [min, max] d'un réglage. */
interface Range {
  readonly min: number;
  readonly max: number;
}

/** Réglage du décor de berge d'un environnement (`Environment.bankDecor`). */
export interface BankDecorSettings {
  /** Graine de la disposition (entier 32 bits non signé). */
  readonly seed: number;
  /** Tapis de mousse : nombre visé et rayon (mètres). */
  readonly moss: { readonly count: Range; readonly radius: Range };
  /** Racines : nombre visé, longueur vue de dessus et rayon de la base (mètres). */
  readonly roots: { readonly count: Range; readonly length: Range; readonly radius: Range };
}

/** Tapis de mousse : disque posé sur le sol émergé. */
export interface MossPatch {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/** Point de la ligne d'une racine (repère du bac, mètres) et rayon en ce point. */
export interface RootPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}

/** Racine : ligne brisée de la base (sur la berge) au bout (sous l'eau). */
export interface Root {
  readonly id: number;
  /** `ROOT_SEGMENTS + 1` points, de la base au bout. */
  readonly points: readonly RootPoint[];
}

export interface BankDecor {
  readonly roots: readonly Root[];
  readonly mosses: readonly MossPatch[];
}

/**
 * Vérifie un réglage de décor de berge : graine valide ; effectifs entiers, `0 ≤ min ≤ max`,
 * au plus `MAX_ROOTS` racines et `MAX_MOSS_PATCHES` tapis ; longueurs et rayons réels
 * strictement positifs avec `min ≤ max`.
 * @throws RangeError si le réglage est invalide.
 */
export function assertBankDecorSettings(settings: BankDecorSettings): BankDecorSettings {
  assertSeed(settings.seed);
  assertCount('moss.count', settings.moss.count, MAX_MOSS_PATCHES);
  assertCount('roots.count', settings.roots.count, MAX_ROOTS);
  assertLength('moss.radius', settings.moss.radius);
  assertLength('roots.length', settings.roots.length);
  assertLength('roots.radius', settings.roots.radius);
  return settings;
}

function assertCount(name: string, range: Range, max: number): void {
  if (
    !Number.isInteger(range.min) ||
    !Number.isInteger(range.max) ||
    range.min < 0 ||
    range.max < range.min ||
    range.max > max
  ) {
    throw new RangeError(
      `bankDecor.${name} : entiers 0 ≤ min ≤ max ≤ ${max} attendus (reçu : ${JSON.stringify(range)})`,
    );
  }
}

function assertLength(name: string, range: Range): void {
  if (
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    range.min <= 0 ||
    range.max < range.min
  ) {
    throw new RangeError(
      `bankDecor.${name} : réels 0 < min ≤ max attendus (reçu : ${JSON.stringify(range)})`,
    );
  }
}

/** Empreinte vue de dessus : segment [a, b] épaissi de `radius` (disque si a = b). */
interface Footprint {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly radius: number;
}

/**
 * Disposition du décor de berge sur le sol `terrain` du volume d'eau `water` : racines
 * d'abord, puis tapis de mousse dans la place restante. Déterministe : mêmes entrées, même
 * disposition. `settings` nul : aucun élément.
 * @throws RangeError si le réglage est invalide.
 */
export function bankDecorLayout(
  settings: BankDecorSettings | null,
  terrain: TerrainSettings,
  water: Box3,
): BankDecor {
  if (settings === null) {
    return { roots: [], mosses: [] };
  }
  assertBankDecorSettings(settings);
  const rng = createPrng(settings.seed);
  const between = (range: Range): number => range.min + (range.max - range.min) * rng.next();
  const countOf = (range: Range): number =>
    range.min + Math.floor(rng.next() * (range.max - range.min + 1));
  const taken: Footprint[] = [];

  const roots: Root[] = [];
  const rootTarget = countOf(settings.roots.count);
  for (let n = 0; n < rootTarget; n++) {
    for (let attempt = 0; attempt < BANK_DECOR_ATTEMPTS; attempt++) {
      const root = tryRoot(roots.length, between, settings, terrain, water);
      if (!root) {
        continue;
      }
      const prints = rootFootprints(root);
      if (prints.every((p) => isFree(p, taken))) {
        roots.push(root);
        taken.push(...prints);
        break;
      }
    }
  }

  const mosses: MossPatch[] = [];
  const mossTarget = countOf(settings.moss.count);
  for (let n = 0; n < mossTarget; n++) {
    for (let attempt = 0; attempt < BANK_DECOR_ATTEMPTS; attempt++) {
      const radius = between(settings.moss.radius);
      const x = water.minX + radius + (water.maxX - water.minX - 2 * radius) * rng.next();
      const z = water.minZ + radius + (water.maxZ - water.minZ - 2 * radius) * rng.next();
      const print: Footprint = { ax: x, az: z, bx: x, bz: z, radius };
      if (isOnLand(x, z, radius, terrain, water) && isFree(print, taken)) {
        mosses.push({ id: mosses.length, x, z, radius });
        taken.push(print);
        break;
      }
    }
  }
  return { roots, mosses };
}

/** Une racine candidate, ou `null` si elle ne part pas de la terre ou ne finit pas sous l'eau. */
function tryRoot(
  id: number,
  between: (range: Range) => number,
  settings: BankDecorSettings,
  terrain: TerrainSettings,
  water: Box3,
): Root | null {
  // Tirages toujours faits dans le même ordre, que la racine soit retenue ou non.
  const r0 = between(settings.roots.radius);
  const margin = ROOT_EDGE_MARGIN + r0;
  const z0 = between({ min: water.minZ + margin, max: water.maxZ - margin });
  const baseDistance = between(ROOT_BASE_DISTANCE);
  const angle = between({ min: -ROOT_MAX_ANGLE, max: ROOT_MAX_ANGLE });
  const length = between(settings.roots.length);
  const arch = between(ROOT_ARCH);
  const kink = between(ROOT_KINK);
  const kinkPhase = between({ min: 0, max: 2 * Math.PI });
  const knots = 2 + Math.floor(between({ min: 0, max: 2 }));

  const w = waterDirection(terrain);
  const x0 = shoreLineX(z0, terrain) - w * baseDistance;
  const dx = w * Math.cos(angle);
  const dz = Math.sin(angle);
  const points: RootPoint[] = [];
  for (let s = 0; s <= ROOT_SEGMENTS; s++) {
    const t = s / ROOT_SEGMENTS;
    const radius = r0 * (1 - (1 - ROOT_TIP_RATIO) * t);
    // Nœuds : écart latéral nul aux deux bouts.
    const side = kink * Math.sin(Math.PI * t) * Math.sin(Math.PI * knots * t + kinkPhase);
    const x = x0 + dx * length * t - dz * side;
    const z = z0 + dz * length * t + dx * side;
    if (
      x < water.minX + margin ||
      x > water.maxX - margin ||
      z < water.minZ + margin ||
      z > water.maxZ - margin
    ) {
      return null;
    }
    const ground = terrainHeightAt(x, z, terrain, water);
    const y = ground + radius * (1 - ROOT_SINK_RATIO) + arch * Math.sin(Math.PI * t);
    points.push({ x, y, z, radius });
  }
  const base = points[0];
  const tip = points[ROOT_SEGMENTS];
  if (terrainAt(base.x, base.z, terrain, water).submerged) {
    return null;
  }
  if (
    !terrainAt(tip.x, tip.z, terrain, water).submerged ||
    tip.y + tip.radius > water.maxY - ROOT_TIP_DEPTH
  ) {
    return null;
  }
  return { id, points };
}

/** Empreintes d'une racine vue de dessus : un segment épaissi par tronçon. */
export function rootFootprints(root: Root): Footprint[] {
  const prints: Footprint[] = [];
  for (let s = 1; s < root.points.length; s++) {
    const a = root.points[s - 1];
    const b = root.points[s];
    prints.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: Math.max(a.radius, b.radius) });
  }
  return prints;
}

/** Vrai si un disque de rayon `radius` centré en (x, z) est sur le sol émergé (centre et bord). */
function isOnLand(
  x: number,
  z: number,
  radius: number,
  terrain: TerrainSettings,
  water: Box3,
): boolean {
  if (terrainAt(x, z, terrain, water).submerged) {
    return false;
  }
  // Bord contrôlé un peu au-delà du rayon : couvre les cordes entre deux points contrôlés.
  const reach = radius * MOSS_RIM_SAFETY;
  for (let n = 0; n < MOSS_RIM_SAMPLES; n++) {
    const a = (n / MOSS_RIM_SAMPLES) * 2 * Math.PI;
    if (terrainAt(x + reach * Math.cos(a), z + reach * Math.sin(a), terrain, water).submerged) {
      return false;
    }
  }
  return true;
}

function isFree(print: Footprint, taken: readonly Footprint[]): boolean {
  return taken.every((other) => footprintGap(print, other) >= BANK_DECOR_GAP);
}

/** Jeu entre deux empreintes vues de dessus (négatif si elles se chevauchent). */
export function footprintGap(a: Footprint, b: Footprint): number {
  return segmentDistance(a, b) - a.radius - b.radius;
}

/** Distance entre deux segments du plan (x, z). */
function segmentDistance(a: Footprint, b: Footprint): number {
  if (segmentsCross(a, b)) {
    return 0;
  }
  return Math.min(
    pointSegment(a.ax, a.az, b),
    pointSegment(a.bx, a.bz, b),
    pointSegment(b.ax, b.az, a),
    pointSegment(b.bx, b.bz, a),
  );
}

function pointSegment(px: number, pz: number, s: Footprint): number {
  const vx = s.bx - s.ax;
  const vz = s.bz - s.az;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? Math.min(Math.max(((px - s.ax) * vx + (pz - s.az) * vz) / len2, 0), 1) : 0;
  return Math.hypot(px - (s.ax + t * vx), pz - (s.az + t * vz));
}

function segmentsCross(a: Footprint, b: Footprint): boolean {
  const cross = (ox: number, oz: number, px: number, pz: number, qx: number, qz: number) =>
    (px - ox) * (qz - oz) - (pz - oz) * (qx - ox);
  const d1 = cross(b.ax, b.az, b.bx, b.bz, a.ax, a.az);
  const d2 = cross(b.ax, b.az, b.bx, b.bz, a.bx, a.bz);
  const d3 = cross(a.ax, a.az, a.bx, a.bz, b.ax, b.az);
  const d4 = cross(a.ax, a.az, a.bx, a.bz, b.bx, b.bz);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
