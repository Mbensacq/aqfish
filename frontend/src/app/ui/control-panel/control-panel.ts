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
import { isRoomAvailable } from '../../sim/room';
import { MAX_SAVE_LENGTH } from '../../sim/save';
import { DEFAULT_SIM_SPEED, SIM_SPEEDS, type SimSpeed } from '../../sim/sim-speed';
import { SPECIES_LABELS, speciesCatalog } from '../../sim/species-catalog';
import { type SpeciesId } from '../../sim/species';

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

/**
 * Nom d'une espèce au pluriel, en minuscules (« néons », « poissons-clowns », « chirurgiens
 * bleus ») : porté par le catalogue (`SPECIES_LABELS`, #95), pas deviné.
 */
export function speciesPlural(species: SpeciesId): string {
  return SPECIES_LABELS[species].plural;
}

/**
 * Nom accessible des boutons « − » et « + » : « Retirer un néon », « Ajouter une grenouille »
 * (genre porté par le catalogue, #95).
 */
export function speciesStepLabel(species: SpeciesId, delta: -1 | 1): string {
  const { singular, feminine } = SPECIES_LABELS[species];
  return `${delta < 0 ? 'Retirer' : 'Ajouter'} ${feminine ? 'une' : 'un'} ${singular}`;
}

/**
 * Nom accessible du champ d'effectif : « Nombre de néons », « Nombre d’axolotls » (élision
 * devant une voyelle, #130).
 */
export function speciesCountLabel(species: SpeciesId): string {
  const plural = speciesPlural(species);
  return /^[aeiouyàâéèêëîïôûù]/.test(plural) ? `Nombre d’${plural}` : `Nombre de ${plural}`;
}

/**
 * Nom accessible du curseur d'effectif (#189), distinct de celui du champ : « Curseur du
 * nombre de néons », « Curseur du nombre d’axolotls ».
 */
