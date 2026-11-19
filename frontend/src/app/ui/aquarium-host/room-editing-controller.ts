import { signal } from '@angular/core';

import type { Room, RoomItem, RoomItemKind, RoomQuarter } from '../../sim/room';
import { dropRoomItem, removeRoomItem } from '../../sim/room-furniture';
import type { FloorRect } from '../../sim/room-layout';
import type { TankDimensions } from '../../sim/tank';

/** Ce que l'édition de la pièce demande à la vue 3D (#188). */
export interface RoomEditingView {
  setRoomSelection(index: number | null): void;
  previewRoom(room: Room): void;
}

/** Attributs publiés par l'édition de la pièce (contrat `data-aqfish-*`). */
export interface RoomEditingProbe {
  publishRoomSelection(index: number | null): void;
  publishRoomCount(count: number): void;
}

/** Ce que la pièce demande à l'éditeur du décor, dont elle partage le mode et le refus. */
export interface DecorEditorPort {
  /** Vrai en mode édition (#167). */
  editing(): boolean;
  /** Signale (ou efface) le refus de la dernière pose demandée. */
  setRefused(refused: boolean): void;
  /** Lève la sélection du décor seule (vue et attribut), sans toucher à celle de la pièce. */
  hideDecorSelection(): void;
  /** Lève toute sélection, du décor comme de la pièce (`selectDecor(null)`). */
  deselectAll(): void;
}

/**
 * Ports de l'édition de la pièce (#695) : ce que l'hôte lui prête, sans que le contrôleur
 * connaisse l'hôte. Les fonctions sont relues à chaque appel (pièce, monde et vue changent).
 */
export interface RoomEditingPorts {
  /** Pièce graphique affichée (#187). */
  room(): Room;
  /** Installe une pièce modifiée (vue, attributs, caméra) ; l'hôte rappelle `roomApplied`. */
  applyRoom(room: Room): void;
  /** Dimensions du bac autour duquel la pièce est posée. */
  dimensions(): TankDimensions;
  /**
   * Emprises au sol des meubles supports et des bacs posés de la pièce de N bacs : un élément
   * de la pièce graphique ne s'y pose pas (#313).
   */
  obstacles(): FloorRect[];
  /** Vue 3D, `null` avant le démarrage. */
  view(): RoomEditingView | null;
  readonly probe: RoomEditingProbe;
  readonly editor: DecorEditorPort;
  saveNow(): void;
  scheduleFrame(): void;
}

/**
 * Édition de la pièce graphique (#188 ; contrôleur #695) : sélection, pose par gravité sur le
 * parquet ou un meuble, quart de tour, glisser et suppression des éléments de la pièce. Le
 * mode édition et le refus sont ceux de l'éditeur du décor (`ports.editor`).
 */
export class RoomEditingController {
  /** Indice de l'élément de la pièce sélectionné (#188), `null` sinon. */
  readonly selection = signal<number | null>(null);
  /** Vrai si la pièce est dessinée, donc modifiable en mode édition (#188). */
  readonly editable = signal(false);
  /** Nombre d'éléments de la pièce (#188). */
  readonly count = signal(0);

  /**
   * Glissement en cours d'un élément de la pièce (#188) : pièce au début du geste (abandon si
   * elle a changé entre-temps) et dernière pose acceptée par `dropRoomItem`.
   */
  private drag: {
    readonly base: Room;
    readonly index: number;
    preview: readonly RoomItem[] | null;
  } | null = null;

  constructor(private readonly ports: RoomEditingPorts) {}

  /**
   * Pièce installée par l'hôte, dessinée (`shown`) ou non : la pièce n'est modifiable que
   * dessinée ; une sélection qui n'a plus d'élément (ou pièce masquée) est levée.
   */
  roomApplied(room: Room, shown: boolean): void {
    this.editable.set(shown);
    const count = room.items?.length ?? 0;
    this.count.set(count);
    this.ports.probe.publishRoomCount(count);
    const selection = this.selection();
    if (selection !== null && (!shown || selection >= count)) {
      this.clearSelection();
    }
  }

  /** `edition-meuble=` en capture (#188) : élément `index` de la pièce sélectionné. */
  showCaptureSelection(index: number): void {
    this.ports.view()?.setRoomSelection(index);
    this.refreshSelection(index);
  }

  /** Vue neuve : aucun glissement en cours, aucun élément sélectionné. */
  viewCreated(): void {
    this.drag = null;
    this.refreshSelection(null);
  }

  /** Lève la sélection de la pièce (vue et attribut), sans rien redessiner d'autre. */
  clearSelection(): void {
    this.ports.view()?.setRoomSelection(null);
    this.refreshSelection(null);
  }

