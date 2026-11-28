import { describe, expect, it } from 'vitest';

import { eldest, YEAR_SECONDS, type AgingSubject } from './aging';
import { eldestText } from './aging-text';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import {
  addJournalEntry,
  createJournal,
  journalLines,
  journalText,
  observeJournal,
  readJournal,
  restoreJournal,
  savedJournal,
  watchJournal,
  JOURNAL_CAPACITY,
  type JournalEntry,
  type JournalSubject,
} from './journal';
import { ageYears, BIRTHDAY_YEARS_PER_OBSERVATION } from './journal-birthdays';
import type { Fish } from './swimmer';
import { createDefaultWorld } from './world';

const SEED = 7;
const DAY = DEFAULT_DAY_LENGTH_SECONDS;

/** Animal né à `bornAt` (secondes), sans rien d'autre que ce que lit le journal. */
function animal(id: number, bornAt: number, species: Fish['species'] = 'neon'): Fish {
  const base = createDefaultWorld(42).entities[0]!;
  return { ...base, id, species, bornAt };
}

function subject(entities: readonly Fish[], time: number): JournalSubject {
  return { seed: SEED, time, entities };
}

/** Même bac, sans graine (sujet d'un ancien appelant). */
function seedless(entities: readonly Fish[], time: number): JournalSubject {
  return { time, entities };
}

const birthdays = (events: readonly JournalEntry[]): JournalEntry[] =>
  events.filter((entry) => entry.kind === 'anniversaire');

