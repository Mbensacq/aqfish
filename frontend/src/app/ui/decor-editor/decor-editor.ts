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
import { clampTankDimensions, TANK_LIMITS, type TankDimensions } from '../../sim/tank';

/** Identifiant du panneau de l'éditeur de décor. */
export const DECOR_EDITOR_ID = 'editeur-decor';

/** Outils de l'éditeur, dans l'ordre d'affichage, avec leur libellé. */
export const DECOR_TOOLS: readonly { readonly id: DecorTool; readonly name: string }[] = [
  { id: 'select', name: 'Sélection' },
  ...DECOR_CHOICE_IDS.map((id) => ({ id, name: DECOR_CATALOG[id].name })),
];

/**
 * Commandes de pose de l'élément sélectionné (#168), dans l'ordre d'affichage : rotation par
 * pas de 15° (`rotate`, en pas) ou échelle (`scale`, en pas), avec leur touche.
 */
export const DECOR_POSE_COMMANDS: readonly {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly key: string;
  readonly rotate: number;
  readonly scale: number;
}[] = [
  { id: 'gauche', label: '−15°', name: 'Tourner de −15°', key: 'ArrowLeft', rotate: -1, scale: 0 },
  { id: 'droite', label: '+15°', name: 'Tourner de +15°', key: 'ArrowRight', rotate: 1, scale: 0 },
  { id: 'reduire', label: 'Réduire', name: 'Réduire', key: '-', rotate: 0, scale: -1 },
  { id: 'agrandir', label: 'Agrandir', name: 'Agrandir', key: '+', rotate: 0, scale: 1 },
];

/**
 * Curseurs des dimensions du bac (issue #171), dans l'ordre d'affichage : bornes et pas de
 * `TANK_LIMITS`, affichés en centimètres.
 */
export const TANK_DIMENSION_FIELDS: readonly {
  readonly key: keyof TankDimensions;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}[] = (
  [
    ['width', 'Longueur'],
    ['depth', 'Largeur'],
    ['height', 'Hauteur'],
  ] as const
).map(([key, label]) => ({
  key,
  label,
  min: Math.round(TANK_LIMITS[key].min * 100),
  max: Math.round(TANK_LIMITS[key].max * 100),
  step: Math.round(TANK_LIMITS[key].step * 100),
}));

/** Touches de pose (`KeyboardEvent.key`) : `=` est le `+` sans Maj d'un clavier QWERTY. */
const POSE_KEYS: Readonly<Record<string, { readonly rotate: number; readonly scale: number }>> = {
  ArrowLeft: { rotate: -1, scale: 0 },
  ArrowRight: { rotate: 1, scale: 0 },
  '-': { rotate: 0, scale: -1 },
  '+': { rotate: 0, scale: 1 },
  '=': { rotate: 0, scale: 1 },
};

/**
 * Consigne de l'éditeur selon l'outil, la sélection et la dernière pose (#167, #168, #170) :
 * ce qu'un geste fera, pourquoi la pose a été refusée, ou que l'élément a été posé sans
 * chute faute de moteur.
 */
