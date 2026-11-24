import type { PossibleReason, PossibleSpecies } from './possible-species';
import { SPECIES, type SpeciesId } from './species';
import { SPECIES_LABELS } from './species-catalog';
import { sourceLabel } from './tank-capacity';
import { CAUSE_TEXT } from './verdict-matrix';
import type { VerdictLevel } from './verdict';

/**
 * Textes de la liste des espèces encore possibles (issue #818), au format du cartel
 * (`docs/INTERFACE.md`) : nom courant, nom scientifique, une ligne utile (verdict et nombre
 * restant), puis chaque raison avec sa source ou « approximation de jeu ».
 */

/** Intitulé de chaque niveau. */
export const LEVEL_LABELS: Readonly<Record<VerdictLevel, string>> = {
  compatible: 'Compatible',
  precautions: 'Avec précautions',
  incompatible: 'Incompatible',
};

/** Cartel d'une espèce de la liste. */
export interface PossibleSpeciesCartel {
  readonly species: SpeciesId;
  readonly level: VerdictLevel;
  readonly name: string;
  readonly scientificName: string;
  /** « Compatible · encore 12 », « Incompatible · plus de place ». */
  readonly summary: string;
  /** Une ligne par raison, source comprise. */
  readonly reasons: readonly string[];
}

/** « encore 12 », « encore 1 », « plus de place ». */
function remainingText(remaining: number): string {
  return remaining > 0 ? `encore ${remaining}` : 'plus de place';
}

/**
 * Ligne d'une raison, toujours précédée de l'espèce présente visée : « Avec les poissons
 * rouges : eau froide et eau tropicale (incompatible) — approximation de jeu » ; quand une
 * espèce agit, elle est nommée (« Avec les crevettes cerises : xipho mange les jeunes
 * (précautions) — FishKeeper »). Capacité : la raison de `canAdd`, déjà sourcée.
 */
export function possibleReasonText(entry: PossibleReason): string {
  if (entry.kind === 'capacite') {
    return entry.text ?? 'Effectif maximal atteint pour ce bac';
  }
  const { reason, against } = entry;
  const level = reason.level === 'incompatible' ? 'incompatible' : 'précautions';
  const actor = reason.actor === null ? '' : `${SPECIES_LABELS[reason.actor].singular} `;
  const source = sourceLabel({ value: null, status: reason.status });
  return `Avec les ${SPECIES_LABELS[against].plural} : ${actor}${CAUSE_TEXT[reason.cause]} (${level}) — ${source}`;
}

/** Cartel d'une espèce encore possible (ou non). */
export function possibleSpeciesCartel(entry: PossibleSpecies): PossibleSpeciesCartel {
  const def = SPECIES[entry.species];
  return Object.freeze({
    species: entry.species,
    level: entry.level,
    name: def.name,
    scientificName: def.scientificName,
    summary: `${LEVEL_LABELS[entry.level]} · ${remainingText(entry.remaining)}`,
    reasons: Object.freeze(entry.reasons.map(possibleReasonText)),
  });
}
