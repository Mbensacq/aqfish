import { assertSeed, deriveSeed, prngOutput } from '../core/random/prng';
import { groundHeight, type WalkerGround } from './axolotl';
import { growHunger } from './feeding';
import { obstacleDistance, type Obstacle } from './obstacles';
import { SPECIES, type AmphibianParams, type SpeciesDefinition, type SpeciesId } from './species';
import { createFish, random, savePrevious, wrapAngle, type Fish, type SwimBounds } from './swimmer';
import { tailBeatRate } from './undulation';

/**
 * Déplacement des espèces qui vivent entre terre et eau (grenouille, issue #131, ADR 0036) :
 * à la place de la nage des poissons, une machine à cinq états.
 *
 * - **posée** : immobile sur la terre émergée, à `clearance` au-dessus du sol ;
 * - **saut** : parabole d'un point de la terre à un autre (`hopArc`) ;
 * - **entrée** : saut dont le point d'arrivée est dans l'eau ;
 * - **nage** : près de la surface, dans l'eau, sans jamais remonter sur la terre ;
 * - **sortie** : nage vers la berge (−X, côté terre du paludarium, `sim/terrain.ts`), puis
 *   montée le long du sol jusqu'à la terre émergée.
 *
 * L'état se lit sur l'entité, sans champ nouveau (la sauvegarde, ADR 0028, ne change pas) :
 * `ascent` > 0 pendant un saut (temps restant ; `speed` porte la portée, `yaw` la direction),
 * sinon la nature du sol sous le centre (terre émergée ou eau) et le milieu voulu
 * (`wantsWater`, fonction pure de la graine, de l'identifiant et du temps). Les sauts partent
 * au début de créneaux de `hopSlot` secondes (décalés par individu), tirés d'un hachage.
 *
 * Hauteur hors saut : `restHeight`, continue en tout point (au rivage, le sol est au niveau de
 * l'eau des deux côtés) : le franchissement du rivage, à la nage comme en marchant, est donc
 * continu. Bornes garanties à chaque pas : centre dans `bounds.hard` (vitres moins
 * `wallMargin`, surface plus `maxRise`) et au-dessus du sol plus `clearance`.
 */

/** État de comportement d'une espèce amphibie. */
export type FrogMode = 'posee' | 'saut' | 'entree' | 'nage' | 'sortie';

/** Milieu exigé au point d'arrivée d'un saut. */
export type HopLanding = 'terre' | 'libre';

const UINT32_RANGE = 4294967296;
const TWO_PI = Math.PI * 2;

/** Sels des tirages (flux séparés du sous-générateur de l'entité et de ceux de l'axolotl). */
const CYCLE_SALT = 0x3c6ef372;
const HOP_SALT = 0xa54ff53a;
const DIRECTION_SALT = 0x510e527f;
const RANGE_SALT = 0x9b05688c;

/** Nombre de points vérifiés le long d'un saut avant de le lancer. */
export const HOP_SAMPLES = 16;
/** Écart des directions de repli d'un saut refusé, en radians. */
const HOP_FALLBACK_ANGLE = 0.6;
/** Nombre de directions essayées de chaque côté de la direction voulue. */
const HOP_FALLBACK_STEPS = 3;
/** Écart maximal de la direction d'un saut vers l'eau autour de +X, en radians. */
const WATER_HOP_SPREAD = 0.5;
/** Errance du cap à la nage (comme les poissons, plus calme). */
const WANDER_JITTER = 4;
const WANDER_DAMPING = 0.5;
/** Prospection devant la grenouille qui nage : en secondes de déplacement. */
const LOOKAHEAD_SECONDS = 1.5;
/** Angle des sondes latérales qui choisissent le côté du virage, en radians. */
const SIDE_PROBE_ANGLE = 0.8;
/** Vitesse de retour à plat de l'inclinaison hors saut, en rad/s. */
const PITCH_RATE = 3;
/** Nombre de tirages de la position de naissance sur la terre émergée. */
const MAX_SPAWN_TRIES = 32;
/** Grille de repli de la naissance (points par axe). */
const SPAWN_GRID = 9;
/** Normale de travail des distances aux obstacles (aucune allocation). */
const SCRATCH_NORMAL = { x: 0, y: 0, z: 0 };

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function assertTime(time: number): void {
  if (!(time >= 0) || !Number.isFinite(time)) {
    throw new RangeError(`time doit être un réel positif ou nul (reçu : ${time})`);
  }
}

