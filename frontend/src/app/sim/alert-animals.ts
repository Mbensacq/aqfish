import type { MixWarning } from './compatibility';
import type { AlertId } from './dashboard-alerts';
import { ichStage } from './disease';
import { finRotStage } from './fin-rot';
import {
  HUNGRY_AVERAGE,
  readHealth,
  readHunger,
  SICK_HEALTH,
  type HealthSubject,
} from './health-summary';
import { SPECIES, type SpeciesId } from './species';
import { SPECIES_LABELS } from './species-catalog';
import { speciesSheet } from './species-sheet';
import { inPhRange, SPECIES_PH } from './water-ph';
import { feedsOnPellets, STARVING_HUNGER } from './wellbeing';

/**
 * Animaux concernés par une alerte du tableau de bord (issue #483, lot 3/3 de #251, ADR 0115) :
 * fonctions pures, sans hasard ni horloge, qui lisent les animaux du bac sélectionné et
 * n'écrivent rien dans le monde.
 *
 * Règles, alignées sur celles des alertes (`sim/dashboard-alerts.ts`) :
 * - `health` : malades (santé au plus `SICK_HEALTH`) sans signe de maladie, qui ont leur alerte ;
 * - `hunger` : les affamés s'il y en a, sinon ceux qui ont faim (`HUNGRY_AVERAGE`), parmi les
 *   espèces nourries aux granulés ;
 * - `ich`, `finRot` : animaux qui montrent les signes ;
 * - `temperature` : espèces hors de leur plage tolérée (fiche d'espèce) ;
 * - `ph` : espèces hors de leur plage tolérée s'il y en a, sinon hors de leur plage idéale
 *   (zone « tolérée » du bac) ;
 * - `mix` : espèces nommées par un mélange déconseillé.
 *
 * Une température ou un pH non finis ne rassurent jamais : tous les animaux sont concernés.
 * Les alertes qui ne visent pas d'animal précis (composés de l'eau, algues, traitement) n'en
 * désignent aucun.
 */

/** Alertes qui désignent des animaux. */
export const TARGETED_ALERTS = [
  'health',
  'hunger',
  'ich',
  'finRot',
  'temperature',
  'ph',
  'mix',
] as const;

/** Sujet d'une alerte qui désigne des animaux. */
export type TargetedAlertId = (typeof TARGETED_ALERTS)[number];

/** Animal vu par ces fonctions : celui de la synthèse de santé, avec son identifiant. */
export interface AlertAnimal extends HealthSubject {
  readonly id: number;
}

/** Eau et mélanges du bac sélectionné. */
export interface AlertAnimalsContext {
  readonly temperature: number;
  readonly ph: number;
  readonly mixes: readonly MixWarning[];
}

/** Espèce et nombre d'animaux concernés. */
export interface AlertAnimalGroup {
  readonly species: SpeciesId;
  readonly count: number;
}

/** Animaux désignés par une alerte. Objet de données pur. */
export interface AlertTarget {
  /** Identifiants, en ordre croissant. */
  readonly ids: readonly number[];
  /** Espèces, de la plus nombreuse à la moins nombreuse. */
  readonly groups: readonly AlertAnimalGroup[];
}

/** Animaux désignés par chaque alerte qui en désigne. */
export type AlertTargets = Readonly<Record<TargetedAlertId, AlertTarget>>;

const NO_TARGET: AlertTarget = { ids: [], groups: [] };

/** Aucun animal désigné. */
export const NO_ALERT_TARGETS: AlertTargets = {
  health: NO_TARGET,
  hunger: NO_TARGET,
  ich: NO_TARGET,
  finRot: NO_TARGET,
  temperature: NO_TARGET,
  ph: NO_TARGET,
  mix: NO_TARGET,
};

function showsIch(animal: AlertAnimal): boolean {
  const stage = ichStage(animal.ich);
  return stage === 'visible' || stage === 'aggravee';
}

function showsFinRot(animal: AlertAnimal): boolean {
  const stage = finRotStage(animal.finRot);
  return stage === 'effilochee' || stage === 'avancee';
}

