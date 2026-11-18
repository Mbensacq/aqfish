import { assertSeed, deriveSeed, prngOutput } from '../core/random/prng';
import { growHunger } from './feeding';
import { obstacleDistance, type Obstacle } from './obstacles';
import {
  SPECIES,
  type BottomWalkerParams,
  type CleaningParams,
  type SpeciesDefinition,
  type SpeciesId,
} from './species';
import { advancePhase, clamp, dampedTurn, pitchToward, wrapAngle } from './motion';
import { createFish, random, savePrevious, type Fish, type SwimBounds } from './swimmer';
import type { Box3 } from './tank';
import { terrainHeightAt, type TerrainSettings } from './terrain';
import { tailBeatRate } from './undulation';
import { vigor } from './health-scale';

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

/** Sel des tirages du comportement (flux séparé du sous-générateur de l'entité). */
const PHASE_SALT = 0x6a09e667;
/** Normale de travail des distances aux obstacles (aucune allocation). */
const SCRATCH_NORMAL = { x: 0, y: 0, z: 0 };
/** Sel du déphasage des à-coups de nage. */
const BURST_SALT = 0xbb67ae85;
/** Sel du tirage des créneaux d'approche des poissons (#656). */
const CLEANING_SALT = 0x3c6ef372;

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
 * obstacles (coraux, rochers, décor) sont contournés comme un fond trop haut par les espèces
 * qui le déclarent (`BottomWalkerParams.avoidsObstacles`, `stepWalker`, issue #422).
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

/**
 * Vrai si le créneau `slot` de l'individu `id` est un créneau d'approche des poissons
 * (#656) : fonction pure de la graine, de l'identifiant et du créneau, vraie pour une part
 * `cleaning.share` des créneaux. Ne vaut que pour les créneaux de marche (`stepWalker`).
 */
export function walkerCleansAt(
  cleaning: CleaningParams,
  seed: number,
  id: number,
  slot: number,
): boolean {
  const individual = deriveSeed((assertSeed(seed) ^ CLEANING_SALT) >>> 0, id);
  return deriveSeed(individual, slot >>> 0) / UINT32_RANGE < cleaning.share;
}

/**
 * Habitant tel que le lit l'approche des poissons (#656) : identifiant, espèce et position.
 * Un `Fish` convient ; `World` passe un instantané des positions du début du pas
 * (`neighborsInto`, #669).
 */
export type WalkerNeighbor = Pick<Fish, 'id' | 'species' | 'x' | 'y' | 'z'>;

/**
 * Vrai si l'un de `fishes` marche sur le fond et approche les poissons de passage
 * (`BottomWalkerParams.cleaning`) : sinon, aucun instantané n'est utile.
 */
export function hasCleaningWalker(fishes: readonly Pick<Fish, 'species'>[]): boolean {
  for (const fish of fishes) {
    if (SPECIES[fish.species].walker?.cleaning !== undefined) {
      return true;
    }
  }
  return false;
}

/**
 * Instantané de `fishes` (identifiant, espèce, position), écrit dans `out` et renvoyé (#669) :
 * `out` prend la longueur de `fishes` ; ses objets sont réutilisés d'un appel à l'autre, un
 * nouvel objet n'est créé que si la population croît. Pris avant la boucle de pas, il donne à
 * l'approche des poissons les positions du **début** du pas, comme le banc et la nourriture,
 * quel que soit l'ordre de mise à jour.
 */
export function neighborsInto(
  fishes: readonly WalkerNeighbor[],
  out: Mutable<WalkerNeighbor>[],
): Mutable<WalkerNeighbor>[] {
  const n = fishes.length;
  for (let i = 0; i < n; i++) {
    const fish = fishes[i];
    let slot = out[i];
    if (slot === undefined) {
      slot = { id: fish.id, species: fish.species, x: 0, y: 0, z: 0 };
      out[i] = slot;
    }
    slot.id = fish.id;
    slot.species = fish.species;
    slot.x = fish.x;
    slot.y = fish.y;
    slot.z = fish.z;
  }
  out.length = n;
  return out;
}

/**
 * Poisson que l'individu `fish` approche (#656) : parmi `others`, le plus proche à
 * l'horizontale, à au plus `cleaning.radius`, au-dessus de lui d'au plus `cleaning.maxHeight`
 * (jamais en dessous), en ne comptant que les nageurs (ni lui-même, ni un autre marcheur du
 * fond, ni une espèce amphibie). À égalité, le premier du tableau. `null` si aucun.
 */
export function cleaningTarget<T extends WalkerNeighbor>(
  fish: WalkerNeighbor,
  others: readonly T[],
  cleaning: CleaningParams,
): T | null {
  let best: T | null = null;
  let bestDistance = cleaning.radius * cleaning.radius;
  for (const other of others) {
    if (other.id === fish.id) {
      continue;
    }
    const def = SPECIES[other.species];
    if (def.walker !== undefined || def.amphibian !== undefined) {
      continue;
    }
    const height = other.y - fish.y;
    if (!(height >= 0 && height <= cleaning.maxHeight)) {
      continue;
    }
    const dx = other.x - fish.x;
    const dz = other.z - fish.z;
    const distance = dx * dx + dz * dz;
    if (distance <= bestDistance && (best === null || distance < bestDistance)) {
      best = other;
      bestDistance = distance;
    }
  }
  return best;
}

/** Aucun obstacle (marcheurs qui les ignorent). */
const NO_OBSTACLES: readonly Obstacle[] = [];

const PHASE: WalkerPhase = { mode: 'marche', slot: 0, progress: 0, height: 0 };

/** Aucun autre habitant (approche des poissons sans objet). */
const NO_FISH: readonly WalkerNeighbor[] = [];

/**
 * Fait avancer un individu qui marche sur le fond de `dt` secondes, **en place** (aucune
 * allocation), au temps simulé `time` (fin du pas). Un tirage de son sous-générateur par
 * pas (errance du cap).
 *
 * Garanties (voir l'en-tête du module) : centre dans `bounds.hard`, au-dessus du sol plus
 * `clearance`, sous `bounds.hard.maxY` ; `speed` ∈ [minSpeed, maxSpeed] ;
 * `|pitch|` ≤ maxPitch ; déplacement horizontal d'au plus `maxSpeed · dt`.
 *
 * `others` : habitants du bac, lus pour l'approche des poissons de passage des espèces qui la
 * déclarent (`BottomWalkerParams.cleaning`, #656) ; l'approche se fait en marche, sur le fond,
 * avec les mêmes refus de pas : les garanties ci-dessus tiennent. `World` y passe les positions
 * du début du pas (`neighborsInto`, #669).
 */
export function stepWalker(
  fish: Mutable<Fish>,
  dt: number,
  seed: number,
  time: number,
  bounds: SwimBounds,
  ground: WalkerGround,
  obstacles: readonly Obstacle[] = [],
  others: readonly WalkerNeighbor[] = NO_FISH,
): void {
  const c = WALK;
  c.fish = fish;
  c.def = SPECIES[fish.species];
  c.walker = c.def.walker!;
  c.dt = dt;
  c.bounds = bounds;
  c.ground = ground;
  // Obstacles contournés seulement par les espèces qui le déclarent (crevette, #422).
  c.blockers = c.walker.avoidsObstacles === true ? obstacles : NO_OBSTACLES;
  savePrevious(fish);
  fish.hunger = growHunger(fish.hunger, c.def, dt);
  c.phase = walkerPhaseAt(c.walker, seed, fish.id, time, PHASE);
  c.burst = burstAt(c.walker, seed, fish.id, time);
  cleaningVisitInPlace(c, seed, others);
  walkerSpeedInPlace(c);
  walkerTurnInPlace(c);
  walkerStepInPlace(c);
  walkerHeightInPlace(c);
  walkerPitchInPlace(c);
  // Queue : bat plus vite à la nage et à la montée qu'à la marche.
  const effort = Math.max(fish.speed, Math.abs(c.vy));
  fish.phase = advancePhase(fish.phase, tailBeatRate(c.def, effort), dt);
}

/**
 * Contexte d'un pas de marche, partagé par ses étapes : entrées de `stepWalker`, puis
 * résultats de chaque étape (phase, approche, sol et plafond, vitesse verticale).
 */
interface WalkStep {
  fish: Mutable<Fish>;
  def: SpeciesDefinition;
  walker: BottomWalkerParams;
  dt: number;
  bounds: SwimBounds;
  ground: WalkerGround;
  /** Obstacles contournés (aucun pour une espèce qui ne le déclare pas). */
  blockers: readonly Obstacle[];
  phase: WalkerPhase;
  /** Avancement dans la période des à-coups de nage, dans [0, 1[. */
  burst: number;
  /** Poisson approché (#656), ou `null` ; atteint quand l'animal est dessous. */
  visited: WalkerNeighbor | null;
  reached: boolean;
  /** Cap vers le poisson approché, en radians. */
  heading: number;
  /** Hauteurs permises du centre au point atteint, en mètres. */
  floor: number;
  ceiling: number;
  /** Vitesse verticale du pas, en m/s. */
  vy: number;
}

/** Contexte de travail de `stepWalker` (aucune allocation par pas ; non réentrant). */
const WALK: WalkStep = {
  fish: null as unknown as Mutable<Fish>, // renseigné au début de chaque pas
  def: null as unknown as SpeciesDefinition, // idem
  walker: null as unknown as BottomWalkerParams, // idem
  dt: 0,
  bounds: null as unknown as SwimBounds, // idem
  ground: null as unknown as WalkerGround, // idem
  blockers: NO_OBSTACLES,
  phase: PHASE,
  burst: 0,
  visited: null,
  reached: false,
  heading: 0,
  floor: 0,
  ceiling: 0,
  vy: 0,
};

/** Avancement de l'individu `id` dans la période des à-coups au temps `time`, dans [0, 1[. */
function burstAt(walker: BottomWalkerParams, seed: number, id: number, time: number): number {
  const burstOffset = deriveSeed((seed ^ BURST_SALT) >>> 0, id) / UINT32_RANGE;
  const burstPosition = time / walker.burstPeriod + burstOffset;
  return burstPosition - Math.floor(burstPosition);
}

/**
 * Approche d'un poisson de passage (#656) : créneau de marche tiré pour cela et poisson bas
 * à portée ; sinon (et pour toute autre espèce), marche d'avant, au bit près.
 */
function cleaningVisitInPlace(c: WalkStep, seed: number, others: readonly WalkerNeighbor[]): void {
  const { fish, phase } = c;
  const cleaning = c.walker.cleaning;
  c.visited =
    cleaning !== undefined &&
    phase.mode === 'marche' &&
    others.length > 0 &&
    walkerCleansAt(cleaning, seed, fish.id, phase.slot)
      ? cleaningTarget(fish, others, cleaning)
      : null;
  c.reached = false;
  c.heading = 0;
  if (c.visited !== null) {
    const dx = c.visited.x - fish.x;
    const dz = c.visited.z - fish.z;
    c.reached = dx * dx + dz * dz <= cleaning!.standoff * cleaning!.standoff;
    c.heading = Math.atan2(dz, dx);
  }
}

/**
 * Vitesse : accélération vive, ralentissement lent (à-coups de la nage). Arrivée sous le
 * poisson approché : elle s'arrête presque (vitesse minimale).
 */
function walkerSpeedInPlace(c: WalkStep): void {
  const { fish, def } = c;
  const speedGoal = c.reached ? def.minSpeed : walkerSpeedGoal(def, c.phase, c.burst);
  const rate = speedGoal > fish.speed ? SPEED_ATTACK : SPEED_RELEASE;
  fish.speed = clamp(
    fish.speed + (speedGoal - fish.speed) * Math.min(1, rate * c.dt),
    def.minSpeed,
    def.maxSpeed,
  );
}

/**
 * Cap : errance, sauf si le fond devant remonte trop (berge), si une vitre approche ou si un
 * obstacle est devant (issue #422) : virage franc du côté le plus dégagé.
 */
function walkerTurnInPlace(c: WalkStep): void {
  const { fish, def, dt } = c;
  const jitter = (random(fish) * 2 - 1) * WANDER_JITTER * def.wanderTurnRate * dt;
  let turn = dampedTurn(fish.turn, WANDER_DAMPING, jitter, dt);
  const reach = def.bodyLength / 2 + Math.max(MIN_PROBE, fish.speed * LOOKAHEAD_SECONDS);
  let yaw = fish.yaw;
  if (isBlockedAhead(c, reach)) {
    const side = clearerSide(c, reach);
    yaw += side * def.avoidTurnRate * dt;
    turn = side * def.wanderTurnRate;
  } else if (c.visited !== null && !c.reached) {
    // Virage vers le poisson approché, borné comme l'évitement ; l'errance reste tirée (un
    // tirage par pas) mais n'est pas appliquée.
    const maxTurn = def.avoidTurnRate * dt;
    yaw += clamp(wrapAngle(c.heading - yaw), -maxTurn, maxTurn);
    turn = 0;
  } else {
    yaw += turn * dt;
  }
  fish.turn = clamp(turn, -def.wanderTurnRate, def.wanderTurnRate);
  fish.yaw = wrapAngle(yaw);
}

/** Vrai si le point à `reach` mètres devant est hors du fond praticable ou trop près d'un obstacle. */
function isBlockedAhead(c: WalkStep, reach: number): boolean {
  const { fish, def } = c;
  const aheadX = fish.x + Math.cos(fish.yaw) * reach;
  const aheadZ = fish.z + Math.sin(fish.yaw) * reach;
  return (
    !walkerCanStand(aheadX, aheadZ, def, c.bounds, c.ground) ||
    obstacleClearance(aheadX, fish.y, aheadZ, c.blockers) < def.wallMargin
  );
}

/** Côté du virage (+1 à gauche, −1 à droite) : le plus dégagé, sinon celui de l'errance. */
function clearerSide(c: WalkStep, reach: number): number {
  const { fish, def, bounds, ground, blockers } = c;
  const yaw = fish.yaw;
  const left = openness(fish, yaw + SIDE_PROBE_ANGLE, reach, def, bounds, ground, blockers);
  const right = openness(fish, yaw - SIDE_PROBE_ANGLE, reach, def, bounds, ground, blockers);
  return left > right ? 1 : left < right ? -1 : fish.turn >= 0 ? 1 : -1;
}

/**
 * Déplacement horizontal, refusé s'il mène hors des bornes, au-dessus d'un fond trop haut ou
 * trop près d'un obstacle (sauf s'il s'en éloigne : un individu né contre un corail repart).
 * Santé basse (issue #208) : pas réduit par `vigor`, exactement 1 à santé pleine.
 */
function walkerStepInPlace(c: WalkStep): void {
  const { fish, def } = c;
  const { hard } = c.bounds;
  const step = fish.speed * c.dt * vigor(fish.health);
  const nx = clamp(fish.x + Math.cos(fish.yaw) * step, hard.minX, hard.maxX);
  const nz = clamp(fish.z + Math.sin(fish.yaw) * step, hard.minZ, hard.maxZ);
  if (
    walkerCanStand(nx, nz, def, c.bounds, c.ground) &&
    clearOfObstacles(fish, nx, nz, def, c.blockers)
  ) {
    fish.x = nx;
    fish.z = nz;
  }
}

/**
 * Hauteur : jamais sous le sol (centre, museau et queue), jamais au-dessus du plafond. Montée
 * ou descente refusée si elle mène dans un obstacle (issue #422) : posée sur un corail qu'elle
 * survolait, la crevette y reste jusqu'à en sortir à l'horizontale.
 */
function walkerHeightInPlace(c: WalkStep): void {
  const { fish, def, ground, blockers } = c;
  c.ceiling = c.bounds.hard.maxY;
  const half = def.bodyLength / 2;
  const cos = Math.cos(fish.yaw) * half;
  const sin = Math.sin(fish.yaw) * half;
  const center = groundHeight(fish.x, fish.z, ground) + c.walker.clearance;
  const ends =
    Math.max(
      groundHeight(fish.x + cos, fish.z + sin, ground),
      groundHeight(fish.x - cos, fish.z - sin, ground),
    ) + c.walker.clearance;
  c.floor = Math.max(c.bounds.hard.minY, center, Math.min(ends, c.ceiling));
  verticalGoalInPlace(c);
  c.vy = clamp((VERTICAL.goal - fish.y) * VERTICAL_GAIN, -VERTICAL.speed, VERTICAL.speed);
  let ny = fish.y + c.vy * c.dt;
  if (blockers.length > 0) {
    const next = obstacleClearance(fish.x, ny, fish.z, blockers);
    if (next < def.wallMargin && next < obstacleClearance(fish.x, fish.y, fish.z, blockers)) {
      ny = fish.y;
    }
  }
  fish.y = clamp(ny, c.floor, c.ceiling);
}

/** Hauteur visée et vitesse verticale maximale du pas (`verticalGoalInPlace`). */
const VERTICAL = { goal: 0, speed: 0 };

/** Hauteur visée et vitesse verticale maximale selon la phase, écrites dans `VERTICAL`. */
function verticalGoalInPlace(c: WalkStep): void {
  const { phase, floor, ceiling } = c;
  switch (phase.mode) {
    case 'marche':
      VERTICAL.goal = floor;
      VERTICAL.speed = SETTLE_VERTICAL;
      break;
    case 'nage':
      VERTICAL.goal = floor + (ceiling - floor) * phase.height;
      VERTICAL.speed = SWIM_VERTICAL;
      break;
    case 'remontee':
      VERTICAL.goal = phase.progress < RISE_SHARE ? ceiling : floor;
      VERTICAL.speed = phase.progress < RISE_SHARE ? c.walker.climbSpeed : SINK_VERTICAL;
      break;
  }
}

/**
 * Inclinaison : celle du déplacement (pente suivie, montée, descente), lissée, bornée par la
 * place autour du corps.
 */
function walkerPitchInPlace(c: WalkStep): void {
  const { fish, def, phase, floor, ceiling } = c;
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
  const half = def.bodyLength / 2;
  const above = (ceiling - fish.y) / half;
  const below = (fish.y - floor) / half;
  const upLimit = Math.min(def.maxPitch, Math.asin(clamp(Math.min(above, below / 2), 0, 1)));
  const downLimit = Math.min(def.maxPitch, Math.asin(clamp(Math.min(below, above / 2), 0, 1)));
  fish.pitch = pitchToward(fish.pitch, fish.pitchTarget, PITCH_RATE * c.dt, -downLimit, upLimit);
}

/**
 * Plus petite distance du point (`x`, `y`, `z`) aux surfaces des obstacles, en mètres
 * (+∞ sans obstacle). Sans allocation.
 */
export function obstacleClearance(
  x: number,
  y: number,
  z: number,
  obstacles: readonly Obstacle[],
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const o of obstacles) {
    best = Math.min(best, obstacleDistance(o, x, y, z, SCRATCH_NORMAL));
  }
  return best;
}

