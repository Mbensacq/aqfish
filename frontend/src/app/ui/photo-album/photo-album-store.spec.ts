import {
  ALBUM_CAPACITY,
  ALBUM_STORAGE_KEY,
  addAlbumPhoto,
  albumCaption,
  albumDate,
  parseAlbum,
  readStoredAlbum,
  removeAlbumPhoto,
  writeStoredAlbum,
  type AlbumPhoto,
  type AlbumStorage,
} from './photo-album-store';

const photo = (id: string, overrides: Partial<AlbumPhoto> = {}): AlbumPhoto => ({
  id,
  dataUrl: 'data:image/png;base64,AAAA',
  time: 0,
  hour: 9,
  environment: 'tropical',
  ...overrides,
});

const memoryStorage = (initial: string | null = null): AlbumStorage & { value: string | null } => ({
  value: initial,
  getItem(key: string) {
    return key === ALBUM_STORAGE_KEY ? this.value : null;
  },
  setItem(key: string, value: string) {
    if (key === ALBUM_STORAGE_KEY) {
      this.value = value;
    }
  },
});

describe('album photo du bac (#860)', () => {
  describe('ajout et plafond', () => {
    it('album vide : la photo devient la seule', () => {
      expect(addAlbumPhoto([], photo('a'))).toEqual({ ok: true, photos: [photo('a')] });
    });

    it('la photo la plus récente passe en tête', () => {
      const result = addAlbumPhoto([photo('a')], photo('b'));
      expect(result.ok && result.photos.map((p) => p.id)).toEqual(['b', 'a']);
    });

    it(`album plein (${ALBUM_CAPACITY} photos) : refus, aucune photo effacée`, () => {
      const full = Array.from({ length: ALBUM_CAPACITY }, (_, i) => photo(`p${i}`));
      expect(addAlbumPhoto(full, photo('x'))).toEqual({ ok: false, error: 'plein' });
      expect(full).toHaveLength(ALBUM_CAPACITY);
    });

    it('la dernière place libre se prend, puis le plafond refuse', () => {
      const eleven = Array.from({ length: ALBUM_CAPACITY - 1 }, (_, i) => photo(`p${i}`));
      const result = addAlbumPhoto(eleven, photo('x'));
      expect(result.ok && result.photos).toHaveLength(ALBUM_CAPACITY);
      expect(result.ok && addAlbumPhoto(result.photos, photo('y')).ok).toBe(false);
    });

    it('plafond nul : tout ajout est refusé', () => {
      expect(addAlbumPhoto([], photo('a'), 0).ok).toBe(false);
    });
  });

  describe('suppression', () => {
    it('retire seulement la photo visée', () => {
      expect(removeAlbumPhoto([photo('a'), photo('b')], 'a')).toEqual([photo('b')]);
    });

    it('identifiant absent ou album vide : inchangé', () => {
      expect(removeAlbumPhoto([photo('a')], 'z')).toEqual([photo('a')]);
      expect(removeAlbumPhoto([], 'a')).toEqual([]);
    });
  });

  describe('légende', () => {
    it('jour du journal et heure de la journée', () => {
      expect(albumDate({ time: 0, hour: 9 })).toBe('Jour 1, 9 h 00');
      expect(albumDate({ time: 1200, hour: 14.5 })).toBe('Jour 2, 14 h 30');
      expect(albumDate({ time: 0, hour: 23.999 })).toBe('Jour 1, 23 h 59');
    });

    it('heure hors de [0, 24) ou non finie : seulement le jour', () => {
      expect(albumDate({ time: 0, hour: 24 })).toBe('Jour 1');
      expect(albumDate({ time: 0, hour: -1 })).toBe('Jour 1');
      expect(albumDate({ time: 0, hour: Number.NaN })).toBe('Jour 1');
    });

    it('nomme l’environnement photographié', () => {
      expect(albumCaption(photo('a', { environment: 'bassin', hour: 0 }))).toBe(
        'Jour 1, 0 h 00 · Bassin',
      );
    });
  });

  describe('relecture', () => {
    it('aller-retour fidèle par le stockage', () => {
      const storage = memoryStorage();
      const photos = [photo('a'), photo('b', { environment: 'recif', time: 2400 })];
      expect(writeStoredAlbum(storage, photos)).toBe(true);
      expect(readStoredAlbum(storage)).toEqual(photos);
    });

    it('texte absent, illisible ou d’une autre forme : album vide', () => {
      expect(parseAlbum(null)).toEqual([]);
      expect(parseAlbum('{pas du json')).toEqual([]);
      expect(parseAlbum('{"id":"a"}')).toEqual([]);
    });

    it('écarte les entrées invalides et les doublons', () => {
      const entries = [
        photo('a'),
        photo('a'),
        photo('b', { dataUrl: 'javascript:alert(1)' }),
        { ...photo('c'), environment: 'lune' },
        photo('d', { time: -1 }),
        photo('', {}),
        null,
        photo('e', { hour: Number.POSITIVE_INFINITY }),
        photo('f'),
      ];
      expect(parseAlbum(JSON.stringify(entries)).map((p) => p.id)).toEqual(['a', 'f']);
    });

    it(`au plus ${ALBUM_CAPACITY} photos relues`, () => {
      const many = Array.from({ length: ALBUM_CAPACITY + 3 }, (_, i) => photo(`p${i}`));
      expect(parseAlbum(JSON.stringify(many))).toHaveLength(ALBUM_CAPACITY);
    });
  });

  describe('stockage indisponible', () => {
    const failing: AlbumStorage = {
      getItem() {
        throw new Error('refusé');
      },
      setItem() {
        throw new Error('quota dépassé');
      },
    };

    it('sans stockage : album vide, écriture refusée', () => {
      expect(readStoredAlbum(null)).toEqual([]);
      expect(writeStoredAlbum(null, [photo('a')])).toBe(false);
    });

    it('stockage qui lève (quota, navigation privée) : jamais d’exception', () => {
      expect(readStoredAlbum(failing)).toEqual([]);
      expect(writeStoredAlbum(failing, [photo('a')])).toBe(false);
    });
  });
});