/**
 * Vrai si l'individu `id` veut être dans l'eau au temps `time` : le temps est découpé en
 * cycles de `cycleDuration` secondes, décalés d'une fraction propre à l'individu ; la
 * dernière part `waterShare` de chaque cycle est dans l'eau. Fonction pure.
 * @throws RangeError si la graine ou l'identifiant n'est pas un entier 32 bits non signé, ou
 * si `time` n'est pas un réel positif ou nul.
 */
export function wantsWater(
  params: AmphibianParams,
  seed: number,
  id: number,
  time: number,
): boolean {
  assertTime(time);
  const offset = deriveSeed((assertSeed(seed) ^ CYCLE_SALT) >>> 0, id) / UINT32_RANGE;
  const position = time / params.cycleDuration + offset;
  return position - Math.floor(position) >= 1 - params.waterShare;
}

/**
 * Numéro du créneau de saut de l'individu `id` au temps `time` (créneaux de `hopSlot`
 * secondes, décalés par individu). Un saut ne peut partir qu'au pas où ce numéro change.
 * @throws RangeError comme `wantsWater`.
 */
export function hopSlotAt(params: AmphibianParams, seed: number, id: number, time: number): number {
  assertTime(time);
  const offset = deriveSeed((assertSeed(seed) ^ HOP_SALT) >>> 0, id) / UINT32_RANGE;
  return Math.floor(time / params.hopSlot + offset);
}

/** Tirages d'un créneau de saut, dans [0, 1[ : chance, direction et portée. */
export interface HopDraw {
  chance: number;
  direction: number;
  range: number;
}

/** Tirages du créneau `slot` de l'individu `id` (fonction pure ; écrit dans `out`). */
export function hopDrawAt(
  seed: number,
  id: number,
  slot: number,
  out: HopDraw = { chance: 0, direction: 0, range: 0 },
): HopDraw {
  const individual = deriveSeed((assertSeed(seed) ^ HOP_SALT) >>> 0, id);
  const hash = deriveSeed(individual, slot >>> 0);
  out.chance = hash / UINT32_RANGE;
  out.direction = prngOutput((hash ^ DIRECTION_SALT) >>> 0) / UINT32_RANGE;
  out.range = prngOutput((hash ^ RANGE_SALT) >>> 0) / UINT32_RANGE;
  return out;
}

/** Vrai si le sol en (x, z) est émergé (terre ou roche : au niveau de l'eau ou au-dessus). */
export function isOnLand(x: number, z: number, ground: WalkerGround): boolean {
  return ground.terrain !== null && groundHeight(x, z, ground) >= ground.water.maxY;
}

/**
 * Hauteur du centre hors saut en (x, z) : sur la terre, le sol plus `clearance` ; dans l'eau,
 * la surface moins `floatDepth`, mais jamais moins que le sol plus `clearance` (eau peu
 * profonde du rivage). Continue en tout point : au rivage, le sol est au niveau de l'eau.
 */
export function restHeight(
  x: number,
  z: number,
  params: AmphibianParams,
  ground: WalkerGround,
): number {
  const floor = groundHeight(x, z, ground) + params.clearance;
  return isOnLand(x, z, ground) ? floor : Math.max(ground.water.maxY - params.floatDepth, floor);
}

/**
 * Hauteur d'un saut à l'avancement `s` ∈ [0, 1] : la corde de `y0` à `y1`, plus une
 * parabole de hauteur `height` au milieu (nulle aux deux bouts). Fonction pure.
 */
export function hopArc(y0: number, y1: number, height: number, s: number): number {
  return y0 + (y1 - y0) * s + 4 * height * s * (1 - s);
}

/**
 * Vrai si un saut de `range` mètres dans la direction `yaw`, depuis le point (x, z) au repos,
 * est possible : tous les points vérifiés (`HOP_SAMPLES`) restent dans les bornes, au-dessus
 * du sol plus `clearance` et sous `bounds.hard.maxY`, et l'arrivée est sur la terre émergée
 * si `landing` vaut `'terre'`.
 */
export function canHop(
  x: number,
  z: number,
  yaw: number,
  range: number,
  landing: HopLanding,
  params: AmphibianParams,
  bounds: SwimBounds,
  ground: WalkerGround,
): boolean {
  const { hard } = bounds;
  const dx = Math.cos(yaw) * range;
  const dz = Math.sin(yaw) * range;
  const x1 = x + dx;
  const z1 = z + dz;
  if (x1 < hard.minX || x1 > hard.maxX || z1 < hard.minZ || z1 > hard.maxZ) {
    return false;
  }
  if (landing === 'terre' && !isOnLand(x1, z1, ground)) {
    return false;
  }
  const y0 = restHeight(x, z, params, ground);
  const y1 = restHeight(x1, z1, params, ground);
  for (let k = 1; k <= HOP_SAMPLES; k++) {
    const s = k / HOP_SAMPLES;
    const px = x + dx * s;
    const pz = z + dz * s;
    const y = hopArc(y0, y1, params.hopHeight, s);
    if (y < groundHeight(px, pz, ground) + params.clearance - 1e-9 || y > hard.maxY) {
      return false;
    }
  }
  return true;
}

