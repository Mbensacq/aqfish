import { speciesShownIn, setCareModeInPlace } from './care-mode';
import { compatibility } from './compatibility';
import { ENVIRONMENT_IDS, environmentById, livesIn, type EnvironmentId } from './environment';
import { isSpeciesId, populationCounts, setPopulationInPlace } from './population';
import { SPECIES_LABELS } from './species-catalog';
import {
  addWarnings,
  addWarningText,
  speciesSheet,
  type AddWarning,
  type ValueRange,
} from './species-sheet';
import { SPECIES, type SpeciesId } from './species';
import type { MutableWorld } from './world';

/**
 * Retour en mode soins d'un bac passé par le mode décor (#278, lot 2, ADR 0078) : liste des
 * animaux qui ne conviennent pas au bac, avec la raison de chacun, et retrait au choix.
 *
 * Fonctions pures, sans hasard. Les contrôles sont ceux de l'ajout et du transfert d'une
 * espèce (`livesIn`, plage de température tolérée de la fiche, `addWarnings`, `compatibility`) :
 * rien n'est recopié.
 */

/** Raison pour laquelle une espèce présente ne convient pas au bac en mode soins. */
export type UnsuitableReason =
  | { readonly kind: 'milieu'; readonly homes: readonly EnvironmentId[] }
  | {
      readonly kind: 'temperature';
      readonly temperature: number;
      readonly tolerated: ValueRange;
    }
  | AddWarning;

/** Espèce présente inadaptée au bac : effectif et première raison. */
export interface UnsuitableAnimal {
  readonly species: SpeciesId;
  readonly count: number;
  readonly reason: UnsuitableReason;
}

/** Ce que le contrôle lit d'un bac : milieu, effectifs, volume d'eau et température. */
export interface CareReturnTank {
  readonly environment: EnvironmentId;
  readonly counts: Readonly<Record<SpeciesId, number>>;
  /** Volume d'eau, en litres ; inconnu (non fini ou ≤ 0) : pas de contrôle de volume. */
  readonly liters: number;
  /** Température de l'eau, en °C. */
  readonly temperature: number;
}

/** Environnements où vit l'espèce, dans l'ordre de `ENVIRONMENT_IDS`. */
function homesOf(species: SpeciesId): readonly EnvironmentId[] {
  return ENVIRONMENT_IDS.filter((id) => livesIn(id, species));
}

/**
 * Animaux du bac qui ne conviennent pas au mode soins, une entrée par espèce présente
 * (effectif fini strictement positif), dans l'ordre de `speciesShownIn` : espèces de
 * l'environnement, puis celles d'un autre milieu. La raison est la première, dans l'ordre :
 *
 * 1. **milieu** : l'espèce ne vit pas dans cet environnement ;
 * 2. **température** : l'eau est hors de la plage tolérée de la fiche (bornes comprises) ;
 * 3. **volume** puis **groupe** : avertissements d'ajout (`addWarnings`) ;
 * 4. **compatibilité** : déconseillée avec une espèce **gardée** plus haut dans la liste.
 *
 * Le contrôle de compatibilité ne vise que les espèces gardées : de deux espèces
 * incompatibles, seule la seconde est listée ; une espèce déjà listée pour une autre raison
 * ne rend pas la suivante inadaptée. Retirer les espèces listées laisse donc un bac dont la
 * liste est vide (idempotence).
 */
export function unsuitableAnimals(tank: CareReturnTank): readonly UnsuitableAnimal[] {
  const order = speciesShownIn(environmentById(tank.environment).species, tank.counts);
  const kept: SpeciesId[] = [];
  const listed: UnsuitableAnimal[] = [];
  for (const species of order) {
    const count = tank.counts[species] ?? 0;
    if (!(count > 0) || !Number.isFinite(count)) {
      continue;
    }
    const reason = firstReason(tank, species, count, kept);
    if (reason === null) {
      kept.push(species);
    } else {
      listed.push({ species, count, reason });
    }
  }
  return listed;
}

function firstReason(
  tank: CareReturnTank,
  species: SpeciesId,
  count: number,
  kept: readonly SpeciesId[],
): UnsuitableReason | null {
  if (!livesIn(tank.environment, species)) {
    return { kind: 'milieu', homes: homesOf(species) };
  }
  const tolerated = speciesSheet(species).temperatureTolerated.value;
  if (!(tank.temperature >= tolerated.min && tank.temperature <= tolerated.max)) {
    return { kind: 'temperature', temperature: tank.temperature, tolerated };
  }
  // Volume et groupe seuls : la compatibilité ne vise que les espèces gardées (ci-dessous).
  const [warning] = addWarnings(species, count, tank.liters, {}, []);
  if (warning !== undefined) {
    return warning;
  }
  for (const other of kept) {
    const verdict = compatibility(species, other);
    if (verdict !== 'compatible') {
      return { kind: 'incompatible', species, other, reason: verdict };
    }
  }
  return null;
}

/** Texte d'une raison, en une ligne (libellés du catalogue). */
export function unsuitableReasonText(animal: UnsuitableAnimal): string {
  const { reason } = animal;
  const { plural } = SPECIES_LABELS[animal.species];
  switch (reason.kind) {
    case 'milieu':
      return reason.homes.length === 0
        ? 'Autre milieu'
        : `Autre milieu : vit dans ${reason.homes
            .map((id) => `« ${environmentById(id).name} »`)
            .join(' ou ')}`;
    case 'temperature':
      return `Eau à ${frenchDegrees(reason.temperature)} °C : les ${plural} tolèrent ${
        reason.tolerated.min
      } à ${reason.tolerated.max} °C`;
    default:
      return addWarningText(reason);
  }
}

/** Titre d'un animal inadapté : nom de l'espèce et effectif (« Néon (8) »). */
export function unsuitableTitle(animal: Pick<UnsuitableAnimal, 'species' | 'count'>): string {
  return `${SPECIES[animal.species].name} (${animal.count})`;
}

/** Ligne affichée d'un animal inadapté : nom de l'espèce, effectif et raison. */
export function unsuitableLine(animal: UnsuitableAnimal): string {
  return `${unsuitableTitle(animal)} : ${unsuitableReasonText(animal)}`;
}

function frenchDegrees(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',');
}

/**
 * Repasse le bac de `world` en mode soins, **en modifiant** `world`, après avoir retiré tous
 * les animaux des espèces `remove` (« Tout retirer » ; liste vide : « Tout garder »). Les
 * autres animaux gardent leur faim et leur santé ; l'eau n'est pas touchée. Doublons et
 * identifiants inconnus sont ignorés. Renvoie le nombre d'animaux retirés.
 */
export function returnToCareInPlace(world: MutableWorld, remove: readonly string[]): number {
  const before = world.entities.length;
  for (const species of new Set(remove)) {
    if (isSpeciesId(species) && populationCounts(world)[species] > 0) {
      setPopulationInPlace(world, species, 0);
    }
  }
  setCareModeInPlace(world, 'soins');
  return before - world.entities.length;
}
