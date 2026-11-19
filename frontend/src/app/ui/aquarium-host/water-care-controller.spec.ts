import { setCareModeInPlace } from '../../sim/care-mode';
import { createJournal, type Journal } from '../../sim/journal';
import { WATER_TEST_TICKS } from '../../sim/water-test';
import { changeWorldWaterInPlace, createWorld, infectWorldInPlace } from '../../sim/world';
import type { MutableWorld, World } from '../../sim/world-types';
import { WaterCareController } from './water-care-controller';

describe('WaterCareController (#696)', () => {
  let current: MutableWorld | null;
  let capture: boolean;
  let journal: Journal;
  let calls: string[];
  let care: WaterCareController;
  /** Monde neuf, modifiable comme celui que l'hôte affiche. */
  const world = (): MutableWorld =>
    createWorld(42, [{ species: 'neon', count: 2 }], [], [], 'tropical') as MutableWorld;

  beforeEach(() => {
    current = world();
    capture = false;
    journal = createJournal();
    calls = [];
    care = new WaterCareController({
      world: () => current,
      isCapture: () => capture,
      journalOf: (w: World) => {
        void w;
        return journal;
      },
      refreshWater: () => {
        calls.push('refresh');
        if (current) {
          care.refresh(current);
        }
      },
      saveNow: () => calls.push('save'),
      scheduleFrame: () => calls.push('frame'),
    });
  });

  it('geste accepté : message, relevé, enregistrement et image, dans cet ordre', () => {
    care.toggleCarbon();
    expect(current!.water.carbon).toBe(true);
    expect(care.notice()).toMatchObject({ ok: true });
    expect(calls).toEqual(['refresh', 'save', 'frame']);
  });

  it('geste refusé : message seul, mise en garde effacée, rien d’enregistré', () => {
    const before = JSON.stringify(current);
    care.doseBacteriaStarter();
    expect(care.notice()).toMatchObject({ ok: false, warning: null });
    expect(calls).toEqual([]);
    expect(JSON.stringify(current)).toBe(before);
  });

  it('régulateur de pH accepté : la mise en garde suit le message', () => {
    care.dosePhRegulator(-1);
    expect(care.notice()).toMatchObject({ ok: true, warning: expect.any(String) });
  });

  it('traitement : inconnu ignoré ; accepté, inscrit au journal puis relevé', () => {
    care.treat('inconnu' as never);
    expect(care.notice()).toBeNull();
    infectWorldInPlace(current!);
    care.treat('medicament');
    expect(care.notice()).toMatchObject({ ok: true });
    expect(journal.entries).toHaveLength(1);
    expect(calls).toEqual(['refresh', 'save', 'frame']);
    expect(care.treatment()).not.toBeNull();
  });

  it('traitement refusé : ni journal ni relevé', () => {
    infectWorldInPlace(current!);
    care.treat('medicament');
    calls = [];
    care.treat('medicament');
    expect(care.notice()).toMatchObject({ ok: false, warning: null });
    expect(journal.entries).toHaveLength(1);
    expect(calls).toEqual([]);
  });

  it('eau du robinet : relevé et enregistrement, sans image ni message', () => {
    care.toggleUntreatedTap();
    expect(current!.water.untreatedTap).toBe(true);
    expect(calls).toEqual(['refresh', 'save']);
    expect(care.notice()).toBeNull();
  });

  it('conditionneur accepté : gardé « terminé » à la pharmacie', () => {
    care.toggleUntreatedTap();
    changeWorldWaterInPlace(current!);
    care.doseConditioner('thiosulfate');
    expect(care.pharmacy().used).toContain('conditionneur');
    expect(care.pharmacy().active).not.toContain('conditionneur');
  });

  it('test de l’eau : refusé tant qu’il court, relancé une fois prêt', () => {
    care.startWaterTest('ph');
    expect(care.waterTest()).toMatchObject({ kit: 'ph', done: false });
    care.startWaterTest('nitrates');
    expect(care.waterTest()).toMatchObject({ kit: 'ph' });
    current!.tick += WATER_TEST_TICKS;
    care.refresh(current!);
    expect(care.waterTest()).toMatchObject({ kit: 'ph', done: true });
    care.startWaterTest('nitrates');
    expect(care.waterTest()).toMatchObject({ kit: 'nitrates', done: false });
  });

  it('test préparé : déjà prêt au premier relevé', () => {
    care.presetWaterTest(current!, 'durete');
    care.refresh(current!);
    expect(care.waterTest()).toMatchObject({ kit: 'durete', done: true });
  });

  it('message effacé au relevé d’un autre bac, gardé pour le même', () => {
    care.toggleCarbon();
    care.refresh(current!);
    expect(care.notice()).not.toBeNull();
    const other = world();
    care.refresh(other);
    expect(care.notice()).toBeNull();
    expect(care.waterTest()).toBeNull();
  });

  it('avant le démarrage, en capture ou en mode décor : sans effet', () => {
    current = null;
    care.toggleCarbon();
    care.startWaterTest('ph');
    expect(calls).toEqual([]);
    current = world();
    capture = true;
    care.toggleCarbon();
    care.startWaterTest('ph');
    expect(calls).toEqual([]);
    capture = false;
    setCareModeInPlace(current, 'decor');
    const before = JSON.stringify(current);
    care.toggleCarbon();
    care.dosePhRegulator(1);
    care.doseBacteriaStarter();
    care.toggleUntreatedTap();
    care.treat('sel');
    expect(JSON.stringify(current)).toBe(before);
    expect(care.notice()).toBeNull();
    care.startWaterTest('ph');
    expect(calls).toEqual(['refresh']);
  });
});
