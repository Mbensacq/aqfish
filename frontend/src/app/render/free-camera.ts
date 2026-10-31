import { CABINET_OVERHANG, roomInterior } from '../sim/room';
import type { CameraPose, TankDimensions, Vec3 } from './camera-presets';

/**
 * Caméra libre dans la pièce (#343, ADR 0084) : modèle de déplacement pur, sans Three.js. La
 * caméra flotte dans la pièce (pas de vue à la première personne) : avancer, reculer, côtés
 * dans le plan horizontal, monter et descendre, orientation à la souris. La vitesse tend vers
 * la consigne du clavier avec un amortissement exponentiel, avancé par pas fixes : mêmes
 * entrées, même trajectoire, quel que soit le découpage du temps réel en images.
 */

/** Boîte alignée sur les axes (repère du bac, mètres). */
export interface FreeBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Limites de la caméra libre : volume permis et obstacle à contourner (bac et meuble). */
export interface FreeCameraBounds {
  /** Intérieur de la pièce, réduit de `FREE_CAMERA_CLEARANCE`. */
  readonly room: FreeBox;
  /** Bac et son meuble, agrandis de `FREE_CAMERA_CLEARANCE` : la caméra n'y entre pas. */
  readonly obstacle: FreeBox;
}

/** État de la caméra libre. */
export interface FreeCameraState {
  readonly position: Vec3;
  /** Cap autour de la verticale, en radians : 0 regarde vers −Z (le mur du fond). */
  readonly yaw: number;
  /** Inclinaison, en radians, bornée par `FREE_CAMERA_MAX_PITCH` (positive vers le haut). */
  readonly pitch: number;
  /** Vitesse, en m/s (repère du bac). */
  readonly velocity: Vec3;
}

/** Consigne du clavier, chaque axe dans [−1, 1]. */
export interface FreeCameraInput {
  /** +1 avancer, −1 reculer (selon le cap, dans le plan horizontal). */
  readonly forward: number;
  /** +1 vers la droite, −1 vers la gauche. */
  readonly strafe: number;
  /** +1 monter, −1 descendre. */
  readonly vertical: number;
}

/** Aucune touche enfoncée. */
export const FREE_CAMERA_IDLE: FreeCameraInput = { forward: 0, strafe: 0, vertical: 0 };

/** Distance minimale gardée aux murs, au sol, au plafond et au bac (m). */
export const FREE_CAMERA_CLEARANCE = 0.15;

/** Vitesse de croisière (m/s). */
export const FREE_CAMERA_SPEED = 1.2;

/** Constante de temps de l'amortissement de la vitesse (s). */
export const FREE_CAMERA_DAMPING_SECONDS = 0.15;

/** Pas fixe d'intégration (s). */
export const FREE_CAMERA_STEP = 1 / 120;

/** Temps réel pris en compte au plus par appel (s) : un onglet masqué ne téléporte pas. */
export const FREE_CAMERA_MAX_DT = 0.25;

/** Inclinaison maximale (rad) : jamais à la verticale, où l'axe « haut » serait indéfini. */
export const FREE_CAMERA_MAX_PITCH = Math.PI / 2 - 0.05;

/** Rotation par pixel de glissement de la souris (rad). */
export const FREE_CAMERA_LOOK_SENSITIVITY = 0.004;

/** Écart sous lequel une vitesse résiduelle est annulée (m/s). */
const REST_SPEED = 1e-4;

/**
 * Limites de la caméra libre autour d'un bac `dims` posé sur un meuble de hauteur
 * `cabinetHeight` : faces intérieures de la pièce (`roomInterior`), sol du parquet à
 * `−cabinetHeight`, dessous des poutres ; bac et meuble (au débord du plateau) comme obstacle.
 * Chaque face est rapprochée de `FREE_CAMERA_CLEARANCE`. Fonction pure.
 * @throws RangeError si une dimension ou la hauteur du meuble n'est pas un réel valide.
 */
