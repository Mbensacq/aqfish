import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DEFAULT_LIGHTING_HOURS } from '../../sim/algae';
import { formatHour } from '../../sim/daylight';
import { DEFAULT_LAMP_ON_HOUR, LAMP_MAX_HOURS, LAMP_MIN_HOURS, isLampOnHour } from '../../sim/lamp';
import { MAX_HEATER_TEMPERATURE, MIN_HEATER_TEMPERATURE } from '../../sim/water';
import { CURRENT_LEVEL_LABELS, type CurrentLevel } from '../../sim/water-current';
import { formatTenth } from '../../sim/water-dashboard';
import { DEFAULT_WATER_READOUT, type WaterReadout } from '../../sim/water-quality';
import { formNumber } from './panel-views';

/** Pas du curseur du chauffage, en °C (#207). */
export const HEATER_SLIDER_STEP = 0.5;

/** Libellé de la durée d'éclairage (#476) : « 8 h par jour ». */
export function lightingText(hours: number): string {
  return `${hours} h par jour`;
}

/**
 * Durée d'éclairage lue sur le curseur (#476, #584) : entier dans [`LAMP_MIN_HOURS`,
 * `LAMP_MAX_HOURS`] (4 à 14 h), `null` sinon.
 */
export function sliderLighting(value: string | number): number | null {
  const h = formNumber(value);
  return Number.isInteger(h) && h >= LAMP_MIN_HOURS && h <= LAMP_MAX_HOURS ? h : null;
}

/** Heure d'allumage de la lampe lue sur le curseur (#584) : entier de 0 à 23, `null` sinon. */
export function sliderLampOn(value: string | number): number | null {
  const h = formNumber(value);
  return isLampOnHour(h) ? h : null;
}

/** Libellé de l'heure d'allumage (#584) : « allumée à 10:00 ». */
export function lampOnText(hour: number): string {
  return `allumée à ${formatHour(hour)}`;
}

/** Température lue sur le curseur du chauffage (une chaîne), `null` hors des bornes. */
export function sliderHeater(value: string | number): number | null {
  const t = formNumber(value);
  return Number.isFinite(t) && t >= MIN_HEATER_TEMPERATURE && t <= MAX_HEATER_TEMPERATURE
    ? t
    : null;
}

/**
 * Texte du chauffage (#207) : « 26,0 °C », suivi de la température de l'eau tant qu'elle
 * n'a pas rejoint la consigne (« 26,0 °C · eau 25,3 °C »).
 */
export function heaterText(readout: WaterReadout): string {
  const target = `${formatTenth(readout.target)} °C`;
  return readout.temperature === readout.target
    ? target
    : `${target} · eau ${formatTenth(readout.temperature)} °C`;
}

