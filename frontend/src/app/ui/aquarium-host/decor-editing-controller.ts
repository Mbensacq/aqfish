import { signal } from '@angular/core';

import type { DecorDropper } from '../../core/decor-physics/decor-physics';
import type { DecorPick } from '../../render/decor-pick';
import { decorBaseY, decorElevation, type DecorItem } from '../../sim/decor';
import {
  decorDropScene,
  DROP_TIME_STEP,
  groundDecorItem,
  settleDecorItem,
  type DropPoint,
} from '../../sim/decor-drop';
import {
  addDecorItem,
  isDecorEditable,
  isDecorPoseAllowed,
  isDecorTool,
  moveDecorItem,
  removeDecorItem,
  rotateDecorItem,
  scaleDecorItem,
  setDecorInPlace,
} from '../../sim/decor-edit';
import { decorFallScene, releaseUnsupportedDecor, type DecorFall } from '../../sim/decor-release';
import type { EnvironmentId, Place } from '../../sim/environment';
import type { RoomItemKind } from '../../sim/room';
import type { MutableWorld, World } from '../../sim/world-types';
import { isRoomTool, type EditorTool } from '../decor-editor/decor-editor';
import type { DecorPhysicsState } from './aquarium-probe';

/** Ce que l'édition du décor demande à la vue 3D (#167, #168, #170). */
export interface DecorEditingView {
  setDecorSelection(index: number | null): void;
  previewDecorMove(index: number, x: number, z: number): void;
  previewDecorPose(index: number, x: number, y: number, z: number): void;
  replaceDecorItems(items: readonly DecorItem[], seed: number): void;
  setDecorDragEnabled(enabled: boolean): void;
}

/** Attributs publiés par l'édition du décor (contrat `data-aqfish-*`). */
export interface DecorEditingProbe {
  publishDecorPhysics(state: DecorPhysicsState): void;
  publishEditing(editing: boolean): void;
  publishDecorCount(count: number): void;
  publishDecorSelection(index: number | null): void;
}

/**
 * Ce que le décor demande à l'édition de la pièce (#188) : une seule sélection à la fois, et
 * les gestes du même éditeur (clic, Suppr, rotation) passent à la pièce quand elle est visée.
 */
export interface RoomEditingPort {
  /** Indice de l'élément de la pièce sélectionné, `null` sinon. */
  selection(): number | null;
  /** Vrai si la pièce est dessinée, donc modifiable. */
  editable(): boolean;
  /** Lève la sélection de la pièce (vue et attribut), sans rien redessiner d'autre. */
  clearSelection(): void;
  select(index: number | null): void;
  add(kind: RoomItemKind, x: number, z: number): void;
  turnSelected(steps: number): boolean;
  deleteSelected(): boolean;
}

/**
 * Ports de l'édition du décor (#695) : ce que l'hôte lui prête, sans que le contrôleur
 * connaisse l'hôte. Les fonctions sont relues à chaque appel (monde et vue changent).
 */
export interface DecorEditingPorts {
  /** Monde affiché, `null` avant le démarrage. */
  world(): MutableWorld | null;
  /** Vue 3D, `null` avant le démarrage. */
  view(): DecorEditingView | null;
  /** Vrai en mode capture : aucune édition (`edition=` montre seulement la sélection). */
  isCapture(): boolean;
  /** Chargeur du moteur de chute (Rapier, importé à la demande). */
  loadPhysics(): Promise<DecorDropper>;
  readonly probe: DecorEditingProbe;
  /** Vrai si le décor est affiché (#176). */
  decorVisible(): boolean;
  /** Réaffiche le décor masqué (#176). */
  showDecor(): void;
  /** Le décor du monde a changé : plantes et obstacles relus par l'hôte. */
  decorChanged(world: World): void;
  readonly room: RoomEditingPort;
  saveNow(): void;
  scheduleFrame(): void;
}

