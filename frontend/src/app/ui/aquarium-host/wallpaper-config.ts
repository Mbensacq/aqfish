import { readStoredSave, type SaveStorage } from '../../core/save-storage/save-storage';
import {
  chooseWallpaperConfig,
  shouldReadWallpaperFile,
  WALLPAPER_CONFIG_FILE,
  wallpaperGlobalText,
  type WallpaperGlobal,
  type WallpaperSource,
} from '../../core/wallpaper/wallpaper';
import { parseSaveWorlds } from '../../sim/room-save';
import type { RestoredSave } from './save-share-controller';

/**
 * Texte du fichier `url` (relatif à la page), `null` s'il est absent ou illisible ; ne lève
 * jamais. En `file://`, `fetch` est refusé par Chromium : `XMLHttpRequest`, que l'hôte peut
 * autoriser (`--allow-file-access-from-files`) ; sinon `fetch` (#279, ADR 0079).
 */
export async function readLocalText(win: Window, url: string): Promise<string | null> {
  if (win.location.protocol === 'file:') {
    return new Promise((resolve) => {
      try {
        const XHR = (win as Window & { XMLHttpRequest: typeof XMLHttpRequest }).XMLHttpRequest;
        const request = new XHR();
        request.open('GET', url);
        request.overrideMimeType('application/json');
        // En `file://`, une lecture réussie répond 0 (pas de statut HTTP).
        request.onload = () =>
          resolve(request.status === 0 || request.status === 200 ? request.responseText : null);
        request.onerror = () => resolve(null);
        request.send();
      } catch {
        resolve(null);
      }
    });
  }
  try {
    const response = await win.fetch(url, { cache: 'no-store' });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

/**
 * Configuration du fond d'écran (#279, ADR 0079) : `aqfish-fond.json` à côté de la page,
 * sinon la configuration du script `aqfish-fond.js` (si `fetch` est refusé, en `file://`),
 * sinon la sauvegarde locale, sinon la scène par défaut. Une source illisible est ignorée.
 * Le fichier n'est lu que dans le paquet ou en `file://` (`shouldReadWallpaperFile`, #332).
 * Sorti de l'hôte au lot 10 de l'assainissement (#696).
 */
export async function loadWallpaperConfig(
  win: Window,
  global: WallpaperGlobal | null,
  storage: SaveStorage | null,
): Promise<{ readonly source: WallpaperSource; readonly value: RestoredSave | null }> {
  const fileText = shouldReadWallpaperFile(win.location.protocol, global)
    ? await readLocalText(win, WALLPAPER_CONFIG_FILE)
    : null;
  const scriptText = wallpaperGlobalText(global);
  return chooseWallpaperConfig<RestoredSave>(
    [
      { source: 'fichier', text: fileText },
      { source: 'script', text: scriptText },
      { source: 'sauvegarde', text: readStoredSave(storage) },
    ],
    (text) => {
      const result = parseSaveWorlds(text);
      return result.ok ? { ok: true, value: result } : result;
    },
  );
}
