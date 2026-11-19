import { SAVE_STORAGE_KEY } from '../../core/save-storage/save-storage';
import { serializeWorld } from '../../sim/save';
import { createWorld } from '../../sim/world';
import { loadWallpaperConfig, readLocalText } from './wallpaper-config';

/** Fenêtre minimale : protocole et `fetch` choisis par le test. */
function fakeWindow(protocol: string, fetch: (url: string) => Promise<Response>): Window {
  return { location: { protocol }, fetch } as unknown as Window;
}

const ok = (text: string) => Promise.resolve(new Response(text, { status: 200 }));

describe('configuration du fond d’écran (#279, #696)', () => {
  const save = serializeWorld(createWorld(9, [{ species: 'neon', count: 1 }]));

  it('readLocalText en http : texte de la réponse', async () => {
    await expect(
      readLocalText(
        fakeWindow('http:', () => ok('{"a":1}')),
        'x.json',
      ),
    ).resolves.toBe('{"a":1}');
  });

  it('readLocalText : `null` pour une réponse en erreur ou un fetch qui échoue', async () => {
    const missing = fakeWindow('http:', () => Promise.resolve(new Response('', { status: 404 })));
    const failing = fakeWindow('http:', () => Promise.reject(new TypeError('réseau')));
    await expect(readLocalText(missing, 'x.json')).resolves.toBeNull();
    await expect(readLocalText(failing, 'x.json')).resolves.toBeNull();
  });

  it('en ligne sans globale : le fichier n’est pas lu, la sauvegarde locale sert', async () => {
    const fetch = vi.fn(() => ok(save));
    const storage = {
      getItem: (key: string) => (key === SAVE_STORAGE_KEY ? save : null),
      setItem: vi.fn(),
    };
    const choice = await loadWallpaperConfig(fakeWindow('https:', fetch), null, storage);
    expect(fetch).not.toHaveBeenCalled();
    expect(choice.source).toBe('sauvegarde');
    expect(choice.value?.world.seed).toBe(9);
  });

  it('paquet : le fichier prime sur la globale et la sauvegarde', async () => {
    const global = { config: null, fps: null };
    const choice = await loadWallpaperConfig(
      fakeWindow('https:', () => ok(save)),
      global,
      null,
    );
    expect(choice.source).toBe('fichier');
  });

  it('aucune source lisible : scène par défaut', async () => {
    const global = { config: null, fps: null };
    const choice = await loadWallpaperConfig(
      fakeWindow('https:', () => ok('illisible')),
      global,
      null,
    );
    expect(choice.value).toBeNull();
  });
});