/**
 * Section « Eau » du panneau « Réglages » (#207 ; sortie du panneau au #697) : ce qui se
 * règle seulement (courant, changement d'eau, chauffage, éclairage et lampe) ; les jauges
 * sont dans le tableau de bord (#256), les produits dans leur section (#762,
 * `products-section.ts`, catégorie « Soins et produits »).
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-water-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './water-section.scss',
  template: `
    <legend class="control-panel__legend control-panel__legend--row">
      <span id="panneau-eau-titre">Eau</span>
      <!-- Courant (#460) : sur la ligne du titre, le panneau ne grandit pas (docs/PIEGES.md). -->
      <button
        type="button"
        class="control-panel__edit"
        data-current
        [attr.data-level]="current()"
        [attr.aria-label]="'Courant : ' + currentLabels[current()] + ', changer de force'"
        (click)="currentToggled.emit()"
      >
        Courant : {{ currentLabels[current()] }}
      </button>
      <button
        type="button"
        class="control-panel__edit"
        data-water-change
        (click)="waterChangeRequested.emit()"
      >
        Changer l’eau
      </button>
    </legend>
    <label class="control-panel__field" for="panneau-chauffage">
      <span class="control-panel__label">
        Chauffage <output class="control-panel__value">{{ heaterLabel() }}</output>
      </span>
      <!-- Bornes en attributs statiques : posées avant la valeur (docs/PIEGES.md). -->
      <input
        id="panneau-chauffage"
        class="control-panel__range"
        aria-label="Consigne du chauffage"
        type="range"
        min="16"
        max="32"
        step="0.5"
        [value]="water().target"
        [attr.aria-valuetext]="heaterLabel()"
        (input)="onHeater($event)"
      />
    </label>
    <!-- Éclairage (#476, lampe #584) : 4 à 14 h par jour ; au-delà de 10 h, les algues
         poussent, sous 8 h les plantes ralentissent. Puis l'heure d'allumage, sur la même
         ligne (le panneau ne grandit pas à 1280 × 720, docs/PIEGES.md) : valeurs courtes à
         l'écran, phrases entières pour les lecteurs d'écran. -->
    <div class="control-panel__row control-panel__row--halves">
      <label class="control-panel__field" for="panneau-eclairage">
        <span class="control-panel__label">
          Éclairage
          <output class="control-panel__value" aria-hidden="true">{{ lighting() }} h</output>
        </span>
        <input
          id="panneau-eclairage"
          class="control-panel__range"
          aria-label="Durée d’éclairage par jour"
          type="range"
          min="4"
          max="14"
          step="1"
          data-lighting
          [value]="lighting()"
          [attr.aria-valuetext]="lightingLabel()"
          (input)="onLighting($event)"
        />
      </label>
      <label class="control-panel__field" for="panneau-lampe">
        <span class="control-panel__label">
          Lampe
          <output class="control-panel__value" aria-hidden="true">{{ lampOnShort() }}</output>
        </span>
        <input
          id="panneau-lampe"
          class="control-panel__range"
          aria-label="Heure d’allumage de la lampe"
          type="range"
          min="0"
          max="23"
          step="1"
          data-lamp-on
          [value]="lampOn()"
          [attr.aria-valuetext]="lampOnLabel()"
          (input)="onLampOn($event)"
        />
      </label>
    </div>
  `,
})
export class WaterSection {
  /** Force du courant du bac (#460). */
  readonly current = input<CurrentLevel>('coupe');
  /** Relevé de l'eau (#207). */
  readonly water = input<WaterReadout>(DEFAULT_WATER_READOUT);
  /** Durée d'éclairage du bac, en heures par jour (#476). */
  readonly lighting = input(DEFAULT_LIGHTING_HOURS);
  /** Heure d'allumage de la lampe (#584). */
  readonly lampOn = input(DEFAULT_LAMP_ON_HOUR);

  /** Force suivante du courant demandée (#460). */
  readonly currentToggled = output<void>();
  /** Bouton « Changer l'eau » (#207). */
  readonly waterChangeRequested = output<void>();
  /** Consigne du chauffage choisie au curseur, en °C (#207). */
  readonly heaterChanged = output<number>();
  /** Durée d'éclairage demandée (#476, #584), en heures entières dans [4, 14]. */
  readonly lightingChanged = output<number>();
  /** Heure d'allumage de la lampe demandée (#584), heure entière dans [0, 23]. */
  readonly lampOnChanged = output<number>();

  protected readonly currentLabels = CURRENT_LEVEL_LABELS;
  protected readonly heaterLabel = computed(() => heaterText(this.water()));
  protected readonly lightingLabel = computed(() => lightingText(this.lighting()));
  protected readonly lampOnLabel = computed(() => lampOnText(this.lampOn()));
  protected readonly lampOnShort = computed(() => formatHour(this.lampOn()));

  protected onHeater(event: Event): void {
    const temperature = sliderHeater((event.target as HTMLInputElement).value);
    if (temperature !== null) {
      this.heaterChanged.emit(temperature);
    }
  }

  protected onLighting(event: Event): void {
    const hours = sliderLighting((event.target as HTMLInputElement).value);
    if (hours !== null) {
      this.lightingChanged.emit(hours);
    }
  }

  protected onLampOn(event: Event): void {
    const hour = sliderLampOn((event.target as HTMLInputElement).value);
    if (hour !== null) {
      this.lampOnChanged.emit(hour);
    }
  }
}
