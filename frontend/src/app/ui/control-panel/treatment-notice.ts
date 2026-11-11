import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { GuidePage } from '../../sim/care-guide';
import type { TreatmentNotice as Notice } from '../../sim/treatment-text';

/** Titre de la page du wiki que citent les messages des produits (amorce, conditionneur…). */
const PRODUCTS_TITLE = 'Produits et traitements';
/** Le titre tel qu'il est cité, entre guillemets français, dans le texte des messages. */
const PRODUCTS_QUOTE = `« ${PRODUCTS_TITLE} »`;

/**
 * Message du dernier geste de soin (#361), dans la section « Soins » du panneau : le texte,
 * puis la mise en garde éventuelle.
 *
 * Sorti du panneau (#490) : en deux colonnes (1280 × 720), le message n'est plus une ligne de
 * la section mais une bulle posée à droite du panneau, à hauteur de son bas. Sinon la section
 * grandissait (~70 px), passait en deuxième colonne et poussait « Sauvegarde » dans une
 * troisième, hors du panneau. Ailleurs (une colonne), il reste une ligne de la section. L'hôte
 * porte les classes et attributs d'avant (`control-panel__message`, `data-treatment-message`).
 *
 * Le renvoi « voir la page « Produits et traitements » du wiki » (amorce de bactéries,
 * conditionneur, traitements) est un lien (#554) : il ouvre cette page du wiki, comme le
 * bouton de la pharmacie. Le texte lu reste le même.
 */
@Component({
  selector: 'app-treatment-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status' },
  template: `
    @if (parts(); as part) {
      {{ part.before
      }}<button
        type="button"
        class="treatment-notice__link"
        data-products-link
        (click)="wikiPageRequested.emit('produits')"
      >
        {{ title }}</button
      >{{ part.after }}
    } @else {
      {{ notice().text }}
    }
    @if (notice().warning; as warning) {
      <span class="treatment-notice__warning" data-treatment-warning>{{ warning }}</span>
    }
  `,
  styleUrl: './treatment-notice.scss',
})
export class TreatmentNotice {
  /** Message à afficher (accepté ou refusé, mise en garde éventuelle). */
  readonly notice = input.required<Notice>();
  /** Lien « Produits et traitements » du message (#554) : l'application ouvre cette page. */
  readonly wikiPageRequested = output<GuidePage>();

  protected readonly title = PRODUCTS_TITLE;

  /** Texte avant et après le titre cité, ou `null` si le message ne renvoie pas au wiki. */
  protected readonly parts = computed(() => {
    const text = this.notice().text;
    const at = text.indexOf(PRODUCTS_QUOTE);
    if (at < 0) {
      return null;
    }
    // Les guillemets restent du texte : seul le titre est le lien.
    const start = at + PRODUCTS_QUOTE.indexOf(PRODUCTS_TITLE);
    const end = start + PRODUCTS_TITLE.length;
    return { before: text.slice(0, start), after: text.slice(end) };
  });
}
