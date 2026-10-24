import {
  decorGroundBaseY,
  decorSpheres,
  liftedSphereY,
  validateDecorItem,
  withElevation,
} from './decor';
import type { DecorItem } from './decor';
import { clampDecorPosition, decorItemsOverlap, isDecorEditable } from './decor-edit';
import { placeDimensions, placeEnvironment, type Place } from './environment';
import type { Sphere } from './obstacles';

/**
 * Pose par gravité dans l'éditeur du décor (issue #170, ADR 0046) : description pure de la
 * scène de chute et lecture de son résultat. Le moteur physique (`core/decor-physics`,
 * chargé à la demande) ne fait que faire tomber le corps décrit ici ; la simulation des
 * poissons et les captures ne lisent que la pose enregistrée. Module pur et déterministe,
 * sans moteur ni Three.js (ADR 0003).
 */

/** Pas de la chute, en secondes (60 Hz). */
export const DROP_TIME_STEP = 1 / 60;

/** Durée maximale de la chute, en pas (2 s) : au-delà, la dernière position est retenue. */
export const DROP_MAX_STEPS = 120;

/** Hauteur minimale de la chute, en mètres, entre le point le plus bas du corps et le sable. */
export const DROP_MIN_HEIGHT = 0.08;

/** Marge au-dessus du plus haut des autres éléments au départ de la chute, en mètres. */
export const DROP_CLEARANCE = 0.02;

/**
 * Épaisseur ajoutée aux sphères des autres éléments pendant la chute, en mètres : le contact
 * du moteur tolère une légère pénétration, qu'elle absorbe (une pose sur un voisin ne doit pas
 * le pénétrer, `isDecorPoseAllowed`).
 */
export const DROP_SKIN = 0.002;

/** Élévation finale en dessous de laquelle l'élément est considéré posé sur le sable (m). */
export const DROP_GROUND_SNAP = 0.003;

/** Point du repère du bac. */
export interface DropPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Scène de chute de l'élément `index` d'un décor (`decorDropScene`). */
export interface DropScene {
  /**
   * Sphères du corps qui tombe, relatives à sa base (rotation comprise, ADR 0015), remontées
   * au-dessus de la base comme pour un élément posé sur un autre (`liftedSphereY`).
   */
  readonly body: readonly Sphere[];
  /** Base du corps au départ (repère du bac). */
  readonly start: DropPoint;
  /** Altitude de la base posée sur le sable (élévation nulle). */
  readonly groundBaseY: number;
  /** Altitude du sol du corps : point le plus bas de ses sphères quand il est sur le sable. */
  readonly floorY: number;
  /** Sphères fixes des autres éléments, épaissies de `DROP_SKIN`. */
  readonly fixed: readonly Sphere[];
  /** Demi-largeur (x) et demi-profondeur (z) intérieures du bac (vitres). */
  readonly halfWidth: number;
  readonly halfDepth: number;
}

/**
 * Scène de chute de l'élément `index` de `decor`, lâché à sa position (x, z) : son corps
 * (ses sphères de collision, sans élévation), les autres rochers et bois fixes (pas les
 * plantes, qui plient : un élément qui finirait dans une plante est refusé ensuite par
 * `isDecorPoseAllowed`), le sol et les vitres. Le corps part assez haut pour passer au-dessus de tous les autres éléments
 * (`DROP_CLEARANCE`), et au moins à `DROP_MIN_HEIGHT` du sable. `null` si le décor n'est pas
 * éditable ou si l'indice n'existe pas.
 */
export function decorDropScene(
  decor: readonly DecorItem[],
  index: number,
  environment: Place,
): DropScene | null {
  if (
    !isDecorEditable(placeEnvironment(environment)) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= decor.length
  ) {
    return null;
  }
  const grounded = withElevation(decor[index], 0);
  const groundBaseY = decorGroundBaseY(grounded);
  // Corps tel qu'il sera s'il se pose sur un autre élément : sphères remontées au-dessus de
  // sa base (`liftedSphereY`) ; sur le sable, il revient à sa pose d'origine (élévation 0).
  const lift = liftedSphereY(withElevation(grounded, 1));
  const body = decorSpheres(grounded).map((s) => ({
    x: s.x - grounded.x,
    y: lift(s.y - groundBaseY, s.radius),
    z: s.z - grounded.z,
    radius: s.radius,
  }));
  const lowest = Math.min(...body.map((s) => s.y - s.radius));
  const fixed: Sphere[] = [];
  decor.forEach((other, n) => {
    // Une plante plie : rien ne se pose sur ses tiges (ADR 0046).
    if (n !== index && other.kind !== 'plant') {
      for (const s of decorSpheres(other)) {
        fixed.push({ x: s.x, y: s.y, z: s.z, radius: s.radius + DROP_SKIN });
      }
    }
  });
  const floorY = groundBaseY + lowest;
  const top = fixed.reduce((max, s) => Math.max(max, s.y + s.radius), floorY);
  const height = Math.max(DROP_MIN_HEIGHT, top - floorY + DROP_CLEARANCE);
  const { width, depth } = placeDimensions(environment);
  return {
    body,
    start: { x: grounded.x, y: groundBaseY + height, z: grounded.z },
    groundBaseY,
    floorY,
    fixed,
    halfWidth: width / 2,
    halfDepth: depth / 2,
  };
}

/**
 * Décor `decor` dont l'élément `index` prend la pose de fin de chute `rest` (base, repère
 * du bac) : position bornée au bac (`clampDecorPosition`), élévation `rest.y` moins la base
 * sur le sable, ramenée à 0 sous `DROP_GROUND_SNAP` (ou si négative). Un élément revenu sur
 * le sable garde exactement sa position de lâcher s'il n'y touche aucun autre élément (le
 * contact avec le sol le décale de l'ordre du millimètre). Rotation, échelle et graine
 * inchangées. `null` si l'indice n'existe pas, si `rest` n'est pas fini ou si l'élément
 * obtenu est invalide.
 */
export function settleDecorItem(
  decor: readonly DecorItem[],
  index: number,
  rest: DropPoint,
  environment: Place,
): DecorItem[] | null {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= decor.length ||
    ![rest.x, rest.y, rest.z].every(Number.isFinite)
  ) {
    return null;
  }
  const grounded = withElevation(decor[index], 0);
  const p = clampDecorPosition(grounded, rest.x, rest.z, environment);
  if (!p) {
    return null;
  }
  const raw = rest.y - decorGroundBaseY(grounded);
  const elevation = raw < DROP_GROUND_SNAP ? 0 : Math.round(raw * 1e6) / 1e6;
  const free = (candidate: DecorItem) =>
    decor.every((other, n) => n === index || !decorItemsOverlap(candidate, other));
  const item =
    elevation === 0 && free(grounded)
      ? grounded
      : withElevation({ ...grounded, x: p.x, z: p.z }, elevation);
  if (validateDecorItem(item, placeDimensions(environment)).length > 0) {
    return null;
  }
  return decor.map((other, n) => (n === index ? item : other));
}

/**
 * Décor `decor` dont l'élément `index` est posé sur le sable à sa position (élévation
 * nulle) : repli quand le moteur de chute n'est pas disponible. `null` si l'indice n'existe
 * pas.
 */
export function groundDecorItem(decor: readonly DecorItem[], index: number): DecorItem[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= decor.length) {
    return null;
  }
  return decor.map((item, n) => (n === index ? withElevation(item, 0) : item));
}
