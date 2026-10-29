import { ChangeDetectionStrategy, Component } from '@angular/core';

import { DECOR_BADGE_TEXT } from '../../sim/care-mode';

/**
 * Badge permanent d'un bac en mode décor (#278, ADR 0077) : il remplace le tableau de bord
 * (cadre haut et bandeau bas), à la place du cadre haut, en indicateur discret. Aucune
 * interaction : l'hôte laisse passer le pointeur au canvas, sauf sur le badge lui-même.
 */
@Component({
  selector: 'app-decor-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="decor-badge" data-decor-badge>{{ text }}</p>`,
  styles: `
    :host {
      position: fixed;
      top: 12px;
      right: 324px;
      left: 155px;
      z-index: 0;
      display: flex;
      justify-content: center;
      pointer-events: none;
      font:
        400 12px / 1.25 system-ui,
        sans-serif;
    }

    .decor-badge {
      margin: 0;
      padding: 6px 12px;
      border: 1px solid rgb(232 230 227 / 18%);
      border-radius: 10px;
      background: rgb(20 24 30 / 72%);
      color: #e8e6e3;
      pointer-events: auto;
    }

    @media (max-width: 1099px) {
      :host {
        top: 56px;
        right: 12px;
        left: 12px;
      }
    }
  `,
})
export class DecorBadge {
  protected readonly text = DECOR_BADGE_TEXT;
}
