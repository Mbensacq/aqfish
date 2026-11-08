import { DOCUMENT, Injectable, InjectionToken, inject, signal } from '@angular/core';

import { createFallbackStore, type KeyValueStore } from '../commands-help/commands-help-store';

/** Clé de la préférence d'affichage du parcours, hors de la sauvegarde du bac (ADR 0119). */
export const FIRST_TANK_PATH_STORAGE_KEY = 'aqfish.parcours-premier-bac.v1';

/** Affichage du parcours : déplié, replié (languette), ou masqué (désactivé). */
export type FirstTankPathMode = 'ouvert' | 'replie' | 'masque';

function isMode(value: string | null): value is FirstTankPathMode {
  return value === 'ouvert' || value === 'replie' || value === 'masque';
}

/** `localStorage` de la fenêtre, `null` s'il est inaccessible (l'accès lui-même peut lever). */
function windowStorage(): Storage | null {
  try {
    return inject(DOCUMENT).defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Magasin de la préférence (remplaçable dans les tests), repli en mémoire. */
export const FIRST_TANK_PATH_STORE = new InjectionToken<KeyValueStore>('FIRST_TANK_PATH_STORE', {
  providedIn: 'root',
  factory: () => createFallbackStore(windowStorage()),
});

/**
 * Préférence d'affichage du parcours « Mon premier aquarium » (#512), partagée entre le
 * panneau d'étape et le guide du débutant, d'où l'on reprend un parcours masqué.
 */
@Injectable({ providedIn: 'root' })
export class FirstTankPathPrefs {
  private readonly store = inject(FIRST_TANK_PATH_STORE);
  private readonly saved = this.store.read(FIRST_TANK_PATH_STORAGE_KEY);

  /** Mode d'affichage ; replié par défaut : le parcours ne gêne pas qui ne le cherche pas. */
  readonly mode = signal<FirstTankPathMode>(isMode(this.saved) ? this.saved : 'replie');

  /** Change de mode et le mémorise. */
  setMode(mode: FirstTankPathMode): void {
    this.mode.set(mode);
    this.store.write(FIRST_TANK_PATH_STORAGE_KEY, mode);
  }
}
