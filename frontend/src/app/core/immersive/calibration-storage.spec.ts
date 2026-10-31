import { describe, expect, it } from 'vitest';
import { SAVE_STORAGE_KEY } from '../save-storage/save-storage';
import {
  CALIBRATION_STORAGE_KEY,
  CalibrationStore,
  type CalibrationStorage,
} from './calibration-storage';
import { DEFAULT_CALIBRATION, calibrationFromCard } from './screen-calibration';

function memoryStorage(): CalibrationStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const failing: CalibrationStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('calibration-storage', () => {
  it('clé à part de la sauvegarde du monde', () => {
    expect(CALIBRATION_STORAGE_KEY).toBe('aqfish.etalonnage-ecran');
    expect(CALIBRATION_STORAGE_KEY).not.toBe(SAVE_STORAGE_KEY);
  });

  it('sans valeur enregistrée : estimation par défaut', () => {
    expect(new CalibrationStore(memoryStorage()).calibration).toEqual(DEFAULT_CALIBRATION);
  });

  it('enregistre puis relit dans une nouvelle session ; n’écrit que sa clé', () => {
    const storage = memoryStorage();
    storage.data.set(SAVE_STORAGE_KEY, '{"schema":2}');
    const cal = calibrationFromCard(480);
    expect(new CalibrationStore(storage).save(cal)).toBe(true);
    expect([...storage.data.keys()].sort()).toEqual([CALIBRATION_STORAGE_KEY, SAVE_STORAGE_KEY]);
    expect(new CalibrationStore(storage).calibration).toEqual(cal);
  });

  it('valeur enregistrée invalide : estimation par défaut', () => {
    const storage = memoryStorage();
    storage.data.set(CALIBRATION_STORAGE_KEY, '{"pxPerMm":-1}');
    expect(new CalibrationStore(storage).calibration).toEqual(DEFAULT_CALIBRATION);
  });

  it('réinitialiser efface la clé et rend l’estimation', () => {
    const storage = memoryStorage();
    const store = new CalibrationStore(storage);
    store.save(calibrationFromCard(480));
    expect(store.reset()).toBe(true);
    expect(storage.data.has(CALIBRATION_STORAGE_KEY)).toBe(false);
    expect(store.calibration).toEqual(DEFAULT_CALIBRATION);
  });

  it('stockage absent ou en échec : repli en mémoire, sans exception', () => {
    for (const storage of [null, failing]) {
      const store = new CalibrationStore(storage);
      expect(store.calibration).toEqual(DEFAULT_CALIBRATION);
      const cal = calibrationFromCard(400);
      expect(store.save(cal)).toBe(false);
      expect(store.calibration).toEqual(cal);
      expect(store.reset()).toBe(false);
      expect(store.calibration).toEqual(DEFAULT_CALIBRATION);
    }
  });
});
