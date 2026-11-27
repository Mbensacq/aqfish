import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

import {
  readStoredMoonOption,
  writeStoredMoonOption,
  type MoonOptionStorage,
} from '../../core/moon-option/moon-option';

/** `localStorage` de la fenêtre, `null` s'il est inaccessible (l'accès lui-même peut lever). */
function windowStorage(win: Window | null): MoonOptionStorage | null {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * État partagé de l'option « Lune » (#856, `core/moon-option`) : réglée dans « Réglages »
 * (section « Affichage »), lue par l'hôte de l'aquarium pour la clarté des nuits. Si le
 * stockage refuse l'écriture, le choix vaut pour la session (le signal le garde).
 */
@Injectable({ providedIn: 'root' })
export class MoonOptionState {
  private readonly storage = windowStorage(inject(DOCUMENT).defaultView);

  /** Vrai si le cycle lunaire fait varier les nuits. */
  readonly enabled = signal(readStoredMoonOption(this.storage));

  /** Règle l'option et la mémorise (repli silencieux si le stockage est indisponible). */
  setEnabled(enabled: boolean): void {
    this.enabled.set(enabled);
    writeStoredMoonOption(this.storage, enabled);
  }
}
