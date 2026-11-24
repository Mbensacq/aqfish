import { createFeeder } from './auto-feeder';
import { DEFAULT_DAY_CLOCK } from './daylight';
import {
  advance,
  broodWorldInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  dropsyWorldInPlace,
  feedInPlace,
  fungusWorldInPlace,
  infectWorldInPlace,
  killWorldAnimalInPlace,
  layEggsWorldInPlace,
  rotWorldFinsInPlace,
  setWorldCurrentInPlace,
  setWorldFeederInPlace,
  setWorldLightingInPlace,
  setWorldMortalityInPlace,
  starveWorldInPlace,
  step,
  velvetWorldInPlace,
} from './world';
import type { MutableWorld, World } from './world-types';

/**
 * Caractérisation du pas de simulation (`stepInPlace`, `sim/world.ts`), lot 2 du chantier
 * #686 : chaque scénario fait passer le pas par des branches que les empreintes de
 * `non-regression.spec.ts` (bacs par défaut) n'atteignent pas : mode décor, distributeur,
 * courant, espèces incompatibles, alevins, œufs, maladies, mortalité et corps, algues, pas
 * libre. Les empreintes ont été relevées **avant** le découpage du pas en étapes : elles ne
 * doivent changer que pour un changement de comportement voulu, expliqué dans la PR.
 */

/** Durée maximale d'un scénario (rendu logiciel des machines de CI). */
const TIMEOUT_MS = 60_000;

/** Graine des scénarios, celle des captures. */
const SEED = 42;

/** Instants relevés, en pas de simulation : 1 s, 10 s, 1 min 10 s (une heure du jour = 50 s). */
const CHECKPOINTS = [60, 600, 4_200] as const;

/** Préparation d'un scénario : modifie le monde de départ. */
type Setup = (world: MutableWorld) => void;

/** Scénarios : bac de départ et préparation. */
const SCENARIOS: Record<string, () => World> = {
  'decor+distributeur': () =>
    prepared(createDefaultWorld(SEED, 'tropical'), (world) => {
      (world as { careMode?: string }).careMode = 'decor';
      setWorldFeederInPlace(world, [13]);
      feedInPlace(world, 0, 0);
    }),
  distributeur: () =>
    prepared(createDefaultWorld(SEED, 'recif'), (world) => {
      setWorldFeederInPlace(world, [13]);
    }),
  'courant+nourri': () =>
    prepared(createDefaultWorld(SEED, 'eaufroide'), (world) => {
      setWorldCurrentInPlace(world, 'fort');
      feedInPlace(world, 0.1, 0);
    }),
  rivaux: () =>
    createWorld(SEED, [
      { species: 'koi', count: 4 },
      { species: 'neon', count: 10 },
    ]),
  alevins: () => prepared(createDefaultWorld(SEED, 'tropical'), broodWorldInPlace),
  oeufs: () =>
    prepared(createDefaultWorld(SEED, 'tropical'), (world) => {
      layEggsWorldInPlace(world);
    }),
  'oeufs+recif': () =>
    prepared(createDefaultWorld(SEED, 'recif'), (world) => {
      layEggsWorldInPlace(world);
    }),
  maladies: () =>
    prepared(createDefaultWorld(SEED, 'tropical'), (world) => {
      infectWorldInPlace(world);
      velvetWorldInPlace(world);
      fungusWorldInPlace(world);
      rotWorldFinsInPlace(world);
      dropsyWorldInPlace(world);
    }),
  'mortalite+corps': () =>
    prepared(createDefaultWorld(SEED, 'tropical'), (world) => {
      setWorldMortalityInPlace(world, true);
      starveWorldInPlace(world);
      dropsyWorldInPlace(world, 1);
      killWorldAnimalInPlace(world, world.entities[0].id);
    }),
  algues: () =>
    prepared(createDefaultWorld(SEED, 'tropical'), (world) => {
      setWorldLightingInPlace(world, 14);
      for (let i = 0; i < 8; i++) {
        feedInPlace(world, 0, 0);
      }
    }),
};

/**
 * Empreintes attendues, relevées avant le découpage de `stepInPlace` : une valeur par instant
 * de `CHECKPOINTS`, puis celle d'un pas libre (`step(world, 0.05)`) depuis le dernier instant.
 */
