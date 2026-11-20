import { DEFAULT_LIGHTING_HOURS } from '../../sim/algae';
import { DEFAULT_LAMP_ON_HOUR } from '../../sim/lamp';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { DEFAULT_ENVIRONMENT_ID, environmentById, type EnvironmentId } from '../../sim/environment';
import { DEFAULT_POND_SHAPE, type PondShape } from '../../sim/pond-shape';
import { ReducedMotionState } from '../reduced-motion/reduced-motion-state';
import { AmbientSoundState } from '../ambient-sound/ambient-sound-state';
import { formatHour, HOUR_SLIDER_STEP, HOURS_PER_DAY, NOON_HOUR } from '../../sim/daylight';
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import type { SaveMessage, SaveStatus } from '../../core/save-storage/save-storage';
import { DEFAULT_FOOD_STYLE, type FoodStyle } from '../../core/food-style/food-style';
import { isRoomAvailable } from '../../sim/room';
import type { RoomCatalog, TankNotice } from '../aquarium-host/aquarium-host';
import type { TankListEntry } from '../../sim/tank-list';
import { DEFAULT_SIM_SPEED, SIM_SPEEDS, speedLabel, type SimSpeed } from '../../sim/sim-speed';
import type { CareMode } from '../../sim/care-mode';
import type { CurrentLevel } from '../../sim/water-current';
import type { SpeciesId } from '../../sim/species';
import type { TreatmentKind } from '../../sim/treatment';
import { EMPTY_QUARANTINE, type QuarantineView } from '../../sim/quarantine';
import type { TreatmentNotice, TreatmentReadout } from '../../sim/treatment-text';
import type { PhRegulatorDirection } from '../../sim/ph-regulator';
import type { ConditionerKind } from '../../sim/water-conditioner';
import type { GuidePage } from '../../sim/care-guide';
import { DEFAULT_WATER_READOUT, type WaterReadout } from '../../sim/water-quality';
import { formNumber, isQuarantineShown } from './panel-views';
import { CareSection } from './care-section';
import { EnvironmentSection } from './environment-section';
import { SaveSection } from './save-section';
import { WaterSection } from './water-section';
import { PopulationSection, type PopulationRequest } from './population-section';
import { RoomSection, type NewTankRequest } from './room-section';
import { TanksSection } from './tanks-section';

/**
 * Fonctions et types des sections sorties du panneau (#697), réexportés pour l'hôte et les
 * tests qui les importent d'ici.
 */
export {
  populationInput,
  speciesCountLabel,
  speciesPlural,
  speciesSliderLabel,
  speciesStepLabel,
  type PopulationRequest,
} from './population-section';
export type { NewTankRequest } from './room-section';
export { saveStatusText } from './save-section';
export {
  HEATER_SLIDER_STEP,
  heaterText,
  lampOnText,
  lightingText,
  sliderHeater,
  sliderLampOn,
  sliderLighting,
} from './water-section';

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
  const i = formNumber(index);
  return Number.isInteger(i) && i >= 0 && i < SIM_SPEEDS.length ? SIM_SPEEDS[i] : null;
}

