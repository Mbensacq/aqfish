import { SAVE_STORAGE_KEY, type SaveStorage } from '../../core/save-storage/save-storage';
import { parseSaveWorlds, serializeRoom } from '../../sim/room-save';
import { createRoom } from '../../sim/room-state';
import { DEFAULT_SAVE_SETTINGS } from '../../sim/save';
import { createDefaultWorld } from '../../sim/world';
import type { World } from '../../sim/world-types';
import {
  AUTOSAVE_INTERVAL_MS,
  SaveShareController,
  shareBase,
  type ImportedSave,
} from './save-share-controller';

/** Stockage en mémoire, qui peut refuser l'écriture. */
class MemoryStorage implements SaveStorage {
  readonly data = new Map<string, string>();
  refuse = false;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.refuse) {
      throw new DOMException('quota', 'QuotaExceededError');
    }
    this.data.set(key, value);
  }
}

describe('SaveShareController (#696)', () => {
  let storage: MemoryStorage | null;
  let world: World | null;
  let capture: boolean;
  let loaded: ImportedSave[];
  let published: (string | null)[];
  let autosaves: number;
  let cleanups: (() => void)[];
  let saves: SaveShareController;

  const text = (w: World) =>
    serializeRoom(createRoom(1, [w.environment]), 0, DEFAULT_SAVE_SETTINGS);

  function create(): void {
    saves = new SaveShareController({
      document,
      storage,
      world: () => world,
      hasView: () => true,
      isCapture: () => capture,
      isStopped: () => false,
      settings: () => DEFAULT_SAVE_SETTINGS,
      saveText: (w) => text(w),
      beforeExport: () => undefined,
      beforeAutosave: () => {
        autosaves += 1;
      },
      load: (result) => loaded.push(result),
      tankCount: () => 1,
      publishSave: (status) => published.push(status),
      onCleanup: (cleanup) => cleanups.push(cleanup),
    });
  }

  beforeEach(() => {
    storage = new MemoryStorage();
    world = createDefaultWorld(3);
    capture = false;
    loaded = [];
    published = [];
    autosaves = 0;
    cleanups = [];
    create();
  });

  afterEach(() => {
    cleanups.forEach((cleanup) => cleanup());
    vi.restoreAllMocks();
  });

  it('saveNow : écrit le texte de l’hôte et publie l’état', () => {
    expect(saves.saveNow()).toBe('active');
    expect(storage!.data.has(SAVE_STORAGE_KEY)).toBe(true);
    expect(saves.status()).toBe('active');
    expect(published).toEqual(['active']);
  });

  it('saveNow : rien avant le démarrage ni en capture', () => {
    world = null;
    expect(saves.saveNow()).toBeNull();
    world = createDefaultWorld(3);
    capture = true;
    expect(saves.saveNow()).toBeNull();
    expect(published).toEqual([]);
  });

  it('stockage plein ou absent : signalé, jamais d’exception', () => {
    storage!.refuse = true;
    expect(saves.saveNow()).toBe('plein');
    storage = null;
    create();
    expect(saves.saveNow()).toBe('indisponible');
  });

  it('readStored : sauvegarde relue, absente (null) ou illisible (null et message)', () => {
    expect(saves.readStored()).toBeNull();
    storage!.data.set(SAVE_STORAGE_KEY, text(createDefaultWorld(5, 'bassin')));
    expect(saves.readStored()?.world.environment).toBe('bassin');
    storage!.data.set(SAVE_STORAGE_KEY, 'pas du json');
    expect(saves.readStored()).toBeNull();
    expect(saves.message()?.text).toMatch(/^Sauvegarde précédente illisible, aquarium neuf/);
  });

  it('importSave : charge par l’hôte puis enregistre ; refus lisible sinon', () => {
    expect(saves.importSave('{}')).toBe(false);
    expect(saves.message()?.text).toMatch(/^Import refusé : /);
    expect(saves.importSave(text(createDefaultWorld(8, 'bassin')))).toBe(true);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.world.environment).toBe('bassin');
    expect(saves.message()).toEqual({ kind: 'info', text: 'Aquarium importé.' });
    const saved = parseSaveWorlds(storage!.data.get(SAVE_STORAGE_KEY)!);
    expect(saved.ok).toBe(true);
    saves.rejectImport('fichier trop volumineux');
    expect(saves.message()?.text).toBe('Import refusé : fichier trop volumineux.');
  });

  it('activate : sauvegarde à intervalle et à pagehide, désabonnée au nettoyage', () => {
    const interval = vi.spyOn(window, 'setInterval');
    saves.activate(window);
    expect(saves.status()).toBe('active');
    const call = interval.mock.calls.find(([, delay]) => delay === AUTOSAVE_INTERVAL_MS);
    (call![0] as () => void)();
    window.dispatchEvent(new Event('pagehide'));
    expect(autosaves).toBe(2);
    cleanups.splice(0).forEach((cleanup) => cleanup());
    window.dispatchEvent(new Event('pagehide'));
    expect(autosaves).toBe(2);
  });

  it('shareBase : sans requête ni fragment', () => {
    expect(shareBase('https://a.test/x/?seed=1#partage=z.A')).toBe('https://a.test/x/');
  });
});
