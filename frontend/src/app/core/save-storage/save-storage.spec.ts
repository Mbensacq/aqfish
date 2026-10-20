import {
  isQuotaError,
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
