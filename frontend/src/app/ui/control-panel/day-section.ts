import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { formatHour, HOUR_SLIDER_STEP, HOURS_PER_DAY, NOON_HOUR } from '../../sim/daylight';
import { formNumber } from './panel-views';
import { SettingMark } from '../settings-window/settings-search-filter';

/** Heure lue sur le curseur d'heure (une chaîne), `null` si elle n'est pas dans [0, 24). */
export function sliderHour(value: string | number): number | null {
  const hour = formNumber(value);
  return Number.isFinite(hour) && hour >= 0 && hour < HOURS_PER_DAY ? hour : null;
}

/**
 * Section « Journée » du panneau « Réglages » (#52 ; sortie du panneau au #697) : curseur
 * d'heure au quart d'heure et case « Heure automatique ». « Pluie » (#106) est passée dans la
 * section « Affichage » (#762, `display-section.ts`).
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  imports: [SettingMark],
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-day-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './day-section.scss',
  template: `
    <legend class="control-panel__legend">Journée</legend>
    <label class="control-panel__field" for="panneau-heure" appSetting="Heure">
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
    <div class="control-panel__row" appSetting="Heure automatique">
      <label class="control-panel__check">
        <input type="checkbox" [checked]="clockRunning()" (change)="onClockRunning($event)" />
        Heure automatique
      </label>
    </div>
  `,
})
export class DaySection {
  /** Heure affichée, au quart d'heure. */
  readonly hour = input<number>(NOON_HOUR);
  /** Vrai si l'heure avance d'elle-même. */
  readonly clockRunning = input(true);

  /** Heure choisie au curseur (l'hôte fige l'horloge à cette heure). */
  readonly hourChanged = output<number>();
  /** Case « Heure automatique ». */
  readonly clockRunningChanged = output<boolean>();

  protected readonly hourStep = HOUR_SLIDER_STEP;
  /** Dernier cran du curseur d'heure : 23:45 (24:00 serait minuit, déjà au cran 0). */
  protected readonly maxHour = HOURS_PER_DAY - HOUR_SLIDER_STEP;
  protected readonly hourText = computed(() => formatHour(this.hour()));

  protected onHour(event: Event): void {
    const hour = sliderHour((event.target as HTMLInputElement).value);
    if (hour !== null) {
      this.hourChanged.emit(hour);
    }
  }

  protected onClockRunning(event: Event): void {
    this.clockRunningChanged.emit((event.target as HTMLInputElement).checked);
  }
}
