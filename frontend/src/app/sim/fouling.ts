import { ALGAE_NITRATE_FULL, ALGAE_NITRATE_LIMIT, hasAlgae } from './algae';
import { isDecorMode, type CareMode } from './care-mode';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import type { EnvironmentId } from './environment';
import { initialMaintenance, type MaintenanceState } from './maintenance';

/**
 * Encrassement visible du bac (issue #607, ADR 0141) : un voile de dépôts sur les vitres et
 * sur le sol, qui monte avec le temps écoulé depuis le dernier geste d'entretien et avec les
 * nitrates, et que les gestes de la séance guidée effacent (raclette des vitres, siphon du
 * sol, `sim/care-session.ts`). Fonctions pures, sans hasard ni horloge : le temps est celui du
 * monde, les dates des gestes celles du calendrier d'entretien (`sim/maintenance.ts`), donc
 * aucun nouveau champ de sauvegarde.
 *
 * Règles (**approximations de jeu**, `docs/SOINS.md` § 12) :
 * - un bac entretenu reste propre `FOULING_GRACE_DAYS` jours, puis se voile peu à peu, à
 *   plein en `FOULING_FULL_DAYS` jours de plus en eau propre ;
 * - au-delà du seuil « à surveiller » des nitrates (celui des algues), le voile monte plus
 *   vite, jusqu'à `1 + FOULING_NITRATE_BOOST` fois au plein de la jauge ;
 * - aucun voile en mode décor (eau en pause), ni dans les bacs sans algues (bassin, récif).
 */

/** Jours de jeu sans aucun voile après un geste d'entretien. */
export const FOULING_GRACE_DAYS = 3;
/** Jours de jeu, après le délai de grâce, pour un voile plein en eau propre. */
export const FOULING_FULL_DAYS = 21;
/** Accélération du voile au plein de la jauge des nitrates (× 1 + ce facteur). */
export const FOULING_NITRATE_BOOST = 2;

/** Niveau d'encrassement de chaque surface, dans [0, 1]. */
export interface TankFouling {
  /** Vitres : effacé par la raclette (tâche `glass`). */
  readonly glass: number;
  /** Sol : effacé par le siphon (tâche `siphon`). */
  readonly floor: number;
}

/** Bac propre. */
export const NO_FOULING: TankFouling = Object.freeze({ glass: 0, floor: 0 });

/**
 * Niveau d'encrassement, dans [0, 1], `elapsed` secondes simulées après le dernier geste et
 * pour des nitrates `nitrate` (mg/L) : nul pendant le délai de grâce, croissant avec
 * le temps et avec les nitrates, plafonné à 1. Un temps non fini ou négatif, ou des nitrates
 * non finis ou négatifs, comptent pour zéro (aucun voile fantôme).
 */
export function foulingLevel(elapsed: number, nitrate: number): number {
  const days = positive(elapsed) / DEFAULT_DAY_LENGTH_SECONDS;
  if (days <= FOULING_GRACE_DAYS) {
    return 0;
  }
  const excess = clamp01(
    (positive(nitrate) - ALGAE_NITRATE_LIMIT) / (ALGAE_NITRATE_FULL - ALGAE_NITRATE_LIMIT),
  );
  const speed = 1 + FOULING_NITRATE_BOOST * excess;
  return clamp01(((days - FOULING_GRACE_DAYS) / FOULING_FULL_DAYS) * speed);
}

/**
 * Début du suivi d'un calendrier : la plus ancienne date des tâches suivies dès le début.
 * Sert de dernier geste pour les vitres et le sol jamais encore nettoyés.
 */
export function trackingStart(state: MaintenanceState): number {
  const { waterChange, filter, waterTest, prune } = state.lastDone;
  return Math.min(waterChange, filter, waterTest, prune);
}

/**
 * Encrassement d'un bac au temps `time`, d'après son calendrier `state` et ses nitrates :
 * vitres depuis la dernière raclette, sol depuis le dernier siphon (ou depuis le début du
 * suivi, faute de geste).
 */
export function tankFouling(state: MaintenanceState, time: number, nitrate: number): TankFouling {
  const start = trackingStart(state);
  const glass = foulingLevel(time - (state.lastDone.glass ?? start), nitrate);
  const floor = foulingLevel(time - (state.lastDone.siphon ?? start), nitrate);
  return glass === 0 && floor === 0 ? NO_FOULING : { glass, floor };
}

/** Ce que l'encrassement lit d'un monde. */
export interface FoulingWorld {
  readonly environment: EnvironmentId;
  readonly careMode?: CareMode;
  readonly time: number;
  readonly water: { readonly nitrate: number };
  readonly maintenance?: MaintenanceState;
}

/**
 * Encrassement affiché d'un monde : aucun en mode décor ni hors des bacs à algues ; sinon
 * `tankFouling` de son calendrier, ou d'un calendrier commencé à `start` s'il n'en a pas.
 */
export function worldFouling(world: FoulingWorld, start: number): TankFouling {
  if (isDecorMode(world) || !hasAlgae(world.environment)) {
    return NO_FOULING;
  }
  const state = world.maintenance ?? initialMaintenance(start);
  return tankFouling(state, world.time, world.water.nitrate);
}

/**
 * Encrassement d'exemple (paramètre de capture `encrassement=`) : vitres et sol au niveau
 * `level`, ramené dans [0, 1] ; `NO_FOULING` pour un niveau nul ou non fini.
 */
export function sampleFouling(level: number): TankFouling {
  const l = clamp01(positive(level));
  return l > 0 ? { glass: l, floor: l } : NO_FOULING;
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
