import { createJournal, type Journal } from '../../sim/journal';
import { createWaterHistory, type WaterHistory } from '../../sim/water-history';
import { createWorld, worldCurrentLevel } from '../../sim/world';
import type { MutableWorld } from '../../sim/world-types';
import { WaterSettingsController } from './water-settings-controller';

describe('WaterSettingsController (#696)', () => {
  let world: MutableWorld | null;
  let capture: boolean;
  let calls: string[];
  let settings: WaterSettingsController;
  let journal: Journal;
  let history: WaterHistory;

  beforeEach(() => {
    world = createWorld(5, [{ species: 'neon', count: 2 }], [], [], 'tropical') as MutableWorld;
    capture = false;
    calls = [];
    journal = createJournal();
    history = createWaterHistory();
    settings = new WaterSettingsController({
      world: () => world,
      isCapture: () => capture,
      records: {
        recordMaintenance: (_world, task) => calls.push(`entretien:${task}`),
        waterHistoryOf: () => history,
        journalOf: () => journal,
      },
      currentLevel: () => (world ? worldCurrentLevel(world) : 'coupe'),
      refreshWater: () => calls.push('relevé'),
      refreshCurrent: () => calls.push('courant'),
      saveNow: () => calls.push('sauvegarde'),
      scheduleFrame: () => calls.push('image'),
    });
  });

  it('réglage appliqué : relevé, sauvegarde puis image', () => {
    settings.setHeater(27);
    expect(world!.water.heater).toBe(27);
    expect(calls).toEqual(['relevé', 'sauvegarde', 'image']);
  });

  it('réglage hors bornes : rien d’autre ne suit', () => {
    settings.setLighting(99);
    settings.setLampOn(-1);
    expect(calls).toEqual([]);
  });

  it('distributeur impossible dans un bac sans distributeur : ignoré', () => {
    world = createWorld(5, [], [], [], 'bassin') as MutableWorld;
    settings.setFeeder([8]);
    expect(world.feeder).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('distributeur posé puis rempli : chaque geste enregistré', () => {
    settings.setFeeder([8, 18]);
    expect(world!.feeder).toBeDefined();
    settings.refillFeeder();
    expect(calls).toEqual(['relevé', 'sauvegarde', 'image', 'relevé', 'sauvegarde', 'image']);
  });

  it('changement d’eau : noté à l’entretien et au journal', () => {
    settings.changeWater();
    expect(calls).toEqual(['entretien:waterChange', 'relevé', 'sauvegarde', 'image']);
    expect(journal.entries.length).toBe(1);
  });

  it('tâche faite sans geste : notée à l’entretien', () => {
    settings.markMaintenanceDone('filter');
    expect(calls[0]).toBe('entretien:filter');
  });

  it('courant : force suivante, puis relevé du courant', () => {
    settings.cycleCurrent();
    expect(worldCurrentLevel(world!)).toBe('doux');
    expect(calls).toEqual(['courant', 'sauvegarde', 'image']);
  });

  it('en capture ou avant le démarrage : aucun effet', () => {
    capture = true;
    settings.changeWater();
    settings.setCatappa(2);
    settings.setCurrent('fort');
    world = null;
    capture = false;
    settings.changeWater();
    settings.setHeater(26);
    settings.setCurrent('fort');
    expect(calls).toEqual([]);
  });

  it('force de courant inconnue : ignorée', () => {
    // Valeur venue de l'extérieur (gabarit, clavier) : hors du type, refusée à l'exécution.
    settings.setCurrent('tempête' as never);
    expect(calls).toEqual([]);
  });
});
