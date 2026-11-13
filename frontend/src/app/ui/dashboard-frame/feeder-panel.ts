import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { FEEDER_DEFAULT_HOURS, type FeederReadout } from '../../sim/auto-feeder';
import { formatHour } from '../../sim/daylight';

/**
 * Distributeur automatique (#583), dans le calendrier d'entretien déplié : réserve, nombre et
 * heures des rations, remplissage, pose et retrait. Sorti de `DashboardStatus` (#597), qui
 * garde sur l'hôte la classe de mise en page et les attributs de l'ancien groupe.
 */
@Component({
  selector: 'app-feeder-panel',
  template: `@if (feeder(); as f) {
      <span data-feeder [attr.data-feeder-empty]="f.empty"
        >Distributeur : <b>{{ f.stock }} / {{ f.capacity }} rations</b
        >{{ f.empty ? ' (vide)' : '' }}</span
      >
      <label class="feeder__field"
        >Par jour
        <select class="feeder__select" data-feeder-count (change)="onCount($event)">
          @for (n of counts; track n) {
            <option [value]="n" [selected]="n === f.hours.length">{{ n }}</option>
          }
        </select>
      </label>
      @for (hour of f.hours; track $index) {
        <select
          class="feeder__select"
          [attr.data-feeder-hour]="$index"
          [attr.aria-label]="'Heure de la ration ' + ($index + 1)"
          (change)="onHour($index, $event)"
        >
          @for (h of dayHours; track h) {
            <option [value]="h" [selected]="h === hour">{{ hourText(h) }}</option>
          }
        </select>
      }
      <button
        type="button"
        class="feeder__button"
        data-feeder-refill
        aria-label="Remplir le distributeur (14 rations)"
        (click)="refilled.emit()"
      >
        Remplir
      </button>
      <button
        type="button"
        class="feeder__button"
        data-feeder-remove
        aria-label="Retirer le distributeur"
        (click)="changed.emit(null)"
      >
        Retirer
      </button>
    } @else {
      <span data-feeder>Distributeur : aucun</span>
      <button
        type="button"
        class="feeder__button"
        data-feeder-install
        (click)="changed.emit(defaultHours)"
      >
        Poser un distributeur
      </button>
    }`,
  styleUrl: './feeder-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeederPanel {
  /** Distributeur du bac ; `null` : aucun posé. */
  readonly feeder = input<FeederReadout | null>(null);
  /** Pose (heures), change les heures ou retire (`null`) le distributeur. */
  readonly changed = output<readonly number[] | null>();
  /** Bouton « Remplir ». */
  readonly refilled = output<void>();

  /** Choix du nombre de rations par jour. */
  protected readonly counts = [1, 2, 3, 4] as const;
  /** Heures proposées pour une ration. */
  protected readonly dayHours = Array.from({ length: 24 }, (_, h) => h);
  protected readonly defaultHours = FEEDER_DEFAULT_HOURS[1];
  protected readonly hourText = formatHour;

  /** Nombre de rations par jour changé : heures proposées pour ce nombre. */
  protected onCount(event: Event): void {
    const n = Number((event.target as HTMLSelectElement).value);
    if (n === 1 || n === 2 || n === 3 || n === 4) {
      this.changed.emit(FEEDER_DEFAULT_HOURS[n]);
    }
  }

  /** Heure d'une ration changée : deux rations à la même heure n'en font qu'une. */
  protected onHour(index: number, event: Event): void {
    const feeder = this.feeder();
    const hour = Number((event.target as HTMLSelectElement).value);
    if (feeder === null || !Number.isInteger(hour)) {
      return;
    }
    this.changed.emit(feeder.hours.map((h, i) => (i === index ? hour : h)));
  }
}
