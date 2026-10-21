import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { CameraPreset } from '../../core/capture/capture-params';
import { VIEW_COMMAND_PRESETS, commandKey, keyCommand } from '../../core/commands/commands';
import { isTypingContext } from '../../core/keyboard/keyboard';
import { MIDNIGHT_HOUR, NOON_HOUR } from '../../sim/daylight';

/** Bouton de la barre : préréglage, libellé visible, nom accessible et touche associée. */
export interface ViewPresetButton {
  readonly preset: CameraPreset;
  readonly label: string;
  readonly ariaLabel: string;
  readonly key: string;
}

/** Bouton d'une vue, construit d'après sa déclaration (`core/commands`, source unique, #74). */
function viewButton(id: keyof typeof VIEW_COMMAND_PRESETS, label: string): ViewPresetButton {
  const command = keyCommand(id);
  return {
    preset: VIEW_COMMAND_PRESETS[id],
    label,
    ariaLabel: command.description,
    key: command.display,
  };
}

/** Les 5 vues, dans l'ordre des touches `1` à `5`. */
export const VIEW_PRESET_BUTTONS: readonly ViewPresetButton[] = [
  viewButton('vue-dessus', 'Dessus'),
  viewButton('vue-dessous', 'Dessous'),
  viewButton('vue-face', 'Face'),
  viewButton('vue-cote', 'Côté'),
  viewButton('vue-trois-quarts', '3/4'),
];

/** Touche de bascule du filtre pixel art (insensible à la casse). */
export const PIXEL_ART_KEY = commandKey('pixel-art');

/** Vrai pour la touche de bascule du filtre pixel art (`p` ou `P`). */
export function isPixelArtKey(key: string): boolean {
  return key.toLowerCase() === PIXEL_ART_KEY;
}

/** Touche de la pluie dans le bassin (insensible à la casse, issue #106). */
export const RAIN_KEY = commandKey('pluie');

/** Vrai pour la touche de la pluie (`r` ou `R`). */
export function isRainKey(key: string): boolean {
  return key.toLowerCase() === RAIN_KEY;
}

/** Touche qui fige ou remet en marche l'heure de la journée (insensible à la casse). */
export const CLOCK_KEY = commandKey('horloge');

/** Vrai pour la touche qui fige ou remet en marche l'heure (`h` ou `H`, issue #51). */
export function isClockKey(key: string): boolean {
  return key.toLowerCase() === CLOCK_KEY;
}

/** Touche qui fige l'heure en plein jour, à midi (insensible à la casse, issue #75). */
export const DAY_KEY = commandKey('plein-jour');

/** Touche qui fige l'heure en pleine nuit, à minuit (insensible à la casse, issue #75). */
export const NIGHT_KEY = commandKey('nuit');

/**
 * Heure à laquelle figer l'horloge pour une touche : midi pour `j`/`J`, minuit pour
 * `n`/`N`, `null` pour toute autre touche.
 */
export function fixedHourForKey(key: string): number | null {
  switch (key.toLowerCase()) {
    case DAY_KEY:
      return NOON_HOUR;
    case NIGHT_KEY:
      return MIDNIGHT_HOUR;
    default:
      return null;
  }
}

/** Touche de nourrissage : granulés au centre du bac (insensible à la casse, issue #67). */
export const FEED_KEY = commandKey('nourrir');

/** Vrai pour la touche de nourrissage (`g` ou `G`). */
export function isFeedKey(key: string): boolean {
  return key.toLowerCase() === FEED_KEY;
}

/** Préréglage associé à une touche (`1` à `5`), `null` sinon. */
export function presetForKey(key: string): CameraPreset | null {
  return VIEW_PRESET_BUTTONS.find((button) => button.key === key)?.preset ?? null;
}

