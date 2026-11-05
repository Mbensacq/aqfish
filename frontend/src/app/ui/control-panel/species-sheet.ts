import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { CatalogEntry } from '../../sim/species-catalog';
import { sheetNotes, sheetRows } from '../../sim/species-sheet';

/**
 * Fiche d'une espèce (#237), ouverte sous sa ligne dans la section « Population » du panneau
 * de réglages : une région titrée, les mises en garde (#269), puis chaque valeur avec son
 * statut (source ou approximation de jeu) en petit dessous, et « Fermer la fiche ».
 *
 * Sortie du panneau (#255, #216) : le panneau garde l'état (une seule fiche ouverte) et le
 * retour du focus au bouton « Fiche » ; la fiche signale seulement sa fermeture (Échap dans
 * la fiche, avec l'évènement pour l'arrêter, ou le bouton, sans évènement). L'hôte est la
 * région elle-même : mêmes attributs qu'avant l'extraction (`data-species-sheet`…).
 */
@Component({
  selector: 'app-species-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'region',
    '[id]': "'fiche-' + entry().species",
    '[attr.aria-labelledby]': "'fiche-titre-' + entry().species",
    '[attr.data-species-sheet]': 'entry().species',
    '(keydown.escape)': 'closed.emit($event)',
  },
  template: `
    <h3 class="species-sheet__title" [id]="'fiche-titre-' + entry().species">
      Fiche : {{ entry().name }}
      <span class="species-sheet__latin">{{ entry().scientificName }}</span>
    </h3>
    <!-- Mises en garde de la fiche (#269) : non vérifiée, pas pour débutant… -->
    @for (item of notes(); track item.text) {
      <p class="species-sheet__note" data-sheet-note>
        {{ item.text }}
        <small class="species-sheet__status">{{ item.status }}</small>
      </p>
    }
    <dl class="species-sheet__list">
      @for (row of rows(); track row.field) {
        <div class="species-sheet__row" [attr.data-sheet-field]="row.field">
          <dt>{{ row.label }}</dt>
          <dd>
            {{ row.value }}
            <small class="species-sheet__status" data-sheet-status>{{ row.status }}</small>
          </dd>
        </div>
      }
    </dl>
    <button
      type="button"
      class="species-sheet__close"
      data-sheet-close
      (click)="closed.emit(undefined)"
    >
      Fermer la fiche
    </button>
  `,
  styleUrl: './species-sheet.scss',
})
export class SpeciesSheet {
  /** Espèce de la fiche, telle que le catalogue de l'environnement la décrit. */
  readonly entry = input.required<CatalogEntry>();
  /** Demande de fermeture : l'évènement Échap à arrêter, ou `undefined` (bouton). */
  readonly closed = output<Event | undefined>();

  protected readonly notes = computed(() => sheetNotes(this.entry().species));
  protected readonly rows = computed(() => sheetRows(this.entry().species));
}
