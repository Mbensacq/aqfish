import { DOCUMENT, DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import {
  REDUCED_MOTION_QUERY,
  readStoredReducedMotion,
  resolveReducedMotion,
  systemPrefersReducedMotion,
  writeStoredReducedMotion,
  type ReducedMotionStorage,
} from '../../core/reduced-motion/reduced-motion';

/** `localStorage` de la fenêtre, `null` s'il est inaccessible (l'accès lui-même peut lever). */
function windowStorage(win: Window | null): ReducedMotionStorage | null {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * État partagé de l'option « Réduire les mouvements » (#406, `core/reduced-motion`) : lu par
 * l'hôte de l'aquarium et le mode immersif, réglé dans « Réglages ». La préférence système
 * est suivie en direct (`change` de la requête média) ; le choix fait dans les réglages est
 * mémorisé et l'emporte. Si le stockage refuse l'écriture, le choix vaut pour la session
 * (repli en mémoire : le signal le garde).
 */
@Injectable({ providedIn: 'root' })
export class ReducedMotionState {
  private readonly win = inject(DOCUMENT).defaultView;
  private readonly storage = windowStorage(this.win);

  /** Préférence du système (`prefers-reduced-motion: reduce`). */
  readonly system = signal(systemPrefersReducedMotion(this.win));
  /** Choix fait dans les réglages, `null` tant qu'aucun n'a été fait. */
  readonly choice = signal(readStoredReducedMotion(this.storage));
  /** État effectif : le choix s'il existe, sinon la préférence système. */
  readonly reduced = computed(() => resolveReducedMotion(this.choice(), this.system()));

  constructor() {
    this.followSystem();
  }

  /** Règle l'option et la mémorise (repli silencieux si le stockage est indisponible). */
  setReduced(reduced: boolean): void {
    this.choice.set(reduced);
    writeStoredReducedMotion(this.storage, reduced);
  }

  /** Suit les changements de la préférence système, si le navigateur sait les signaler. */
  private followSystem(): void {
    let query: MediaQueryList | null = null;
    try {
      query =
        typeof this.win?.matchMedia === 'function'
          ? this.win.matchMedia(REDUCED_MOTION_QUERY)
          : null;
    } catch {
      query = null;
    }
    if (!query || typeof query.addEventListener !== 'function') {
      return;
    }
    const listener = (event: MediaQueryListEvent): void => this.system.set(event.matches);
    query.addEventListener('change', listener);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', listener));
  }
}
