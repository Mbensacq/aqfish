import { prngNextState, prngOutput, deriveSeed } from '../core/random/prng';
import { shrinkBox, type Box3 } from './tank';
import { SPECIES, type SpeciesDefinition, type SpeciesId } from './species';

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
  /** En dehors de cette boîte (plus intérieure), le poisson vire pour revenir vers le centre. */
  readonly soft: Box3;
}

const TWO_PI = Math.PI * 2;
const UINT32_RANGE = 4294967296;

/** Épaisseur de la zone d'évitement, à l'intérieur de la zone interdite (approximation de jeu). */
const AVOID_ZONE = 0.08;
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

/** Bornes de nage d'une espèce dans un volume d'eau donné. */
export function swimBounds(def: SpeciesDefinition, water: Box3): SwimBounds {
  const hard = shrinkBox(water, def.wallMargin);
  return { hard, soft: shrinkBox(hard, AVOID_ZONE) };
}

/**
 * Crée un poisson à une position et un cap tirés de son propre sous-générateur
 * (`deriveSeed(seed, id)`) : ajouter un poisson ne change pas les autres.
 */
export function createFish(seed: number, id: number, species: SpeciesId, bounds: SwimBounds): Fish {
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
    rng: deriveSeed(seed, id),
    px: 0,
    py: 0,
    pz: 0,
    pyaw: 0,
    ppitch: 0,
    pphase: 0,
  };
  const { soft } = bounds;
  fish.x = lerp(soft.minX, soft.maxX, random(fish));
  fish.y = lerp(soft.minY, soft.maxY, random(fish));
  fish.z = lerp(soft.minZ, soft.maxZ, random(fish));
  fish.yaw = wrapAngle(random(fish) * TWO_PI);
  fish.phase = random(fish) * TWO_PI;
  fish.speed = lerp(def.minSpeed, def.maxSpeed, 0.25 + 0.5 * random(fish));
  savePrevious(fish);
  return fish;
}

/**
 * Fait nager un poisson pendant `dt` secondes, **en place** (aucune allocation) :
 * errance douce, évitement des parois, du fond et de la surface, vitesse bornée.
 * Garanties : le centre reste dans `bounds.hard` ; `speed` ∈ [minSpeed, maxSpeed] ;
 * `|pitch|` ≤ maxPitch ; le déplacement d'un pas ne dépasse jamais `maxSpeed · dt`.
 */
export function stepFish(fish: Mutable<Fish>, dt: number, bounds: SwimBounds): void {
  const def = SPECIES[fish.species];
  const { hard, soft } = bounds;
  savePrevious(fish);

  // Vitesse : petite marche aléatoire rappelée vers la vitesse de croisière.
  const speed =
    fish.speed +
    (random(fish) * 2 - 1) * SPEED_JITTER * def.cruiseSpeed * dt +
    (def.cruiseSpeed - fish.speed) * SPEED_RECALL * dt;
  fish.speed = clamp(speed, def.minSpeed, def.maxSpeed);

  // Cap : errance (vitesse de virage en marche aléatoire amortie), sauf près d'une paroi.
  const wanderJitter = (random(fish) * 2 - 1) * WANDER_JITTER * def.wanderTurnRate * dt;
  fish.turn = clamp(
    fish.turn * (1 - WANDER_DAMPING * dt) + wanderJitter,
    -def.wanderTurnRate,
    def.wanderTurnRate,
  );
  const lookahead = Math.max(MIN_LOOKAHEAD, fish.speed * LOOKAHEAD_SECONDS);
  const aheadX = fish.x + Math.cos(fish.yaw) * lookahead;
  const aheadZ = fish.z + Math.sin(fish.yaw) * lookahead;
  if (aheadX < soft.minX || aheadX > soft.maxX || aheadZ < soft.minZ || aheadZ > soft.maxZ) {
    const centerX = (soft.minX + soft.maxX) / 2;
    const centerZ = (soft.minZ + soft.maxZ) / 2;
    const desired = Math.atan2(centerZ - fish.z, centerX - fish.x);
    const maxTurn = def.avoidTurnRate * dt;
    fish.yaw = wrapAngle(fish.yaw + clamp(wrapAngle(desired - fish.yaw), -maxTurn, maxTurn));
    fish.turn *= 1 - WANDER_DAMPING * dt;
  } else {
    fish.yaw = wrapAngle(fish.yaw + fish.turn * dt);
  }

  // Inclinaison : errance lente, ou évitement du fond et de la surface.
  const wanderPitch = def.maxPitch * WANDER_PITCH_RATIO;
  fish.pitchTarget = clamp(
    fish.pitchTarget + (random(fish) * 2 - 1) * PITCH_JITTER * def.maxPitch * dt,
    -wanderPitch,
    wanderPitch,
  );
  let pitchGoal = fish.pitchTarget;
  if (fish.y < soft.minY) {
    pitchGoal = def.maxPitch * AVOID_PITCH_RATIO;
  } else if (fish.y > soft.maxY) {
    pitchGoal = -def.maxPitch * AVOID_PITCH_RATIO;
  }
  const maxPitchStep = PITCH_RATE * dt;
  fish.pitch = clamp(
    fish.pitch + clamp(pitchGoal - fish.pitch, -maxPitchStep, maxPitchStep),
    -def.maxPitch,
    def.maxPitch,
  );

  // Déplacement, puis filet de sécurité : la projection sur la boîte (convexe, contenant la
  // position précédente) ne peut que raccourcir le déplacement.
  const distance = fish.speed * dt;
  const horizontal = Math.cos(fish.pitch) * distance;
  fish.x = clamp(fish.x + Math.cos(fish.yaw) * horizontal, hard.minX, hard.maxX);
  fish.y = clamp(fish.y + Math.sin(fish.pitch) * distance, hard.minY, hard.maxY);
  fish.z = clamp(fish.z + Math.sin(fish.yaw) * horizontal, hard.minZ, hard.maxZ);

  // Battement de queue : plus rapide quand le poisson nage plus vite.
  const beat = TWO_PI * def.tailBeatFrequency * (fish.speed / def.cruiseSpeed) * dt;
  fish.phase = (fish.phase + beat) % TWO_PI;
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

function savePrevious(fish: Mutable<Fish>): void {
  fish.px = fish.x;
  fish.py = fish.y;
  fish.pz = fish.z;
  fish.pyaw = fish.yaw;
  fish.ppitch = fish.pitch;
  fish.pphase = fish.phase;
}

/** Prochain réel uniforme dans [0, 1) du sous-générateur du poisson. */
function random(fish: Mutable<Fish>): number {
  fish.rng = prngNextState(fish.rng);
  return prngOutput(fish.rng) / UINT32_RANGE;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