/** Décor obtenu par un lâcher et trajectoire de la chute à afficher (vide sans chute). */
interface DropOutcome {
  readonly decor: readonly DecorItem[];
  readonly path: readonly DropPoint[];
}

/** Modification d'un élément du décor (rotation, échelle) ; `null` : refusée ou inchangée. */
type DecorEdit = (decor: readonly DecorItem[], index: number, env: Place) => DecorItem[] | null;

/**
 * Édition du décor (#167, #168, #170, #182, #183 ; contrôleur #695) : mode édition, outil,
 * sélection, pose par gravité avec le moteur chargé à la demande, glisser, rotation, échelle,
 * suppression et chute affichée. Les gestes qui visent la pièce passent à `ports.room`.
 */
export class DecorEditingController {
  /** Mode édition du décor (#167) : les clics sur le bac posent ou choisissent un élément. */
  readonly editing = signal(false);
  /** Vrai si le décor de l'environnement courant est modifiable (bac tropical, #167). */
  readonly editable = signal(false);
  /** Outil courant de l'éditeur de décor (#167). */
  readonly tool = signal<EditorTool>('rock');
  /** Indice de l'élément de décor sélectionné (#167), `null` sinon. */
  readonly selection = signal<number | null>(null);
  /** Nombre d'éléments du décor (#167). */
  readonly count = signal(0);
  /**
   * Vrai si la dernière pose demandée (glissement, rotation, échelle, #168) a été refusée
   * parce qu'elle pénétrait un autre élément ; effacé à la sélection suivante ou à la pose
   * acceptée suivante.
   */
  readonly refused = signal(false);
  /** État du moteur de chute (#170), chargé à la première ouverture de l'éditeur. */
  readonly physics = signal<DecorPhysicsState>('absent');
  /**
   * Vrai si le dernier élément lâché a été posé sur le sable sans chute, faute de moteur
   * (#170) ; effacé à la pose suivante réussie.
   */
  readonly dropGrounded = signal(false);

  /** Moteur de chute, une fois chargé (#170). */
  private dropper: DecorDropper | null = null;
  /** Chute affichée (#170) : trajectoire de la base de l'élément `index`, temps écoulé (s). */
  private dropAnimation: { index: number; path: readonly DropPoint[]; elapsed: number } | null =
    null;
  /**
   * Glissement en cours (#168) : décor du monde au début du geste (abandon s'il a changé
   * entre-temps) et dernier aperçu (décor déplacé, borné au bac).
   */
  private drag: {
    readonly base: readonly DecorItem[];
    readonly index: number;
    preview: DecorItem[] | null;
  } | null = null;

  constructor(private readonly ports: DecorEditingPorts) {}

  /**
   * Entre en mode édition du décor ou en sort (#167). En sortant, la sélection est effacée ;
   * en entrant, un décor masqué est réaffiché (#176 : on ne pose pas d'obstacle invisible).
   * Sans effet en mode capture (`edition=`), avant le démarrage, ou pour entrer dans un
   * environnement dont le décor n'est pas modifiable (`isDecorEditable`).
   */
  setEditing(editing: boolean): void {
    const world = this.ports.world();
    const blocked = editing && world !== null && !isDecorEditable(world.environment);
    if (!world || !this.ports.view() || this.ports.isCapture() || blocked) {
      return;
    }
    if (!editing) {
      this.select(null);
    } else {
      if (!this.ports.decorVisible()) {
        this.ports.showDecor();
      }
      this.loadPhysics();
    }
    this.applyEditing(editing);
  }

  /** Applique et expose le mode édition (`data-aqfish-editing`), sans autre effet. */
  applyEditing(editing: boolean): void {
    this.editing.set(editing);
    this.refused.set(false);
    // Hors capture seulement : `edition=` montre la sélection sans gestes.
    this.ports.view()?.setDecorDragEnabled(editing && !this.ports.isCapture());
    this.ports.probe.publishEditing(editing);
  }

