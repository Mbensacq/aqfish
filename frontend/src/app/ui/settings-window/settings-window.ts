import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  model,
  output,
} from '@angular/core';

import { isTypingContext } from '../../core/keyboard/keyboard';
import { trapTab } from './focus-trap';
import {
  categoriesOf,
  DEFAULT_SETTINGS_CATEGORY,
  neighbourCategory,
  SETTINGS_GROUPS,
  settingsCategory,
  type SettingsCategoryId,
} from './settings-categories';

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
 * dans la recherche (son filtrage arrive au lot 3) ; Échap ou un clic sur le fond demandent la
 * fermeture (`closeRequested`), le parent rend le focus au bouton « Réglages ». Un Échap déjà
 * traité par le contenu (fiche, confirmation : `defaultPrevented`) est ignoré.
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
      [id]="windowId"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fenetre-reglages-titre"
      data-settings-window
    >
      <div class="settings-window__side">
        <div class="settings-window__header">
          <h2 class="settings-window__title" id="fenetre-reglages-titre">Réglages</h2>
          <button
            type="button"
            class="settings-window__close"
            aria-label="Fermer les réglages"
            data-settings-close
            (click)="close()"
          >
            ×
          </button>
        </div>
        <input
          class="settings-window__search"
          type="search"
          aria-label="Rechercher un réglage"
          placeholder="Rechercher (touche /)"
          data-settings-search
        />
        <nav class="settings-window__nav" aria-label="Catégories des réglages">
          @for (group of groups; track group.name) {
            <p class="settings-window__group" [id]="'reglages-groupe-' + $index">
              {{ group.name }}
            </p>
            <ul class="settings-window__list" [attr.aria-labelledby]="'reglages-groupe-' + $index">
              @for (category of group.categories; track category.id) {
                <li>
                  <button
                    type="button"
                    class="settings-window__category"
                    [class.settings-window__category--open]="category.id === selected()"
                    [attr.aria-current]="category.id === selected() ? 'true' : null"
                    [attr.data-settings-category]="category.id"
                    (click)="selected.set(category.id)"
                  >
                    {{ category.title }}
                  </button>
                </li>
              }
            </ul>
          }
        </nav>
      </div>
      <section
        class="settings-window__content"
        aria-labelledby="fenetre-reglages-categorie"
        [attr.data-settings-content]="selected()"
      >
        <h3 class="settings-window__heading" id="fenetre-reglages-categorie">
          {{ category().title }}
        </h3>
        <p class="settings-window__explanation">{{ category().explanation }}</p>
        <ng-content />
      </section>
    </div>
  `,
})
export class SettingsWindow {
  /** Catégorie ouverte (le parent affiche son contenu). */
  readonly selected = model<SettingsCategoryId>(DEFAULT_SETTINGS_CATEGORY);
  /** Échap, bouton « Fermer » ou clic sur le fond : le parent ferme la fenêtre. */
  readonly closeRequested = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly windowId = SETTINGS_WINDOW_ID;
  protected readonly groups = SETTINGS_GROUPS.map((name) => ({
    name,
    categories: categoriesOf(name),
  }));
  protected readonly category = computed(() => settingsCategory(this.selected()));

  constructor() {
    afterNextRender(() => this.focusCategory());
  }

  protected close(): void {
    this.closeRequested.emit();
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
      this.host.nativeElement.querySelector<HTMLElement>('[data-settings-search]')?.focus();
      return;
    }
    this.onArrow(event);
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
}
