import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DEFAULT_SIM_SPEED, SIM_SPEEDS, speedLabel, type SimSpeed } from '../../sim/sim-speed';
import { formNumber } from './panel-views';

/**
 * Rang d'une vitesse dans `SIM_SPEEDS` (valeur du curseur), celui de la vitesse par défaut
 * pour une valeur inconnue.
 */
export function speedIndex(speed: number): number {
  const index = (SIM_SPEEDS as readonly number[]).indexOf(speed);
  return index >= 0 ? index : SIM_SPEEDS.indexOf(DEFAULT_SIM_SPEED);
}

/**
 * Vitesse au rang `index` du curseur (valeur de l'élément `input`, donc une chaîne), `null`
 * si le rang n'existe pas.
 */
export function speedAt(index: string | number): SimSpeed | null {
  const i = formNumber(index);
  return Number.isInteger(i) && i >= 0 && i < SIM_SPEEDS.length ? SIM_SPEEDS[i] : null;
}

/**
 * Section « Simulation » du panneau « Réglages » (#52 ; sortie du panneau au #697) : « Mode
 * immersif » sur la ligne du titre (#345), puis le curseur de vitesse.
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-simulation-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './simulation-section.scss',
  template: `
    <!-- Mode immersif (#345) : sur la ligne du titre, le panneau ne grandit pas (#101). -->
    <legend class="control-panel__legend control-panel__legend--row">
      <span id="panneau-simulation-titre">Simulation</span>
      <button
        type="button"
        class="control-panel__edit"
        data-immersive-open
        (click)="immersiveRequested.emit()"
      >
        Mode immersif
      </button>
    </legend>
    <label class="control-panel__field" for="panneau-vitesse">
      <span class="control-panel__label">
        Vitesse <output class="control-panel__value">{{ speedText() }}</output>
      </span>
      <input
        id="panneau-vitesse"
        class="control-panel__range"
        aria-label="Vitesse de la simulation"
        type="range"
        min="0"
        [attr.max]="speeds.length - 1"
        step="1"
        [value]="speedIndex()"
        [attr.aria-valuetext]="speedText()"
        (input)="onSpeed($event)"
      />
    </label>
  `,
})
export class SimulationSection {
  /** Vitesse de simulation courante. */
  readonly speed = input<number>(DEFAULT_SIM_SPEED);

  /** Vitesse choisie au curseur. */
  readonly speedChanged = output<SimSpeed>();
  /** « Mode immersif » (#345). */
  readonly immersiveRequested = output<void>();

  protected readonly speeds = SIM_SPEEDS;
  protected readonly speedIndex = computed(() => speedIndex(this.speed()));
  protected readonly speedText = computed(() => speedLabel(this.speed()));

  protected onSpeed(event: Event): void {
    const speed = speedAt((event.target as HTMLInputElement).value);
    if (speed !== null) {
      this.speedChanged.emit(speed);
    }
  }
}