const EXPECTED: Record<string, readonly string[]> = {
  'decor+distributeur': [
    'cd98f67eba26a4ca',
    'b63637076e0a3ea7',
    '0219c440830a0322',
    'c0a066ec4e4c165c',
  ],
  distributeur: ['d2c1d6c867114c24', '9950f1acbdd9dbd6', 'd4f6cbe599a6e65f', 'c02fe56e00269cfa'],
  'courant+nourri': [
    'd83e5bc956f36b25',
    '8abb7c7f2321e291',
    '71b7bf964c57674a',
    '40392871b9608e73',
  ],
  rivaux: ['95514027671f5007', 'ae24ffa376e42c7f', 'b1dc3d4906705cf9', '364b566bb7770857'],
  alevins: ['8efd2e40f1263568', '8c007fb148e37735', '7b8ef1d166df2349', '2c2d927750d85a97'],
  oeufs: ['85c832b15518b531', '3140533a06447206', '89970b489e1f5faa', 'bc21aaa508828eab'],
  'oeufs+recif': ['78a65971c655f7e3', '5981a8c45050e9ea', '045139668f08355a', '1dbe5dfaee4fd14e'],
  maladies: ['6b802f2da9eab10d', 'be74b702684dc8c8', '50aaa44465d204c4', '90ed1dc0e95f367a'],
  'mortalite+corps': [
    '75c7cd2e12dbf268',
    'e980f97b42c15011',
    'ebe4c9fdaa3d27b9',
    '4c9286b68a225e06',
  ],
  algues: ['d418b117ba3d059f', '56a6a3e1d5eedc83', '102e26f946e90ba7', '8b4527b0b7ffc454'],
};

/** Monde de départ modifié par `setup`. */
function prepared(start: World, setup: Setup): World {
  const world = cloneWorld(start);
  setup(world);
  return world;
}

/** Hachage FNV-1a 32 bits doublé (deux bases), en hexadécimal. */
function hash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

function run(make: () => World): string[] {
  let world = make();
  const prints: string[] = [];
  for (const tick of CHECKPOINTS) {
    world = advance(world, tick - world.tick, DEFAULT_DAY_CLOCK);
    prints.push(hash(JSON.stringify(world)));
  }
  prints.push(hash(JSON.stringify(step(world, 0.05, DEFAULT_DAY_CLOCK))));
  return prints;
}

describe('caractérisation du pas de simulation : branches hors bacs par défaut', () => {
  it('hachage : stable, sensible à un caractère', () => {
    expect(hash('aqfish')).toBe(hash('aqfish'));
    expect(hash('aqfish')).not.toBe(hash('aqfisH'));
    expect(hash('')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('chaque scénario a ses empreintes enregistrées', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(SCENARIOS).sort());
  });

  it(
    'les scénarios atteignent bien leurs branches du pas',
    () => {
      const at = (name: string): World =>
        advance(SCENARIOS[name](), CHECKPOINTS[2], DEFAULT_DAY_CLOCK);
      expect(at('distributeur').feeder!.stock).toBeLessThan(createFeeder().stock);
      expect(at('decor+distributeur').feeder!.stock).toBe(createFeeder().stock);
      expect(at('alevins').entities.some((fish) => fish.growth !== undefined)).toBe(true);
      expect(at('oeufs').eggs?.length ?? 0).toBeGreaterThan(0);
      expect(at('mortalite+corps').dead?.length ?? 0).toBeGreaterThan(0);
      expect(at('courant+nourri').current).toBe('fort');
    },
    TIMEOUT_MS,
  );

  for (const [name, make] of Object.entries(SCENARIOS)) {
    it(
      `${name} : empreintes enregistrées (toute différence est une régression)`,
      () => {
        const actual = run(make);
        expect(
          actual,
          `Empreintes de « ${name} » changées. Si le changement de comportement est voulu, ` +
            `remplacer sa ligne de EXPECTED par : ${JSON.stringify(actual)}`,
        ).toEqual(EXPECTED[name]);
      },
      TIMEOUT_MS,
    );
  }
});
