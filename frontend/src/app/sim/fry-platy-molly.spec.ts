import { SIM_DT } from './constants';
import type { DecorItem } from './decor';
import {
  BROOD_TICKS,
  broodSize,
  canBreed,
  FED_HUNGER,
  FRY_GROWTH_TIME,
  FRY_SPECIES,
  FRY_STAGES,
  fryPlants,
  fryStage,
  fryTarget,
  growFryInPlace,
  hasFry,
  isFemale,
  isFry,
  type BroodConditions,
} from './fry';
import { MAX_TOTAL_FISH, populationCounts } from './population';
import { parseWorld, serializeWorld } from './save';
import { speciesSheet } from './species-sheet';
import { SPECIES, type SpeciesId } from './species';
import type { Fish } from './swimmer';
import { sampleWater } from './water-quality';
import {
  advance,
  boundsFor,
  broodWorldInPlace,
  cloneWorld,
  createWorld,
  step,
  stepBroodInPlace,
} from './world';
import type { MutableWorld, World } from './world-types';

/** Alevins du platy et du molly (issue #674) : même calendrier que le guppy (#459). */

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const VIVIPARES: readonly SpeciesId[] = ['platy', 'molly'];

const PLANT: DecorItem = {
  kind: 'plant',
  form: 'tall',
  x: 0,
  z: 0,
  rotation: 0,
  scale: 1,
  seed: 6,
};

const GOOD: BroodConditions = { goodWater: true, phOut: () => false };

/** Bac nourri, en pleine santé, au pas qui précède la fin de la première portée. */
function fed(
  species: SpeciesId,
  seed: number,
  count = 4,
  decor: readonly DecorItem[] = [PLANT],
): MutableWorld {
  const world = cloneWorld(createWorld(seed, [{ species, count }], [], decor));
  for (const fish of world.entities as Mutable<Fish>[]) {
    fish.hunger = 0.1;
    fish.health = 1;
  }
  world.tick = BROOD_TICKS - 1;
  world.time = world.tick * SIM_DT;
  return world;
}

function fryOf(world: World): Fish[] {
  return world.entities.filter(isFry);
}