  /**
   * Nouvel environnement affiché : décor modifiable ou non, mode édition quitté s'il ne l'est
   * plus, nombre d'éléments republié.
   */
  environmentChanged(environment: EnvironmentId): void {
    const editable = isDecorEditable(environment);
    this.editable.set(editable);
    if (!editable && this.editing()) {
      this.applyEditing(false);
    }
    this.refreshCount();
  }

  /** `edition=` en capture (#167) : mode édition et élément `index` sélectionné, sans gestes. */
  showCaptureSelection(index: number): void {
    this.applyEditing(true);
    this.ports.view()?.setDecorSelection(index);
    this.refreshSelection(index);
  }

  /** Vue neuve : aucun glissement en cours, aucun élément sélectionné. */
  viewCreated(): void {
    this.drag = null;
    this.refreshSelection(null);
  }

  /** Pièce dessinée ou masquée (#188) : masquée, un outil de la pièce redevient « Sélection ». */
  roomShownChanged(shown: boolean): void {
    if (!shown && isRoomTool(this.tool())) {
      this.tool.set('select');
    }
  }

  /**
   * Choisit l'outil de l'éditeur de décor (#167), ou un élément de la pièce à poser quand la
   * pièce est dessinée (#188) ; un outil inconnu ou indisponible est ignoré.
   */
  setTool(tool: string): void {
    if (isDecorTool(tool) || (isRoomTool(tool) && this.ports.room.editable())) {
      this.tool.set(tool);
    }
  }

  /**
   * Sélectionne l'élément d'indice `index` du décor (contour clair), ou aucun avec `null`
   * (#167). Sans effet hors du mode édition (sauf pour désélectionner) ou pour un indice
   * inexistant.
   */
  select(index: number | null): void {
    const world = this.ports.world();
    const view = this.ports.view();
    if (!world || !view) {
      return;
    }
    this.refused.set(false);
    const valid =
      index !== null && Number.isInteger(index) && index >= 0 && index < world.decor.length;
    if (index !== null && (!valid || !this.editing())) {
      return;
    }
    this.showSelection(index);
    // Une seule sélection à la fois : celle de la pièce est levée (#188).
    this.ports.room.clearSelection();
    this.ports.scheduleFrame();
  }

  /**
   * Dessine et expose la sélection du décor `index` sans toucher à celle de la pièce : la
   * pièce lève ainsi celle du décor sans détruire sa propre coque de contour (#202).
   */
  showSelection(index: number | null): void {
    this.ports.view()?.setDecorSelection(index);
    this.refreshSelection(index);
  }

  /**
   * Supprime l'élément sélectionné (touche Suppr, bouton « Supprimer », #167), du décor ou de
   * la pièce (#188) ; renvoie `true` s'il a été supprimé. Sans effet sans sélection.
   */
  deleteSelected(): boolean {
    if (this.ports.room.selection() !== null && this.editing()) {
      return this.ports.room.deleteSelected();
    }
    const world = this.ports.world();
    const index = this.selection();
    if (!world || index === null || !this.editing()) {
      return false;
    }
    const decor = removeDecorItem(world.decor, index);
    if (!decor) {
      return false;
    }
    this.apply(decor, null);
    return true;
  }

  /**
   * Clic en mode édition (#167) : un élément touché est sélectionné ; un point du sable reçoit
   * l'élément de l'outil courant (qui est alors sélectionné), ou, avec l'outil `select`,
   * désélectionne ; un clic hors du bac désélectionne. Décor masqué (masqué pendant
   * l'édition) : rien n'est posé (#176). Sans effet hors du mode édition.
   */
  editAt(pick: DecorPick): void {
    const world = this.ports.world();
    if (!world || !this.editing()) {
      return;
    }
    if (pick === null) {
      return this.select(null);
    }
    if (pick.kind === 'item') {
      return this.select(pick.index);
    }
    const tool = this.tool();
    if (pick.kind === 'room-item' || pick.kind === 'floor') {
      return this.editRoomAt(pick, tool);
    }
    if (tool === 'select' || isRoomTool(tool) || !this.ports.decorVisible()) {
      return this.select(null);
    }
    const decor = addDecorItem(world.decor, tool, pick.x, pick.z, world.seed, world);
    if (!decor) {
      return this.select(null);
    }
    const index = decor.length - 1;
    const drop = this.dropItem(decor, index, world);
    // Un élément ajouté peut chevaucher (#167) ; sa chute ne doit pas l'aggraver.
    const allowed = isDecorPoseAllowed(decor, drop.decor, index);
    this.apply(allowed ? drop.decor : decor, index);
    this.playDrop(index, allowed ? drop.path : []);
  }

