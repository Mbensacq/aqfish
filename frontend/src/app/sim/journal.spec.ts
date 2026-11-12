import type { Egg } from './eggs';
import {
  JOURNAL_CAPACITY,
  JOURNAL_VERSION,
  addJournalEntry,
  copySavedJournal,
  createJournal,
  journalDay,
  journalLines,
  journalText,
  observeJournal,
  readJournal,
  restoreJournal,
  savedJournal,
  treatmentEntry,
  watchJournal,
  waterChangeEntry,
  type JournalEntry,
  type JournalSubject,
} from './journal';
import type { Fish } from './swimmer';
import { createDefaultWorld } from './world';

const fishes = (): Fish[] => createDefaultWorld(42).entities.map((fish) => ({ ...fish }));

function subject(entities: Fish[], time = 0, eggs?: Egg[]): JournalSubject {
  return { time, entities, ...(eggs === undefined ? {} : { eggs }) };
}

const egg = (species: Egg['species'] = 'corydora'): Egg => ({
  species,
  x: 0,
  y: 0.05,
  z: 0,
  age: 0,
  surface: 'vitre',
});

describe('journal du bac (#581)', () => {
  describe('ajout', () => {
    it('journal vide : aucune ligne', () => {
      expect(journalLines(createJournal())).toEqual([]);
    });

    it('range les entrées par temps, même ajoutées dans le désordre', () => {
      const journal = createJournal();
      addJournalEntry(journal, waterChangeEntry(300));
      addJournalEntry(journal, waterChangeEntry(100));
      addJournalEntry(journal, waterChangeEntry(200));
      expect(journal.entries.map((entry) => entry.time)).toEqual([100, 200, 300]);
    });

    it('temps égaux : l’ordre d’ajout départage', () => {
      const journal = createJournal();
      addJournalEntry(journal, treatmentEntry(50, 'sel'));
      addJournalEntry(journal, waterChangeEntry(50));
      addJournalEntry(journal, treatmentEntry(50, 'chaleur'));
      addJournalEntry(journal, waterChangeEntry(10));
      expect(journal.entries.map((entry) => entry.detail ?? entry.kind)).toEqual([
        'changementEau',
        'sel',
        'changementEau',
        'chaleur',
      ]);
    });

    it(`plafond de ${JOURNAL_CAPACITY} entrées : les plus anciennes partent`, () => {
      const journal = createJournal();
      for (let i = 0; i < JOURNAL_CAPACITY + 5; i++) {
        addJournalEntry(journal, waterChangeEntry(i));
      }
      expect(journal.entries).toHaveLength(JOURNAL_CAPACITY);
      expect(journal.entries[0]!.time).toBe(5);
      expect(journal.entries.at(-1)!.time).toBe(JOURNAL_CAPACITY + 4);
    });

    it('plein, une entrée plus ancienne que toutes ressort aussitôt', () => {
      const journal = createJournal();
      for (let i = 0; i < JOURNAL_CAPACITY; i++) {
        addJournalEntry(journal, waterChangeEntry(100 + i));
      }
      addJournalEntry(journal, waterChangeEntry(0));
      expect(journal.entries).toHaveLength(JOURNAL_CAPACITY);
      expect(journal.entries[0]!.time).toBe(100);
    });

    it('ignore une entrée invalide sans changer de version', () => {
      const journal = createJournal();
      const bad: JournalEntry[] = [
        waterChangeEntry(-1),
        waterChangeEntry(Number.NaN),
        waterChangeEntry(Number.POSITIVE_INFINITY),
        { time: 1, kind: 'inconnu' as JournalEntry['kind'] },
        { time: 1, kind: 'traitement', detail: 'tisane' },
        { time: 1, kind: 'maladie', detail: 'ich', count: 0 },
        { time: 1, kind: 'ponte', detail: 'licorne', count: 2 },
        { time: 1, kind: 'changementEau', detail: 'ich' },
      ];
      for (const entry of bad) {
        expect(addJournalEntry(journal, entry)).toBe(false);
      }
      expect(journal.entries).toEqual([]);
      expect(journal.version).toBe(0);
    });

    it('copie l’entrée : la modifier ensuite ne change pas le journal', () => {
      const journal = createJournal();
      const entry = { ...waterChangeEntry(1) } as { time: number };
      addJournalEntry(journal, entry as JournalEntry);
      entry.time = 99;
      expect(journal.entries[0]!.time).toBe(1);
    });
  });

  describe('sources', () => {
    it('changement d’eau et traitement : entrées datées', () => {
      expect(waterChangeEntry(42)).toEqual({ time: 42, kind: 'changementEau' });
      expect(treatmentEntry(7, 'medicament')).toEqual({
        time: 7,
        kind: 'traitement',
        detail: 'medicament',
      });
      expect(journalText(treatmentEntry(7, 'sel'))).toBe('Traitement : sel');
      expect(journalText(waterChangeEntry(7))).toBe('Changement d’eau');
    });

    it('premier regard : rien n’est écrit, même un bac déjà malade', () => {
      const entities = fishes();
      entities[0] = { ...entities[0]!, ich: 400 };
      const watch = watchJournal(subject(entities, 0, [egg()]));
      expect(observeJournal(watch, subject(entities, 10, [egg()]))).toEqual([]);
    });

    it('maladie déclarée puis guérie, comptée par maladie', () => {
      const entities = fishes();
      const watch = watchJournal(subject(entities));
      entities[0] = { ...entities[0]!, ich: 1 };
      entities[1] = { ...entities[1]!, ich: 1 };
      entities[2] = { ...entities[2]!, finRot: 1 };
      expect(observeJournal(watch, subject(entities, 60))).toEqual([
        { time: 60, kind: 'maladie', detail: 'ich', count: 2 },
        { time: 60, kind: 'maladie', detail: 'finRot', count: 1 },
      ]);
      // Une maladie qui progresse n'écrit rien de plus.
      entities[0] = { ...entities[0]!, ich: 500 };
      expect(observeJournal(watch, subject(entities, 70))).toEqual([]);
      const healed: Record<string, unknown> = { ...entities[0]! };
      delete healed['ich'];
      entities[0] = healed as unknown as Fish;
      expect(observeJournal(watch, subject(entities, 80))).toEqual([
        { time: 80, kind: 'guerison', detail: 'ich', count: 1 },
      ]);
    });

    it('un animal malade qui meurt ou quitte le bac n’est pas une guérison', () => {
      const entities = fishes();
      entities[0] = { ...entities[0]!, velvet: 1 };
      const watch = watchJournal(subject(entities));
      expect(observeJournal(watch, subject(entities.slice(1), 5))).toEqual([]);
      expect(watch.diseases.has(entities[0]!.id)).toBe(false);
    });

    it('un animal arrivé malade (transfert) déclare sa maladie ; adulte sain : rien', () => {
      const entities = fishes();
      const [first, ...rest] = entities;
      const watch = watchJournal(subject(rest));
      expect(observeJournal(watch, subject([...rest, first!], 1))).toEqual([]);
      const watch2 = watchJournal(subject(rest));
      expect(observeJournal(watch2, subject([...rest, { ...first!, dropsy: 1 }], 2))).toEqual([
        { time: 2, kind: 'maladie', detail: 'dropsy', count: 1 },
      ]);
    });

    it('ponte : œufs nouveaux par espèce ; éclosion ou œufs mangés : pas de ponte', () => {
      const entities = fishes();
      const watch = watchJournal(subject(entities));
      expect(observeJournal(watch, subject(entities, 30, [egg(), egg(), egg()]))).toEqual([
        { time: 30, kind: 'ponte', detail: 'corydora', count: 3 },
      ]);
      expect(observeJournal(watch, subject(entities, 40, [egg()]))).toEqual([]);
      expect(observeJournal(watch, subject(entities, 50, [egg(), egg()]))).toEqual([
        { time: 50, kind: 'ponte', detail: 'corydora', count: 1 },
      ]);
      expect(observeJournal(watch, subject(entities, 60))).toEqual([]);
    });

    it('éclosion : alevins nouveaux, comptés par espèce', () => {
      const entities = fishes();
      const watch = watchJournal(subject(entities));
      const fry = (id: number): Fish => ({ ...entities[0]!, id, growth: 0 });
      expect(observeJournal(watch, subject([...entities, fry(900), fry(901)], 90))).toEqual([
        { time: 90, kind: 'eclosion', detail: entities[0]!.species, count: 2 },
      ]);
      expect(observeJournal(watch, subject([...entities, fry(900), fry(901)], 95))).toEqual([]);
    });
  });

  describe('lignes', () => {
    it('de la plus récente à la plus ancienne, avec le jour simulé', () => {
      const journal = createJournal();
      addJournalEntry(journal, waterChangeEntry(10));
      addJournalEntry(journal, { time: 1300, kind: 'ponte', detail: 'corydora', count: 1 });
      expect(journalLines(journal)).toEqual([
        { kind: 'ponte', day: 2, text: 'Ponte : 1 œuf (Corydora)' },
        { kind: 'changementEau', day: 1, text: 'Changement d’eau' },
      ]);
    });

    it('jours : 1 au départ, 2 après une journée de 1200 s', () => {
      expect(journalDay(0)).toBe(1);
      expect(journalDay(1199.9)).toBe(1);
      expect(journalDay(1200)).toBe(2);
    });

    it('textes au pluriel et au singulier', () => {
      expect(journalText({ time: 0, kind: 'maladie', detail: 'ich', count: 1 })).toBe(
        'Maladie déclarée : points blancs (1 animal)',
      );
      expect(journalText({ time: 0, kind: 'guerison', detail: 'velvet', count: 3 })).toBe(
        'Guérison : velours (3 animaux)',
      );
      expect(journalText({ time: 0, kind: 'eclosion', detail: 'corydora', count: 4 })).toBe(
        'Éclosion : 4 alevins (Corydora)',
      );
    });
  });

  describe('sauvegarde', () => {
    function filled(): ReturnType<typeof createJournal> {
      const journal = createJournal();
      addJournalEntry(journal, waterChangeEntry(5));
      addJournalEntry(journal, treatmentEntry(6, 'chaleur'));
      addJournalEntry(journal, { time: 7, kind: 'maladie', detail: 'fungus', count: 2 });
      return journal;
    }

    it('aller-retour sans perte, via JSON', () => {
      const journal = filled();
      const saved = JSON.parse(JSON.stringify(savedJournal(journal))) as unknown;
      const problems: string[] = [];
      const read = readJournal(saved, problems);
      expect(problems).toEqual([]);
      expect(restoreJournal(read!).entries).toEqual(journal.entries);
    });

    it('la forme sauvegardée et ses copies ne partagent rien avec le journal', () => {
      const journal = filled();
      const saved = savedJournal(journal);
      const copy = copySavedJournal(saved);
      addJournalEntry(journal, waterChangeEntry(8));
      expect(saved.entries).toHaveLength(3);
      expect(copy).toEqual(saved);
      expect(copy.entries).not.toBe(saved.entries);
    });

    it.each<[string, unknown]>([
      ['pas un objet', 3],
      ['liste', []],
      ['version inconnue', { version: 2, entries: [] }],
      ['entrées absentes', { version: JOURNAL_VERSION }],
      ['entrée invalide', { version: JOURNAL_VERSION, entries: [{ time: 1, kind: 'x' }] }],
      [
        'désordre',
        {
          version: JOURNAL_VERSION,
          entries: [waterChangeEntry(5), waterChangeEntry(2)],
        },
      ],
      [
        'trop d’entrées',
        {
          version: JOURNAL_VERSION,
          entries: Array.from({ length: JOURNAL_CAPACITY + 1 }, () => waterChangeEntry(0)),
        },
      ],
    ])('refuse un journal invalide (%s)', (_name, value) => {
      const problems: string[] = [];
      expect(readJournal(value, problems)).toBeNull();
      expect(problems).toHaveLength(1);
    });

    it('relit un journal vide et un journal plein', () => {
      const problems: string[] = [];
      expect(readJournal({ version: JOURNAL_VERSION, entries: [] }, problems)).toEqual({
        version: JOURNAL_VERSION,
        entries: [],
      });
      const full = Array.from({ length: JOURNAL_CAPACITY }, (_, i) => waterChangeEntry(i));
      expect(
        readJournal({ version: JOURNAL_VERSION, entries: full }, problems)?.entries,
      ).toHaveLength(JOURNAL_CAPACITY);
      expect(problems).toEqual([]);
    });
  });
});
