import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DEFAULT_LIGHTING_HOURS } from '../../sim/algae';
import type { CareMode } from '../../sim/care-mode';
import type { GuidePage } from '../../sim/care-guide';
import { MAX_CATAPPA_LEAVES } from '../../sim/catappa';
import { formatHour } from '../../sim/daylight';
import { DEFAULT_LAMP_ON_HOUR, LAMP_MAX_HOURS, LAMP_MIN_HOURS, isLampOnHour } from '../../sim/lamp';
import type { PhRegulatorDirection } from '../../sim/ph-regulator';
import type { TreatmentNotice } from '../../sim/treatment-text';
import { MAX_HEATER_TEMPERATURE, MIN_HEATER_TEMPERATURE } from '../../sim/water';
import type { ConditionerKind } from '../../sim/water-conditioner';
import { CURRENT_LEVEL_LABELS, type CurrentLevel } from '../../sim/water-current';
import { formatTenth } from '../../sim/water-dashboard';
import { DEFAULT_WATER_READOUT, type WaterReadout } from '../../sim/water-quality';
import { formNumber } from './panel-views';
import { TreatmentNotice as TreatmentNoticeView } from './treatment-notice';

/** Pas du curseur du chauffage, en °C (#207). */
export const HEATER_SLIDER_STEP = 0.5;

/** Libellé de la durée d'éclairage (#476) : « 8 h par jour ». */
export function lightingText(hours: number): string {
  return `${hours} h par jour`;
}

/**
 * Durée d'éclairage lue sur le curseur (#476, #584) : entier dans [`LAMP_MIN_HOURS`,
 * `LAMP_MAX_HOURS`] (4 à 14 h), `null` sinon.
 */
export function sliderLighting(value: string | number): number | null {
  const h = formNumber(value);
  return Number.isInteger(h) && h >= LAMP_MIN_HOURS && h <= LAMP_MAX_HOURS ? h : null;
}

/** Heure d'allumage de la lampe lue sur le curseur (#584) : entier de 0 à 23, `null` sinon. */
export function sliderLampOn(value: string | number): number | null {
  const h = formNumber(value);
  return isLampOnHour(h) ? h : null;
}

/** Libellé de l'heure d'allumage (#584) : « allumée à 10:00 ». */
export function lampOnText(hour: number): string {
  return `allumée à ${formatHour(hour)}`;
}

