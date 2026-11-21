import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { GuidePage } from '../../sim/care-guide';
import { TREATMENT_KINDS, TREATMENTS, type TreatmentKind } from '../../sim/treatment';
import {
  treatmentSourcesLine,
  treatmentStatusText,
  type TreatmentNotice,
  type TreatmentReadout,
} from '../../sim/treatment-text';
import { treatmentTitle } from './panel-views';
import { TreatmentNotice as TreatmentNoticeView } from './treatment-notice';

/**
 * Section « Soins » du panneau « Réglages » (#361 ; sortie du panneau au #697) : les trois
 * gestes contre les points blancs, l'état du traitement, puis le message du dernier geste
 * (#490) ou, à sa place, les sources et niveaux de preuve. Le panneau ne l'affiche qu'en mode
 * soins, avec des points blancs ou un traitement en cours.
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-care-section]',
  imports: [TreatmentNoticeView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './care-section.scss',
  template: `
    <legend class="control-panel__legend" id="panneau-soins-titre">Soins : points blancs</legend>
    <div class="control-panel__row">
      @for (kind of treatmentKinds; track kind) {
        <button
          type="button"
          class="control-panel__button control-panel__button--compact"
          [attr.data-treatment]="kind"
          [attr.aria-label]="treatments[kind].aria"
          [attr.title]="treatmentTitle(kind)"
          (click)="treatmentRequested.emit(kind)"
        >
          {{ treatments[kind].button }}
        </button>
      }
    </div>
    <p class="control-panel__note" data-treatment-status>{{ treatmentStatus() }}</p>
    @if (treatmentNotice(); as notice) {
      <app-treatment-notice
        class="control-panel__message"
        [class.control-panel__message--error]="!notice.ok"
        data-treatment-message
        [notice]="notice"
        (wikiPageRequested)="wikiPageRequested.emit($event)"
      />
    } @else {
      <!-- Sources et niveaux de preuve (infobulle de chaque bouton) ; le message d'un
           geste prend leur place, pour que le panneau tienne à 1280 × 720. -->
      <p class="control-panel__note" data-treatment-sources>{{ treatmentSources }}</p>
    }
  `,
})
export class CareSection {
  /** Traitement des points blancs en cours (#361) ; `null` : aucun. */
  readonly treatment = input<TreatmentReadout | null>(null);
  /** Message du dernier geste de soin (#361) ; `null` : aucun. */
  readonly treatmentNotice = input<TreatmentNotice | null>(null);

  /** Bouton d'un traitement des points blancs (#361) : un geste de ce traitement. */
  readonly treatmentRequested = output<TreatmentKind>();
  /** Lien « Produits et traitements » d'un message de soin (#554). */
  readonly wikiPageRequested = output<GuidePage>();

  protected readonly treatmentStatus = computed(() => treatmentStatusText(this.treatment()));
  protected readonly treatmentKinds = TREATMENT_KINDS;
  protected readonly treatments = TREATMENTS;
  protected readonly treatmentTitle = treatmentTitle;
  protected readonly treatmentSources = treatmentSourcesLine();
}
