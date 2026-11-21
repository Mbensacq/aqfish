import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DEFAULT_ENVIRONMENT_ID, environmentById, type EnvironmentId } from '../../sim/environment';
import { SectionLegend } from '../settings-window/settings-search-filter';

/**
 * Section « Affichage » du panneau « Réglages » (#762, catégorie « Affichage » de la fenêtre,
 * `docs/INTERFACE.md` section 2) : la pluie sur le bassin (#106), sortie de la section
 * « Journée ». Ailleurs qu'au bassin, une note dit qu'il n'y pleut pas.
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  imports: [SectionLegend],
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-display-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './display-section.scss',
  template: `
    <legend class="control-panel__legend" appSectionLegend>Affichage</legend>
    @if (rainAvailable()) {
      <label class="control-panel__check" data-rain>
        <input type="checkbox" [checked]="rain()" (change)="onRain($event)" />
        Pluie
      </label>
    } @else {
      <p class="control-panel__note" data-rain-note>Il ne pleut que sur le bassin.</p>
    }
  `,
})
export class DisplaySection {
  /** Environnement affiché : la pluie n'est proposée que là où il peut pleuvoir. */
  readonly environment = input<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  /** Vrai s'il pleut (#106). */
  readonly rain = input(false);

  /** Case « Pluie » (#106). */
  readonly rainChanged = output<boolean>();

  /** Case « Pluie » proposée seulement là où il peut pleuvoir (le bassin, #106). */
  protected readonly rainAvailable = computed(() => environmentById(this.environment()).rain);

  protected onRain(event: Event): void {
    this.rainChanged.emit((event.target as HTMLInputElement).checked);
  }
}
