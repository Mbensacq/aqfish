import { clampRoom, type Room } from '../sim/room';
import { SAND_THICKNESS } from '../sim/tank';
import type { DecorPick } from './decor-pick';
import { isClick } from './food-pick';
import { STROKE_STEP_PX, strokePoints, type StrokePoint } from './stroke';

/**
 * Abonné au glissement d'un élément du décor à la souris ou au doigt (#168, `onDecorDrag`).
 * `start` : appui sur l'élément `index` (la caméra ne tourne plus) ; `move` : centre visé en
 * (x, z) sur le plan du sable, **non borné** (le décalage entre le point saisi et le centre
 * est conservé), seulement au-delà de `CLICK_TOLERANCE_PX` ; `end` : relâchement (`commit`
 * vrai si l'élément a bougé), ou abandon (`commit` faux : annulation du pointeur, fin du
 * mode édition).
 */
export interface DecorDragListener {
  start(index: number): void;
  move(index: number, x: number, z: number): void;
  end(index: number, commit: boolean): void;
}

/** Point (x, z) d'un plan horizontal, repère du bac. */
interface PlanePoint {
  readonly x: number;
  readonly z: number;
}

/** Ce dont les gestes du pointeur ont besoin de la vue (`AquariumView`, #698). */
export interface DragHost {
  readonly canvas: HTMLCanvasElement;
  /** Contrôles orbitaux, coupés le temps d'un geste. */
  readonly controls: { enabled: boolean };
  /** Contrôles à la souris demandés (faux en mode capture). */
  readonly interactive: boolean;
  /** Contrôles orbitaux permis hors geste : vue interactive, non libérée, hors caméra libre. */
  orbitAllowed(): boolean;
  pickDecor(clientX: number, clientY: number): DecorPick;
  pickWaterSurface(clientX: number, clientY: number): PlanePoint | null;
  /** Point du plan horizontal Y = `y` sous le point de l'écran, `null` hors du canvas. */
  planeAt(clientX: number, clientY: number, y: number): PlanePoint | null;
  /** Centre de la base de l'élément `index` du décor affiché, `null` s'il n'existe pas. */
  decorItemPosition(index: number): PlanePoint | null;
  /** Pièce construite par `setRoom` (choix à la souris). */
  room(): Room;
}

type DragTarget = 'decor' | 'room';

/** Élément saisi par un appui : cible, centre et plan de glissement. */
interface DragGrip {
  readonly target: DragTarget;
  readonly index: number;
  readonly center: PlanePoint;
  readonly planeY: number;
}

/** Glissement en cours d'un élément du décor ou de la pièce. */
interface Drag {
  readonly id: number;
  /** Élément du décor, ou de la pièce (#188), glissé sur le plan de sa base. */
  readonly target: DragTarget;
  readonly planeY: number;
  readonly index: number;
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly start: { readonly x: number; readonly y: number };
  moved: boolean;
}

const isPrimaryButton = (event: PointerEvent): boolean => event.button === 0 && event.isPrimary;

function capturePointer(canvas: HTMLCanvasElement, id: number): void {
  try {
    canvas.setPointerCapture?.(id);
  } catch {
    // Pointeur déjà relâché : le geste s'arrêtera au prochain relâchement.
  }
}

function releasePointer(canvas: HTMLCanvasElement, id: number): void {
  try {
    canvas.releasePointerCapture?.(id);
  } catch {
    // Capture déjà relâchée par le navigateur.
  }
}

/**
 * Gestes du pointeur sur le canvas de la vue, hors caméra (#698) : clic (nourrissage, #67),
 * glissement du décor et de la pièce (#168, #188) et passage de raclette (#604).
 *
 * Les appuis du glissement et de la raclette sont écoutés en phase de capture, donc avant
 * `OrbitControls`, coupés pour tout le geste (`docs/PIEGES.md`). Les écouteurs sont posés à la
 * construction, dans l'ordre d'origine : construire après les contrôles et avant les gestes de
 * la caméra libre, qui lisent `dragging` et `stroking`.
 */
