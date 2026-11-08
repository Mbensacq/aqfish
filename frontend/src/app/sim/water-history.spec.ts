import { SIM_DT } from './constants';
import { freshWater, type WaterState } from './water';
import { phBands } from './water-ph';
import {
  WATER_HISTORY_CAPACITY,
  WATER_HISTORY_INTERVAL_TICKS as INTERVAL,
  WATER_HISTORY_VERSION,
  copySavedWaterHistory,
  createWaterHistory,
  markWaterChange,
  readWaterHistory,
  recordWaterHistory,
  restoreWaterHistory,
  savedWaterHistory,
  ticksToNextWaterSample,
  toleratedRange,
  waterHistoryView,
  type WaterHistory,
} from './water-history';
import { advanceInPlace, createDefaultWorld, type MutableWorld } from './world';

const water = (nitrate: number): WaterState => ({ ...freshWater('tropical'), nitrate });

function fill(history: WaterHistory, count: number, from = 0): void {
  for (let i = 0; i < count; i++) {
    recordWaterHistory(history, water(i + 1), (from + i) * INTERVAL);
  }
}

describe('historique de l’eau (#511)', () => {
  it('couvre 24 h de jeu', () => {
    expect((WATER_HISTORY_CAPACITY * INTERVAL * SIM_DT) / 1200).toBeCloseTo(1);
  });

  it('bac vide : aucun relevé, vue et sauvegarde vides', () => {
    const history = createWaterHistory();
    const view = waterHistoryView(history);
    expect(view.count).toBe(0);
    expect(view.series.nitrate).toEqual([]);
    expect(view.marks).toEqual([]);
    expect(savedWaterHistory(history).samples).toEqual([]);
  });

  it('un seul relevé par tranche, au pas d’ouverture', () => {
    const history = createWaterHistory();
    expect(recordWaterHistory(history, water(1), 0)).toBe(true);
    expect(recordWaterHistory(history, water(2), INTERVAL - 1)).toBe(false);
    expect(recordWaterHistory(history, water(2), 0)).toBe(false);
    expect(recordWaterHistory(history, water(3), INTERVAL)).toBe(true);
    expect(waterHistoryView(history).series.nitrate).toEqual([1, 3]);
  });

  it('tampon plein : garde les plus récents, dans l’ordre', () => {
    const history = createWaterHistory();
    fill(history, WATER_HISTORY_CAPACITY + 10);
    const series = waterHistoryView(history).series.nitrate;
    expect(series).toHaveLength(WATER_HISTORY_CAPACITY);
    expect(series[0]).toBe(11);
    expect(series.at(-1)).toBe(WATER_HISTORY_CAPACITY + 10);
    expect(history.values).toHaveLength(WATER_HISTORY_CAPACITY * 5);
  });

  it('valeurs non finies : gardées comme des trous, jamais sauvegardées en nombre', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const history = createWaterHistory();
      recordWaterHistory(history, water(bad), 0);
      expect(Number.isFinite(waterHistoryView(history).series.nitrate[0])).toBe(false);
      expect(savedWaterHistory(history).samples[3]).toBeNull();
    }
  });

  it('pas invalide ou qui recule : rien n’est relevé', () => {
    const history = createWaterHistory();
    for (const tick of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(recordWaterHistory(history, water(1), tick)).toBe(false);
    }
    fill(history, 3);
    expect(recordWaterHistory(history, water(9), 0)).toBe(false);
    expect(history.count).toBe(3);
  });

  it('tranches sautées : des trous, bornés à la taille du tampon', () => {
    const history = createWaterHistory();
    recordWaterHistory(history, water(1), 0);
    recordWaterHistory(history, water(2), 3 * INTERVAL);
    const series = waterHistoryView(history).series.nitrate;
    expect(series).toHaveLength(4);
    expect(series.slice(1, 3).every(Number.isNaN)).toBe(true);
    recordWaterHistory(history, water(3), 1000 * INTERVAL);
    const after = waterHistoryView(history).series.nitrate;
    expect(after).toHaveLength(WATER_HISTORY_CAPACITY);
    expect(after.slice(0, -1).every(Number.isNaN)).toBe(true);
    expect(after.at(-1)).toBe(3);
  });

  it('prochain relevé : à la frontière de tranche', () => {
    expect(ticksToNextWaterSample(0)).toBe(INTERVAL);
    expect(ticksToNextWaterSample(1)).toBe(INTERVAL - 1);
    expect(ticksToNextWaterSample(INTERVAL - 1)).toBe(1);
  });

  it('changement d’eau : marqué sur le relevé courant, ou sur un relevé créé', () => {
    const history = createWaterHistory();
    markWaterChange(history, water(4), 100);
    expect(history.count).toBe(1);
    expect(waterHistoryView(history).marks).toEqual([0]);
    recordWaterHistory(history, water(5), INTERVAL);
    markWaterChange(history, water(6), INTERVAL + 5);
    const view = waterHistoryView(history);
    expect(view.marks).toEqual([0, 1]);
    expect(view.series.nitrate).toEqual([4, 5]);
  });

  it('changement d’eau à un pas invalide ou passé : aucune marque', () => {
    const history = createWaterHistory();
    fill(history, 3);
    markWaterChange(history, water(1), Number.NaN);
    markWaterChange(history, water(1), 0);
    expect(waterHistoryView(history).marks).toEqual([]);
  });

  it('une marque sortie du tampon disparaît, sa place réutilisée est vierge', () => {
    const history = createWaterHistory();
    markWaterChange(history, water(1), 0);
    fill(history, WATER_HISTORY_CAPACITY, 1);
    expect(waterHistoryView(history).marks).toEqual([]);
  });

  it('la version change à chaque écriture, pas sans écriture', () => {
    const history = createWaterHistory();
    recordWaterHistory(history, water(1), 0);
    const version = history.version;
    recordWaterHistory(history, water(2), 1);
    expect(history.version).toBe(version);
    markWaterChange(history, water(2), 1);
    expect(history.version).toBe(version + 1);
  });

  it('même graine, même historique, quel que soit le découpage des pas', () => {
    const run = (chunk: number, seed = 42) => {
      const world: MutableWorld = createDefaultWorld(seed);
      const history = createWaterHistory();
      let left = INTERVAL * 4 + 10;
      while (left > 0) {
        const n = Math.min(left, chunk, ticksToNextWaterSample(world.tick));
        advanceInPlace(world, n);
        left -= n;
        recordWaterHistory(history, world.water, world.tick);
      }
      return savedWaterHistory(history);
    };
    expect(run(7)).toEqual(run(211));
    expect(run(7).samples).toHaveLength(20);
  }, 30_000);
});

