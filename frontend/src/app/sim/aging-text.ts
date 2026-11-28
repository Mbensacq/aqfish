import { ageSeconds, averageLifespanYears, DAYS_PER_YEAR, lifespanSeconds } from './aging';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import type { SpeciesId } from './species';
import { frenchNumber, speciesSheet, statusText } from './species-sheet';
import type { World } from './world-types';

/**
 * Textes de l'âge et de la durée de vie (issue #857, ADR 0187) pour la fiche d'espèce du
 * panneau « Population » et le wiki : âge des animaux du bac, durée de vie moyenne de
 * l'espèce. Fonctions pures, sans hasard.
 */

/** Âges extrêmes des animaux d'une espèce dans un bac, en secondes simulées. */
export interface AgeSpan {
  readonly youngest: number;
  readonly oldest: number;
}

/** Âges extrêmes par espèce présente dans le bac (absente : aucun animal). */
export type AgeReadout = Readonly<Partial<Record<SpeciesId, AgeSpan>>>;

/** Relevé vide (aucun bac, aucun animal). */
export const NO_AGES: AgeReadout = Object.freeze({});

/** Champs des lignes d'âge, dans l'ordre d'affichage. */
export type AgeRowField = 'age' | 'averageLifespan';

/** Ligne d'âge ou de durée de vie : même forme que les lignes de fiche. */
export interface AgeRow {
  readonly field: AgeRowField;
  readonly label: string;
  readonly value: string;
  readonly status: string;
}

/** Statut de l'âge : il vient de la simulation, compté en jours de jeu. */
export const AGE_STATUS = 'Simulation : jours de jeu (ADR 0187)';

/** Âges extrêmes de chaque espèce du bac `world`, au temps du monde. */
export function speciesAges(world: Pick<World, 'seed' | 'time' | 'entities'>): AgeReadout {
  const ages: Partial<Record<SpeciesId, AgeSpan>> = {};
  for (const fish of world.entities) {
    const age = ageSeconds(fish, world.seed, world.time);
    const span = ages[fish.species];
    ages[fish.species] =
      span === undefined
        ? { youngest: age, oldest: age }
        : { youngest: Math.min(span.youngest, age), oldest: Math.max(span.oldest, age) };
  }
  return ages;
}

/** Jours de jeu entiers vécus à l'âge `age` (secondes) ; 0 pour un âge négatif ou non fini. */
export function ageDays(age: number): number {
  return age > 0 && Number.isFinite(age) ? Math.floor(age / DEFAULT_DAY_LENGTH_SECONDS) : 0;
}

/** Âge en français : « moins d'un jour », « 12 jours », « 1 an », « 2 ans et 3 jours ». */
export function ageText(age: number): string {
  const days = ageDays(age);
  if (days === 0) {
    return 'moins d’un jour';
  }
  const years = Math.floor(days / DAYS_PER_YEAR);
  const rest = days % DAYS_PER_YEAR;
  const dayText = `${rest} jour${rest > 1 ? 's' : ''}`;
  if (years === 0) {
    return dayText;
  }
  const yearText = `${years} an${years > 1 ? 's' : ''}`;
  return rest === 0 ? yearText : `${yearText} et ${dayText}`;
}

/** Durée de vie moyenne en français : « 4 ans », « 1,5 an ». */
export function lifespanText(species: SpeciesId): string {
  const years = averageLifespanYears(species);
  return `${frenchNumber(years)} an${years >= 2 ? 's' : ''}`;
}

/**
 * Lignes « Âge dans le bac » (si l'espèce y est) et « Durée de vie moyenne » de `species` :
 * un seul âge, ou du plus jeune au plus âgé ; « en fin de vie » quand le plus âgé a dépassé
 * la durée de vie moyenne (sa vitalité baisse).
 */
export function ageRows(species: SpeciesId, span: AgeSpan | undefined): readonly AgeRow[] {
  const average: AgeRow = {
    field: 'averageLifespan',
    label: 'Durée de vie moyenne',
    value: lifespanText(species),
    status: statusText(speciesSheet(species).lifespan.status),
  };
  if (span === undefined) {
    return [average];
  }
  const range =
    ageDays(span.youngest) === ageDays(span.oldest)
      ? ageText(span.oldest)
      : `de ${ageText(span.youngest)} à ${ageText(span.oldest)}`;
  const late = span.oldest > lifespanSeconds(species) ? ' (le plus âgé est en fin de vie)' : '';
  return [
    { field: 'age', label: 'Âge dans le bac', value: range + late, status: AGE_STATUS },
    average,
  ];
}
