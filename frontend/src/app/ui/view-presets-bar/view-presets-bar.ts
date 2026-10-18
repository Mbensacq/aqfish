import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { CameraPreset } from '../../core/capture/capture-params';

/** Bouton de la barre : préréglage, libellé visible, nom accessible et touche associée. */
export interface ViewPresetButton {
  readonly preset: CameraPreset;
  readonly label: string;
  readonly ariaLabel: string;
  readonly key: string;
}

/** Les 5 vues, dans l'ordre des touches `1` à `5`. */
export const VIEW_PRESET_BUTTONS: readonly ViewPresetButton[] = [
  { preset: 'top', label: 'Dessus', ariaLabel: 'Vue de dessus', key: '1' },
  { preset: 'bottom', label: 'Dessous', ariaLabel: 'Vue de dessous', key: '2' },
  { preset: 'front', label: 'Face', ariaLabel: 'Vue de face', key: '3' },
  { preset: 'side', label: 'Côté', ariaLabel: 'Vue de côté', key: '4' },
  { preset: 'three-quarter', label: '3/4', ariaLabel: 'Vue trois-quarts', key: '5' },
];

/** Préréglage associé à une touche (`1` à `5`), `null` sinon. */
export function presetForKey(key: string): CameraPreset | null {
  return VIEW_PRESET_BUTTONS.find((button) => button.key === key)?.preset ?? null;
}

/**
 * Vrai si la touche doit être laissée au navigateur : touche de modification enfoncée, ou
 * focus dans un champ de saisie (`input`, `textarea`, `select`, élément éditable).
 */
export function isTypingContext(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return true;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) {
    return true;
  }
  // `isContentEditable` peut manquer (jsdom) : comparaison stricte.
  return target instanceof HTMLElement && target.isContentEditable === true;
}

/**
 * Barre flottante des préréglages de vue (docs/DA.md, « Interface ») : 5 boutons et les
 * raccourcis clavier `1` à `5`. Elle émet le préréglage choisi ; l'hôte l'applique à la vue
 * et lui renvoie le préréglage actif (`activePreset`).
 * Absente en mode capture (c'est l'application qui ne l'affiche pas).
 */
@Component({
  selector: 'app-view-presets-bar',
  template: `<div class="view-presets-bar" role="toolbar" aria-label="Préréglages de vue">
    @for (button of buttons; track button.preset) {
      <button
        type="button"
        class="view-presets-bar__button"
        [class.view-presets-bar__button--active]="activePreset() === button.preset"
        [attr.aria-label]="button.ariaLabel + ' (touche ' + button.key + ')'"
        [attr.aria-keyshortcuts]="button.key"
        [attr.aria-pressed]="activePreset() === button.preset"
        [attr.data-preset]="button.preset"
        (click)="choose(button.preset)"
      >
        <span class="view-presets-bar__key" aria-hidden="true">{{ button.key }}</span>
        {{ button.label }}
      </button>
    }
  </div>`,
  styleUrl: './view-presets-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class ViewPresetsBar {
  /** Préréglage choisi (clic ou touche). */
  readonly presetSelected = output<CameraPreset>();

  /**
   * Préréglage que la caméra suit réellement (`null` après un déplacement à la souris), fourni
   * par l'hôte : la barre ne le mémorise pas elle-même (bug #23).
   */
  readonly activePreset = input<CameraPreset | null>(null);

  protected readonly buttons = VIEW_PRESET_BUTTONS;

  protected choose(preset: CameraPreset): void {
    this.presetSelected.emit(preset);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || isTypingContext(event)) {
      return;
    }
    const preset = presetForKey(event.key);
    if (preset !== null) {
      event.preventDefault();
      this.choose(preset);
    }
  }
}