describe('historique de l’eau : sauvegarde (#511)', () => {
  const full = (): WaterHistory => {
    const history = createWaterHistory();
    fill(history, WATER_HISTORY_CAPACITY + 7);
    markWaterChange(history, water(0), (WATER_HISTORY_CAPACITY + 6) * INTERVAL);
    return history;
  };

  it('aller-retour après rotation du tampon', () => {
    const saved = savedWaterHistory(full());
    const restored = restoreWaterHistory(saved);
    expect(savedWaterHistory(restored)).toEqual(saved);
    expect(readWaterHistory(JSON.parse(JSON.stringify(saved)), [])).toEqual(saved);
  });

  it('reprend les relevés à la suite', () => {
    const restored = restoreWaterHistory(savedWaterHistory(full()));
    const next = (WATER_HISTORY_CAPACITY + 7) * INTERVAL;
    expect(recordWaterHistory(restored, water(500), next)).toBe(true);
    expect(waterHistoryView(restored).series.nitrate.at(-1)).toBe(500);
    expect(waterHistoryView(restored).count).toBe(WATER_HISTORY_CAPACITY);
  });

  it('historique vide : relu et repris', () => {
    const saved = savedWaterHistory(createWaterHistory());
    const read = readWaterHistory(saved, []);
    expect(read).toEqual(saved);
    expect(restoreWaterHistory(read!).count).toBe(0);
  });

  it('une copie ne partage rien', () => {
    const saved = savedWaterHistory(full());
    const copy = copySavedWaterHistory(saved);
    expect(copy).toEqual(saved);
    expect(copy.samples).not.toBe(saved.samples);
    expect(copy.marks).not.toBe(saved.marks);
  });

  const valid = {
    version: WATER_HISTORY_VERSION,
    lastSlot: 0,
    samples: [1, 2, 3, 4, 5],
    marks: [],
  };
  it.each([
    ['pas un objet', 3, 'objet'],
    ['nul', null, 'objet'],
    ['liste', [], 'objet'],
    ['version inconnue', { ...valid, version: 2 }, 'version'],
    ['relevé incomplet', { ...valid, samples: [1, 2] }, 'samples'],
    ['samples absent', { ...valid, samples: undefined }, 'samples'],
    ['valeur texte', { ...valid, samples: [1, 2, 3, 4, '5'] }, 'samples'],
    ['valeur démesurée', { ...valid, samples: [1, 2, 3, 4, 1e9] }, 'samples'],
    [
      'trop de relevés',
      { ...valid, samples: new Array((WATER_HISTORY_CAPACITY + 1) * 5).fill(0) },
      'samples',
    ],
    ['tranche non entière', { ...valid, lastSlot: 0.5 }, 'lastSlot'],
    ['tranche négative', { ...valid, lastSlot: -1 }, 'lastSlot'],
    ['marque hors liste', { ...valid, marks: [1] }, 'marks'],
    ['marques absentes', { ...valid, marks: undefined }, 'marks'],
  ])('refuse : %s', (_name, value, expected) => {
    const problems: string[] = [];
    expect(readWaterHistory(value, problems)).toBeNull();
    expect(problems.join()).toContain(expected);
  });
});

describe('plage tolérée d’une jauge (#511)', () => {
  const bands = phBands(['neon']);
  it('température : autour de la cible de l’environnement', () => {
    const range = toleratedRange('temperature', 'tropical', bands)!;
    expect(range.max - range.min).toBe(12);
    expect((range.max + range.min) / 2).toBe(freshWater('tropical').temperature);
  });
  it('composé : de zéro au seuil critique', () => {
    expect(toleratedRange('nitrate', 'tropical', bands)).toEqual({ min: 0, max: 40 });
  });
  it('pH : plage commune des espèces, ou aucune', () => {
    expect(toleratedRange('ph', 'tropical', bands)).toEqual(bands.tolerated);
    expect(toleratedRange('ph', 'tropical', { tolerated: null, ideal: null })).toBeNull();
  });
});
