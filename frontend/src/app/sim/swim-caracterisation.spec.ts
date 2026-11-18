import { stepWalker, type WalkerGround } from './axolotl';
import { ENVIRONMENTS } from './environment';
import type { Vec3 } from './flocking';
import { sphereObstacle, type Obstacle } from './obstacles';
import { SPECIES, type SpeciesId } from './species';
import { createFish, stepFish, swimBounds, type Fish, type SwimBounds } from './swimmer';
import { waterVolume } from './tank';

/**
 * Caractérisation de la nage (`stepFish`, `sim/swimmer.ts`) et de la marche sur le fond
 * (`stepWalker`, `sim/axolotl.ts`), lot 3 du chantier #686 : chaque espèce fait 10 000 pas
 * dans deux bacs (boîte avec obstacles, bassin en haricot pour les nageurs ; fond plat avec
 * obstacles et voisins, berge du paludarium pour les marcheurs), avec des entrées qui varient
 * au fil des pas pour passer par toutes les branches : banc, nourriture, repos de nuit,
 * broutage, garde rapprochée, santé basse.
 *
 * L'empreinte d'une espèce couvre l'état complet de l'animal **à chaque pas** : la moindre
 * différence d'un bit sur la trajectoire la change. Les empreintes ont été relevées **avant**
 * le découpage de `stepFish` et `stepWalker` en étapes : elles ne doivent changer que pour un
 * changement de comportement voulu, expliqué dans la PR.
 */

/** Durée maximale d'une espèce (rendu logiciel des machines de CI). */
const TIMEOUT_MS = 60_000;

/** Graine des scénarios, celle des captures. */
const SEED = 42;

/** Nombre de pas par bac. */
const STEPS = 10_000;

/** Pas fixe de la simulation. */
const DT = 1 / 60;

/** Empreinte attendue de chaque espèce (deux bacs enchaînés), amphibiens exclus. */
const EXPECTED: Partial<Record<SpeciesId, string>> = {
  ancistrus: '0dc0c362df906e',
  axolotl: '15fd8dbf1a73ea',
  blennie: '1be3d15fa30388',
  braise: '0493403b2633d5',
  cerise: '1056e9e96a5c9f',
  chirurgien: '07faa6530ab124',
  chromis: '1795f4c7ea5f12',
  clown: '19ffc3528753b8',
  corydora: '0c44f6812a4ccc',
  crevette: '1b33f8c8cb7e22',
  danio: '05784e0842ff24',
  gobie: '14394d457ec3eb',
  gourami: '1672ffa9aaa790',
  gramma: '04980d858133e5',
  guppy: '195ae46d5f3bfc',
  koi: '1f3ddba063d189',
  kuhli: '0400014b82a985',
  miel: '183c8270103d3c',
  molly: '1aea2c81959577',
  neon: '020594a4491c54',
  neritine: '016a082e6b59e6',
  otocinclus: '0bb0d2d541358d',
  platy: '110fda34e0c760',
  rasbora: '0137057871e1ba',
  rouge: '15685c0344bfbf',
  tetra: '1f490d5d08382d',
  xipho: '0d9793c094bb0d',
};

/** Hachage cyrb53 incrémental (53 bits), comme `non-regression.spec.ts`. */
class Hash {
  private h1 = 0xdeadbeef;
  private h2 = 0x41c6ce57;

