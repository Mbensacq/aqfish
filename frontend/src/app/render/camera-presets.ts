import type { CameraPreset } from '../core/capture/capture-params';
import type { TankDimensions } from '../sim/tank';

export type { TankDimensions } from '../sim/tank';

export type Vec3 = readonly [number, number, number];

export interface CameraPose {
  readonly position: Vec3;
  readonly target: Vec3;
}

/** Champ de vision vertical de la caméra, en degrés. */
export const CAMERA_FOV_DEG = 45;

/** Marge autour du bac quand la caméra est sur un préréglage (1 = bac tangent au cadre). */
const FRAMING_MARGIN = 1.05;

/**
 * Décalage minimal (relatif à la distance) de la vue `top` selon Z : une caméra
 * exactement à la verticale de sa cible rend `lookAt` indéterminé (axe « haut » colinéaire).
 */
const VERTICAL_VIEW_OFFSET = 1e-3;

/**
 * Direction (non normalisée) de la vue de dessous : sous le fond, légèrement en avant, pour
 * lire à la fois le dessous du substrat et la vitre avant (voir ADR 0006).
 */
const BOTTOM_DIRECTION: Vec3 = [0, -1, 0.45];

/** Direction (non normalisée) de la vue trois-quarts : devant à droite, légèrement au-dessus. */
const THREE_QUARTER_DIRECTION: Vec3 = [0.75, 0.55, 1];

/** Centre du bac : cible commune de tous les préréglages. */
export function tankCenter(dims: TankDimensions): Vec3 {
  return [0, dims.height / 2, 0];
}

/** Rayon de la sphère englobant le bac, centrée sur `tankCenter`. */
export function tankBoundingRadius(dims: TankDimensions): number {
  return Math.hypot(dims.width, dims.height, dims.depth) / 2;
}

/** Marge de la borne de zoom minimale au-delà de la sphère englobante (5 %). */
const MIN_ORBIT_MARGIN = 1.05;

/** Borne de zoom maximale, relative au rayon de la sphère englobante. */
const MAX_ORBIT_FACTOR = 6;

/**
 * Bornes de distance caméra-cible pour l'orbite autour du centre du bac. La borne minimale
 * dépasse le rayon de la sphère englobante : la caméra reste hors du bac sous tous les angles.
 */
export function orbitDistanceLimits(dims: TankDimensions): { min: number; max: number } {
  assertPositiveDimensions(dims);
  const radius = tankBoundingRadius(dims);
  return { min: radius * MIN_ORBIT_MARGIN, max: radius * MAX_ORBIT_FACTOR };
}

/** Part du demi-champ vertical laissée de marge par `panTargetRadius` (10 %). */
const PAN_TARGET_SAFETY = 0.9;

/**
 * Rayon de la sphère, centrée sur `tankCenter`, dans laquelle reste la cible de la caméra
 * quand l'utilisateur la déplace au clic droit (bug #10). Choisi pour que le centre du bac
 * reste dans le champ vertical même à la distance d'orbite minimale : la caméra visant la
 * cible, le centre est vu sous un angle au plus `asin(rayon / distance)`, inférieur au
 * demi-champ dès que `rayon ≤ distanceMin × sin(demi-champ)`.
 */
export function panTargetRadius(dims: TankDimensions, fovDeg: number = CAMERA_FOV_DEG): number {
  if (!(fovDeg > 0 && fovDeg < 180)) {
    throw new RangeError(`Champ de vision invalide : ${fovDeg}`);
  }
  const { min } = orbitDistanceLimits(dims);
  return min * Math.sin((fovDeg * Math.PI) / 360) * PAN_TARGET_SAFETY;
}

/**
 * Distance à laquelle la sphère englobante du bac tient entièrement dans le cadre,
 * pour un champ vertical `fovDeg` et un rapport largeur / hauteur `aspect`.
 */
export function framingDistance(dims: TankDimensions, fovDeg: number, aspect: number): number {
  assertPositiveDimensions(dims);
  if (!(fovDeg > 0 && fovDeg < 180)) {
    throw new RangeError(`Champ de vision invalide : ${fovDeg}`);
  }
  if (!(aspect > 0 && Number.isFinite(aspect))) {
    throw new RangeError(`Rapport d'aspect invalide : ${aspect}`);
  }
  const halfVertical = (fovDeg * Math.PI) / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  const halfFov = Math.min(halfVertical, halfHorizontal);
  return (tankBoundingRadius(dims) / Math.sin(halfFov)) * FRAMING_MARGIN;
}

/**
 * Position et cible de la caméra pour un préréglage du contrat de capture.
 * Fonction pure : mêmes entrées, même résultat.
 */
export function cameraPresetPose(
  preset: CameraPreset,
  dims: TankDimensions,
  aspect: number,
  fovDeg: number = CAMERA_FOV_DEG,
): CameraPose {
  const target = tankCenter(dims);
  const distance = framingDistance(dims, fovDeg, aspect);
  const direction = presetDirection(preset);
  const position: Vec3 = [
    target[0] + direction[0] * distance,
    target[1] + direction[1] * distance,
    target[2] + direction[2] * distance,
  ];
  return { position, target };
}

