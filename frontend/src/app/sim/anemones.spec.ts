import {
  ANEMONE_EDGE_MARGIN,
  ANEMONE_GAP,
  anemoneBox,
  anemoneFootprint,
  anemoneFootprints,
  anemoneHomes,
  anemoneLayout,
  anemoneModel,
  anemoneObstacles,
  assertAnemoneSettings,
  COLUMN_HEIGHT,
  COLUMN_RADIUS,
  MAX_ANEMONES,
  tentacleHeight,
  tentacleSway,
} from './anemones';
import { coralFootprint, coralModel, rectCircleGap, rectGap } from './corals';
import { decorObstacles } from './decor';
import { POND, PALUDARIUM, REEF, TROPICAL_TANK } from './environment';
import { plantSwayBound, type SwayOffset } from './plant-sway';
import { populationCounts, setPopulation } from './population';
import { CLOWN, SPECIES, validateSpecies, type SpeciesDefinition } from './species';
import {
  advance,
  advanceInPlace,
  bondTarget,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  feed,
  homeForRank,
  seededFeatures,
  worldAnemoneHomes,
  type World,
} from './world';

const SEEDS = Array.from({ length: 200 }, (_, n) => (n * 2654435761) >>> 0);
const settings = REEF.anemones!;
const layout = (seed: number) => anemoneLayout(seed, REEF.dimensions, settings, REEF.decor);

describe('réglage des anémones', () => {
  it('accepte le réglage du récif, refuse les effectifs et échelles invalides', () => {
    expect(assertAnemoneSettings(settings)).toBe(settings);
    const scale = { min: 1, max: 1.2 };
    for (const count of [
      { min: -1, max: 2 },
      { min: 3, max: 2 },
      { min: 0, max: MAX_ANEMONES + 1 },
      { min: 0.5, max: 2 },
    ]) {
      expect(() => assertAnemoneSettings({ count, scale })).toThrow(RangeError);
    }
    for (const bad of [
      { min: 0.1, max: 1 },
      { min: 1, max: 3 },
      { min: 1.2, max: 1 },
      { min: Number.NaN, max: 1 },
    ]) {
      expect(() => assertAnemoneSettings({ count: { min: 1, max: 1 }, scale: bad })).toThrow(
        RangeError,
      );
    }
  });
});