describe('alevins du platy et du molly (sim/fry.ts, #674)', () => {
  it('le platy et le molly sont vivipares, un individu sur deux est une femelle', () => {
    expect(FRY_SPECIES).toEqual(['guppy', 'platy', 'molly']);
    for (const species of VIVIPARES) {
      expect(hasFry(species)).toBe(true);
      // Sans apparence « femelle » : alternance des identifiants, impair = femelle.
      expect(SPECIES[species].variants).toBeUndefined();
      expect(isFemale({ id: 0, species })).toBe(false);
      expect(isFemale({ id: 1, species })).toBe(true);
      expect(isFemale({ id: 2, species })).toBe(false);
      expect(isFemale({ id: 7, species }, 123)).toBe(true);
      // Indépendant de la graine.
      expect(isFemale({ id: 3, species }, 0)).toBe(isFemale({ id: 3, species }, 99));
    }
    // Les autres espèces sans apparences ne sont jamais « femelles ».
    expect(isFemale({ id: 1, species: 'xipho' })).toBe(false);
    expect(isFemale({ id: 1, species: 'neon' })).toBe(false);
  });

  for (const species of VIVIPARES) {
    it(`${species} : une femelle nourrie et saine met bas en fin de portée, près de la mère`, () => {
      // Deux individus : une portée (au plus `MAX_BROOD`) tient sous le plafond de l'espèce.
      const world = fed(species, 42, 2);
      const mothers = world.entities.filter((f) => isFemale(f, world.seed));
      expect(mothers.map((m) => m.id)).toEqual([1]);
      const expected = mothers.reduce((n, m) => n + broodSize(42, m.id, 0), 0);
      const next = step(world);
      const fry = fryOf(next);
      expect(fry).toHaveLength(expected);
      fry.forEach((f, i) => {
        expect(f.species).toBe(species);
        expect(f.growth).toBe(0);
        expect(f.id).toBe(2 + i);
      });
      expect(Math.abs(fry[0].x - mothers[0].x)).toBeLessThan(0.1);
      // Même graine, mêmes naissances.
      expect(serializeWorld(step(fed(species, 42, 2)))).toBe(serializeWorld(next));
    });

    it(`${species} : aucune naissance sans nourriture, santé, eau saine, pH toléré ou femelle`, () => {
      const cases: ((w: MutableWorld) => void)[] = [
        (w) => (w.tick = BROOD_TICKS - 2),
        (w) => w.entities.forEach((f) => ((f as Mutable<Fish>).hunger = FED_HUNGER)),
        (w) => w.entities.forEach((f) => ((f as Mutable<Fish>).health = 0.99)),
        (w) => w.entities.forEach((f) => ((f as Mutable<Fish>).ich = 5)),
        (w) => (w.water = sampleWater(w.environment, 'mauvaise')),
        (w) => (w.water = { ...w.water, ph: 6 }),
      ];
      for (const change of cases) {
        const world = fed(species, 42);
        change(world);
        expect(fryOf(step(world))).toHaveLength(0);
      }
      // Un seul individu (identifiant 0, mâle) : aucune femelle, aucun alevin.
      expect(fryOf(step(fed(species, 42, 1)))).toHaveLength(0);
    });

    it(`${species} : cas absents sans exception (mère indéfinie, bac sans plantes)`, () => {
      expect(canBreed(undefined, 42, GOOD)).toBe(false);
      expect(canBreed(null, 42, GOOD)).toBe(false);

      // Bac sans plantes : la mise bas a lieu (comme le guppy, ADR 0107) et l'alevin nage
      // comme un adulte, faute de cachette.
      const bare = fed(species, 5, 4, []);
      const next = step(bare);
      expect(fryOf(next).length).toBeGreaterThan(0);
      const plants = fryPlants(next.decor);
      expect(plants).toHaveLength(0);
      const fry = fryOf(next)[0];
      expect(
        fryTarget(fry, plants, next.time, boundsFor(species, next), { x: 0, y: 0, z: 0 }),
      ).toBeNull();
      expect(() => advance(next, 5)).not.toThrow();

      // Bac sans aucun animal de l'espèce : rien.
      const empty = cloneWorld(createWorld(1, [{ species, count: 0 }]));
      empty.tick = BROOD_TICKS;
      expect(stepBroodInPlace(empty)).toBe(0);
    });

    it(`${species} : l'alevin grandit par jalons et devient adulte à FRY_GROWTH_TIME`, () => {
      const next = step(fed(species, 42));
      const young = fryOf(next).map((f) => ({ ...f })) as Mutable<Fish>[];
      expect(young.length).toBeGreaterThan(0);
      const stageTime = FRY_GROWTH_TIME / FRY_STAGES;
      for (let s = 0; s < FRY_STAGES; s++) {
        expect(fryStage(young[0].growth)).toBe(s);
        growFryInPlace(young, stageTime);
      }
      expect(young.every((f) => !isFry(f))).toBe(true);
      expect(fryStage(young[0].growth)).toBe(FRY_STAGES);
    });

    it(`${species} : le total d'alevins est borné par le plafond de l'espèce et du bac`, () => {
      const max = SPECIES[species].maxPopulation;
      expect(populationCounts(step(fed(species, 42, max - 1)))[species]).toBe(max);
      expect(fryOf(step(fed(species, 42, max)))).toHaveLength(0);
      // Portées successives : jamais au-delà du plafond.
      let world: World = fed(species, 9, 4);
      for (let k = 0; k < 4; k++) {
        world = step(world);
        expect(populationCounts(world)[species]).toBeLessThanOrEqual(max);
        expect(world.entities.length).toBeLessThanOrEqual(MAX_TOTAL_FISH);
        const again = cloneWorld(world);
        for (const fish of again.entities as Mutable<Fish>[]) {
          fish.hunger = 0.1;
          fish.health = 1;
        }
        again.tick = (k + 2) * BROOD_TICKS - 1;
        world = again;
      }
    });

    it(`${species} : sauvegarde et chargement conservent les alevins`, () => {
      const next = step(fed(species, 42));
      const fry = fryOf(next);
      expect(fry.length).toBeGreaterThan(0);
      const read = parseWorld(serializeWorld(next));
      if (!read.ok) {
        throw new Error('sauvegarde illisible');
      }
      const loaded = read.world;
      expect(fryOf(loaded).map((f) => [f.id, f.species, f.growth])).toEqual(
        fry.map((f) => [f.id, f.species, f.growth]),
      );
      // Sauvegarde sans alevin de l'espèce : se charge toujours, sans alevin.
      const readAdults = parseWorld(serializeWorld(fed(species, 42)));
      if (!readAdults.ok) {
        throw new Error('sauvegarde illisible');
      }
      const adults = readAdults.world;
      expect(fryOf(adults)).toHaveLength(0);
      expect(populationCounts(adults)[species]).toBe(4);
    });

    it(`${species} : alevins d'exemple (alevins=1) répartis sur les trois jalons`, () => {
      const world = cloneWorld(createWorld(42, [{ species, count: 4 }], [], [PLANT]));
      const born = broodWorldInPlace(world);
      expect(born).toBeGreaterThan(0);
      const stages = new Set(fryOf(world).map((f) => fryStage(f.growth)));
      expect(stages.size).toBe(Math.min(FRY_STAGES, born));
    });

    it(`${species} : la fiche cite la reproduction comme approximation de jeu`, () => {
      const notes = speciesSheet(species).notes;
      const repro = notes.find((n) => n.text.startsWith('Reproduction : vivipare'));
      expect(repro).toBeDefined();
      expect(repro?.status.kind).toBe('approximation');
    });
  }
});