/** Température lue sur le curseur du chauffage (une chaîne), `null` hors des bornes. */
export function sliderHeater(value: string | number): number | null {
  const t = formNumber(value);
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

/**
 * Section « Eau » du panneau « Réglages » (#207 ; sortie du panneau au #697) : ce qui se
 * règle seulement (courant, changement d'eau, chauffage, éclairage et lampe, outils
 * d'entretien, produits, feuilles de catappa) ; les jauges sont dans le tableau de bord
 * (#256). Sans section « Soins », le message du dernier produit s'affiche ici (#490).
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-water-section]',
  imports: [TreatmentNoticeView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './water-section.scss',
  template: `
    <legend class="control-panel__legend control-panel__legend--row">
      <span id="panneau-eau-titre">Eau</span>
      <!-- Courant (#460) : sur la ligne du titre, le panneau ne grandit pas (docs/PIEGES.md). -->
      <button
        type="button"
        class="control-panel__edit"
        data-current
        [attr.data-level]="current()"
        [attr.aria-label]="'Courant : ' + currentLabels[current()] + ', changer de force'"
        (click)="currentToggled.emit()"
      >
        Courant : {{ currentLabels[current()] }}
      </button>
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
    <!-- Éclairage (#476, lampe #584) : 4 à 14 h par jour ; au-delà de 10 h, les algues
         poussent, sous 8 h les plantes ralentissent. Puis l'heure d'allumage, sur la même
         ligne (le panneau ne grandit pas à 1280 × 720, docs/PIEGES.md) : valeurs courtes à
         l'écran, phrases entières pour les lecteurs d'écran. -->
    <div class="control-panel__row control-panel__row--halves">
      <label class="control-panel__field" for="panneau-eclairage">
        <span class="control-panel__label">
          Éclairage
          <output class="control-panel__value" aria-hidden="true">{{ lighting() }} h</output>
        </span>
        <input
          id="panneau-eclairage"
          class="control-panel__range"
          aria-label="Durée d’éclairage par jour"
          type="range"
          min="4"
          max="14"
          step="1"
          data-lighting
          [value]="lighting()"
          [attr.aria-valuetext]="lightingLabel()"
          (input)="onLighting($event)"
        />
      </label>
      <label class="control-panel__field" for="panneau-lampe">
        <span class="control-panel__label">
          Lampe
          <output class="control-panel__value" aria-hidden="true">{{ lampOnShort() }}</output>
        </span>
        <input
          id="panneau-lampe"
          class="control-panel__range"
          aria-label="Heure d’allumage de la lampe"
          type="range"
          min="0"
          max="23"
          step="1"
          data-lamp-on
          [value]="lampOn()"
          [attr.aria-valuetext]="lampOnLabel()"
          (input)="onLampOn($event)"
        />
      </label>
    </div>
    @if (careMode() !== 'decor') {
      <!-- Amorce de bactéries (#529) : un produit. Raclette et sécateur sont passés dans la
           barre du bas, avec les vues (#722, docs/INTERFACE.md section 2). -->
      <div class="control-panel__row control-panel__row--halves" role="group" aria-label="Filtre">
        <button
          type="button"
          class="control-panel__edit"
          data-bacteria-starter
          aria-label="Verser une dose d’amorce de bactéries nitrifiantes"
          title="Source : docs/SOINS.md § 1.1 (étiquette Stability, secondaire) ; gain du filtre : approximation de jeu."
          (click)="bacteriaStarterRequested.emit()"
        >
          Bactéries
        </button>
      </div>
    }
    @if (careMode() !== 'decor') {
      <!-- Chlore (#530) : eau versée au changement d'eau, puis conditionneurs. Rangée à part :
           six boutons sur une ligne se chevauchent (docs/PIEGES.md). -->
      <div
        class="control-panel__row control-panel__row--halves"
        role="group"
        aria-label="Eau du robinet et conditionneurs"
      >
        <button
          type="button"
          class="control-panel__edit"
          data-untreated-tap
          [attr.aria-pressed]="untreatedTap()"
          aria-label="Eau du robinet non traitée"
          title="Non traitée : chaque changement d’eau ajoute du chlore (docs/SOINS.md § 2 ; teneur : approximation de jeu)."
          (click)="untreatedTapToggled.emit()"
        >
          Robinet
        </button>
        <button
          type="button"
          class="control-panel__edit"
          data-conditioner="thiosulfate"
          aria-label="Verser du conditionneur au thiosulfate (chlore)"
          title="Source : docs/SOINS.md § 2 (Merck)."
          (click)="conditionerRequested.emit('thiosulfate')"
        >
          Déchlorer
        </button>
        <button
          type="button"
          class="control-panel__edit"
          data-conditioner="liant"
          aria-label="Verser du conditionneur liant l’ammoniaque"
          title="Source : docs/SOINS.md § 2 (étiquette via revendeurs, secondaire) ; 48 h revendiquées, non vérifiées."
          (click)="conditionerRequested.emit('liant')"
        >
          Liant
        </button>
      </div>
      <!-- Charbon actif et régulateur de pH (#531) : rangée à part : la précédente ne passe
           pas à la ligne (docs/PIEGES.md). -->
      <div
        class="control-panel__row control-panel__row--halves"
        role="group"
        aria-label="Charbon actif et régulateur de pH"
      >
        <button
          type="button"
          class="control-panel__edit"
          data-carbon
          [attr.aria-pressed]="carbon()"
          aria-label="Charbon actif dans le filtre"
          title="Retire médicaments et couleur des tanins ; à enlever pendant un traitement (docs/SOINS.md, Merck)."
          (click)="carbonToggled.emit()"
        >
          Charbon
        </button>
        <button
          type="button"
          class="control-panel__edit"
          data-ph-regulator="-1"
          aria-label="Baisser le pH d’un cran"
          title="Au plus 0,3 de pH par jour : les variations brusques stressent les animaux (approximation de jeu)."
          (click)="phRegulatorRequested.emit(-1)"
        >
          pH −
        </button>
        <button
          type="button"
          class="control-panel__edit"
          data-ph-regulator="1"
          aria-label="Monter le pH d’un cran"
          title="Au plus 0,3 de pH par jour : les variations brusques stressent les animaux (approximation de jeu)."
          (click)="phRegulatorRequested.emit(1)"
        >
          pH +
        </button>
      </div>
    }
    @if (!careShown() && treatmentNotice(); as notice) {
      <!-- Sans section « Soins », le message du produit s'affiche ici (même bulle, #490). -->
      <app-treatment-notice
        class="control-panel__message"
        [class.control-panel__message--error]="!notice.ok"
        data-starter-message
        [notice]="notice"
        (wikiPageRequested)="wikiPageRequested.emit($event)"
      />
    }
    <!-- Feuilles de catappa (#239) : « − », nombre, « + », puis le rappel que l'effet est
         simplifié (approximation de jeu, ADR 0071). -->
    <div class="control-panel__count" data-catappa>
      <span
        class="control-panel__count-label"
        id="panneau-catappa"
        title="Effet simplifié : ne remplace pas un test de pH."
        >Feuilles de catappa</span
      >
      <button
        type="button"
        class="control-panel__step"
        aria-label="Retirer une feuille de catappa"
        [attr.aria-disabled]="water().catappa <= 0"
        (click)="stepCatappa(-1)"
      >
        −
      </button>
      <output class="control-panel__value" aria-labelledby="panneau-catappa" data-catappa-count>
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
  `,
})
export class WaterSection {
  /** Mode du bac affiché (#278) : aucun produit en décor. */
  readonly careMode = input<CareMode>('soins');
  /** Section « Soins » affichée (#361) : le message d'un produit y va plutôt qu'ici. */
  readonly careShown = input(false);
  /** Force du courant du bac (#460). */
  readonly current = input<CurrentLevel>('coupe');
  /** Relevé de l'eau (#207). */
  readonly water = input<WaterReadout>(DEFAULT_WATER_READOUT);
  /** Durée d'éclairage du bac, en heures par jour (#476). */
  readonly lighting = input(DEFAULT_LIGHTING_HOURS);
  /** Heure d'allumage de la lampe (#584). */
  readonly lampOn = input(DEFAULT_LAMP_ON_HOUR);
  /** Message du dernier geste de soin (#361) ; `null` : aucun. */
  readonly treatmentNotice = input<TreatmentNotice | null>(null);
  /** Changements d'eau à l'eau du robinet non traitée (#530). */
  readonly untreatedTap = input(false);
  /** Charbon actif dans le filtre (#531). */
  readonly carbon = input(false);

  /** Force suivante du courant demandée (#460). */
  readonly currentToggled = output<void>();
  /** Bouton « Changer l'eau » (#207). */
  readonly waterChangeRequested = output<void>();
  /** Consigne du chauffage choisie au curseur, en °C (#207). */
  readonly heaterChanged = output<number>();
  /** Durée d'éclairage demandée (#476, #584), en heures entières dans [4, 14]. */
  readonly lightingChanged = output<number>();
  /** Heure d'allumage de la lampe demandée (#584), heure entière dans [0, 23]. */
  readonly lampOnChanged = output<number>();
  /** Dose d'amorce de bactéries demandée (#529). */
  readonly bacteriaStarterRequested = output<void>();
  /** Bascule de l'eau du robinet entre traitée et non traitée (#530). */
  readonly untreatedTapToggled = output<void>();
  /** Dose de conditionneur demandée (#530). */
  readonly conditionerRequested = output<ConditionerKind>();
  /** Bascule du charbon actif (#531). */
  readonly carbonToggled = output<void>();
  /** Dose de régulateur de pH demandée (#531). */
  readonly phRegulatorRequested = output<PhRegulatorDirection>();
  /** Lien « Produits et traitements » du message d'un produit (#554). */
  readonly wikiPageRequested = output<GuidePage>();
  /** Nombre de feuilles de catappa demandé (#239), dans [0, `MAX_CATAPPA_LEAVES`]. */
  readonly catappaChanged = output<number>();

  protected readonly currentLabels = CURRENT_LEVEL_LABELS;
  /** Nombre maximal de feuilles de catappa (#239). */
  protected readonly maxCatappa = MAX_CATAPPA_LEAVES;
  protected readonly heaterLabel = computed(() => heaterText(this.water()));
  protected readonly lightingLabel = computed(() => lightingText(this.lighting()));
  protected readonly lampOnLabel = computed(() => lampOnText(this.lampOn()));
  protected readonly lampOnShort = computed(() => formatHour(this.lampOn()));

  protected onHeater(event: Event): void {
    const temperature = sliderHeater((event.target as HTMLInputElement).value);
    if (temperature !== null) {
      this.heaterChanged.emit(temperature);
    }
  }

  protected onLighting(event: Event): void {
    const hours = sliderLighting((event.target as HTMLInputElement).value);
    if (hours !== null) {
      this.lightingChanged.emit(hours);
    }
  }

  protected onLampOn(event: Event): void {
    const hour = sliderLampOn((event.target as HTMLInputElement).value);
    if (hour !== null) {
      this.lampOnChanged.emit(hour);
    }
  }

  /** « − » ou « + » des feuilles de catappa (#239) : sans effet aux bornes. */
  protected stepCatappa(delta: -1 | 1): void {
    const count = this.water().catappa + delta;
    if (count >= 0 && count <= MAX_CATAPPA_LEAVES) {
      this.catappaChanged.emit(count);
    }
  }
}
