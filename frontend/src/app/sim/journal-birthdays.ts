import { ageSeconds, YEAR_SECONDS, type AgingSubject } from './aging';
import type { JournalEntry } from './journal';
import type { SpeciesId } from './species';

/**
 * Anniversaires au journal du bac (issue #877) : chaque année de jeu révolue d'un animal
 * vivant (`sim/aging.ts`, ADR 0187) entre au journal, une seule fois par année et par animal.
 * Les animaux sont regroupés par espèce et par âge atteint, pour qu'un bac de 240 animaux
 * n'écrive qu'une ligne par espèce et par âge, et ne chasse pas les autres événements.
 *
 * La veille (`Map` identifiant → années révolues) est celle du journal (`JournalWatch`) : elle
 * vit hors du monde, se refait muette au chargement (aucun doublon après rechargement d'une
 * sauvegarde) et oublie les animaux disparus (taille bornée par la population).
 */

/**
 * Années notées au plus pour un même animal en une observation (avance à gros pas) : les plus
 * récentes. Borne l'écriture quand le temps saute de plusieurs années d'un coup.
 */
export const BIRTHDAY_YEARS_PER_OBSERVATION = 3;

/** Ce que les anniversaires lisent du bac ; sans graine, aucun âge n'est suivi. */
export interface BirthdaySubject {
  readonly seed?: number;
  readonly time: number;
  readonly entities: readonly AgingSubject[];
}

/** Années de jeu révolues de `animal` au temps `time` (0 avant son premier anniversaire). */
export function ageYears(animal: AgingSubject, seed: number, time: number): number {
  return Math.floor(ageSeconds(animal, seed, time) / YEAR_SECONDS);
}

/** Années révolues de chaque animal du bac (vide sans graine) : premier regard, sans écrire. */
export function birthdayWatch(world: BirthdaySubject): Map<number, number> {
  const years = new Map<number, number>();
  if (world.seed === undefined) {
    return years;
  }
  for (const animal of world.entities) {
    years.set(animal.id, ageYears(animal, world.seed, world.time));
  }
  return years;
}

/**
 * Ajoute à `events` les anniversaires survenus depuis `seen` (années révolues à la dernière
 * observation) et renvoie la nouvelle veille. Un animal inconnu de `seen` (ajout, alevin,
 * transfert) est retenu sans ligne ; un âge revenu en arrière (temps rembobiné) est retenu
 * sans ligne. Une ligne par espèce et par âge atteint, dans l'ordre des animaux puis des âges.
 */
export function pushBirthdayEvents(
  events: JournalEntry[],
  seen: ReadonlyMap<number, number>,
  world: BirthdaySubject,
): Map<number, number> {
  const next = birthdayWatch(world);
  const groups = new Map<string, { species: SpeciesId; years: number; count: number }>();
  for (const animal of world.entities) {
    const before = seen.get(animal.id);
    const now = next.get(animal.id);
    if (before === undefined || now === undefined || now <= before) {
      continue;
    }
    const first = Math.max(before + 1, now - BIRTHDAY_YEARS_PER_OBSERVATION + 1);
    for (let years = first; years <= now; years++) {
      const key = `${animal.species}:${years}`;
      const group = groups.get(key);
      if (group === undefined) {
        groups.set(key, { species: animal.species, years, count: 1 });
      } else {
        group.count++;
      }
    }
  }
  for (const { species, years, count } of groups.values()) {
    events.push({ time: world.time, kind: 'anniversaire', detail: species, count, years });
  }
  return next;
}