/**
 * Mode de comportement d'un individu (voir l'en-tête du module) : lu sur l'entité, le sol et
 * le milieu voulu à l'instant `time`.
 */
export function frogModeOf(fish: Fish, seed: number, time: number, ground: WalkerGround): FrogMode {
  const params = SPECIES[fish.species].amphibian!;
  if (fish.ascent > 0) {
    const left = fish.speed * fish.ascent;
    const x1 = fish.x + Math.cos(fish.yaw) * left;
    const z1 = fish.z + Math.sin(fish.yaw) * left;
    return isOnLand(x1, z1, ground) ? 'saut' : 'entree';
  }
  if (isOnLand(fish.x, fish.z, ground)) {
    return 'posee';
  }
  return wantsWater(params, seed, fish.id, time) ? 'nage' : 'sortie';
}

/**
 * Crée un individu d'une espèce amphibie : comme un poisson (`createFish`, même
 * sous-générateur, même tirage du cap), puis posé sur la terre émergée, à un point tiré (au
 * plus `MAX_SPAWN_TRIES` tirages, puis le premier point émergé d'une grille ; sans terre, au
 * centre du bac, dans l'eau), à au moins `wallMargin` des obstacles.
 * @throws RangeError si l'espèce n'est pas amphibie.
 */
export function createFrog(
  seed: number,
  id: number,
  species: SpeciesId,
  bounds: SwimBounds,
  ground: WalkerGround,
  obstacles: readonly Obstacle[] = [],
): Fish {
  const def = SPECIES[species];
  const params = def.amphibian;
  if (params === undefined) {
    throw new RangeError(`l’espèce ${species} n’est pas amphibie`);
  }
  const fish = createFish(seed, id, species, bounds, obstacles) as Mutable<Fish>;
  const { hard } = bounds;
  const fits = () => {
    if (!isOnLand(fish.x, fish.z, ground)) {
      return false;
    }
    fish.y = restHeight(fish.x, fish.z, params, ground);
    return (
      fish.y <= hard.maxY &&
      obstacles.every(
        (o) => obstacleDistance(o, fish.x, fish.y, fish.z, SCRATCH_NORMAL) >= def.wallMargin,
      )
    );
  };
  let placed = fits();
  for (let attempt = 0; attempt < MAX_SPAWN_TRIES && !placed; attempt++) {
    fish.x = hard.minX + (hard.maxX - hard.minX) * random(fish);
    fish.z = hard.minZ + (hard.maxZ - hard.minZ) * random(fish);
    placed = fits();
  }
  if (!placed) {
    placeOnGrid(fish, bounds, ground);
  }
  fish.y = clamp(restHeight(fish.x, fish.z, params, ground), hard.minY, hard.maxY);
  fish.pitch = 0;
  fish.pitchTarget = 0;
  fish.turn = 0;
  fish.ascent = 0;
  fish.speed = def.minSpeed;
  savePrevious(fish);
  return fish;
}

function placeOnGrid(fish: Mutable<Fish>, bounds: SwimBounds, ground: WalkerGround): void {
  const { hard } = bounds;
  fish.x = (hard.minX + hard.maxX) / 2;
  fish.z = (hard.minZ + hard.maxZ) / 2;
  for (let i = 0; i < SPAWN_GRID; i++) {
    for (let j = 0; j < SPAWN_GRID; j++) {
      const x = hard.minX + ((hard.maxX - hard.minX) * i) / (SPAWN_GRID - 1);
      const z = hard.minZ + ((hard.maxZ - hard.minZ) * j) / (SPAWN_GRID - 1);
      if (isOnLand(x, z, ground)) {
        fish.x = x;
        fish.z = z;
        return;
      }
    }
  }
}

const DRAW: HopDraw = { chance: 0, direction: 0, range: 0 };

