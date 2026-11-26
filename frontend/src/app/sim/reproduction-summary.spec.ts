import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import type { Egg } from './eggs';
import {
  addJournalEntry,
  careSessionEntry,
  createJournal,
  journalLines,
  observeJournal,
  readJournal,
  restoreJournal,
  savedJournal,
  watchJournal,
  type JournalEntry,
} from './journal';
import {
  REPRODUCTION_SUMMARY_DAYS,
  reproductionSummary,
  reproductionText,
} from './reproduction-summary';
import type { Fish } from './swimmer';
import { createDefaultWorld } from './world';

const DAY = DEFAULT_DAY_LENGTH_SECONDS;

const ENTRIES: readonly JournalEntry[] = [
  { time: 100, kind: 'ponte', detail: 'corydora', count: 4 },
  { time: 200, kind: 'changementEau' },
  { time: 300, kind: 'ponte', detail: 'corydora', count: 2 },
  { time: 1300, kind: 'naissance', detail: 'guppy', count: 2 },
  { time: 1400, kind: 'eclosion', detail: 'corydora', count: 3 },
  careSessionEntry(1500),
];

describe('reproductionSummary (#677)', () => {
  it('compte pontes, éclosions et naissances par espèce, dans l’ordre du catalogue', () => {
    const summary = reproductionSummary(ENTRIES, 2 * DAY);
    expect(summary.days).toBe(REPRODUCTION_SUMMARY_DAYS);
    expect(summary.rows).toEqual([
      { species: 'guppy', layings: 0, eggs: 0, hatchings: 0, hatched: 0, births: 1, born: 2 },
      { species: 'corydora', layings: 2, eggs: 6, hatchings: 1, hatched: 3, births: 0, born: 0 },
    ]);
    expect(reproductionText(summary)).toBe(
      'Reproduction, 7 derniers jours : Guppy, 1 naissance (2 alevins) ; ' +
        'Corydora, 2 pontes (6 œufs), 1 éclosion (3 alevins).',
    );
  });

  it('zéro sans événement : aucune ligne, « rien de nouveau », pas d’exception', () => {
    for (const entries of [[], [careSessionEntry(10), { time: 20, kind: 'changementEau' }]]) {
      const summary = reproductionSummary(entries as JournalEntry[], 0);
      expect(summary.rows).toEqual([]);
      expect(reproductionText(summary)).toBe('Reproduction, 7 derniers jours : rien de nouveau.');
    }
  });

  it('période : jours entiers jusqu’au jour courant, les plus anciens sont hors bilan', () => {
    const entries: JournalEntry[] = [
      { time: 0, kind: 'ponte', detail: 'neon', count: 5 },
      { time: 7 * DAY - 1, kind: 'ponte', detail: 'neon', count: 1 },
      { time: 7 * DAY, kind: 'ponte', detail: 'neon', count: 2 },
    ];
    // Jour 8 : les jours 2 à 8 comptent, la ponte du jour 1 non.
    expect(reproductionSummary(entries, 7 * DAY).rows[0]!.eggs).toBe(3);
    // Jour 7 : tout compte.
    expect(reproductionSummary(entries.slice(0, 2), 7 * DAY - 1).rows[0]!.eggs).toBe(6);
    // Un seul jour : celui de la dernière ponte.
    const today = reproductionSummary(entries, 7 * DAY, 1);
    expect(today.rows[0]!.layings).toBe(1);
    expect(reproductionText(today)).toBe('Reproduction, aujourd’hui : Néon, 1 ponte (2 œufs).');
    // Longtemps après : plus rien.
    expect(reproductionSummary(entries, 100 * DAY).rows).toEqual([]);
  });

  it('bac importé dont l’horloge repart de zéro : le jour courant suit la dernière entrée', () => {
    expect(reproductionSummary(ENTRIES, 0).rows).toHaveLength(2);
  });

  it('effectif absent : un animal ; espèce inconnue ou absente : ignorée', () => {
    const summary = reproductionSummary(
      [
        { time: 1, kind: 'naissance', detail: 'guppy' },
        { time: 2, kind: 'ponte', detail: 'licorne', count: 3 },
        { time: 3, kind: 'eclosion' },
      ],
      3,
    );
    expect(summary.rows).toEqual([
      { species: 'guppy', layings: 0, eggs: 0, hatchings: 0, hatched: 0, births: 1, born: 1 },
    ]);
    expect(reproductionText(summary)).toContain('Guppy, 1 naissance (1 alevin).');
  });

  it('temps invalide : aucune ligne ; nombre de jours invalide : RangeError', () => {
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(reproductionSummary(ENTRIES, now).rows).toEqual([]);
    }
    for (const days of [0, -3, 1.5, Number.NaN]) {
      expect(() => reproductionSummary(ENTRIES, 0, days)).toThrow(RangeError);
    }
  });
});

describe('journal de reproduction à la reprise d’une sauvegarde (#677)', () => {
  const fishes = (): Fish[] => createDefaultWorld(42).entities.map((fish) => ({ ...fish }));
  const egg = (x: number): Egg => ({ species: 'corydora', x, y: 0, z: 0, age: 0, surface: 'sol' });

  it('une ligne par événement ; relu de sa sauvegarde, rien n’est écrit deux fois', () => {
    const entities = fishes();
    const journal = createJournal();
    const watch = watchJournal({ time: 0, entities, eggs: [] });
    const observe = (time: number, eggs: Egg[], world = entities): void => {
      for (const entry of observeJournal(watch, { time, entities: world, eggs })) {
        addJournalEntry(journal, entry);
      }
    };
    observe(10, [egg(1), egg(2)]);
    observe(20, [egg(1), egg(2)]);
    expect(journalLines(journal).map((line) => line.text)).toEqual(['Ponte : 2 œufs (Corydora)']);

    // Sauvegarde puis reprise : nouveau premier regard (muet) sur le bac relu.
    const problems: string[] = [];
    const saved = readJournal(JSON.parse(JSON.stringify(savedJournal(journal))), problems);
    expect(problems).toEqual([]);
    const reloaded = restoreJournal(saved!);
    const reloadedWatch = watchJournal({ time: 20, entities, eggs: [egg(1), egg(2)] });
    for (const time of [30, 40]) {
      for (const entry of observeJournal(reloadedWatch, {
        time,
        entities,
        eggs: [egg(1), egg(2)],
      })) {
        addJournalEntry(reloaded, entry);
      }
    }
    expect(reloaded.entries).toEqual(journal.entries);
    expect(reproductionSummary(reloaded.entries, 40)).toEqual(
      reproductionSummary(journal.entries, 20),
    );
    expect(reproductionSummary(reloaded.entries, 40).rows[0]!.layings).toBe(1);
  });
});
