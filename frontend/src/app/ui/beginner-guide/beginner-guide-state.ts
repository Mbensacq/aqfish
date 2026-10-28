import { DOCUMENT, Injectable, InjectionToken, inject, signal } from '@angular/core';

import type { WhyTopicId } from '../../sim/beginner-help';
import { createFallbackStore, type KeyValueStore } from '../commands-help/commands-help-store';

/**
 * Clé de stockage de la première visite (ADR 0072), versionnée : si le guide change au point
 * de devoir être revu, passer à `.v2` le rouvre une fois chez tout le monde.
 */
export const BEGINNER_GUIDE_STORAGE_KEY = 'aqfish.guide-debutant.v1';

/** Valeur stockée une fois le guide montré (toute autre valeur : jamais vu). */
export const BEGINNER_GUIDE_SEEN = 'vu';

/** `localStorage` de la fenêtre, `null` s'il est inaccessible (l'accès lui-même peut lever). */
function windowStorage(): Storage | null {
  try {
    return inject(DOCUMENT).defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Magasin de la première visite (remplaçable dans les tests), repli en mémoire. */
export const BEGINNER_GUIDE_STORE = new InjectionToken<KeyValueStore>('BEGINNER_GUIDE_STORE', {
  providedIn: 'root',
  factory: () => createFallbackStore(windowStorage()),
});

/**
 * État partagé du « Guide du débutant » (issue #240) : ouvert ou non, et explication
 * « Pourquoi ? » à déplier. Tout composant peut l'ouvrir (wiki, alertes) ; le dialogue
 * (`BeginnerGuide`) le lit, et rend le focus à l'élément qui l'a ouvert quand il se ferme.
 */
@Injectable({ providedIn: 'root' })
export class BeginnerGuideState {
  private readonly document = inject(DOCUMENT);
  private readonly store = inject(BEGINNER_GUIDE_STORE);

  /** Dialogue ouvert. */
  readonly open = signal(false);
  /** Explication dépliée à l'ouverture (`null` : aucune, le guide commence aux étapes). */
  readonly topic = signal<WhyTopicId | null>(null);

  /** Élément qui avait le focus à l'ouverture, qui le retrouve à la fermeture. */
  private opener: HTMLElement | null = null;

  /** Ouvre le guide, sur l'explication `topic` si elle est donnée. Le marque vu. */
  show(topic: WhyTopicId | null = null): void {
    const active = this.document.activeElement;
    this.opener = active instanceof HTMLElement && active !== this.document.body ? active : null;
    this.topic.set(topic);
    this.open.set(true);
    this.store.write(BEGINNER_GUIDE_STORAGE_KEY, BEGINNER_GUIDE_SEEN);
  }

  /** Ferme le guide et rend le focus à l'élément qui l'avait ouvert, s'il est encore là. */
  hide(): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.topic.set(null);
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected) {
      opener.focus({ preventScroll: true });
    }
  }

  /** Vrai si le guide n'a jamais été montré dans ce navigateur. */
  firstVisit(): boolean {
    return this.store.read(BEGINNER_GUIDE_STORAGE_KEY) !== BEGINNER_GUIDE_SEEN;
  }

  /** Première visite : ouvre le guide une fois (puis plus jamais, la visite étant mémorisée). */
  showOnFirstVisit(): void {
    if (this.firstVisit()) {
      this.show();
    }
  }
}