export class DragController {
  /** Abonnés au clic sur la surface de l'eau (`onSurfaceClick`). */
  private readonly surfaceClickListeners = new Set<(x: number, z: number) => void>();
  /** Abonnés à tout clic sur le canvas (`onCanvasClick`), avant ceux de la surface. */
  private readonly canvasClickListeners = new Set<(clientX: number, clientY: number) => void>();
  /** Appui du pointeur principal en attente de relâchement (`null` : aucun clic possible). */
  private pendingClick: { readonly id: number; readonly x: number; readonly y: number } | null =
    null;
  /** Glissement du décor possible (mode édition, `setDecorDragEnabled`). */
  private decorDragEnabled = false;
  private decorDragListener: DecorDragListener | null = null;
  /** Abonné au glissement d'un élément de la pièce (#188, `onRoomDrag`). */
  private roomDragListener: DecorDragListener | null = null;
  /** Glissement en cours d'un élément du décor ou de la pièce (`null` sinon). */
  private drag: Drag | null = null;
  /** Passage de raclette possible (séance d'entretien, #604, `setStrokeEnabled`). */
  private strokeEnabled = false;
  private strokeListener: ((points: readonly StrokePoint[]) => void) | null = null;
  /** Passage de raclette en cours : pointeur et dernier point transmis (`null` sinon). */
  private stroke: { readonly id: number; last: { x: number; y: number } } | null = null;

  constructor(private readonly host: DragHost) {
    const canvas = host.canvas;
    // Nourrissage au clic (issue #67) : écouté à côté des contrôles, qui gardent le glisser.
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    // Glissement du décor (#168) : avant `OrbitControls`, qui écoute en phase de bouillonnement.
    canvas.addEventListener('pointerdown', this.onDragPointerDown, { capture: true });
    canvas.addEventListener('pointermove', this.onDragPointerMove);
    // Passage de raclette (#604) : comme le glissement du décor, avant `OrbitControls`.
    canvas.addEventListener('pointerdown', this.onStrokePointerDown, { capture: true });
    canvas.addEventListener('pointermove', this.onStrokePointerMove);
    canvas.addEventListener('pointerup', this.onStrokePointerEnd);
    canvas.addEventListener('pointercancel', this.onStrokePointerEnd);
  }

  /** Vrai pendant le glissement d'un élément du décor ou de la pièce. */
  get dragging(): boolean {
    return this.drag !== null;
  }

  /** Vrai pendant un passage de raclette. */
  get stroking(): boolean {
    return this.stroke !== null;
  }

  /** Oublie l'appui en attente : son relâchement ne sera pas un clic (pincement, #344). */
  cancelClick(): void {
    this.pendingClick = null;
  }

  /** Voir `AquariumView.setDecorDragEnabled`. */
  setDecorDragEnabled(enabled: boolean): void {
    this.decorDragEnabled = enabled;
    if (!enabled && this.drag) {
      this.endDrag(false);
    }
  }

  /** Voir `AquariumView.setStrokeEnabled`. */
  setStrokeEnabled(enabled: boolean): void {
    this.strokeEnabled = enabled;
    if (!enabled) {
      this.endStroke();
    }
  }

  /** Voir `AquariumView.onStroke`. */
  onStroke(listener: (points: readonly StrokePoint[]) => void): () => void {
    this.strokeListener = listener;
    return () => {
      if (this.strokeListener === listener) {
        this.strokeListener = null;
      }
    };
  }

  /** Voir `AquariumView.onDecorDrag`. */
  onDecorDrag(listener: DecorDragListener): () => void {
    this.decorDragListener = listener;
    return () => {
      if (this.decorDragListener === listener) {
        this.decorDragListener = null;
      }
    };
  }

