import { DOCUMENT, InjectionToken, inject } from '@angular/core';

import {
  EXCLUSIVE_PANELS_MAX_WIDTH,
  exclusivePanelsQuery,
  matchesQuery,
} from '../exclusive-panels/exclusive-panels';

/** Lecture et écriture d'une valeur courte, persistante si possible. */
export interface KeyValueStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

/**
 * Magasin adossé à `storage` (`localStorage`), avec repli en mémoire : si le stockage est
 * absent ou lève une exception (navigation privée, quota, cookies bloqués), la valeur reste
 * conservée pour la session en cours.
 */
export function createFallbackStore(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
): KeyValueStore {
  const memory = new Map<string, string>();
  return {
    read(key) {
      if (memory.has(key)) {
        return memory.get(key) ?? null;
      }
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write(key, value) {
      memory.set(key, value);
      try {
        storage?.setItem(key, value);
      } catch {
        // Stockage indisponible : la valeur en mémoire suffit pour cette session.
      }
    },
  };
}

/** `localStorage` de la fenêtre, `null` s'il est inaccessible (l'accès lui-même peut lever). */
function windowStorage(): Storage | null {
  try {
    return inject(DOCUMENT).defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Magasin de l'état de l'aide-mémoire (remplaçable dans les tests). */
export const COMMANDS_HELP_STORE = new InjectionToken<KeyValueStore>('COMMANDS_HELP_STORE', {
  providedIn: 'root',
  factory: () => createFallbackStore(windowStorage()),
});

/**
 * Largeur d'écran (px) jusqu'à laquelle l'aide-mémoire démarre replié : celle où il ne tient
 * pas à côté de « Réglages » (#136), paysage de téléphone compris (568 × 320). Il masquerait
 * l'essentiel du bac et recouvrirait « Réglages » dès son ouverture.
 */
export const COMMANDS_HELP_NARROW_MAX_WIDTH = EXCLUSIVE_PANELS_MAX_WIDTH;

/**
 * Aide-mémoire déplié par défaut (aucun état mémorisé) : oui, sauf sur un écran étroit
 * (≤ `COMMANDS_HELP_NARROW_MAX_WIDTH` px) ; il y reste accessible par sa pastille.
 * Sans `matchMedia` : déplié.
 */
export const COMMANDS_HELP_DEFAULT_OPEN = new InjectionToken<boolean>(
  'COMMANDS_HELP_DEFAULT_OPEN',
  {
    providedIn: 'root',
    factory: () => {
      const win = inject(DOCUMENT).defaultView;
      if (typeof win?.matchMedia !== 'function') {
        return true;
      }
      return !matchesQuery(win, exclusivePanelsQuery(COMMANDS_HELP_NARROW_MAX_WIDTH));
    },
  },
);
