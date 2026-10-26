import { createDayClock, DEFAULT_DAY_CLOCK, MIDNIGHT_HOUR, NOON_HOUR } from './daylight';
import { DIURNAL, NIGHT_SLOWDOWN, nightPace, nightRest } from './day-rhythm';
import { SPECIES, type SpeciesId } from './species';
import { advance, createDefaultWorld, type World } from './world';

const MIDNIGHT = createDayClock(MIDNIGHT_HOUR, DEFAULT_DAY_CLOCK.dayLengthSeconds, true);
const NOON = createDayClock(NOON_HOUR, DEFAULT_DAY_CLOCK.dayLengthSeconds, true);

function of(world: World, species: SpeciesId) {
  return world.entities.filter((f) => f.species === species);
}

function meanY(world: World, species: SpeciesId): number {
  const fishes = of(world, species);
  return fishes.reduce((sum, f) => sum + f.y, 0) / fishes.length;
}

/** Chemin parcouru par les poissons d'une espèce entre deux états, en mètres. */
function travelled(from: World, to: World, species: SpeciesId): number {
  const a = of(from, species);
  const b = of(to, species);
  return a.reduce((sum, f, i) => sum + Math.hypot(b[i].x - f.x, b[i].z - f.z), 0);
}

describe('rythme du jour (issue #209)', () => {
  it('nightRest : 0 en plein jour, 1 en pleine nuit pour une espèce diurne', () => {
    expect(nightRest('neon', 1)).toBe(0);
    expect(nightRest('neon', 0)).toBe(1);
    expect(nightRest('neon', 0.25)).toBe(0.75);
  });

  it('nightRest : corydoras, espèces inconnues et intensité non finie', () => {
    expect(nightRest('corydora', 0)).toBe(0);
    expect(nightRest('requin', 0)).toBe(0);
    expect(nightRest('constructor', 0)).toBe(0);
    expect(nightRest('neon', NaN)).toBe(0);
    expect(nightRest('neon', -3)).toBe(1);
    expect(nightRest('neon', 7)).toBe(0);
  });

  it('nightPace : exactement 1 le jour, 1 − NIGHT_SLOWDOWN la nuit', () => {
    expect(nightPace(0)).toBe(1);
    expect(nightPace(1)).toBe(1 - NIGHT_SLOWDOWN);
  });

  it('chaque espèce a un rythme ; les corydoras sont actifs la nuit', () => {
    expect(Object.keys(DIURNAL).sort()).toEqual(Object.keys(SPECIES).sort());
    expect(DIURNAL.corydora).toBe(false);
    expect(DIURNAL.neon).toBe(true);
  });

  it('à midi, avec ou sans horloge : monde identique au bit près', () => {
    const world = createDefaultWorld(42);
    expect(advance(world, 600, NOON)).toEqual(advance(world, 600));
  }, 15_000);

  it('la nuit, néons et guppys ralentissent et descendent vers le fond', () => {
    const world = advance(createDefaultWorld(42), 60);
    const day = advance(world, 1800);
    const night = advance(world, 1800, MIDNIGHT);
    for (const species of ['neon', 'guppy'] as const) {
      expect(meanY(night, species)).toBeLessThan(meanY(day, species) - 0.02);
      const moved = travelled(advance(night, 300, MIDNIGHT), night, species);
      const movedDay = travelled(advance(day, 300), day, species);
      expect(moved).toBeLessThan(movedDay * 0.8);
    }
  }, 30_000);

  it('les corydoras nagent la nuit exactement comme le jour', () => {
    const world = createDefaultWorld(42);
    const day = advance(world, 1200);
    const night = advance(world, 1200, MIDNIGHT);
    expect(of(night, 'corydora')).toEqual(of(day, 'corydora'));
  }, 15_000);
});
