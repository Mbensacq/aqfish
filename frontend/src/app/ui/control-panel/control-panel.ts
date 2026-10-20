import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { formatHour, HOUR_SLIDER_STEP, HOURS_PER_DAY, NOON_HOUR } from '../../sim/daylight';
import { SPECIES_IDS, type PopulationCounts } from '../../sim/population';
import { DEFAULT_SIM_SPEED, SIM_SPEEDS, type SimSpeed } from '../../sim/sim-speed';
import { SPECIES, type SpeciesId } from '../../sim/species';

/** Identifiant de la région du panneau (cible de `aria-controls`). */
export const CONTROL_PANEL_ID = 'panneau-controle';

/**
 * Libellé d'une vitesse de simulation, en français : « Pause » à 0, sinon « ×0,5 », « ×1 »,
 * « ×2 », « ×4 » (virgule décimale).
 */
export function speedLabel(speed: number): string {
  return speed === 0 ? 'Pause' : `×${String(speed).replace('.', ',')}`;
}

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
  const i = toNumber(index);
  return Number.isInteger(i) && i >= 0 && i < SIM_SPEEDS.length ? SIM_SPEEDS[i] : null;
}

/** Heure lue sur le curseur d'heure (une chaîne), `null` si elle n'est pas dans [0, 24). */
export function sliderHour(value: string | number): number | null {
  const hour = toNumber(value);
  return Number.isFinite(hour) && hour >= 0 && hour < HOURS_PER_DAY ? hour : null;
}

/**
 * Effectif lu dans le champ numérique d'une espèce (une chaîne) : arrondi à l'entier le plus
 * proche et ramené dans [0, max] ; `null` pour une valeur vide ou non numérique.
 */
export function populationInput(value: string | number, max: number): number | null {
  const count = toNumber(value);
  if (!Number.isFinite(count)) {
    return null;
  }
  return Math.min(Math.max(Math.round(count), 0), Math.max(0, max));
}

/** Demande de réglage d'effectif émise par le panneau (#69). */
export interface PopulationRequest {
  readonly species: SpeciesId;
  readonly count: number;
}

/** Nom d'une espèce au pluriel, en minuscules (« néons », « guppys », « corydoras »). */
export function speciesPlural(species: SpeciesId): string {
  return `${SPECIES[species].name.toLowerCase()}s`;
}

const NO_FISH: PopulationCounts = { neon: 0, guppy: 0, corydora: 0 };

/** Nombre lu dans une valeur de formulaire ; une chaîne vide donne `NaN` (et non 0). */
function toNumber(value: string | number): number {
  return typeof value === 'string' && value.trim() === '' ? Number.NaN : Number(value);
}

/**
 * Panneau de contrôle repliable (issue #52, docs/DA.md, « Interface ») : vitesse de la
 * simulation, heure de la journée, affichage du décor et population par espèce (#69). Fermé par défaut, en haut à gauche
 * à côté de l'indicateur du moment de la journée, loin de la barre des préréglages (en bas).
 *
 * Le panneau ne contient aucune logique de simulation : il affiche l'état que l'hôte lui
 * fournit (entrées) et émet les demandes de l'utilisateur (sorties), comme la barre des
 * vues. Il est découpé en sections (`fieldset`) : l'environnement (#70) viendra s'y ajouter.
 *
 * Population : par espèce, un champ numérique (entier de 0 au maximum fourni par l'hôte,
 * validé à Entrée ou en quittant le champ, réglable aux flèches) entre deux boutons « − » et
 * « + ». À une borne, le bouton reste focalisable (`aria-disabled`) et sans effet.
 *
 * Clavier : bouton « Réglages » (Entrée ou Espace), puis Tab d'un contrôle à l'autre ; les
 * curseurs se règlent aux flèches. Les raccourcis de la barre des vues sont ignorés tant
 * que le focus est dans un curseur ou une case (`isTypingContext`).
 * Absent en mode capture (c'est l'application qui ne l'affiche pas).
 */
