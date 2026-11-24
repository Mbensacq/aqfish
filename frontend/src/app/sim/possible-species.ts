import type { PopulationCounts } from './population';
import type { SpeciesId } from './species';
import type { CapacityTank } from './tank-capacity';
import { capacityLimits, type CapacityLimits } from './tank-capacity-limits';
import { verdict, type VerdictLevel, type VerdictReason } from './verdict';

/**
 * Espèces encore possibles pour le bac courant (issue #818, tranche 2 de #730, addendum à
 * l'ADR 0174, `docs/ECOSYSTEME.md` § 3.2) : pour chaque espèce du milieu, le pire verdict face
 * aux espèces présentes (`sim/verdict.ts`), le nombre d'animaux que la capacité laisse encore
 * (`sim/tank-capacity-limits.ts`) et chaque raison de refus ou de précaution.
 *
 * Calcul pur et déterministe, à la demande (relevé des effectifs), jamais dans la boucle
 * d'affichage. Il ne retire rien et ne change aucun comportement : `compatibility()` pilote
 * toujours les rivalités des nageurs.
 */

/** Bac vu par le calcul : capacité, espèces du milieu (ordre du catalogue) et bornes. */
export interface PossibleSpeciesTank extends CapacityTank {
  /** Espèces proposées par le milieu, dans l'ordre du catalogue. */
  readonly species: readonly SpeciesId[];
  /** Effectif maximal de chaque espèce hors capacité (plafonds techniques, pièce). */
  readonly bounds: PopulationCounts;
}

/** Raison d'un verdict face à une espèce présente. */
export interface PossibleVerdictReason {
  readonly kind: 'verdict';
  /** Espèce présente face à laquelle la raison vaut. */
  readonly against: SpeciesId;
  readonly reason: VerdictReason;
}

/** Plus aucun animal possible : capacité du bac, ou effectif maximal atteint. */
export interface PossibleCapacityReason {
  readonly kind: 'capacite';
  /** Raison chiffrée et sourcée (`canAdd`), ou `null` si c'est la borne qui bloque. */
  readonly text: string | null;
}

/** Raison de la place d'une espèce dans la liste. */
export type PossibleReason = PossibleVerdictReason | PossibleCapacityReason;

/** Une espèce du milieu et ce que le bac en permet. */
export interface PossibleSpecies {
  readonly species: SpeciesId;
  /** Pire niveau des raisons ; plus aucune place compte comme `incompatible`. */
  readonly level: VerdictLevel;
  /** Animaux de cette espèce que l'on peut encore ajouter (0 au moins). */
  readonly remaining: number;
  readonly reasons: readonly PossibleReason[];
}

/** Ordre des niveaux dans la liste : compatibles, précautions, incompatibles. */
const LEVEL_RANK: Readonly<Record<VerdictLevel, number>> = {
  compatible: 0,
  precautions: 1,
  incompatible: 2,
};

/** Espèces présentes (effectif fini strictement positif), dans l'ordre de `population`. */
function presentSpecies(tank: CapacityTank): SpeciesId[] {
  const present: SpeciesId[] = [];
  for (const { species, count } of tank.population) {
    if (count > 0 && Number.isFinite(count) && !present.includes(species)) {
      present.push(species);
    }
  }
  return present;
}

/** Effectif actuel de `species` (0 si absente). */
function currentCount(tank: CapacityTank, species: SpeciesId): number {
  let n = 0;
  for (const entry of tank.population) {
    if (entry.species === species && Number.isFinite(entry.count) && entry.count > 0) {
      n += Math.floor(entry.count);
    }
  }
  return n;
}

/** Raisons de verdict de `species` face à chaque espèce présente, dans l'ordre des présentes. */
function verdictReasons(species: SpeciesId, present: readonly SpeciesId[]): PossibleReason[] {
  const reasons: PossibleReason[] = [];
  for (const other of present) {
    for (const reason of verdict(species, other).reasons) {
      reasons.push(Object.freeze({ kind: 'verdict', against: other, reason }));
    }
  }
  return reasons;
}

/** Pire niveau des raisons (`compatible` sans raison). */
function worstLevel(reasons: readonly PossibleReason[]): VerdictLevel {
  let level: VerdictLevel = 'compatible';
  for (const entry of reasons) {
    const own = entry.kind === 'capacite' ? 'incompatible' : entry.reason.level;
    level = LEVEL_RANK[own] > LEVEL_RANK[level] ? own : level;
  }
  return level;
}

/**
 * Espèces encore possibles dans `tank`, rangées par niveau (compatibles, précautions,
 * incompatibles), l'ordre du catalogue départageant les égalités. Pour chacune :
 *
 * - le verdict de l'espèce face à chaque **autre** espèce présente, toutes ses raisons
 *   gardées (le niveau est le pire) ;
 * - le nombre restant : effectif maximal de la capacité (`capacityLimits`, au plafond, borné
 *   par `bounds`) moins l'effectif actuel ; à 0, une raison « capacité » (texte de `canAdd`, ou
 *   `null` quand seule la borne bloque) qui rend l'espèce incompatible.
 *
 * Mode décor : ni verdict ni capacité, tout est compatible dans la limite des bornes. Un bac
 * déjà au-delà de sa capacité garde ses animaux : seul le nombre restant tombe à 0.
 *
 * `limits` évite de recalculer la capacité quand l'appelant l'a déjà (`capacityLimits` du même
 * bac, mêmes espèces et bornes).
 *
 * @throws RangeError si une espèce n'est pas une espèce du jeu (`verdict`).
 */
export function possibleSpecies(
  tank: PossibleSpeciesTank,
  limits: CapacityLimits = capacityLimits(tank, tank.species, tank.bounds),
): readonly PossibleSpecies[] {
  const decor = tank.mode === 'decor';
  const present = decor ? [] : presentSpecies(tank);
  const entries = tank.species.map((species): PossibleSpecies => {
    const remaining = Math.max(0, (limits.limits[species] ?? 0) - currentCount(tank, species));
    const reasons = verdictReasons(species, present);
    if (remaining === 0) {
      reasons.push(Object.freeze({ kind: 'capacite', text: limits.reasons[species] ?? null }));
    }
    return Object.freeze({
      species,
      level: worstLevel(reasons),
      remaining,
      reasons: Object.freeze(reasons),
    });
  });
  return Object.freeze(entries.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]));
}

/** Rien à proposer (avant le démarrage). */
export const NO_POSSIBLE_SPECIES: readonly PossibleSpecies[] = Object.freeze([]);
