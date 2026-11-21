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

import { DEFAULT_ENVIRONMENT_ID, type EnvironmentId } from '../../sim/environment';
import { DEFAULT_POND_SHAPE, type PondShape } from '../../sim/pond-shape';
import { NOON_HOUR } from '../../sim/daylight';
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import type { SaveMessage, SaveStatus } from '../../core/save-storage/save-storage';
import { DEFAULT_FOOD_STYLE, type FoodStyle } from '../../core/food-style/food-style';
import { isRoomAvailable } from '../../sim/room';
import type { RoomCatalog, TankNotice } from '../aquarium-host/aquarium-host';
import type { TankListEntry } from '../../sim/tank-list';
import { DEFAULT_SIM_SPEED, type SimSpeed } from '../../sim/sim-speed';
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
import { SettingsWindow, SETTINGS_WINDOW_ID } from '../settings-window/settings-window';
import {
  DEFAULT_SETTINGS_CATEGORY,
  SETTINGS_CATEGORIES,
  settingsCategory,
  type SettingsCategoryId,
  type SettingsSectionKey,
} from '../settings-window/settings-categories';
import { SETTINGS_CATEGORY_STORAGE } from '../settings-window/settings-category-store';
import {
  readStoredSettingsCategory,
  writeStoredSettingsCategory,
} from '../../core/settings-category-pref/settings-category-pref';
import { AmbientSoundState } from '../ambient-sound/ambient-sound-state';
import { ReducedMotionState } from '../reduced-motion/reduced-motion-state';
import { settingsSummaries } from './settings-summaries';
import { AccessibilitySection } from './accessibility-section';
import { CareSection } from './care-section';
import { DaySection } from './day-section';
import { DecorSection } from './decor-section';
import { EnvironmentSection } from './environment-section';
import { SimulationSection } from './simulation-section';
import { SoundSection } from './sound-section';
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

/** Identifiant de la fenêtre des réglages (cible de `aria-controls` du bouton, #722). */
export const CONTROL_PANEL_ID = SETTINGS_WINDOW_ID;

