import { assertSeed, deriveSeed, prngOutput } from '../core/random/prng';
import { growHunger } from './feeding';
import { obstacleDistance, type Obstacle } from './obstacles';
import {
  SPECIES,
  type BottomWalkerParams,
  type SpeciesDefinition,
  type SpeciesId,
} from './species';
import { createFish, random, savePrevious, wrapAngle, type Fish, type SwimBounds } from './swimmer';
import type { Box3 } from './tank';
import { terrainHeightAt, type TerrainSettings } from './terrain';
import { tailBeatRate } from './undulation';
import { vigor } from './wellbeing';

/**
 * Déplacement des espèces qui vivent sur le fond (axolotl, issue #130) : à la place de la
 * nage des poissons (`sim/swimmer.ts`), une machine à trois états.
 *
 * - **marche** : lente, le long du fond, qu'elle suit point par point (`sim/terrain.ts`) ;
 * - **nage** : par à-coups (accélération brève, puis glissade), à une hauteur tirée pour le
 *   créneau ;
 * - **remontée** : montée presque verticale jusque sous la surface, puis lente redescente.
 *
 * L'état est une **fonction pure** de la graine du monde, de l'identifiant et du temps
 * simulé (`walkerPhaseAt`) : le temps est découpé en créneaux de `slotDuration` secondes
 * (décalés d'une fraction propre à chaque individu), et l'état de chaque créneau est tiré
 * d'un hachage, selon les poids `weights`. Aucun champ d'état nouveau : la sauvegarde
 * (ADR 0028) ne change pas, et un monde rechargé reprend le même état au même instant.
 *
 * Bornes, garanties à chaque pas (le pas précédent les respectant) :
 * - le centre reste dans `bounds.hard` (vitres moins `wallMargin`) ;
 * - au-dessus du sol plus `clearance` et sous la surface moins `surfaceMargin` : un pas qui
 *   mènerait au-dessus d'un fond trop haut (pente de la berge) n'est pas fait, l'animal
 *   tourne sur place. Il ne sort donc jamais de l'eau et ne traverse jamais le sol.
 */

/** État de comportement d'une espèce qui marche sur le fond. */
export type WalkerMode = 'marche' | 'nage' | 'remontee';

/** États dans l'ordre des poids (`BottomWalkerParams.weights`). */
export const WALKER_MODES: readonly WalkerMode[] = ['marche', 'nage', 'remontee'];

/** Phase de comportement à un instant (`walkerPhaseAt`). */
export interface WalkerPhase {
  mode: WalkerMode;
  /** Numéro du créneau (entier positif ou nul). */
  slot: number;
  /** Avancement dans le créneau, dans [0, 1[. */
  progress: number;
  /** Hauteur de nage du créneau, en fraction de la colonne d'eau libre, dans [0, 1[. */
  height: number;
}

/** Sol et eau de l'environnement, lus par le déplacement sur le fond. */
export interface WalkerGround {
  /** Volume d'eau de l'environnement (surface : `maxY`). */
  readonly water: Box3;
  /** Sol à berge (`Environment.terrain`), ou `null` : fond plat à `water.minY`. */
  readonly terrain: TerrainSettings | null;
}

const UINT32_RANGE = 4294967296;
const TWO_PI = Math.PI * 2;

/** Sel des tirages du comportement (flux séparé du sous-générateur de l'entité). */
const PHASE_SALT = 0x6a09e667;
/** Normale de travail des distances aux obstacles (aucune allocation). */
const SCRATCH_NORMAL = { x: 0, y: 0, z: 0 };
/** Sel du déphasage des à-coups de nage. */
const BURST_SALT = 0xbb67ae85;