  /**
   * Clic sur la pièce (#188) : un outil de la pièce pose au point visé (sur le parquet ou sur
   * le meuble touché) ; sinon, un élément touché est sélectionné, le parquet désélectionne.
   */
  private editRoomAt(
    pick: Extract<DecorPick, { kind: 'room-item' | 'floor' }>,
    tool: EditorTool,
  ): void {
    if (isRoomTool(tool)) {
      this.ports.room.add(tool, pick.x, pick.z);
    } else if (pick.kind === 'room-item') {
      this.ports.room.select(pick.index);
    } else {
      this.select(null);
    }
  }

  /**
   * Tourne l'élément sélectionné de `steps` pas de 15° (flèches, boutons, #168), ou d'un quart
   * de tour un élément de la pièce (#188) ; renvoie `true` si la pose a changé. Refusée
   * (`refused`) si elle pénètre un autre élément.
   */
  rotateSelected(steps: number): boolean {
    if (this.ports.room.selection() !== null) {
      return this.ports.room.turnSelected(steps);
    }
    return this.editSelected((decor, index, env) => rotateDecorItem(decor, index, steps, env));
  }

  /**
   * Agrandit (`steps` > 0) ou réduit l'élément sélectionné (touches + et −, boutons, #168) ;
   * renvoie `true` si la pose a changé. Sans effet à la borne d'échelle ; refusée
   * (`refused`) si elle pénètre un autre élément.
   */
  scaleSelected(steps: number): boolean {
    // Un élément de la pièce garde sa taille (#188).
    if (this.ports.room.selection() !== null) {
      return false;
    }
    return this.editSelected((decor, index, env) => scaleDecorItem(decor, index, steps, env));
  }

  /** Début du glissement de l'élément `index` (#168) : il est sélectionné. */
  startDrag(index: number): void {
    const world = this.ports.world();
    if (!world || !this.editing() || index < 0 || index >= world.decor.length) {
      return;
    }
    this.finishDrop();
    this.select(index);
    this.drag = { base: world.decor, index, preview: null };
  }

  /** Glissement (#168) : aperçu de l'élément au point visé, borné au bac. */
  moveDrag(index: number, x: number, z: number): void {
    const world = this.ports.world();
    const drag = this.drag;
    if (!world || !drag || drag.index !== index || world.decor !== drag.base) {
      return;
    }
    const preview = moveDecorItem(world.decor, index, x, z, world);
    if (preview) {
      drag.preview = preview;
      this.ports.view()?.previewDecorMove(index, preview[index].x, preview[index].z);
      this.ports.scheduleFrame();
    }
  }

  /**
   * Fin du glissement (#168) : la pose est enregistrée si elle ne pénètre aucun autre élément
   * (`isDecorPoseAllowed`) ; sinon, ou si le geste est abandonné, l'élément revient à sa
   * dernière pose valide.
   */
  endDrag(index: number, commit: boolean): void {
    const world = this.ports.world();
    const drag = this.drag;
    this.drag = null;
    if (!world || !drag || drag.index !== index || world.decor !== drag.base || !drag.preview) {
      return;
    }
    // Lâché (#170) : l'élément tombe à sa nouvelle position avant d'être posé.
    const drop = commit
      ? this.dropItem(drag.preview, index, world)
      : { decor: drag.preview, path: [] };
    const allowed = isDecorPoseAllowed(world.decor, drop.decor, index);
    if (commit && this.editing() && allowed) {
      this.apply(drop.decor, index);
      this.playDrop(index, drop.path);
      return;
    }
    const last = world.decor[index];
    this.ports.view()?.previewDecorMove(index, last.x, last.z);
    this.refused.set(commit && !allowed);
    this.ports.scheduleFrame();
  }

