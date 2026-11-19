import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';

import type { CareMode } from '../../sim/care-mode';
import { unsuitableAnimals, unsuitableLine } from '../../sim/care-return';
import { mixWarnings } from '../../sim/compatibility';
import { DEFAULT_ENVIRONMENT_ID, type EnvironmentId } from '../../sim/environment';
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import type { SpeciesId } from '../../sim/species';
import { mixWarningText, SPECIES_LABELS, type SpeciesLabels } from '../../sim/species-catalog';
import { addWarnings, addWarningText } from '../../sim/species-sheet';
import { treatedWaterWarning } from '../../sim/treatment-text';
import { DEFAULT_WATER_READOUT, type WaterReadout } from '../../sim/water-quality';
import { panelCatalog } from './panel-views';
import { SpeciesSheet } from './species-sheet';

/** Nombre lu dans une valeur de formulaire ; une chaîne vide donne `NaN` (et non 0). */
function toNumber(value: string | number): number {
  return typeof value === 'string' && value.trim() === '' ? Number.NaN : Number(value);
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

/**
 * Section « Population » du panneau « Réglages » (#69, #189 ; sortie du panneau au #697).
 *
 * Par espèce, le nom sur sa ligne, puis « − », un curseur (échelle de 0 au maximum de
 * l'espèce, valeur ramenée au maximum fourni par l'hôte et réécrite), un champ numérique
 * (entier de 0 à ce maximum, validé à Entrée ou en quittant le champ, réglable aux flèches) et
 * « + ». À une borne, le bouton reste focalisable (`aria-disabled`) et sans effet.
 *
 * Fiches (#237) : à côté du nom, un bouton « Fiche » (disclosure, `aria-expanded`) ouvre sous
 * la ligne la fiche de l'espèce (`species-sheet.ts`). Une seule fiche ouverte à la fois ;
 * Échap ou « Fermer la fiche » la referme et rend le focus au bouton. Après un ajout, des
 * lignes d'avertissement sous la ligne de l'espèce si le bac ne lui convient pas.
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-population-section]',
  imports: [SpeciesSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './population-section.scss',
  template: `
    <legend class="control-panel__legend">Population</legend>
    <!-- Plafond d'animaux de la pièce (#392, ADR 0096) : pourquoi « + » ne fait plus rien. -->
    @if (populationNotice(); as notice) {
      <p class="control-panel__note control-panel__warning" role="status" data-room-cap>
        {{ notice }}
      </p>
    }
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
      <!-- Fiche de l'espèce (#237), composant à part (#255). -->
      @if (openSheet() === id) {
        <app-species-sheet [entry]="entry" (closed)="closeSheet(id, $event)" />
      }
    } @empty {
      <p class="control-panel__note" data-population-empty>Aucune espèce pour l’instant.</p>
    }
    <!-- Mélanges déconseillés (#209) : couples d'espèces présentes incompatibles. -->
    @for (text of mixTexts(); track text) {
      <p class="control-panel__note control-panel__warning" data-mix-warning>{{ text }}</p>
    }
    <!-- Animaux d'un autre milieu gardés au retour en soins (#278, lot 2). -->
    @for (text of milieuTexts(); track text) {
      <p class="control-panel__note control-panel__warning" data-milieu-warning>
        {{ text }}
      </p>
    }
  `,
})
export class PopulationSection {
  /** Environnement du bac affiché. */
  readonly environment = input<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  /** Mode du bac affiché (#278) : catalogue complet et aucun avertissement en décor. */
  readonly careMode = input<CareMode>('soins');
  /** Effectif de chaque espèce. */
  readonly population = input<PopulationCounts>(NO_FISH);
  /** Effectif maximal de chaque espèce, compte tenu des autres. */
  readonly populationMax = input<PopulationCounts>(NO_FISH);
  /** Plafond d'animaux de la pièce atteint (#392) : message de l'hôte, sinon `null`. */
  readonly populationNotice = input<string | null>(null);
  /** Litres d'eau du bac (#237) ; `null` : inconnus. */
  readonly tankLiters = input<number | null>(null);
  /** Relevé de l'eau (produits de traitement, température). */
  readonly water = input<WaterReadout>(DEFAULT_WATER_READOUT);

  /** Effectif demandé pour une espèce (déjà borné à [0, maximum]). */
  readonly populationChanged = output<PopulationRequest>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Catalogue des espèces de l'environnement affiché (#88, #189). */
  protected readonly catalog = computed(() => panelCatalog(this.environment(), this.careMode()));
  /**
   * Libellés des mélanges déconseillés de la population affichée (#209), dans l'ordre du
   * catalogue (`mixWarnings`, `sim/compatibility.ts`).
   */
  protected readonly mixTexts = computed(() =>
    // Mode décor (#278) : aucun avertissement.
    (this.careMode() === 'decor'
      ? []
      : mixWarnings(
          this.catalog().map((entry) => entry.species),
          this.population(),
        )
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
   * Avertissements de la dernière espèce ajoutée (#237), recalculés sur la population, le
   * volume et l'eau courants : ils disparaissent quand le bac convient de nouveau (produit de
   * traitement toxique pour l'espèce, #374, compris).
   */
  protected readonly addTexts = computed(() => {
    const id = this.lastAdded();
    if (id === null || this.careMode() === 'decor') {
      return [];
    }
    const population = this.population();
    const texts = addWarnings(
      id,
      population[id],
      this.tankLiters() ?? Number.NaN,
      population,
      this.catalog().map((entry) => entry.species),
    ).map(addWarningText);
    // Amphibien ajouté dans une eau déjà traitée (#374) : le produit lui est toxique.
    const treated = treatedWaterWarning(id, this.water().products);
    return treated === null ? texts : [...texts, treated];
  });
  /**
   * Avertissements en mode soins des animaux d'un autre milieu gardés (#278, lot 2) : les
   * autres raisons ont déjà les leurs (mélanges, ajout, tableau de bord). Volume inconnu : pas
   * de contrôle de volume.
   */
  protected readonly milieuTexts = computed(() =>
    this.careMode() === 'decor'
      ? []
      : unsuitableAnimals({
          environment: this.environment(),
          counts: this.population(),
          liters: this.tankLiters() ?? Number.NaN,
          temperature: this.water().temperature,
        })
          .filter((animal) => animal.reason.kind === 'milieu')
          .map(unsuitableLine),
  );

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