/** Part de la période des à-coups pendant laquelle l'animal accélère (approximation de jeu). */
export const BURST_SHARE = 0.3;
/** Part du créneau de remontée consacrée à la montée ; le reste, à la redescente. */
export const RISE_SHARE = 0.45;
/** Hauteur de nage tirée dans [NAGE_MIN, NAGE_MIN + NAGE_SPAN[ de la colonne libre. */
const NAGE_MIN = 0.2;
const NAGE_SPAN = 0.6;
/** Accélération et ralentissement vers la vitesse visée, par seconde (à-coups nets). */
const SPEED_ATTACK = 6;
const SPEED_RELEASE = 1.2;
/** Vitesses verticales maximales hors remontée, en m/s (approximations de jeu). */
const SWIM_VERTICAL = 0.025;
const SINK_VERTICAL = 0.015;
const SETTLE_VERTICAL = 0.03;
/** Gain du rappel vertical vers la hauteur visée, par seconde. */
const VERTICAL_GAIN = 2;
/** Errance du cap (comme les poissons, plus calme). */
const WANDER_JITTER = 4;
const WANDER_DAMPING = 0.5;
/** Prospection devant l'animal : en secondes de déplacement, au moins `MIN_PROBE` mètres. */
const LOOKAHEAD_SECONDS = 2;
const MIN_PROBE = 0.03;
/** Angle des sondes latérales qui choisissent le côté du virage, en radians. */
const SIDE_PROBE_ANGLE = 0.8;
/** Inclinaison maximale hors de la montée de la remontée, en radians (approximation de jeu). */
export const LEVEL_PITCH = 0.4;
/** Vitesse de changement d'inclinaison, en rad/s. */
const PITCH_RATE = 2.5;
/** Déplacement horizontal en deçà duquel l'inclinaison n'est pas recalculée, en mètres. */
const STILL_DISTANCE = 1e-6;
/**
 * Eau libre minimale au-dessus de l'animal posé sur le fond, en mètres : il ne s'aventure pas
 * là où la pente de la berge le mettrait au ras de la surface (approximation de jeu).
 */
export const WADE_ROOM = 0.03;
/** Nombre de tirages de la position de naissance au-dessus d'un fond assez profond. */
const MAX_SPAWN_TRIES = 32;
/** Grille de repli de la naissance (points par axe). */
const SPAWN_GRID = 9;

/**
 * Phase de comportement de l'individu `id` au temps simulé `time` : fonction pure de la
 * graine, de l'identifiant et du temps. Écrit dans `out` (aucune allocation) et le renvoie.
 * @throws RangeError si la graine ou l'identifiant n'est pas un entier 32 bits non signé,
 * ou si `time` n'est pas un réel positif ou nul.
 */
export function walkerPhaseAt(
  walker: BottomWalkerParams,
  seed: number,
  id: number,
  time: number,
  out: WalkerPhase = { mode: 'marche', slot: 0, progress: 0, height: 0 },
): WalkerPhase {
  if (!(time >= 0) || !Number.isFinite(time)) {
    throw new RangeError(`time doit être un réel positif ou nul (reçu : ${time})`);
  }
  const individual = deriveSeed((assertSeed(seed) ^ PHASE_SALT) >>> 0, id);
  const position = time / walker.slotDuration + individual / UINT32_RANGE;
  const slot = Math.floor(position);
  const hash = deriveSeed(individual, slot >>> 0);
  const { marche, nage, remontee } = walker.weights;
  const pick = (hash / UINT32_RANGE) * (marche + nage + remontee);
  out.mode = pick < marche ? 'marche' : pick < marche + nage ? 'nage' : 'remontee';
  out.slot = slot;
  out.progress = position - slot;
  out.height = NAGE_MIN + (NAGE_SPAN * prngOutput(hash)) / UINT32_RANGE;
  return out;
}

/**
 * Vitesse horizontale visée selon la phase (m/s) : marche lente ; nage par à-coups
 * (`maxSpeed` pendant `BURST_SHARE` de chaque période, puis `minSpeed`) ; remontée lente
 * à l'horizontale (l'animal monte), puis marche.
 */
