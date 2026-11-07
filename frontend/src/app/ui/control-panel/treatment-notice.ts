import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { TreatmentNotice as Notice } from '../../sim/treatment-text';

/**
 * Message du dernier geste de soin (#361), dans la section « Soins » du panneau : le texte,
 * puis la mise en garde éventuelle.
 *
 * Sorti du panneau (#490) : en deux colonnes (1280 × 720), le message n'est plus une ligne de
 * la section mais une bulle posée à droite du panneau, à hauteur de son bas. Sinon la section
 * grandissait (~70 px), passait en deuxième colonne et poussait « Sauvegarde » dans une
 * troisième, hors du panneau. Ailleurs (une colonne), il reste une ligne de la section. L'hôte
 * porte les classes et attributs d'avant (`control-panel__message`, `data-treatment-message`).
 */
@Component({
  selector: 'app-treatment-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status' },
  template: `
    {{ notice().text }}
    @if (notice().warning; as warning) {
      <span class="treatment-notice__warning" data-treatment-warning>{{ warning }}</span>
    }
  `,
  styleUrl: './treatment-notice.scss',
})
export class TreatmentNotice {
  /** Message à afficher (accepté ou refusé, mise en garde éventuelle). */
  readonly notice = input.required<Notice>();
}