/**
 * Fait avancer un individu amphibie de `dt` secondes, **en place** (aucune allocation), au
 * temps simulé `time` (fin du pas). Un tirage de son sous-générateur par pas de nage
 * (errance du cap) ; aucun à terre ni en saut.
 *
 * Garanties (voir l'en-tête du module) : centre dans `bounds.hard` et au-dessus du sol plus
 * `clearance` ; `speed` ∈ [minSpeed, maxSpeed] ; `|pitch|` ≤ maxPitch ; `ascent` ∈
 * [0, hopDuration].
 * @throws RangeError si `dt` n'est pas un réel strictement positif.
 */
export function stepFrog(
  fish: Mutable<Fish>,
  dt: number,
  seed: number,
  time: number,
  bounds: SwimBounds,
  ground: WalkerGround,
): void {
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new RangeError(`dt doit être un réel strictement positif (reçu : ${dt})`);
  }
  const def = SPECIES[fish.species];
  const params = def.amphibian!;
  savePrevious(fish);
  fish.hunger = growHunger(fish.hunger, def, dt);

  if (fish.ascent <= 0 && isOnLand(fish.x, fish.z, ground)) {
    maybeStartHop(fish, def, params, dt, seed, time, bounds, ground);
  }
  if (fish.ascent > 0) {
    stepHop(fish, def, params, dt, bounds, ground);
  } else if (isOnLand(fish.x, fish.z, ground)) {
    // Posée : immobile, à plat, pattes repliées.
    fish.speed = def.minSpeed;
    fish.turn = 0;
    fish.y = clamp(restHeight(fish.x, fish.z, params, ground), bounds.hard.minY, bounds.hard.maxY);
    settlePitch(fish, dt);
  } else {
    stepSwim(fish, def, params, dt, wantsWater(params, seed, fish.id, time), bounds, ground);
  }
}