export function walkerSpeedGoal(def: SpeciesDefinition, phase: WalkerPhase, burst: number): number {
  const walker = def.walker!;
  switch (phase.mode) {
    case 'marche':
      return walker.walkSpeed;
    case 'nage':
      return burst < BURST_SHARE ? def.maxSpeed : def.minSpeed;
    case 'remontee':
      return phase.progress < RISE_SHARE ? def.minSpeed : walker.walkSpeed;
  }
}

/** Hauteur du sol en (x, z) : carte de hauteurs de l'environnement, ou fond plat. */
export function groundHeight(x: number, z: number, ground: WalkerGround): number {
  return ground.terrain === null
    ? ground.water.minY
    : terrainHeightAt(x, z, ground.terrain, ground.water);
}

/**
 * Vrai si le point (x, z) est dans les bornes horizontales et au-dessus d'un fond assez
 * profond pour que l'animal, pattes posées, reste sous la surface avec au moins `WADE_ROOM`
 * d'eau libre au-dessus de lui.
 */
export function walkerCanStand(
  x: number,
  z: number,
  def: SpeciesDefinition,
  bounds: SwimBounds,
  ground: WalkerGround,
): boolean {
  const { hard } = bounds;
  return (
    x >= hard.minX &&
    x <= hard.maxX &&
    z >= hard.minZ &&
    z <= hard.maxZ &&
    groundHeight(x, z, ground) + def.walker!.clearance + WADE_ROOM <= hard.maxY
  );
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Crée un individu d'une espèce qui marche sur le fond : comme un poisson (`createFish`,
 * même sous-générateur, même tirage du cap et de la phase), puis posé sur le fond, à un
 * point tiré au-dessus d'une eau assez profonde (au plus `MAX_SPAWN_TRIES` tirages, puis le
 * point le plus profond d'une grille), à au moins `wallMargin` des obstacles. En marche, les
 * obstacles ne sont pas encore contournés : le paludarium n'en a pas sous l'eau (décor #132).
 * @throws RangeError si l'espèce ne marche pas sur le fond.
 */
export function createWalker(
  seed: number,
  id: number,
  species: SpeciesId,
  bounds: SwimBounds,
  ground: WalkerGround,
  obstacles: readonly Obstacle[] = [],
): Fish {
  const def = SPECIES[species];
  if (def.walker === undefined) {
    throw new RangeError(`l’espèce ${species} ne marche pas sur le fond`);
  }
  const fish = createFish(seed, id, species, bounds, obstacles) as Mutable<Fish>;
  const { hard } = bounds;
  const settle = () => {
    fish.y = Math.max(
      hard.minY,
      Math.min(groundHeight(fish.x, fish.z, ground) + def.walker!.clearance, hard.maxY),
    );
  };
  const fits = () => {
    if (!walkerCanStand(fish.x, fish.z, def, bounds, ground)) {
      return false;
    }
    settle();
    return obstacles.every(
      (o) => obstacleDistance(o, fish.x, fish.y, fish.z, SCRATCH_NORMAL) >= def.wallMargin,
    );
  };
  let placed = fits();
  for (let attempt = 0; attempt < MAX_SPAWN_TRIES && !placed; attempt++) {
    fish.x = hard.minX + (hard.maxX - hard.minX) * random(fish);
    fish.z = hard.minZ + (hard.maxZ - hard.minZ) * random(fish);
    placed = fits();
  }
  if (!placed) {
    placeOnDeepestPoint(fish, bounds, ground);
  }
  settle();
  fish.pitch = 0;
  fish.pitchTarget = 0;
  fish.speed = def.walker.walkSpeed;
  savePrevious(fish);
  return fish;
}

function placeOnDeepestPoint(fish: Mutable<Fish>, bounds: SwimBounds, ground: WalkerGround): void {
  const { hard } = bounds;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < SPAWN_GRID; i++) {
    for (let j = 0; j < SPAWN_GRID; j++) {
      const x = hard.minX + ((hard.maxX - hard.minX) * i) / (SPAWN_GRID - 1);
      const z = hard.minZ + ((hard.maxZ - hard.minZ) * j) / (SPAWN_GRID - 1);
      const h = groundHeight(x, z, ground);
      if (h < best) {
        best = h;
        fish.x = x;
        fish.z = z;
      }
    }
  }
}