function presetDirection(preset: CameraPreset): Vec3 {
  switch (preset) {
    case 'top':
      return normalize([0, 1, VERTICAL_VIEW_OFFSET]);
    case 'bottom':
      return normalize(BOTTOM_DIRECTION);
    case 'front':
      return [0, 0, 1];
    case 'side':
      return [1, 0, 0];
    case 'three-quarter':
      return normalize(THREE_QUARTER_DIRECTION);
  }
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

function assertPositiveDimensions(dims: TankDimensions): void {
  for (const value of [dims.width, dims.height, dims.depth]) {
    if (!(value > 0 && Number.isFinite(value))) {
      throw new RangeError(`Dimensions de bac invalides : ${JSON.stringify(dims)}`);
    }
  }
}

/** Durée des transitions de caméra vers un préréglage, en secondes (issue #7 : ≤ 0,6 s). */
export const CAMERA_TRANSITION_SECONDS = 0.5;

/** Lissage d'Hermite (`smoothstep`) de `t`, borné à [0, 1] : départ et arrivée en douceur. */
export function smoothstep(t: number): number {
  if (!(t > 0)) {
    return 0; // couvre aussi NaN
  }
  if (t >= 1) {
    return 1;
  }
  return t * t * (3 - 2 * t);
}

/**
 * Pose intermédiaire entre `from` (t = 0) et `to` (t = 1), avec lissage `smoothstep`.
 *
 * La cible est interpolée en ligne droite ; la position, en coordonnées sphériques autour de
 * la cible (distance, angle polaire depuis +Y, azimut par le plus court chemin) : la caméra
 * tourne autour du bac au lieu de le traverser. Les extrémités sont rendues à l'identique.
 * Fonction pure.
 */
export function interpolatePose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const s = smoothstep(t);
  if (s === 0) {
    return from;
  }
  if (s === 1) {
    return to;
  }
  const target = lerpVec(from.target, to.target, s);
  const a = toSpherical(from);
  const b = toSpherical(to);
  if (a.radius === 0 || b.radius === 0) {
    // Dégénéré (caméra sur sa cible) : pas d'angle défini, ligne droite.
    return { position: lerpVec(from.position, to.position, s), target };
  }
  const radius = a.radius + (b.radius - a.radius) * s;
  const polar = a.polar + (b.polar - a.polar) * s;
  const azimuth = a.azimuth + shortestAngle(a.azimuth, b.azimuth) * s;
  const sinPolar = Math.sin(polar);
  const position: Vec3 = [
    target[0] + radius * sinPolar * Math.sin(azimuth),
    target[1] + radius * Math.cos(polar),
    target[2] + radius * sinPolar * Math.cos(azimuth),
  ];
  return { position, target };
}

interface Spherical {
  readonly radius: number;
  /** Angle depuis l'axe +Y, dans [0, π]. */
  readonly polar: number;
  /** Angle autour de Y, mesuré depuis +Z vers +X, dans ]-π, π]. */
  readonly azimuth: number;
}

function toSpherical(pose: CameraPose): Spherical {
  const x = pose.position[0] - pose.target[0];
  const y = pose.position[1] - pose.target[1];
  const z = pose.position[2] - pose.target[2];
  const radius = Math.hypot(x, y, z);
  if (radius === 0) {
    return { radius: 0, polar: 0, azimuth: 0 };
  }
  const polar = Math.acos(Math.min(1, Math.max(-1, y / radius)));
  return { radius, polar, azimuth: Math.atan2(x, z) };
}

/** Écart angulaire signé de `from` à `to`, ramené dans ]-π, π]. */
function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (2 * Math.PI);
  if (delta > Math.PI) {
    delta -= 2 * Math.PI;
  } else if (delta <= -Math.PI) {
    delta += 2 * Math.PI;
  }
  return delta;
}

function lerpVec(a: Vec3, b: Vec3, s: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}

/**
 * Pose `pose` tournée de `angle` radians autour de l'axe vertical passant par sa cible
 * (caméra automatique du fond d'écran, #279) : même distance, même hauteur, même cible ;
 * (x, z) relatifs à la cible deviennent (x cos a + z sin a, −x sin a + z cos a). Angle non
 * fini : pose inchangée. Nouvel objet (boucle par image : `orbitPositionInto`).
 */
export function orbitPose(pose: CameraPose, angle: number): CameraPose {
  if (!Number.isFinite(angle)) {
    return pose;
  }
  return { position: orbitPositionInto(pose, angle, [0, 0, 0]), target: pose.target };
}

/**
 * Position de `orbitPose(pose, angle)` écrite dans `out`, renvoyé : aucune allocation, pour la
 * caméra du fond d'écran recalculée à chaque image (#332). Angle non fini : position de
 * `pose` recopiée.
 */
export function orbitPositionInto(
  pose: CameraPose,
  angle: number,
  out: [number, number, number],
): [number, number, number] {
  // Accès indexés : la déstructuration passerait par un itérateur.
  const px = pose.position[0];
  const py = pose.position[1];
  const pz = pose.position[2];
  if (!Number.isFinite(angle)) {
    out[0] = px;
    out[1] = py;
    out[2] = pz;
    return out;
  }
  const tx = pose.target[0];
  const tz = pose.target[2];
  const dx = px - tx;
  const dz = pz - tz;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  out[0] = tx + dx * cos + dz * sin;
  out[1] = py;
  out[2] = tz - dx * sin + dz * cos;
  return out;
}
