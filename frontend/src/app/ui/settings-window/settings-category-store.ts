import { DOCUMENT, InjectionToken, inject } from '@angular/core';

import type { SettingsCategoryPrefStorage } from '../../core/settings-category-pref/settings-category-pref';

/**
 * Stockage de la catégorie retenue de la fenêtre des réglages (#722) : `localStorage` de la
 * fenêtre, `null` s'il est inaccessible (l'accès lui-même peut lever). Remplaçable dans les
 * tests, pour qu'une catégorie choisie par un test ne déborde pas sur le suivant.
 */
export const SETTINGS_CATEGORY_STORAGE = new InjectionToken<SettingsCategoryPrefStorage | null>(
  'SETTINGS_CATEGORY_STORAGE',
  {
    providedIn: 'root',
    factory: () => {
      try {
        return inject(DOCUMENT).defaultView?.localStorage ?? null;
      } catch {
        return null;
      }
    },
  },
);
