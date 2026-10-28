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
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import { type SpeciesId } from '../../sim/species';
import { addWarnings, addWarningText } from '../../sim/species-sheet';
import { wikiLists, wikiSheet } from '../../sim/species-wiki';
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
 * Wiki des espèces, lot 1/2 (issue #287, ADR 0066) : bouton discret (en bas à droite, dans la
 * ligne des boutons du haut sur écran étroit), panneau flottant avec une recherche, la liste
 * des espèces du bac et de celles qu'on peut y ajouter, et la fiche de chacune
 * (`sim/species-wiki.ts`). Exclusif avec « Réglages » et « Commandes » : c'est l'application
 * qui replie les autres (`opened`, `close`). Échap ferme la fiche, puis le wiki, où que soit
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

  /** « Ajouter au bac » : un individu de plus (borné par `populationMax`). */
  readonly populationChanged = output<PopulationRequest>();
  /** Ouvert par l'utilisateur : l'application replie les autres panneaux. */
  readonly opened = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Wiki ouvert (fermé par défaut : captures et premier regard inchangés). */
  readonly open = signal(false);
  protected readonly panelId = SPECIES_WIKI_ID;
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

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected select(id: SpeciesId): void {
    this.selected.set(id);
    this.lastAdded.set(null);
    this.focus('[data-wiki-back]');
  }

  /** Retour à la liste, focus sur l'espèce qu'on quittait. */
  protected back(): void {
    const id = this.selected();
    this.selected.set(null);
    this.lastAdded.set(null);
    this.focus(id === null ? 'input[type="search"]' : `[data-wiki-species="${id}"]`);
  }

  protected add(id: SpeciesId): void {
    const count = this.addCount(id);
    if (count !== null) {
      this.lastAdded.set(id);
      this.populationChanged.emit({ species: id, count });
    }
  }

  /**
   * Échap, écouté sur le document (#289) : ferme la fiche ouverte, sinon le wiki, même si le
   * focus a quitté le wiki (clic sur la scène). Sans effet wiki fermé, ou si un autre élément
   * a déjà traité la touche (`defaultPrevented`, comme l'éditeur de décor).
   */
  protected onEscape(event: Event): void {
    if (!this.open() || event.defaultPrevented) {
      return;
    }
    if (this.selected() !== null) {
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