export function decorEditorHint(
  tool: DecorTool,
  selection: number | null,
  full: boolean,
  refused = false,
  grounded = false,
): string {
  if (refused) {
    return 'Pose refusée : l’élément chevaucherait un autre élément.';
  }
  if (grounded) {
    return 'Chute indisponible (moteur non chargé) : élément posé sur le sable.';
  }
  if (selection !== null) {
    return 'Glissez pour déplacer ; ← → tournent, + − changent la taille, Suppr retire.';
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
    <p class="decor-editor__hint" data-decor-hint aria-live="polite">{{ hint() }}</p>
    <div class="decor-editor__pose" role="group" aria-label="Pose de l’élément">
      @for (c of poseCommands; track c.id) {
        <button
          type="button"
          class="decor-editor__action decor-editor__pose-button"
          [attr.aria-label]="c.name"
          [attr.aria-keyshortcuts]="c.key"
          [attr.aria-disabled]="selection() === null"
          [attr.data-pose]="c.id"
          (click)="pose(c.rotate, c.scale)"
        >
          {{ c.label }}
        </button>
      }
    </div>
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
    @if (dimensions(); as dims) {
      <fieldset class="decor-editor__tank" data-tank-dimensions>
        <legend class="decor-editor__legend">Dimensions du bac</legend>
        <label class="decor-editor__field">
          <span class="decor-editor__label">
            Longueur
            <output class="decor-editor__value">{{ centimeters(dims.width) }} cm</output>
          </span>
          <!-- Bornes statiques (TANK_LIMITS, vérifiées par le test) : posées avant la valeur. -->
          <input
            class="decor-editor__range"
            type="range"
            min="60"
            max="200"
            step="10"
            aria-label="Longueur du bac, en centimètres"
            data-dimension="width"
            [value]="centimeters(dims.width)"
            [attr.aria-valuetext]="centimeters(dims.width) + ' cm'"
            (change)="onDimension('width', $event)"
          />
        </label>
        <label class="decor-editor__field">
          <span class="decor-editor__label">
            Largeur
            <output class="decor-editor__value">{{ centimeters(dims.depth) }} cm</output>
          </span>
          <!-- Bornes statiques (TANK_LIMITS, vérifiées par le test) : posées avant la valeur. -->
          <input
            class="decor-editor__range"
            type="range"
            min="30"
            max="90"
            step="5"
            aria-label="Largeur du bac, en centimètres"
            data-dimension="depth"
            [value]="centimeters(dims.depth)"
            [attr.aria-valuetext]="centimeters(dims.depth) + ' cm'"
            (change)="onDimension('depth', $event)"
          />
        </label>
        <label class="decor-editor__field">
          <span class="decor-editor__label">
            Hauteur
            <output class="decor-editor__value">{{ centimeters(dims.height) }} cm</output>
          </span>
          <!-- Bornes statiques (TANK_LIMITS, vérifiées par le test) : posées avant la valeur. -->
          <input
            class="decor-editor__range"
            type="range"
            min="50"
            max="90"
            step="5"
            aria-label="Hauteur du bac, en centimètres"
            data-dimension="height"
            [value]="centimeters(dims.height)"
            [attr.aria-valuetext]="centimeters(dims.height) + ' cm'"
            (change)="onDimension('height', $event)"
          />
        </label>
      </fieldset>
    }
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
  /** Vrai si la dernière pose a été refusée (chevauchement, fourni par l'hôte). */
  readonly refused = input(false);
  /** Vrai si le dernier élément lâché a été posé sans chute (moteur absent, fourni par l'hôte). */
  readonly grounded = input(false);
  /**
   * Dimensions du bac (fournies par l'hôte), `null` si l'environnement ne les règle pas : les
   * curseurs sont alors masqués.
   */
  readonly dimensions = input<TankDimensions | null>(null);

  /** Outil choisi. */
  readonly toolChanged = output<DecorTool>();
  /** Suppression de l'élément sélectionné demandée (bouton, Suppr). */
  readonly deleteRequested = output<void>();
  /** Fin de l'édition demandée (bouton « Terminer », Échap sans sélection). */
  readonly closed = output<void>();
  /** Désélection demandée (Échap avec une sélection). */
  readonly deselectRequested = output<void>();
  /** Rotation de l'élément sélectionné demandée, en pas de 15° (boutons, flèches). */
  readonly rotateRequested = output<number>();
  /** Changement d'échelle de l'élément sélectionné demandé, en pas (boutons, + et −). */
  readonly scaleRequested = output<number>();
  /** Nouvelles dimensions du bac demandées (curseurs relâchés), bornées à `TANK_LIMITS`. */
  readonly dimensionsChanged = output<TankDimensions>();

  protected readonly panelId = DECOR_EDITOR_ID;
  protected readonly tools = DECOR_TOOLS;
  protected readonly max = MAX_DECOR_ITEMS;
  protected readonly poseCommands = DECOR_POSE_COMMANDS;
  protected readonly hint = computed(() =>
    decorEditorHint(
      this.tool(),
      this.selection(),
      this.count() >= MAX_DECOR_ITEMS,
      this.refused(),
      this.grounded(),
    ),
  );

  constructor() {
    const doc = inject(DOCUMENT);
    const onKey = (event: KeyboardEvent) => this.onKey(event);
    doc.addEventListener('keydown', onKey);
    inject(DestroyRef).onDestroy(() => doc.removeEventListener('keydown', onKey));
  }

  /** Dimension en centimètres entiers, pour l'affichage. */
  protected centimeters(meters: number): number {
    return Math.round(meters * 100);
  }

  /** Curseur relâché : émet les dimensions avec la nouvelle valeur (en mètres, bornées). */
  protected onDimension(key: keyof TankDimensions, event: Event): void {
    const dims = this.dimensions();
    const value = Number((event.target as HTMLInputElement).value) / 100;
    if (dims === null || !Number.isFinite(value)) {
      return;
    }
    this.dimensionsChanged.emit(clampTankDimensions({ ...dims, [key]: value }));
  }

  /** Bouton « Supprimer » : sans effet sans sélection. */
  protected remove(): void {
    if (this.selection() !== null) {
      this.deleteRequested.emit();
    }
  }

  /** Bouton ou touche de pose : sans effet sans sélection. */
  protected pose(rotate: number, scale: number): void {
    if (this.selection() === null) {
      return;
    }
    if (rotate !== 0) {
      this.rotateRequested.emit(rotate);
    }
    if (scale !== 0) {
      this.scaleRequested.emit(scale);
    }
  }

  /**
   * Flèches gauche et droite : tournent la sélection de 15° ; + et − : changent sa taille ;
   * Suppr ou Retour arrière : supprime la sélection ; Échap : désélectionne, ou termine
   * l'édition sans sélection. Ignoré dans un champ de saisie (`isTypingContext`).
   */
  onKey(event: KeyboardEvent): void {
    if (isTypingContext(event)) {
      return;
    }
    const pose = POSE_KEYS[event.key];
    if (pose && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (this.selection() !== null) {
        event.preventDefault();
        this.pose(pose.rotate, pose.scale);
      }
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
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
