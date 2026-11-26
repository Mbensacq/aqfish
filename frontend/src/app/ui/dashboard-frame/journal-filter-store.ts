import { DOCUMENT, InjectionToken, inject } from '@angular/core';

import { JOURNAL_FILTERS, type JournalFilter } from '../../sim/journal';

/**
 * Filtre retenu du journal du bac (#677) : la famille choisie (#655) survit au repli du bilan et
 * au rechargement de la page. Préférence locale, à part de la sauvegarde du monde (comme la
 * catégorie des réglages, #722) : le schéma de la sauvegarde ne change pas. Lecture et écriture
 * tolérantes : stockage absent, qui lève, ou valeur inconnue ramènent à `tout`.
 */

/** Clé du filtre retenu dans le stockage du navigateur. */
export const JOURNAL_FILTER_STORAGE_KEY = 'aqfish.journal-filtre';

/** Sous-ensemble de `Storage` utilisé ici (remplaçable par un double dans les tests). */
export interface JournalFilterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Stockage du filtre : `localStorage` de la fenêtre, `null` s'il est inaccessible (l'accès
 * lui-même peut lever). Remplaçable dans les tests, pour qu'un filtre choisi par un test ne
 * déborde pas sur le suivant.
 */
export const JOURNAL_FILTER_STORAGE = new InjectionToken<JournalFilterStorage | null>(
  'JOURNAL_FILTER_STORAGE',
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

/** Filtre retenu, ou `tout` : aucune valeur, valeur inconnue ou stockage indisponible. */
export function readJournalFilter(storage: JournalFilterStorage | null): JournalFilter {
  if (!storage) {
    return 'tout';
  }
  try {
    const value = storage.getItem(JOURNAL_FILTER_STORAGE_KEY);
    return JOURNAL_FILTERS.find((filter) => filter === value) ?? 'tout';
  } catch {
    return 'tout';
  }
}

/** Retient `filter` ; un stockage absent ou qui refuse l'écriture est ignoré (repli silencieux). */
export function writeJournalFilter(
  storage: JournalFilterStorage | null,
  filter: JournalFilter,
): void {
  try {
    storage?.setItem(JOURNAL_FILTER_STORAGE_KEY, filter);
  } catch {
    // Stockage plein ou refusé : le filtre reste celui de la session.
  }
}