export function freeCameraBounds(dims: TankDimensions, cabinetHeight: number): FreeCameraBounds {
  for (const value of [dims.width, dims.height, dims.depth]) {
    if (!(value > 0 && Number.isFinite(value))) {
      throw new RangeError(`Dimensions de bac invalides : ${JSON.stringify(dims)}`);
    }
  }
  if (!(cabinetHeight >= 0 && Number.isFinite(cabinetHeight))) {
    throw new RangeError(`Hauteur de meuble invalide : ${cabinetHeight}`);
  }
  const inner = roomInterior(dims);
  const c = FREE_CAMERA_CLEARANCE;
  const halfW = dims.width / 2 + CABINET_OVERHANG;
  const halfD = dims.depth / 2 + CABINET_OVERHANG;
  return {
    room: {
      minX: inner.minX + c,
      maxX: inner.maxX - c,
      minY: -cabinetHeight + c,
      maxY: inner.beamY - c,
      minZ: inner.minZ + c,
      maxZ: inner.maxZ - c,
    },
    obstacle: {
      minX: -halfW - c,
      maxX: halfW + c,
      minY: -cabinetHeight - c,
      maxY: dims.height + c,
      minZ: -halfD - c,
      maxZ: halfD + c,
    },
  };
}

/** Vrai si `p` est strictement à l'intérieur de `box`. */
export function insideBox(box: FreeBox, p: Vec3): boolean {
  return (
    p[0] > box.minX &&
    p[0] < box.maxX &&
    p[1] > box.minY &&
    p[1] < box.maxY &&
    p[2] > box.minZ &&
    p[2] < box.maxZ
  );
}

/** Vrai si `p` est une position permise : dans la pièce, hors de l'obstacle. */
export function isFreePositionAllowed(bounds: FreeCameraBounds, p: Vec3): boolean {
  const r = bounds.room;
  const inRoom =
    p[0] >= r.minX &&
    p[0] <= r.maxX &&
    p[1] >= r.minY &&
    p[1] <= r.maxY &&
    p[2] >= r.minZ &&
    p[2] <= r.maxZ;
  return inRoom && !insideBox(bounds.obstacle, p);
}

/**
 * Position permise la plus proche de `p` : ramenée dans la pièce, puis sortie de l'obstacle
 * par la face la plus proche qui reste dans la pièce (le dessus du bac en dernier recours).
 * Position déjà permise : renvoyée telle quelle. Fonction pure.
 */
