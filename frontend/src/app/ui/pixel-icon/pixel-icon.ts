import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { IconPixel } from './pixel-masks';

/**
 * Icône en pixel art (#724) : un carré par pixel plein, à la couleur du texte, sans lissage.
 * Décorative (`aria-hidden`) : le bouton qui la porte garde son libellé et son nom accessible.
 * Taille à l'écran : `--pixel-icon-size` (12 px par défaut, un pixel d'icône par pixel CSS).
 */
@Component({
  selector: 'app-pixel-icon',
  template: `<svg
    [attr.viewBox]="'0 0 ' + grid() + ' ' + grid()"
    shape-rendering="crispEdges"
    focusable="false"
  >
    @for (pixel of pixels(); track $index) {
      <rect [attr.x]="pixel[0]" [attr.y]="pixel[1]" width="1" height="1" />
    }
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: var(--pixel-icon-size, 12px);
      height: var(--pixel-icon-size, 12px);
    }

    svg {
      width: 100%;
      height: 100%;
      fill: currentcolor;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', 'data-pixel-icon': '' },
})
export class PixelIcon {
  /** Pixels pleins, `[x, y]` (`iconPixels`). */
  readonly pixels = input.required<readonly IconPixel[]>();
  /** Côté de la grille, en pixels d'icône. */
  readonly grid = input(12);
}
