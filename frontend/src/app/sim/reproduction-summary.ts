import { journalDay, type JournalEntry } from './journal';
import { SPECIES, type SpeciesId } from './species';

/**
 * Bilan de reproduction du bac (issue #677) : pontes, éclosions et naissances des derniers jours
 * simulés, comptées par espèce à partir des entrées du journal (#581, #655). Fonctions pures,
 * sans hasard ni horloge : le journal reste la seule source, donc un bac relu de sa sauvegarde
 * donne le même bilan, sans rien compter deux fois.
 *
 * La période couvre `REPRODUCTION_SUMMARY_DAYS` jours simulés entiers, jusqu'au jour courant
 * compris. Le jour courant est celui du temps du bac, ou de la dernière entrée du journal si elle
 * est plus récente (bac importé dont l'horloge repart de zéro). Le journal est plafonné
 * (`JOURNAL_CAPACITY`) : un bac très actif peut avoir perdu ses plus vieilles entrées.
 */

/** Jours simulés couverts par le bilan (approximation de jeu : une semaine). */
export const REPRODUCTION_SUMMARY_DAYS = 7;

/** Compte d'une espèce sur la période. Objet de données pur. */
export interface ReproductionRow {
  readonly species: SpeciesId;
  /** Pontes notées et œufs pondus. */
  readonly layings: number;
  readonly eggs: number;
  /** Éclosions notées et alevins éclos. */
  readonly hatchings: number;
  readonly hatched: number;
  /** Naissances notées (vivipares) et alevins nés. */
  readonly births: number;
  readonly born: number;
}

/** Bilan de la période : une ligne par espèce qui s'est reproduite, dans l'ordre du catalogue. */
export interface ReproductionSummary {
  readonly days: number;
  readonly rows: readonly ReproductionRow[];
}

type MutableRow = { -readonly [K in keyof ReproductionRow]: ReproductionRow[K] };

const SPECIES_ORDER = Object.keys(SPECIES) as SpeciesId[];

/**
 * Bilan des `days` derniers jours simulés à `now` (secondes). Aucune entrée de reproduction sur
 * la période, ou temps invalide : aucune ligne. `days` doit être un entier ≥ 1 (`RangeError`).
 */
export function reproductionSummary(
  entries: readonly JournalEntry[],
  now: number,
  days: number = REPRODUCTION_SUMMARY_DAYS,
): ReproductionSummary {
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new RangeError(`reproductionSummary : nombre de jours invalide (${days})`);
  }
  if (!Number.isFinite(now) || now < 0) {
    return { days, rows: [] };
  }
  const last = entries[entries.length - 1];
  const today = journalDay(Math.max(now, last?.time ?? 0));
  const rows = new Map<SpeciesId, MutableRow>();
  for (const entry of entries) {
    if (journalDay(entry.time) > today - days) {
      countEntry(rows, entry);
    }
  }
  return { days, rows: SPECIES_ORDER.flatMap((id) => rows.get(id) ?? []) };
}

/** Ajoute une entrée de ponte, d'éclosion ou de naissance à la ligne de son espèce. */
function countEntry(rows: Map<SpeciesId, MutableRow>, entry: JournalEntry): void {
  const { kind, detail } = entry;
  if (kind !== 'ponte' && kind !== 'eclosion' && kind !== 'naissance') {
    return;
  }
  if (detail === undefined || !Object.hasOwn(SPECIES, detail)) {
    return;
  }
  // `detail` vient d'être vérifié comme clé de `SPECIES`.
  const species = detail as SpeciesId;
  let row = rows.get(species);
  if (row === undefined) {
    row = { species, layings: 0, eggs: 0, hatchings: 0, hatched: 0, births: 0, born: 0 };
    rows.set(species, row);
  }
  const count = entry.count ?? 1;
  if (kind === 'ponte') {
    row.layings++;
    row.eggs += count;
  } else if (kind === 'eclosion') {
    row.hatchings++;
    row.hatched += count;
  } else {
    row.births++;
    row.born += count;
  }
}

/** Nombre suivi de son nom, au pluriel au-delà de un (`plural` : forme plurielle). */
function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count > 1 ? plural : singular}`;
}

/** Texte d'une ligne : « Corydora, 1 ponte (4 œufs), 1 éclosion (3 alevins) ». */
function rowText(row: ReproductionRow): string {
  const parts: string[] = [];
  if (row.layings > 0) {
    parts.push(`${counted(row.layings, 'ponte')} (${counted(row.eggs, 'œuf')})`);
  }
  if (row.hatchings > 0) {
    parts.push(`${counted(row.hatchings, 'éclosion')} (${counted(row.hatched, 'alevin')})`);
  }
  if (row.births > 0) {
    parts.push(`${counted(row.births, 'naissance')} (${counted(row.born, 'alevin')})`);
  }
  return `${SPECIES[row.species].name}, ${parts.join(', ')}`;
}

/**
 * Texte du bilan, une phrase : « Reproduction, 7 derniers jours : Corydora, 1 ponte (4 œufs) ;
 * Guppy, 1 naissance (2 alevins). », ou « … : rien de nouveau. » sans événement.
 */
export function reproductionText(summary: ReproductionSummary): string {
  const period =
    summary.days === 1
      ? 'Reproduction, aujourd’hui'
      : `Reproduction, ${summary.days} derniers jours`;
  if (summary.rows.length === 0) {
    return `${period} : rien de nouveau.`;
  }
  return `${period} : ${summary.rows.map(rowText).join(' ; ')}.`;
}
