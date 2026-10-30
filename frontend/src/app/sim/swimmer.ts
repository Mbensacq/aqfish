import { prngNextState, prngOutput, deriveSeed } from '../core/random/prng';
import { deflect, obstacleAvoidance, proximity, wallAvoidance } from './avoidance';
import {
  constrainToShape,
  DEFAULT_POND_SHAPE,
  insideShape,
  keepInShape,
  shapeDistance,
  shapeNormal,
  shapeOutline,
  type PondShape,
  type ShapeOutline,
} from './pond-shape';
import { growHunger, HUNGER_START } from './feeding';
import type { Vec3 } from './flocking';
import { obstacleBound, obstacleDistance, type Obstacle } from './obstacles';
import { shrinkBox, type Box3 } from './tank';
import { SPECIES, type SpeciesDefinition, type SpeciesId } from './species';
import { NIGHT_HEIGHT_RATIO, nightPace } from './day-rhythm';
import { tailBeatRate } from './undulation';
import { HEALTH_START, vigor } from './wellbeing';

/**
 * Poisson de la simulation : objet de données pur, sérialisable en JSON (ADR 0003).
 *
 * Orientation : `yaw` est le cap dans le plan horizontal, mesuré de +X vers +Z ;
 * `pitch` est l'inclinaison, positive vers le haut. Direction de nage :
 * `(cos yaw · cos pitch, sin pitch, sin yaw · cos pitch)`.
 *
 * Les champs `p*` gardent l'état du pas précédent : le rendu interpole entre les deux avec
 * le facteur `alpha` de la boucle à pas fixe.
 */
