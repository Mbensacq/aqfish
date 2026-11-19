import { DEFAULT_DAY_CLOCK } from '../../sim/daylight';
import { addJournalEntry, waterChangeEntry } from '../../sim/journal';
import { initialMaintenance } from '../../sim/maintenance';
import { WATER_HISTORY_INTERVAL_TICKS } from '../../sim/water-history';
import { advanceInPlace, createWorld } from '../../sim/world';
import type { MutableWorld } from '../../sim/world-types';
import { TankRecordsController } from './tank-records-controller';

describe('TankRecordsController (#696)', () => {
  let capture: boolean;
  let records: TankRecordsController;
  /** Monde neuf, modifiable comme celui que l'hôte affiche. */
  const world = (place: Parameters<typeof createWorld>[4] = 'tropical'): MutableWorld =>
    createWorld(42, [{ species: 'neon', count: 2 }], [], [], place) as MutableWorld;

  beforeEach(() => {
    capture = false;
    records = new TankRecordsController({ isCapture: () => capture });
  });

  describe('entretien (#513)', () => {
    it('début du suivi : temps du premier relevé, gardé ensuite', () => {
      const w = world();
      w.time = 12;
      expect(records.maintenanceStartOf(w)).toBe(12);
      w.time = 50;
      expect(records.maintenanceStartOf(w)).toBe(12);
    });

    it('tâche faite : calendrier créé depuis le début du suivi, tâche datée', () => {
      const w = world();
      w.time = 5;
      records.maintenanceStartOf(w);
      w.time = 30;
      records.recordMaintenance(w, 'filter');
      expect(w.maintenance?.lastDone.filter).toBe(30);
      expect(w.maintenance?.lastDone.waterChange).toBe(5);
      expect(w.maintenance?.log).toHaveLength(1);
    });

    it('début inscrit seulement une fois le bac avancé, hors capture, sans écraser', () => {
      records.keepMaintenanceStart(null);
      const w = world();
      records.keepMaintenanceStart(w);
      expect(w.maintenance).toBeUndefined();
      w.time = 10;
      capture = true;
      records.keepMaintenanceStart(w);
      expect(w.maintenance).toBeUndefined();
      capture = false;
      records.keepMaintenanceStart(w);
      expect(w.maintenance).toEqual(initialMaintenance(0));
      records.recordMaintenance(w, 'filter');
      const kept = w.maintenance;
      w.time = 20;
      records.keepMaintenanceStart(w);
      expect(w.maintenance).toBe(kept);
    });

    it('relevé publié sans la taille quand aucune plante ne se taille', () => {
      const w = world();
      records.refresh(w);
      const tasks = records.maintenance()!.items.map((item) => item.task);
      expect(tasks).toContain('waterChange');
      expect(tasks).not.toContain('prune');
    });
  });

  describe('historique de l’eau (#511)', () => {
    it('avance coupée aux frontières de relevé, même tampon d’un appel à l’autre', () => {
      const w = world();
      const history = records.waterHistoryOf(w);
      records.advanceAndRecord(w, WATER_HISTORY_INTERVAL_TICKS + 3, DEFAULT_DAY_CLOCK);
      expect(w.tick).toBe(WATER_HISTORY_INTERVAL_TICKS + 3);
      expect(records.waterHistoryOf(w)).toBe(history);
      expect(history.count).toBeGreaterThan(0);
      expect(w.waterHistory).toBeUndefined();
    });

    it('même pas avancés d’un coup ou en deux fois : même monde au bit près', () => {
      const once = world();
      const twice = world();
      records.advanceAndRecord(once, 40, DEFAULT_DAY_CLOCK);
      records.advanceAndRecord(twice, 15, DEFAULT_DAY_CLOCK);
      records.advanceAndRecord(twice, 25, DEFAULT_DAY_CLOCK);
      expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    });

    it('inscrit dans le monde seulement après un relevé, repris de la sauvegarde', () => {
      const w = world();
      records.waterHistoryOf(w);
      records.keepWaterHistory(w);
      expect(w.waterHistory).toBeUndefined();
      records.advanceAndRecord(w, WATER_HISTORY_INTERVAL_TICKS, DEFAULT_DAY_CLOCK);
      records.keepWaterHistory(w);
      expect(w.waterHistory).toBeDefined();
      const reread = new TankRecordsController({ isCapture: () => false });
      expect(reread.waterHistoryOf(w).count).toBe(records.waterHistoryOf(w).count);
    });

    it('publié au relevé, recopié seulement s’il change', () => {
      const w = world();
      records.refresh(w);
      const shown = records.waterHistory();
      expect(shown).not.toBeNull();
      records.refresh(w);
      expect(records.waterHistory()).toBe(shown);
    });
  });

  describe('journal (#581)', () => {
    it('vide : rien d’inscrit ; un événement : inscrit et publié', () => {
      const w = world();
      records.keepJournal(w);
      expect(w.journal).toBeUndefined();
      addJournalEntry(records.journalOf(w), waterChangeEntry(0));
      records.keepJournal(w);
      expect(w.journal?.entries).toEqual([{ time: 0, kind: 'changementEau' }]);
      records.refresh(w);
      expect(records.journal().map((line) => line.kind)).toEqual(['changementEau']);
    });

    it('premier regard sur un bac malade : rien d’écrit ; maladie suivante : écrite', () => {
      const w = world();
      records.refresh(w);
      expect(records.journal()).toEqual([]);
      w.entities = [{ ...w.entities[0]!, ich: 1 }, ...w.entities.slice(1)];
      records.refresh(w);
      expect(records.journal().map((line) => line.kind)).toEqual(['maladie']);
    });

    it('observation reportée sur le nouveau monde d’un bac : aucun premier regard de plus', () => {
      const before = world();
      records.refresh(before);
      const after = world();
      after.entities = [{ ...after.entities[0]!, ich: 1 }, ...after.entities.slice(1)];
      records.carryJournalWatches([[before, after]]);
      records.refresh(after);
      expect(records.journal().map((line) => line.kind)).toEqual(['maladie']);
    });
  });

  describe('parcours « Mon premier aquarium » (#512)', () => {
    it('publié hors du monde ; inscrit seulement une fois le bac avancé', () => {
      const w = world();
      records.refreshFirstTankPath(w);
      expect(records.firstTankPath()).not.toBeNull();
      records.keepFirstTankPath(w);
      expect(w.firstTankPath).toBeUndefined();
      advanceInPlace(w, 1, DEFAULT_DAY_CLOCK);
      records.keepFirstTankPath(w);
      expect(w.firstTankPath?.startedAt).toBe(0);
    });

    it('non proposé au récif ni en mode décor', () => {
      records.refreshFirstTankPath(world('recif'));
      expect(records.firstTankPath()).toBeNull();
      const w = world();
      records.refreshFirstTankPath(w);
      w.careMode = 'decor';
      records.refreshFirstTankPath(w);
      expect(records.firstTankPath()).toBeNull();
    });
  });

  it('en capture : rien de publié, monde inchangé', () => {
    capture = true;
    const w = world();
    const before = JSON.stringify(w);
    records.refresh(w);
    records.refreshFirstTankPath(w);
    expect(records.maintenance()).toBeNull();
    expect(records.waterHistory()).toBeNull();
    expect(records.journal()).toEqual([]);
    expect(records.firstTankPath()).toBeNull();
    expect(JSON.stringify(w)).toBe(before);
  });
});