describe('modèle d’une anémone', () => {
  it('déterministe ; voxels triés, sans doublon ; un pied puis des tentacules au bout renflé', () => {
    const a = anemoneModel(7, 1.3);
    expect(anemoneModel(7, 1.3)).toEqual(a);
    expect(anemoneModel(8, 1.3)).not.toEqual(a);
    const keys = a.cells.map((c) => `${c.i},${c.j},${c.k}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (let n = 1; n < a.cells.length; n++) {
      const [p, c] = [a.cells[n - 1], a.cells[n]];
      expect(p.j < c.j || (p.j === c.j && (p.i < c.i || (p.i === c.i && p.k < c.k)))).toBe(true);
    }
    const column = a.cells.filter((c) => c.part === 'column');
    expect(column.every((c) => c.j < COLUMN_HEIGHT && c.strand === 0)).toBe(true);
    expect(a.cells.filter((c) => c.part === 'tentacle').every((c) => c.j >= COLUMN_HEIGHT)).toBe(
      true,
    );
    expect(a.tentacles).toBeGreaterThanOrEqual(12);
    expect(new Set(a.cells.filter((c) => c.tip).map((c) => c.strand)).size).toBe(a.tentacles);
    expect(a.voxelSize).toBeCloseTo(0.008 * 1.3, 12);
  });

  it('refuse une graine ou une échelle invalide', () => {
    for (const scale of [0, 0.4, 2.5, Number.NaN]) {
      expect(() => anemoneModel(1, scale)).toThrow(RangeError);
    }
    expect(() => anemoneModel(-1, 1)).toThrow(RangeError);
  });
});

describe('disposition des anémones', () => {
  it('déterministe, propre à la graine ; aucune sans réglage', () => {
    expect(layout(42)).toEqual(layout(42));
    expect(layout(42)).not.toEqual(layout(43));
    expect(anemoneLayout(42, REEF.dimensions, null, REEF.decor)).toEqual([]);
    expect(() => layout(-1)).toThrow(RangeError);
  });

  it('200 graines : effectif visé atteint, dans le bac, hors des rochers et l’une de l’autre', () => {
    const rocks = decorObstacles(REEF.decor).flatMap((o) => o.spheres);
    const halfW = REEF.dimensions.width / 2 - ANEMONE_EDGE_MARGIN;
    const halfD = REEF.dimensions.depth / 2 - ANEMONE_EDGE_MARGIN;
    for (const seed of SEEDS) {
      const anemones = layout(seed);
      expect(anemones.length).toBeGreaterThanOrEqual(settings.count.min);
      const rects = anemones.map((a) => anemoneFootprint(anemoneModel(a.seed, a.scale), a.x, a.z));
      rects.forEach((f, n) => {
        expect(f.minX).toBeGreaterThanOrEqual(-halfW);
        expect(f.maxX).toBeLessThanOrEqual(halfW);
        expect(f.minZ).toBeGreaterThanOrEqual(-halfD);
        expect(f.maxZ).toBeLessThanOrEqual(halfD);
        for (const s of rocks) {
          expect(rectCircleGap(f, s.x, s.z, s.radius)).toBeGreaterThanOrEqual(ANEMONE_GAP);
        }
        for (const other of rects.slice(n + 1)) {
          expect(rectGap(f, other)).toBeGreaterThanOrEqual(ANEMONE_GAP);
        }
      });
    }
  });

  it('200 graines : les coraux du monde ne chevauchent aucune anémone', () => {
    for (const seed of SEEDS) {
      const { corals, anemones } = seededFeatures(seed, 'recif', REEF.decor);
      const reserved = anemoneFootprints(anemones);
      for (const c of corals) {
        const f = coralFootprint(coralModel(c.form, c.seed, c.scale), c.x, c.z, c.quarterTurns);
        for (const a of anemones) {
          const own = anemoneFootprint(anemoneModel(a.seed, a.scale), a.x, a.z);
          expect(rectGap(f, own)).toBeGreaterThan(0);
        }
        for (const r of reserved) {
          expect(rectGap(f, r)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('seul le récif a des anémones ; leurs boîtes suivent celles des coraux', () => {
    for (const env of [TROPICAL_TANK, POND, PALUDARIUM]) {
      expect(seededFeatures(42, env.id, env.decor).anemones).toEqual([]);
    }
    const world = createDefaultWorld(42, 'recif');
    const { corals, anemones } = seededFeatures(42, 'recif', world.decor);
    const first = world.decor.length + corals.length;
    expect(world.obstacles.slice(first)).toEqual(anemoneObstacles(anemones, first));
  });
});

describe('boîte d’obstacle et ondulation des tentacules', () => {
  const anemone = layout(42)[0];
  const model = anemoneModel(anemone.seed, anemone.scale);

  it('la boîte enveloppe le pied seul, posée sur le sable', () => {
    const box = anemoneBox(anemone, 3);
    expect(box).toMatchObject({ id: 3, shape: 'box', x: anemone.x, z: anemone.z });
    expect(box.halfX).toBeCloseTo(COLUMN_RADIUS * model.voxelSize, 12);
    expect(box.halfY * 2).toBeCloseTo(COLUMN_HEIGHT * model.voxelSize, 12);
  });

  it('les tentacules ondulent (bout mobile, pied immobile), bornés par l’amplitude', () => {
    const out: SwayOffset = { x: 0, z: 0 };
    const tipY = model.height * model.voxelSize;
    expect(tentacleHeight(model, 0)).toBe(0);
    expect(tentacleHeight(model, COLUMN_HEIGHT * model.voxelSize)).toBe(0);
    expect(tentacleHeight(model, tipY)).toBe(1);
    const poses = [0, 1, 2, 3].map((t) => ({ ...tentacleSway(model, 5, 1, t, out) }));
    expect(new Set(poses.map((p) => p.x.toFixed(6))).size).toBe(4);
    for (const t of [0, 1.3, 7, 60]) {
      tentacleSway(model, 2, 0, t, out);
      expect(Math.abs(out.x) + Math.abs(out.z)).toBe(0);
      for (const h of [0.3, 0.7, 1]) {
        tentacleSway(model, 9, h, t, out);
        expect(Math.hypot(out.x, out.z)).toBeLessThanOrEqual(plantSwayBound(h, model.amplitude));
      }
    }
    // Deux tentacules voisins ne bougent pas à l'unisson.
    const a = { ...tentacleSway(model, 1, 1, 2, out) };
    const b = { ...tentacleSway(model, 2, 1, 2, out) };
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(1e-4);
  });

  it('l’ondulation ne change jamais la boîte : obstacles du monde identiques au fil du temps', () => {
    const world = createDefaultWorld(42, 'recif');
    expect(advance(world, 600).obstacles).toEqual(world.obstacles);
  });
});

describe('poisson-clown (#150)', () => {
  it('espèce déclarée, valide, propre au récif, avec sa population par défaut', () => {
    expect(SPECIES.clown).toBe(CLOWN);
    expect(validateSpecies(CLOWN)).toEqual([]);
    expect(CLOWN.defaultPopulation).toBeGreaterThanOrEqual(2);
    expect(CLOWN.defaultPopulation).toBeLessThanOrEqual(4);
    expect(CLOWN.schooling).not.toBeNull();
    expect(CLOWN.variants).toBeUndefined();
    expect(REEF.species).toEqual(['clown']);
    expect(populationCounts(createDefaultWorld(42, 'recif')).clown).toBe(CLOWN.defaultPopulation);
  });

  it('refuse une attache invalide', () => {
    const bad = (anemone: SpeciesDefinition['anemone']) =>
      validateSpecies({ ...CLOWN, anemone }).length;
    expect(bad({ ...CLOWN.anemone!, leashRadius: 0 })).toBeGreaterThan(0);
    expect(bad({ ...CLOWN.anemone!, refugeDuration: Number.NaN })).toBeGreaterThan(0);
    expect(bad({ ...CLOWN.anemone!, perAnemone: 0 })).toBeGreaterThan(0);
  });

  /** Part du temps (échantillons toutes les 0,1 s sur `seconds`) passée à moins de `radius`. */
  function nearShare(world: World, seconds: number, radius: number): number[] {
    const homes = worldAnemoneHomes(world);
    const inside = world.entities.map(() => 0);
    const w = cloneWorld(world);
    const samples = seconds * 10;
    for (let s = 0; s < samples; s++) {
      advanceInPlace(w, 6);
      w.entities.forEach((fish, rank) => {
        const home = homeForRank(homes, CLOWN.anemone, rank)!;
        if (Math.hypot(fish.x - home.x, fish.y - home.hoverY, fish.z - home.z) < radius) {
          inside[rank] += 1;
        }
      });
    }
    return inside.map((n) => n / samples);
  }

  it.each([42, 123, 4294967295])(
    'graine %i : chaque clown reste à moins de 25 cm de son anémone au moins 80 % de 60 s',
    (seed) => {
      for (const share of nearShare(createDefaultWorld(seed, 'recif'), 60, 0.25)) {
        expect(share).toBeGreaterThanOrEqual(0.8);
      }
    },
    20_000,
  );

  it('naît près de son anémone ; quatre clowns par anémone, puis la suivante', () => {
    const world = setPopulation(createDefaultWorld(42, 'recif'), 'clown', 6);
    const homes = worldAnemoneHomes(world);
    expect(homes).toHaveLength(2);
    expect(homeForRank(homes, CLOWN.anemone, 3)).toBe(homes[0]);
    expect(homeForRank(homes, CLOWN.anemone, 4)).toBe(homes[1]);
    expect(homeForRank(homes, undefined, 0)).toBeNull();
    expect(homeForRank([], CLOWN.anemone, 0)).toBeNull();
    world.entities.forEach((fish, rank) => {
      const home = homeForRank(homes, CLOWN.anemone, rank)!;
      expect(Math.hypot(fish.x - home.x, fish.z - home.z)).toBeLessThan(CLOWN.anemone!.leashRadius);
    });
  });

  it('se réfugie parmi les tentacules quand on dépose de la nourriture près de l’anémone', () => {
    const start = advance(createDefaultWorld(42, 'recif'), 600);
    const home = worldAnemoneHomes(start)[0];
    const pellets = feed(start, home.x + 0.1, home.z).food;
    const fish = start.entities[0];
    const target = bondTarget(fish, CLOWN.anemone!, home, pellets, null)!;
    expect([target.x, target.y, target.z]).toEqual([home.x, home.refugeY, home.z]);
    // Dépôt lointain ou ancien : pas de refuge.
    const far = feed(start, home.x + 0.5, home.z).food;
    expect(bondTarget(fish, CLOWN.anemone!, home, far, null)?.y ?? home.hoverY).not.toBe(
      home.refugeY,
    );
    const old = pellets.map((p) => ({ ...p, age: CLOWN.anemone!.refugeDuration }));
    expect(bondTarget(fish, CLOWN.anemone!, home, old, null)?.y ?? home.hoverY).not.toBe(
      home.refugeY,
    );
    // Dans le monde : 3 s après le dépôt, chaque clown est à moins de 8 cm du cœur de
    // l'anémone (rayon de ses tentacules : ≈ 6 cm), ou s'en est rapproché ; plus près qu'avant
    // en moyenne.
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    const before = distances(start, home);
    const after = distances(advance(feed(start, home.x + 0.1, home.z), 180), home);
    after.forEach((d, n) => expect(d).toBeLessThan(Math.max(0.08, before[n])));
    expect(mean(after)).toBeLessThan(mean(before));
  });

  it('sans anémone, l’attache ne change rien (point visé de la nourriture rendu tel quel)', () => {
    const fish = createDefaultWorld(42, 'recif').entities[0];
    const food = { x: 1, y: 2, z: 3 };
    expect(bondTarget(fish, CLOWN.anemone!, null, [], food)).toBe(food);
    expect(bondTarget(fish, CLOWN.anemone!, null, [], null)).toBeNull();
  });

  it('les poissons des autres environnements n’ont aucune attache', () => {
    const world = createWorld(42, [{ species: 'neon', count: 3 }]);
    expect(worldAnemoneHomes(world)).toEqual([]);
    expect(anemoneHomes([])).toEqual([]);
  });
});

function distances(world: World, home: { x: number; refugeY: number; z: number }): number[] {
  return world.entities.map((f) => Math.hypot(f.x - home.x, f.y - home.refugeY, f.z - home.z));
}
