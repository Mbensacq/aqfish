import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  output,
  signal,
} from '@angular/core';

import { isTypingContext } from '../../core/keyboard/keyboard';
import { trapTab } from './focus-trap';
import { PHONE_LAYOUT } from './phone-layout';
import {
  categoriesOf,
  DEFAULT_SETTINGS_CATEGORY,
  neighbourCategory,
  SETTINGS_GROUPS,
  settingsCategory,
  type SettingsCategoryId,
} from './settings-categories';
import type { SettingsSearchResult } from './settings-index';

/** Identifiant de la fenêtre (cible de `aria-controls` du bouton « Réglages »). */
export const SETTINGS_WINDOW_ID = 'fenetre-reglages';

/**
 * Fenêtre modale des réglages, bureau (#722, `docs/INTERFACE.md` section 2) : page assombrie
 * derrière (le bac continue de vivre), à gauche le titre « Réglages », le champ de recherche
 * et les catégories par groupe ; à droite le titre et l'explication de la catégorie ouverte,
 * puis son contenu, projeté par le parent (`ng-content`) selon `selected`.
 *
 * Clavier : le focus entre sur la catégorie ouverte ; Tab et Maj+Tab tournent dans la
 * fenêtre ; flèches haut et bas d'une catégorie à l'autre (en boucle) ; `/` place le focus
 * dans la recherche ; Échap ou un clic sur le fond demandent la
 * fermeture (`closeRequested`), le parent rend le focus au bouton « Réglages ». Un Échap déjà
 * traité par le contenu (fiche, confirmation : `defaultPrevented`) est ignoré.
 *
 * Téléphone (moins de 640 px, tranche 3) : panneau qui monte du bas ; d'abord la recherche et
 * la liste des catégories, chacune avec sa valeur résumée (`summaries`), puis, une catégorie
 * touchée, son contenu seul avec « Retour » (focus rendu à la catégorie). Le bloc non montré
 * est masqué (`hidden`) : ni lu, ni atteint au clavier.
 *
 * Recherche (#723) : la requête (`query`) est relayée au parent, qui fournit les résultats
 * (`results`, index de `settings-index.ts`) et montre sous la liste les sections qui portent
 * ces réglages, pour les régler sur place. Le nom de catégorie d'un résultat y mène ; Entrée
 * ouvre le premier ; aucun résultat : un message et la liste des catégories. Sur téléphone, les
 * résultats remplacent la liste des catégories sous le champ.
 */
