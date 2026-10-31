import { describe, expect, it } from 'vitest';
import {
  FREE_CAMERA_STORAGE_KEY,
  readStoredFreeCamera,
  writeStoredFreeCamera,
  type FreeCameraPrefStorage,
} from './free-camera-pref';
import { SAVE_STORAGE_KEY } from '../save-storage/save-storage';

function memoryStorage(): FreeCameraPrefStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const failing: FreeCameraPrefStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('free-camera-pref', () => {
  it('clé distincte de la sauvegarde du monde (schéma inchangé)', () => {
    expect(FREE_CAMERA_STORAGE_KEY).toBe('aqfish.camera-libre');
    expect(FREE_CAMERA_STORAGE_KEY).not.toBe(SAVE_STORAGE_KEY);
  });

  it('aller-retour : libre puis orbite', () => {
    const storage = memoryStorage();
    expect(readStoredFreeCamera(storage)).toBe(false);
    expect(writeStoredFreeCamera(storage, true)).toBe(true);
    expect(storage.data.get(FREE_CAMERA_STORAGE_KEY)).toBe('libre');
    expect(readStoredFreeCamera(storage)).toBe(true);
    expect(writeStoredFreeCamera(storage, false)).toBe(true);
    expect(storage.data.get(FREE_CAMERA_STORAGE_KEY)).toBe('orbite');
    expect(readStoredFreeCamera(storage)).toBe(false);
  });

  it('n’écrit que sa clé', () => {
    const storage = memoryStorage();
    storage.data.set(SAVE_STORAGE_KEY, '{"schema":2}');
    writeStoredFreeCamera(storage, true);
    expect([...storage.data.keys()].sort()).toEqual([FREE_CAMERA_STORAGE_KEY, SAVE_STORAGE_KEY]);
    expect(storage.data.get(SAVE_STORAGE_KEY)).toBe('{"schema":2}');
  });

  it('valeur inconnue : orbite', () => {
    const storage = memoryStorage();
    for (const value of ['', 'true', '1', 'LIBRE', ' libre']) {
      storage.data.set(FREE_CAMERA_STORAGE_KEY, value);
      expect(readStoredFreeCamera(storage)).toBe(false);
    }
  });

  it('stockage absent ou en échec : orbite, écriture refusée sans exception', () => {
    expect(readStoredFreeCamera(null)).toBe(false);
    expect(writeStoredFreeCamera(null, true)).toBe(false);
    expect(readStoredFreeCamera(failing)).toBe(false);
    expect(writeStoredFreeCamera(failing, true)).toBe(false);
  });
});
