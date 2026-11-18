import { prngNextState, prngOutput, deriveSeed } from '../core/random/prng';
import {
  constrainToShape,
  DEFAULT_POND_SHAPE,
  insideShape,
  keepInShape,
  shapeOutline,
  type PondShape,
  type ShapeOutline,
} from './pond-shape';
import { growHunger, HUNGER_START } from './feeding';
import type { Vec3 } from './flocking';
import { obstacleDistance, type Obstacle } from './obstacles';
import { shrinkBox, type Box3 } from './tank';
import { SPECIES, type SpeciesDefinition, type SpeciesId } from './species';
import { nightPace } from './day-rhythm';
import { tailBeatRate } from './undulation';
import { HEALTH_START, vigor } from './health-scale';
import { advancePhase, clamp, dampedTurn, pitchToward, wrapAngle } from './motion';
import {
  AVOID_PITCH_RATIO,
  AVOID_ZONE,
  avoidanceInPlace,
  depthPitchGoal,
  foodSteeringInPlace,
  headingTurn,
  nightPitchGoal,
  pushOutOfObstaclesInPlace,
  schoolSteeringInPlace,
  STEER_EPSILON,
  type SwimStep,
} from './swim-steering';

export { wrapAngle } from './motion';

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
  /**
   * Âge de l'infection par les points blancs, en secondes simulées, dans
   * [0, `ICH_AGGRAVATED_AT`] (`sim/disease.ts`, issue #360) ; absent : sain. Lecture seule
   * pour le rendu (`ichStage`, `ichSeverity`).
   */
  readonly ich?: number;
  /**
   * Progression de la pourriture des nageoires, en secondes simulées, dans
   * [0, `FIN_ROT_MAX`] (`sim/fin-rot.ts`, issue #485) ; absent : sain. Lecture seule pour le
   * rendu (`finRotSeverity`).
   */
  readonly finRot?: number;
  /**
   * Progression du velours, en secondes simulées, dans [0, `VELVET_MAX`] (`sim/velvet.ts`,
   * issue #532) ; absent : sain. Lecture seule pour le rendu (`velvetSeverity`).
   */
  readonly velvet?: number;
  /**
   * Progression des champignons (Saprolegnia), en secondes simulées, dans [0, `FUNGUS_MAX`]
   * (`sim/fungus.ts`, issue #548) ; absent : sain. Lecture seule pour le rendu
   * (`fungusSeverity`).
   */
  readonly fungus?: number;
  /**
   * Progression de l'hydropisie, en secondes simulées, dans [0, `DROPSY_MAX`]
   * (`sim/dropsy.ts`, issue #565) ; absent : sain. Lecture seule pour le rendu
   * (`dropsySwelling`, `dropsyScales`).
   */
  readonly dropsy?: number;
  /**
   * Âge de l'alevin, en secondes simulées, dans [0, `FRY_GROWTH_TIME`) (`sim/fry.ts`, issue
   * #459) ; absent : adulte. Lecture seule pour le rendu (`fryScale`).
   */
  readonly growth?: number;
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
/** Variation aléatoire de la vitesse, en multiples de `cruiseSpeed` par seconde. */
const SPEED_JITTER = 1.5;
/** Rappel de la vitesse vers la vitesse de croisière, par seconde. */
const SPEED_RECALL = 0.5;
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
const SCRATCH_NORMAL: Vec3 = { x: 0, y: 0, z: 0 };
const SCRATCH_SHAPE = { x: 0, z: 0 };

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
 *
 * `hugWalls` (broutage, issue #427, `sim/behaviors.ts`) : avec un point visé, l'évitement des
 * parois est annulé (celui des obstacles reste) ; faux par défaut, nage d'avant au bit près.
 *
 * `closeAvoid` (garde de la ponte, issue #670, `sim/clutch-guard.ts`) : avec un point visé,
 * les obstacles ne sont évités qu'à `CLOSE_AVOID_MARGIN` plus `CLOSE_AVOID_ZONE` de leur
 * surface, au lieu de `wallMargin` plus `AVOID_ZONE` ; faux par défaut, nage d'avant au bit près.
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
  hugWalls = false,
  closeAvoid = false,
): void {
  const c = SWIM;
  c.fish = fish;
  c.def = SPECIES[fish.species];
  c.dt = dt;
  c.bounds = bounds;
  c.obstacles = obstacles;
  c.food = food;
  c.rest = rest;
  c.hugWalls = hugWalls;
  c.closeAvoid = closeAvoid;
  savePrevious(fish);
  fish.hunger = growHunger(fish.hunger, c.def, dt);
  updateAscentInPlace(c);
  schoolSteeringInPlace(c, steerX, steerY, steerZ);
  foodSteeringInPlace(c);
  updateSpeedInPlace(c);
  avoidanceInPlace(c);
  turnInPlace(c);
  pitchInPlace(c);
  moveInPlace(c);
  // Battement de queue : plus rapide quand le poisson nage plus vite. La phase n'est lue par
  // aucun calcul de trajectoire et ne consomme aucun tirage (sim/undulation.ts).
  fish.phase = advancePhase(fish.phase, tailBeatRate(c.def, fish.speed), dt);
}

/** Contexte de travail de `stepFish` (aucune allocation par pas ; la nage n'est pas réentrante). */
const SWIM: SwimStep = {
  fish: null as unknown as Mutable<Fish>, // renseigné au début de chaque pas
  def: null as unknown as SpeciesDefinition, // idem
  dt: 0,
  bounds: null as unknown as SwimBounds, // idem
  obstacles: NO_OBSTACLES,
  food: null,
  rest: 0,
  hugWalls: false,
  closeAvoid: false,
  ascending: false,
  schoolTurn: 0,
  schoolPitch: 0,
  schoolBlend: 0,
  schoolSpeed: 0,
  foodTurn: 0,
  foodPitch: 0,
  foodDistance: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  probeX: 0,
  probeY: 0,
  probeZ: 0,
  avoid: 0,
  yawAvoid: 0,
  avoidX: 0,
  avoidY: 0,
  avoidZ: 0,
  avoidH: 0,
};

/**
 * Espèce de fond : brève remontée vers la surface, déclenchée au hasard (tirage seulement
 * pour ces espèces : les autres gardent exactement leur suite de tirages), terminée à la
 * limite `soft` de la surface ou au bout de `ascentDuration`.
 */
function updateAscentInPlace(c: SwimStep): void {
  const { fish, dt } = c;
  const depth = c.def.depth;
  if (depth !== undefined) {
    if (fish.ascent > 0) {
      fish.ascent = fish.y >= c.bounds.soft.maxY ? 0 : Math.max(0, fish.ascent - dt);
    } else if (random(fish) < depth.ascentRate * dt) {
      fish.ascent = depth.ascentDuration;
    }
  }
  c.ascending = fish.ascent > 0;
}

/**
 * Vitesse : petite marche aléatoire rappelée vers la vitesse visée (croisière, ajustée en
 * banc ; accourue vers la nourriture).
 */
function updateSpeedInPlace(c: SwimStep): void {
  const { fish, def, dt, food } = c;
  const rush = (def.cruiseSpeed + def.maxSpeed) / 2;
  const speedGoal =
    food !== null
      ? def.cruiseSpeed +
        (rush - def.cruiseSpeed) * Math.min(1, c.foodDistance / FOOD_RUSH_DISTANCE)
      : c.ascending
        ? rush
        : def.cruiseSpeed * (1 + c.schoolSpeed);
  const speed =
    fish.speed +
    (random(fish) * 2 - 1) * SPEED_JITTER * def.cruiseSpeed * dt +
    (speedGoal - fish.speed) * (food !== null ? FOOD_SPEED_RECALL : SPEED_RECALL) * dt;
  fish.speed = clamp(speed, def.minSpeed, def.maxSpeed);
}

/**
 * Cap : errance (vitesse de virage en marche aléatoire amortie) et banc, cédant la place à
 * l'évitement en proportion de son intensité. Le hasard de l'errance s'efface pendant
 * l'évitement (sens du virage stable).
 */
function turnInPlace(c: SwimStep): void {
  const { fish, def, dt, yawAvoid } = c;
  const wanderJitter =
    (random(fish) * 2 - 1) * WANDER_JITTER * def.wanderTurnRate * dt * (1 - yawAvoid);
  let turn = dampedTurn(fish.turn, WANDER_DAMPING, wanderJitter, dt);
  let avoidTurn = 0;
  if (yawAvoid > 0 && c.avoidH > STEER_EPSILON) {
    avoidTurn = headingTurn(fish.yaw, c.avoidX, c.avoidZ, def.avoidTurnRate * dt);
    // Mémoire du virage : l'errance prend le sens de l'évitement, qui reste ainsi le même
    // d'un pas à l'autre quand le poisson est pile face à la paroi (`deflect`, `side`).
    if (avoidTurn !== 0) {
      const committed = (avoidTurn > 0 ? 1 : -1) * AVOID_COMMIT_TURN * def.wanderTurnRate;
      turn += (committed - turn) * Math.min(1, AVOID_COMMIT * yawAvoid * dt);
    }
  }
  fish.turn = clamp(turn, -def.wanderTurnRate, def.wanderTurnRate);
  const freeTurn = c.food !== null ? c.foodTurn : fish.turn * dt + c.schoolTurn;
  fish.yaw = wrapAngle(fish.yaw + avoidTurn * yawAvoid + freeTurn * (1 - yawAvoid));
}

/**
 * Inclinaison : errance lente (et banc), glissant vers celle de la nourriture, de la
 * profondeur préférée, du repos de nuit, puis de l'évitement du fond, de la surface et des
 * obstacles.
 */
function pitchInPlace(c: SwimStep): void {
  const { fish, def, dt } = c;
  const wanderPitch = def.maxPitch * WANDER_PITCH_RATIO;
  fish.pitchTarget = clamp(
    fish.pitchTarget + (random(fish) * 2 - 1) * PITCH_JITTER * def.maxPitch * dt,
    -wanderPitch,
    wanderPitch,
  );
  // En banc, l'inclinaison visée glisse vers celle de la direction voulue.
  let pitchGoal = fish.pitchTarget + (c.schoolPitch - fish.pitchTarget) * c.schoolBlend;
  pitchGoal = c.food !== null ? c.foodPitch : depthPitchGoal(c, pitchGoal);
  pitchGoal = nightPitchGoal(c, pitchGoal);
  if (c.avoid > 0) {
    const avoidPitchLimit = def.maxPitch * AVOID_PITCH_RATIO;
    const avoidPitch = clamp(Math.atan2(c.avoidY, c.avoidH), -avoidPitchLimit, avoidPitchLimit);
    pitchGoal += (avoidPitch - pitchGoal) * c.avoid;
  }
  fish.pitch = pitchToward(fish.pitch, pitchGoal, PITCH_RATE * dt, -def.maxPitch, def.maxPitch);
}

/**
 * Déplacement, puis filets de sécurité : sortie d'un obstacle (projection sur sa surface),
 * puis projection sur la boîte (convexe, contenant la position précédente : elle ne peut que
 * raccourcir le déplacement). Santé basse (issue #208) : déplacement réduit par `vigor`,
 * exactement 1 à santé pleine (nage d'avant, au bit près). Repos de nuit (issue #209) :
 * `nightPace`, exactement 1 le jour.
 */
function moveInPlace(c: SwimStep): void {
  const { fish, bounds } = c;
  const { hard } = bounds;
  const distance = fish.speed * c.dt * vigor(fish.health) * nightPace(c.rest);
  const horizontal = Math.cos(fish.pitch) * distance;
  fish.x += Math.cos(fish.yaw) * horizontal;
  fish.y += Math.sin(fish.pitch) * distance;
  fish.z += Math.sin(fish.yaw) * horizontal;
  pushOutOfObstaclesInPlace(fish, c.obstacles);
  fish.x = clamp(fish.x, hard.minX, hard.maxX);
  fish.y = clamp(fish.y, hard.minY, hard.maxY);
  fish.z = clamp(fish.z, hard.minZ, hard.maxZ);
  if (bounds.outline !== undefined) {
    keepInShape(fish, bounds.outline, c.def.wallMargin);
  }
}

function clearOfObstacles(fish: Fish, obstacles: readonly Obstacle[], margin: number): boolean {
  for (const o of obstacles) {
    if (obstacleDistance(o, fish.x, fish.y, fish.z, SCRATCH_NORMAL) < margin) {
      return false;
    }
  }
  return true;
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