export function speciesSliderLabel(species: SpeciesId): string {
  return `Curseur du ${speciesCountLabel(species).replace(/^Nombre/, 'nombre')}`;
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
 * Population (catalogue d'espèces, #189) : par espèce, le nom sur sa ligne, puis « − », un
 * curseur (échelle de 0 au maximum de l'espèce, valeur ramenée au maximum fourni par l'hôte
 * et réécrite), un champ numérique (entier de 0 à ce maximum, validé à Entrée ou en quittant
 * le champ, réglable aux flèches) et « + ». À une borne, le bouton reste
 * focalisable (`aria-disabled`) et sans effet. Libellés tirés du catalogue (`SPECIES_LABELS`).
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
            @if (roomAvailable()) {
              <label class="control-panel__check control-panel__check--inline" data-room>
                <input type="checkbox" [checked]="roomShown()" (change)="onRoom($event)" />
                Afficher la pièce
              </label>
            }
          </div>
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

        <fieldset
          class="control-panel__section"
          data-section="decor"
          aria-labelledby="panneau-decor-titre"
        >
          <!-- Éditeur (#167) : sur la ligne du titre, le panneau ne grandit pas (#101). -->
          <legend class="control-panel__legend control-panel__legend--row">
            <span id="panneau-decor-titre">Décor</span>
            <button
              type="button"
              class="control-panel__edit"
              data-decor-edit
              [attr.aria-disabled]="!decorEditable()"
              [attr.aria-label]="
                decorEditable() ? 'Éditer le décor' : 'Éditer le décor (bac tropical seulement)'
              "
              [attr.title]="decorEditable() ? null : 'Bac tropical seulement'"
              (click)="onEdit()"
            >
              Éditer le décor
            </button>
          </legend>
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
          @for (entry of catalog(); track entry.species) {
            @let id = entry.species;
            <div class="control-panel__count" [attr.data-species]="id">
              <label
                class="control-panel__count-label"
                [for]="'panneau-population-' + id"
                [attr.title]="entry.scientificName"
              >
                {{ entry.name }}
              </label>
              <button
                type="button"
                class="control-panel__step"
                [attr.aria-label]="stepLabel(id, -1)"
                [attr.aria-disabled]="population()[id] <= 0"
                (click)="step(id, -1)"
              >
                −
              </button>
              <!-- Curseur d'effectif (#189), entre « − » et le champ : échelle fixe de 0 au
                   maximum de l'espèce ; la valeur est ramenée à la place restante (maximum
                   fourni par l'hôte). -->
              <input
                class="control-panel__range control-panel__count-range"
                type="range"
                min="0"
                step="1"
                [attr.max]="entry.maxCount"
                [value]="population()[id]"
                [attr.aria-label]="slideLabel(id)"
                [attr.aria-valuetext]="population()[id] + ' ' + entry.labels.plural"
                [attr.data-count-slider]="id"
                (input)="onCount(id, $event)"
              />
              <input
                class="control-panel__number"
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                [id]="'panneau-population-' + id"
                [attr.aria-label]="countLabel(id)"
                [attr.max]="populationMax()[id]"
                [value]="population()[id]"
                (change)="onCount(id, $event)"
              />
              <button
                type="button"
                class="control-panel__step"
                [attr.aria-label]="stepLabel(id, 1)"
                [attr.aria-disabled]="population()[id] >= populationMax()[id]"
                (click)="step(id, 1)"
              >
                +
              </button>
            </div>
          } @empty {
            <p class="control-panel__note" data-population-empty>Aucune espèce pour l’instant.</p>
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
  /** Vrai si le décor de l'environnement est modifiable (fourni par l'hôte, #167). */
  readonly decorEditable = input(false);
  /** Rendu des granulés, `points` ou `voxels` (fourni par l'hôte, #117). */
  readonly foodStyle = input<FoodStyle>(DEFAULT_FOOD_STYLE);
  /** Vrai si la pièce autour du bac est affichée (fourni par l'hôte, #187). */
  readonly roomShown = input(false);
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
  /** Bouton « Éditer le décor » (#167), seulement si le décor est modifiable. */
  readonly editRequested = output<void>();
  /** Case « Pluie » (#106) : `true` pour faire pleuvoir, `false` pour arrêter. */
  readonly rainChanged = output<boolean>();
  /** Case « Afficher la pièce » (#187). */
  readonly roomShownChanged = output<boolean>();
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
  /** Déplié par l'utilisateur, pour replier un panneau voisin sur petit écran (#136). */
  readonly opened = output<void>();

  /** Panneau déplié (fermé par défaut : captures et premier regard inchangés). */
  readonly open = signal(false);

  protected readonly panelId = CONTROL_PANEL_ID;
  protected readonly speeds = SIM_SPEEDS;
  /**
   * Catalogue des espèces de l'environnement affiché (#88, #189), dans l'ordre de
   * `Environment.species`.
   */
  protected readonly catalog = computed(() => speciesCatalog(this.environment()));
  protected readonly environmentIds = ENVIRONMENT_IDS;
  /** Case « Pluie » proposée seulement là où il peut pleuvoir (le bassin, #106). */
  protected readonly rainAvailable = computed(() => environmentById(this.environment()).rain);
  /** Case « Afficher la pièce » proposée seulement autour du bac tropical (#187). */
  protected readonly roomAvailable = computed(() => isRoomAvailable(this.environment()));
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
    const open = !this.open();
    this.open.set(open);
    if (open) {
      this.opened.emit();
    }
  }

  /** Replie le panneau pour laisser la place à un autre (#136). */
  close(): void {
    this.open.set(false);
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

  protected onRoom(event: Event): void {
    this.roomShownChanged.emit((event.target as HTMLInputElement).checked);
  }

  protected onEdit(): void {
    if (this.decorEditable()) {
      this.editRequested.emit();
    }
  }

  protected onDecor(event: Event): void {
    this.decorVisibleChanged.emit((event.target as HTMLInputElement).checked);
  }

  protected countLabel(id: SpeciesId): string {
    return speciesCountLabel(id);
  }

  protected stepLabel(id: SpeciesId, delta: -1 | 1): string {
    return speciesStepLabel(id, delta);
  }

  protected slideLabel(id: SpeciesId): string {
    return speciesSliderLabel(id);
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