/** Lecture des curseurs de vitesse et d'heure (sections « Simulation » et « Journée »). */
export { speedAt, speedIndex } from './simulation-section';
export { sliderHour } from './day-section';

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
    SettingsWindow,
    EnvironmentSection,
    SimulationSection,
    DaySection,
    WaterSection,
    CareSection,
    DecorSection,
    AccessibilitySection,
    SoundSection,
    PopulationSection,
    RoomSection,
    TanksSection,
    SaveSection,
  ],
  template: `<button
      type="button"
      class="control-panel__toggle"
      [class.control-panel__toggle--open]="open()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="panelId"
      (click)="toggle()"
    >
      Réglages
    </button>
    @if (open()) {
      <!-- Fenêtre des réglages (#722, ADR 0165) : toutes les sections restent dans le
           document, celles des autres catégories sont masquées (attribut « hidden », ADR 0165). -->
      <app-settings-window
        [selected]="category()"
        [summaries]="summaries()"
        (selectedChange)="chooseCategory($event)"
        (closeRequested)="onCloseRequested()"
      >
        <section class="control-panel" aria-label="Réglages de l’aquarium">
          <fieldset
            class="control-panel__section"
            data-section="environnement"
            [hidden]="!shows('environnement')"
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
            [hidden]="!shows('simulation')"
            aria-labelledby="panneau-simulation-titre"
            app-simulation-section
            [speed]="speed()"
            (speedChanged)="speedChanged.emit($event)"
            (immersiveRequested)="immersiveRequested.emit()"
          ></fieldset>

          <fieldset
            class="control-panel__section"
            data-section="journee"
            [hidden]="!shows('journee')"
            app-day-section
            [environment]="environment()"
            [hour]="hour()"
            [clockRunning]="clockRunning()"
            [rain]="rain()"
            (hourChanged)="hourChanged.emit($event)"
            (clockRunningChanged)="clockRunningChanged.emit($event)"
            (rainChanged)="rainChanged.emit($event)"
          ></fieldset>

          <!-- Eau (#207) : ce qui se règle seulement, « Changer l'eau » sur la ligne du titre puis
             le chauffage ; les jauges sont dans le tableau de bord (#256). -->
          <fieldset
            class="control-panel__section"
            data-section="eau"
            [hidden]="!shows('eau')"
            aria-labelledby="panneau-eau-titre"
            app-water-section
            [careMode]="careMode()"
            [careShown]="careShown()"
            [current]="current()"
            [water]="water()"
            [lighting]="lighting()"
            [lampOn]="lampOn()"
            [treatmentNotice]="treatmentNotice()"
            [untreatedTap]="untreatedTap()"
            [carbon]="carbon()"
            (currentToggled)="currentToggled.emit()"
            (waterChangeRequested)="waterChangeRequested.emit()"
            (heaterChanged)="heaterChanged.emit($event)"
            (lightingChanged)="lightingChanged.emit($event)"
            (lampOnChanged)="lampOnChanged.emit($event)"
            (bacteriaStarterRequested)="bacteriaStarterRequested.emit()"
            (untreatedTapToggled)="untreatedTapToggled.emit()"
            (conditionerRequested)="conditionerRequested.emit($event)"
            (carbonToggled)="carbonToggled.emit()"
            (phRegulatorRequested)="phRegulatorRequested.emit($event)"
            (wikiPageRequested)="wikiPageRequested.emit($event)"
            (catappaChanged)="catappaChanged.emit($event)"
          ></fieldset>

          @if (!careShown() && category() === 'soins') {
            <p class="control-panel__empty" data-settings-empty>
              Aucun animal ne montre de points blancs : rien à soigner pour l’instant.
            </p>
          }
          @if (careShown()) {
            <!-- Soins (#361) : seulement avec des points blancs visibles ou un traitement en cours,
               pour que le panneau ne grandisse pas dans le cas par défaut (docs/PIEGES.md). -->
            <fieldset
              class="control-panel__section"
              data-section="soins"
              [hidden]="!shows('soins')"
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
            [hidden]="!shows('decor')"
            aria-labelledby="panneau-decor-titre"
            app-decor-section
            [decorVisible]="decorVisible()"
            [decorEditable]="decorEditable()"
            [foodStyle]="foodStyle()"
            (decorVisibleChanged)="decorVisibleChanged.emit($event)"
            (editRequested)="editRequested.emit()"
            (foodStyleToggled)="foodStyleToggled.emit()"
          ></fieldset>

          <!-- Accessibilité (#406) : catégorie « Accessibilité » de la fenêtre (#722). -->
          <fieldset
            class="control-panel__section"
            data-section="accessibilite"
            [hidden]="!shows('accessibilite')"
            app-accessibility-section
          ></fieldset>

          <!-- Son (#411, ADR 0100) : catégorie « Son » de la fenêtre (#722). -->
          <fieldset
            class="control-panel__section"
            data-section="son"
            [hidden]="!shows('son')"
            app-sound-section
          ></fieldset>

          @if (roomAvailable() && roomShown()) {
            <!-- Bacs et meubles de la pièce (#305, lot 2b) : ajout à la première place libre,
               retrait (confirmation si le bac est peuplé). Les bacs posés restent figés. Après
               « Décor » : l'ordre au clavier des sections précédentes ne change pas. -->
            <fieldset
              class="control-panel__section"
              data-section="bacs-meubles"
              [hidden]="!shows('bacs-meubles')"
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
            [hidden]="!shows('population')"
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
            [hidden]="!shows('bacs')"
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

          <!-- « Partager ce bac » (#426) sur la ligne du titre, comme « Changer l'eau » ;
             catégorie « Sauvegarde et partage » de la fenêtre (#722). -->
          <fieldset
            class="control-panel__section"
            data-section="sauvegarde"
            [hidden]="!shows('sauvegarde')"
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
      </app-settings-window>
    }`,
  styleUrl: './control-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'onEscape($event)',
    '[class.control-panel-host--window]': 'open()',
  },
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
  /** Déplié par l'utilisateur, pour replier un panneau voisin (#136, #722). */
  readonly opened = output<void>();
  /**
   * Refermé par l'utilisateur (Échap, « Fermer », fond, bouton « Réglages ») : l'application
   * rend ce que l'ouverture avait replié (#722). Pas émis par `close`, appelé par un autre
   * panneau qui prend la place.
   */
  readonly closedByUser = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Panneau déplié (fermé par défaut : captures et premier regard inchangés). */
  readonly open = signal(false);

  protected readonly panelId = CONTROL_PANEL_ID;
  /** Stockage de la catégorie retenue (#722, préférence locale de `core/`). */
  private readonly categoryStorage = inject(SETTINGS_CATEGORY_STORAGE);
  /**
   * Catégorie ouverte dans la fenêtre (#722) : retenue d'une ouverture et d'une visite à
   * l'autre ; inconnue ou absente, la première de la liste.
   */
  readonly category = signal<SettingsCategoryId>(
    readStoredSettingsCategory(
      this.categoryStorage,
      SETTINGS_CATEGORIES.map((entry) => entry.id),
      DEFAULT_SETTINGS_CATEGORY,
    ),
  );
  /** Sections de la catégorie ouverte (les autres restent dans le document, masquées). */
  private readonly shownSections = computed(
    () => new Set<SettingsSectionKey>(settingsCategory(this.category()).sections),
  );
  /** Case « Afficher la pièce » proposée seulement autour du bac tropical (#187). */
  protected readonly roomAvailable = computed(() => isRoomAvailable(this.environment()));
  /** Section « Soins » (#361) : en mode soins, avec des points blancs ou un traitement. */
  protected readonly careShown = computed(
    () => this.careMode() !== 'decor' && (this.ichCount() > 0 || this.treatment() !== null),
  );

  private readonly sound = inject(AmbientSoundState);
  private readonly motion = inject(ReducedMotionState);
  /** Valeur résumée de chaque catégorie, dans la liste du téléphone (#722, tranche 3). */
  protected readonly summaries = computed(() =>
    settingsSummaries({
      environment: this.environment(),
      tankCount: this.tankList().length,
      animals: Object.values(this.population()).reduce((sum, count) => sum + count, 0),
      temperature: this.water().temperature,
      current: this.current(),
      ichCount: this.ichCount(),
      treating: this.treatment() !== null,
      decorVisible: this.decorVisible(),
      speed: this.speed(),
      hour: this.hour(),
      clockRunning: this.clockRunning(),
      soundOn: this.sound.enabled(),
      volume: this.sound.volume(),
      reducedMotion: this.motion.reduced(),
      saveStatus: this.saveStatus(),
    }),
  );

  /** Vrai si la section `key` est dans la catégorie ouverte. */
  protected shows(key: SettingsSectionKey): boolean {
    return this.shownSections().has(key);
  }

  toggle(): void {
    const open = !this.open();
    this.open.set(open);
    if (open) {
      this.opened.emit();
    } else {
      this.closedByUser.emit();
    }
  }

  /** Replie le panneau pour laisser la place à un autre (#136). */
  close(): void {
    this.open.set(false);
  }

  /** Échap, « Fermer » ou clic sur le fond de la fenêtre : fermeture, focus au bouton. */
  protected onCloseRequested(): void {
    this.open.set(false);
    this.closedByUser.emit();
    this.focusToggle();
  }

  /** Catégorie choisie dans la fenêtre (clic ou flèches) : ouverte et retenue. */
  protected chooseCategory(id: SettingsCategoryId): void {
    this.category.set(id);
    writeStoredSettingsCategory(this.categoryStorage, id);
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
    this.onCloseRequested();
  }

  private focusToggle(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.control-panel__toggle')?.focus();
  }
}
