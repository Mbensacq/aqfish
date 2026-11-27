import type { FilterStorage } from '../../core/render-filter/render-filter';
import type { SaveStorage } from '../../core/save-storage/save-storage';

/** `localStorage` s'il est accessible, `null` sinon (l'accès lui-même peut lever). */
export function browserStorage(win: Window): (FilterStorage & SaveStorage) | null {
  try {
    return win.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Stockage de la fenêtre du document (`browserStorage`), `null` sans fenêtre. */
export function documentStorage(doc: Document): (FilterStorage & SaveStorage) | null {
  const win = doc.defaultView;
  return win ? browserStorage(win) : null;
}
