import { careModeOf } from './care-mode';
import type { PopulationCounts } from './population';
import type { PossibleSpecies } from './possible-species';
import type { SpeciesId } from './species';
import { frenchNumber } from './species-sheet';
import {
  canAdd,
  capacityStatus,
  populationOf,
  type CapacityStatus,
  type CapacityTank,
} from './tank-capacity';
import { waterVolumeBreakdown } from './tank-water-volume';
import type { PopulationEntry, World } from './world-types';

/**
 * Capacité du bac branchée sur l'interface (issue #809, tranche 2 de #729, ADR 0172) :
 * effectifs maximaux que la capacité permet en mode soins, raison du refus pour chaque espèce
 * bloquée, et textes de l'occupation. Fonctions pures, sans hasard ni horloge ; le calcul du
 * volume réel construit les voxels du décor, il n'est appelé qu'à la demande (réglage d'un
 * effectif, relevé des effectifs, import), jamais dans la boucle d'affichage.
 */

/** Capacité lue sur un bac : volumes, état et mode. */
export interface TankCapacityReadout {
  /** Litres bruts de la boîte d'eau (ceux de la liste des bacs). */
  readonly grossLiters: number;
  /** Volume d'eau réel, décor déduit (`sim/tank-water-volume.ts`). */
  readonly liters: number;
  readonly status: CapacityStatus;
  /** Vrai en mode décor : la capacité n'y est pas contrôlée. */
  readonly decor: boolean;
}

/** Effectifs permis par la capacité, et pourquoi le suivant est refusé. */
export interface CapacityLimits {
  /** Effectif maximal de chaque espèce, jamais sous l'effectif actuel ni au-dessus de la borne. */
  readonly limits: PopulationCounts;
  /** Raison chiffrée et sourcée du refus, pour les espèces que la capacité bloque. */
  readonly reasons: Readonly<Partial<Record<SpeciesId, string>>>;
}

/** Capacité telle que l'interface l'affiche (#809). */
export interface CapacityShown {
  /** Ligne d'occupation et de volume (`capacityLine`), `null` avant le démarrage. */
  readonly text: string | null;
  /** Alerte d'un bac trop plein (`capacityAlert`), sinon `null`. */
  readonly alert: string | null;
  /** Raison du refus d'un animal de plus, pour les espèces que la capacité bloque. */
  readonly reasons: Readonly<Partial<Record<SpeciesId, string>>>;
  /** Espèces encore possibles du milieu, triées par verdict (`possibleSpecies`, #818). */
  readonly possible: readonly PossibleSpecies[];
}

/** Rien à afficher (avant le démarrage). */
export const NO_CAPACITY: CapacityShown = Object.freeze({
  text: null,
  alert: null,
  reasons: {},
  possible: [],
});

/** Capacité du bac `world` : volume brut et réel, besoin et occupation, mode. */
export function tankCapacity(world: World): TankCapacityReadout {
  const volume = waterVolumeBreakdown(world);
  return {
    grossLiters: volume.grossLiters,
    liters: volume.liters,
    status: capacityStatus({ liters: volume.liters, population: populationOf(world) }),
    decor: careModeOf(world) === 'decor',
  };
}

/** `population` avec `count` animaux de `species` (entrée ajoutée si absente). */
function withCount(
  population: readonly PopulationEntry[],
  species: SpeciesId,
  count: number,
): PopulationEntry[] {
  const others = population.filter((entry) => entry.species !== species);
  return [...others, { species, count }];
}

/** Effectif actuel de `species` dans `population`. */
function countIn(population: readonly PopulationEntry[], species: SpeciesId): number {
  return population.find((entry) => entry.species === species)?.count ?? 0;
}

/**
 * Effectifs maximaux de `species` dans `tank` sous sa capacité (au plafond), chacun ramené
 * dans [effectif actuel, `bounds`] : la capacité ne retire jamais un animal déjà là (bac trop
 * plein d'une ancienne sauvegarde), et la borne (plafonds techniques, ceux de la pièce) reste à
 * part. En mode décor, aucune contrainte : les bornes sont rendues telles quelles. Les espèces
 * absentes de `species` gardent leur borne.
 */
export function capacityLimits(
  tank: CapacityTank,
  species: readonly SpeciesId[],
  bounds: PopulationCounts,
): CapacityLimits {
  const limits: Record<SpeciesId, number> = { ...bounds };
  const reasons: Partial<Record<SpeciesId, string>> = {};
  if (tank.mode === 'decor') {
    return { limits, reasons };
  }
  for (const id of species) {
    const current = countIn(tank.population, id);
    let count = current;
    while (count < bounds[id]) {
      const verdict = canAdd({ ...tank, population: withCount(tank.population, id, count) }, id);
      if (!verdict.ok) {
        reasons[id] = verdict.reason;
        break;
      }
      count += 1;
    }
    limits[id] = Math.max(current, Math.min(count, bounds[id]));
  }
  return { limits, reasons };
}

/** Litres au dixième, écrits à la française. */
function litersText(liters: number): string {
  return `${frenchNumber(Math.round(liters * 10) / 10)} L`;
}

/** Occupation en pourcentage entier ; « ∞ % » pour un besoin dans un bac sans eau. */
function percentText(occupation: number): string {
  return Number.isFinite(occupation) ? `${Math.round(occupation * 100)} %` : '∞ %';
}

/**
 * Ligne de capacité du bilan et de la section « Population » (format « cartel ») :
 * « 63 % de la capacité : 179,3 L demandés pour 283,8 L d’eau réelle (288 L bruts, décor
 * déduit) ». Besoins lus dans les fiches (sources ou approximation de jeu, `species-ecology`).
 */
export function capacityLine(readout: TankCapacityReadout): string {
  const volume = `${litersText(readout.liters)} d’eau réelle (${litersText(readout.grossLiters)} bruts, décor déduit)`;
  if (readout.decor) {
    return `Mode décor : capacité non contrôlée ; ${volume}`;
  }
  const { needLiters, occupation } = readout.status;
  return `${percentText(occupation)} de la capacité : ${litersText(needLiters)} demandés pour ${volume}`;
}

/**
 * Alerte d'un bac au-delà de sa capacité (sauvegarde chargée, bac par défaut), ou `null` s'il
 * est dans sa capacité ou en mode décor. Rien n'est retiré : l'alerte le dit.
 */
export function capacityAlert(readout: TankCapacityReadout): string | null {
  if (readout.decor || !readout.status.over) {
    return null;
  }
  return `Bac au-delà de sa capacité (${percentText(readout.status.occupation)}) : ${litersText(readout.status.needLiters)} demandés pour ${litersText(readout.liters)} d’eau réelle. Aucun animal n’a été retiré ; ajouts refusés tant que le bac reste trop plein.`;
}
