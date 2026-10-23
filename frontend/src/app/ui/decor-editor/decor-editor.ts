import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  inject,
  input,
  output,
} from '@angular/core';

import { isTypingContext } from '../../core/keyboard/keyboard';
import {
  DECOR_CATALOG,
  DECOR_CHOICE_IDS,
  MAX_DECOR_ITEMS,
  type DecorTool,
} from '../../sim/decor-edit';

/** Identifiant du panneau de l'éditeur de décor. */
export const DECOR_EDITOR_ID = 'editeur-decor';

/** Outils de l'éditeur, dans l'ordre d'affichage, avec leur libellé. */
export const DECOR_TOOLS: readonly { readonly id: DecorTool; readonly name: string }[] = [
  { id: 'select', name: 'Sélection' },
  ...DECOR_CHOICE_IDS.map((id) => ({ id, name: DECOR_CATALOG[id].name })),
];

/**
 * Consigne de l'éditeur selon l'outil et la sélection (#167) : ce qu'un clic fera.
 */
export function decorEditorHint(tool: DecorTool, selection: number | null, full: boolean): string {
  if (selection !== null) {
    return 'Élément sélectionné : Suppr pour le retirer.';
  }
  if (tool === 'select') {
    return 'Cliquez sur un élément pour le sélectionner.';
  }
  if (full) {
    return `Décor plein (${MAX_DECOR_ITEMS} éléments) : retirez-en un d’abord.`;
  }
  return `Cliquez sur le sable pour poser : ${DECOR_CATALOG[tool].name.toLowerCase()}.`;
}

/**
 * Panneau de l'éditeur de décor (issue #167) : affiché en mode édition, sous la ligne des
 * boutons du haut, à la place de « Réglages » (exclusif avec lui ; avec « Commandes » sur
 * écran étroit, `App`). Il choisit l'outil (sélection, ou type d'élément à poser d'un clic sur
 * le sable), supprime l'élément sélectionné (bouton ou touche Suppr / Retour arrière) et
 * termine l'édition (bouton ou Échap). Aucune logique de simulation : l'hôte applique.
 */
@Component({
  selector: 'app-decor-editor',
  template: `<section class="decor-editor" [id]="panelId" aria-label="Éditeur de décor">
    <h2 class="decor-editor__title">Édition du décor</h2>
    <div class="decor-editor__tools" role="radiogroup" aria-label="Outil">
      @for (t of tools; track t.id) {
        <button
          type="button"
          role="radio"
          class="decor-editor__tool"
          [class.decor-editor__tool--active]="t.id === tool()"
          [attr.aria-checked]="t.id === tool()"
          [attr.data-tool]="t.id"
          (click)="toolChanged.emit(t.id)"
        >
          {{ t.name }}
        </button>
      }
    </div>
    <p class="decor-editor__hint" data-decor-hint>{{ hint() }}</p>
    <div class="decor-editor__actions">
      <button
        type="button"
        class="decor-editor__action"
        aria-keyshortcuts="Delete"
        [attr.aria-disabled]="selection() === null"
        (click)="remove()"
      >
        Supprimer
      </button>
      <button
        type="button"
        class="decor-editor__action decor-editor__action--done"
        aria-keyshortcuts="Escape"
        (click)="closed.emit()"
      >
        Terminer
      </button>
    </div>
    <p class="decor-editor__count" data-decor-count>{{ count() }} / {{ max }} éléments</p>
  </section>`,
  styleUrl: './decor-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecorEditor {
  /** Outil courant (fourni par l'hôte). */
  readonly tool = input<DecorTool>('rock');
  /** Indice de l'élément sélectionné, `null` sinon (fourni par l'hôte). */
  readonly selection = input<number | null>(null);
  /** Nombre d'éléments du décor (fourni par l'hôte). */
  readonly count = input(0);

  /** Outil choisi. */
  readonly toolChanged = output<DecorTool>();
  /** Suppression de l'élément sélectionné demandée (bouton, Suppr). */
  readonly deleteRequested = output<void>();
  /** Fin de l'édition demandée (bouton « Terminer », Échap sans sélection). */
  readonly closed = output<void>();
  /** Désélection demandée (Échap avec une sélection). */
  readonly deselectRequested = output<void>();

  protected readonly panelId = DECOR_EDITOR_ID;
  protected readonly tools = DECOR_TOOLS;
  protected readonly max = MAX_DECOR_ITEMS;
  protected readonly hint = computed(() =>
    decorEditorHint(this.tool(), this.selection(), this.count() >= MAX_DECOR_ITEMS),
  );

  constructor() {
    const doc = inject(DOCUMENT);
    const onKey = (event: KeyboardEvent) => this.onKey(event);
    doc.addEventListener('keydown', onKey);
    inject(DestroyRef).onDestroy(() => doc.removeEventListener('keydown', onKey));
  }

  /** Bouton « Supprimer » : sans effet sans sélection. */
  protected remove(): void {
    if (this.selection() !== null) {
      this.deleteRequested.emit();
    }
  }

  /**
   * Suppr ou Retour arrière : supprime la sélection ; Échap : désélectionne, ou termine
   * l'édition sans sélection. Ignoré dans un champ de saisie (`isTypingContext`).
   */
  onKey(event: KeyboardEvent): void {
    if (isTypingContext(event)) {
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selection() !== null) {
        event.preventDefault();
        this.deleteRequested.emit();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (this.selection() !== null) {
        this.deselectRequested.emit();
      } else {
        this.closed.emit();
      }
    }
  }
}