/** Heure lue sur le curseur d'heure (une chaîne), `null` si elle n'est pas dans [0, 24). */
export function sliderHour(value: string | number): number | null {
  const hour = formNumber(value);
  return Number.isFinite(hour) && hour >= 0 && hour < HOURS_PER_DAY ? hour : null;
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
 * que le focus est dans un curseur ou une case (`isTypingContext`). Échap replie le panneau
 * et rend le focus au bouton (#407).
 * Absent en mode capture (c'est l'application qui ne l'affiche pas).
 */
@Component({
  selector: 'app-control-panel',
  imports: [
    EnvironmentSection,
    WaterSection,
    CareSection,
    PopulationSection,
    RoomSection,
    TanksSection,
    SaveSection,
  ],
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
      <!-- Section « Soins » (#361) affichée : la liste des espèces défile plus tôt, pour que
           « Sauvegarde » reste dans la deuxième colonne à 1280 × 720 (docs/PIEGES.md). -->
      <section
        class="control-panel"
        [id]="panelId"
        aria-label="Réglages de l’aquarium"
        [style.--soins]="careShown() ? '570px' : null"
        [class.control-panel--single-column]="quarantineShown()"
      >
        <fieldset
          class="control-panel__section"
          data-section="environnement"
          app-environment-section
          [environment]="environment()"
          [pondShape]="pondShape()"
          [roomShown]="roomShown()"
          (environmentChanged)="environmentChanged.emit($event)"
          (pondShapeChanged)="pondShapeChanged.emit($event)"
          (roomShownChanged)="roomShownChanged.emit($event)"
        ></fieldset>

        <fieldset
          class="control-panel__section"
          data-section="simulation"
          aria-labelledby="panneau-simulation-titre"
        >
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
          app-water-section
          [careMode]="careMode()"
          [careShown]="careShown()"
          [current]="current()"
          [water]="water()"
          [lighting]="lighting()"
          [lampOn]="lampOn()"
          [scraping]="scraping()"
          [pruning]="pruning()"
          [treatmentNotice]="treatmentNotice()"
          [untreatedTap]="untreatedTap()"
          [carbon]="carbon()"
          (currentToggled)="currentToggled.emit()"
          (waterChangeRequested)="waterChangeRequested.emit()"
          (heaterChanged)="heaterChanged.emit($event)"
          (lightingChanged)="lightingChanged.emit($event)"
          (lampOnChanged)="lampOnChanged.emit($event)"
          (scraperToggled)="scraperToggled.emit()"
          (prunerToggled)="prunerToggled.emit()"
          (bacteriaStarterRequested)="bacteriaStarterRequested.emit()"
          (untreatedTapToggled)="untreatedTapToggled.emit()"
          (conditionerRequested)="conditionerRequested.emit($event)"
          (carbonToggled)="carbonToggled.emit()"
          (phRegulatorRequested)="phRegulatorRequested.emit($event)"
          (wikiPageRequested)="wikiPageRequested.emit($event)"
          (catappaChanged)="catappaChanged.emit($event)"
        ></fieldset>

        @if (careShown()) {
          <!-- Soins (#361) : seulement avec des points blancs visibles ou un traitement en cours,
               pour que le panneau ne grandisse pas dans le cas par défaut (docs/PIEGES.md). -->
          <fieldset
            class="control-panel__section"
            data-section="soins"
            aria-labelledby="panneau-soins-titre"
            app-care-section
            [treatment]="treatment()"
            [treatmentNotice]="treatmentNotice()"
            (treatmentRequested)="treatmentRequested.emit($event)"
            (wikiPageRequested)="wikiPageRequested.emit($event)"
          ></fieldset>
        }

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

        <!-- Accessibilité (#406) : initialisée sur la préférence système, choix mémorisé. Juste
             après « Décor », dans la première colonne du panneau à 1280 × 720, où il reste de
             la place (docs/PIEGES.md). -->
        <fieldset class="control-panel__section" data-section="accessibilite">
          <legend class="control-panel__legend">Accessibilité</legend>
          <label class="control-panel__check" data-reduced-motion>
            <input type="checkbox" [checked]="reducedMotion()" (change)="onReducedMotion($event)" />
            Réduire les mouvements
          </label>
        </fieldset>

        <!-- Son (#411, ADR 0100) : désactivé par défaut, case et volume sur une seule ligne,
             juste après « Accessibilité » ; à 1280 × 720, en tête de la deuxième colonne, la
             liste « Population » (qui défile) cède une ligne (docs/PIEGES.md). -->
        <fieldset class="control-panel__section" data-section="son">
          <legend class="control-panel__legend">Son</legend>
          <div class="control-panel__row">
            <label class="control-panel__check" data-ambient-sound>
              <input
                type="checkbox"
                [checked]="soundEnabled()"
                [attr.aria-disabled]="soundAvailable() ? null : 'true'"
                [attr.aria-describedby]="soundAvailable() ? null : 'panneau-son-indisponible'"
                (click)="onAmbientSoundClick($event)"
                (change)="onAmbientSound($event)"
              />
              Sons d'ambiance
            </label>
            <input
              class="control-panel__range control-panel__count-range"
              type="range"
              min="0"
              max="100"
              step="5"
              aria-label="Volume des sons d'ambiance"
              data-ambient-volume
              [value]="soundVolume()"
              [attr.aria-valuetext]="soundVolume() + ' %'"
              [attr.aria-disabled]="soundAvailable() ? null : 'true'"
              [attr.aria-describedby]="soundAvailable() ? null : 'panneau-son-indisponible'"
              (input)="onAmbientVolume($event)"
            />
          </div>
          @if (!soundAvailable()) {
            <p class="control-panel__message" id="panneau-son-indisponible">
              @if (soundRefused()) {
                Sons indisponibles : le navigateur a refusé de démarrer l'audio. Recharger la page
                pour réessayer.
              } @else {
                Sons indisponibles : ce navigateur ne prend pas en charge Web Audio.
              }
            </p>
          }
        </fieldset>

        @if (roomAvailable() && roomShown()) {
          <!-- Bacs et meubles de la pièce (#305, lot 2b) : ajout à la première place libre,
               retrait (confirmation si le bac est peuplé). Les bacs posés restent figés. Après
               « Décor » : l'ordre au clavier des sections précédentes ne change pas. -->
          <fieldset
            class="control-panel__section"
            data-section="bacs-meubles"
            app-room-section
            [roomCatalog]="roomCatalog()"
            (supportAdded)="supportAdded.emit($event)"
            (tankAdded)="tankAdded.emit($event)"
            (tankRemoved)="tankRemoved.emit($event)"
            (supportRemoved)="supportRemoved.emit($event)"
          ></fieldset>
        }

        <fieldset
          class="control-panel__section"
          data-section="population"
          app-population-section
          [environment]="environment()"
          [careMode]="careMode()"
          [population]="population()"
          [populationMax]="populationMax()"
          [populationNotice]="populationNotice()"
          [tankLiters]="tankLiters()"
          [water]="water()"
          (populationChanged)="populationChanged.emit($event)"
        ></fieldset>

        <!-- Liste des bacs de la pièce (#306, lot 3) : sélection et transfert d'un animal.
             Avant « Sauvegarde » : l'ordre au clavier des sections précédentes ne change pas. -->
        <fieldset
          class="control-panel__section"
          data-section="bacs"
          aria-labelledby="panneau-bacs-titre"
          app-tanks-section
          [environment]="environment()"
          [careMode]="careMode()"
          [tankList]="tankList()"
          [tankLiters]="tankLiters()"
          [population]="population()"
          [water]="water()"
          [quarantine]="quarantine()"
          [tankNotice]="tankNotice()"
          (tankSelected)="tankSelected.emit($event)"
          (tankRenamed)="tankRenamed.emit($event)"
          (careModeChanged)="careModeChanged.emit($event)"
          (careReturned)="careReturned.emit($event)"
          (animalTransferred)="animalTransferred.emit($event)"
          (quarantineInstalled)="quarantineInstalled.emit()"
          (quarantineTreated)="quarantineTreated.emit($event)"
          (quarantineStarter)="quarantineStarter.emit($event)"
          (quarantineReturned)="quarantineReturned.emit($event)"
        ></fieldset>

        <!-- « Partager ce bac » (#426) sur la ligne du titre, comme « Changer l'eau » : aucune
             ligne de plus, « Sauvegarde » reste dans la deuxième colonne à 1280 × 720. -->
        <fieldset
          class="control-panel__section"
          data-section="sauvegarde"
          aria-labelledby="panneau-sauvegarde-titre"
          app-save-section
          [saveStatus]="saveStatus()"
          [saveMessage]="saveMessage()"
          [shareLink]="shareLink()"
          (exportRequested)="exportRequested.emit()"
          (shareRequested)="shareRequested.emit()"
          (importRequested)="importRequested.emit($event)"
          (importRejected)="importRejected.emit($event)"
        ></fieldset>
      </section>
    }`,
  styleUrl: './control-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'onEscape($event)' },
})
export class ControlPanel {
  /** Environnement affiché (fourni par l'hôte). */
  readonly environment = input<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  /** Forme du bassin du monde courant (issue #190, fournie par l'hôte). */
  readonly pondShape = input<PondShape>(DEFAULT_POND_SHAPE);
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
  /** Force du courant du bac (#460) : coupé, doux ou fort. */
  readonly current = input<CurrentLevel>('coupe');
  /** Vrai si la pièce autour du bac est affichée (fourni par l'hôte, #187). */
  readonly roomShown = input(false);
  /** Bacs et meubles supports de la pièce de N bacs (fournis par l'hôte, #305). */
  readonly roomCatalog = input<RoomCatalog>({ tanks: [], supports: [], message: null });
  /** Liste des bacs de la pièce (fournie par l'hôte, #306). */
  readonly tankList = input<readonly TankListEntry[]>([]);
  /** Mode du bac affiché (#278) : catalogue complet et aucun avertissement en décor. */
  readonly careMode = input<CareMode>('soins');
  /** Message du dernier transfert d'animal (fourni par l'hôte, #306). */
  readonly tankNotice = input<TankNotice | null>(null);
  /** Effectif de chaque espèce (fourni par l'hôte). */
  readonly population = input<PopulationCounts>(NO_FISH);
  /** Effectif maximal de chaque espèce, compte tenu des autres (fourni par l'hôte). */
  readonly populationMax = input<PopulationCounts>(NO_FISH);
  /** Plafond d'animaux de la pièce atteint (#392) : message de l'hôte, sinon `null`. */
  readonly populationNotice = input<string | null>(null);
  /** Litres d'eau du bac courant (fournis par l'hôte, #237) ; `null` : inconnus. */
  readonly tankLiters = input<number | null>(null);
  /** Relevé de l'eau (fourni par l'hôte, #207). */
  readonly water = input<WaterReadout>(DEFAULT_WATER_READOUT);
  /** Animaux aux points blancs visibles (fournis par l'hôte, #361) : section « Soins ». */
  readonly ichCount = input(0);
  /** Durée d'éclairage du bac, en heures par jour (fournie par l'hôte, #476). */
  readonly lighting = input(DEFAULT_LIGHTING_HOURS);
  /** Heure d'allumage de la lampe (fournie par l'hôte, #584). */
  readonly lampOn = input(DEFAULT_LAMP_ON_HOUR);
  /** Raclette en main (fournie par l'hôte, #476). */
  readonly scraping = input(false);
  /** Sécateur en main (fourni par l'hôte, #477). */
  readonly pruning = input(false);
  /** Traitement des points blancs en cours (fourni par l'hôte, #361) ; `null` : aucun. */
  readonly treatment = input<TreatmentReadout | null>(null);
  /** Message du dernier geste de soin (fourni par l'hôte, #361) ; `null` : aucun. */
  readonly treatmentNotice = input<TreatmentNotice | null>(null);
  /** Vrai si les changements d'eau versent de l'eau non traitée (#530). */
  readonly untreatedTap = input(false);
  /** Vrai si du charbon actif est dans le filtre (#531). */
  readonly carbon = input(false);
  /** État de la sauvegarde automatique (fourni par l'hôte, #70). */
  readonly saveStatus = input<SaveStatus | null>(null);
  /** Dernier message de la sauvegarde : import refusé, import réussi… (fourni par l'hôte). */
  readonly saveMessage = input<SaveMessage | null>(null);
  /** Dernier lien de partage (#426, fourni par l'hôte), `null` sinon. */
  readonly shareLink = input<string | null>(null);

  /** Environnement choisi dans la liste. */
  readonly environmentChanged = output<EnvironmentId>();
  /** Forme du bassin choisie (issue #190). */
  readonly pondShapeChanged = output<PondShape>();
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
  /** « Mode immersif » (#345) : l'application ouvre le mode en plein cadre. */
  readonly immersiveRequested = output<void>();
  /** Case « Pluie » (#106) : `true` pour faire pleuvoir, `false` pour arrêter. */
  readonly rainChanged = output<boolean>();
  /** Case « Afficher la pièce » (#187). */
  readonly roomShownChanged = output<boolean>();
  /** « Bacs et meubles » (#305) : meuble support à ajouter. */
  readonly supportAdded = output<string>();
  /** « Bacs et meubles » (#305) : bac vide à ajouter (environnement, taille, meuble ou sol). */
  readonly tankAdded = output<NewTankRequest>();
  /** « Bacs et meubles » (#305) : bac à retirer (confirmé s'il est peuplé). */
  readonly tankRemoved = output<number>();
  /** « Bacs et meubles » (#305) : meuble support libre à retirer. */
  readonly supportRemoved = output<number>();
  /** Liste des bacs (#306) : bac à sélectionner. */
  readonly tankSelected = output<number>();
  /** « Renommer » (#316) : bac et nom saisi (normalisé et validé par l'hôte). */
  readonly tankRenamed = output<{ readonly id: number; readonly name: string }>();
  /** Mode demandé pour le bac affiché (#278), après confirmation. */
  readonly careModeChanged = output<CareMode>();
  /**
   * « Tout retirer » au retour en soins (#278, lot 2) : espèces listées comme inadaptées, à
   * retirer du bac avant de repasser en mode soins (à la place de `careModeChanged`).
   */
  readonly careReturned = output<readonly SpeciesId[]>();
  /** « Transférer à l'épuisette » (#306) : espèce du bac sélectionné et bac d'arrivée. */
  readonly animalTransferred = output<{ readonly species: SpeciesId; readonly toId: number }>();
  /** Bacs de quarantaine possibles, leurs espèces et leurs malades (fourni par l'hôte, #547). */
  readonly quarantine = input<QuarantineView>(EMPTY_QUARANTINE);
  /** « Installer un bac de quarantaine » (#547). */
  readonly quarantineInstalled = output<void>();
  /** Un geste de soin dans le bac de quarantaine `id` seul (#547). */
  readonly quarantineTreated = output<{ readonly id: number; readonly kind: TreatmentKind }>();
  /** Dose d'amorce de bactéries dans le bac posé choisi (#553), par son identifiant. */
  readonly quarantineStarter = output<number>();
  /** « Ramener au bac affiché » (#547) : bac de quarantaine et espèce. */
  readonly quarantineReturned = output<{ readonly fromId: number; readonly species: SpeciesId }>();
  /** Bouton « Granulés » : passer à l'autre rendu (#117). */
  readonly foodStyleToggled = output<void>();
  /** Force suivante du courant demandée (#460). */
  readonly currentToggled = output<void>();
  /** Effectif demandé pour une espèce (déjà borné à [0, maximum]). */
  readonly populationChanged = output<PopulationRequest>();
  /** Consigne du chauffage choisie au curseur, en °C (#207). */
  readonly heaterChanged = output<number>();
  /** Durée d'éclairage demandée (#476, #584), en heures entières dans [4, 14]. */
  readonly lightingChanged = output<number>();
  /** Heure d'allumage de la lampe demandée (#584), heure entière dans [0, 23]. */
  readonly lampOnChanged = output<number>();
  /** Bouton « Raclette » (#476) : prendre ou poser la raclette. */
  readonly scraperToggled = output<void>();
  /** Bouton « Sécateur » (#477) : prendre ou poser le sécateur. */
  readonly prunerToggled = output<void>();
  /** Nombre de feuilles de catappa demandé (#239), dans [0, `MAX_CATAPPA_LEAVES`]. */
  readonly catappaChanged = output<number>();
  /** Bouton « Changer l'eau » (#207). */
  readonly waterChangeRequested = output<void>();
  /** Bouton d'un traitement des points blancs (#361) : un geste de ce traitement. */
  readonly treatmentRequested = output<TreatmentKind>();
  /** Dose d'amorce de bactéries demandée (#529). */
  readonly bacteriaStarterRequested = output<void>();
  /** Lien « Produits et traitements » d'un message de soin (#554) : page du wiki à ouvrir. */
  readonly wikiPageRequested = output<GuidePage>();
  /** Dose de conditionneur demandée (#530). */
  readonly conditionerRequested = output<ConditionerKind>();
  /** Bascule de l'eau du robinet entre traitée et non traitée (#530). */
  readonly untreatedTapToggled = output<void>();
  /** Bascule du charbon actif (#531). */
  readonly carbonToggled = output<void>();
  /** Dose de régulateur de pH demandée (#531). */
  readonly phRegulatorRequested = output<PhRegulatorDirection>();
  /** Bouton « Exporter » (#70). */
  readonly exportRequested = output<void>();
  /** Bouton « Partager ce bac » (#426). */
  readonly shareRequested = output<void>();
  /** Contenu du fichier choisi avec « Importer » (texte, pas encore validé ; #70). */
  readonly importRequested = output<string>();
  /** Fichier choisi refusé avant lecture (trop gros, illisible) : raison, en français. */
  readonly importRejected = output<string>();
  /** Déplié par l'utilisateur, pour replier un panneau voisin sur petit écran (#136). */
  readonly opened = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Option « Réduire les mouvements » (#406), partagée avec l'aquarium et le mode immersif. */
  private readonly motionState = inject(ReducedMotionState);
  /** État effectif de l'option (choix des réglages, sinon préférence système). */
  readonly reducedMotion = this.motionState.reduced;
  /** Sons d'ambiance (#411), partagés avec l'hôte de l'aquarium qui fournit la scène. */
  private readonly sound = inject(AmbientSoundState);
  /** Case « Sons d'ambiance » cochée. */
  readonly soundEnabled = this.sound.enabled;
  /** Web Audio utilisable ; sinon case et curseur désactivés, avec une explication. */
  readonly soundAvailable = this.sound.available;
  /** Web Audio présent mais création du contexte refusée (#413) : autre explication. */
  readonly soundRefused = this.sound.refused;
  /** Volume en pour cent, pour le curseur. */
  readonly soundVolume = computed(() => Math.round(this.sound.volume() * 100));

  /** Panneau déplié (fermé par défaut : captures et premier regard inchangés). */
  readonly open = signal(false);

  protected readonly panelId = CONTROL_PANEL_ID;
  protected readonly speeds = SIM_SPEEDS;
  /** Panneau sur une colonne qui défile tant qu'une quarantaine est affichée (#571). */
  protected readonly quarantineShown = computed(() =>
    isQuarantineShown(this.careMode(), this.quarantine()),
  );
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
  /** Section « Soins » (#361) : en mode soins, avec des points blancs ou un traitement. */
  protected readonly careShown = computed(
    () => this.careMode() !== 'decor' && (this.ichCount() > 0 || this.treatment() !== null),
  );

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

  /**
   * Échap dans le panneau ou sur son bouton (#407) : replie le panneau et rend le focus au
   * bouton « Réglages ». Une fiche ouverte ou une confirmation se ferme d'abord (elles
   * arrêtent l'événement) ; un Échap déjà traité (`defaultPrevented`) est ignoré.
   */
  protected onEscape(event: Event): void {
    if (!this.open() || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    this.open.set(false);
    this.host.nativeElement.querySelector<HTMLElement>('.control-panel__toggle')?.focus();
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

  /** Case « Réduire les mouvements » (#406) : réglée et mémorisée dans l'état partagé. */
  protected onReducedMotion(event: Event): void {
    this.motionState.setReduced((event.target as HTMLInputElement).checked);
  }

  /**
   * Sans Web Audio, la case reste atteignable au clavier (`aria-disabled`, comme « Éditer le
   * décor ») mais ne se coche pas : le clic est annulé.
   */
  protected onAmbientSoundClick(event: Event): void {
    if (!this.soundAvailable()) {
      event.preventDefault();
    }
  }

  /** Case « Sons d'ambiance » (#411) : le `change` est un geste, le contexte audio peut naître. */
  protected onAmbientSound(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.sound.setEnabled(input.checked);
    // Démarrage refusé (#413) : `enabled` repasse à faux dans le même geste, sans changer de
    // valeur pour la liaison `[checked]` ; la case est donc recalée à la main.
    input.checked = this.sound.enabled();
  }

  /** Curseur du volume (#411), en pour cent ; sans Web Audio, il revient à sa valeur. */
  protected onAmbientVolume(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.soundAvailable()) {
      input.value = String(this.soundVolume());
      return;
    }
    this.sound.setVolume(Number(input.value) / 100);
  }

  protected onEdit(): void {
    if (this.decorEditable()) {
      this.editRequested.emit();
    }
  }

  protected onDecor(event: Event): void {
    this.decorVisibleChanged.emit((event.target as HTMLInputElement).checked);
  }
}
