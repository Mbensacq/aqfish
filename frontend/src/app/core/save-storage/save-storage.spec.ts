import {
  isQuotaError,
  LEGACY_SAVE_STORAGE_KEY,
  readStoredSave,
  SAVE_STORAGE_KEY,
  writeStoredSave,
  type SaveStorage,
} from './save-storage';

/** Stockage en mémoire, avec un quota en caractères. */
function memoryStorage(
  quota = Number.POSITIVE_INFINITY,
): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (value.length > quota) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      data.set(key, value);
    },
  };
}

/** Stockage dont chaque accès lève (navigation privée, cookies bloqués). */
const throwingStorage: SaveStorage = {
  getItem: () => {
    throw new DOMException('refusé', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('refusé', 'SecurityError');
  },
};

describe('readStoredSave', () => {
  it('renvoie le texte mémorisé sous la clé de la sauvegarde', () => {
    const storage = memoryStorage();
    storage.data.set(SAVE_STORAGE_KEY, '{"a":1}');
    expect(readStoredSave(storage)).toBe('{"a":1}');
  });

  it('renvoie null sans sauvegarde, sans stockage ou si le stockage lève', () => {
    expect(readStoredSave(memoryStorage())).toBeNull();
    expect(readStoredSave(null)).toBeNull();
    expect(readStoredSave(throwingStorage)).toBeNull();
  });
});

describe('writeStoredSave', () => {
  it('écrit le texte et renvoie active', () => {
    const storage = memoryStorage();
    expect(writeStoredSave(storage, 'abc')).toBe('active');
    expect(storage.data.get(SAVE_STORAGE_KEY)).toBe('abc');
  });

  it('renvoie plein quand le quota est dépassé, sans lever', () => {
    const storage = memoryStorage(2);
    expect(writeStoredSave(storage, 'abc')).toBe('plein');
    expect(storage.data.size).toBe(0);
  });

  it('renvoie indisponible sans stockage ou si l’accès est refusé', () => {
    expect(writeStoredSave(null, 'abc')).toBe('indisponible');
    expect(writeStoredSave(throwingStorage, 'abc')).toBe('indisponible');
  });
});

describe('writeStoredSave : copie de la sauvegarde au schéma 1 (#264, ADR 0069)', () => {
  const legacy = '{"format":"aqfish","schema":1,"seed":42}';
  const room = '{"format":"aqfish","schema":2,"seed":42}';

  it('copie une seule fois l’ancienne sauvegarde avant la première écriture par-dessus', () => {
    const storage = memoryStorage();
    storage.data.set(SAVE_STORAGE_KEY, legacy);
    expect(writeStoredSave(storage, room)).toBe('active');
    expect(storage.data.get(LEGACY_SAVE_STORAGE_KEY)).toBe(legacy);
    expect(storage.data.get(SAVE_STORAGE_KEY)).toBe(room);
    // Une autre sauvegarde au schéma 1 écrite ensuite ne remplace pas la copie.
    storage.data.set(SAVE_STORAGE_KEY, legacy.replace('42', '7'));
    writeStoredSave(storage, room);
    expect(storage.data.get(LEGACY_SAVE_STORAGE_KEY)).toBe(legacy);
  });

  it('ne copie ni le schéma 2, ni un texte étranger, ni l’absence de sauvegarde', () => {
    for (const before of [room, 'pas du json', '{"schema":1,"format":"aqfish"}', null]) {
      const storage = memoryStorage();
      if (before !== null) {
        storage.data.set(SAVE_STORAGE_KEY, before);
      }
      writeStoredSave(storage, room);
      expect(storage.data.has(LEGACY_SAVE_STORAGE_KEY)).toBe(false);
    }
  });

  it('quota dépassé pendant la copie : plein, sauvegarde précédente intacte', () => {
    const storage = memoryStorage(legacy.length - 1);
    storage.data.set(SAVE_STORAGE_KEY, legacy);
    expect(writeStoredSave(storage, room)).toBe('plein');
    expect(storage.data.get(SAVE_STORAGE_KEY)).toBe(legacy);
  });
});

describe('isQuotaError', () => {
  it.each([
    [new DOMException('x', 'QuotaExceededError'), true],
    [{ name: 'NS_ERROR_DOM_QUOTA_REACHED' }, true],
    [{ code: 22 }, true],
    [{ code: 1014 }, true],
    [new DOMException('x', 'SecurityError'), false],
    [new Error('x'), false],
    [null, false],
    ['QuotaExceededError', false],
  ])('%s → %s', (error, expected) => {
    expect(isQuotaError(error)).toBe(expected);
  });
});