describe('anniversaires au journal (#877)', () => {
  it('années révolues : 0 avant le premier anniversaire, 1 pile à un an', () => {
    const fish: AgingSubject = { id: 1, species: 'neon', bornAt: 0 };
    expect(ageYears(fish, SEED, YEAR_SECONDS - 1)).toBe(0);
    expect(ageYears(fish, SEED, YEAR_SECONDS)).toBe(1);
    expect(ageYears(fish, SEED, 2.5 * YEAR_SECONDS)).toBe(2);
  });

  it('le premier regard n’écrit rien, le passage d’une année écrit une ligne', () => {
    const fishes = [animal(1, -YEAR_SECONDS + DAY)];
    const watch = watchJournal(subject(fishes, 0));
    expect(birthdays(observeJournal(watch, subject(fishes, DAY / 2)))).toEqual([]);
    const events = birthdays(observeJournal(watch, subject(fishes, DAY)));
    expect(events).toEqual([
      { time: DAY, kind: 'anniversaire', detail: 'neon', count: 1, years: 1 },
    ]);
    expect(journalText(events[0]!)).toBe('Anniversaire : Néon, 1 an (1 animal)');
  });

  it('une seule fois par année : les observations suivantes de la même année n’écrivent rien', () => {
    const fishes = [animal(1, -YEAR_SECONDS + 10)];
    const watch = watchJournal(subject(fishes, 0));
    expect(birthdays(observeJournal(watch, subject(fishes, 10)))).toHaveLength(1);
    for (let t = 20; t < 20 * DAY; t += DAY / 3) {
      expect(birthdays(observeJournal(watch, subject(fishes, t)))).toEqual([]);
    }
  });

  it('regroupe par espèce et par âge, dans l’ordre des animaux', () => {
    const fishes = [
      animal(1, 1 - YEAR_SECONDS, 'guppy'),
      animal(2, 1 - YEAR_SECONDS),
      animal(3, 1 - YEAR_SECONDS, 'guppy'),
      animal(4, 1 - 2 * YEAR_SECONDS),
    ];
    const watch = watchJournal(subject(fishes, 0));
    const events = birthdays(observeJournal(watch, subject(fishes, 1)));
    expect(events.map(({ detail, count, years }) => ({ detail, count, years }))).toEqual([
      { detail: 'guppy', count: 2, years: 1 },
      { detail: 'neon', count: 1, years: 1 },
      { detail: 'neon', count: 1, years: 2 },
    ]);
    expect(journalText(events[0]!)).toBe('Anniversaire : Guppy, 1 an (2 animaux)');
  });

  it('avance à gros pas : chaque année franchie est notée, au plus les plus récentes', () => {
    const fishes = [animal(1, 0)];
    const watch = watchJournal(subject(fishes, 0));
    const two = birthdays(observeJournal(watch, subject(fishes, 2 * YEAR_SECONDS + 5)));
    expect(two.map((entry) => entry.years)).toEqual([1, 2]);
    const far = birthdays(observeJournal(watch, subject(fishes, 12 * YEAR_SECONDS)));
    expect(far.map((entry) => entry.years)).toEqual(
      Array.from(
        { length: BIRTHDAY_YEARS_PER_OBSERVATION },
        (_, i) => 12 - BIRTHDAY_YEARS_PER_OBSERVATION + 1 + i,
      ),
    );
  });

  it('animal nouveau (ajout, alevin) ou disparu : aucune ligne, la veille l’oublie', () => {
    const old = animal(1, -10 * YEAR_SECONDS);
    const watch = watchJournal(subject([], 0));
    expect(birthdays(observeJournal(watch, subject([old], 5)))).toEqual([]);
    expect(watch.birthdays.get(1)).toBe(10);
    observeJournal(watch, subject([], YEAR_SECONDS));
    expect(watch.birthdays.size).toBe(0);
  });

  it('temps revenu en arrière : aucune ligne, et le nouvel anniversaire est noté une fois', () => {
    const fishes = [animal(1, 0)];
    const watch = watchJournal(subject(fishes, YEAR_SECONDS + 1));
    expect(birthdays(observeJournal(watch, subject(fishes, YEAR_SECONDS - 1)))).toEqual([]);
    expect(birthdays(observeJournal(watch, subject(fishes, YEAR_SECONDS)))).toHaveLength(1);
  });

  it('sans graine : aucun anniversaire suivi', () => {
    const fishes = [animal(1, 0)];
    const watch = watchJournal(seedless(fishes, 0));
    expect(birthdays(observeJournal(watch, seedless(fishes, 3 * YEAR_SECONDS)))).toEqual([]);
  });

  it('déterministe sans naissance enregistrée : âge tiré de la graine, mêmes lignes', () => {
    const run = (): JournalEntry[] => {
      const world = createDefaultWorld(SEED);
      const watch = watchJournal(subject(world.entities, 0));
      return birthdays(observeJournal(watch, subject(world.entities, 3 * YEAR_SECONDS)));
    };
    expect(run().length).toBeGreaterThan(0);
    expect(run()).toEqual(run());
  });

  it('sauvegarde rechargée : aucun doublon, l’année suivante notée une seule fois', () => {
    const fishes = [animal(1, 1 - YEAR_SECONDS)];
    const journal = createJournal();
    const watch = watchJournal(subject(fishes, 0));
    for (const entry of observeJournal(watch, subject(fishes, 1))) {
      addJournalEntry(journal, entry);
    }
    const problems: string[] = [];
    const saved = readJournal(JSON.parse(JSON.stringify(savedJournal(journal))), problems);
    expect(problems).toEqual([]);
    const reloaded = restoreJournal(saved!);
    expect(reloaded.entries).toEqual(journal.entries);
    // Rechargement : premier regard muet, au même temps puis un peu plus tard.
    const again = watchJournal(subject(fishes, 1));
    expect(birthdays(observeJournal(again, subject(fishes, 1)))).toEqual([]);
    expect(birthdays(observeJournal(again, subject(fishes, DAY)))).toEqual([]);
    const next = birthdays(observeJournal(again, subject(fishes, YEAR_SECONDS + 1)));
    expect(next.map((entry) => entry.years)).toEqual([2]);
  });

  it('relecture : âge atteint exigé pour un anniversaire, refusé ailleurs', () => {
    const read = (entry: object): boolean =>
      readJournal({ version: 1, entries: [entry] }, []) !== null;
    expect(read({ time: 0, kind: 'anniversaire', detail: 'neon', count: 1, years: 3 })).toBe(true);
    expect(read({ time: 0, kind: 'anniversaire', detail: 'neon', count: 1 })).toBe(false);
    expect(read({ time: 0, kind: 'anniversaire', detail: 'neon', years: 0 })).toBe(false);
    expect(read({ time: 0, kind: 'anniversaire', detail: 'neon', years: 1.5 })).toBe(false);
    expect(read({ time: 0, kind: 'anniversaire', detail: 'inconnue', years: 1 })).toBe(false);
    expect(read({ time: 0, kind: 'mue', detail: 'neon', years: 1 })).toBe(false);
    expect(read({ time: 0, kind: 'alerte', detail: 'ph', severity: 'critique', years: 1 })).toBe(
      false,
    );
  });

  it('240 animaux : une ligne par espèce et par âge, journal et veille bornés', () => {
    const species: Fish['species'][] = ['neon', 'guppy', 'corydora'];
    const fishes = Array.from({ length: 240 }, (_, i) =>
      animal(i + 1, -((i % 4) * YEAR_SECONDS) - (i % 50) * DAY, species[i % 3]),
    );
    const journal = createJournal();
    const watch = watchJournal(subject(fishes, 0));
    let total = 0;
    for (let day = 1; day <= 2 * 365; day++) {
      const events = birthdays(observeJournal(watch, subject(fishes, day * DAY)));
      total += events.length;
      expect(events.length).toBeLessThanOrEqual(species.length * 4);
      for (const entry of events) {
        addJournalEntry(journal, entry);
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(journal.entries.length).toBeLessThanOrEqual(JOURNAL_CAPACITY);
    expect(watch.birthdays.size).toBe(240);
    expect(journalLines(journal)[0]!.group).toBe('sante');
  });
});

describe('doyen du bac (#877)', () => {
  it('bac vide : null, et aucun texte', () => {
    expect(eldest({ seed: SEED, time: 0, entities: [] })).toBeNull();
    expect(eldestText(null)).toBeNull();
  });

  it('l’animal vivant le plus âgé, avec son âge au temps du monde', () => {
    const entities: AgingSubject[] = [
      { id: 3, species: 'neon', bornAt: -DAY },
      { id: 5, species: 'guppy', bornAt: -(YEAR_SECONDS + 3 * DAY) },
      { id: 1, species: 'neon', bornAt: 0 },
    ];
    const oldest = eldest({ seed: SEED, time: 0, entities });
    expect(oldest).toEqual({ id: 5, species: 'guppy', age: YEAR_SECONDS + 3 * DAY });
    expect(eldestText(oldest)).toBe('Doyen du bac : Guppy, 1 an et 3 jours.');
  });

  it('égalité départagée par le plus petit identifiant, quel que soit l’ordre', () => {
    const a: AgingSubject = { id: 9, species: 'neon', bornAt: -DAY };
    const b: AgingSubject = { id: 4, species: 'guppy', bornAt: -DAY };
    expect(eldest({ seed: SEED, time: 0, entities: [a, b] })!.id).toBe(4);
    expect(eldest({ seed: SEED, time: 0, entities: [b, a] })!.id).toBe(4);
  });

  it('sans naissance enregistrée : âge tiré de la graine, déterministe', () => {
    const world = createDefaultWorld(SEED);
    const first = eldest(world);
    expect(first).not.toBeNull();
    expect(eldest(createDefaultWorld(SEED))).toEqual(first);
    for (const fish of world.entities) {
      expect(first!.age).toBeGreaterThanOrEqual(eldest({ ...world, entities: [fish] })!.age);
    }
  });
});
