import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { DEFAULT_ENVIRONMENT_ID, environmentById, type EnvironmentId } from '../../sim/environment';
import { HiddenInterfaceState } from '../hidden-interface/hidden-interface-state';
import { MoonOptionState } from '../moon-option/moon-option-state';
import { SectionLegend, SettingMark } from '../settings-window/settings-search-filter';

/**
 * Section « Affichage » du panneau « Réglages » (#762, catégorie « Affichage » de la fenêtre,
 * `docs/INTERFACE.md` section 2) : la pluie sur le bassin (#106), sortie de la section
 * « Journée ». Ailleurs qu'au bassin, une note dit qu'il n'y pleut pas. Puis « Lune » (#856 :
 * cycle lunaire des nuits) et « Masquer
 * l'interface » (#725, à la place du mode immersif) : tout disparaît sauf le bac.
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  imports: [SectionLegend, SettingMark],
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
    <label class="control-panel__check" appSetting="Lune" data-moon>
      <input type="checkbox" [checked]="moonOption.enabled()" (change)="onMoon($event)" />
      Lune
    </label>
    <label class="control-panel__check" appSetting="Masquer l’interface" data-hide-interface>
      <input
        type="checkbox"
        [checked]="hiddenInterface.hidden()"
        (change)="onHideInterface($event)"
      />
      Masquer l’interface
    </label>
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

  /** « Masquer l'interface » (#725), état partagé avec la racine et la touche `I`. */
  protected readonly hiddenInterface = inject(HiddenInterfaceState);

  /** « Lune » (#856) : le cycle lunaire fait varier la clarté des nuits ; choix mémorisé. */
  protected readonly moonOption = inject(MoonOptionState);

  protected onMoon(event: Event): void {
    this.moonOption.setEnabled((event.target as HTMLInputElement).checked);
  }

  protected onHideInterface(event: Event): void {
    this.hiddenInterface.setHidden((event.target as HTMLInputElement).checked);
  }

  protected onRain(event: Event): void {
    this.rainChanged.emit((event.target as HTMLInputElement).checked);
  }
}
