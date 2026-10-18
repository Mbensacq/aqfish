import {
  DEFAULT_RENDER_FILTER,
  type FilterStorage,
  initialRenderFilter,
  isRenderFilter,
  parseRenderFilter,
  readStoredRenderFilter,
  RENDER_FILTER_STORAGE_KEY,
  toggleRenderFilter,
  writeStoredRenderFilter,
} from './render-filter';

/** Stockage en mémoire, avec option de lever à la lecture ou à l'écriture. */
class MemoryStorage implements FilterStorage {
  readonly values = new Map<string, string>();
  failRead = false;
  failWrite = false;
  getItem(key: string): string | null {
    if (this.failRead) {
      throw new DOMException('Accès refusé', 'SecurityError');
    }
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrite) {
      throw new DOMException('Quota dépassé', 'QuotaExceededError');
    }
    this.values.set(key, value);
  }
}

describe('render-filter', () => {
  it('le pixel art est le mode par défaut', () => {
    expect(DEFAULT_RENDER_FILTER).toBe('pixel');
  });

  describe('parseRenderFilter', () => {
    it('conserve les filtres connus', () => {
      expect(parseRenderFilter('pixel')).toBe('pixel');
      expect(parseRenderFilter('aucun')).toBe('aucun');
    });

    it.each([null, undefined, '', 'PIXEL', 'Aucun', ' aucun', 'none', 0, 1, true, {}, ['aucun']])(
      'toute autre valeur (%j) donne pixel',
      (value) => {
        expect(parseRenderFilter(value)).toBe('pixel');
      },
    );
  });

  it('isRenderFilter est strict', () => {
    expect(isRenderFilter('aucun')).toBe(true);
    expect(isRenderFilter('aucun ')).toBe(false);
    expect(isRenderFilter(null)).toBe(false);
  });

  it('toggleRenderFilter alterne, deux bascules reviennent au départ', () => {
    expect(toggleRenderFilter('pixel')).toBe('aucun');
    expect(toggleRenderFilter('aucun')).toBe('pixel');
    expect(toggleRenderFilter(toggleRenderFilter('pixel'))).toBe('pixel');
  });

  describe('stockage', () => {
    let storage: MemoryStorage;

    beforeEach(() => {
      storage = new MemoryStorage();
    });

    it('écrit puis relit le choix sous la clé aqfish.filtre', () => {
      expect(writeStoredRenderFilter(storage, 'aucun')).toBe(true);
      expect(storage.values.get(RENDER_FILTER_STORAGE_KEY)).toBe('aucun');
      expect(RENDER_FILTER_STORAGE_KEY).toBe('aqfish.filtre');
      expect(readStoredRenderFilter(storage)).toBe('aucun');
    });

    it('aucun choix mémorisé ⇒ null', () => {
      expect(readStoredRenderFilter(storage)).toBeNull();
    });

    it('valeur mémorisée invalide ⇒ null', () => {
      storage.values.set(RENDER_FILTER_STORAGE_KEY, 'flou');
      expect(readStoredRenderFilter(storage)).toBeNull();
    });

    it('stockage absent : lecture null, écriture refusée sans exception', () => {
      expect(readStoredRenderFilter(null)).toBeNull();
      expect(writeStoredRenderFilter(null, 'aucun')).toBe(false);
    });

    it('stockage qui lève : lecture null, écriture refusée sans exception', () => {
      storage.failRead = true;
      storage.failWrite = true;
      expect(readStoredRenderFilter(storage)).toBeNull();
      expect(writeStoredRenderFilter(storage, 'pixel')).toBe(false);
    });
  });

  describe('initialRenderFilter', () => {
    it("l'URL prime sur le choix mémorisé, en capture comme hors capture", () => {
      expect(initialRenderFilter('pixel', 'aucun', false)).toBe('pixel');
      expect(initialRenderFilter('aucun', 'pixel', false)).toBe('aucun');
      expect(initialRenderFilter('aucun', null, true)).toBe('aucun');
    });

    it('sans URL, hors capture : le choix mémorisé, sinon pixel', () => {
      expect(initialRenderFilter(null, 'aucun', false)).toBe('aucun');
      expect(initialRenderFilter(null, null, false)).toBe('pixel');
    });

    it('sans URL, en capture : toujours pixel (séries existantes inchangées)', () => {
      expect(initialRenderFilter(null, 'aucun', true)).toBe('pixel');
      expect(initialRenderFilter(null, null, true)).toBe('pixel');
    });
  });
});
