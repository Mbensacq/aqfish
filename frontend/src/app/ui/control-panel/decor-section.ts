import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { DEFAULT_FOOD_STYLE, type FoodStyle } from '../../core/food-style/food-style';
import { EDITABLE_ENVIRONMENTS } from '../../sim/decor-edit';
import { environmentName } from './panel-views';
import { SettingMark } from '../settings-window/settings-search-filter';

/**
 * Bacs dont le décor s'édite, en toutes lettres (« tropical et d’eau froide ») : noms
 * d'`EDITABLE_ENVIRONMENTS` sans le mot « Bac », pour que le libellé suive la liste (#885).
 */
function editableTanksText(): string {
  const names = EDITABLE_ENVIRONMENTS.map((id) => environmentName(id).replace(/^Bac /, ''));
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
}

/**
 * Libellé et infobulle du bouton « Éditer le décor » désactivé (#885) : une seule chaîne pour
 * l'`aria-label` et le `title`, qui ne peuvent plus diverger.
 */
export const DECOR_EDIT_DISABLED_LABEL = `Éditer le décor (bacs ${editableTanksText()} seulement)`;

/**
 * Section « Décor » du panneau « Réglages » (#52 ; sortie du panneau au #697) : « Éditer le
 * décor » sur la ligne du titre (#167, bacs d'`EDITABLE_ENVIRONMENTS` seulement), case
 * « Afficher le décor » et rendu des granulés (#117) sur la même ligne.
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
        [attr.aria-label]="decorEditable() ? 'Éditer le décor' : disabledLabel"
        [attr.title]="decorEditable() ? null : disabledLabel"
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

  protected readonly disabledLabel = DECOR_EDIT_DISABLED_LABEL;

  protected onEdit(): void {
    if (this.decorEditable()) {
      this.editRequested.emit();
    }
  }

  protected onDecor(event: Event): void {
    this.decorVisibleChanged.emit((event.target as HTMLInputElement).checked);
  }
}