@Component({
  selector: 'app-settings-window',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-window.scss',
  // Clic sur le fond : écouté sur l'hôte, le fond n'est pas un contrôle (lecteurs d'écran).
  host: { '(keydown)': 'onKeydown($event)', '(click)': 'onClick($event)' },
  template: `
    <div class="settings-window__backdrop" data-settings-backdrop aria-hidden="true"></div>
    <div
      class="settings-window"
      [class.settings-window--phone-list]="phone() && showList() && !searching()"
      [id]="windowId"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fenetre-reglages-titre"
      data-settings-window
      [attr.data-settings-layout]="phone() ? 'telephone' : 'bureau'"
    >
      <div class="settings-window__side">
        <div class="settings-window__header">
          <h2 class="settings-window__title" id="fenetre-reglages-titre">Réglages</h2>
          <button
            type="button"
            class="settings-window__close"
            aria-label="Fermer"
            data-settings-close
            (click)="close()"
          >
            ×
          </button>
        </div>
        <div class="settings-window__browse" [hidden]="!showList()" data-settings-list>
          <input
            class="settings-window__search"
            type="search"
            aria-label="Rechercher un réglage"
            placeholder="Rechercher (touche /)"
            data-settings-search
            [value]="query()"
            (input)="onSearch($event)"
            (keydown.enter)="openFirst($event)"
          />
          <nav
            class="settings-window__nav"
            aria-label="Catégories des réglages"
            [hidden]="phone() && searching()"
          >
            @for (group of groups; track group.name) {
              <p class="settings-window__group" [id]="'reglages-groupe-' + $index">
                {{ group.name }}
              </p>
              <ul
                class="settings-window__list"
                [attr.aria-labelledby]="'reglages-groupe-' + $index"
              >
                @for (category of group.categories; track category.id) {
                  <li>
                    <button
                      type="button"
                      class="settings-window__category"
                      [class.settings-window__category--open]="category.id === selected()"
                      [attr.aria-current]="category.id === selected() ? 'true' : null"
                      [attr.data-settings-category]="category.id"
                      [attr.aria-describedby]="phone() ? 'reglages-resume-' + category.id : null"
                      (click)="choose(category.id)"
                    >
                      <span class="settings-window__category-title">{{ category.title }}</span>
                      @if (phone()) {
                        <span
                          class="settings-window__summary"
                          [id]="'reglages-resume-' + category.id"
                          aria-hidden="true"
                          data-settings-summary
                          >{{ summaries()[category.id] ?? '' }}</span
                        >
                      }
                    </button>
                  </li>
                }
              </ul>
            }
          </nav>
        </div>
      </div>
      <section
        class="settings-window__content"
        aria-labelledby="fenetre-reglages-categorie"
        [attr.data-settings-content]="selected()"
        [hidden]="!showContent()"
      >
        @if (phone() && !searching()) {
          <button type="button" class="settings-window__back" data-settings-back (click)="back()">
            ‹ Retour
          </button>
        }
        @if (searching()) {
          <h3 class="settings-window__heading" id="fenetre-reglages-categorie">Résultats</h3>
          @if (results().length > 0) {
            <ul class="settings-window__results" data-settings-results>
              @for (result of results(); track result.kind + result.name) {
                <li class="settings-window__result" [attr.data-settings-result]="result.name">
                  <span class="settings-window__result-name">{{ result.name }}</span>
                  <span
                    class="settings-window__result-text"
                    [class.settings-window__result-text--scientific]="result.kind === 'espece'"
                    >{{ result.explanation }}</span
                  >
                  <button
                    type="button"
                    class="settings-window__result-category"
                    [attr.data-settings-result-category]="result.category"
                    (click)="openResult(result)"
                  >
                    {{ result.categoryTitle }}
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p class="settings-window__explanation" role="status" data-settings-no-result>
              Aucun réglage ne correspond à « {{ query().trim() }} ». Les catégories :
            </p>
            <ul class="settings-window__results">
              @for (entry of allCategories; track entry.id) {
                <li>
                  <button
                    type="button"
                    class="settings-window__result-category"
                    [attr.data-settings-result-category]="entry.id"
                    (click)="openCategory(entry.id)"
                  >
                    {{ entry.title }}
                  </button>
                </li>
              }
            </ul>
          }
        } @else {
          <h3 class="settings-window__heading" id="fenetre-reglages-categorie">
            {{ category().title }}
          </h3>
          <p class="settings-window__explanation">{{ category().explanation }}</p>
        }
        <ng-content />
      </section>
    </div>
  `,
})
export class SettingsWindow {
  /** Catégorie ouverte (le parent affiche son contenu). */
  readonly selected = model<SettingsCategoryId>(DEFAULT_SETTINGS_CATEGORY);
  /** Valeur résumée de chaque catégorie, sous son titre dans la liste du téléphone. */
  readonly summaries = input<Partial<Record<SettingsCategoryId, string>>>({});
  /** Texte de la recherche (#723), relayé au parent qui calcule les résultats. */
  readonly query = model('');
  /** Résultats de la recherche courante, dans l'ordre de pertinence (#723). */
  readonly results = input<readonly SettingsSearchResult[]>([]);
  /** Échap, bouton « Fermer » ou clic sur le fond : le parent ferme la fenêtre. */
  readonly closeRequested = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly windowId = SETTINGS_WINDOW_ID;
  protected readonly groups = SETTINGS_GROUPS.map((name) => ({
    name,
    categories: categoriesOf(name),
  }));
  protected readonly category = computed(() => settingsCategory(this.selected()));
  protected readonly allCategories = this.groups.flatMap((group) => group.categories);
  /** Vrai pendant une recherche (requête non blanche) : les résultats remplacent la catégorie. */
  protected readonly searching = computed(() => this.query().trim() !== '');