/**
 * Vrai si le pas vers (`nx`, `nz`) laisse le centre à au moins `wallMargin` des obstacles, ou
 * l'en éloigne (individu déjà trop près, qui ne doit pas rester bloqué).
 */
function clearOfObstacles(
  fish: Fish,
  nx: number,
  nz: number,
  def: SpeciesDefinition,
  obstacles: readonly Obstacle[],
): boolean {
  if (obstacles.length === 0) {
    return true;
  }
  const next = obstacleClearance(nx, fish.y, nz, obstacles);
  return next >= def.wallMargin || next >= obstacleClearance(fish.x, fish.y, fish.z, obstacles);
}

/**
 * Profondeur d'eau libre à `reach` mètres dans la direction `yaw` (plafond moins fond plus
 * `clearance`), ou −1 hors des bornes horizontales ou trop près d'un obstacle.
 */
function openness(
  fish: Fish,
  yaw: number,
  reach: number,
  def: SpeciesDefinition,
  bounds: SwimBounds,
  ground: WalkerGround,
  obstacles: readonly Obstacle[],
): number {
  const x = fish.x + Math.cos(yaw) * reach;
  const z = fish.z + Math.sin(yaw) * reach;
  const { hard } = bounds;
  if (x < hard.minX || x > hard.maxX || z < hard.minZ || z > hard.maxZ) {
    return -1;
  }
  if (obstacleClearance(x, fish.y, z, obstacles) < def.wallMargin) {
    return -1;
  }
  return hard.maxY - (groundHeight(x, z, ground) + def.walker!.clearance);
}
