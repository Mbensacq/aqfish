import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';

import { helpSections, keyCommand, keyCommandFor } from '../../core/commands/commands';
import { isTypingContext } from '../../core/keyboard/keyboard';
import { COMMANDS_HELP_DEFAULT_OPEN, COMMANDS_HELP_STORE } from './commands-help-store';

/** Clé de stockage de l'état de l'aide-mémoire. */
export const COMMANDS_HELP_STORAGE_KEY = 'aqfish.aide-commandes';

/** Valeurs stockées : `ouvert` ou `replie` (toute autre valeur : état par défaut). */
export const COMMANDS_HELP_FOLDED = 'replie';
export const COMMANDS_HELP_OPEN = 'ouvert';

/** État initial : celui mémorisé s'il est valide, sinon `defaultOpen`. */
export function initialOpen(stored: string | null, defaultOpen: boolean): boolean {
  switch (stored) {
    case COMMANDS_HELP_OPEN:
      return true;
    case COMMANDS_HELP_FOLDED:
      return false;
    default:
      return defaultOpen;
  }
}

/**
 * Aide-mémoire des commandes (issue #74) : panneau sombre translucide en haut à droite
 * (docs/DA.md, « Interface »), généré à partir de la déclaration unique des commandes
 * (`core/commands`, ADR 0020) : touches, gestes de la souris et de l'écran tactile.
 * Repliable par son bouton ou la touche `?` ; l'état est conservé au rechargement
 * (`localStorage`, repli en mémoire). Ouvert par défaut, pour qu'on le découvre, sauf sur
 * un écran étroit où il masquerait le bac (`COMMANDS_HELP_DEFAULT_OPEN`). Sur un tel écran,
 * l'application le replie quand « Réglages » s'ouvre, et inversement (`opened`, `fold`, #136).
 * Absent en mode capture (c'est l'application qui ne l'affiche pas).
 */
@Component({
  selector: 'app-commands-help',
  template: `@if (open()) {
      <section class="commands-help" id="aide-commandes" aria-labelledby="aide-commandes-titre">
        <div class="commands-help__header">
          <h2 class="commands-help__title" id="aide-commandes-titre">Commandes</h2>
          <button
            type="button"
            class="commands-help__toggle"
            [attr.aria-label]="'Replier l’aide-mémoire (touche ' + helpKey + ')'"
            [attr.aria-keyshortcuts]="helpKey"
            aria-expanded="true"
            aria-controls="aide-commandes"
            (click)="toggle()"
          >
            <kbd class="commands-help__key" aria-hidden="true">{{ helpKey }}</kbd>
            Replier
          </button>
        </div>
        @for (section of sections; track section.id) {
          <h3 class="commands-help__group">{{ section.title }}</h3>
          <dl class="commands-help__list" [attr.data-group]="section.id">
            @for (entry of section.entries; track entry.id) {
              <div class="commands-help__row" [attr.data-command]="entry.id">
                <dt>
                  @if (entry.kind === 'touche') {
                    <kbd class="commands-help__key">{{ entry.label }}</kbd>
                  } @else {
                    <span class="commands-help__gesture">{{ entry.label }}</span>
                  }
                </dt>
                <dd>{{ entry.description }}</dd>
              </div>
            }
          </dl>
        }
      </section>
    } @else {
      <button
        type="button"
        class="commands-help__toggle commands-help__toggle--folded"
        [attr.aria-label]="'Afficher l’aide-mémoire des commandes (touche ' + helpKey + ')'"
        [attr.aria-keyshortcuts]="helpKey"
        aria-expanded="false"
        (click)="toggle()"
      >
        <kbd class="commands-help__key" aria-hidden="true">{{ helpKey }}</kbd>
        Commandes
      </button>
    }`,
  styleUrl: './commands-help.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class CommandsHelp {
  private readonly store = inject(COMMANDS_HELP_STORE);

  /** Aide-mémoire déplié. */
  readonly open = signal(
    initialOpen(this.store.read(COMMANDS_HELP_STORAGE_KEY), inject(COMMANDS_HELP_DEFAULT_OPEN)),
  );

  protected readonly sections = helpSections();

  /** Touche de l'aide telle qu'affichée (`?`). */
  protected readonly helpKey = keyCommand('aide').display;

  /** Déplié par l'utilisateur (bouton ou touche `?`), pour replier un panneau voisin (#136). */
  readonly opened = output<void>();

  /** Replie ou déplie l'aide-mémoire, et mémorise l'état. */
  toggle(): void {
    const open = !this.open();
    this.open.set(open);
    this.store.write(COMMANDS_HELP_STORAGE_KEY, open ? COMMANDS_HELP_OPEN : COMMANDS_HELP_FOLDED);
    if (open) {
      this.opened.emit();
    }
  }

  /**
   * Replie l'aide-mémoire pour laisser la place à un autre panneau (#136), sans mémoriser
   * l'état : ce n'est pas un choix de l'utilisateur, qui la retrouve au rechargement.
   */
  fold(): void {
    this.open.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || isTypingContext(event)) {
      return;
    }
    if (keyCommandFor(event.key)?.id === 'aide') {
      event.preventDefault();
      this.toggle();
    }
  }
}
