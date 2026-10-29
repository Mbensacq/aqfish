import { ChangeDetectionStrategy, Component } from '@angular/core';

import { DECOR_BADGE_TEXT } from '../../sim/care-mode';
import { DASHBOARD_COLORS } from '../dashboard-frame/dashboard-frame';

/**
 * Badge permanent d'un bac en mode décor (#278, ADR 0077) : il remplace le tableau de bord
 * (cadre haut et bandeau bas), à la place du cadre haut, en indicateur discret. Aucune
 * interaction : l'hôte laisse passer le pointeur au canvas, sauf sur le badge lui-même.
 * Couleurs, police et emplacement : ceux du tableau de bord (#320, `decor-badge.scss`).
 */
@Component({
  selector: 'app-decor-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="decor-badge" data-decor-badge>{{ text }}</p>`,
  styleUrl: './decor-badge.scss',
  host: {
    '[style.--dashboard-background]': 'colors.background',
    '[style.--dashboard-ink]': 'colors.ink',
  },
})
export class DecorBadge {
  protected readonly text = DECOR_BADGE_TEXT;
  protected readonly colors = DASHBOARD_COLORS;
}
