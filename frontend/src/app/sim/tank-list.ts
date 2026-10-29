import { mixWarnings } from './compatibility';
import { dashboardAlerts, type AlertSeverity } from './dashboard-alerts';
import { environmentById, environmentWater, type EnvironmentId } from './environment';
import { healthSummary } from './health-summary';
import { populationCounts } from './population';
import type { RoomTank } from './room-state';
import { waterLiters } from './water';
import { waterSample } from './water-dashboard';
import { waterReadout } from './water-quality';
import type { World } from './world';

/**
 * Liste des bacs de la pièce (épopée #264, lot 3, ADR 0061 et 0075) : pour chaque bac, son
 * nom, son environnement, son litrage, son nombre d'animaux et la **pire gravité** de ses
 * alertes, celles du tableau de bord (`dashboardAlerts`) calculées sur son propre monde.
 * Fonctions pures ; aucune écriture dans la simulation.
 */

/** Une ligne de la liste des bacs. */
export interface TankListEntry {
  readonly id: number;
  readonly name: string;
  readonly environment: EnvironmentId;
  readonly environmentName: string;
  readonly liters: number;
  readonly animals: number;
  /**
   * Faim moyenne des animaux nourris aux granulés, en pour cent arrondi ; `null` s'il n'y en a
   * pas (#316 : montre qu'un bac non affiché vit).
   */
  readonly hunger: number | null;
  /** Pire gravité d'alerte du bac, `null` sans alerte. */
  readonly worst: AlertSeverity | null;
  /** Bac sélectionné (celui que décrivent tableau de bord, fiches et wiki). */
  readonly selected: boolean;
  /**
   * Bac sélectionnable : à la position historique (ADR 0074). Un bac posé reste figé et
   * n'est pas encore sélectionnable (lot 3b).
   */
  readonly selectable: boolean;
}

/** Pire gravité des alertes du tableau de bord pour le monde `world`, `null` s'il n'y en a pas. */
export function worstAlert(world: World): AlertSeverity | null {
  const species = world.entities.map((entity) => entity.species);
  const alerts = dashboardAlerts({
    sample: waterSample(world.water, world.environment, world.tick),
    phBands: waterReadout(world.water, world.environment, species).phBands,
    health: healthSummary(world.entities),
    mixes: mixWarnings(environmentById(world.environment).species, populationCounts(world)),
  });
  // `dashboardAlerts` trie par gravité : la première est la pire.
  return alerts[0]?.severity ?? null;
}

/**
 * Ligne de la liste pour le bac `tank`. `worst` peut être fourni (valeur gardée en cache par
 * l'hôte pour un bac figé) ; sinon il est calculé.
 */
export function tankListEntry(
  tank: RoomTank,
  selectedTankId: number,
  worst: AlertSeverity | null = worstAlert(tank.world),
): TankListEntry {
  const { world } = tank;
  return {
    id: tank.id,
    name: tank.name,
    environment: world.environment,
    environmentName: environmentById(world.environment).name,
    liters: Math.round(waterLiters(environmentWater(world))),
    animals: world.entities.length,
    hunger: hungerPercent(world),
    worst,
    selected: tank.id === selectedTankId,
    selectable: tank.placement === null,
  };
}

/** Contenu d'un bac en toutes lettres : « vide », « 1 animal », « 3 animaux ». */
export function animalCountText(animals: number): string {
  return animals === 0 ? 'vide' : `${animals} anima${animals === 1 ? 'l' : 'ux'}`;
}

/** Libellé court d'une ligne (« 3 animaux · 240 L »). */
export function tankListDetail(entry: Pick<TankListEntry, 'animals' | 'liters'>): string {
  return `${animalCountText(entry.animals)} · ${entry.liters} L`;
}

function hungerPercent(world: World): number | null {
  const hunger = healthSummary(world.entities).averageHunger;
  return hunger === null ? null : Math.round(hunger * 100);
}

/** Lignes de la liste, dans l'ordre des bacs (liste vide : aucune ligne). */
export function tankList(
  tanks: readonly RoomTank[],
  selectedTankId: number,
  worstOf: (tank: RoomTank) => AlertSeverity | null = (tank) => worstAlert(tank.world),
): TankListEntry[] {
  return tanks.map((tank) => tankListEntry(tank, selectedTankId, worstOf(tank)));
}
