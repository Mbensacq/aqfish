import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { DEFAULT_FOOD_STYLE, type FoodStyle } from '../../core/food-style/food-style';
import { SettingMark } from '../settings-window/settings-search-filter';

/**
 * Section « Décor » du panneau « Réglages » (#52 ; sortie du panneau au #697) : « Éditer le
 * décor » sur la ligne du titre (#167, bacs tropical et d'eau froide seulement), case « Afficher le décor » et
 * rendu des granulés (#117) sur la même ligne.
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  imports: [SettingMark],
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-decor-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './decor-section.scss',
  template: `
    <!-- Éditeur (#167) : sur la ligne du titre, le panneau ne grandit pas (#101). -->
    <legend class="control-panel__legend control-panel__legend--row">
      <span id="panneau-decor-titre">Décor</span>
      <button
        type="button"
        class="control-panel__edit"
        appSetting="Éditer le décor"
        data-decor-edit
        [attr.aria-disabled]="!decorEditable()"
        [attr.aria-label]="
          decorEditable()
            ? 'Éditer le décor'
            : 'Éditer le décor (bacs tropical et d’eau froide seulement)'
        "
        [attr.title]="decorEditable() ? null : 'Bac tropical seulement'"
        (click)="onEdit()"
      >
        Éditer le décor
      </button>
    </legend>
    <!-- Granulés (#117) : sur la même ligne, le panneau tient sans défiler à 1280 × 720 (#101). -->
    <div class="control-panel__row">
      <label class="control-panel__check" appSetting="Afficher le décor">
        <input type="checkbox" [checked]="decorVisible()" (change)="onDecor($event)" />
        Afficher le décor
      </label>
      <button
        type="button"
        class="control-panel__button control-panel__button--compact"
        appSetting="Granulés"
        data-food-style
        [attr.aria-label]="'Granulés : ' + foodStyle() + ', changer de rendu'"
        (click)="foodStyleToggled.emit()"
      >
        Granulés : {{ foodStyle() }}
      </button>
    </div>
  `,
})
export class DecorSection {
  /** Vrai si le décor est affiché. */
  readonly decorVisible = input(true);
  /** Vrai si le décor de l'environnement est modifiable (#167). */
  readonly decorEditable = input(false);
  /** Rendu des granulés, `points` ou `voxels` (#117). */
  readonly foodStyle = input<FoodStyle>(DEFAULT_FOOD_STYLE);

  /** Case « Afficher le décor ». */
  readonly decorVisibleChanged = output<boolean>();
  /** Bouton « Éditer le décor » (#167), seulement si le décor est modifiable. */
  readonly editRequested = output<void>();
  /** Bouton « Granulés » : passer à l'autre rendu (#117). */
  readonly foodStyleToggled = output<void>();

  protected onEdit(): void {
    if (this.decorEditable()) {
      this.editRequested.emit();
    }
  }

  protected onDecor(event: Event): void {
    this.decorVisibleChanged.emit((event.target as HTMLInputElement).checked);
  }
}
