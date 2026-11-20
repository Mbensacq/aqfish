import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  DEFAULT_ENVIRONMENT_ID,
  ENVIRONMENT_IDS,
  isPondShapeable,
  type EnvironmentId,
} from '../../sim/environment';
import {
  DEFAULT_POND_SHAPE,
  isPondShape,
  POND_SHAPE_LABELS,
  POND_SHAPES,
  type PondShape,
} from '../../sim/pond-shape';
import { isRoomAvailable } from '../../sim/room';
import { environmentName } from './panel-views';

/**
 * Section « Environnement » du panneau « Réglages » (#87 ; sortie du panneau au #697) : la
 * liste des lieux, puis sur la même ligne la forme du bassin (#190, bassin seulement) ou la
 * case « Afficher la pièce » (#187, bac tropical seulement).
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-environment-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './environment-section.scss',
  template: `
    <legend class="control-panel__legend">Environnement</legend>
    <!-- Pièce autour du bac (#187), bac tropical seulement : après la liste au clavier,
         mais sur la ligne de « Lieu » à l'écran, le panneau ne grandit pas (#101). -->
    <div class="control-panel__field control-panel__field--place">
      <label class="control-panel__label" for="panneau-environnement">Lieu</label>
      <select
        id="panneau-environnement"
        class="control-panel__select"
        aria-label="Environnement"
        (change)="onEnvironment($event)"
      >
        @for (id of environmentIds; track id) {
          <option [value]="id" [selected]="id === environment()">
            {{ environmentName(id) }}
          </option>
        }
      </select>
      <!-- Forme du bassin (#190), bassin seulement : à la place de la pièce, même ligne. -->
      @if (shapeAvailable()) {
        <select
          class="control-panel__select"
          data-pond-shape
          aria-label="Forme du bassin"
          title="Forme du bassin"
          (change)="onPondShape($event)"
        >
          @for (shape of pondShapes; track shape) {
            <option [value]="shape" [selected]="shape === pondShape()">
              {{ pondShapeLabels[shape] }}
            </option>
          }
        </select>
      }
      @if (roomAvailable()) {
        <label class="control-panel__check control-panel__check--inline" data-room>
          <input type="checkbox" [checked]="roomShown()" (change)="onRoom($event)" />
          Afficher la pièce
        </label>
      }
    </div>
  `,
})
export class EnvironmentSection {
  /** Environnement affiché. */
  readonly environment = input<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  /** Forme du bassin du monde courant (#190). */
  readonly pondShape = input<PondShape>(DEFAULT_POND_SHAPE);
  /** Pièce autour du bac affichée (#187). */
  readonly roomShown = input(false);

  /** Environnement choisi dans la liste. */
  readonly environmentChanged = output<EnvironmentId>();
  /** Forme du bassin choisie (#190). */
  readonly pondShapeChanged = output<PondShape>();
  /** Case « Afficher la pièce » (#187). */
  readonly roomShownChanged = output<boolean>();

  protected readonly environmentIds = ENVIRONMENT_IDS;
  protected readonly environmentName = environmentName;
  protected readonly pondShapes = POND_SHAPES;
  protected readonly pondShapeLabels = POND_SHAPE_LABELS;
  /** Forme du bassin réglable (#190) : le bassin seulement. */
  protected readonly shapeAvailable = computed(() => isPondShapeable(this.environment()));
  /** Case « Afficher la pièce » proposée seulement autour du bac tropical (#187). */
  protected readonly roomAvailable = computed(() => isRoomAvailable(this.environment()));

  protected onEnvironment(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if ((ENVIRONMENT_IDS as readonly string[]).includes(id) && id !== this.environment()) {
      this.environmentChanged.emit(id as EnvironmentId);
    }
  }

  protected onPondShape(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (isPondShape(value)) {
      this.pondShapeChanged.emit(value);
    }
  }

  protected onRoom(event: Event): void {
    this.roomShownChanged.emit((event.target as HTMLInputElement).checked);
  }
}
