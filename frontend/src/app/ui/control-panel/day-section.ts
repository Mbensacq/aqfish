import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { formatHour, HOUR_SLIDER_STEP, HOURS_PER_DAY, NOON_HOUR } from '../../sim/daylight';
import { DEFAULT_ENVIRONMENT_ID, environmentById, type EnvironmentId } from '../../sim/environment';
import { formNumber } from './panel-views';

/** Heure lue sur le curseur d'heure (une chaîne), `null` si elle n'est pas dans [0, 24). */
export function sliderHour(value: string | number): number | null {
  const hour = formNumber(value);
  return Number.isFinite(hour) && hour >= 0 && hour < HOURS_PER_DAY ? hour : null;
}

/**
 * Section « Journée » du panneau « Réglages » (#52 ; sortie du panneau au #697) : curseur
 * d'heure au quart d'heure, case « Heure automatique » et, au bassin seulement, « Pluie »
 * (#106) sur la même ligne.
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-day-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './day-section.scss',
  template: `
    <legend class="control-panel__legend">Journée</legend>
    <label class="control-panel__field" for="panneau-heure">
      <span class="control-panel__label">
        Heure <output class="control-panel__value">{{ hourText() }}</output>
      </span>
      <input
        id="panneau-heure"
        class="control-panel__range"
        aria-label="Heure de la journée"
        type="range"
        min="0"
        [attr.max]="maxHour"
        [attr.step]="hourStep"
        [value]="hour()"
        [attr.aria-valuetext]="hourText()"
        (input)="onHour($event)"
      />
    </label>
    <!-- Pluie (#106), bassin seulement : sur la même ligne, le panneau ne grandit pas (#101). -->
    <div class="control-panel__row">
      <label class="control-panel__check">
        <input type="checkbox" [checked]="clockRunning()" (change)="onClockRunning($event)" />
        Heure automatique
      </label>
      @if (rainAvailable()) {
        <label class="control-panel__check" data-rain>
          <input type="checkbox" [checked]="rain()" (change)="onRain($event)" />
          Pluie
        </label>
      }
    </div>
  `,
})
export class DaySection {
  /** Environnement affiché : la pluie n'est proposée que là où il peut pleuvoir. */
  readonly environment = input<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  /** Heure affichée, au quart d'heure. */
  readonly hour = input<number>(NOON_HOUR);
  /** Vrai si l'heure avance d'elle-même. */
  readonly clockRunning = input(true);
  /** Vrai s'il pleut (#106). */
  readonly rain = input(false);

  /** Heure choisie au curseur (l'hôte fige l'horloge à cette heure). */
  readonly hourChanged = output<number>();
  /** Case « Heure automatique ». */
  readonly clockRunningChanged = output<boolean>();
  /** Case « Pluie » (#106). */
  readonly rainChanged = output<boolean>();

  protected readonly hourStep = HOUR_SLIDER_STEP;
  /** Dernier cran du curseur d'heure : 23:45 (24:00 serait minuit, déjà au cran 0). */
  protected readonly maxHour = HOURS_PER_DAY - HOUR_SLIDER_STEP;
  protected readonly hourText = computed(() => formatHour(this.hour()));
  /** Case « Pluie » proposée seulement là où il peut pleuvoir (le bassin, #106). */
  protected readonly rainAvailable = computed(() => environmentById(this.environment()).rain);

  protected onHour(event: Event): void {
    const hour = sliderHour((event.target as HTMLInputElement).value);
    if (hour !== null) {
      this.hourChanged.emit(hour);
    }
  }

  protected onClockRunning(event: Event): void {
    this.clockRunningChanged.emit((event.target as HTMLInputElement).checked);
  }

  protected onRain(event: Event): void {
    this.rainChanged.emit((event.target as HTMLInputElement).checked);
  }
}
