import { careModeOf, isDecorMode, type CareMode } from './care-mode';
import { isFeederEmpty } from './auto-feeder';
import { mixWarnings } from './compatibility';
import { dashboardAlerts, type AlertSeverity } from './dashboard-alerts';
import { environmentById, environmentWater, type EnvironmentId } from './environment';
import { healthSummary } from './health-summary';
import { populationCounts } from './population';
import type { RoomTank } from './room-state';
import { waterLiters } from './water';
import { waterSample } from './water-dashboard';
import { waterReadout } from './water-quality';
import { SPECIES } from './species';
import { feedsOnPellets } from './wellbeing';
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
  /**
   * Animaux nourris aux granulés (#492) : ceux que compte `hunger`. 0 avec des animaux
   * (Paludarium : grenouilles, tritons) : la ligne l'indique au lieu de rester muette.
   */
  readonly pelletFed: number;
  /** Mode du bac (#278) : `soins` ou `decor`. */
  readonly mode: CareMode;
  /** Pire gravité d'alerte du bac, `null` sans alerte (toujours en mode décor). */
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
  if (isDecorMode(world)) {
    // Mode décor (#278) : aucune alerte.
    return null;
  }
  const species = world.entities.map((entity) => entity.species);
  const alerts = dashboardAlerts({
    sample: waterSample(world.water, world.environment, world.tick),
    phBands: waterReadout(world.water, world.environment, species).phBands,
    health: healthSummary(world.entities),
    mixes: mixWarnings(environmentById(world.environment).species, populationCounts(world)),
    feederEmpty: isFeederEmpty(world.feeder),
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
    pelletFed: pelletFedCount(world),
    mode: careModeOf(world),
    worst,
    selected: tank.id === selectedTankId,
    selectable: tank.placement === null,
  };
}

/** Contenu d'un bac en toutes lettres : « vide », « 1 animal », « 3 animaux ». */
export function animalCountText(animals: number): string {
  return animals === 0 ? 'vide' : `${animals} anima${animals === 1 ? 'l' : 'ux'}`;
}

/**
 * Faim moyenne en clair (#318) : « faim 40 % », ou `null` sans animal nourri aux granulés
 * (bac vide, crevettes seules : aucune moyenne, aucune division par zéro).
 */
export function hungerText(hunger: number | null): string | null {
  return hunger === null || !Number.isFinite(hunger) ? null : `faim ${hunger} %`;
}

/**
 * Libellé court d'une ligne (« 3 animaux · 240 L », « 3 animaux · 240 L · faim 40 % ») : la
 * faim, quand elle est connue, montre qu'un bac non affiché vit (#318).
 */
export function tankListDetail(
  entry: Pick<TankListEntry, 'animals' | 'liters'> &
    Partial<Pick<TankListEntry, 'hunger' | 'pelletFed'>>,
): string {
  const hunger = hungerText(entry.hunger ?? null);
  return [
    `${animalCountText(entry.animals)} · ${entry.liters} L`,
    hunger ?? (withoutPellets(entry) ? NO_PELLETS_TEXT : null),
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

/** Indicateur d'un bac habité dont aucun animal ne mange de granulés (#492, Paludarium). */
export const NO_PELLETS_TEXT = 'sans granulés';

/** Vrai si le bac a des animaux et qu'aucun ne mange de granulés (`pelletFed` connu et nul). */
function withoutPellets(entry: Partial<Pick<TankListEntry, 'animals' | 'pelletFed'>>): boolean {
  return entry.pelletFed === 0 && (entry.animals ?? 0) > 0;
}

/**
 * Infobulle d'une ligne (#492) : explique l'absence de faim (aucun animal nourri aux granulés)
 * ou une faim qui ne compte qu'une partie des animaux (bac mixte) ; `null` sinon.
 */
export function tankListHint(
  entry: Pick<TankListEntry, 'animals' | 'hunger' | 'pelletFed'>,
): string | null {
  if (withoutPellets(entry)) {
    return 'Aucun animal de ce bac ne mange de granulés : pas de faim à suivre.';
  }
  if (entry.hunger !== null && entry.pelletFed < entry.animals) {
    return `Faim moyenne des seuls animaux nourris aux granulés (${entry.pelletFed} sur ${entry.animals}).`;
  }
  return null;
}

function pelletFedCount(world: World): number {
  return world.entities.filter((entity) => feedsOnPellets(SPECIES[entity.species])).length;
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
