import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';

import { type EnvironmentId, DEFAULT_ENVIRONMENT_ID, environmentById } from '../../sim/environment';
import {
  CARE_DISCLAIMER,
  GUIDE_PAGE_TITLES,
  GUIDE_PAGES,
  guideView,
  type GuidePage,
} from '../../sim/care-guide';
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import { type SpeciesId } from '../../sim/species';
import { addWarnings, addWarningText } from '../../sim/species-sheet';
import { tankComparison } from '../../sim/species-care';
import { wikiCare, wikiLists, wikiSheet } from '../../sim/species-wiki';
import type { PopulationRequest } from '../control-panel/control-panel';

/** Identifiant du panneau (cible de `aria-controls`). */
export const SPECIES_WIKI_ID = 'wiki-especes';

/**
 * Effectif demandé par « Ajouter » dans la fiche de `id` : un individu de plus, comme le
 * bouton « + » du panneau « Population » ; `null` si le bac est plein pour cette espèce.
 */
export function wikiAddCount(
  id: SpeciesId,
  counts: PopulationCounts,
  max: PopulationCounts,
): number | null {
  const next = counts[id] + 1;
  return next <= max[id] ? next : null;
}

/**
 * Wiki des espèces (issues #287 et #291, ADR 0066 et 0068) : bouton discret (en bas à droite, dans la
 * ligne des boutons du haut sur écran étroit), panneau flottant avec une recherche, la liste
 * des espèces du bac et de celles qu'on peut y ajouter, et la fiche de chacune
 * (`sim/species-wiki.ts`) : besoins, comparaison avec l'eau du bac, alimentation, cohabitation ;
 * deux pages transversales, « Produits et traitements » et « Maladies » (`sim/care-guide.ts`).
 * Exclusif avec « Réglages » et « Commandes » : c'est l'application
 * qui replie les autres (`opened`, `close`). Échap ferme la fiche ou la page, puis le wiki, où que soit
 * le focus (#289) : après un clic sur la scène, il n'est plus dans le wiki.
 */