/** Au pas où un créneau de saut commence, lance un saut si le tirage et le terrain le permettent. */
function maybeStartHop(
  fish: Mutable<Fish>,
  def: SpeciesDefinition,
  params: AmphibianParams,
  dt: number,
  seed: number,
  time: number,
  bounds: SwimBounds,
  ground: WalkerGround,
): void {
  const slot = hopSlotAt(params, seed, fish.id, time);
  if (slot === hopSlotAt(params, seed, fish.id, Math.max(0, time - dt))) {
    return;
  }
  const draw = hopDrawAt(seed, fish.id, slot, DRAW);
  const toWater = wantsWater(params, seed, fish.id, time);
  if (!toWater && draw.chance >= params.hopChance) {
    return;
  }
  // Vers l'eau : vers +X (côté eau du paludarium), à peu près ; à terre : n'importe où.
  const base = toWater
    ? (draw.direction * 2 - 1) * WATER_HOP_SPREAD
    : fish.yaw + (draw.direction * 2 - 1) * Math.PI;
  const landing: HopLanding = toWater ? 'libre' : 'terre';
  const ranges = [
    params.hopMinRange + (params.hopMaxRange - params.hopMinRange) * draw.range,
    params.hopMinRange,
  ];
  for (const range of ranges) {
    for (let k = 0; k <= 2 * HOP_FALLBACK_STEPS; k++) {
      // 0, +1, −1, +2, −2… pas de côté autour de la direction voulue.
      const offset = (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * HOP_FALLBACK_ANGLE;
      const yaw = wrapAngle(base + offset);
      if (canHop(fish.x, fish.z, yaw, range, landing, params, bounds, ground)) {
        fish.yaw = yaw;
        fish.turn = 0;
        fish.speed = clamp(range / params.hopDuration, def.minSpeed, def.maxSpeed);
        fish.ascent = params.hopDuration;
        return;
      }
    }
  }
}

/** Un pas de saut : position sur la parabole, reconstruite depuis l'entité (ADR 0036). */
function stepHop(
  fish: Mutable<Fish>,
  def: SpeciesDefinition,
  params: AmphibianParams,
  dt: number,
  bounds: SwimBounds,
  ground: WalkerGround,
): void {
  const { hard } = bounds;
  const duration = params.hopDuration;
  const range = fish.speed * duration;
  const cos = Math.cos(fish.yaw);
  const sin = Math.sin(fish.yaw);
  const before = 1 - fish.ascent / duration;
  const x0 = fish.x - cos * range * before;
  const z0 = fish.z - sin * range * before;
  const x1 = x0 + cos * range;
  const z1 = z0 + sin * range;
  fish.ascent = Math.max(0, fish.ascent - dt);
  const s = 1 - fish.ascent / duration;
  fish.x = clamp(x0 + cos * range * s, hard.minX, hard.maxX);
  fish.z = clamp(z0 + sin * range * s, hard.minZ, hard.maxZ);
  const y0 = restHeight(x0, z0, params, ground);
  const y1 = restHeight(x1, z1, params, ground);
  const y =
    fish.ascent === 0
      ? restHeight(fish.x, fish.z, params, ground)
      : hopArc(y0, y1, params.hopHeight, s);
  const floor = groundHeight(fish.x, fish.z, ground) + params.clearance;
  fish.y = clamp(Math.max(y, floor), hard.minY, hard.maxY);
  // Inclinaison : la pente de la parabole (museau levé à l'envol, baissé à l'arrivée).
  const slope = y1 - y0 + 4 * params.hopHeight * (1 - 2 * s);
  fish.pitchTarget = clamp(Math.atan2(slope, range), -def.maxPitch, def.maxPitch);
  fish.pitch = fish.ascent === 0 ? 0 : fish.pitchTarget;
  if (fish.ascent === 0) {
    fish.pitchTarget = 0;
    fish.speed = def.minSpeed;
  }
  // Pattes arrière : détente pendant le saut.
  fish.phase = (fish.phase + tailBeatRate(def, def.cruiseSpeed) * dt) % TWO_PI;
}

/** Un pas de nage : errance dans l'eau (`nage`) ou cap vers la berge (`sortie`). */
function stepSwim(
  fish: Mutable<Fish>,
  def: SpeciesDefinition,
  params: AmphibianParams,
  dt: number,
  toWater: boolean,
  bounds: SwimBounds,
  ground: WalkerGround,
): void {
  const { hard } = bounds;
  fish.speed = params.swimSpeed;
  let turn =
    fish.turn * (1 - WANDER_DAMPING * dt) +
    (random(fish) * 2 - 1) * WANDER_JITTER * def.wanderTurnRate * dt;
  let yaw = fish.yaw;
  if (!toWater) {
    // Sortie : virage vers −X (la berge), puis droit devant.
    const error = wrapAngle(Math.PI - yaw);
    yaw += clamp(error, -def.avoidTurnRate * dt, def.avoidTurnRate * dt);
    turn = 0;
  } else {
    const reach = def.bodyLength / 2 + fish.speed * LOOKAHEAD_SECONDS;
    if (!canSwim(fish.x + Math.cos(yaw) * reach, fish.z + Math.sin(yaw) * reach, bounds, ground)) {
      const left = canSwim(
        fish.x + Math.cos(yaw + SIDE_PROBE_ANGLE) * reach,
        fish.z + Math.sin(yaw + SIDE_PROBE_ANGLE) * reach,
        bounds,
        ground,
      );
      const right = canSwim(
        fish.x + Math.cos(yaw - SIDE_PROBE_ANGLE) * reach,
        fish.z + Math.sin(yaw - SIDE_PROBE_ANGLE) * reach,
        bounds,
        ground,
      );
      const side = left && !right ? 1 : right && !left ? -1 : fish.turn >= 0 ? 1 : -1;
      yaw += side * def.avoidTurnRate * dt;
      turn = side * def.wanderTurnRate;
    } else {
      yaw += turn * dt;
    }
  }
  fish.turn = clamp(turn, -def.wanderTurnRate, def.wanderTurnRate);
  fish.yaw = wrapAngle(yaw);

  // Pas horizontal : à la nage, refusé s'il mène sur la terre ; à la sortie, toujours fait
  // (la grenouille monte le long du sol).
  const step = fish.speed * dt;
  const nx = clamp(fish.x + Math.cos(fish.yaw) * step, hard.minX, hard.maxX);
  const nz = clamp(fish.z + Math.sin(fish.yaw) * step, hard.minZ, hard.maxZ);
  if (!toWater || !isOnLand(nx, nz, ground)) {
    fish.x = nx;
    fish.z = nz;
  }
  fish.y = clamp(restHeight(fish.x, fish.z, params, ground), hard.minY, hard.maxY);
  settlePitch(fish, dt);
  fish.phase = (fish.phase + tailBeatRate(def, fish.speed) * dt) % TWO_PI;
}

/** Vrai si le point (x, z) est dans les bornes horizontales et dans l'eau. */
function canSwim(x: number, z: number, bounds: SwimBounds, ground: WalkerGround): boolean {
  const { hard } = bounds;
  return (
    x >= hard.minX && x <= hard.maxX && z >= hard.minZ && z <= hard.maxZ && !isOnLand(x, z, ground)
  );
}

function settlePitch(fish: Mutable<Fish>, dt: number): void {
  fish.pitchTarget = 0;
  const maxStep = PITCH_RATE * dt;
  fish.pitch -= clamp(fish.pitch, -maxStep, maxStep);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
