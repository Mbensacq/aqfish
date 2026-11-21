import { describe, expect, it } from 'vitest';
import {
  readStoredSettingsCategory,
  SETTINGS_CATEGORY_STORAGE_KEY,
  writeStoredSettingsCategory,
  type SettingsCategoryPrefStorage,
} from './settings-category-pref';
import { SAVE_STORAGE_KEY } from '../save-storage/save-storage';

function memoryStorage(): SettingsCategoryPrefStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const failing: SettingsCategoryPrefStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

const KNOWN = ['bac', 'eau', 'son'] as const;

describe('settings-category-pref', () => {
  it('clé distincte de la sauvegarde du monde (schéma inchangé)', () => {
    expect(SETTINGS_CATEGORY_STORAGE_KEY).toBe('aqfish.reglages-categorie');
    expect(SETTINGS_CATEGORY_STORAGE_KEY).not.toBe(SAVE_STORAGE_KEY);
  });

  it('absente : la catégorie par défaut', () => {
    expect(readStoredSettingsCategory(memoryStorage(), KNOWN, 'bac')).toBe('bac');
  });

  it('aller-retour : chaque catégorie connue est relue telle quelle', () => {
    const storage = memoryStorage();
    for (const id of KNOWN) {
      expect(writeStoredSettingsCategory(storage, id)).toBe(true);
      expect(storage.data.get(SETTINGS_CATEGORY_STORAGE_KEY)).toBe(id);
      expect(readStoredSettingsCategory(storage, KNOWN, 'bac')).toBe(id);
    }
  });

  it('n’écrit que sa clé', () => {
    const storage = memoryStorage();
    storage.data.set(SAVE_STORAGE_KEY, '{"schema":2}');
    writeStoredSettingsCategory(storage, 'eau');
    expect([...storage.data.keys()].sort()).toEqual([
      SETTINGS_CATEGORY_STORAGE_KEY,
      SAVE_STORAGE_KEY,
    ]);
    expect(storage.data.get(SAVE_STORAGE_KEY)).toBe('{"schema":2}');
  });

  it('valeur inconnue (casse, espaces, catégorie retirée) : la catégorie par défaut', () => {
    const storage = memoryStorage();
    for (const value of ['', 'EAU', ' eau', 'eau ', 'affichage', 'null', '0']) {
      storage.data.set(SETTINGS_CATEGORY_STORAGE_KEY, value);
      expect(readStoredSettingsCategory(storage, KNOWN, 'bac'), value).toBe('bac');
    }
  });

  it('liste connue vide : toujours la catégorie par défaut', () => {
    const storage = memoryStorage();
    storage.data.set(SETTINGS_CATEGORY_STORAGE_KEY, 'eau');
    expect(readStoredSettingsCategory(storage, [], 'bac')).toBe('bac');
  });

  it('stockage absent ou en échec : catégorie par défaut, écriture refusée sans exception', () => {
    expect(readStoredSettingsCategory(null, KNOWN, 'son')).toBe('son');
    expect(writeStoredSettingsCategory(null, 'eau')).toBe(false);
    expect(readStoredSettingsCategory(failing, KNOWN, 'son')).toBe('son');
    expect(writeStoredSettingsCategory(failing, 'eau')).toBe(false);
  });
});
