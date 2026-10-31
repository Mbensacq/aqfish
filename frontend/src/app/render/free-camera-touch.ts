import { CLICK_TOLERANCE_PX } from './food-pick';

/**
 * Gestes de la caméra libre au doigt et à la souris (#344, ADR 0085) : fonctions pures, sans
 * DOM ni Three.js. Un doigt (ou le bouton gauche) qui glisse oriente la vue, mais seulement
 * au-delà d'un seuil : un appui bref reste un clic (sélection du décor, granulés). Deux doigts
 * qui s'écartent avancent, qui se rapprochent reculent : chaque écart donne une poussée, dans
 * [−1, 1], qui s'éteint d'elle-même (amortissement exponentiel) dès que les doigts s'arrêtent.
 *
 * Les états sont mutés en place (pas d'allocation par événement ni par image, dette #352).
 */

/** Seuil du glisser d'orientation à la souris (px) : celui du clic, pour rester cohérent. */
export const LOOK_THRESHOLD_MOUSE_PX = CLICK_TOLERANCE_PX;

/** Seuil du glisser d'orientation au doigt (px) : un doigt tremble plus qu'une souris. */
export const LOOK_THRESHOLD_TOUCH_PX = 10;

/** Variation d'écart des deux doigts sous laquelle le pincement est ignoré (px). */
export const PINCH_THRESHOLD_PX = 12;

/** Poussée gagnée par pixel d'écartement : 120 px donnent la vitesse de croisière. */
export const PINCH_THRUST_PER_PX = 1 / 120;

/** Constante de temps de l'extinction de la poussée du pincement (s). */
export const TOUCH_THRUST_DECAY_SECONDS = 0.3;

/** Poussée résiduelle annulée (sans effet visible, évite une traîne infinie). */
export const TOUCH_THRUST_REST = 1e-3;

/** Glisser d'orientation en cours (un pointeur). */
export interface LookGesture {
  /** Identifiant du pointeur suivi. */
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  /** Seuil franchi : les mouvements orientent la vue. */
  engaged: boolean;
  /** Seuil du pointeur (px). */
  threshold: number;
}

/** Déplacement à appliquer (px), écrit par `moveLook` dans un tampon réutilisé. */
export interface LookDelta {
  dx: number;
  dy: number;
}

/** Pincement à deux doigts en cours. */
export interface PinchGesture {
  /** Identifiants des deux pointeurs. */
  readonly a: number;
  readonly b: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Écart de référence (px) : au départ, puis au dernier écart pris en compte. */
  reference: number;
  /** Seuil franchi : chaque variation d'écart compte. */
  engaged: boolean;
}

/** Seuil d'orientation selon le type de pointeur (`PointerEvent.pointerType`). */
export function lookThreshold(pointerType: string): number {
  return pointerType === 'touch' || pointerType === 'pen'
    ? LOOK_THRESHOLD_TOUCH_PX
    : LOOK_THRESHOLD_MOUSE_PX;
}

/** Début d'un glisser d'orientation au point (`x`, `y`). Valeurs non finies : 0. */
export function beginLook(id: number, x: number, y: number, pointerType: string): LookGesture {
  const fx = finite(x);
  const fy = finite(y);
  return {
    id,
    startX: fx,
    startY: fy,
    lastX: fx,
    lastY: fy,
    engaged: false,
    threshold: lookThreshold(pointerType),
  };
}

/**
 * Le pointeur du geste passe en (`x`, `y`) : écrit dans `out` le déplacement à appliquer
 * (depuis le point de départ au franchissement du seuil, rien n'est perdu ; depuis le dernier
 * point ensuite) et renvoie `true` s'il y en a un. Sous le seuil : `false`, `out` à zéro.
 * Coordonnées non finies : ignorées.
 */
export function moveLook(gesture: LookGesture, x: number, y: number, out: LookDelta): boolean {
  out.dx = 0;
  out.dy = 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return false;
  }
  if (!gesture.engaged) {
    if (Math.hypot(x - gesture.startX, y - gesture.startY) <= gesture.threshold) {
      return false;
    }
    gesture.engaged = true;
  }
  out.dx = x - gesture.lastX;
  out.dy = y - gesture.lastY;
  gesture.lastX = x;
  gesture.lastY = y;
  return out.dx !== 0 || out.dy !== 0;
}

/** Début d'un pincement entre les pointeurs `a` (en `ax`, `ay`) et `b` (en `bx`, `by`). */
export function beginPinch(
  a: number,
  ax: number,
  ay: number,
  b: number,
  bx: number,
  by: number,
): PinchGesture {
  const gesture: PinchGesture = {
    a,
    b,
    ax: finite(ax),
    ay: finite(ay),
    bx: finite(bx),
    by: finite(by),
    reference: 0,
    engaged: false,
  };
  gesture.reference = pinchDistance(gesture);
  return gesture;
}

/** Écart courant des deux doigts (px). */
export function pinchDistance(gesture: PinchGesture): number {
  return Math.hypot(gesture.bx - gesture.ax, gesture.by - gesture.ay);
}

/**
 * Le pointeur `id` du pincement passe en (`x`, `y`) : renvoie la variation d'écart à prendre
 * en compte (px, positive quand les doigts s'écartent), 0 sous le seuil, pour un autre
 * pointeur ou des coordonnées non finies.
 */
export function movePinch(gesture: PinchGesture, id: number, x: number, y: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return 0;
  }
  if (id === gesture.a) {
    gesture.ax = x;
    gesture.ay = y;
  } else if (id === gesture.b) {
    gesture.bx = x;
    gesture.by = y;
  } else {
    return 0;
  }
  const distance = pinchDistance(gesture);
  const delta = distance - gesture.reference;
  if (!gesture.engaged) {
    if (Math.abs(delta) <= PINCH_THRESHOLD_PX) {
      return 0;
    }
    gesture.engaged = true;
  }
  gesture.reference = distance;
  return delta;
}

/** Poussée après une variation d'écart de `deltaPx` : ajoutée, bornée à [−1, 1]. */
export function pinchThrust(thrust: number, deltaPx: number): number {
  const base = finite(thrust);
  const delta = Number.isFinite(deltaPx) ? deltaPx : 0;
  return clamp(base + delta * PINCH_THRUST_PER_PX, -1, 1);
}

/**
 * Poussée après `dtSeconds` sans nouveau pincement : décroissance exponentielle (même
 * résultat quel que soit le découpage du temps en images), annulée sous `TOUCH_THRUST_REST`.
 */
export function decayThrust(thrust: number, dtSeconds: number): number {
  const base = clamp(finite(thrust), -1, 1);
  const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
  const next = base * Math.exp(-dt / TOUCH_THRUST_DECAY_SECONDS);
  return Math.abs(next) < TOUCH_THRUST_REST ? 0 : next;
}

/** Consigne d'avance combinée (clavier ou boutons, plus poussée du pincement), dans [−1, 1]. */
export function combinedForward(keys: number, thrust: number): number {
  return clamp(finite(keys) + finite(thrust), -1, 1);
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