  add(text: string): void {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      this.h1 = Math.imul(this.h1 ^ c, 2654435761);
      this.h2 = Math.imul(this.h2 ^ c, 1597334677);
    }
  }

  digest(): string {
    let h1 = this.h1;
    let h2 = this.h2;
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Obstacles d'un bac : rocher au centre, union de deux sphères, galet près d'une vitre. */
function obstaclesIn(water: ReturnType<typeof waterVolume>): Obstacle[] {
  const midY = water.minY + 0.03;
  return [
    sphereObstacle(1, 0, midY, 0, 0.06),
    {
      id: 2,
      shape: 'spheres',
      spheres: [
        { x: -0.2, y: midY, z: 0.05, radius: 0.04 },
        { x: -0.16, y: midY + 0.03, z: 0.05, radius: 0.035 },
      ],
    },
    { id: 3, shape: 'box', x: 0.25, y: midY, z: -0.06, halfX: 0.04, halfY: 0.03, halfZ: 0.03 },
  ];
}

/** Entrées de la nage au pas `k` : périodes de banc, de nourriture, de nuit, de broutage. */
interface SwimInputs {
  steer: Vec3;
  food: Vec3 | null;
  rest: number;
  hugWalls: boolean;
  closeAvoid: boolean;
  health: number;
}

const STEER: Vec3 = { x: 0, y: 0, z: 0 };
const FOOD: Vec3 = { x: 0, y: 0, z: 0 };

function swimInputs(k: number, bounds: SwimBounds): SwimInputs {
  const { hard } = bounds;
  const school = k % 1_200 < 400;
  STEER.x = school ? 0.3 * Math.sin(k / 50) : 0;
  STEER.y = school ? 0.1 * Math.cos(k / 70) : 0;
  STEER.z = school ? 0.3 * Math.cos(k / 40) : 0;
  const feeding = k % 2_000 >= 600 && k % 2_000 < 1_100;
  const spot = Math.floor(k / 2_000) % 3;
  FOOD.x = spot === 0 ? hard.maxX : spot === 1 ? 0.04 : -0.1;
  FOOD.y = spot === 2 ? hard.minY : (hard.minY + hard.maxY) / 2;
  FOOD.z = spot === 1 ? 0.07 : 0;
  const rest = k >= 5_000 && k < 7_000 ? 0.7 : k >= 7_000 && k < 7_500 ? 1 : 0;
  return {
    steer: STEER,
    food: feeding ? FOOD : null,
    rest,
    hugWalls: k % 3_000 >= 800 && k % 3_000 < 1_000,
    closeAvoid: k % 2_500 >= 900 && k % 2_500 < 1_100,
    health: k >= 8_000 && k < 9_000 ? 0.5 : 1,
  };
}

/**
 * Perturbations forcées : poisson posé dans le rocher (filet de sécurité), longue remontée
 * d'une espèce de fond (fin de remontée à la surface).
 */
function perturbInPlace(fish: Mutable<Fish>, k: number, obstacles: readonly Obstacle[]): void {
  const rock = obstacles[0];
  if (k % 1_700 === 1_699 && rock.shape === 'sphere') {
    fish.x = rock.x + 0.01;
    fish.y = rock.y + 0.02;
    fish.z = rock.z + 0.01;
  }
  if (k === 2_500 && SPECIES[fish.species].depth !== undefined) {
    fish.ascent = 60;
  }
}

function swim(hash: Hash, species: SpeciesId, bounds: SwimBounds, obstacles: Obstacle[]): void {
  const fish = createFish(SEED, 7, species, bounds, obstacles) as Mutable<Fish>;
  for (let k = 0; k < STEPS; k++) {
    const input = swimInputs(k, bounds);
    fish.health = input.health;
    perturbInPlace(fish, k, obstacles);
    const { steer } = input;
    stepFish(
      fish,
      DT,
      bounds,
      steer.x,
      steer.y,
      steer.z,
      obstacles,
      input.food,
      input.rest,
      input.hugWalls,
      input.closeAvoid,
    );
    hash.add(JSON.stringify(fish));
  }
}

/** Voisins d'un marcheur : poissons bas qui passent au-dessus de lui (approche, #656). */
function neighbors(k: number, water: ReturnType<typeof waterVolume>): Fish[] {
  const bounds = swimBounds(SPECIES.neon, water);
  const near = createFish(SEED, 11, 'neon', bounds) as Mutable<Fish>;
  near.x = 0.2 * Math.cos(k / 300);
  near.y = water.minY + 0.05;
  near.z = 0.1 * Math.sin(k / 300);
  const high = createFish(SEED, 12, 'neon', bounds) as Mutable<Fish>;
  high.y = water.maxY;
  return [near, high];
}

function walk(hash: Hash, species: SpeciesId, ground: WalkerGround, obstacles: Obstacle[]): void {
  const bounds = swimBounds(SPECIES[species], ground.water);
  const fish = createFish(SEED, 7, species, bounds, obstacles) as Mutable<Fish>;
  for (let k = 0; k < STEPS; k++) {
    fish.health = k >= 8_000 && k < 9_000 ? 0.5 : 1;
    const others = k % 4 === 0 ? neighbors(k, ground.water) : [];
    stepWalker(fish, DT, SEED, (k + 1) * DT, bounds, ground, obstacles, others);
    hash.add(JSON.stringify(fish));
  }
}

function fingerprint(species: SpeciesId): string {
  const hash = new Hash();
  const tank = waterVolume();
  const tankObstacles = obstaclesIn(tank);
  if (SPECIES[species].walker !== undefined) {
    walk(hash, species, { water: tank, terrain: null }, tankObstacles);
    const palu = ENVIRONMENTS.paludarium;
    const paluWater = waterVolume(palu.dimensions, palu.waterLevel);
    walk(hash, species, { water: paluWater, terrain: palu.terrain }, []);
    return hash.digest();
  }
  swim(hash, species, swimBounds(SPECIES[species], tank), tankObstacles);
  const pond = waterVolume(ENVIRONMENTS.bassin.dimensions, ENVIRONMENTS.bassin.waterLevel);
  swim(hash, species, swimBounds(SPECIES[species], pond, 'haricot'), obstaclesIn(pond));
  return hash.digest();
}

const SWIMMING = (Object.keys(SPECIES) as SpeciesId[]).filter(
  (id) => SPECIES[id].amphibian === undefined,
);

describe('caractérisation de la nage et de la marche (lot 3, #686)', () => {
  it('couvre toutes les espèces qui nagent ou marchent', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...SWIMMING].sort());
  });

  for (const species of SWIMMING) {
    it(
      `${species} : trajectoire de 10 000 pas identique au bit près`,
      () => {
        expect(fingerprint(species)).toBe(EXPECTED[species]);
      },
      TIMEOUT_MS,
    );
  }
});