@Component({
  selector: 'app-control-panel',
  template: `<button
      type="button"
      class="control-panel__toggle"
      [class.control-panel__toggle--open]="open()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="panelId"
      (click)="toggle()"
    >
      Réglages
    </button>
    @if (open()) {
      <section class="control-panel" [id]="panelId" aria-label="Réglages de l’aquarium">
        <fieldset class="control-panel__section" data-section="simulation">
          <legend class="control-panel__legend">Simulation</legend>
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
        </fieldset>

        <fieldset class="control-panel__section" data-section="journee">
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
          <label class="control-panel__check">
            <input type="checkbox" [checked]="clockRunning()" (change)="onClockRunning($event)" />
            Heure automatique
          </label>
        </fieldset>

        <fieldset class="control-panel__section" data-section="decor">
          <legend class="control-panel__legend">Décor</legend>
          <label class="control-panel__check">
            <input type="checkbox" [checked]="decorVisible()" (change)="onDecor($event)" />
            Afficher le décor
          </label>
        </fieldset>

        <fieldset class="control-panel__section" data-section="population">
          <legend class="control-panel__legend">Population</legend>
          @for (id of speciesIds; track id) {
            <div class="control-panel__count" [attr.data-species]="id">
              <label class="control-panel__count-label" [for]="'panneau-population-' + id">
                {{ speciesName(id) }}
              </label>
              <button
                type="button"
                class="control-panel__step"
                [attr.aria-label]="'Retirer un ' + speciesName(id).toLowerCase()"
                [attr.aria-disabled]="population()[id] <= 0"
                (click)="step(id, -1)"
              >
                −
              </button>
              <input
                class="control-panel__number"
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                [id]="'panneau-population-' + id"
                [attr.aria-label]="'Nombre de ' + plural(id)"
                [attr.max]="populationMax()[id]"
                [value]="population()[id]"
                (change)="onCount(id, $event)"
              />
              <button
                type="button"
                class="control-panel__step"
                [attr.aria-label]="'Ajouter un ' + speciesName(id).toLowerCase()"
                [attr.aria-disabled]="population()[id] >= populationMax()[id]"
                (click)="step(id, 1)"
              >
                +
              </button>
            </div>
          }
        </fieldset>
      </section>
    }`,
  styleUrl: './control-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlPanel {
  /** Vitesse de simulation courante (fournie par l'hôte). */
  readonly speed = input<number>(DEFAULT_SIM_SPEED);
  /** Heure affichée, au quart d'heure (fournie par l'hôte). */
  readonly hour = input<number>(NOON_HOUR);
  /** Vrai si l'heure avance d'elle-même (fournie par l'hôte). */
  readonly clockRunning = input(true);
  /** Vrai si le décor est affiché (fourni par l'hôte). */
  readonly decorVisible = input(true);
  /** Effectif de chaque espèce (fourni par l'hôte). */
  readonly population = input<PopulationCounts>(NO_FISH);
  /** Effectif maximal de chaque espèce, compte tenu des autres (fourni par l'hôte). */
  readonly populationMax = input<PopulationCounts>(NO_FISH);

  /** Vitesse choisie au curseur. */
  readonly speedChanged = output<SimSpeed>();
  /** Heure choisie au curseur (l'hôte fige l'horloge à cette heure). */
  readonly hourChanged = output<number>();
  /** Case « Heure automatique » : `true` pour remettre l'heure en marche, `false` pour la figer. */
  readonly clockRunningChanged = output<boolean>();
  /** Case « Afficher le décor ». */
  readonly decorVisibleChanged = output<boolean>();
  /** Effectif demandé pour une espèce (déjà borné à [0, maximum]). */
  readonly populationChanged = output<PopulationRequest>();

  /** Panneau déplié (fermé par défaut : captures et premier regard inchangés). */
  readonly open = signal(false);

  protected readonly panelId = CONTROL_PANEL_ID;
  protected readonly speeds = SIM_SPEEDS;
  protected readonly speciesIds = SPECIES_IDS;
  protected readonly hourStep = HOUR_SLIDER_STEP;
  /** Dernier cran du curseur d'heure : 23:45 (24:00 serait minuit, déjà au cran 0). */
  protected readonly maxHour = HOURS_PER_DAY - HOUR_SLIDER_STEP;

  protected readonly speedIndex = computed(() => speedIndex(this.speed()));
  protected readonly speedText = computed(() => speedLabel(this.speed()));
  protected readonly hourText = computed(() => formatHour(this.hour()));

  toggle(): void {
    this.open.update((open) => !open);
  }

  protected onSpeed(event: Event): void {
    const speed = speedAt((event.target as HTMLInputElement).value);
    if (speed !== null) {
      this.speedChanged.emit(speed);
    }
  }

  protected onHour(event: Event): void {
    const hour = sliderHour((event.target as HTMLInputElement).value);
    if (hour !== null) {
      this.hourChanged.emit(hour);
    }
  }

  protected onClockRunning(event: Event): void {
    this.clockRunningChanged.emit((event.target as HTMLInputElement).checked);
  }

  protected onDecor(event: Event): void {
    this.decorVisibleChanged.emit((event.target as HTMLInputElement).checked);
  }

  protected speciesName(id: SpeciesId): string {
    return SPECIES[id].name;
  }

  protected plural(id: SpeciesId): string {
    return speciesPlural(id);
  }

  /** Bouton « − » ou « + » : sans effet à la borne. */
  protected step(id: SpeciesId, delta: -1 | 1): void {
    const count = this.population()[id] + delta;
    if (count >= 0 && count <= this.populationMax()[id]) {
      this.populationChanged.emit({ species: id, count });
    }
  }

  /**
   * Champ numérique validé : l'effectif lu (borné) est réécrit dans le champ, pour qu'une
   * saisie hors bornes ou invalide n'y reste pas si l'effectif ne change pas.
   */
  protected onCount(id: SpeciesId, event: Event): void {
    const field = event.target as HTMLInputElement;
    const count = populationInput(field.value, this.populationMax()[id]);
    const current = this.population()[id];
    field.value = String(count ?? current);
    if (count !== null && count !== current) {
      this.populationChanged.emit({ species: id, count });
    }
  }
}