@Component({
  selector: 'app-species-wiki',
  template: `<button
      type="button"
      class="species-wiki__toggle"
      [class.species-wiki__toggle--open]="open()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="panelId"
      aria-label="Wiki des espèces"
      data-wiki-toggle
      (click)="toggle()"
    >
      Wiki
    </button>
    @if (open()) {
      <section class="species-wiki" [id]="panelId" aria-labelledby="wiki-especes-titre">
        <div class="species-wiki__header">
          <h2 class="species-wiki__title" id="wiki-especes-titre">Wiki des espèces</h2>
          <button type="button" class="species-wiki__button" (click)="close(true)">Fermer</button>
        </div>
        @if (sheet(); as view) {
          <article
            class="species-wiki__sheet"
            role="region"
            [attr.aria-labelledby]="'wiki-fiche-' + view.species"
            [attr.data-wiki-sheet]="view.species"
          >
            <h3 class="species-wiki__name" [id]="'wiki-fiche-' + view.species">
              {{ view.name }}
              <span class="species-wiki__latin">{{ view.scientificName }}</span>
            </h3>
            @for (item of view.notes; track item.text) {
              <p class="species-wiki__warning" data-wiki-note>
                {{ item.text }}
                <small class="species-wiki__status">{{ item.status }}</small>
              </p>
            }
            <h4 class="species-wiki__section">Comparaison avec le bac</h4>
            <dl class="species-wiki__rows">
              @for (row of comparison(); track row.parameter) {
                <div
                  class="species-wiki__row"
                  [attr.data-wiki-compare]="row.parameter"
                  [attr.data-fit]="row.fit"
                >
                  <dt>{{ row.label }}</dt>
                  <dd>
                    Bac : {{ row.tank }} ;
                    <strong class="species-wiki__fit">{{ row.fitLabel }}</strong>
                    <small class="species-wiki__status"
                      >Préférée : {{ row.preferred }}
                      @if (row.fit !== 'dans-la-plage') {
                        ; {{ row.gap }}
                      }
                    </small>
                  </dd>
                </div>
              }
            </dl>
            <h4 class="species-wiki__section">Besoins</h4>
            <dl class="species-wiki__rows">
              @for (row of view.rows; track row.field) {
                <div class="species-wiki__row" [attr.data-wiki-field]="row.field">
                  <dt>{{ row.label }}</dt>
                  <dd>
                    {{ row.value }}
                    <small class="species-wiki__status" data-wiki-status>{{ row.status }}</small>
                  </dd>
                </div>
              }
            </dl>
            @if (care(); as care) {
              <h4 class="species-wiki__section">Alimentation</h4>
              <dl class="species-wiki__rows">
                @for (row of care.feeding; track row.field) {
                  <div class="species-wiki__row" [attr.data-wiki-feeding]="row.field">
                    <dt>{{ row.label }}</dt>
                    <dd>
                      {{ row.value }}
                      <small class="species-wiki__status">{{ row.status }}</small>
                    </dd>
                  </div>
                }
              </dl>
              <h4 class="species-wiki__section">Cohabitation</h4>
              <ul class="species-wiki__mates" data-wiki-cohabitation>
                @for (mate of care.cohabitation.avoid; track mate.species) {
                  <li data-wiki-mate="avoid" [attr.data-species]="mate.species">
                    <strong>Déconseillé avec {{ mate.name }}</strong> : {{ mate.reason }}
                  </li>
                }
                @for (mate of care.cohabitation.together; track mate.species) {
                  <li data-wiki-mate="together" [attr.data-species]="mate.species">
                    Compatible avec {{ mate.name }} : {{ mate.reason }}
                  </li>
                }
                @if (care.cohabitation.elsewhere.length > 0) {
                  <li data-wiki-mate="elsewhere">
                    Autres milieux, jamais dans le même bac du jeu :
                    {{ care.cohabitation.elsewhere.join(', ') }}
                  </li>
                }
              </ul>
              <small class="species-wiki__status">{{ care.cohabitation.status }} (ADR 0055)</small>
            }
            @if (lastAdded() === view.species) {
              @for (text of addTexts(); track text) {
                <p class="species-wiki__warning" data-wiki-add-warning>{{ text }}</p>
              }
            }
            <div class="species-wiki__actions">
              @if (addable(view.species)) {
                <button
                  type="button"
                  class="species-wiki__button species-wiki__button--add"
                  [attr.aria-disabled]="addCount(view.species) === null"
                  (click)="add(view.species)"
                >
                  Ajouter au bac
                </button>
              }
              <button type="button" class="species-wiki__button" data-wiki-back (click)="back()">
                Retour à la liste
              </button>
            </div>
          </article>
        } @else if (page(); as current) {
          <article
            class="species-wiki__sheet"
            role="region"
            aria-labelledby="wiki-page-titre"
            [attr.data-wiki-page-view]="current"
          >
            <h3 class="species-wiki__name" id="wiki-page-titre">{{ titles[current] }}</h3>
            <p class="species-wiki__warning">{{ disclaimer }}</p>
            @for (item of guide(); track item.id) {
              <section class="species-wiki__entry" [attr.data-wiki-entry]="item.id">
                <h4 class="species-wiki__section">{{ item.name }}</h4>
                <dl class="species-wiki__rows">
                  @for (line of item.lines; track line.label) {
                    <div class="species-wiki__row">
                      <dt>{{ line.label }}</dt>
                      <dd>{{ line.text }}</dd>
                    </div>
                  }
                </dl>
                <small class="species-wiki__status" data-wiki-status>{{ item.status }}</small>
              </section>
            }
            <div class="species-wiki__actions">
              <button type="button" class="species-wiki__button" data-wiki-back (click)="back()">
                Retour à la liste
              </button>
            </div>
          </article>
        } @else {
          <label class="species-wiki__search">
            <span>Rechercher</span>
            <input
              type="search"
              placeholder="Nom courant ou scientifique"
              autocomplete="off"
              [value]="query()"
              (input)="onSearch($event)"
            />
          </label>
          @let parts = lists();
          <h3 class="species-wiki__group">Dans le bac</h3>
          <ul class="species-wiki__list" data-wiki-list="present">
            @for (entry of parts.present; track entry.species) {
              <li>
                <button
                  type="button"
                  class="species-wiki__item"
                  [attr.data-wiki-species]="entry.species"
                  (click)="select(entry.species)"
                >
                  <span>{{ entry.name }}</span>
                  <span class="species-wiki__count">{{ entry.count }}</span>
                </button>
              </li>
            } @empty {
              <li class="species-wiki__empty">Aucune espèce</li>
            }
          </ul>
          <h3 class="species-wiki__group">Ajoutables ici</h3>
          <ul class="species-wiki__list" data-wiki-list="addable">
            @for (entry of parts.addable; track entry.species) {
              <li>
                <button
                  type="button"
                  class="species-wiki__item"
                  [attr.data-wiki-species]="entry.species"
                  (click)="select(entry.species)"
                >
                  <span>{{ entry.name }}</span>
                  <span class="species-wiki__latin">{{ entry.scientificName }}</span>
                </button>
              </li>
            } @empty {
              <li class="species-wiki__empty">Aucune espèce</li>
            }
          </ul>
          <h3 class="species-wiki__group">Guides</h3>
          <ul class="species-wiki__list">
            @for (id of pages; track id) {
              <li>
                <button
                  type="button"
                  class="species-wiki__item"
                  [attr.data-wiki-page]="id"
                  (click)="openPage(id)"
                >
                  <span>{{ titles[id] }}</span>
                </button>
              </li>
            }
          </ul>
        }
      </section>
    }`,
  styleUrl: './species-wiki.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape($event)' },
})
export class SpeciesWiki {
  /** Environnement affiché : ses espèces sont les seules ajoutables. */
  readonly environment = input<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  /** Effectifs du bac. */
  readonly population = input<PopulationCounts>(NO_FISH);
  /** Effectif maximal de chaque espèce, place restante comprise. */
  readonly populationMax = input<PopulationCounts>(NO_FISH);
  /** Volume d'eau du bac, en litres (`null` : inconnu), pour les avertissements d'ajout. */
  readonly tankLiters = input<number | null>(null);
  /** Température de l'eau du bac, en °C (`NaN` : inconnue), pour la comparaison (#291). */
  readonly waterTemperature = input<number>(Number.NaN);
  /** pH de l'eau du bac (`NaN` : inconnu), pour la comparaison (#291). */
  readonly waterPh = input<number>(Number.NaN);