function hungerSelection(animals: readonly AlertAnimal[]): AlertAnimal[] {
  const fed = animals.filter((a) => feedsOnPellets(SPECIES[a.species]));
  const starving = fed.filter((a) => readHunger(a.hunger) >= STARVING_HUNGER);
  return starving.length > 0 ? starving : fed.filter((a) => readHunger(a.hunger) >= HUNGRY_AVERAGE);
}

function temperatureSelection(animals: readonly AlertAnimal[], temperature: number): AlertAnimal[] {
  return animals.filter((a) => {
    const { min, max } = speciesSheet(a.species).temperatureTolerated.value;
    // Comparaison écrite pour qu'une valeur non finie désigne l'animal.
    return !(temperature >= min && temperature <= max);
  });
}

function phSelection(animals: readonly AlertAnimal[], ph: number): AlertAnimal[] {
  const outside = animals.filter((a) => !inPhRange(ph, SPECIES_PH[a.species].tolerated));
  return outside.length > 0
    ? outside
    : animals.filter((a) => !inPhRange(ph, SPECIES_PH[a.species].ideal));
}

function mixSelection(
  animals: readonly AlertAnimal[],
  mixes: readonly MixWarning[],
): AlertAnimal[] {
  const species = new Set(mixes.flatMap((m) => [m.first, m.second]));
  return animals.filter((a) => species.has(a.species));
}

function targetOf(selection: readonly AlertAnimal[]): AlertTarget {
  if (selection.length === 0) {
    return NO_TARGET;
  }
  const counts = new Map<SpeciesId, number>();
  for (const animal of selection) {
    counts.set(animal.species, (counts.get(animal.species) ?? 0) + 1);
  }
  return {
    ids: selection.map((a) => a.id).sort((a, b) => a - b),
    groups: [...counts]
      .map(([species, count]) => ({ species, count }))
      .sort((a, b) => b.count - a.count || a.species.localeCompare(b.species)),
  };
}

/** Animaux désignés par chaque alerte, pour les animaux `animals` du bac sélectionné. */
export function alertTargets(
  animals: readonly AlertAnimal[],
  context: AlertAnimalsContext,
): AlertTargets {
  if (animals.length === 0) {
    return NO_ALERT_TARGETS;
  }
  return {
    health: targetOf(
      animals.filter((a) => readHealth(a.health) <= SICK_HEALTH && !showsIch(a) && !showsFinRot(a)),
    ),
    hunger: targetOf(hungerSelection(animals)),
    ich: targetOf(animals.filter(showsIch)),
    finRot: targetOf(animals.filter(showsFinRot)),
    temperature: targetOf(temperatureSelection(animals, context.temperature)),
    ph: targetOf(phSelection(animals, context.ph)),
    mix: targetOf(mixSelection(animals, context.mixes)),
  };
}

/** Animaux désignés par l'alerte `id` ; `null` si cette alerte n'en désigne jamais. */
export function targetOfAlert(targets: AlertTargets, id: AlertId): AlertTarget | null {
  return (TARGETED_ALERTS as readonly AlertId[]).includes(id)
    ? targets[id as TargetedAlertId]
    : null;
}

/** Texte des animaux désignés : « 3 néons, 1 corydora » ; « aucun » si la liste est vide. */
export function alertAnimalsText(groups: readonly AlertAnimalGroup[]): string {
  if (groups.length === 0) {
    return 'aucun pour l’instant';
  }
  return groups
    .map(({ species, count }) => {
      const labels = SPECIES_LABELS[species];
      return `${count} ${count > 1 ? labels.plural : labels.singular}`;
    })
    .join(', ');
}

/** Vrai si deux listes désignent les mêmes animaux (l'hôte ne notifie qu'à ce moment-là). */
export function sameAlertTargets(a: AlertTargets, b: AlertTargets): boolean {
  return TARGETED_ALERTS.every((id) => {
    const first = a[id].ids;
    const second = b[id].ids;
    return first.length === second.length && first.every((value, i) => value === second[i]);
  });
}
