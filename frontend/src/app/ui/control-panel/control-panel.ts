import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';

import {
  DEFAULT_ENVIRONMENT_ID,
  ENVIRONMENT_IDS,
  ENVIRONMENTS,
  environmentById,
  type EnvironmentId,
} from '../../sim/environment';
import { MAX_CATAPPA_LEAVES } from '../../sim/catappa';
import { formatHour, HOUR_SLIDER_STEP, HOURS_PER_DAY, NOON_HOUR } from '../../sim/daylight';
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import type { SaveMessage, SaveStatus } from '../../core/save-storage/save-storage';
import { DEFAULT_FOOD_STYLE, type FoodStyle } from '../../core/food-style/food-style';
import { isRoomAvailable } from '../../sim/room';
import { MAX_SAVE_LENGTH } from '../../sim/save';
import { DEFAULT_SIM_SPEED, SIM_SPEEDS, speedLabel, type SimSpeed } from '../../sim/sim-speed';
import { mixWarnings } from '../../sim/compatibility';
import {
  mixWarningText,
  SPECIES_LABELS,
  speciesCatalog,
  type SpeciesLabels,
} from '../../sim/species-catalog';
import { type SpeciesId } from '../../sim/species';
import { addWarnings, addWarningText, sheetNotes, sheetRows } from '../../sim/species-sheet';
import { MAX_HEATER_TEMPERATURE, MIN_HEATER_TEMPERATURE } from '../../sim/water';
import { formatTenth } from '../../sim/water-dashboard';
import { DEFAULT_WATER_READOUT, type WaterReadout } from '../../sim/water-quality';

/** Libellé d'une vitesse (déplacé dans `sim/sim-speed.ts`, partagé avec le tableau de bord). */
export { speedLabel } from '../../sim/sim-speed';

