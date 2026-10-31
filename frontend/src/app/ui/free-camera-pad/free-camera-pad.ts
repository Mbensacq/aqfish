import { ChangeDetectionStrategy, Component, output } from '@angular/core';

/** Déplacement tenu par un bouton du pavé (#344). */
export type FreeCameraPadMove = 'avancer' | 'reculer';

/** Bouton tenu ou relâché. */
export interface FreeCameraPadEvent {
  readonly move: FreeCameraPadMove;
  readonly held: boolean;
}

/** Boutons du pavé, de haut en bas : libellé visible (flèche) et nom accessible. */
export const FREE_CAMERA_PAD_BUTTONS: readonly {
  readonly move: FreeCameraPadMove;
  readonly glyph: string;
  readonly label: string;
}[] = [
  { move: 'avancer', glyph: '▲', label: 'Avancer' },
  { move: 'reculer', glyph: '▼', label: 'Reculer' },
];

/**
 * Pavé « Avancer » / « Reculer » de la caméra libre (#344), surtout pour le téléphone : un
 * bouton tenu (doigt, souris, ou Entrée et Espace au clavier) agit comme une touche tenue.
 * Placé au bord gauche, à mi-hauteur, plus étroit que l'écart entre le bord et le panneau
 * « Réglages » : il ne recouvre ni le tableau de bord ni ce panneau (1280 px et 390 px).
 * L'application ne l'affiche qu'en caméra libre.
 */
@Component({
  selector: 'app-free-camera-pad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="free-camera-pad" role="group" aria-label="Déplacement de la caméra libre">
      @for (button of buttons; track button.move) {
        <button
          type="button"
          class="free-camera-pad__button"
          [attr.aria-label]="button.label"
          [attr.title]="button.label"
          [attr.data-free-move]="button.move"
          (pointerdown)="onPointerDown($event, button.move)"
          (pointerup)="release(button.move)"
          (pointercancel)="release(button.move)"
          (lostpointercapture)="release(button.move)"
          (keydown)="onKey($event, button.move, true)"
          (keyup)="onKey($event, button.move, false)"
          (blur)="release(button.move)"
          (contextmenu)="$event.preventDefault()"
        >
          <span aria-hidden="true">{{ button.glyph }}</span>
        </button>
      }
    </div>
  `,
  styleUrl: './free-camera-pad.scss',
})
export class FreeCameraPad {
  /** Bouton tenu (`held: true`) ou relâché (`held: false`). */
  readonly moveHeld = output<FreeCameraPadEvent>();

  /** Boutons tenus, pour n'émettre le relâchement qu'une fois. */
  private readonly held = new Set<FreeCameraPadMove>();

  protected readonly buttons = FREE_CAMERA_PAD_BUTTONS;

  protected onPointerDown(event: PointerEvent, move: FreeCameraPadMove): void {
    if (event.button !== 0) {
      return;
    }
    // Garde le relâchement sur le bouton même si le doigt glisse hors de lui.
    const target = event.currentTarget as Element | null;
    try {
      target?.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointeur déjà relâché : `pointerup` suivra quand même.
    }
    event.preventDefault();
    this.press(move);
  }

  protected onKey(event: KeyboardEvent, move: FreeCameraPadMove, down: boolean): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    if (down) {
      this.press(move);
    } else {
      this.release(move);
    }
  }

  protected release(move: FreeCameraPadMove): void {
    if (this.held.delete(move)) {
      this.moveHeld.emit({ move, held: false });
    }
  }

  private press(move: FreeCameraPadMove): void {
    if (!this.held.has(move)) {
      this.held.add(move);
      this.moveHeld.emit({ move, held: true });
    }
  }
}
