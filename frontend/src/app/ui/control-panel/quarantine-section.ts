import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { CareMode } from '../../sim/care-mode';
import { DEFAULT_ENVIRONMENT_ID, type EnvironmentId } from '../../sim/environment';
import {
  EMPTY_QUARANTINE,
  QUARANTINE_DURATION_TEXT,
  type QuarantineView,
} from '../../sim/quarantine';
import type { SpeciesId } from '../../sim/species';
import { TREATMENT_KINDS, TREATMENTS, type TreatmentKind } from '../../sim/treatment';
import { panelCatalog, treatmentTitle } from './panel-views';

/**
 * Groupe « Quarantaine » de la section « Bacs » (#547, #553 ; sorti de la section au #697) :
 * choix du bac de quarantaine posé, ses trois gestes de soin, l'amorce de bactéries de son
 * filtre neuf, le retour d'un animal au bac affiché et la durée conseillée.
 *
 * L'hôte est le `div` du groupe, posé par la section « Bacs » avec ses attributs (`role`,
 * `aria-label`, `data-quarantine`) : le DOM ne change pas (ADR 0161).
 */
@Component({
  // Sélecteur d'attribut : le groupe reste l'enfant direct de la section (ADR 0161).
  selector: 'div[app-quarantine-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './quarantine-section.scss',
  template: `
    @if (quarantineChoice(); as chosen) {
      <label class="control-panel__field">
        <span class="control-panel__label">Bac de quarantaine</span>
        <select
          class="control-panel__select"
          data-quarantine-tank
          (change)="quarantineTarget.set(+$any($event.target).value)"
        >
          @for (tank of quarantine().tanks; track tank.id) {
            <option [value]="tank.id" [selected]="tank.id === chosen.id">
              {{ tank.name
              }}{{
                tank.sick > 0 ? ' (' + tank.sick + ' malade' + (tank.sick > 1 ? 's' : '') + ')' : ''
              }}
            </option>
          }
        </select>
      </label>
      <div class="control-panel__row" role="group" aria-label="Soigner la quarantaine">
        @for (kind of treatmentKinds; track kind) {
          <button
            type="button"
            class="control-panel__button control-panel__button--compact"
            [attr.data-quarantine-treatment]="kind"
            [attr.aria-label]="'Quarantaine : ' + treatments[kind].aria"
            [attr.title]="treatmentTitle(kind)"
            (click)="quarantineTreated.emit({ id: chosen.id, kind })"
          >
            {{ treatments[kind].button }}
          </button>
        }
      </div>
      @if (chosen.filter !== null) {
        <!-- Filtre neuf du bac posé (#553, #538) : l'amorce de bactéries s'y verse
             d'ici, le bac posé n'étant pas sélectionnable (ADR 0075). Une ligne, tant
             que le filtre n'est pas mûr. -->
        <div class="control-panel__row" role="group" aria-label="Filtre de la quarantaine">
          <button
            type="button"
            class="control-panel__button control-panel__button--compact"
            data-quarantine-starter
            [attr.aria-label]="
              chosen.name + ' : verser une dose d’amorce de bactéries nitrifiantes'
            "
            title="Source : docs/SOINS.md § 1.1 (étiquette Stability, secondaire) ; gain du filtre : approximation de jeu."
            (click)="quarantineStarter.emit(chosen.id)"
          >
            Bactéries
          </button>
          <span class="control-panel__note" data-quarantine-filter>
            Filtre neuf : efficace à {{ chosen.filter }} %
          </span>
        </div>
      }
      @if (chosen.species.length > 0) {
        <label class="control-panel__field">
          <span class="control-panel__label">Animal à ramener</span>
          <select
            class="control-panel__select"
            data-quarantine-species
            (change)="quarantineSpecies.set($any($event.target).value)"
          >
            @for (id of chosen.species; track id) {
              <option [value]="id" [selected]="id === quarantineSpeciesChoice()">
                {{ speciesName(id) }}
              </option>
            }
          </select>
        </label>
        <button
          type="button"
          class="control-panel__button"
          data-quarantine-return
          (click)="onQuarantineReturn(chosen.id)"
        >
          Ramener au bac affiché
        </button>
      }
    }
    <p class="control-panel__note" data-quarantine-duration>{{ quarantineDuration }}</p>
  `,
})
export class QuarantineSection {
  /** Environnement du bac affiché : noms des espèces à ramener. */
  readonly environment = input<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  /** Mode du bac affiché (#278) : catalogue des noms. */
  readonly careMode = input<CareMode>('soins');
  /** Bacs de quarantaine posés, leurs espèces et leurs malades (#547). */
  readonly quarantine = input<QuarantineView>(EMPTY_QUARANTINE);

  /** Un geste de soin dans le bac de quarantaine `id` seul (#547). */
  readonly quarantineTreated = output<{ readonly id: number; readonly kind: TreatmentKind }>();
  /** Dose d'amorce de bactéries dans le bac posé choisi (#553). */
  readonly quarantineStarter = output<number>();
  /** « Ramener au bac affiché » (#547) : bac de quarantaine et espèce. */
  readonly quarantineReturned = output<{ readonly fromId: number; readonly species: SpeciesId }>();

  protected readonly treatmentKinds = TREATMENT_KINDS;
  protected readonly treatments = TREATMENTS;
  protected readonly treatmentTitle = treatmentTitle;
  protected readonly quarantineDuration = QUARANTINE_DURATION_TEXT;

  /** Catalogue des espèces du bac affiché : noms de la liste « Animal à ramener ». */
  private readonly catalog = computed(() => panelCatalog(this.environment(), this.careMode()));
  protected readonly quarantineTarget = signal<number | null>(null);
  protected readonly quarantineSpecies = signal<string | null>(null);
  /** Bac de quarantaine choisi : le dernier choix s'il existe encore, sinon le dernier posé. */
  protected readonly quarantineChoice = computed(() => {
    const tanks = this.quarantine().tanks;
    const wanted = this.quarantineTarget();
    return tanks.find((tank) => tank.id === wanted) ?? tanks[tanks.length - 1] ?? null;
  });
  protected readonly quarantineSpeciesChoice = computed(() => {
    const list = this.quarantineChoice()?.species ?? [];
    const wanted = this.quarantineSpecies();
    return list.find((id) => id === wanted) ?? list[0] ?? null;
  });

  protected onQuarantineReturn(fromId: number): void {
    const species = this.quarantineSpeciesChoice();
    if (species !== null) {
      this.quarantineReturned.emit({ fromId, species });
    }
  }

  /** Nom d'espèce du catalogue de l'environnement affiché. */
  protected speciesName(id: SpeciesId): string {
    return this.catalog().find((entry) => entry.species === id)?.name ?? id;
  }
}