export function constrainFreePosition(bounds: FreeCameraBounds, p: Vec3): Vec3 {
  const r = bounds.room;
  const clamped: Vec3 = [
    clamp(finiteOr(p[0], 0), r.minX, r.maxX),
    clamp(finiteOr(p[1], r.maxY), r.minY, r.maxY),
    clamp(finiteOr(p[2], r.maxZ), r.minZ, r.maxZ),
  ];
  const o = bounds.obstacle;
  if (!insideBox(o, clamped)) {
    return clamped;
  }
  const [x, y, z] = clamped;
  const candidates: Vec3[] = [
    [o.minX, y, z],
    [o.maxX, y, z],
    [x, o.maxY, z],
    [x, y, o.minZ],
    [x, y, o.maxZ],
  ];
  let best: Vec3 = [x, Math.min(o.maxY, r.maxY), z];
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!isFreePositionAllowed(bounds, candidate)) {
      continue;
    }
    const distance = Math.hypot(candidate[0] - x, candidate[1] - y, candidate[2] - z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/**
 * État libre au départ d'une pose orbitale : même position (ramenée dans les limites), même
 * direction de visée, à l'arrêt. Pose dégénérée (caméra sur sa cible) : vers le mur du fond.
 */
export function freeCameraFromPose(pose: CameraPose, bounds: FreeCameraBounds): FreeCameraState {
  const dx = pose.target[0] - pose.position[0];
  const dy = pose.target[1] - pose.position[1];
  const dz = pose.target[2] - pose.position[2];
  const horizontal = Math.hypot(dx, dz);
  const length = Math.hypot(horizontal, dy);
  const yaw = length > 0 && horizontal > 0 ? Math.atan2(-dx, -dz) : 0;
  const pitch = length > 0 ? clampPitch(Math.atan2(dy, horizontal)) : 0;
  return {
    position: constrainFreePosition(bounds, pose.position),
    yaw,
    pitch,
    velocity: [0, 0, 0],
  };
}

/** Direction de visée (unitaire) pour un cap et une inclinaison. */
export function freeCameraDirection(yaw: number, pitch: number): Vec3 {
  const cos = Math.cos(pitch);
  return [-Math.sin(yaw) * cos, Math.sin(pitch), -Math.cos(yaw) * cos];
}

/**
 * Pose de la caméra libre : sa position, et une cible à `lookDistance` mètres dans la
 * direction de visée (la vue ne fait que l'appliquer).
 */
export function freeCameraPose(state: FreeCameraState, lookDistance = 1): CameraPose {
  const d = freeCameraDirection(state.yaw, state.pitch);
  const k = lookDistance > 0 && Number.isFinite(lookDistance) ? lookDistance : 1;
  const p = state.position;
  return { position: p, target: [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k] };
}

/**
 * Oriente la caméra d'un glissement de (`dx`, `dy`) pixels : vers la droite, le cap tourne
 * à droite ; vers le haut (dy < 0), la vue se lève. Inclinaison bornée. Valeurs non finies
 * ignorées. Fonction pure.
 */
export function turnFreeCamera(state: FreeCameraState, dx: number, dy: number): FreeCameraState {
  const ddx = Number.isFinite(dx) ? dx : 0;
  const ddy = Number.isFinite(dy) ? dy : 0;
  if (ddx === 0 && ddy === 0) {
    return state;
  }
  return {
    ...state,
    yaw: wrapAngle(state.yaw - ddx * FREE_CAMERA_LOOK_SENSITIVITY),
    pitch: clampPitch(state.pitch - ddy * FREE_CAMERA_LOOK_SENSITIVITY),
  };
}

/**
 * État de la caméra libre modifiable en place (`stepFreeCameraInPlace`) : la vue en garde un,
 * avec ses propres tableaux, pour ne rien allouer à chaque image (#352).
 */
export interface MutableFreeCameraState {
  readonly position: [number, number, number];
  yaw: number;
  pitch: number;
  readonly velocity: [number, number, number];
}

/** Copie modifiable de `state`, avec ses propres tableaux (aucun partage avec `state`). */
export function mutableFreeCameraState(state: FreeCameraState): MutableFreeCameraState {
  return {
    position: [state.position[0], state.position[1], state.position[2]],
    yaw: state.yaw,
    pitch: state.pitch,
    velocity: [state.velocity[0], state.velocity[1], state.velocity[2]],
  };
}

/**
 * Avance la caméra libre de `dtSeconds` (borné à `FREE_CAMERA_MAX_DT`) par pas fixes de
 * `FREE_CAMERA_STEP` (le reste, moins d'un pas, est rendu dans `remainder`) : vitesse amortie
 * vers la consigne, puis déplacement axe par axe ; un axe qui ferait sortir de la pièce ou
 * entrer dans l'obstacle est arrêté au bord et sa vitesse annulée (la caméra glisse le long
 * des parois). Fonction pure : mêmes entrées, même résultat ; moins d'un pas, `state` rendu
 * tel quel. Variante sans allocation : `stepFreeCameraInPlace`.
 */
export function stepFreeCamera(
  state: FreeCameraState,
  input: FreeCameraInput,
  dtSeconds: number,
  bounds: FreeCameraBounds,
  carry = 0,
): { state: FreeCameraState; remainder: number } {
  const time = stepTime(dtSeconds, carry);
  if (time < FREE_CAMERA_STEP - STEP_EPSILON) {
    return { state, remainder: time };
  }
  const next = mutableFreeCameraState(state);
  const remainder = stepFreeCameraInPlace(next, input, dtSeconds, bounds, carry);
  return { state: next, remainder };
}

/**
 * Même calcul que `stepFreeCamera`, mais `state.position` et `state.velocity` sont modifiés
 * en place (cap et inclinaison inchangés) ; renvoie le reste de temps. Aucune allocation : à
 * appeler à chaque image (#352). Mêmes entrées, même résultat que la version pure.
 */
export function stepFreeCameraInPlace(
  state: MutableFreeCameraState,
  input: FreeCameraInput,
  dtSeconds: number,
  bounds: FreeCameraBounds,
  carry = 0,
): number {
  let time = stepTime(dtSeconds, carry);
  const wish = wishVelocity(state.yaw, input, WISH);
  const blend = 1 - Math.exp(-FREE_CAMERA_STEP / FREE_CAMERA_DAMPING_SECONDS);
  const p = state.position;
  const v = state.velocity;
  while (time >= FREE_CAMERA_STEP - STEP_EPSILON) {
    time -= FREE_CAMERA_STEP;
    for (let axis = 0; axis < 3; axis++) {
      v[axis] += (wish[axis] - v[axis]) * blend;
      if (Math.abs(v[axis]) < REST_SPEED && wish[axis] === 0) {
        v[axis] = 0;
      }
    }
    for (let axis = 0; axis < 3; axis++) {
      if (v[axis] === 0) {
        continue;
      }
      const before = p[axis];
      p[axis] = before + v[axis] * FREE_CAMERA_STEP;
      if (!isFreePositionAllowed(bounds, p)) {
        p[axis] = edgeOnAxis(bounds, p, axis, before, v[axis]);
        v[axis] = 0;
      }
    }
  }
  return Math.max(0, time);
}

/** Vrai si la caméra est à l'arrêt (vitesse nulle). */
export function isFreeCameraAtRest(state: FreeCameraState): boolean {
  return state.velocity[0] === 0 && state.velocity[1] === 0 && state.velocity[2] === 0;
}

/** Tolérance sur le dernier pas fixe (arrondis de la soustraction répétée). */
const STEP_EPSILON = 1e-12;

/** Tampons de travail du pas de la caméra libre (#352) : jamais exposés, jamais conservés. */
const WISH: [number, number, number] = [0, 0, 0];
const PROBE: [number, number, number] = [0, 0, 0];

/** Temps à intégrer : `dtSeconds` (positif fini) plus le report, borné à `FREE_CAMERA_MAX_DT`. */
function stepTime(dtSeconds: number, carry: number): number {
  const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
  return Math.min(FREE_CAMERA_MAX_DT, dt + (Number.isFinite(carry) && carry > 0 ? carry : 0));
}

/**
 * Vitesse visée pour une consigne, écrite dans `out` : plan horizontal selon le cap,
 * verticale à part.
 */
function wishVelocity(
  yaw: number,
  input: FreeCameraInput,
  out: [number, number, number],
): [number, number, number] {
  const f = axisInput(input.forward);
  const s = axisInput(input.strafe);
  const u = axisInput(input.vertical);
  // Avant (cap) : (−sin, −cos) ; droite : (cos, −sin).
  let x = -Math.sin(yaw) * f + Math.cos(yaw) * s;
  let z = -Math.cos(yaw) * f - Math.sin(yaw) * s;
  const horizontal = Math.hypot(x, z);
  if (horizontal > 1) {
    // Diagonale : pas plus vite qu'en ligne droite.
    x /= horizontal;
    z /= horizontal;
  }
  out[0] = x * FREE_CAMERA_SPEED;
  out[1] = u * FREE_CAMERA_SPEED;
  out[2] = z * FREE_CAMERA_SPEED;
  return out;
}

/** Borne inférieure de `box` sur l'axe `axis` (0 : x, 1 : y, 2 : z). */
function boxMin(box: FreeBox, axis: number): number {
  return axis === 0 ? box.minX : axis === 1 ? box.minY : box.minZ;
}

/** Borne supérieure de `box` sur l'axe `axis` (0 : x, 1 : y, 2 : z). */
function boxMax(box: FreeBox, axis: number): number {
  return axis === 0 ? box.maxX : axis === 1 ? box.maxY : box.maxZ;
}

/**
 * Coordonnée `axis` au bord atteint en partant de `before` dans le sens de `velocity` : face
 * de la pièce ou face de l'obstacle. Les autres coordonnées de `p` sont déjà permises.
 */
function edgeOnAxis(
  bounds: FreeCameraBounds,
  p: readonly number[],
  axis: number,
  before: number,
  velocity: number,
): number {
  const o = bounds.obstacle;
  const clamped = clamp(p[axis], boxMin(bounds.room, axis), boxMax(bounds.room, axis));
  const probe = PROBE;
  probe[0] = p[0];
  probe[1] = p[1];
  probe[2] = p[2];
  probe[axis] = clamped;
  if (!insideBox(o, probe)) {
    return clamped;
  }
  // Entrée dans l'obstacle : arrêt sur sa face, du côté d'où l'on venait.
  return velocity > 0 ? Math.max(before, boxMin(o, axis)) : Math.min(before, boxMax(o, axis));
}

function axisInput(value: number): number {
  return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}

/** Inclinaison bornée à ±`FREE_CAMERA_MAX_PITCH` ; non finie : 0 (horizontale). */
export function clampFreePitch(pitch: number): number {
  return clampPitch(pitch);
}

function clampPitch(pitch: number): number {
  return clamp(Number.isFinite(pitch) ? pitch : 0, -FREE_CAMERA_MAX_PITCH, FREE_CAMERA_MAX_PITCH);
}

function wrapAngle(angle: number): number {
  const turn = 2 * Math.PI;
  let a = angle % turn;
  if (a > Math.PI) {
    a -= turn;
  } else if (a <= -Math.PI) {
    a += turn;
  }
  return a;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