  /** Avance la chute affichée de `realDt` secondes ; à la fin, l'élément est à sa pose. */
  stepDrop(realDt: number): void {
    const animation = this.dropAnimation;
    const view = this.ports.view();
    if (!animation || !view) {
      return;
    }
    const item = this.ports.world()?.decor[animation.index];
    if (!item) {
      this.dropAnimation = null;
      return;
    }
    animation.elapsed += realDt;
    const step = Math.floor(animation.elapsed / DROP_TIME_STEP);
    if (step >= animation.path.length - 1) {
      this.dropAnimation = null;
      view.previewDecorPose(animation.index, item.x, decorBaseY(item), item.z);
      return;
    }
    const p = animation.path[step];
    view.previewDecorPose(animation.index, p.x, p.y, p.z);
  }

  /** Termine aussitôt la chute affichée (l'élément rejoint sa pose). */
  finishDrop(): void {
    this.stepDrop(Number.POSITIVE_INFINITY);
  }

  /** Expose le nombre d'éléments du décor (`data-aqfish-decor-count`). */
  private refreshCount(): void {
    const count = this.ports.world()?.decor.length ?? 0;
    this.count.set(count);
    this.ports.probe.publishDecorCount(count);
  }

  /** Expose la sélection (`data-aqfish-decor-selected`). */
  private refreshSelection(index: number | null): void {
    this.selection.set(index);
    this.ports.probe.publishDecorSelection(index);
  }

  /** Charge le moteur de chute une seule fois (#170) ; un échec est retenu (`indisponible`). */
  private loadPhysics(): void {
    if (this.physics() !== 'absent') {
      return;
    }
    this.setPhysics('chargement');
    this.ports.loadPhysics().then(
      (dropper) => {
        this.dropper = dropper;
        this.setPhysics('pret');
      },
      () => this.setPhysics('indisponible'),
    );
  }

  private setPhysics(state: DecorPhysicsState): void {
    this.physics.set(state);
    this.ports.probe.publishDecorPhysics(state);
  }

  /**
   * Fait tomber l'élément `index` de `decor` (#170) depuis le dessus du décor jusqu'au repos
   * sur le sable ou sur un autre élément. Sans moteur (en chargement ou indisponible), ou si
   * la chute échoue, l'élément est posé sur le sable à sa position.
   */
  private dropItem(decor: readonly DecorItem[], index: number, environment: Place): DropOutcome {
    const scene = this.dropper ? decorDropScene(decor, index, environment) : null;
    if (this.dropper && scene) {
      try {
        const result = this.dropper.drop(scene);
        const settled = settleDecorItem(decor, index, result.rest, environment);
        if (settled) {
          this.dropGrounded.set(false);
          return { decor: settled, path: [scene.start, ...result.path] };
        }
      } catch {
        // Moteur en erreur : repli sur le sable, comme sans moteur.
      }
    }
    this.dropGrounded.set(this.physics() === 'indisponible');
    return { decor: groundDecorItem(decor, index) ?? decor, path: [] };
  }

  /**
   * Chute d'un élément depuis sa pose (#182) : son support a disparu. Mêmes moteur et lecture
   * du repos que le lâcher (`dropItem`), départ à sa pose (`decorFallScene`). `null` sans
   * moteur, hors d'un environnement éditable, ou si le moteur échoue.
   */
  private readonly fall: DecorFall = (decor, index) => {
    const world = this.ports.world();
    const scene = world ? decorFallScene(decor, index, world) : null;
    if (!world || !this.dropper || !scene) {
      return null;
    }
    try {
      const result = this.dropper.drop(scene);
      const settled = settleDecorItem(decor, index, result.rest, world);
      return settled ? { decor: settled, path: [scene.start, ...result.path] } : null;
    } catch {
      return null;
    }
  };