  /**
   * Sélectionne l'élément d'indice `index` de la pièce (#188, contour clair), ou aucun avec
   * `null` ; lève la sélection du décor. Sans effet hors du mode édition (sauf pour
   * désélectionner) ou pour un indice inexistant.
   */
  select(index: number | null): void {
    const view = this.ports.view();
    const items = this.ports.room().items ?? [];
    if (!view) {
      return;
    }
    if (index !== null && !(this.ports.editor.editing() && index >= 0 && index < items.length)) {
      return;
    }
    // Lève la sélection du décor sans passer par `selectDecor`, qui lèverait aussi celle de
    // la pièce : la coque de contour serait détruite puis reconstruite (#202).
    this.ports.editor.setRefused(false);
    this.ports.editor.hideDecorSelection();
    view.setRoomSelection(index);
    this.refreshSelection(index);
    this.ports.scheduleFrame();
  }

  /**
   * Pose un élément `kind` de la pièce au point (x, z) (#188) : il tombe sur le parquet ou
   * sur le meuble que son emprise chevauche (`dropRoomItem`), puis il est sélectionné. Pose
   * refusée (refus signalé) : place prise, hors de la pièce, pièce pleine…
   */
  add(kind: RoomItemKind, x: number, z: number): void {
    const result = dropRoomItem(
      this.ports.room(),
      this.ports.dimensions(),
      { kind, x, z, quarter: 0 },
      undefined,
      this.ports.obstacles(),
    );
    if (!result.ok) {
      this.ports.editor.deselectAll();
      this.ports.editor.setRefused(true);
      return;
    }
    this.applyItems(result.items, result.index);
  }

  /** Tourne l'élément sélectionné de la pièce d'un quart de tour par pas (signe de `steps`). */
  turnSelected(steps: number): boolean {
    const index = this.selection();
    const item = index === null ? undefined : this.ports.room().items?.[index];
    if (!item || index === null || !this.ports.editor.editing() || this.drag || steps === 0) {
      return false;
    }
    const quarter = ((((item.quarter + Math.sign(steps)) % 4) + 4) % 4) as RoomQuarter;
    const result = dropRoomItem(
      this.ports.room(),
      this.ports.dimensions(),
      { kind: item.kind, x: item.x, z: item.z, quarter },
      index,
      this.ports.obstacles(),
    );
    if (!result.ok) {
      this.ports.editor.setRefused(true);
      return false;
    }
    this.applyItems(result.items, index);
    return true;
  }

  /**
   * Supprime l'élément sélectionné de la pièce (#188) : ce qu'il portait retombe ; refus s'il
   * resterait en l'air. Renvoie `true` s'il a été supprimé.
   */
  deleteSelected(): boolean {
    const index = this.selection();
    if (index === null) {
      return false;
    }
    const items = removeRoomItem(this.ports.room().items ?? [], index);
    if (!items) {
      this.ports.editor.setRefused(true);
      return false;
    }
    this.applyItems(items, null);
    return true;
  }

  /** Début du glissement d'un élément de la pièce (#188) : il est sélectionné. */
  startDrag(index: number): void {
    const items = this.ports.room().items ?? [];
    if (!this.ports.editor.editing() || index < 0 || index >= items.length) {
      return;
    }
    this.select(index);
    this.drag = { base: this.ports.room(), index, preview: null };
  }

  /**
   * Glissement d'un élément de la pièce vers (x, z) : aperçu de sa pose par gravité
   * (`dropRoomItem`), ce qu'il portait retombant ; une pose refusée garde l'aperçu précédent.
   */
  moveDrag(index: number, x: number, z: number): void {
    const drag = this.drag;
    const item = drag?.base.items?.[index];
    if (!drag || !item || drag.index !== index || this.ports.room() !== drag.base) {
      return;
    }
    const result = dropRoomItem(
      drag.base,
      this.ports.dimensions(),
      { kind: item.kind, x, z, quarter: item.quarter },
      index,
      this.ports.obstacles(),
    );
    if (result.ok) {
      drag.preview = result.items;
      this.ports.view()?.previewRoom({ ...drag.base, items: result.items });
      this.ports.scheduleFrame();
    }
  }

  /**
   * Fin du glissement : la dernière pose acceptée est appliquée et enregistrée (`commit`) ;
   * sinon (abandon, aucune pose acceptée), la pièce revient à son état du début du geste.
   */
  endDrag(index: number, commit: boolean): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.index !== index || this.ports.room() !== drag.base) {
      return;
    }
    if (commit && drag.preview && this.ports.editor.editing()) {
      this.applyItems(drag.preview, index);
      return;
    }
    this.ports.view()?.previewRoom(drag.base);
    this.ports.editor.setRefused(commit);
    this.ports.scheduleFrame();
  }

  /** Expose la sélection de la pièce (`data-aqfish-room-selected`). */
  private refreshSelection(index: number | null): void {
    this.selection.set(index);
    this.ports.probe.publishRoomSelection(index);
  }

  /**
   * Applique les éléments `items` à la pièce (#188), sélectionne l'élément `selection` (ou
   * aucun) et enregistre aussitôt (le rechargement les restitue).
   */
  private applyItems(items: readonly RoomItem[], selection: number | null): void {
    const { shown, cabinetHeight } = this.ports.room();
    this.ports.applyRoom(
      items.length > 0 ? { shown, cabinetHeight, items } : { shown, cabinetHeight },
    );
    this.ports.editor.setRefused(false);
    this.select(selection);
    this.ports.saveNow();
    this.ports.scheduleFrame();
  }
}
