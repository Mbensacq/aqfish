import type { SaveStatus } from '../../core/save-storage/save-storage';
import { formatHour } from '../../sim/daylight';
import type { EnvironmentId } from '../../sim/environment';
import { speedLabel } from '../../sim/sim-speed';
import { CURRENT_LEVEL_LABELS, type CurrentLevel } from '../../sim/water-current';
import type { SettingsCategoryId } from '../settings-window/settings-categories';
import { environmentName } from './panel-views';

/**
 * État lu pour résumer chaque catégorie des réglages sur téléphone (#722, tranche 3) : la
 * liste des catégories y montre, sous chaque titre, sa valeur du moment.
 */
export interface SettingsSummaryState {
  readonly environment: EnvironmentId;
  /** Bacs de la pièce (0 ou 1 : un seul bac, la liste n'est pas résumée). */
  readonly tankCount: number;
  /** Animaux du bac affiché, toutes espèces. */
  readonly animals: number;
  /** Température de l'eau, en °C. */
  readonly temperature: number;
  readonly current: CurrentLevel;
  /** Animaux aux points blancs visibles. */
  readonly ichCount: number;
  /** Vrai si un traitement des points blancs est en cours. */
  readonly treating: boolean;
  readonly decorVisible: boolean;
  readonly speed: number;
  readonly hour: number;
  readonly clockRunning: boolean;
  readonly soundOn: boolean;
  /** Volume des sons d'ambiance, de 0 à 1. */
  readonly volume: number;
  readonly reducedMotion: boolean;
  readonly saveStatus: SaveStatus | null;
}

/** Valeur résumée de chaque catégorie, une courte ligne sous son titre. */
export type SettingsSummaries = Readonly<Record<SettingsCategoryId, string>>;

/** « 1 animal », « 3 animaux » ; `none` pour zéro. */
function animalCount(count: number, none: string): string {
  if (count <= 0) {
    return none;
  }
  return count === 1 ? '1 animal' : `${count} animaux`;
}

/** Nombre entier lisible, borné à zéro (valeur non finie : zéro). */
function whole(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function tankSummary(state: SettingsSummaryState): string {
  const name = environmentName(state.environment);
  return state.tankCount > 1 ? `${name}, ${state.tankCount} bacs` : name;
}

function waterSummary(state: SettingsSummaryState): string {
  const temperature = Number.isFinite(state.temperature) ? Math.round(state.temperature) : '?';
  const water = `Eau à ${temperature} °C`;
  return state.current === 'coupe'
    ? water
    : `${water}, courant ${CURRENT_LEVEL_LABELS[state.current]}`;
}

function careSummary(state: SettingsSummaryState): string {
  if (state.treating) {
    return 'Traitement en cours';
  }
  const sick = whole(state.ichCount);
  return sick === 0 ? 'Rien à soigner' : `${animalCount(sick, '')} à soigner`;
}

function timeSummary(state: SettingsSummaryState): string {
  const time = `${speedLabel(state.speed)}, ${formatHour(state.hour)}`;
  return state.clockRunning ? time : `${time}, heure figée`;
}

function soundSummary(state: SettingsSummaryState): string {
  const volume = Math.min(100, whole(state.volume * 100));
  return state.soundOn ? `Activés, volume ${volume} %` : 'Coupés';
}

function saveSummary(status: SaveStatus | null): string {
  switch (status) {
    case 'active':
      return 'Enregistré automatiquement';
    case 'plein':
      return 'Stockage plein';
    case 'indisponible':
      return 'Stockage indisponible';
    default:
      return 'Sauvegarde désactivée';
  }
}

/** Valeurs résumées des neuf catégories, pour la liste du téléphone. */
export function settingsSummaries(state: SettingsSummaryState): SettingsSummaries {
  return {
    bac: tankSummary(state),
    population: animalCount(whole(state.animals), 'Aucun animal'),
    eau: waterSummary(state),
    soins: careSummary(state),
    decor: state.decorVisible ? 'Décor affiché' : 'Décor masqué',
    temps: timeSummary(state),
    son: soundSummary(state),
    accessibilite: state.reducedMotion ? 'Mouvements réduits' : 'Mouvements normaux',
    sauvegarde: saveSummary(state.saveStatus),
  };
}
