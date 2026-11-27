import {
  MOON_OPTION_STORAGE_KEY,
  readStoredMoonOption,
  writeStoredMoonOption,
  type MoonOptionStorage,
} from './moon-option';

function memoryStorage(): MoonOptionStorage & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

const failing: MoonOptionStorage = {
  getItem: () => {
    throw new Error('refusé');
  },
  setItem: () => {
    throw new Error('refusé');
  },
};

describe('option « Lune » (#856)', () => {
  it('est activée par défaut, sans choix ni stockage', () => {
    expect(readStoredMoonOption(null)).toBe(true);
    expect(readStoredMoonOption(memoryStorage())).toBe(true);
    expect(readStoredMoonOption(failing)).toBe(true);
  });

  it('mémorise le choix et le relit', () => {
    const storage = memoryStorage();
    expect(writeStoredMoonOption(storage, false)).toBe(true);
    expect(storage.items.get(MOON_OPTION_STORAGE_KEY)).toBe('coupee');
    expect(readStoredMoonOption(storage)).toBe(false);
    expect(writeStoredMoonOption(storage, true)).toBe(true);
    expect(readStoredMoonOption(storage)).toBe(true);
  });

  it('ignore une valeur inconnue', () => {
    const storage = memoryStorage();
    storage.items.set(MOON_OPTION_STORAGE_KEY, 'peut-être');
    expect(readStoredMoonOption(storage)).toBe(true);
  });

  it('signale un stockage absent ou qui refuse l’écriture', () => {
    expect(writeStoredMoonOption(null, false)).toBe(false);
    expect(writeStoredMoonOption(failing, false)).toBe(false);
  });
});
