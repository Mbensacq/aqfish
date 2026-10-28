import { SIM_DT } from './constants';
import { ENVIRONMENT_IDS, environmentWater } from './environment';
import { setPopulation } from './population';
import { SPECIES } from './species';
import {
  AMMONIA_PER_LOAD_LITER,
  changeWater,
  changeWaterInPlace,
  freshWater,
  MAX_CONCENTRATION,
  MAX_HEATER_TEMPERATURE,
  MAX_WATER_TEMPERATURE,
  MIN_HEATER_TEMPERATURE,
  MIN_WATER_TEMPERATURE,
  readWater,
  REFERENCE_BODY_LENGTH,
  setHeaterInPlace,
  stepWater,
  stepWaterInPlace,
  WATER_CHANGE_SHARE,
  targetTemperature,
  WATER_TEMPERATURES,
  waterLiters,
  waterLoad,
  type MutableWaterState,
  type WaterState,
} from './water';
import {
  advance,
  advanceInPlace,
  changeWorldWater,
  changeWorldWaterInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  setWorldHeater,
  setWorldHeaterInPlace,
  type World,
} from './world';
import { waterQuality } from './water-quality';
import { FRESH_PH, MAX_PH, MIN_PH } from './water-ph';

/** Bac tropical par défaut : charge et litres. */
const TROPICAL_LITERS = waterLiters(environmentWater('tropical'));
const TROPICAL_LOAD = waterLoad(createDefaultWorld(42).entities);

/** Avance une copie de `water` de `steps` pas de `SIM_DT`. */
function run(
  water: WaterState,
  steps: number,
  load = TROPICAL_LOAD,
  liters = TROPICAL_LITERS,
  temperature = WATER_TEMPERATURES.tropical,
): MutableWaterState {
  const state: MutableWaterState = { ...water };
  for (let i = 0; i < steps; i++) {
    stepWaterInPlace(state, SIM_DT, load, liters, temperature);
  }
  return state;
}

/** Toutes les valeurs finies et dans leurs bornes. */
function expectBounded(water: WaterState): void {
  for (const v of Object.values(water)) {
    expect(Number.isFinite(v)).toBe(true);
  }
  expect(water.temperature).toBeGreaterThanOrEqual(MIN_WATER_TEMPERATURE);
  expect(water.temperature).toBeLessThanOrEqual(MAX_WATER_TEMPERATURE);
  for (const v of [water.ammonia, water.nitrite, water.nitrate]) {
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(MAX_CONCENTRATION);
  }
  expect(water.filter).toBeGreaterThanOrEqual(0);
  expect(water.filter).toBeLessThanOrEqual(1);
  expect(water.ph).toBeGreaterThanOrEqual(MIN_PH);
  expect(water.ph).toBeLessThanOrEqual(MAX_PH);
}

const minutes = (m: number): number => Math.round((m * 60) / SIM_DT);

describe('freshWater', () => {
  it.each(ENVIRONMENT_IDS)('%s : eau saine à la température de l’environnement', (id) => {
    expect(freshWater(id)).toEqual({
      temperature: WATER_TEMPERATURES[id],
      ammonia: 0,
      nitrite: 0,
      nitrate: 0,
      filter: 1,
      ph: FRESH_PH[id],
    });
    expectBounded(freshWater(id));
  });

  it('renvoie un nouvel objet à chaque appel', () => {
    expect(freshWater('tropical')).not.toBe(freshWater('tropical'));
  });
});