  /** Affiche la chute de l'élément `index` le long de `path` (rien si `path` est vide). */
  private playDrop(index: number, path: readonly DropPoint[]): void {
    this.dropAnimation = path.length > 0 ? { index, path, elapsed: 0 } : null;
  }

  /**
   * Applique `edit` à l'élément sélectionné ; `null` d'`edit` : pose refusée ou inchangée.
   * Un élément posé sur un autre retombe ensuite depuis sa position (#183, `redropEdited`).
   */
  private editSelected(edit: DecorEdit): boolean {
    const world = this.ports.world();
    const index = this.selection();
    if (!world || index === null || !this.editing() || this.drag) {
      return false;
    }
    const redrop = this.redropEdited(edit, world.decor, index, world);
    if (redrop) {
      this.apply(redrop.decor, index);
      this.playDrop(index, redrop.path);
      return true;
    }
    const decor = edit(world.decor, index, world);
    if (!decor) {
      // Inchangée à la borne d'échelle ; sinon, la pose pénétrait un voisin.
      this.refused.set(edit([world.decor[index]], 0, world) !== null);
      return false;
    }
    this.apply(decor, index);
    return true;
  }

  /**
   * Rotation ou échelle d'un élément posé sur un autre (`elevation` > 0, #183) : l'élément
   * modifié retombe depuis sa position, par le moteur du lâcher (`dropItem`). Réduit ou
   * tourné, il rejoint son support au lieu de rester au-dessus d'un vide ; agrandi, il s'y
   * repose plus haut au lieu d'être refusé. `null` si l'élément est sur le sable (sa pose ne
   * change pas), si le moteur n'est pas prêt (l'élévation est alors gardée : la poser sur le
   * sable la ferait pénétrer son support), si `edit` échoue même sans voisins (borne
   * d'échelle), ou si la pose obtenue pénètre un autre élément (`isDecorPoseAllowed`).
   */
  private redropEdited(
    edit: DecorEdit,
    decor: readonly DecorItem[],
    index: number,
    env: Place,
  ): DropOutcome | null {
    if (!this.dropper || decorElevation(decor[index]) === 0) {
      return null;
    }
    // Sans les voisins : la pose est vérifiée après la chute, pas à l'élévation d'avant.
    const alone = edit([decor[index]], 0, env);
    if (!alone) {
      return null;
    }
    const candidate = decor.map((item, n) => (n === index ? alone[0] : item));
    const drop = this.dropItem(candidate, index, env);
    return drop.path.length > 0 && isDecorPoseAllowed(decor, drop.decor, index) ? drop : null;
  }

  /**
   * Installe un décor édité (#167) : les éléments dont le support a disparu retombent d'abord
   * (#182, `releaseUnsupportedDecor`), puis obstacles du monde recalculés, vue mise à jour,
   * sélection `selection`, et sauvegarde immédiate (le rechargement le restitue). La première
   * de ces chutes est affichée, sauf si l'appelant affiche ensuite la sienne (`playDrop`).
   */
  private apply(decor: readonly DecorItem[], selection: number | null): void {
    const world = this.ports.world();
    const view = this.ports.view();
    if (!world || !view) {
      return;
    }
    this.finishDrop();
    const released = releaseUnsupportedDecor(decor, this.dropper ? this.fall : null);
    setDecorInPlace(world, released.decor);
    const first = released.falls[0];
    if (first) {
      this.playDrop(first.index, first.path);
    }
    this.refused.set(false);
    view.replaceDecorItems(world.decor, world.seed);
    this.ports.decorChanged(world);
    this.refreshCount();
    view.setDecorSelection(selection);
    this.refreshSelection(selection);
    this.ports.saveNow();
    this.ports.scheduleFrame();
  }
}
