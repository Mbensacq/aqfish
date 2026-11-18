import { deflect, obstacleAvoidance, proximity, wallAvoidance } from './avoidance';
import type { Vec3 } from './flocking';
import { clamp, wrapAngle } from './motion';
import { obstacleBound, obstacleDistance, type Obstacle } from './obstacles';
import { shapeDistance, shapeNormal } from './pond-shape';
import { NIGHT_HEIGHT_RATIO } from './day-rhythm';
import type { SpeciesDefinition } from './species';
import type { Fish, SwimBounds } from './swimmer';

/**
 * Étapes de pilotage de la nage (`stepFish`, `sim/swimmer.ts`), sorties de `stepFish` au lot 3
 * du chantier #686 : banc, nourriture, évitement des parois et des obstacles, inclinaison
 * visée selon la profondeur et le repos de nuit, filet de sécurité des obstacles. Aucune ne
 * tire de nombre aléatoire : les tirages restent dans `swimmer.ts`, dans leur ordre d'origine.
 * Sans allocation : les résultats sont écrits dans le contexte du pas (`SwimStep`).
 */

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Portée de l'évitement, en mètres : la force d'une paroi (ou d'un obstacle) croît de 0 à 1
 * quand le point visé passe de `AVOID_ZONE` à 0 de la zone interdite (approximation de jeu).
 */
export const AVOID_ZONE = 0.07;
/**
 * Gain de l'évitement sur la direction voulue (cap + gain × déviation), sans dimension
 * (approximation de jeu, réglée avec les tests de trajectoire de `swimmer.spec.ts`).
 */
const AVOID_GAIN = 2;
/** Inclinaison d'évitement du fond et de la surface, en fraction de `maxPitch`. */
export const AVOID_PITCH_RATIO = 0.8;
/** Distance d'anticipation des parois, en secondes de nage (minimum `MIN_LOOKAHEAD`). */
const LOOKAHEAD_SECONDS = 1.5;
const MIN_LOOKAHEAD = 0.08;
/** Pilotage de banc négligeable : en deçà de cette norme, il est ignoré. */
export const STEER_EPSILON = 1e-9;
/**
 * Écart maximal de la vitesse visée en banc, en fraction de `cruiseSpeed` : un poisson en
 * retard sur son banc accélère, un poisson en avance ralentit (approximation de jeu).
 */
const SCHOOL_SPEED_GAIN = 0.5;
/**
 * Évitement rapproché des obstacles (`closeAvoid`, garde de la ponte, issue #670) : marge et
 * portée réduites, en mètres, pour qu'un poisson puisse tenir près d'une ponte collée à un
 * rocher (approximations de jeu). Le filet de sécurité reste entier : aucun obstacle traversé.
 */
const CLOSE_AVOID_MARGIN = 0.015;
const CLOSE_AVOID_ZONE = 0.03;
/**
 * Espèce de fond : au-dessus de `preferredMaxY`, l'inclinaison visée glisse vers la descente
 * en proportion de l'écart, entièrement à partir de `DEPTH_PULL_ZONE` mètres (approximation
 * de jeu) ; de même vers la montée sous `preferredMinY` (espèce de mi-hauteur).
 */
const DEPTH_PULL_ZONE = 0.03;
/** Nombre maximal de passes de projection hors des obstacles par pas. */
const OBSTACLE_PASSES = 4;
const SCRATCH_WALL: Vec3 = { x: 0, y: 0, z: 0 };
const SCRATCH_OBSTACLE: Vec3 = { x: 0, y: 0, z: 0 };
const SCRATCH_AVOID: Vec3 = { x: 0, y: 0, z: 0 };
const SCRATCH_NORMAL: Vec3 = { x: 0, y: 0, z: 0 };
const SCRATCH_SHAPE = { x: 0, z: 0 };

/**
 * Contexte d'un pas de nage, partagé par ses étapes : entrées de `stepFish`, puis résultats
 * de chaque étape (banc, nourriture, évitement), lus par les suivantes.
 */
export interface SwimStep {
  fish: Mutable<Fish>;
  def: SpeciesDefinition;
  dt: number;
  bounds: SwimBounds;
  obstacles: readonly Obstacle[];
  food: Vec3 | null;
  rest: number;
  hugWalls: boolean;
  closeAvoid: boolean;
  /** Remontée d'une espèce de fond en cours. */
  ascending: boolean;
  /** Banc : virage (rad), inclinaison visée, poids de celle-ci, écart de vitesse visée. */
  schoolTurn: number;
  schoolPitch: number;
  schoolBlend: number;
  schoolSpeed: number;
  /** Nourriture : virage (rad), inclinaison visée, distance (m). */
  foodTurn: number;
  foodPitch: number;
  foodDistance: number;
  /** Cap actuel (vecteur unitaire) et point visé de la prospection. */
  headX: number;
  headY: number;
  headZ: number;
  probeX: number;
  probeY: number;
  probeZ: number;
  /** Intensité de l'évitement, dans [0, 1], et sa part dans le cap. */
  avoid: number;
  yawAvoid: number;
  /** Direction d'évitement (cap + gain × déviation) et sa norme horizontale. */
  avoidX: number;
  avoidY: number;
  avoidZ: number;
  avoidH: number;
}

/** Pilotage de banc : direction voulue = cap actuel + pilotage (nul sans banc). */
export function schoolSteeringInPlace(
  c: SwimStep,
  steerX: number,
  steerY: number,
  steerZ: number,
): void {
  const { fish, def } = c;
  c.schoolTurn = 0;
  c.schoolBlend = 0;
  c.schoolPitch = 0;
  c.schoolSpeed = 0;
  const steerNorm = Math.sqrt(steerX * steerX + steerY * steerY + steerZ * steerZ);
  if (def.schooling === null || steerNorm <= STEER_EPSILON) {
    return;
  }
  const horizontal = Math.cos(fish.pitch);
  const hx = Math.cos(fish.yaw) * horizontal;
  const hy = Math.sin(fish.pitch);
  const hz = Math.sin(fish.yaw) * horizontal;
  const dx = hx + steerX;
  const dy = hy + steerY;
  const dz = hz + steerZ;
  const dh = Math.sqrt(dx * dx + dz * dz);
  if (dh > STEER_EPSILON) {
    c.schoolTurn = headingTurn(fish.yaw, dx, dz, def.schooling.turnRate * c.dt);
  }
  const pitchLimit = def.maxPitch * AVOID_PITCH_RATIO;
  c.schoolPitch = clamp(Math.atan2(dy, dh), -pitchLimit, pitchLimit);
  c.schoolBlend = Math.min(1, steerNorm);
  c.schoolSpeed = clamp(
    steerX * hx + steerY * hy + steerZ * hz,
    -SCHOOL_SPEED_GAIN,
    SCHOOL_SPEED_GAIN,
  );
}

/** Nourriture : cap et inclinaison vers le point visé (sans effet si `food` est nul). */
export function foodSteeringInPlace(c: SwimStep): void {
  const { fish, def, food } = c;
  c.foodTurn = 0;
  c.foodPitch = 0;
  c.foodDistance = 0;
  if (food === null) {
    return;
  }
  const dx = food.x - fish.x;
  const dy = food.y - fish.y;
  const dz = food.z - fish.z;
  const dh = Math.sqrt(dx * dx + dz * dz);
  c.foodDistance = Math.sqrt(dh * dh + dy * dy);
  if (dh > STEER_EPSILON) {
    c.foodTurn = headingTurn(fish.yaw, dx, dz, def.feeding.turnRate * c.dt);
  }
  const pitchLimit = def.maxPitch * AVOID_PITCH_RATIO;
  c.foodPitch = clamp(Math.atan2(dy, dh), -pitchLimit, pitchLimit);
}

/** Virage depuis le cap `yaw` vers la direction horizontale (`dx`, `dz`), borné à `maxTurn`. */
export function headingTurn(yaw: number, dx: number, dz: number, maxTurn: number): number {
  return clamp(wrapAngle(Math.atan2(dz, dx) - yaw), -maxTurn, maxTurn);
}

/**
 * Évitement : force des parois au point visé, des obstacles le long du segment de
 * prospection, déviée pour contourner ; `avoid` ∈ [0, 1] en est l'intensité.
 */
export function avoidanceInPlace(c: SwimStep): void {
  const { fish } = c;
  probeInPlace(c);
  const wall = wallPush(c);
  const close = c.closeAvoid && c.food !== null;
  const obstacle = obstacleAvoidance(
    fish.x,
    fish.y,
    fish.z,
    c.probeX,
    c.probeY,
    c.probeZ,
    c.obstacles,
    close ? CLOSE_AVOID_MARGIN : c.def.wallMargin,
    close ? CLOSE_AVOID_ZONE : AVOID_ZONE,
    SCRATCH_OBSTACLE,
  );
  const rawX = wall.x + obstacle.x;
  const rawY = wall.y + obstacle.y;
  const rawZ = wall.z + obstacle.z;
  c.avoid = Math.min(1, Math.sqrt(rawX * rawX + rawY * rawY + rawZ * rawZ));
  c.yawAvoid = yawAvoidShare(c, rawX, rawZ);
  const force = deflect(rawX, rawY, rawZ, fish.yaw, fish.turn, SCRATCH_AVOID);
  c.avoidX = c.headX + force.x * AVOID_GAIN;
  c.avoidY = c.headY + force.y * AVOID_GAIN;
  c.avoidZ = c.headZ + force.z * AVOID_GAIN;
  c.avoidH = Math.sqrt(c.avoidX * c.avoidX + c.avoidZ * c.avoidZ);
}

/**
 * Cap actuel et point visé de la prospection. En approche de la nourriture, la prospection
 * s'arrête au point visé (dans les bornes de nage) : un granulé posé au fond ou près d'un
 * rocher n'est plus repoussé par l'évitement de ce qui se trouve au-delà. L'évitement de ce
 * qui est entre les deux reste entier.
 */
function probeInPlace(c: SwimStep): void {
  const { fish } = c;
  const cosPitch = Math.cos(fish.pitch);
  c.headX = Math.cos(fish.yaw) * cosPitch;
  c.headY = Math.sin(fish.pitch);
  c.headZ = Math.sin(fish.yaw) * cosPitch;
  const reach = Math.max(MIN_LOOKAHEAD, fish.speed * LOOKAHEAD_SECONDS);
  const lookahead =
    c.food !== null ? Math.max(MIN_LOOKAHEAD, Math.min(reach, c.foodDistance)) : reach;
  c.probeX = fish.x + c.headX * lookahead;
  c.probeY = fish.y + c.headY * lookahead;
  c.probeZ = fish.z + c.headZ * lookahead;
}

/** Force des parois (et du bord d'un bassin non rectangulaire) au point visé. */
function wallPush(c: SwimStep): Vec3 {
  const { probeX, probeY, probeZ } = c;
  const wall = wallAvoidance(probeX, probeY, probeZ, c.bounds.avoid, AVOID_ZONE, SCRATCH_WALL);
  if (c.hugWalls && c.food !== null) {
    // Broutage d'une vitre (issue #427) : les parois ne repoussent plus le point visé, collé
    // à l'une d'elles ; les obstacles et la boîte `hard` gardent le poisson dans l'eau.
    wall.x = 0;
    wall.y = 0;
    wall.z = 0;
  }
  const { outline } = c.bounds;
  if (outline === undefined) {
    return wall;
  }
  // Bord du bassin non rectangulaire (issue #190) : repousse comme une paroi verticale.
  const d = shapeDistance(outline, probeX, probeZ) - c.def.wallMargin;
  const w = proximity(d, AVOID_ZONE);
  if (w > 0) {
    shapeNormal(outline, probeX, probeZ, SCRATCH_SHAPE);
    wall.x += SCRATCH_SHAPE.x * w;
    wall.z += SCRATCH_SHAPE.z * w;
  }
  return wall;
}

/**
 * Part de l'évitement dans le cap. Poisson attaché à une anémone (issue #150) qui revient
 * vers elle : seule la part horizontale compte (le fond, tout proche de l'anémone, ne joue
 * que sur l'inclinaison), et rien quand le point visé est du côté où l'évitement pousse (dos
 * à la paroi ou à l'obstacle) : sinon il longe la vitre ou le sable au lieu de faire
 * demi-tour. Réservé aux espèces `anemone` : la nage des autres reste celle d'avant, à
 * l'octet.
 */
function yawAvoidShare(c: SwimStep, rawX: number, rawZ: number): number {
  const { fish, food, avoid } = c;
  if (c.def.anemone === undefined || food === null || !(avoid > 0)) {
    return avoid;
  }
  const tx = food.x - fish.x;
  const tz = food.z - fish.z;
  return tx * rawX + tz * rawZ > 0 ? 0 : Math.min(1, Math.sqrt(rawX * rawX + rawZ * rawZ));
}

/**
 * Espèce de fond : montée à l'inclinaison maximale pendant une remontée, sinon descente
 * au-dessus de la hauteur préférée. L'évitement (surface, obstacles) garde la priorité.
 */
export function depthPitchGoal(c: SwimStep, pitchGoal: number): number {
  const { fish, def, bounds } = c;
  if (def.depth === undefined) {
    return pitchGoal;
  }
  const steep = def.maxPitch * AVOID_PITCH_RATIO;
  if (c.ascending) {
    return def.maxPitch;
  }
  if (fish.y > bounds.preferredMaxY) {
    const pull = Math.min(1, (fish.y - bounds.preferredMaxY) / DEPTH_PULL_ZONE);
    return pitchGoal + (-steep - pitchGoal) * pull;
  }
  if (fish.y < bounds.preferredMinY) {
    // Espèce de mi-hauteur (issue #151) : montée symétrique sous la hauteur minimale.
    // La nuit (issue #209), l'attrait vers la hauteur minimale faiblit avec le repos.
    const pull = Math.min(1, (bounds.preferredMinY - fish.y) / DEPTH_PULL_ZONE) * (1 - c.rest);
    return pitchGoal + (steep - pitchGoal) * pull;
  }
  return pitchGoal;
}

/**
 * Repos de nuit (issue #209) : descente au-dessus du plafond de nuit, hors nourriture et
 * remontée ; sans effet le jour (`rest` nul).
 */
export function nightPitchGoal(c: SwimStep, pitchGoal: number): number {
  const { fish, rest } = c;
  if (!(rest > 0) || c.food !== null || c.ascending) {
    return pitchGoal;
  }
  const { hard } = c.bounds;
  const ceiling = hard.minY + (hard.maxY - hard.minY) * NIGHT_HEIGHT_RATIO;
  if (!(fish.y > ceiling)) {
    return pitchGoal;
  }
  const steep = c.def.maxPitch * AVOID_PITCH_RATIO;
  const pull = Math.min(1, (fish.y - ceiling) / DEPTH_PULL_ZONE) * rest;
  return pitchGoal + (-steep - pitchGoal) * pull;
}

/**
 * Ramène sur leur surface un centre entré dans des obstacles. Plusieurs passes : sorti d'une
 * sphère d'une union (ou d'un obstacle), le centre peut se retrouver dans une sphère voisine ;
 * sans obstacle, aucune passe.
 */
export function pushOutOfObstaclesInPlace(
  fish: Mutable<Fish>,
  obstacles: readonly Obstacle[],
): void {
  for (let pass = 0; pass < OBSTACLE_PASSES; pass++) {
    if (!pushOutOnceInPlace(fish, obstacles)) {
      return;
    }
  }
}

/** Une passe de `pushOutOfObstaclesInPlace` : vrai si le centre a été déplacé. */
function pushOutOnceInPlace(fish: Mutable<Fish>, obstacles: readonly Obstacle[]): boolean {
  let moved = false;
  for (const o of obstacles) {
    if (outsideBound(o, fish.x, fish.y, fish.z)) {
      continue; // hors de la sphère englobante, donc hors de l'obstacle
    }
    const d = obstacleDistance(o, fish.x, fish.y, fish.z, SCRATCH_NORMAL);
    if (d < 0) {
      fish.x -= SCRATCH_NORMAL.x * d;
      fish.y -= SCRATCH_NORMAL.y * d;
      fish.z -= SCRATCH_NORMAL.z * d;
      moved = true;
    }
  }
  return moved;
}

/** Vrai si `(x, y, z)` est hors de la sphère englobante de `o` (rejet exact, sans racine). */
function outsideBound(o: Obstacle, x: number, y: number, z: number): boolean {
  const b = obstacleBound(o);
  const dx = x - b.x;
  const dy = y - b.y;
  const dz = z - b.z;
  return dx * dx + dy * dy + dz * dz >= b.radius * b.radius;
}