  /** Vrai sous 640 px : panneau du téléphone, liste puis contenu (tranche 3). */
  protected readonly phone = inject(PHONE_LAYOUT);
  /** Téléphone : liste des catégories (à l'ouverture) ou contenu de la catégorie touchée. */
  private readonly phoneView = signal<'liste' | 'contenu'>('liste');
  protected readonly showList = computed(() => !this.phone() || this.phoneView() === 'liste');
  protected readonly showContent = computed(
    () => !this.phone() || this.phoneView() === 'contenu' || this.searching(),
  );

  constructor() {
    afterNextRender(() => this.focusCategory());
  }

  protected close(): void {
    this.closeRequested.emit();
  }

  /** Catégorie touchée : ouverte ; sur téléphone, son contenu remplace la liste. */
  protected choose(id: SettingsCategoryId): void {
    this.selected.set(id);
    if (this.phone()) {
      this.phoneView.set('contenu');
      this.afterRender(() =>
        this.host.nativeElement.querySelector<HTMLElement>('[data-settings-back]')?.focus(),
      );
    }
  }

  /** Saisie dans la recherche. */
  protected onSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.query.set(event.target.value);
    }
  }

  /** Entrée dans la recherche : le premier résultat s'ouvre (sans résultat : rien). */
  protected openFirst(event: Event): void {
    const first = this.results()[0];
    if (!this.searching() || first === undefined) {
      return;
    }
    event.preventDefault();
    this.openResult(first);
  }

  /** Nom de catégorie d'un résultat : la recherche s'efface, la catégorie s'ouvre. */
  protected openResult(result: SettingsSearchResult): void {
    this.openCategory(result.category);
  }

  /** Ouvre la catégorie `id` depuis la recherche (résultat ou liste sans résultat). */
  protected openCategory(id: SettingsCategoryId): void {
    this.query.set('');
    this.choose(id);
    if (!this.phone()) {
      this.afterRender(() => this.focusCategory());
    }
  }

  /** « Retour » du téléphone : la liste revient, focus sur la catégorie quittée. */
  protected back(): void {
    this.phoneView.set('liste');
    this.afterRender(() => this.focusCategory());
  }

  /** Clic sur le fond assombri (pas dans la fenêtre) : fermeture demandée. */
  protected onClick(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.hasAttribute('data-settings-backdrop')) {
      this.close();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    const dialog = this.host.nativeElement.querySelector<HTMLElement>('[data-settings-window]');
    if (dialog !== null && trapTab(event, dialog)) {
      return;
    }
    if (event.key === '/' && !isTypingContext(event)) {
      event.preventDefault();
      this.searchFromKeyboard();
      return;
    }
    this.onArrow(event);
  }

  /** `/` : focus dans la recherche ; sur téléphone, la liste revient d'abord si besoin. */
  private searchFromKeyboard(): void {
    const focusSearch = () =>
      this.host.nativeElement.querySelector<HTMLElement>('[data-settings-search]')?.focus();
    if (this.showList()) {
      focusSearch();
      return;
    }
    this.phoneView.set('liste');
    this.afterRender(focusSearch);
  }

  /** Flèches haut et bas sur une catégorie : la voisine s'ouvre et prend le focus. */
  private onArrow(event: KeyboardEvent): void {
    const onCategory =
      event.target instanceof Element && event.target.closest('[data-settings-category]') !== null;
    if (!onCategory || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) {
      return;
    }
    event.preventDefault();
    this.selected.set(neighbourCategory(this.selected(), event.key === 'ArrowDown' ? 1 : -1));
    this.focusCategory();
  }

  /** Focus sur le bouton de la catégorie ouverte. */
  private focusCategory(): void {
    this.host.nativeElement
      .querySelector<HTMLElement>(`[data-settings-category="${this.selected()}"]`)
      ?.focus({ preventScroll: true });
  }

  private afterRender(action: () => void): void {
    afterNextRender(action, { injector: this.injector });
  }
}