/** Identifiant de la région du panneau (cible de `aria-controls`). */
export const CONTROL_PANEL_ID = 'panneau-controle';

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
 * Nom accessible des boutons « − » et « + » : « Retirer un néon », « Ajouter une raie » (genre
 * porté par le catalogue, #95 ; `labels` n'est donné que par les tests, pour exercer le
 * féminin qu'aucune espèce ne porte plus, #284).
 */
export function speciesStepLabel(
  species: SpeciesId,
  delta: -1 | 1,
  labels: Readonly<Record<SpeciesId, SpeciesLabels>> = SPECIES_LABELS,
): string {
  const { singular, feminine } = labels[species];
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

/** Pas du curseur du chauffage, en °C (#207). */
export const HEATER_SLIDER_STEP = 0.5;

/** Température lue sur le curseur du chauffage (une chaîne), `null` hors des bornes. */
export function sliderHeater(value: string | number): number | null {
  const t = toNumber(value);
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
 * Fiches (#237) : à côté du nom, un bouton « Fiche » (disclosure, `aria-expanded`) ouvre sous
 * la ligne la fiche de l'espèce (`sim/species-sheet.ts`), une région titrée : chaque valeur
 * avec son statut (source ou approximation de jeu) en petit dessous. Une seule fiche ouverte
 * à la fois ; Échap ou « Fermer la fiche » la referme et rend le focus au bouton. Après un
 * ajout (« + », curseur ou champ en hausse), des lignes d'avertissement sous la ligne de
 * l'espèce si le bac ne lui convient pas (volume, groupe, voisins incompatibles).
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

        <!-- Eau (#207) : ce qui se règle seulement, « Changer l'eau » sur la ligne du titre puis
             le chauffage ; les jauges sont dans le tableau de bord (#256). -->
        <fieldset
          class="control-panel__section"
          data-section="eau"
          aria-labelledby="panneau-eau-titre"
        >
          <legend class="control-panel__legend control-panel__legend--row">
            <span id="panneau-eau-titre">Eau</span>
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
          <!-- Feuilles de catappa (#239) : « − », nombre, « + », puis le rappel que l'effet est
               simplifié (approximation de jeu, ADR 0071). -->
          <div class="control-panel__count" data-catappa>
            <span class="control-panel__count-label" id="panneau-catappa">Feuilles de catappa</span>
            <button
              type="button"
              class="control-panel__step"
              aria-label="Retirer une feuille de catappa"
              [attr.aria-disabled]="water().catappa <= 0"
              (click)="stepCatappa(-1)"
            >
              −
            </button>
            <output
              class="control-panel__value"
              aria-labelledby="panneau-catappa"
              data-catappa-count
            >
              {{ water().catappa }}
            </output>
            <button
              type="button"
              class="control-panel__step"
              aria-label="Ajouter une feuille de catappa"
              [attr.aria-disabled]="water().catappa >= maxCatappa"
              (click)="stepCatappa(1)"
            >
              +
            </button>
          </div>
          <p class="control-panel__note" data-catappa-note>
            Effet simplifié : ne remplace pas un test de pH.
          </p>
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
              <div class="control-panel__count-head">
                <label
                  class="control-panel__count-label"
                  [for]="'panneau-population-' + id"
                  [attr.title]="entry.scientificName"
                >
                  {{ entry.name }}
                </label>
                <button
                  type="button"
                  class="control-panel__sheet-toggle"
                  [attr.aria-label]="'Fiche : ' + entry.name"
                  [attr.aria-expanded]="openSheet() === id"
                  [attr.aria-controls]="'fiche-' + id"
                  [attr.data-sheet-toggle]="id"
                  (click)="toggleSheet(id)"
                  (keydown.escape)="closeSheet(id, $event)"
                >
                  Fiche
                </button>
              </div>
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
            <!-- Avertissements d'ajout (#237) : bac qui ne convient pas à l'espèce ajoutée. -->
            @if (lastAdded() === id) {
              @for (text of addTexts(); track text) {
                <p class="control-panel__note control-panel__warning" data-add-warning>
                  {{ text }}
                </p>
              }
            }
            <!-- Fiche de l'espèce (#237). -->
            @if (openSheet() === id) {
              <section
                class="control-panel__sheet"
                role="region"
                [id]="'fiche-' + id"
                [attr.aria-labelledby]="'fiche-titre-' + id"
                [attr.data-species-sheet]="id"
                (keydown.escape)="closeSheet(id, $event)"
              >
                <h3 class="control-panel__sheet-title" [id]="'fiche-titre-' + id">
                  Fiche : {{ entry.name }}
                  <span class="control-panel__sheet-latin">{{ entry.scientificName }}</span>
                </h3>
                <!-- Mises en garde de la fiche (#269) : non vérifiée, pas pour débutant… -->
                @for (item of sheetNotes(id); track item.text) {
                  <p class="control-panel__note control-panel__warning" data-sheet-note>
                    {{ item.text }}
                    <small class="control-panel__sheet-status">{{ item.status }}</small>
                  </p>
                }
                <dl class="control-panel__sheet-list">
                  @for (row of sheetRows(id); track row.field) {
                    <div class="control-panel__sheet-row" [attr.data-sheet-field]="row.field">
                      <dt>{{ row.label }}</dt>
                      <dd>
                        {{ row.value }}
                        <small class="control-panel__sheet-status" data-sheet-status>{{
                          row.status
                        }}</small>
                      </dd>
                    </div>
                  }
                </dl>
                <button
                  type="button"
                  class="control-panel__button control-panel__button--compact"
                  data-sheet-close
                  (click)="closeSheet(id)"
                >
                  Fermer la fiche
                </button>
              </section>
            }
          } @empty {
            <p class="control-panel__note" data-population-empty>Aucune espèce pour l’instant.</p>
          }
          <!-- Mélanges déconseillés (#209) : couples d'espèces présentes incompatibles. -->
          @for (text of mixTexts(); track text) {
            <p class="control-panel__note control-panel__warning" data-mix-warning>{{ text }}</p>
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
  /** Litres d'eau du bac courant (fournis par l'hôte, #237) ; `null` : inconnus. */
  readonly tankLiters = input<number | null>(null);
  /** Relevé de l'eau (fourni par l'hôte, #207). */
  readonly water = input<WaterReadout>(DEFAULT_WATER_READOUT);
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
  /** Consigne du chauffage choisie au curseur, en °C (#207). */
  readonly heaterChanged = output<number>();
  /** Nombre de feuilles de catappa demandé (#239), dans [0, `MAX_CATAPPA_LEAVES`]. */
  readonly catappaChanged = output<number>();
  /** Bouton « Changer l'eau » (#207). */
  readonly waterChangeRequested = output<void>();
  /** Bouton « Exporter » (#70). */
  readonly exportRequested = output<void>();
  /** Contenu du fichier choisi avec « Importer » (texte, pas encore validé ; #70). */
  readonly importRequested = output<string>();
  /** Fichier choisi refusé avant lecture (trop gros, illisible) : raison, en français. */
  readonly importRejected = output<string>();
  /** Déplié par l'utilisateur, pour replier un panneau voisin sur petit écran (#136). */
  readonly opened = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Panneau déplié (fermé par défaut : captures et premier regard inchangés). */
  readonly open = signal(false);

  protected readonly panelId = CONTROL_PANEL_ID;
  protected readonly speeds = SIM_SPEEDS;
  /**
   * Catalogue des espèces de l'environnement affiché (#88, #189), dans l'ordre de
   * `Environment.species`.
   */
  protected readonly catalog = computed(() => speciesCatalog(this.environment()));
  /**
   * Libellés des mélanges déconseillés de la population affichée (#209), dans l'ordre du
   * catalogue (`mixWarnings`, `sim/compatibility.ts`).
   */
  protected readonly mixTexts = computed(() =>
    mixWarnings(
      this.catalog().map((entry) => entry.species),
      this.population(),
    ).map(mixWarningText),
  );
  /** Espèce dont la fiche est ouverte (#237), refermée au changement d'environnement. */
  protected readonly openSheet = linkedSignal<EnvironmentId, SpeciesId | null>({
    source: this.environment,
    computation: () => null,
  });
  /** Dernière espèce ajoutée depuis le panneau (#237), oubliée au changement d'environnement. */
  protected readonly lastAdded = linkedSignal<EnvironmentId, SpeciesId | null>({
    source: this.environment,
    computation: () => null,
  });
  /**
   * Avertissements de la dernière espèce ajoutée (#237), recalculés sur la population et le
   * volume courants : ils disparaissent quand le bac convient de nouveau.
   */
  protected readonly addTexts = computed(() => {
    const id = this.lastAdded();
    if (id === null) {
      return [];
    }
    const population = this.population();
    return addWarnings(
      id,
      population[id],
      this.tankLiters() ?? Number.NaN,
      population,
      this.catalog().map((entry) => entry.species),
    ).map(addWarningText);
  });
  protected readonly sheetRows = sheetRows;
  protected readonly sheetNotes = sheetNotes;
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
  protected readonly heaterLabel = computed(() => heaterText(this.water()));

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

  protected onHeater(event: Event): void {
    const temperature = sliderHeater((event.target as HTMLInputElement).value);
    if (temperature !== null) {
      this.heaterChanged.emit(temperature);
    }
  }

  /** Nombre maximal de feuilles de catappa (#239). */
  protected readonly maxCatappa = MAX_CATAPPA_LEAVES;

  /** « − » ou « + » des feuilles de catappa (#239) : sans effet aux bornes. */
  protected stepCatappa(delta: -1 | 1): void {
    const count = this.water().catappa + delta;
    if (count >= 0 && count <= MAX_CATAPPA_LEAVES) {
      this.catappaChanged.emit(count);
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

  /** Bouton « Fiche » : ouvre la fiche de l'espèce, ou la referme si elle est ouverte. */
  protected toggleSheet(id: SpeciesId): void {
    this.openSheet.update((open) => (open === id ? null : id));
  }

  /**
   * Referme la fiche de `id` (« Fermer la fiche », ou Échap dans la fiche ou sur son bouton)
   * et rend le focus à son bouton « Fiche ». Échap qui ferme la fiche ne remonte pas plus haut.
   */
  protected closeSheet(id: SpeciesId, event?: Event): void {
    if (this.openSheet() !== id) {
      return;
    }
    event?.stopPropagation();
    this.openSheet.set(null);
    const toggle = this.host.nativeElement.querySelector<HTMLButtonElement>(
      `[data-sheet-toggle="${id}"]`,
    );
    toggle?.focus();
  }

  /** Demande l'effectif `count` ; une hausse retient l'espèce pour ses avertissements (#237). */
  private request(id: SpeciesId, count: number): void {
    if (count > this.population()[id]) {
      this.lastAdded.set(id);
    } else if (this.lastAdded() === id) {
      this.lastAdded.set(null);
    }
    this.populationChanged.emit({ species: id, count });
  }

  /** Bouton « − » ou « + » : sans effet à la borne. */
  protected step(id: SpeciesId, delta: -1 | 1): void {
    const count = this.population()[id] + delta;
    if (count >= 0 && count <= this.populationMax()[id]) {
      this.request(id, count);
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
      this.request(id, count);
    }
  }
}
