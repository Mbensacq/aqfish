import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

import { keyCommand } from '../../core/commands/commands';
import { isTypingContext } from '../../core/keyboard/keyboard';

/** Durée de l'indication « I ou Échap pour revenir », en millisecondes (#725). */
export const HINT_DURATION_MS = 3000;
/** Immobilité du pointeur après laquelle le curseur disparaît, en millisecondes (#725). */
export const CURSOR_IDLE_MS = 2000;
/** Durée d'un appui long qui fait revenir l'interface, en millisecondes (#725). */
export const LONG_PRESS_MS = 600;
/** Déplacement au-delà duquel un appui n'est plus « long » mais un glisser, en pixels CSS. */
export const LONG_PRESS_SLOP_PX = 10;

/** Touche du raccourci « Masquer l'interface » (`I`), déclarée dans `core/commands`. */
const HIDE_KEY = keyCommand('masquer-interface').key;

/** Appui en cours, candidat à l'appui long. */
interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * « Masquer l'interface » (#725, `docs/INTERFACE.md` section 3, ADR 0166), à la place du
 * mode immersif : tout disparaît sauf le bac, la caméra et la simulation continuent. L'état
 * est partagé entre l'interrupteur de la section « Affichage » et la racine de l'application,
 * qui masque les panneaux et relaie le clavier et le pointeur.
 *
 * - `I` masque ou réaffiche ; `Échap` ou un appui long (sans glisser) réaffiche.
 * - Au masquage, l'indication « I ou Échap pour revenir » reste `HINT_DURATION_MS`.
 * - Masquée, le curseur disparaît après `CURSOR_IDLE_MS` d'immobilité et revient au
 *   moindre mouvement.
 *
 * Non enregistré : chaque visite commence avec l'interface.
 */
@Injectable({ providedIn: 'root' })
export class HiddenInterfaceState {
  private readonly win = inject(DOCUMENT).defaultView;

  /** Vrai quand l'interface est masquée. */
  readonly hidden = signal(false);
  /** Vrai le temps de l'indication « I ou Échap pour revenir ». */
  readonly hintShown = signal(false);
  /** Vrai quand le curseur est caché (interface masquée et pointeur immobile). */
  readonly cursorHidden = signal(false);

  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  private press: Press | null = null;

  /** Masque (`true`) ou réaffiche (`false`) l'interface. */
  setHidden(hidden: boolean): void {
    if (hidden === this.hidden()) {
      return;
    }
    if (hidden) {
      this.hide();
      return;
    }
    this.show();
  }

  /** Bascule entre interface masquée et affichée (touche `I`). */
  toggle(): void {
    this.setHidden(!this.hidden());
  }

  /**
   * Clavier (#725) : `I` bascule, `Échap` réaffiche si l'interface est masquée. Renvoie vrai
   * si la touche a été prise (l'appelant empêche alors son effet par défaut). Ignoré dans un
   * champ de saisie ou si un autre gestionnaire a déjà pris la touche.
   */
  onKeydown(event: KeyboardEvent): boolean {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    if (this.hidden() && event.key === 'Escape') {
      this.show();
      return true;
    }
    if (event.key.toLowerCase() !== HIDE_KEY || isTypingContext(event)) {
      return false;
    }
    this.toggle();
    return true;
  }

  /** Pointeur déplacé : le curseur revient ; un glisser annule l'appui long. */
  onPointerMove(event: PointerEvent): void {
    const press = this.press;
    if (press && press.pointerId === event.pointerId) {
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (moved > LONG_PRESS_SLOP_PX) {
        this.cancelPress();
      }
    }
    if (this.hidden()) {
      this.wakeCursor();
    }
  }

  /** Appui (doigt, stylet ou souris) : candidat à l'appui long quand l'interface est masquée. */
  onPointerDown(event: PointerEvent): void {
    this.cancelPress();
    if (!this.hidden() || !event.isPrimary || !this.win) {
      return;
    }
    this.wakeCursor();
    const timer = this.win.setTimeout(() => {
      this.press = null;
      this.show();
    }, LONG_PRESS_MS);
    this.press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, timer };
  }

  /** Appui relâché ou interrompu : ce n'était pas un appui long. */
  onPointerEnd(): void {
    this.cancelPress();
  }

  private hide(): void {
    this.hidden.set(true);
    this.hintShown.set(true);
    this.clearHint();
    this.hintTimer =
      this.win?.setTimeout(() => {
        this.hintTimer = null;
        this.hintShown.set(false);
      }, HINT_DURATION_MS) ?? null;
    this.wakeCursor();
  }

  private show(): void {
    this.hidden.set(false);
    this.hintShown.set(false);
    this.cursorHidden.set(false);
    this.clearHint();
    this.clearCursor();
    this.cancelPress();
  }

  /** Curseur visible, à cacher de nouveau après `CURSOR_IDLE_MS` d'immobilité. */
  private wakeCursor(): void {
    this.cursorHidden.set(false);
    this.clearCursor();
    this.cursorTimer =
      this.win?.setTimeout(() => {
        this.cursorTimer = null;
        this.cursorHidden.set(this.hidden());
      }, CURSOR_IDLE_MS) ?? null;
  }

  private clearHint(): void {
    if (this.hintTimer !== null) {
      this.win?.clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
  }

  private clearCursor(): void {
    if (this.cursorTimer !== null) {
      this.win?.clearTimeout(this.cursorTimer);
      this.cursorTimer = null;
    }
  }

  private cancelPress(): void {
    if (this.press) {
      this.win?.clearTimeout(this.press.timer);
      this.press = null;
    }
  }
}

/**
 * Branche `state` sur le clavier et le pointeur de `doc` (#725) et renvoie la fonction qui
 * débranche. Écoute par `addEventListener`, sans liaison Angular : un mouvement du pointeur
 * ne déclenche pas de détection de changements (les signaux ne notifient que si leur valeur
 * change). Une touche prise par l'état voit son effet par défaut empêché.
 */
export function listenToHiddenInterface(doc: Document, state: HiddenInterfaceState): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (state.onKeydown(event)) {
      event.preventDefault();
    }
  };
  const onMove = (event: PointerEvent) => state.onPointerMove(event);
  const onDown = (event: PointerEvent) => state.onPointerDown(event);
  const onEnd = () => state.onPointerEnd();
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('pointermove', onMove, { passive: true });
  doc.addEventListener('pointerdown', onDown, { passive: true });
  doc.addEventListener('pointerup', onEnd, { passive: true });
  doc.addEventListener('pointercancel', onEnd, { passive: true });
  return () => {
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerdown', onDown);
    doc.removeEventListener('pointerup', onEnd);
    doc.removeEventListener('pointercancel', onEnd);
  };
}