  /** « Ajouter au bac » : un individu de plus (borné par `populationMax`). */
  readonly populationChanged = output<PopulationRequest>();
  /** Ouvert par l'utilisateur : l'application replie les autres panneaux. */
  readonly opened = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Wiki ouvert (fermé par défaut : captures et premier regard inchangés). */
  readonly open = signal(false);
  protected readonly panelId = SPECIES_WIKI_ID;
  protected readonly pages = GUIDE_PAGES;
  protected readonly titles = GUIDE_PAGE_TITLES;
  protected readonly disclaimer = CARE_DISCLAIMER;
  /** Page transversale affichée (`null` : la liste). */
  protected readonly page = signal<GuidePage | null>(null);
  protected readonly query = signal('');
  /** Espèce dont la fiche est affichée, oubliée au changement d'environnement. */
  protected readonly selected = linkedSignal<EnvironmentId, SpeciesId | null>({
    source: this.environment,
    computation: () => null,
  });
  /** Espèce ajoutée depuis sa fiche, pour ses avertissements (#237). */
  protected readonly lastAdded = linkedSignal<EnvironmentId, SpeciesId | null>({
    source: this.environment,
    computation: () => null,
  });

  protected readonly lists = computed(() =>
    wikiLists(this.environment(), this.population(), this.query()),
  );
  protected readonly sheet = computed(() => {
    const id = this.selected();
    return id === null ? null : wikiSheet(id);
  });
  /** Comparaison de l'espèce affichée avec l'eau du bac (#291). */
  protected readonly comparison = computed(() => {
    const id = this.selected();
    return id === null ? [] : tankComparison(id, this.waterTemperature(), this.waterPh());
  });
  /** Alimentation et cohabitation de l'espèce affichée (#291). */
  protected readonly care = computed(() => {
    const id = this.selected();
    return id === null ? null : wikiCare(id);
  });
  protected readonly guide = computed(() => {
    const current = this.page();
    return current === null ? [] : guideView(current);
  });
  /** Avertissements de l'espèce ajoutée, recalculés sur le bac courant (#237). */
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
      environmentById(this.environment()).species,
    ).map(addWarningText);
  });

  toggle(): void {
    if (this.open()) {
      this.close();
    } else {
      this.open.set(true);
      this.opened.emit();
    }
  }

  /** Ferme le wiki (fiche et recherche oubliées) ; `focusToggle` rend le focus au bouton. */
  close(focusToggle = false): void {
    this.open.set(false);
    this.selected.set(null);
    this.lastAdded.set(null);
    this.page.set(null);
    this.query.set('');
    if (focusToggle) {
      this.focus('[data-wiki-toggle]');
    }
  }

  /** Espèce de l'environnement absente du bac (seule à avoir « Ajouter au bac »). */
  protected addable(id: SpeciesId): boolean {
    return this.lists().addable.some((entry) => entry.species === id) || this.lastAdded() === id;
  }

  protected addCount(id: SpeciesId): number | null {
    return wikiAddCount(id, this.population(), this.populationMax());
  }

  /** Ouvre une page transversale, focus sur son bouton « Retour ». */
  protected openPage(id: GuidePage): void {
    this.page.set(id);
    this.focus('[data-wiki-back]');
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected select(id: SpeciesId): void {
    this.selected.set(id);
    this.lastAdded.set(null);
    this.focus('[data-wiki-back]');
  }

  /** Retour à la liste, focus sur l'espèce ou la page qu'on quittait. */
  protected back(): void {
    const id = this.selected();
    const page = this.page();
    this.selected.set(null);
    this.lastAdded.set(null);
    this.page.set(null);
    this.focus(
      id !== null
        ? `[data-wiki-species="${id}"]`
        : page !== null
          ? `[data-wiki-page="${page}"]`
          : 'input[type="search"]',
    );
  }

  protected add(id: SpeciesId): void {
    const count = this.addCount(id);
    if (count !== null) {
      this.lastAdded.set(id);
      this.populationChanged.emit({ species: id, count });
    }
  }

  /**
   * Échap, écouté sur le document (#289) : ferme la fiche ou la page ouverte, sinon le wiki, même si le
   * focus a quitté le wiki (clic sur la scène). Sans effet wiki fermé, ou si un autre élément
   * a déjà traité la touche (`defaultPrevented`, comme l'éditeur de décor).
   */
  protected onEscape(event: Event): void {
    if (!this.open() || event.defaultPrevented) {
      return;
    }
    if (this.selected() !== null || this.page() !== null) {
      this.back();
    } else {
      this.close(true);
    }
  }

  /** Donne le focus au premier élément `selector` du wiki, une fois la vue à jour. */
  private focus(selector: string): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(selector)
          ?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }
}