  /** Voir `AquariumView.onRoomDrag`. */
  onRoomDrag(listener: DecorDragListener): () => void {
    this.roomDragListener = listener;
    return () => {
      if (this.roomDragListener === listener) {
        this.roomDragListener = null;
      }
    };
  }

  /** Voir `AquariumView.onCanvasClick`. */
  onCanvasClick(listener: (clientX: number, clientY: number) => void): () => void {
    this.canvasClickListeners.add(listener);
    return () => this.canvasClickListeners.delete(listener);
  }

  /** Voir `AquariumView.onSurfaceClick`. */
  onSurfaceClick(listener: (x: number, z: number) => void): () => void {
    this.surfaceClickListeners.add(listener);
    return () => this.surfaceClickListeners.delete(listener);
  }

  /** Retire les écouteurs du canvas et oublie gestes et abonnés. */
  dispose(): void {
    const canvas = this.host.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    canvas.removeEventListener('pointerdown', this.onDragPointerDown, { capture: true });
    canvas.removeEventListener('pointermove', this.onDragPointerMove);
    canvas.removeEventListener('pointerdown', this.onStrokePointerDown, { capture: true });
    canvas.removeEventListener('pointermove', this.onStrokePointerMove);
    canvas.removeEventListener('pointerup', this.onStrokePointerEnd);
    canvas.removeEventListener('pointercancel', this.onStrokePointerEnd);
    this.stroke = null;
    this.strokeListener = null;
    this.drag = null;
    this.decorDragListener = null;
    this.roomDragListener = null;
    this.surfaceClickListeners.clear();
    this.canvasClickListeners.clear();
  }

  /**
   * Appui en mode raclette (#604) : écouté en phase de capture, avant `OrbitControls`, coupés
   * pour tout le geste ; les points du glissé (tous les `STROKE_STEP_PX` au plus) sont
   * transmis à l'abonné, groupés par événement (#617), souris comme doigt.
   */
  private readonly onStrokePointerDown = (event: PointerEvent) => {
    const listener = this.strokeListener;
    if (
      !listener ||
      !this.strokeEnabled ||
      !this.host.interactive ||
      this.drag ||
      this.stroke ||
      !isPrimaryButton(event)
    ) {
      return;
    }
    this.stroke = { id: event.pointerId, last: { x: event.clientX, y: event.clientY } };
    this.host.controls.enabled = false;
    capturePointer(this.host.canvas, event.pointerId);
    listener([{ x: event.clientX, y: event.clientY }]);
  };

  private readonly onStrokePointerMove = (event: PointerEvent) => {
    const stroke = this.stroke;
    if (!stroke || stroke.id !== event.pointerId) {
      return;
    }
    const to = { x: event.clientX, y: event.clientY };
    const points = strokePoints(stroke.last, to, STROKE_STEP_PX);
    if (points.length > 0) {
      this.strokeListener?.(points);
    }
    stroke.last = to;
  };

  private readonly onStrokePointerEnd = (event: PointerEvent) => {
    if (this.stroke?.id === event.pointerId) {
      this.endStroke();
    }
  };

  /** Termine le passage de raclette en cours : caméra rendue. */
  private endStroke(): void {
    const stroke = this.stroke;
    if (!stroke) {
      return;
    }
    this.stroke = null;
    this.host.controls.enabled = this.host.orbitAllowed();
    releasePointer(this.host.canvas, stroke.id);
  }

  /**
   * Appui sur un élément du décor en mode édition (#168) : écouté en phase de capture, donc
   * avant `OrbitControls`, coupés pour tout le geste (glisser un élément ne tourne pas la
   * caméra). Un appui dans le vide laisse les contrôles tourner comme avant.
   */
  private readonly onDragPointerDown = (event: PointerEvent) => {
    if (
      !this.decorDragListener ||
      !this.decorDragEnabled ||
      !this.host.interactive ||
      this.drag ||
      !isPrimaryButton(event)
    ) {
      return;
    }
    const grip = this.gripAt(event.clientX, event.clientY);
    if (grip) {
      this.beginDrag(event, grip);
    }
  };