/**
 * Barre flottante des préréglages de vue (docs/DA.md, « Interface ») : 5 boutons et les
 * raccourcis clavier `1` à `5`. Elle émet le préréglage choisi ; l'hôte l'applique à la vue
 * et lui renvoie le préréglage actif (`activePreset`).
 * À part, après un séparateur : la bascule « Pixel art » (touche `P`, issue #33). La barre
 * émet la demande de bascule ; l'état affiché (`pixelArt`) vient de l'hôte.
 * Touche `H` (issue #51) : demande à l'hôte de figer ou de remettre en marche l'heure (sans
 * bouton ici : le réglage à la souris est dans le panneau de contrôle, #52). Touches `J` et `N`
 * (issue #75) : demandent de figer l'heure à midi (plein jour) ou à minuit (nuit).
 * Bouton « Nourrir » et touche `G` (issue #67) : demandent de déposer des granulés au centre
 * du bac (le clic sur l'eau, lui, est géré par la vue).
 * Touche `R` (issue #106) : demande à l'hôte de faire pleuvoir ou d'arrêter la pluie (sans
 * bouton ici : la case est dans le panneau de contrôle ; sans effet hors du bassin).
 * Absente en mode capture (c'est l'application qui ne l'affiche pas).
 */
@Component({
  selector: 'app-view-presets-bar',
  template: `<div class="view-presets-bar">
    <div class="view-presets-bar__group" role="toolbar" aria-label="Préréglages de vue">
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
    </div>
    <span class="view-presets-bar__separator" aria-hidden="true"></span>
    <button
      type="button"
      class="view-presets-bar__button"
      [class.view-presets-bar__button--active]="pixelArt()"
      [attr.aria-label]="'Filtre pixel art (touche ' + pixelArtKey + ')'"
      [attr.aria-keyshortcuts]="pixelArtKey"
      [attr.aria-pressed]="pixelArt()"
      (click)="togglePixelArt()"
    >
      <span class="view-presets-bar__key" aria-hidden="true">{{ pixelArtKey }}</span>
      Pixel art
    </button>
    <button
      type="button"
      class="view-presets-bar__button"
      [attr.aria-label]="feedDescription + ' (touche ' + feedKey + ')'"
      [attr.aria-keyshortcuts]="feedKey"
      data-action="nourrir"
      (click)="feed()"
    >
      <span class="view-presets-bar__key" aria-hidden="true">{{ feedKey }}</span>
      Nourrir
    </button>
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

  /** Filtre pixel art actif (fourni par l'hôte : la barre ne le mémorise pas). */
  readonly pixelArt = input(true);

  /** Demande de bascule du filtre pixel art (clic ou touche `P`). */
  readonly pixelArtToggled = output<void>();

  /** Demande de figer ou de remettre en marche l'heure de la journée (touche `H`). */
  readonly clockToggled = output<void>();

  /** Demande de figer l'heure à une heure donnée (touches `J` : midi, `N` : minuit). */
  readonly clockFrozenAt = output<number>();

  /** Demande de faire pleuvoir ou d'arrêter la pluie (touche `R`, issue #106). */
  readonly rainToggled = output<void>();
  /** Demande de nourrissage au centre du bac (bouton « Nourrir » ou touche `G`). */
  readonly fed = output<void>();

  protected readonly buttons = VIEW_PRESET_BUTTONS;

  /** Touche de nourrissage telle qu'affichée (`G`) et sa description (nom accessible). */
  protected readonly feedKey = keyCommand('nourrir').display;
  protected readonly feedDescription = keyCommand('nourrir').description;

  protected feed(): void {
    this.fed.emit();
  }

  /** Touche du filtre pixel art telle qu'affichée (`P`). */
  protected readonly pixelArtKey = keyCommand('pixel-art').display;

  protected togglePixelArt(): void {
    this.pixelArtToggled.emit();
  }

  protected choose(preset: CameraPreset): void {
    this.presetSelected.emit(preset);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || isTypingContext(event)) {
      return;
    }
    if (isPixelArtKey(event.key)) {
      event.preventDefault();
      this.togglePixelArt();
      return;
    }
    if (isFeedKey(event.key)) {
      event.preventDefault();
      this.feed();
      return;
    }
    if (isRainKey(event.key)) {
      event.preventDefault();
      this.rainToggled.emit();
      return;
    }
    if (isClockKey(event.key)) {
      event.preventDefault();
      this.clockToggled.emit();
      return;
    }
    const fixedHour = fixedHourForKey(event.key);
    if (fixedHour !== null) {
      event.preventDefault();
      this.clockFrozenAt.emit(fixedHour);
      return;
    }
    const preset = presetForKey(event.key);
    if (preset !== null) {
      event.preventDefault();
      this.choose(preset);
    }
  }
}
