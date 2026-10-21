import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import {
  DEFAULT_ENVIRONMENT_ID,
  ENVIRONMENT_IDS,
  ENVIRONMENTS,
  environmentById,
  type EnvironmentId,
} from '../../sim/environment';
import { formatHour, HOUR_SLIDER_STEP, HOURS_PER_DAY, NOON_HOUR } from '../../sim/daylight';
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import type { SaveMessage, SaveStatus } from '../../core/save-storage/save-storage';
import { DEFAULT_FOOD_STYLE, type FoodStyle } from '../../core/food-style/food-style';
import { MAX_SAVE_LENGTH } from '../../sim/save';
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

/** Texte de l'état de la sauvegarde automatique (#70). */
export function saveStatusText(status: SaveStatus | null): string {
  switch (status) {
    case 'active':
      return 'Enregistré automatiquement dans ce navigateur.';
    case 'plein':
      return 'Stockage du navigateur plein : aquarium non enregistré.';
    case 'indisponible':
      return 'Stockage du navigateur indisponible : aquarium non enregistré.';
    default:
      return 'Sauvegarde automatique désactivée.';
  }
}

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
 * vues. Il est découpé en sections (`fieldset`), la première étant l'environnement (#87 :
 * bac tropical ou bassin, liste déroulante).
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
        <fieldset class="control-panel__section" data-section="environnement">
          <legend class="control-panel__legend">Environnement</legend>
          <label class="control-panel__field" for="panneau-environnement">
            <span class="control-panel__label">Lieu</span>
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
          </label>
        </fieldset>

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
        </fieldset>

        <fieldset class="control-panel__section" data-section="decor">
          <legend class="control-panel__legend">Décor</legend>
          <!-- Granulés (#117) : sur la même ligne, le panneau tient sans défiler à 1280 × 720 (#101). -->
          <div class="control-panel__row">
            <label class="control-panel__check">
              <input type="checkbox" [checked]="decorVisible()" (change)="onDecor($event)" />
              Afficher le décor
            </label>
            <button
              type="button"
              class="control-panel__button control-panel__button--compact"
              data-food-style
              [attr.aria-label]="'Granulés : ' + foodStyle() + ', changer de rendu'"
              (click)="foodStyleToggled.emit()"
            >
              Granulés : {{ foodStyle() }}
            </button>
          </div>
        </fieldset>

        <fieldset class="control-panel__section" data-section="population">
          <legend class="control-panel__legend">Population</legend>
          @for (id of speciesIds(); track id) {
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

        <fieldset class="control-panel__section" data-section="sauvegarde">
          <legend class="control-panel__legend">Sauvegarde</legend>
          <p class="control-panel__note" data-save-status>{{ statusText() }}</p>
          <div class="control-panel__buttons">
            <button type="button" class="control-panel__button" (click)="exportRequested.emit()">
              Exporter
            </button>
            <button type="button" class="control-panel__button" (click)="fileInput.click()">
              Importer
            </button>
            <input
              #fileInput
              class="control-panel__file"
              type="file"
              accept="application/json,.json"
              tabindex="-1"
              aria-label="Fichier de sauvegarde à importer"
              (change)="onFile($event)"
            />
          </div>
          @if (saveMessage(); as message) {
            <p
              class="control-panel__message"
              [class.control-panel__message--error]="message.kind === 'erreur'"
              [attr.role]="message.kind === 'erreur' ? 'alert' : 'status'"
              data-save-message
            >
              {{ message.text }}
            </p>
          }
        </fieldset>
      </section>
    }`,
  styleUrl: './control-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlPanel {
  /** Environnement affiché (fourni par l'hôte). */
  readonly environment = input<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  /** Vitesse de simulation courante (fournie par l'hôte). */
  readonly speed = input<number>(DEFAULT_SIM_SPEED);
  /** Heure affichée, au quart d'heure (fournie par l'hôte). */
  readonly hour = input<number>(NOON_HOUR);
  /** Vrai si l'heure avance d'elle-même (fournie par l'hôte). */
  readonly clockRunning = input(true);
  /** Vrai si le décor est affiché (fourni par l'hôte). */
  readonly decorVisible = input(true);
  /** Vrai s'il pleut (fourni par l'hôte, #106). */
  readonly rain = input(false);
  /** Rendu des granulés, `points` ou `voxels` (fourni par l'hôte, #117). */
  readonly foodStyle = input<FoodStyle>(DEFAULT_FOOD_STYLE);
  /** Effectif de chaque espèce (fourni par l'hôte). */
  readonly population = input<PopulationCounts>(NO_FISH);
  /** Effectif maximal de chaque espèce, compte tenu des autres (fourni par l'hôte). */
  readonly populationMax = input<PopulationCounts>(NO_FISH);
  /** État de la sauvegarde automatique (fourni par l'hôte, #70). */
  readonly saveStatus = input<SaveStatus | null>(null);
  /** Dernier message de la sauvegarde : import refusé, import réussi… (fourni par l'hôte). */
  readonly saveMessage = input<SaveMessage | null>(null);

  /** Environnement choisi dans la liste. */
  readonly environmentChanged = output<EnvironmentId>();
  /** Vitesse choisie au curseur. */
  readonly speedChanged = output<SimSpeed>();
  /** Heure choisie au curseur (l'hôte fige l'horloge à cette heure). */
  readonly hourChanged = output<number>();
  /** Case « Heure automatique » : `true` pour remettre l'heure en marche, `false` pour la figer. */
  readonly clockRunningChanged = output<boolean>();
  /** Case « Afficher le décor ». */
  readonly decorVisibleChanged = output<boolean>();
  /** Case « Pluie » (#106) : `true` pour faire pleuvoir, `false` pour arrêter. */
  readonly rainChanged = output<boolean>();
  /** Bouton « Granulés » : passer à l'autre rendu (#117). */
  readonly foodStyleToggled = output<void>();
  /** Effectif demandé pour une espèce (déjà borné à [0, maximum]). */
  readonly populationChanged = output<PopulationRequest>();
  /** Bouton « Exporter » (#70). */
  readonly exportRequested = output<void>();
  /** Contenu du fichier choisi avec « Importer » (texte, pas encore validé ; #70). */
  readonly importRequested = output<string>();
  /** Fichier choisi refusé avant lecture (trop gros, illisible) : raison, en français. */
  readonly importRejected = output<string>();

  /** Panneau déplié (fermé par défaut : captures et premier regard inchangés). */
  readonly open = signal(false);

  protected readonly panelId = CONTROL_PANEL_ID;
  protected readonly speeds = SIM_SPEEDS;
  /** Espèces de l'environnement affiché (#88), dans l'ordre de `Environment.species`. */
  protected readonly speciesIds = computed(() => environmentById(this.environment()).species);
  protected readonly environmentIds = ENVIRONMENT_IDS;
  /** Case « Pluie » proposée seulement là où il peut pleuvoir (le bassin, #106). */
  protected readonly rainAvailable = computed(() => environmentById(this.environment()).rain);
  protected readonly hourStep = HOUR_SLIDER_STEP;
  /** Dernier cran du curseur d'heure : 23:45 (24:00 serait minuit, déjà au cran 0). */
  protected readonly maxHour = HOURS_PER_DAY - HOUR_SLIDER_STEP;

  protected readonly speedIndex = computed(() => speedIndex(this.speed()));
  protected readonly speedText = computed(() => speedLabel(this.speed()));
  protected readonly hourText = computed(() => formatHour(this.hour()));
  protected readonly statusText = computed(() => saveStatusText(this.saveStatus()));

  /**
   * Fichier choisi avec « Importer » : refusé avant lecture s'il dépasse `MAX_SAVE_LENGTH`
   * octets, sinon lu en texte et transmis à l'hôte (qui le valide). Le champ est vidé pour
   * qu'un même fichier puisse être choisi de nouveau.
   */
  protected async onFile(event: Event): Promise<void> {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    field.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_SAVE_LENGTH) {
      this.importRejected.emit(
        `fichier trop volumineux (${Math.ceil(file.size / 1024)} Kio, ${MAX_SAVE_LENGTH / 1024} Kio au plus)`,
      );
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      this.importRejected.emit('fichier illisible');
      return;
    }
    this.importRequested.emit(text);
  }

  toggle(): void {
    this.open.update((open) => !open);
  }

  protected environmentName(id: EnvironmentId): string {
    return ENVIRONMENTS[id].name;
  }

  protected onEnvironment(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if ((ENVIRONMENT_IDS as readonly string[]).includes(id) && id !== this.environment()) {
      this.environmentChanged.emit(id as EnvironmentId);
    }
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

  protected onRain(event: Event): void {
    this.rainChanged.emit((event.target as HTMLInputElement).checked);
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