export interface Fish {
  /** Identifiant unique, entier 32 bits non signé. */
  readonly id: number;
  readonly kind: 'fish';
  readonly species: SpeciesId;
  /** Position, en mètres. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Cap, en radians, dans (-π, π]. */
  readonly yaw: number;
  /** Inclinaison, en radians, dans [-maxPitch, maxPitch]. */
  readonly pitch: number;
  /** Vitesse, en m/s, dans [minSpeed, maxSpeed]. */
  readonly speed: number;
  /** Vitesse de virage d'errance courante, en rad/s. */
  readonly turn: number;
  /** Inclinaison visée par l'errance, en radians. */
  readonly pitchTarget: number;
  /** Phase du battement de queue, en radians, dans [0, 2π). */
  readonly phase: number;
  /**
   * Temps restant de la remontée en cours vers la surface, en secondes (0 : aucune). Reste
   * nul pour une espèce sans préférence de profondeur (`SpeciesDefinition.depth`). Pour une
   * espèce amphibie (`sim/frog.ts`), temps restant du saut en cours (0 : au sol ou à l'eau).
   */
  readonly ascent: number;
  /**
   * Faim, dans [0, 1] : monte avec le temps simulé, baisse à chaque granulé mangé
   * (`sim/feeding.ts`). Ne consomme aucun tirage.
   */
  readonly hunger: number;
  /**
   * Santé, dans [`HEALTH_FLOOR`, 1] : baisse si la faim est maximale ou l'eau mauvaise,
   * remonte sinon (`sim/wellbeing.ts`, issue #208). Ralentit la nage et ternit les couleurs
   * sous 1. Ne consomme aucun tirage.
   */
  readonly health: number;
  /** État du sous-générateur de l'entité (mulberry32, voir `prngNextState`). */
  readonly rng: number;
  // État au pas précédent (interpolation du rendu).
  readonly px: number;
  readonly py: number;
  readonly pz: number;
  readonly pyaw: number;
  readonly ppitch: number;
  readonly pphase: number;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Bornes de nage d'une espèce dans un volume d'eau. */
export interface SwimBounds {
  /** Le centre du poisson ne sort jamais de cette boîte (volume d'eau moins `wallMargin`). */
  readonly hard: Box3;
  /**
   * Boîte plus intérieure, de `AVOID_ZONE` : limite de la portée de l'évitement (la force des
   * parois est nulle tant que le point visé y reste).
   */
  readonly soft: Box3;
  /**
   * Zone de naissance, contenue dans `soft` (voir `SPAWN_MARGINS`) ; pour une espèce de fond,
   * la tranche de `hard` entre `preferredMinY` et `preferredMaxY`.
   */
  readonly spawn: Box3;
  /**
   * Boîte dont les parois repoussent le point visé (portée `AVOID_ZONE`) : `hard` lui-même,
   * sauf pour une espèce de fond, dont le fond est abaissé pour que sa portée effective soit
   * `depth.floorZone` (elle nage alors au ras du sable sans en être chassée).
   */
  readonly avoid: Box3;
  /** Hauteur au-dessus de laquelle une espèce de fond est tirée vers le bas ; +∞ sinon. */
  readonly preferredMaxY: number;
  /**
   * Contour horizontal du bassin quand il n'est pas rectangulaire (issue #190, ADR 0080) :
   * le centre reste aussi à `wallMargin` au moins de son bord, qui repousse le point visé
   * comme une paroi. Absent : la boîte seule (nage d'avant, au bit près).
   */
  readonly outline?: ShapeOutline;
  /** Marge du centre au bord du contour (`wallMargin` de l'espèce), avec `outline`. */
  readonly outlineMargin?: number;
  /**
   * Hauteur au-dessous de laquelle une espèce de mi-hauteur (`depth.minHeightRatio`, issue
   * #151) est tirée vers le haut ; −∞ sinon.
   */
  readonly preferredMinY: number;
}

const TWO_PI = Math.PI * 2;
const UINT32_RANGE = 4294967296;

/**
 * Portée de l'évitement, en mètres : la force d'une paroi (ou d'un obstacle) croît de 0 à 1
 * quand le point visé passe de `AVOID_ZONE` à 0 de la zone interdite (approximation de jeu).
 */
const AVOID_ZONE = 0.07;
/**
 * Gain de l'évitement sur la direction voulue (cap + gain × déviation), sans dimension
 * (approximation de jeu, réglée avec les tests de trajectoire de `swimmer.spec.ts`).
 */
const AVOID_GAIN = 2;
/**
 * Mémoire du virage d'évitement : pendant l'évitement, la vitesse de virage d'errance tend,
 * à `AVOID_COMMIT` par seconde, vers `±AVOID_COMMIT_TURN · wanderTurnRate` dans le sens du
 * virage d'évitement (approximations de jeu).
 */
const AVOID_COMMIT = 4;
const AVOID_COMMIT_TURN = 0.25;
/** Accélération angulaire aléatoire de l'errance, en multiples de `wanderTurnRate` par seconde. */
const WANDER_JITTER = 6;
/** Amortissement de la vitesse de virage d'errance, par seconde. */
const WANDER_DAMPING = 0.5;
/** Variation aléatoire de l'inclinaison visée, en multiples de `maxPitch` par seconde. */
const PITCH_JITTER = 1.5;
/** Vitesse de changement d'inclinaison, en rad/s. */
const PITCH_RATE = 0.8;
/** Fraction de `maxPitch` utilisée par l'errance (le reste sert à éviter le fond et la surface). */
const WANDER_PITCH_RATIO = 0.4;
/** Inclinaison d'évitement du fond et de la surface, en fraction de `maxPitch`. */
const AVOID_PITCH_RATIO = 0.8;
/** Variation aléatoire de la vitesse, en multiples de `cruiseSpeed` par seconde. */
const SPEED_JITTER = 1.5;
/** Rappel de la vitesse vers la vitesse de croisière, par seconde. */
const SPEED_RECALL = 0.5;
/** Distance d'anticipation des parois, en secondes de nage (minimum `MIN_LOOKAHEAD`). */
const LOOKAHEAD_SECONDS = 1.5;
const MIN_LOOKAHEAD = 0.08;
/** Pilotage de banc négligeable : en deçà de cette norme, il est ignoré. */
const STEER_EPSILON = 1e-9;
/**
 * Écart maximal de la vitesse visée en banc, en fraction de `cruiseSpeed` : un poisson en
 * retard sur son banc accélère, un poisson en avance ralentit (approximation de jeu).
 */
const SCHOOL_SPEED_GAIN = 0.5;
/**
 * Espèce de fond : au-dessus de `preferredMaxY`, l'inclinaison visée glisse vers la descente
 * en proportion de l'écart, entièrement à partir de `DEPTH_PULL_ZONE` mètres (approximation
 * de jeu) ; de même vers la montée sous `preferredMinY` (espèce de mi-hauteur).
 */
const DEPTH_PULL_ZONE = 0.03;
/**
 * Approche de la nourriture : vitesse visée de `cruiseSpeed` (au contact) à
 * `(cruiseSpeed + maxSpeed) / 2` (à `FOOD_RUSH_DISTANCE` mètres et au-delà), pour accourir
 * sans tourner autour du granulé (approximation de jeu).
 */
const FOOD_RUSH_DISTANCE = 0.1;
/** Rappel de la vitesse vers la vitesse visée en approche de la nourriture, par seconde. */
const FOOD_SPEED_RECALL = 3;
/** Aucun obstacle (valeur par défaut partagée, sans allocation). */
const NO_OBSTACLES: readonly Obstacle[] = Object.freeze([]);
const SCRATCH_WALL: Vec3 = { x: 0, y: 0, z: 0 };
const SCRATCH_OBSTACLE: Vec3 = { x: 0, y: 0, z: 0 };
const SCRATCH_AVOID: Vec3 = { x: 0, y: 0, z: 0 };
const SCRATCH_NORMAL: Vec3 = { x: 0, y: 0, z: 0 };
const SCRATCH_SHAPE = { x: 0, z: 0 };
/** Nombre maximal de passes de projection hors des obstacles par pas. */
const OBSTACLE_PASSES = 4;

/**
 * Zone de naissance : celle d'avant le réglage du cycle 13 (volume d'eau moins 5 cm, puis
 * moins 8 cm, calculée dans cet ordre pour des positions identiques au bit près), pour que
 * le réglage de l'évitement ne change pas les mondes à t = 0 (issue #43). Une espèce dont la
 * zone `soft` est plus intérieure naît dans `soft`.
 */
const SPAWN_MARGINS = [0.05, 0.08] as const;

/** Bornes de profondeur d'une espèce sans préférence (toute la hauteur d'eau). */
const NO_DEPTH_PREFERENCE = {
  preferredMaxY: Number.POSITIVE_INFINITY,
  preferredMinY: Number.NEGATIVE_INFINITY,
} as const;

/**
 * Bornes de nage d'une espèce dans un volume d'eau donné, de forme horizontale `shape`
 * (`sim/pond-shape.ts`, issue #190) : rectangle par défaut, la boîte seule. Une autre forme
 * ajoute son contour (`outline`) aux bornes des espèces qui nagent ; celles qui marchent ou
 * vivent entre terre et eau n'habitent pas le bassin et l'ignorent.
 */
export function swimBounds(
  def: SpeciesDefinition,
  water: Box3,
  shape: PondShape = DEFAULT_POND_SHAPE,
): SwimBounds {
  if (def.walker !== undefined) {
    return walkerBounds(def, water);
  }
  if (def.amphibian !== undefined) {
    return amphibianBounds(def, water);
  }
  const bounds = boxSwimBounds(def, water);
  return shape === DEFAULT_POND_SHAPE
    ? bounds
    : { ...bounds, outline: shapeOutline(shape, water), outlineMargin: def.wallMargin };
}

function boxSwimBounds(def: SpeciesDefinition, water: Box3): SwimBounds {
  const hard = shrinkBox(water, def.wallMargin);
  const soft = shrinkBox(hard, AVOID_ZONE);
  const legacy = shrinkBox(shrinkBox(water, SPAWN_MARGINS[0]), SPAWN_MARGINS[1]);
  const spawn = def.wallMargin + AVOID_ZONE > SPAWN_MARGINS[0] + SPAWN_MARGINS[1] ? soft : legacy;
  const { depth } = def;
  if (depth === undefined) {
    return { hard, soft, spawn, avoid: hard, ...NO_DEPTH_PREFERENCE };
  }
  const preferredMaxY = Math.min(
    hard.maxY,
    Math.max(hard.minY, water.minY + depth.maxHeightRatio * (water.maxY - water.minY)),
  );
  const preferredMinY =
    depth.minHeightRatio === undefined
      ? Number.NEGATIVE_INFINITY
      : Math.min(
          preferredMaxY,
          Math.max(hard.minY, water.minY + depth.minHeightRatio * (water.maxY - water.minY)),
        );
  return {
    hard,
    soft,
    spawn: { ...spawn, minY: Math.max(hard.minY, preferredMinY), maxY: preferredMaxY },
    avoid: { ...hard, minY: hard.minY - (AVOID_ZONE - Math.min(depth.floorZone, AVOID_ZONE)) },
    preferredMaxY,
    preferredMinY,
  };
}

/**
 * Bornes d'une espèce qui marche sur le fond (`sim/axolotl.ts`) : `wallMargin` des vitres
 * seulement ; en hauteur, du fond plus `clearance` (pattes posées) à la surface moins
 * `surfaceMargin`. Le sol réel (`sim/terrain.ts`) resserre encore le bas, point par point.
 */
function walkerBounds(def: SpeciesDefinition, water: Box3): SwimBounds {
  const walker = def.walker!;
  const walls = shrinkBox(water, def.wallMargin);
  const minY = water.minY + walker.clearance;
  const hard: Box3 = {
    minX: walls.minX,
    maxX: walls.maxX,
    minY,
    maxY: Math.max(minY, water.maxY - walker.surfaceMargin),
    minZ: walls.minZ,
    maxZ: walls.maxZ,
  };
  return { hard, soft: hard, spawn: hard, avoid: hard, ...NO_DEPTH_PREFERENCE };
}

/**
 * Bornes d'une espèce qui vit entre terre et eau (`sim/frog.ts`) : `wallMargin` des vitres ;
 * en hauteur, du fond plus `clearance` à la surface plus `maxRise` (berge et sauts). Le sol
 * réel (`sim/terrain.ts`) resserre le bas, point par point.
 */
function amphibianBounds(def: SpeciesDefinition, water: Box3): SwimBounds {
  const params = def.amphibian!;
  const walls = shrinkBox(water, def.wallMargin);
  const minY = water.minY + params.clearance;
  const hard: Box3 = {
    minX: walls.minX,
    maxX: walls.maxX,
    minY,
    maxY: Math.max(minY, water.maxY + params.maxRise),
    minZ: walls.minZ,
    maxZ: walls.maxZ,
  };
  return { hard, soft: hard, spawn: hard, avoid: hard, ...NO_DEPTH_PREFERENCE };
}

/** Nombre maximal de tirages de la position de naissance hors des obstacles. */
const MAX_SPAWN_TRIES = 16;

/**
 * Crée un poisson à une position et un cap tirés de son propre sous-générateur
 * (`deriveSeed(seed, id)`) : ajouter un poisson ne change pas les autres.
 * La position est retirée (au plus `MAX_SPAWN_TRIES` fois) tant qu'elle est à moins de
 * `wallMargin` d'un obstacle ; sans obstacle, un seul tirage (même poisson qu'avant).
 */
export function createFish(
  seed: number,
  id: number,
  species: SpeciesId,
  bounds: SwimBounds,
  obstacles: readonly Obstacle[] = NO_OBSTACLES,
): Fish {
  const def = SPECIES[species];
  const fish: Mutable<Fish> = {
    id,
    kind: 'fish',
    species,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    speed: def.cruiseSpeed,
    turn: 0,
    pitchTarget: 0,
    phase: 0,
    ascent: 0,
    hunger: HUNGER_START,
    health: HEALTH_START,
    rng: deriveSeed(seed, id),
    px: 0,
    py: 0,
    pz: 0,
    pyaw: 0,
    ppitch: 0,
    pphase: 0,
  };
  const { spawn } = bounds;
  const spawnInset = def.wallMargin + AVOID_ZONE;
  for (let attempt = 0; attempt < MAX_SPAWN_TRIES; attempt++) {
    fish.x = lerp(spawn.minX, spawn.maxX, random(fish));
    fish.y = lerp(spawn.minY, spawn.maxY, random(fish));
    fish.z = lerp(spawn.minZ, spawn.maxZ, random(fish));
    if (
      clearOfObstacles(fish, obstacles, def.wallMargin) &&
      (bounds.outline === undefined || insideShape(bounds.outline, fish.x, fish.z, spawnInset))
    ) {
      break;
    }
  }
  if (bounds.outline !== undefined) {
    // Bassin non rectangulaire (issue #190) : dernier tirage ramené dans la forme si besoin.
    constrainToShape(bounds.outline, fish.x, fish.z, def.wallMargin, SCRATCH_SHAPE);
    fish.x = SCRATCH_SHAPE.x;
    fish.z = SCRATCH_SHAPE.z;
  }
  fish.yaw = wrapAngle(random(fish) * TWO_PI);
  // Déphasage individuel de l'ondulation, tiré du sous-générateur du poisson.
  fish.phase = random(fish) * TWO_PI;
  fish.speed = lerp(def.minSpeed, def.maxSpeed, 0.25 + 0.5 * random(fish));
  savePrevious(fish);
  return fish;
}

/**
 * Fait nager un poisson pendant `dt` secondes, **en place** (aucune allocation) :
 * errance douce, évitement des parois, du fond, de la surface et des `obstacles`, vitesse
 * bornée.
 *
 * Évitement (ADR 0012) : la force des parois est évaluée au point visé (position + cap ×
 * anticipation), celle des obstacles le long du segment position → point visé
 * (`sim/avoidance.ts`). Elle est déviée pour contourner (`deflect`), puis son intensité
 * `a = min(1, ‖force‖)` dose le virage : vers la direction « cap + `AVOID_GAIN` × déviation »
 * à au plus `a · avoidTurnRate` rad/s, l'errance et le banc ne gardant que la part `1 − a`.
 *
 * `steerX`, `steerY`, `steerZ` : pilotage de banc (`sim/flocking.ts`, sans dimension), nul
 * par défaut. La direction voulue est le cap actuel plus ce pilotage ; le poisson y tourne
 * d'au plus `schooling.turnRate` rad/s, en plus de son errance, et ajuste sa vitesse visée
 * (`SCHOOL_SPEED_GAIN`). L'évitement reste prioritaire près d'une paroi ou d'un obstacle.
 * Un pilotage nul, ou une espèce sans banc, donne exactement la nage solitaire.
 *
 * `food` : point visé par un poisson affamé (`foodTarget`, `sim/feeding.ts`), ou `null`.
 * S'il est donné, le poisson y tourne d'au plus `feeding.turnRate` rad/s et s'y incline, à la
 * place de l'errance et du banc (dont les tirages sont faits quand même : même suite de
 * tirages avec ou sans nourriture) ; l'évitement garde la priorité, donc aucun obstacle n'est
 * traversé pour atteindre un granulé. La faim monte de `feeding.hungerRate · dt`.
 *
 * Garanties : le centre reste dans `bounds.hard` ; `speed` ∈ [minSpeed, maxSpeed] ;
 * `|pitch|` ≤ maxPitch ; le cap tourne d'au plus `max(avoidTurnRate, wanderTurnRate +
 * schooling.turnRate) · dt` par pas. Filet de sécurité : un centre entré dans un obstacle
 * est ramené sur sa surface (puis dans `bounds.hard`). Sans obstacle, le déplacement d'un
 * pas ne dépasse jamais `maxSpeed · dt`. Santé basse : déplacement multiplié par `vigor`
 * (`sim/wellbeing.ts`) ; la vitesse `speed` et le battement de queue restent ceux d'avant.
 *
 * `rest` : repos de nuit dans [0, 1] (`nightRest`, `sim/day-rhythm.ts`, issue #209), 0 par
 * défaut. Le déplacement est multiplié par `nightPace(rest)` ; hors nourriture et remontée,
 * au-dessus du plafond de nuit (`NIGHT_HEIGHT_RATIO` de la hauteur de `bounds.hard`),
 * l'inclinaison visée glisse vers la descente avec un poids `rest`, et l'attrait vers la
 * hauteur minimale d'une espèce de mi-hauteur faiblit d'autant. À 0 : nage d'avant, au bit
 * près (aucun tirage en plus ou en moins).
 */
export function stepFish(
  fish: Mutable<Fish>,
  dt: number,
  bounds: SwimBounds,
  steerX = 0,
  steerY = 0,
  steerZ = 0,
  obstacles: readonly Obstacle[] = NO_OBSTACLES,
  food: Vec3 | null = null,
  rest = 0,
): void {
  const def = SPECIES[fish.species];
  const { hard } = bounds;
  savePrevious(fish);
  fish.hunger = growHunger(fish.hunger, def, dt);

  // Espèce de fond : brève remontée vers la surface, déclenchée au hasard (tirage seulement
  // pour ces espèces : les autres gardent exactement leur suite de tirages), terminée à la
  // limite `soft` de la surface ou au bout de `ascentDuration`.
  const depth = def.depth;
  if (depth !== undefined) {
    if (fish.ascent > 0) {
      fish.ascent = fish.y >= bounds.soft.maxY ? 0 : Math.max(0, fish.ascent - dt);
    } else if (random(fish) < depth.ascentRate * dt) {
      fish.ascent = depth.ascentDuration;
    }
  }
  const ascending = fish.ascent > 0;

  // Pilotage de banc : direction voulue = cap actuel + pilotage.
  let schoolTurn = 0;
  let schoolBlend = 0;
  let schoolPitch = 0;
  let schoolSpeed = 0;
  const steerNorm = Math.sqrt(steerX * steerX + steerY * steerY + steerZ * steerZ);
  if (def.schooling !== null && steerNorm > STEER_EPSILON) {
    const horizontal = Math.cos(fish.pitch);
    const hx = Math.cos(fish.yaw) * horizontal;
    const hy = Math.sin(fish.pitch);
    const hz = Math.sin(fish.yaw) * horizontal;
    const dx = hx + steerX;
    const dy = hy + steerY;
    const dz = hz + steerZ;
    const dh = Math.sqrt(dx * dx + dz * dz);
    if (dh > STEER_EPSILON) {
      const maxTurn = def.schooling.turnRate * dt;
      schoolTurn = clamp(wrapAngle(Math.atan2(dz, dx) - fish.yaw), -maxTurn, maxTurn);
    }
    const pitchLimit = def.maxPitch * AVOID_PITCH_RATIO;
    schoolPitch = clamp(Math.atan2(dy, dh), -pitchLimit, pitchLimit);
    schoolBlend = Math.min(1, steerNorm);
    schoolSpeed = clamp(
      steerX * hx + steerY * hy + steerZ * hz,
      -SCHOOL_SPEED_GAIN,
      SCHOOL_SPEED_GAIN,
    );
  }

  // Nourriture : cap et inclinaison vers le point visé (sans effet si `food` est nul).
  let foodTurn = 0;
  let foodPitch = 0;
  let foodDistance = 0;
  if (food !== null) {
    const dx = food.x - fish.x;
    const dy = food.y - fish.y;
    const dz = food.z - fish.z;
    const dh = Math.sqrt(dx * dx + dz * dz);
    foodDistance = Math.sqrt(dh * dh + dy * dy);
    if (dh > STEER_EPSILON) {
      const maxTurn = def.feeding.turnRate * dt;
      foodTurn = clamp(wrapAngle(Math.atan2(dz, dx) - fish.yaw), -maxTurn, maxTurn);
    }
    const pitchLimit = def.maxPitch * AVOID_PITCH_RATIO;
    foodPitch = clamp(Math.atan2(dy, dh), -pitchLimit, pitchLimit);
  }

  // Vitesse : petite marche aléatoire rappelée vers la vitesse visée (croisière, ajustée en
  // banc ; accourue vers la nourriture).
  const rush = (def.cruiseSpeed + def.maxSpeed) / 2;
  const speedGoal =
    food !== null
      ? def.cruiseSpeed + (rush - def.cruiseSpeed) * Math.min(1, foodDistance / FOOD_RUSH_DISTANCE)
      : ascending
        ? rush
        : def.cruiseSpeed * (1 + schoolSpeed);
  const speed =
    fish.speed +
    (random(fish) * 2 - 1) * SPEED_JITTER * def.cruiseSpeed * dt +
    (speedGoal - fish.speed) * (food !== null ? FOOD_SPEED_RECALL : SPEED_RECALL) * dt;
  fish.speed = clamp(speed, def.minSpeed, def.maxSpeed);

  // Évitement : force des parois au point visé, des obstacles le long du segment de
  // prospection, déviée pour contourner ; `avoid` ∈ [0, 1] en est l'intensité.
  const cosPitch = Math.cos(fish.pitch);
  const headX = Math.cos(fish.yaw) * cosPitch;
  const headY = Math.sin(fish.pitch);
  const headZ = Math.sin(fish.yaw) * cosPitch;
  // En approche de la nourriture, la prospection s'arrête au point visé (dans les bornes de
  // nage) : un granulé posé au fond ou près d'un rocher n'est plus repoussé par l'évitement
  // de ce qui se trouve au-delà. L'évitement de ce qui est entre les deux reste entier.
  const reach = Math.max(MIN_LOOKAHEAD, fish.speed * LOOKAHEAD_SECONDS);
  const lookahead = food !== null ? Math.max(MIN_LOOKAHEAD, Math.min(reach, foodDistance)) : reach;
  const probeX = fish.x + headX * lookahead;
  const probeY = fish.y + headY * lookahead;
  const probeZ = fish.z + headZ * lookahead;
  const wall = wallAvoidance(probeX, probeY, probeZ, bounds.avoid, AVOID_ZONE, SCRATCH_WALL);
  if (bounds.outline !== undefined) {
    // Bord du bassin non rectangulaire (issue #190) : repousse comme une paroi verticale.
    const d = shapeDistance(bounds.outline, probeX, probeZ) - def.wallMargin;
    const w = proximity(d, AVOID_ZONE);
    if (w > 0) {
      shapeNormal(bounds.outline, probeX, probeZ, SCRATCH_SHAPE);
      wall.x += SCRATCH_SHAPE.x * w;
      wall.z += SCRATCH_SHAPE.z * w;
    }
  }
  const obstacle = obstacleAvoidance(
    fish.x,
    fish.y,
    fish.z,
    probeX,
    probeY,
    probeZ,
    obstacles,
    def.wallMargin,
    AVOID_ZONE,
    SCRATCH_OBSTACLE,
  );
  const rawX = wall.x + obstacle.x;
  const rawY = wall.y + obstacle.y;
  const rawZ = wall.z + obstacle.z;
  const avoid = Math.min(1, Math.sqrt(rawX * rawX + rawY * rawY + rawZ * rawZ));
  // Part de l'évitement dans le cap. Poisson attaché à une anémone (issue #150) qui revient
  // vers elle : seule la part horizontale compte (le fond, tout proche de l'anémone, ne joue
  // que sur l'inclinaison), et rien quand le point visé est du côté où l'évitement pousse (dos
  // à la paroi ou à l'obstacle) : sinon il longe la vitre ou le sable au lieu de faire
  // demi-tour. Réservé aux espèces `anemone` : la nage des autres reste celle d'avant, à
  // l'octet.
  let yawAvoid = avoid;
  if (def.anemone !== undefined && food !== null && avoid > 0) {
    const tx = food.x - fish.x;
    const tz = food.z - fish.z;
    yawAvoid = tx * rawX + tz * rawZ > 0 ? 0 : Math.min(1, Math.sqrt(rawX * rawX + rawZ * rawZ));
  }
  const force = deflect(rawX, rawY, rawZ, fish.yaw, fish.turn, SCRATCH_AVOID);
  const avoidX = headX + force.x * AVOID_GAIN;
  const avoidY = headY + force.y * AVOID_GAIN;
  const avoidZ = headZ + force.z * AVOID_GAIN;
  const avoidH = Math.sqrt(avoidX * avoidX + avoidZ * avoidZ);

  // Cap : errance (vitesse de virage en marche aléatoire amortie) et banc, cédant la place à
  // l'évitement en proportion de son intensité.
  // Le hasard de l'errance s'efface pendant l'évitement (sens du virage stable).
  const wanderJitter =
    (random(fish) * 2 - 1) * WANDER_JITTER * def.wanderTurnRate * dt * (1 - yawAvoid);
  let turn = fish.turn * (1 - WANDER_DAMPING * dt) + wanderJitter;
  let avoidTurn = 0;
  if (yawAvoid > 0 && avoidH > STEER_EPSILON) {
    const maxTurn = def.avoidTurnRate * dt;
    avoidTurn = clamp(wrapAngle(Math.atan2(avoidZ, avoidX) - fish.yaw), -maxTurn, maxTurn);
    // Mémoire du virage : l'errance prend le sens de l'évitement, qui reste ainsi le même
    // d'un pas à l'autre quand le poisson est pile face à la paroi (`deflect`, `side`).
    if (avoidTurn !== 0) {
      const committed = (avoidTurn > 0 ? 1 : -1) * AVOID_COMMIT_TURN * def.wanderTurnRate;
      turn += (committed - turn) * Math.min(1, AVOID_COMMIT * yawAvoid * dt);
    }
  }
  fish.turn = clamp(turn, -def.wanderTurnRate, def.wanderTurnRate);
  const freeTurn = food !== null ? foodTurn : fish.turn * dt + schoolTurn;
  fish.yaw = wrapAngle(fish.yaw + avoidTurn * yawAvoid + freeTurn * (1 - yawAvoid));

  // Inclinaison : errance lente (et banc), glissant vers celle de l'évitement du fond, de la
  // surface et des obstacles.
  const wanderPitch = def.maxPitch * WANDER_PITCH_RATIO;
  fish.pitchTarget = clamp(
    fish.pitchTarget + (random(fish) * 2 - 1) * PITCH_JITTER * def.maxPitch * dt,
    -wanderPitch,
    wanderPitch,
  );
  // En banc, l'inclinaison visée glisse vers celle de la direction voulue.
  let pitchGoal = fish.pitchTarget + (schoolPitch - fish.pitchTarget) * schoolBlend;
  // Espèce de fond : montée à l'inclinaison maximale pendant une remontée, sinon descente
  // au-dessus de la hauteur préférée. L'évitement (surface, obstacles) garde la priorité ci-dessous.
  if (food !== null) {
    pitchGoal = foodPitch;
  } else if (depth !== undefined) {
    const steep = def.maxPitch * AVOID_PITCH_RATIO;
    if (ascending) {
      pitchGoal = def.maxPitch;
    } else if (fish.y > bounds.preferredMaxY) {
      const pull = Math.min(1, (fish.y - bounds.preferredMaxY) / DEPTH_PULL_ZONE);
      pitchGoal += (-steep - pitchGoal) * pull;
    } else if (fish.y < bounds.preferredMinY) {
      // Espèce de mi-hauteur (issue #151) : montée symétrique sous la hauteur minimale.
      // La nuit (issue #209), l'attrait vers la hauteur minimale faiblit avec le repos.
      const pull = Math.min(1, (bounds.preferredMinY - fish.y) / DEPTH_PULL_ZONE) * (1 - rest);
      pitchGoal += (steep - pitchGoal) * pull;
    }
  }
  // Repos de nuit (issue #209) : descente au-dessus du plafond de nuit, hors nourriture et
  // remontée ; sans effet le jour (`rest` nul).
  if (rest > 0 && food === null && !ascending) {
    const ceiling = hard.minY + (hard.maxY - hard.minY) * NIGHT_HEIGHT_RATIO;
    if (fish.y > ceiling) {
      const steep = def.maxPitch * AVOID_PITCH_RATIO;
      const pull = Math.min(1, (fish.y - ceiling) / DEPTH_PULL_ZONE) * rest;
      pitchGoal += (-steep - pitchGoal) * pull;
    }
  }
  if (avoid > 0) {
    const avoidPitchLimit = def.maxPitch * AVOID_PITCH_RATIO;
    const avoidPitch = clamp(Math.atan2(avoidY, avoidH), -avoidPitchLimit, avoidPitchLimit);
    pitchGoal += (avoidPitch - pitchGoal) * avoid;
  }
  const maxPitchStep = PITCH_RATE * dt;
  fish.pitch = clamp(
    fish.pitch + clamp(pitchGoal - fish.pitch, -maxPitchStep, maxPitchStep),
    -def.maxPitch,
    def.maxPitch,
  );

  // Déplacement, puis filets de sécurité : sortie d'un obstacle (projection sur sa surface),
  // puis projection sur la boîte (convexe, contenant la position précédente : elle ne peut que
  // raccourcir le déplacement). Santé basse (issue #208) : déplacement réduit par `vigor`,
  // exactement 1 à santé pleine (nage d'avant, au bit près).
  // Repos de nuit (issue #209) : `nightPace`, exactement 1 le jour.
  const distance = fish.speed * dt * vigor(fish.health) * nightPace(rest);
  const horizontal = Math.cos(fish.pitch) * distance;
  fish.x += Math.cos(fish.yaw) * horizontal;
  fish.y += Math.sin(fish.pitch) * distance;
  fish.z += Math.sin(fish.yaw) * horizontal;
  // Plusieurs passes : sorti d'une sphère d'une union (ou d'un obstacle), le centre peut se
  // retrouver dans une sphère voisine ; sans obstacle, aucune passe.
  for (let pass = 0; pass < OBSTACLE_PASSES; pass++) {
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
    if (!moved) {
      break;
    }
  }
  fish.x = clamp(fish.x, hard.minX, hard.maxX);
  fish.y = clamp(fish.y, hard.minY, hard.maxY);
  fish.z = clamp(fish.z, hard.minZ, hard.maxZ);
  if (bounds.outline !== undefined) {
    keepInShape(fish, bounds.outline, def.wallMargin);
  }

  // Battement de queue : plus rapide quand le poisson nage plus vite. La phase n'est lue par
  // aucun calcul de trajectoire et ne consomme aucun tirage (sim/undulation.ts).
  fish.phase = (fish.phase + tailBeatRate(def, fish.speed) * dt) % TWO_PI;
}

function clearOfObstacles(fish: Fish, obstacles: readonly Obstacle[], margin: number): boolean {
  for (const o of obstacles) {
    if (obstacleDistance(o, fish.x, fish.y, fish.z, SCRATCH_NORMAL) < margin) {
      return false;
    }
  }
  return true;
}

/** Ramène un angle dans (-π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle % TWO_PI;
  if (a <= -Math.PI) {
    a += TWO_PI;
  } else if (a > Math.PI) {
    a -= TWO_PI;
  }
  return a;
}

/** Garde l'état du pas précédent (interpolation du rendu). */
export function savePrevious(fish: Mutable<Fish>): void {
  fish.px = fish.x;
  fish.py = fish.y;
  fish.pz = fish.z;
  fish.pyaw = fish.yaw;
  fish.ppitch = fish.pitch;
  fish.pphase = fish.phase;
}

/** Prochain réel uniforme dans [0, 1) du sous-générateur du poisson. */
export function random(fish: Mutable<Fish>): number {
  fish.rng = prngNextState(fish.rng);
  return prngOutput(fish.rng) / UINT32_RANGE;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Vrai si `(x, y, z)` est hors de la sphère englobante de `o` (rejet exact, sans racine). */
function outsideBound(o: Obstacle, x: number, y: number, z: number): boolean {
  const b = obstacleBound(o);
  const dx = x - b.x;
  const dy = y - b.y;
  const dz = z - b.z;
  return dx * dx + dy * dy + dz * dz >= b.radius * b.radius;
}