const PHASE: WalkerPhase = { mode: 'marche', slot: 0, progress: 0, height: 0 };

/**
 * Fait avancer un individu qui marche sur le fond de `dt` secondes, **en place** (aucune
 * allocation), au temps simulé `time` (fin du pas). Un tirage de son sous-générateur par
 * pas (errance du cap).
 *
 * Garanties (voir l'en-tête du module) : centre dans `bounds.hard`, au-dessus du sol plus
 * `clearance`, sous `bounds.hard.maxY` ; `speed` ∈ [minSpeed, maxSpeed] ;
 * `|pitch|` ≤ maxPitch ; déplacement horizontal d'au plus `maxSpeed · dt`.
 */
export function stepWalker(
  fish: Mutable<Fish>,
  dt: number,
  seed: number,
  time: number,
  bounds: SwimBounds,
  ground: WalkerGround,
): void {
  const def = SPECIES[fish.species];
  const walker = def.walker!;
  const { hard } = bounds;
  savePrevious(fish);
  fish.hunger = growHunger(fish.hunger, def, dt);

  const phase = walkerPhaseAt(walker, seed, fish.id, time, PHASE);
  const burstOffset = deriveSeed((seed ^ BURST_SALT) >>> 0, fish.id) / UINT32_RANGE;
  const burstPosition = time / walker.burstPeriod + burstOffset;
  const burst = burstPosition - Math.floor(burstPosition);

  // Vitesse : accélération vive, ralentissement lent (à-coups de la nage).
  const speedGoal = walkerSpeedGoal(def, phase, burst);
  const rate = speedGoal > fish.speed ? SPEED_ATTACK : SPEED_RELEASE;
  fish.speed = clamp(
    fish.speed + (speedGoal - fish.speed) * Math.min(1, rate * dt),
    def.minSpeed,
    def.maxSpeed,
  );

  // Cap : errance, sauf si le fond devant remonte trop (berge) ou si une vitre approche :
  // virage franc du côté le plus profond.
  let turn =
    fish.turn * (1 - WANDER_DAMPING * dt) +
    (random(fish) * 2 - 1) * WANDER_JITTER * def.wanderTurnRate * dt;
  const reach = def.bodyLength / 2 + Math.max(MIN_PROBE, fish.speed * LOOKAHEAD_SECONDS);
  let yaw = fish.yaw;
  if (
    !walkerCanStand(
      fish.x + Math.cos(yaw) * reach,
      fish.z + Math.sin(yaw) * reach,
      def,
      bounds,
      ground,
    )
  ) {
    const left = openness(fish, yaw + SIDE_PROBE_ANGLE, reach, def, bounds, ground);
    const right = openness(fish, yaw - SIDE_PROBE_ANGLE, reach, def, bounds, ground);
    const side = left > right ? 1 : left < right ? -1 : fish.turn >= 0 ? 1 : -1;
    yaw += side * def.avoidTurnRate * dt;
    turn = side * def.wanderTurnRate;
  } else {
    yaw += turn * dt;
  }
  fish.turn = clamp(turn, -def.wanderTurnRate, def.wanderTurnRate);
  fish.yaw = wrapAngle(yaw);

  // Déplacement horizontal, refusé s'il mène hors des bornes ou au-dessus d'un fond trop haut.
  // Santé basse (issue #208) : pas réduit par `vigor`, exactement 1 à santé pleine.
  const step = fish.speed * dt * vigor(fish.health);
  const nx = clamp(fish.x + Math.cos(fish.yaw) * step, hard.minX, hard.maxX);
  const nz = clamp(fish.z + Math.sin(fish.yaw) * step, hard.minZ, hard.maxZ);
  if (walkerCanStand(nx, nz, def, bounds, ground)) {
    fish.x = nx;
    fish.z = nz;
  }

  // Hauteur : jamais sous le sol (centre, museau et queue), jamais au-dessus du plafond.
  const ceiling = hard.maxY;
  const half = def.bodyLength / 2;
  const cos = Math.cos(fish.yaw) * half;
  const sin = Math.sin(fish.yaw) * half;
  const center = groundHeight(fish.x, fish.z, ground) + walker.clearance;
  const ends =
    Math.max(
      groundHeight(fish.x + cos, fish.z + sin, ground),
      groundHeight(fish.x - cos, fish.z - sin, ground),
    ) + walker.clearance;
  const floor = Math.max(hard.minY, center, Math.min(ends, ceiling));
  let goal: number;
  let vertical: number;
  switch (phase.mode) {
    case 'marche':
      goal = floor;
      vertical = SETTLE_VERTICAL;
      break;
    case 'nage':
      goal = floor + (ceiling - floor) * phase.height;
      vertical = SWIM_VERTICAL;
      break;
    case 'remontee':
      goal = phase.progress < RISE_SHARE ? ceiling : floor;
      vertical = phase.progress < RISE_SHARE ? walker.climbSpeed : SINK_VERTICAL;
      break;
  }
  const vy = clamp((goal - fish.y) * VERTICAL_GAIN, -vertical, vertical);
  fish.y = clamp(fish.y + vy * dt, floor, ceiling);

  // Inclinaison : celle du déplacement (pente suivie, montée, descente), lissée, bornée par la
  // place autour du corps.
  const dx = fish.x - fish.px;
  const dz = fish.z - fish.pz;
  const dh = Math.sqrt(dx * dx + dz * dz);
  const dy = fish.y - fish.py;
  if (dh > STILL_DISTANCE || Math.abs(dy) > STILL_DISTANCE) {
    // Seule la montée de la remontée se fait cabrée ; ailleurs (descente, nage, pente),
    // l'animal reste presque à plat : il se laisse couler plutôt que de plonger tête en bas.
    const steep = phase.mode === 'remontee' && phase.progress < RISE_SHARE;
    const limit = steep ? def.maxPitch : Math.min(def.maxPitch, LEVEL_PITCH);
    fish.pitchTarget = clamp(Math.atan2(dy, dh), -limit, limit);
  }
  // Place laissée par le sol et la surface : museau (à une demi-longueur) et queue (à une
  // longueur, nageoire comprise) ne sortent ni de l'eau ni du sol.
  const above = (ceiling - fish.y) / half;
  const below = (fish.y - floor) / half;
  const upLimit = Math.min(def.maxPitch, Math.asin(clamp(Math.min(above, below / 2), 0, 1)));
  const downLimit = Math.min(def.maxPitch, Math.asin(clamp(Math.min(below, above / 2), 0, 1)));
  const maxPitchStep = PITCH_RATE * dt;
  fish.pitch = clamp(
    fish.pitch + clamp(fish.pitchTarget - fish.pitch, -maxPitchStep, maxPitchStep),
    -downLimit,
    upLimit,
  );

  // Queue : bat plus vite à la nage et à la montée qu'à la marche.
  const effort = Math.max(fish.speed, Math.abs(vy));
  fish.phase = (fish.phase + tailBeatRate(def, effort) * dt) % TWO_PI;
}

/**
 * Profondeur d'eau libre à `reach` mètres dans la direction `yaw` (plafond moins fond plus
 * `clearance`), ou −1 hors des bornes horizontales.
 */
function openness(
  fish: Fish,
  yaw: number,
  reach: number,
  def: SpeciesDefinition,
  bounds: SwimBounds,
  ground: WalkerGround,
): number {
  const x = fish.x + Math.cos(yaw) * reach;
  const z = fish.z + Math.sin(yaw) * reach;
  const { hard } = bounds;
  if (x < hard.minX || x > hard.maxX || z < hard.minZ || z > hard.maxZ) {
    return -1;
  }
  return hard.maxY - (groundHeight(x, z, ground) + def.walker!.clearance);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