describe('waterLoad et waterLiters', () => {
  it('bac vide : charge nulle', () => {
    expect(waterLoad([])).toBe(0);
  });

  it('charge au cube de la taille : un habitant de la taille de référence compte pour 1', () => {
    const koi = (SPECIES.koi.bodyLength / REFERENCE_BODY_LENGTH) ** 3;
    const neon = (SPECIES.neon.bodyLength / REFERENCE_BODY_LENGTH) ** 3;
    expect(waterLoad([{ species: 'koi' }])).toBeCloseTo(koi, 12);
    expect(waterLoad([{ species: 'koi' }, { species: 'neon' }])).toBeCloseTo(koi + neon, 12);
    // Un koï (14 cm) pèse bien plus qu'un néon (6 cm) : plus de 10 fois.
    expect(koi / neon).toBeGreaterThan(10);
  });

  it('litres d’une boîte d’eau', () => {
    const box = { minX: -0.5, maxX: 0.5, minY: 0, maxY: 0.2, minZ: -0.1, maxZ: 0.1 };
    expect(waterLiters(box)).toBeCloseTo(40, 9);
    for (const id of ENVIRONMENT_IDS) {
      expect(waterLiters(environmentWater(id))).toBeGreaterThan(0);
    }
  });
});

describe('stepWaterInPlace', () => {
  it('bac vide et eau saine : rien ne bouge', () => {
    const state = run(freshWater('tropical'), minutes(30), 0);
    expect(state).toEqual(freshWater('tropical'));
  });

  it('bac vide : les composés présents passent aux nitrates, total conservé', () => {
    const start = { ...freshWater('tropical'), ammonia: 5, nitrite: 3, nitrate: 2 };
    const state = run(start, minutes(60), 0);
    expect(state.ammonia).toBeLessThan(1e-6);
    expect(state.nitrite).toBeLessThan(1e-4);
    expect(state.ammonia + state.nitrite + state.nitrate).toBeCloseTo(10, 9);
  });

  it('production d’ammoniaque proportionnelle à la charge et inverse du volume', () => {
    const dt = 1;
    const off = { ...freshWater('tropical'), filter: 0 };
    const a = stepWater(off, dt, 10, 100, 25).ammonia;
    expect(a).toBeCloseTo((AMMONIA_PER_LOAD_LITER * 10) / 100, 12);
    expect(stepWater(off, dt, 20, 100, 25).ammonia).toBeCloseTo(2 * a, 12);
    expect(stepWater(off, dt, 10, 200, 25).ammonia).toBeCloseTo(a / 2, 12);
  });

  it('population par défaut : ammoniaque et nitrites restent bas, les nitrates montent', () => {
    const after1h = run(freshWater('tropical'), minutes(60));
    const after2h = run(after1h, minutes(60));
    expect(after2h.ammonia).toBeLessThan(2);
    expect(after2h.nitrite).toBeLessThan(3);
    expect(after2h.nitrate).toBeGreaterThan(after1h.nitrate);
    // Calibrage (ADR 0052) : environ 50 unités de nitrates en deux heures simulées.
    expect(after2h.nitrate).toBeGreaterThan(40);
    expect(after2h.nitrate).toBeLessThan(60);
    expectBounded(after2h);
  });

  it('calibrage de l’indicateur (#207) : à surveiller avant 1 h, mauvaise avant 2 h', () => {
    expect(waterQuality(run(freshWater('tropical'), minutes(20)), 'tropical')).toBe('bonne');
    expect(waterQuality(run(freshWater('tropical'), minutes(60)), 'tropical')).toBe('a-surveiller');
    expect(waterQuality(run(freshWater('tropical'), minutes(120)), 'tropical')).toBe('mauvaise');
  });

  it('surpeuplement : tout monte plus vite qu’avec la population par défaut', () => {
    const crowded = createWorld(42, [{ species: 'neon', count: SPECIES.neon.maxPopulation }]);
    const load = waterLoad(crowded.entities);
    expect(load).toBeGreaterThan(TROPICAL_LOAD);
    const normal = run(freshWater('tropical'), minutes(30));
    const over = run(freshWater('tropical'), minutes(30), load);
    expect(over.ammonia).toBeGreaterThan(normal.ammonia);
    expect(over.nitrite).toBeGreaterThan(normal.nitrite);
    expect(over.nitrate).toBeGreaterThan(normal.nitrate);
  });

  it('filtre à 0 : l’ammoniaque s’accumule, rien n’est converti', () => {
    const state = run({ ...freshWater('tropical'), filter: 0, nitrite: 4 }, minutes(10));
    expect(state.ammonia).toBeCloseTo(
      ((AMMONIA_PER_LOAD_LITER * TROPICAL_LOAD) / TROPICAL_LITERS) * 600,
      6,
    );
    expect(state.nitrite).toBe(4);
    expect(state.nitrate).toBe(0);
  });

  it('filtre à moitié : conversion plus lente qu’avec un filtre neuf', () => {
    const start = { ...freshWater('tropical'), ammonia: 10 };
    const full = run(start, minutes(2), 0);
    const half = run({ ...start, filter: 0.5 }, minutes(2), 0);
    expect(half.ammonia).toBeGreaterThan(full.ammonia);
    expect(half.filter).toBe(0.5);
  });

  it('valeurs bornées : plafond des concentrations, jamais négatives', () => {
    const saturated = run({ ...freshWater('tropical'), filter: 0 }, minutes(5), 1e9, 1);
    expect(saturated.ammonia).toBe(MAX_CONCENTRATION);
    const full = run(
      { ...freshWater('tropical'), ammonia: 100, nitrite: 100, nitrate: 100 },
      minutes(10),
      1e6,
      1,
    );
    expectBounded(full);
    expect(full.nitrate).toBe(MAX_CONCENTRATION);
    // Un très grand pas convertit tout sans passer sous zéro.
    const big = stepWater({ ...freshWater('tropical'), ammonia: 50, nitrite: 50 }, 1e6, 0, 10, 25);
    expectBounded(big);
    expect(big.ammonia).toBe(0);
  });

  it('pas de NaN : valeurs extrêmes acceptées restent finies', () => {
    const cases: [number, number, number][] = [
      [Number.MIN_VALUE, 0, 1e-9],
      [1e-12, Number.MAX_VALUE, 1e-9],
      [1e300, 1e300, 1e300],
      [SIM_DT, 0, Number.MAX_VALUE],
    ];
    for (const [dt, load, liters] of cases) {
      expectBounded(stepWater(freshWater('recif'), dt, load, liters, 26));
    }
  });

  it('température : tend vers celle visée, sans la dépasser', () => {
    const target = WATER_TEMPERATURES.tropical;
    const cold = run({ ...freshWater('tropical'), temperature: 15 }, minutes(60), 0);
    expect(cold.temperature).toBeGreaterThan(target - 0.1);
    expect(cold.temperature).toBeLessThanOrEqual(target);
    const hot = run({ ...freshWater('tropical'), temperature: 35 }, minutes(5), 0);
    expect(hot.temperature).toBeLessThan(35);
    expect(hot.temperature).toBeGreaterThan(target);
  });

  it('ramène un filtre hors bornes dans [0, 1]', () => {
    expect(stepWater({ ...freshWater('tropical'), filter: 3 }, SIM_DT, 0, 10, 25).filter).toBe(1);
    expect(stepWater({ ...freshWater('tropical'), filter: -1 }, SIM_DT, 0, 10, 25).filter).toBe(0);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('refuse un pas de %s', (dt) => {
    const state = { ...freshWater('tropical'), ammonia: 1 };
    expect(() => stepWaterInPlace(state, dt, 1, 10, 25)).toThrow(RangeError);
    expect(state.ammonia).toBe(1);
  });

  it.each([
    ['charge négative', -1, 10, 25],
    ['charge NaN', Number.NaN, 10, 25],
    ['charge infinie', Number.POSITIVE_INFINITY, 10, 25],
    ['volume nul', 1, 0, 25],
    ['volume NaN', 1, Number.NaN, 25],
    ['volume infini', 1, Number.POSITIVE_INFINITY, 25],
    ['température NaN', 1, 10, Number.NaN],
    ['température trop basse', 1, 10, MIN_WATER_TEMPERATURE - 1],
    ['température trop haute', 1, 10, MAX_WATER_TEMPERATURE + 1],
  ])('refuse : %s (eau inchangée)', (_name, load, liters, temperature) => {
    const state = { ...freshWater('tropical'), ammonia: 1 };
    expect(() => stepWaterInPlace(state, SIM_DT, load, liters, temperature)).toThrow(RangeError);
    expect(state).toEqual({ ...freshWater('tropical'), ammonia: 1 });
  });

  it('mise à jour sur place : renvoie le même objet, sans nouvelle propriété', () => {
    const state: MutableWaterState = { ...freshWater('tropical') };
    expect(stepWaterInPlace(state, SIM_DT, 5, 50, 25)).toBe(state);
    expect(Object.keys(state).sort()).toEqual(
      ['ammonia', 'filter', 'nitrate', 'nitrite', 'ph', 'temperature'].sort(),
    );
  });

  it('stepWater ne modifie pas son entrée et donne le même résultat', () => {
    const start = Object.freeze({ ...freshWater('tropical'), ammonia: 3 });
    const copy = stepWater(start, SIM_DT, 5, 50, 25);
    expect(copy).not.toBe(start);
    expect(start.ammonia).toBe(3);
    expect(copy).toEqual(stepWaterInPlace({ ...start }, SIM_DT, 5, 50, 25));
  });
});

describe('changeWater', () => {
  it('retire une part fixe des composés dissous, garde température et filtre', () => {
    const dirty = { temperature: 24, ammonia: 2, nitrite: 4, nitrate: 80, filter: 0.6, ph: 6 };
    const keep = 1 - WATER_CHANGE_SHARE;
    expect(changeWater(dirty, 'tropical')).toEqual({
      temperature: 24,
      ammonia: 2 * keep,
      nitrite: 4 * keep,
      nitrate: 80 * keep,
      filter: 0.6,
      // pH rapproché d'une part `WATER_CHANGE_SHARE` de celui de l'eau neuve (7, #236).
      ph: 6 + WATER_CHANGE_SHARE * (7 - 6),
    });
    expect(dirty.nitrate).toBe(80);
  });

  it('en place : même objet ; eau saine inchangée ; répétés, les nitrates tendent vers 0', () => {
    const state: MutableWaterState = { ...freshWater('bassin'), nitrate: MAX_CONCENTRATION };
    expect(changeWaterInPlace(state, 'bassin')).toBe(state);
    for (let i = 0; i < 60; i++) {
      changeWaterInPlace(state, 'bassin');
    }
    expect(state.nitrate).toBeGreaterThanOrEqual(0);
    expect(state.nitrate).toBeLessThan(1e-6);
    expect(changeWater(freshWater('bassin'), 'bassin')).toEqual(freshWater('bassin'));
  });
});

describe('readWater', () => {
  it('relit un état valide (copie) et ignore les champs inconnus', () => {
    const value = { ...freshWater('recif'), nitrate: 12.5, autre: 'x' };
    const result = readWater(value, 'recif');
    expect(result).toEqual({ ok: true, water: { ...freshWater('recif'), nitrate: 12.5 } });
    if (result.ok) {
      expect(result.water).not.toBe(value);
    }
  });

  it.each([
    ['null', null],
    ['tableau', []],
    ['nombre', 3],
    ['champ absent', { temperature: 25, ammonia: 0, nitrite: 0, nitrate: 0 }],
    ['texte', { ...freshWater('tropical'), ammonia: '0' }],
    ['négatif', { ...freshWater('tropical'), nitrite: -0.1 }],
    ['au-delà du plafond', { ...freshWater('tropical'), nitrate: MAX_CONCENTRATION + 1 }],
    ['infini', { ...freshWater('tropical'), ammonia: Number.POSITIVE_INFINITY }],
    ['NaN', { ...freshWater('tropical'), temperature: Number.NaN }],
    ['température hors bornes', { ...freshWater('tropical'), temperature: 41 }],
    ['filtre hors bornes', { ...freshWater('tropical'), filter: 1.5 }],
    ['chauffage trop froid', { ...freshWater('tropical'), heater: MIN_HEATER_TEMPERATURE - 0.1 }],
    ['chauffage trop chaud', { ...freshWater('tropical'), heater: MAX_HEATER_TEMPERATURE + 0.1 }],
    ['chauffage en texte', { ...freshWater('tropical'), heater: '26' }],
    ['chauffage nul', { ...freshWater('tropical'), heater: null }],
  ])('refuse : %s', (_name, value) => {
    const result = readWater(value, 'tropical');
    expect(result.ok).toBe(false);
  });

  it('relit la consigne du chauffage ; absente, elle reste absente', () => {
    const result = readWater({ ...freshWater('tropical'), heater: 27.5 }, 'tropical');
    expect(result).toEqual({ ok: true, water: { ...freshWater('tropical'), heater: 27.5 } });
    const without = readWater(freshWater('tropical'), 'tropical');
    expect(without.ok && Object.hasOwn(without.water, 'heater')).toBe(false);
  });

  it('ne lit pas les propriétés héritées', () => {
    const inherited = Object.create({ ...freshWater('tropical') }) as object;
    expect(readWater(inherited, 'tropical').ok).toBe(false);
  });
});

describe('chauffage', () => {
  it('sans consigne, l’eau vise la température de l’environnement', () => {
    for (const id of ENVIRONMENT_IDS) {
      expect(targetTemperature(freshWater(id), id)).toBe(WATER_TEMPERATURES[id]);
    }
  });

  it('consigne réglée : visée à la place de celle de l’environnement', () => {
    expect(targetTemperature({ ...freshWater('bassin'), heater: 24 }, 'bassin')).toBe(24);
  });

  it('setHeaterInPlace : arrondie au dixième, bornes acceptées', () => {
    const water: MutableWaterState = { ...freshWater('tropical') };
    expect(setHeaterInPlace(water, 26.04)).toBe(26);
    expect(water.heater).toBe(26);
    expect(setHeaterInPlace(water, 26.06)).toBe(26.1);
    expect(setHeaterInPlace(water, MIN_HEATER_TEMPERATURE)).toBe(MIN_HEATER_TEMPERATURE);
    expect(setHeaterInPlace(water, MAX_HEATER_TEMPERATURE)).toBe(MAX_HEATER_TEMPERATURE);
  });

  it.each([
    MIN_HEATER_TEMPERATURE - 0.01,
    MAX_HEATER_TEMPERATURE + 0.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('setHeaterInPlace refuse %s, eau inchangée', (temperature) => {
    const water: MutableWaterState = { ...freshWater('tropical') };
    expect(() => setHeaterInPlace(water, temperature)).toThrow(RangeError);
    expect(water).toEqual(freshWater('tropical'));
  });

  // Délai explicite (#244, docs/PIEGES.md) : ≈ 0,4 s en local, bien plus en CI lente.
  it('monde : l’eau rejoint peu à peu la consigne, sans la dépasser', () => {
    const world = setWorldHeater(createWorld(7, [], [], [], 'tropical'), 30);
    expect(world.water.heater).toBe(30);
    expect(world.water.temperature).toBe(WATER_TEMPERATURES.tropical);
    const after10min = advance(world, minutes(10));
    expect(after10min.water.temperature).toBeGreaterThan(27);
    expect(after10min.water.temperature).toBeLessThan(30);
    const after2h = advance(after10min, minutes(110));
    expect(after2h.water.temperature).toBeGreaterThan(29.9);
    expect(after2h.water.temperature).toBeLessThanOrEqual(30);
  }, 15_000);

  it('setWorldHeater ne modifie pas le monde ; en place : même eau, même consigne', () => {
    const world = createDefaultWorld(42);
    const next = setWorldHeater(world, 20);
    expect(Object.hasOwn(world.water, 'heater')).toBe(false);
    expect(next.water.heater).toBe(20);
    const mutable = cloneWorld(world);
    const water = mutable.water;
    expect(setWorldHeaterInPlace(mutable, 20)).toBe(20);
    expect(mutable.water).toBe(water);
    expect(mutable).toEqual(next);
  });

  it('changer d’eau garde la consigne', () => {
    const world = changeWorldWater(setWorldHeater(createDefaultWorld(42), 28));
    expect(world.water.heater).toBe(28);
  });
});

describe('eau du monde', () => {
  it('un monde neuf a une eau saine, propre à son environnement', () => {
    for (const id of ENVIRONMENT_IDS) {
      expect(createDefaultWorld(42, id).water).toEqual(freshWater(id));
    }
  });

  it('déterminisme : graine 42, 600 pas, même état à deux exécutions', () => {
    const a = advance(createDefaultWorld(42), 600);
    const b = advance(createDefaultWorld(42), 600);
    expect(a.water).toEqual(b.water);
    expect(JSON.stringify(a.water)).toBe(JSON.stringify(b.water));
    expect(a.water.ammonia).toBeGreaterThan(0);
  });

  it('avancé pas à pas, l’eau suit le modèle avec la charge et le volume du bac', () => {
    const world = createDefaultWorld(42);
    const expected = run(world.water, 600, waterLoad(world.entities));
    expect(advance(world, 600).water).toEqual(expected);
  });

  it('advanceInPlace : l’état de l’eau est mis à jour sur place (même objet)', () => {
    const world = cloneWorld(createDefaultWorld(42));
    const water = world.water;
    advanceInPlace(world, 600);
    expect(world.water).toBe(water);
    expect(water.nitrite).toBeGreaterThan(0);
  });

  it('l’eau ne change rien aux poissons', () => {
    const world = createDefaultWorld(7);
    const dirty: World = { ...cloneWorld(world), water: { ...world.water, filter: 0 } };
    expect(advance(dirty, 300).entities).toEqual(advance(world, 300).entities);
  });

  it('bac vide : eau saine stable', () => {
    expect(advance(createWorld(42), 600).water).toEqual(freshWater('tropical'));
  });

  it('plus de poissons, plus d’ammoniaque', () => {
    const base = createDefaultWorld(3);
    const more = setPopulation(base, 'guppy', SPECIES.guppy.maxPopulation);
    expect(advance(more, 600).water.ammonia).toBeGreaterThan(advance(base, 600).water.ammonia);
  });

  // Délai explicite (#244, docs/PIEGES.md) : ≈ 0,4 s en local, bien plus en CI lente.
  it('changeWorldWater : nouvel état, monde d’origine intact ; en place : même objet', () => {
    const world = advance(createDefaultWorld(42), 3600);
    const before = world.water.nitrate;
    const changed = changeWorldWater(world);
    expect(world.water.nitrate).toBe(before);
    expect(changed.water.nitrate).toBeCloseTo(before * (1 - WATER_CHANGE_SHARE), 12);
    expect(changed.entities).toEqual(world.entities);
    const owned = cloneWorld(world);
    const water = owned.water;
    changeWorldWaterInPlace(owned);
    expect(owned.water).toBe(water);
    expect(owned.water).toEqual(changed.water);
  }, 15_000);
});

describe('pH de l’eau (#236)', () => {
  it('dérive : le pH baisse avec la charge, d’autant plus vite qu’elle est forte', () => {
    const fresh = freshWater('tropical');
    const light = run(fresh, minutes(10), TROPICAL_LOAD);
    const heavy = run(fresh, minutes(10), 4 * TROPICAL_LOAD);
    expect(light.ph).toBeLessThan(fresh.ph);
    expect(heavy.ph).toBeLessThan(light.ph);
    expect(fresh.ph - heavy.ph).toBeCloseTo(4 * (fresh.ph - light.ph), 9);
    expectBounded(heavy);
  });

  it('dérive lente : bac tropical par défaut, ~0,25 de pH par heure simulée', () => {
    const after = run(freshWater('tropical'), minutes(60));
    expect(FRESH_PH.tropical - after.ph).toBeGreaterThan(0.2);
    expect(FRESH_PH.tropical - after.ph).toBeLessThan(0.3);
  });

  it('bac sans habitant : pH stable', () => {
    expect(run(freshWater('recif'), minutes(30), 0).ph).toBe(FRESH_PH.recif);
  });

  it('bornes : jamais sous 4,0, même avec une charge énorme pendant des heures', () => {
    const state = run(freshWater('tropical'), minutes(120), 1e6);
    expect(state.ph).toBe(MIN_PH);
    expectBounded(state);
  });

  it('changement d’eau : le pH revient vers celui de l’eau neuve, sans le dépasser', () => {
    const acid: MutableWaterState = { ...freshWater('tropical'), ph: 5 };
    changeWaterInPlace(acid, 'tropical');
    expect(acid.ph).toBeCloseTo(5 + WATER_CHANGE_SHARE * (FRESH_PH.tropical - 5), 12);
    const basic: MutableWaterState = { ...freshWater('tropical'), ph: 9 };
    changeWaterInPlace(basic, 'tropical');
    expect(basic.ph).toBeLessThan(9);
    expect(basic.ph).toBeGreaterThan(FRESH_PH.tropical);
    for (let i = 0; i < 80; i++) {
      changeWaterInPlace(acid, 'tropical');
    }
    expect(acid.ph).toBeLessThanOrEqual(FRESH_PH.tropical);
    expect(acid.ph).toBeCloseTo(FRESH_PH.tropical, 9);
  });

  it('changement d’eau : l’eau neuve est celle de l’environnement du bac', () => {
    const drifted: MutableWaterState = { ...freshWater('recif'), ph: 7.5 };
    expect(changeWater(drifted, 'recif').ph).toBeGreaterThan(7.5);
    expect(changeWater(drifted, 'tropical').ph).toBeLessThan(7.5);
  });

  // Délai explicite (#244, docs/PIEGES.md) : ≈ 0,5 s en local, bien plus en CI lente.
  it('déterminisme : même graine, même suite de pH ; graines différentes, même dérive', () => {
    const series = (seed: number): number[] => {
      const world = cloneWorld(createDefaultWorld(seed));
      const values: number[] = [];
      for (let i = 0; i < 10; i++) {
        advanceInPlace(world, 120);
        values.push(world.water.ph);
      }
      return values;
    };
    expect(series(42)).toEqual(series(42));
    // La dérive ne dépend que de la charge (même population par défaut), pas des tirages.
    expect(series(7)).toEqual(series(42));
    expect(series(42)[9]).toBeLessThan(FRESH_PH.tropical);
  }, 15_000);

  it('changeWorldWater : le pH du monde remonte vers celui de son environnement', () => {
    const world: World = {
      ...createDefaultWorld(42, 'bassin'),
      water: { ...freshWater('bassin'), ph: 6.5 },
    };
    expect(changeWorldWater(world).water.ph).toBeCloseTo(
      6.5 + WATER_CHANGE_SHARE * (FRESH_PH.bassin - 6.5),
      12,
    );
  });
});

describe('readWater et pH (#236)', () => {
  it('relit le pH ; absent (sauvegarde antérieure), reprend celui de l’eau neuve', () => {
    const old: Partial<MutableWaterState> = { ...freshWater('recif') };
    delete old.ph;
    expect(readWater({ ...old, nitrate: 3 }, 'recif')).toEqual({
      ok: true,
      water: { ...freshWater('recif'), nitrate: 3 },
    });
    expect(readWater({ ...freshWater('recif'), ph: 7.9 }, 'recif')).toEqual({
      ok: true,
      water: { ...freshWater('recif'), ph: 7.9 },
    });
  });

  it.each([
    ['trop acide', MIN_PH - 0.1],
    ['trop basique', MAX_PH + 0.1],
    ['texte', '7'],
    ['nul', null],
    ['NaN', Number.NaN],
  ])('refuse un pH %s', (_name, ph) => {
    expect(readWater({ ...freshWater('tropical'), ph }, 'tropical').ok).toBe(false);
  });
});
