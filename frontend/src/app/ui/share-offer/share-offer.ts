import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { ShareOffer as ShareOfferData } from '../aquarium-host/aquarium-host';
import { DASHBOARD_COLORS } from '../dashboard-frame/dashboard-frame';

/** Texte de la proposition d'import d'un aquarium partagé (#426). */
export function shareOfferText(offer: Extract<ShareOfferData, { kind: 'offre' }>): string {
  const animals = offer.animals === 1 ? '1 animal' : `${offer.animals} animaux`;
  const tanks = offer.tanks === 1 ? 'votre bac actuel' : `vos ${offer.tanks} bacs actuels`;
  return `Aquarium partagé : ${offer.environment}, ${animals}. L’importer remplace ${tanks} ; exportez-les d’abord pour les garder.`;
}

/**
 * Bandeau d'un lien partagé (#426, ADR 0105) : propose « Importer cet aquarium » ou
 * « Ignorer » (rien n'est remplacé sans confirmation), ou affiche la raison du refus d'un lien
 * invalide. Couleurs de l'interface (`DASHBOARD_COLORS`, docs/DA.md « Interface »).
 */
@Component({
  selector: 'app-share-offer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (offer(); as current) {
      @if (current.kind === 'offre') {
        <section
          class="share-offer"
          role="alertdialog"
          aria-labelledby="share-offer-text"
          data-share-offer
        >
          <p id="share-offer-text" class="share-offer__text">{{ text() }}</p>
          <div class="share-offer__buttons">
            <button type="button" class="share-offer__button" (click)="accepted.emit()">
              Importer cet aquarium
            </button>
            <button type="button" class="share-offer__button" (click)="dismissed.emit()">
              Ignorer
            </button>
          </div>
        </section>
      } @else {
        <section class="share-offer" role="alert" data-share-error>
          <p class="share-offer__text share-offer__text--error">{{ current.text }}</p>
          <div class="share-offer__buttons">
            <button type="button" class="share-offer__button" (click)="dismissed.emit()">
              Fermer
            </button>
          </div>
        </section>
      }
    }
  `,
  styleUrl: './share-offer.scss',
  host: {
    '[style.--dashboard-background]': 'colors.background',
    '[style.--dashboard-ink]': 'colors.ink',
    '[style.--dashboard-error]': 'colors.rouge',
  },
})
export class ShareOffer {
  /** Lien reçu (fourni par l'hôte) ; `null` : rien à afficher. */
  readonly offer = input<ShareOfferData | null>(null);
  /** « Importer cet aquarium ». */
  readonly accepted = output<void>();
  /** « Ignorer » ou « Fermer ». */
  readonly dismissed = output<void>();

  protected readonly colors = DASHBOARD_COLORS;
  protected readonly text = computed(() => {
    const offer = this.offer();
    return offer?.kind === 'offre' ? shareOfferText(offer) : '';
  });
}
