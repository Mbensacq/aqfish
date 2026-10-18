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
