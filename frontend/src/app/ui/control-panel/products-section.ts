import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { CareMode } from '../../sim/care-mode';
import type { GuidePage } from '../../sim/care-guide';
import { MAX_CATAPPA_LEAVES } from '../../sim/catappa';
import type { PhRegulatorDirection } from '../../sim/ph-regulator';
import type { TreatmentNotice } from '../../sim/treatment-text';
import type { ConditionerKind } from '../../sim/water-conditioner';
import { DEFAULT_WATER_READOUT, type WaterReadout } from '../../sim/water-quality';
import { SettingMark } from '../settings-window/settings-search-filter';
import { TreatmentNotice as TreatmentNoticeView } from './treatment-notice';

/**
 * Section « Produits » du panneau « Réglages » (#762, sortie de la section « Eau ») : amorce de
 * bactéries, eau du robinet et conditionneurs, charbon actif et régulateur de pH, feuilles de
 * catappa, avec le rappel que leurs effets sont simplifiés. Catégorie « Soins et produits »
 * de la fenêtre (`docs/INTERFACE.md` section 2). Sans section « Soins », le message du dernier
 * produit s'affiche ici (#490).
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-products-section]',
  imports: [TreatmentNoticeView, SettingMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './products-section.scss',
  template: `
    <legend class="control-panel__legend"><span id="panneau-produits-titre">Produits</span></legend>
    @if (careMode() !== 'decor') {
      <!-- Amorce de bactéries (#529). -->
      <div class="control-panel__row control-panel__row--halves" role="group" aria-label="Filtre">
        <button
          type="button"
          class="control-panel__edit"
          data-bacteria-starter
          appSetting="Bactéries"
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
          appSetting="Robinet"
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
          appSetting="Déchlorer"
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
          appSetting="Liant"
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
          appSetting="Charbon"
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
          appSetting="pH −"
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
          appSetting="pH +"
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
    <div class="control-panel__count" data-catappa appSetting="Feuilles de catappa">
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
    <p class="control-panel__note" data-catappa-note appSetting="Feuilles de catappa">
      Effet simplifié : ne remplace pas un test de pH.
    </p>
  `,
})
export class ProductsSection {
  /** Mode du bac affiché (#278) : aucun produit en décor. */
  readonly careMode = input<CareMode>('soins');
  /** Section « Soins » affichée (#361) : le message d'un produit y va plutôt qu'ici. */
  readonly careShown = input(false);
  /** Relevé de l'eau (#207) : nombre de feuilles de catappa. */
  readonly water = input<WaterReadout>(DEFAULT_WATER_READOUT);
  /** Message du dernier geste de soin (#361) ; `null` : aucun. */
  readonly treatmentNotice = input<TreatmentNotice | null>(null);
  /** Changements d'eau à l'eau du robinet non traitée (#530). */
  readonly untreatedTap = input(false);
  /** Charbon actif dans le filtre (#531). */
  readonly carbon = input(false);

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

  /** Nombre maximal de feuilles de catappa (#239). */
  protected readonly maxCatappa = MAX_CATAPPA_LEAVES;

  /** « − » ou « + » des feuilles de catappa (#239) : sans effet aux bornes. */
  protected stepCatappa(delta: -1 | 1): void {
    const count = this.water().catappa + delta;
    if (count >= 0 && count <= MAX_CATAPPA_LEAVES) {
      this.catappaChanged.emit(count);
    }
  }
}