  /**
   * Élément saisi sous le point de l'écran : élément du décor posé, ou élément de la pièce
   * s'il a un abonné (`onRoomDrag`) ; `null` dans le vide.
   */
  private gripAt(clientX: number, clientY: number): DragGrip | null {
    const pick = this.host.pickDecor(clientX, clientY);
    if (pick?.kind === 'item') {
      const center = this.host.decorItemPosition(pick.index);
      return center ? { target: 'decor', index: pick.index, center, planeY: SAND_THICKNESS } : null;
    }
    if (pick?.kind !== 'room-item') {
      return null;
    }
    const room = this.host.room();
    const item = room.items?.[pick.index];
    if (!item || !this.roomDragListener) {
      return null;
    }
    const planeY = (item.elevation ?? 0) - clampRoom(room).cabinetHeight;
    return { target: 'room', index: pick.index, center: item, planeY };
  }

  /** Commence le glissement de `grip` : prise gardée, caméra coupée, abonné prévenu. */
  private beginDrag(event: PointerEvent, grip: DragGrip): void {
    const grab = this.host.planeAt(event.clientX, event.clientY, grip.planeY);
    this.drag = {
      id: event.pointerId,
      target: grip.target,
      planeY: grip.planeY,
      index: grip.index,
      offsetX: grab ? grip.center.x - grab.x : 0,
      offsetZ: grab ? grip.center.z - grab.z : 0,
      start: { x: event.clientX, y: event.clientY },
      moved: false,
    };
    this.host.controls.enabled = false;
    this.host.canvas.style.cursor = 'grabbing';
    capturePointer(this.host.canvas, event.pointerId);
    this.listenerFor(grip.target)?.start(grip.index);
  }

  private readonly onDragPointerMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) {
      return;
    }
    if (!drag.moved && isClick(drag.start, { x: event.clientX, y: event.clientY })) {
      return;
    }
    drag.moved = true;
    const p = this.host.planeAt(event.clientX, event.clientY, drag.planeY);
    if (p) {
      this.listenerFor(drag.target)?.move(drag.index, p.x + drag.offsetX, p.z + drag.offsetZ);
    }
  };

  private listenerFor(target: DragTarget): DecorDragListener | null {
    return target === 'room' ? this.roomDragListener : this.decorDragListener;
  }

  /** Termine le glissement en cours : caméra rendue, abonné prévenu. */
  private endDrag(commit: boolean): void {
    const drag = this.drag;
    if (!drag) {
      return;
    }
    this.drag = null;
    this.host.controls.enabled = this.host.orbitAllowed();
    this.host.canvas.style.cursor = '';
    releasePointer(this.host.canvas, drag.id);
    this.listenerFor(drag.target)?.end(drag.index, commit && drag.moved);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.pendingClick = isPrimaryButton(event)
      ? { id: event.pointerId, x: event.clientX, y: event.clientY }
      : null;
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.drag?.id === event.pointerId) {
      this.endDrag(true);
    }
    const down = this.pendingClick;
    this.pendingClick = null;
    if (
      !down ||
      down.id !== event.pointerId ||
      !this.host.interactive ||
      !isClick(down, { x: event.clientX, y: event.clientY })
    ) {
      return;
    }
    for (const listener of this.canvasClickListeners) {
      listener(event.clientX, event.clientY);
    }
    const point = this.host.pickWaterSurface(event.clientX, event.clientY);
    if (point) {
      for (const listener of this.surfaceClickListeners) {
        listener(point.x, point.z);
      }
    }
  };

  private readonly onPointerCancel = (event: PointerEvent) => {
    this.pendingClick = null;
    if (this.drag?.id === event.pointerId) {
      this.endDrag(false);
    }
  };
}
