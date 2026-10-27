import { createDayClock } from './daylight';
import { DEFAULT_DECOR } from './decor';
import { addDecorItem, removeDecorItem, withDecor } from './decor-edit';
import { MAX_FOOD } from './food';
import {
  MAX_TOTAL_FISH,
  populationCounts,
  setPopulation,
  setPopulationInPlace,
} from './population';
import {
  DEFAULT_SAVE_SETTINGS,
  MAX_SAVE_DECOR,
  MAX_SAVE_LENGTH,
  parseSaveData,
  parseWorld,
  SAVE_FORMAT,
  SAVE_SCHEMA,
  saveData,
  serializeWorld,
  type ParseWorldResult,
  type SaveSettings,
} from './save';
import { DEFAULT_ROOM } from './room';
import { ENVIRONMENT_IDS, environmentById, type EnvironmentId } from './environment';
import { SPECIES } from './species';
import { CHIRURGIEN } from './species';
import { sphereObstacle } from './obstacles';
import { freshWater } from './water';
import {
  advance,
  advanceInPlace,
  changeWorldWater,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  feed,
  feedInPlace,
  seededFeatures,
  setWorldHeater,
  worldFeatureComputations,
  worldFeatures,
  type World,
} from './world';

/** Monde restauré, ou échec du test avec le message de refus. */
function restored(result: ParseWorldResult): {
  world: World;
  settings: SaveSettings;
  others: readonly World[];
} {
  if (!result.ok) {
    throw new Error(`sauvegarde refusée : ${result.error}`);
  }
  return result;
}

/** Message de refus, ou échec du test si la sauvegarde est acceptée. */
function refusal(result: ParseWorldResult): string {
  if (result.ok) {
    throw new Error('sauvegarde acceptée à tort');
  }
  return result.error;
}

/** Sauvegarde valide d'un bac tropical avancé et nourri, en données modifiables. */
function validData(): Record<string, unknown> {
  const world = advance(feed(advance(createDefaultWorld(42), 120), 0.1, 0), 30);
  return JSON.parse(serializeWorld(world)) as Record<string, unknown>;
}

/** Relit `data` modifié par `mutate` (données JSON). */
function parseMutated(mutate: (data: Record<string, unknown>) => void): ParseWorldResult {
  const data = validData();
  mutate(data);
  return parseWorld(JSON.stringify(data));
}

function fishOf(data: Record<string, unknown>): Record<string, unknown>[] {
  return data['fish'] as Record<string, unknown>[];
}

function foodOf(data: Record<string, unknown>): Record<string, unknown>[] {
  return data['food'] as Record<string, unknown>[];
}

describe('serializeWorld / parseWorld : aller-retour', () => {
  it('écrit le format versionné attendu', () => {
    const data = saveData(createDefaultWorld(42));
    expect(data.format).toBe(SAVE_FORMAT);
    expect(data.schema).toBe(SAVE_SCHEMA);
    expect(data.seed).toBe(42);
    expect(data.environment).toBe('tropical');
    expect(data.tick).toBe(0);
    expect(data.fish).toHaveLength(createDefaultWorld(42).entities.length);
    expect(data.settings).toEqual(DEFAULT_SAVE_SETTINGS);
    // Ni obstacles (recalculés) ni `kind` (implicite) dans le fichier.
    expect(Object.keys(data)).not.toContain('obstacles');
    expect(Object.keys(data.fish[0])).not.toContain('kind');
  });

  it.each([
    ['monde neuf', () => createDefaultWorld(42)],
    ['monde avancé de 90 s', () => advance(createDefaultWorld(7), 5400)],
    [
      'monde nourri (granulés en chute et posés)',
      () => advance(feed(advance(createDefaultWorld(3), 60), 0.2, 0.05), 400),
    ],
    ['monde vide', () => createWorld(0)],
    ['bassin à koïs', () => advance(createDefaultWorld(42, 'bassin'), 1800)],
    ['paludarium (axolotls, #129, #130)', () => advance(createDefaultWorld(42, 'paludarium'), 600)],
    [
      'population réglée (identifiants non consécutifs)',
      () => setPopulation(setPopulation(createDefaultWorld(9), 'neon', 3), 'guppy', 9),
    ],
  ])(
    'restitue le %s sans perte',
    (_name, make) => {
      const world = make();
      const { world: back } = restored(parseWorld(serializeWorld(world)));
      expect(back).toEqual(world);
    },
    // Délai explicite (#244, docs/PIEGES.md) : ≈ 0,7 s en local, bien plus en CI lente.
    15_000,
  );

  it('restitue l’environnement récif (#148), poissons-clowns (#150), chirurgiens (#151) et granulés compris', () => {
    const world = advance(feed(createDefaultWorld(8, 'recif'), 0.2, -0.1), 90);
    expect(world.environment).toBe('recif');
    expect(world.entities.map((e) => e.species)).toEqual([
      'clown',
      'clown',
      'clown',
      ...new Array<string>(CHIRURGIEN.defaultPopulation).fill('chirurgien'),
    ]);
    expect(world.food.length).toBeGreaterThan(0);
    expect(world.decor.length).toBeGreaterThan(0);
    const text = serializeWorld(world);
    const { world: back } = restored(parseWorld(text));
    expect(back.environment).toBe('recif');
    expect(back).toEqual(world);
    // Le format ne change pas : même version, relue à l'identique (ADR 0028).
    const data = JSON.parse(text) as { format: string; schema: number };
    expect([data.format, data.schema]).toEqual([SAVE_FORMAT, SAVE_SCHEMA]);
    expect(serializeWorld(back)).toBe(text);
  });

  it('refuse un poisson d’une autre espèce dans une sauvegarde du récif (#148)', () => {
    const data = JSON.parse(serializeWorld(createDefaultWorld(4))) as Record<string, unknown>;
    data['environment'] = 'recif';
    expect(refusal(parseWorld(JSON.stringify(data)))).toMatch(
      /ne vit pas dans l’environnement recif/,
    );
  });

  it('les sauvegardes des autres environnements se relisent toujours (#148)', () => {
    for (const id of ['tropical', 'bassin', 'paludarium'] as const) {
      const text = serializeWorld(advance(createDefaultWorld(21, id), 120));
      const { world: back } = restored(parseWorld(text));
      expect(back.environment).toBe(id);
      expect(serializeWorld(back)).toBe(text);
    }
  });

  it('restitue l’environnement paludarium (#129)', () => {
    const world = advance(createDefaultWorld(8, 'paludarium'), 120);
    expect(world.environment).toBe('paludarium');
    const { world: back } = restored(parseWorld(serializeWorld(world)));
    expect(back.environment).toBe('paludarium');
    expect(back).toEqual(world);
  });

  it('restitue la population par espèce et les robes du bassin à koïs', () => {
    const world = setPopulation(advance(createDefaultWorld(1234, 'bassin'), 600), 'koi', 4);
    const { world: back } = restored(parseWorld(serializeWorld(world)));
    expect(back.environment).toBe('bassin');
    expect(populationCounts(back)).toEqual(populationCounts(world));
    // Les robes dérivent de la graine et de l'identifiant : mêmes graine et identifiants.
    expect(back.seed).toBe(world.seed);
    expect(back.entities.map((f) => [f.id, f.species])).toEqual(
      world.entities.map((f) => [f.id, f.species]),
    );
  });

  it('restitue les réglages de vitesse, d’heure, de rendu des granulés et de la pièce', () => {
    const settings: SaveSettings = {
      speed: 4,
      clock: createDayClock(18.5, 1200, true),
      foodStyle: 'voxels',
      room: { shown: true, cabinetHeight: 0.9 },
    };
    const { settings: back } = restored(
      parseWorld(serializeWorld(createDefaultWorld(1), settings)),
    );
    expect(back).toEqual(settings);
  });

  it('restitue un décor édité (#167) : éléments ajoutés et retirés, obstacles recalculés', () => {
    let decor = addDecorItem(DEFAULT_DECOR, 'rock', 0.05, 0.12, 42, 'tropical')!;
    decor = addDecorItem(decor, 'tuft', -0.25, -0.05, 42, 'tropical')!;
    decor = removeDecorItem(decor, 3)!;
    const world = withDecor(advance(createDefaultWorld(42), 20), decor);
    const result = parseWorld(serializeWorld(world));
    expect(result.ok).toBe(true);
    expect(result.ok && result.world).toEqual(world);
    expect(result.ok && result.world.decor).toEqual(decor);
  });

  it('ne partage aucune donnée avec le monde sauvegardé', () => {
    const world = createDefaultWorld(42);
    const data = saveData(world);
    expect(data.decor[0]).not.toBe(world.decor[0]);
    const { world: back } = restored(parseSaveData(structuredClone(data)));
    expect(back.entities[0]).not.toBe(world.entities[0]);
  });

  it('récif (#149) : coraux recalculés de la graine, sans champ nouveau ; explicite refusé', () => {
    const world = createDefaultWorld(42, 'recif');
    expect(world.obstacles.length).toBeGreaterThan(world.decor.length);
    const text = serializeWorld(world);
    expect(text).not.toContain('corail');
    expect(text).not.toContain('box');
    const { world: back } = restored(parseWorld(text));
    expect(back.obstacles).toEqual(world.obstacles);
    const extra = createWorld(42, [], [sphereObstacle(0, 0, 0.2, 0, 0.05)], world.decor, 'recif');
    expect(() => serializeWorld(extra)).toThrow(RangeError);
  });

  it('récif (#159) : la sauvegarde ne recalcule pas la disposition des coraux', () => {
    // Comme l'hôte (`ui/aquarium-host`) : un seul monde, modifié en place, sauvegardé souvent.
    const world = cloneWorld(createDefaultWorld(42, 'recif'));
    setPopulationInPlace(world, 'clown', 5);
    const first = serializeWorld(world);
    const before = worldFeatureComputations();
    for (let n = 0; n < 3; n++) {
      feedInPlace(world, 0.1, 0);
      advanceInPlace(world, 120);
      saveData(world);
    }
    serializeWorld(world);
    expect(worldFeatureComputations()).toBe(before);
    // Disposition en cache identique à celle tirée de la graine, figée ; aller-retour inchangé.
    const { corals, anemones } = seededFeatures(42, 'recif', world.decor);
    expect(worldFeatures(world).corals).toEqual(corals);
    expect(worldFeatures(world).anemones).toEqual(anemones);
    expect(Object.isFrozen(worldFeatures(world).corals)).toBe(true);
    const { world: back } = restored(parseWorld(first));
    expect(serializeWorld(back)).toBe(first);
    // Un tableau de décor neuf (copie du monde) : un seul calcul, puis plus aucun.
    const copy = cloneWorld(back);
    const afterCopy = worldFeatureComputations();
    serializeWorld(copy);
    serializeWorld(copy);
    expect(worldFeatureComputations()).toBe(afterCopy + 1);
    expect(serializeWorld(copy)).toBe(first);
  });

  it('les environnements sans coraux ni anémones ne calculent rien', () => {
    const before = worldFeatureComputations();
    const world = createDefaultWorld(42);
    serializeWorld({ ...world, decor: [...world.decor] });
    expect(worldFeatureComputations()).toBe(before);
    expect(worldFeatures(world).corals).toEqual([]);
  });

  it('refuse d’écrire un monde à obstacles explicites (hors décor)', () => {
    const world = createWorld(1, [], [sphereObstacle(0, 0, 0.2, 0, 0.05)]);
    expect(() => serializeWorld(world)).toThrow(RangeError);
  });

  it('granulés en voxels si le réglage n’est pas donné, à l’écriture comme à la relecture (#226)', () => {
    const settings: SaveSettings = { speed: 2, clock: createDayClock(9, 1200, false) };
    const data = saveData(createDefaultWorld(1), settings);
    expect(data.settings.foodStyle).toBe('voxels');
    expect(restored(parseSaveData(structuredClone(data))).settings.foodStyle).toBe('voxels');
  });

  it('respecte un choix déjà enregistré, points comme voxels (#226)', () => {
    for (const foodStyle of ['points', 'voxels'] as const) {
      const settings: SaveSettings = { speed: 1, clock: createDayClock(9, 1200, false), foodStyle };
      const data = structuredClone(saveData(createDefaultWorld(1), settings));
      expect(restored(parseSaveData(data)).settings.foodStyle).toBe(foodStyle);
    }
  });

  it('écrit et restitue l’état de l’eau (#206), changement d’eau compris', () => {
    const world = changeWorldWater(advance(createDefaultWorld(42, 'bassin'), 3600));
    const data = saveData(world);
    expect(data.water).toEqual(world.water);
    expect(data.water).not.toBe(world.water);
    expect(world.water.nitrite).toBeGreaterThan(0);
    const { world: back } = restored(parseWorld(serializeWorld(world)));
    expect(back.water).toEqual(world.water);
    expect(JSON.stringify(back.water)).toBe(JSON.stringify(world.water));
  });

  it('écrit et restitue la consigne du chauffage (#207) ; relu, le monde avance au bit près', () => {
    const world = setWorldHeater(createDefaultWorld(42), 29.5);
    const { world: back } = restored(parseWorld(serializeWorld(world)));
    expect(back.water.heater).toBe(29.5);
    expect(advance(back, 600)).toEqual(advance(world, 600));
  });

  it('écrit et restitue le pH (#236) ; relu, le monde avance au bit près', () => {
    const world = changeWorldWater(advance(createDefaultWorld(42, 'recif'), 1800));
    expect(world.water.ph).toBeLessThan(freshWater('recif').ph);
    const data = saveData(world);
    expect(data.water?.ph).toBe(world.water.ph);
    const { world: back } = restored(parseWorld(serializeWorld(world)));
    expect(back.water.ph).toBe(world.water.ph);
    expect(advance(back, 600)).toEqual(advance(world, 600));
  });

  it('accepte une ancienne sauvegarde d’eau sans pH (#236) : pH de l’eau neuve du lieu', () => {
    const world = advance(createDefaultWorld(42, 'bassin'), 600);
    const data = structuredClone(saveData(world)) as unknown as {
      water: Record<string, unknown>;
    };
    delete data.water['ph'];
    const { world: back } = restored(parseSaveData(data));
    expect(back.water).toEqual({ ...world.water, ph: freshWater('bassin').ph });
  });

  it('refuse un pH hors de [4 ; 9,5] (#236)', () => {
    const data = validData();
    data['water'] = { ...freshWater('tropical'), ph: 10 };
    expect(refusal(parseSaveData(data))).toMatch(/^eau : ph/);
  });

  it('refuse une consigne du chauffage hors bornes (#207)', () => {
    const data = validData();
    data['water'] = { ...freshWater('tropical'), heater: 45 };
    expect(refusal(parseSaveData(data))).toMatch(/^eau : heater/);
  });

  it('accepte une ancienne sauvegarde sans eau : eau saine, même schéma (#206)', () => {
    const data = validData();
    expect(data['water']).toBeDefined();
    delete data['water'];
    const { world } = restored(parseSaveData(data));
    expect(world.water).toEqual(freshWater('tropical'));
    expect(SAVE_SCHEMA).toBe(1);
  });

  it.each([
    ['null', null],
    ['texte', 'saine'],
    ['nitrates négatifs', { ...freshWater('tropical'), nitrate: -1 }],
    ['filtre au-delà de 1', { ...freshWater('tropical'), filter: 2 }],
    ['champ manquant', { temperature: 25 }],
  ])('refuse une eau invalide (#206) : %s', (_name, water) => {
    const data = validData();
    data['water'] = water;
    expect(refusal(parseSaveData(data))).toMatch(/^eau : /);
  });

  it('accepte une ancienne sauvegarde sans rendu des granulés (#117) : voxels (#226)', () => {
    const data = structuredClone(saveData(createDefaultWorld(3))) as unknown as {
      settings: Record<string, unknown>;
    };
    delete data.settings['foodStyle'];
    const { settings } = restored(parseSaveData(data));
    expect(settings.foodStyle).toBe('voxels');
    expect(settings.speed).toBe(DEFAULT_SAVE_SETTINGS.speed);
  });

  it('refuse un rendu des granulés inconnu, à l’écriture comme à la lecture', () => {
    for (const foodStyle of ['cubes', '', null, 1, { points: true }]) {
      const data = structuredClone(saveData(createDefaultWorld(3))) as unknown as {
        settings: Record<string, unknown>;
      };
      data.settings['foodStyle'] = foodStyle;
      const result = parseSaveData(data);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/rendu des granulés inconnu/);
      }
    }
    const bad = { ...DEFAULT_SAVE_SETTINGS, foodStyle: 'cubes' } as unknown as SaveSettings;
    expect(() => serializeWorld(createWorld(1), bad)).toThrow(/granulés/);
  });

  it('pièce masquée si le réglage n’est pas donné, à l’écriture comme à la relecture (#187)', () => {
    const settings: SaveSettings = { speed: 2, clock: createDayClock(9, 1200, false) };
    const data = saveData(createDefaultWorld(1), settings);
    expect(data.settings.room).toEqual(DEFAULT_ROOM);
    expect(restored(parseSaveData(structuredClone(data))).settings.room).toEqual(DEFAULT_ROOM);
  });

  it('accepte une sauvegarde de chaque lieu écrite avant le statut légal (#269)', () => {
    // Le statut légal et le nom Hoplisoma ne sont pas sauvegardés : une sauvegarde v1.0.6 se
    // relit telle quelle (identifiants d'espèces inchangés).
    for (const env of ['tropical', 'recif', 'bassin', 'paludarium'] as const) {
      const world = createDefaultWorld(5, env);
      const before = populationCounts(world);
      const { world: back } = restored(parseWorld(serializeWorld(world)));
      expect(populationCounts(back), env).toEqual(before);
    }
  });

  it('ancienne sauvegarde du paludarium (#270) : grenouilles et tritons migrés vers les espèces réelles', () => {
    // Avant #270, `grenouille` et `triton` désignaient Anura et Salamandridae ; les noms ne
    // sont jamais écrits (ADR 0064) : la migration est l'identité, monde affiché et `others`.
    const paludarium = advance(createDefaultWorld(11, 'paludarium'), 90);
    const counts = populationCounts(paludarium);
    expect(counts.grenouille).toBeGreaterThan(0);
    expect(counts.triton).toBeGreaterThan(0);
    const shownText = serializeWorld(paludarium);
    const otherText = serializeWorld(createDefaultWorld(11), DEFAULT_SAVE_SETTINGS, [paludarium]);
    for (const text of [shownText, otherText]) {
      expect(text).not.toMatch(/Anura|Salamandridae|Bombina|Cynops/);
      const back = restored(parseWorld(text));
      const world = back.world.environment === 'paludarium' ? back.world : back.others[0];
      expect(world).toEqual(paludarium);
      const species = new Set(
        world.entities.flatMap((e) => (e.kind === 'fish' ? [e.species] : [])),
      );
      expect(species).toContain('grenouille');
      expect(species).toContain('triton');
    }
    expect(SPECIES.grenouille.scientificName).toBe('Bombina orientalis');
    expect(SPECIES.triton.scientificName).toBe('Cynops orientalis');
  });

  it('accepte une ancienne sauvegarde sans pièce : pièce masquée, même schéma (#187)', () => {
    const data = structuredClone(saveData(createDefaultWorld(3))) as unknown as {
      schema: number;
      settings: Record<string, unknown>;
    };
    delete data.settings['room'];
    expect(data.schema).toBe(SAVE_SCHEMA);
    const { settings, world } = restored(parseSaveData(data));
    expect(settings.room).toEqual(DEFAULT_ROOM);
    expect(world.entities.length).toBeGreaterThan(0);
  });

  it('borne une hauteur de meuble hors bornes, à l’écriture comme à la lecture (#187)', () => {
    const data = structuredClone(saveData(createDefaultWorld(3))) as unknown as {
      settings: Record<string, unknown>;
    };
    data.settings['room'] = { shown: true, cabinetHeight: 7 };
    expect(restored(parseSaveData(data)).settings.room).toEqual({ shown: true, cabinetHeight: 1 });
    data.settings['room'] = { shown: false, cabinetHeight: -3 };
    expect(restored(parseSaveData(data)).settings.room).toEqual({
      shown: false,
      cabinetHeight: 0.6,
    });
    const written = saveData(createDefaultWorld(3), {
      ...DEFAULT_SAVE_SETTINGS,
      room: { shown: true, cabinetHeight: 0.73 },
    });
    expect(written.settings.room).toEqual({ shown: true, cabinetHeight: 0.75 });
  });

  it('refuse une pièce mal formée, à l’écriture comme à la lecture (#187)', () => {
    for (const room of [
      null,
      'oui',
      1,
      [],
      {},
      { shown: 'true' },
      { shown: true, cabinetHeight: '0.8' },
    ]) {
      const data = structuredClone(saveData(createDefaultWorld(3))) as unknown as {
        settings: Record<string, unknown>;
      };
      data.settings['room'] = room;
      const result = parseSaveData(data);
      expect(result.ok, JSON.stringify(room)).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/pièce/);
      }
    }
    const bad = { ...DEFAULT_SAVE_SETTINGS, room: { shown: 1 } } as unknown as SaveSettings;
    expect(() => serializeWorld(createWorld(1), bad)).toThrow(/pièce/);
  });

  it('relit les meubles reposés, sans chevauchement (#200, cas 2)', () => {
    const data = structuredClone(saveData(createDefaultWorld(3))) as unknown as {
      settings: Record<string, unknown>;
    };
    const shelf = { kind: 'etagere', x: -1.25, z: -0.17, quarter: 0 };
    data.settings['room'] = {
      shown: true,
      cabinetHeight: 0.75,
      items: [
        shelf,
        { kind: 'table-basse', x: -1.45, z: 0.55, quarter: 0, elevation: 0.5 },
        { ...shelf, x: -1.3 },
      ],
    };
    expect(restored(parseSaveData(data)).settings.room).toEqual({
      shown: true,
      cabinetHeight: 0.75,
      items: [shelf, { kind: 'table-basse', x: -1.45, z: 0.55, quarter: 0 }],
    });
  });

  it('ignore les champs inconnus et hérités de la pièce (#187)', () => {
    const data = JSON.parse(serializeWorld(createDefaultWorld(3))) as {
      settings: Record<string, unknown>;
    };
    data.settings['room'] = JSON.parse(
      '{"shown":true,"couleur":"rouge","__proto__":{"cabinetHeight":0.9}}',
    );
    expect(restored(parseWorld(JSON.stringify(data))).settings.room).toEqual({
      shown: true,
      cabinetHeight: DEFAULT_ROOM.cabinetHeight,
    });
  });

  it('refuse d’écrire des réglages invalides', () => {
    const bad = { speed: 3, clock: DEFAULT_SAVE_SETTINGS.clock } as unknown as SaveSettings;
    expect(() => serializeWorld(createWorld(1), bad)).toThrow(/vitesse/);
  });
});

describe('déterminisme après rechargement', () => {
  it.each([
    [42, 'tropical'],
    [7, 'tropical'],
    [99, 'bassin'],
    [5, 'paludarium'],
    [13, 'recif'],
  ] as const)(
    'graine %s (%s) : sauvegardé, rechargé puis avancé = jamais sauvegardé',
    (seed, environment) => {
      const saved = advance(feed(advance(createDefaultWorld(seed, environment), 300), 0, 0), 120);
      const { world: reloaded } = restored(parseWorld(serializeWorld(saved)));
      const steps = 1800;
      const continued = advance(saved, steps);
      const afterReload = advance(reloaded, steps);
      expect(afterReload).toEqual(continued);
      // `toEqual` compare les nombres avec `Object.is` : égalité au bit près, signe des
      // zéros compris ; le texte JSON doit aussi être identique.
      expect(JSON.stringify(afterReload)).toBe(JSON.stringify(continued));
      expect(afterReload.time).toBe(continued.time);
    },
    15_000,
  );

  it('un monde rechargé deux fois de suite reste identique', () => {
    const world = advance(createDefaultWorld(5), 900);
    const once = serializeWorld(world);
    expect(serializeWorld(restored(parseWorld(once)).world)).toBe(once);
  });
});

describe('parseWorld : refus', () => {
  it.each([
    ['texte vide', ''],
    ['JSON tronqué', '{"format":"aqfish"'],
    ['nombre', '42'],
    ['null', 'null'],
    ['tableau', '[]'],
    ['chaîne', '"aqfish"'],
  ])('refuse un %s sans lever', (_name, text) => {
    expect(refusal(parseWorld(text))).toMatch(/JSON|objet/);
  });

  it('refuse un fichier qui n’est pas une sauvegarde aqfish', () => {
    expect(refusal(parseWorld('{"schema":1}'))).toMatch(/pas une sauvegarde aqfish/);
  });

  it.each([0, 2, '1', null])('refuse le schéma %s (version inconnue)', (schema) => {
    expect(refusal(parseMutated((d) => (d['schema'] = schema)))).toMatch(/version/);
  });

  it('refuse un fichier trop volumineux avant de le décoder', () => {
    const big = `{"format":"aqfish","pad":"${'x'.repeat(MAX_SAVE_LENGTH)}"}`;
    expect(refusal(parseWorld(big))).toMatch(/trop volumineux/);
  });

  it('refuse un environnement inconnu, y compris une clé héritée', () => {
    expect(refusal(parseMutated((d) => (d['environment'] = 'lune')))).toMatch(/environnement/);
    expect(refusal(parseMutated((d) => (d['environment'] = 'constructor')))).toMatch(
      /environnement/,
    );
  });

  it.each([
    ['seed', -1],
    ['seed', 2 ** 32],
    ['seed', 1.5],
    ['tick', -1],
    ['tick', 0.5],
    ['tick', 2 ** 40],
    ['nextFishId', 'a'],
    ['nextFoodId', -3],
  ])('refuse %s = %s', (key, value) => {
    expect(refusal(parseMutated((d) => (d[key] = value)))).toContain(key);
  });

  it('refuse un nombre infini (1e999) ou absent', () => {
    const text = serializeWorld(createDefaultWorld(42)).replace(
      /("species":"neon","x":)[^,]+/,
      (_match, prefix: string) => `${prefix}1e999`,
    );
    expect(text).toContain('"x":1e999');
    expect(refusal(parseWorld(text))).toMatch(/x doit être un nombre fini/);
    expect(refusal(parseMutated((d) => delete fishOf(d)[0]['yaw']))).toMatch(/yaw/);
  });

  it.each([
    ['x', 5],
    ['y', -1],
    ['px', 10],
    ['yaw', 4],
    ['pitch', 2],
    ['speed', 0],
    ['speed', 3],
    ['turn', 50],
    ['phase', -0.1],
    ['hunger', 1.5],
    ['ascent', -1],
    ['rng', -1],
    ['rng', 0.5],
  ])('refuse un poisson avec %s = %s', (key, value) => {
    expect(refusal(parseMutated((d) => (fishOf(d)[0][key] = value)))).toMatch(/poisson 0/);
  });

  it('refuse un poisson d’espèce inconnue ou absente de l’environnement', () => {
    expect(refusal(parseMutated((d) => (fishOf(d)[0]['species'] = 'requin')))).toMatch(
      /espèce inconnue/,
    );
    expect(refusal(parseMutated((d) => (fishOf(d)[0]['species'] = 'toString')))).toMatch(
      /espèce inconnue/,
    );
    expect(refusal(parseMutated((d) => (fishOf(d)[0]['species'] = 'koi')))).toMatch(/ne vit pas/);
  });

  it('refuse des identifiants de poisson en double, décroissants ou au-delà de nextFishId', () => {
    expect(refusal(parseMutated((d) => (fishOf(d)[1]['id'] = fishOf(d)[0]['id'])))).toMatch(
      /croissants/,
    );
    expect(refusal(parseMutated((d) => (d['nextFishId'] = 1)))).toMatch(/nextFishId/);
  });

  it('refuse plus de poissons que les bornes de population', () => {
    expect(
      refusal(
        parseMutated((d) => {
          const fish = fishOf(d);
          d['fish'] = Array.from({ length: MAX_TOTAL_FISH + 1 }, (_, i) => ({ ...fish[0], id: i }));
        }),
      ),
    ).toMatch(/trop de poissons/);
    expect(
      refusal(
        parseMutated((d) => {
          const neon = fishOf(d)[0];
          d['fish'] = Array.from({ length: 41 }, (_, i) => ({ ...neon, id: i }));
          d['nextFishId'] = 41;
        }),
      ),
    ).toMatch(/trop de neon/);
  });

  it('refuse un granulé invalide ou un excès de granulés', () => {
    expect(foodOf(validData()).length).toBeGreaterThan(0);
    expect(refusal(parseMutated((d) => (foodOf(d)[0]['y'] = 9)))).toMatch(/granulé 0/);
    expect(refusal(parseMutated((d) => (foodOf(d)[0]['floatTime'] = 100)))).toMatch(/floatTime/);
    expect(refusal(parseMutated((d) => (d['nextFoodId'] = 0)))).toMatch(/nextFoodId/);
    expect(
      refusal(
        parseMutated((d) => {
          const pellet = foodOf(d)[0];
          d['food'] = Array.from({ length: MAX_FOOD + 1 }, (_, i) => ({ ...pellet, id: i }));
          d['nextFoodId'] = MAX_FOOD + 1;
        }),
      ),
    ).toMatch(/trop de granulés/);
  });

  it('refuse un décor invalide ou trop long', () => {
    expect(refusal(parseMutated((d) => (d['decor'] = 'rochers')))).toMatch(/decor/);
    expect(
      refusal(parseMutated((d) => ((d['decor'] as Record<string, unknown>[])[0]['x'] = 9))),
    ).toMatch(/décor/);
    expect(
      refusal(
        parseMutated((d) => {
          const item = (d['decor'] as unknown[])[0];
          d['decor'] = Array.from({ length: MAX_SAVE_DECOR + 1 }, () => item);
        }),
      ),
    ).toMatch(/trop d’éléments de décor/);
  });

  it.each([
    ['vitesse inconnue', (s: Record<string, unknown>) => (s['speed'] = 3)],
    [
      'heure 24',
      (s: Record<string, unknown>) => ((s['clock'] as Record<string, unknown>)['startHour'] = 24),
    ],
    [
      'heure négative',
      (s: Record<string, unknown>) => ((s['clock'] as Record<string, unknown>)['startHour'] = -1),
    ],
    [
      'journée nulle',
      (s: Record<string, unknown>) =>
        ((s['clock'] as Record<string, unknown>)['dayLengthSeconds'] = 0),
    ],
    [
      'frozen non booléen',
      (s: Record<string, unknown>) => ((s['clock'] as Record<string, unknown>)['frozen'] = 'oui'),
    ],
    ['horloge absente', (s: Record<string, unknown>) => delete s['clock']],
  ])('refuse des réglages invalides : %s', (_name, mutate) => {
    expect(parseMutated((d) => mutate(d['settings'] as Record<string, unknown>)).ok).toBe(false);
    expect(parseMutated((d) => delete d['settings']).ok).toBe(false);
  });

  it('limite la longueur du message d’erreur', () => {
    const error = refusal(
      parseMutated((d) => {
        for (const fish of fishOf(d)) {
          fish['x'] = 99;
        }
      }),
    );
    expect(error.split(' ; ').length).toBeLessThanOrEqual(6);
  });
});

describe('parseWorld : champs inconnus et prototypes', () => {
  it('ignore les champs inconnus, à tous les niveaux', () => {
    const result = parseMutated((d) => {
      d['commentaire'] = 'bonjour';
      fishOf(d)[0]['couleur'] = 'rouge';
      foodOf(d)[0]['goût'] = 'crevette';
      (d['settings'] as Record<string, unknown>)['volume'] = 11;
    });
    const { world } = restored(result);
    expect(Object.keys(world)).not.toContain('commentaire');
    expect(Object.keys(world.entities[0])).not.toContain('couleur');
    expect(Object.keys(world.food[0])).not.toContain('goût');
  });

  it('ne lit ni ne pollue les prototypes (__proto__, constructor)', () => {
    const base = serializeWorld(createDefaultWorld(42));
    // Champ obligatoire fourni seulement par un faux prototype : ignoré, donc refusé.
    const viaProto = base.replace('"tick":0,', '"__proto__":{"tick":0},');
    expect(refusal(parseWorld(viaProto))).toMatch(/tick/);
    const hostile = base.replace(
      '{"format"',
      '{"__proto__":{"pollue":true},"constructor":{"prototype":{"pollue":true}},"format"',
    );
    const { world } = restored(parseWorld(hostile));
    expect(({} as Record<string, unknown>)['pollue']).toBeUndefined();
    expect(Object.getPrototypeOf(world)).toBe(Object.prototype);
  });

  it('ne plante pas sur un JSON très imbriqué', () => {
    const deep = '['.repeat(50_000) + ']'.repeat(50_000);
    expect(parseWorld(deep).ok).toBe(false);
  });

  // Délai explicite (#244, docs/PIEGES.md) : ≈ 0,6 s en local, bien plus en CI lente.
  it('refuse sans lever des types inattendus partout', () => {
    for (const key of ['decor', 'fish', 'food', 'settings']) {
      for (const value of [null, 1, 'x', {}, [null], [1]]) {
        const result = parseMutated((d) => (d[key] = value));
        expect(result.ok).toBe(false);
      }
    }
    expect(parseWorld(undefined as unknown as string).ok).toBe(false);
  }, 15_000);
});

describe('autres environnements visités (others, #277)', () => {
  /** Monde d'un environnement modifié : un animal de moins, nourri, avancé. */
  function played(seed: number, environment: EnvironmentId): World {
    const env = environmentById(environment);
    const first = env.population[0];
    const fewer = setPopulation(
      advance(createDefaultWorld(seed, environment), 60),
      first.species,
      Math.max(0, first.count - 1),
    );
    return advance(feed(fewer, 0, 0), 45);
  }

  /** Monde aussi lourd que possible : population maximale, granulés au plafond. */
  function heaviest(seed: number, environment: EnvironmentId): World {
    let world = createDefaultWorld(seed, environment);
    for (const species of environmentById(environment).species) {
      world = setPopulation(world, species, SPECIES[species].maxPopulation);
    }
    for (let i = 0; i < MAX_FOOD; i++) {
      world = feed(world, 0.01 * (i % 7), -0.01 * (i % 5));
    }
    return advance(world, 3);
  }

  it('sans autre environnement : aucun champ others, texte identique à avant', () => {
    const world = played(42, 'tropical');
    const text = serializeWorld(world);
    expect(serializeWorld(world, DEFAULT_SAVE_SETTINGS, [])).toBe(text);
    expect(Object.keys(JSON.parse(text) as object)).not.toContain('others');
    expect(restored(parseWorld(text))).toMatchObject({ others: [] });
  });

  it('aller-retour avec plusieurs environnements : chacun relu sans perte, ordre stable', () => {
    const shown = played(42, 'bassin');
    const others = [played(42, 'recif'), played(42, 'tropical'), played(42, 'paludarium')];
    const text = serializeWorld(shown, DEFAULT_SAVE_SETTINGS, others);
    const data = JSON.parse(text) as { others: { environment: string; settings?: unknown }[] };
    expect(data.others.map((o) => o.environment)).toEqual(['tropical', 'paludarium', 'recif']);
    // Le corps d'un autre environnement n'a ni format, ni schéma, ni réglages.
    expect(Object.keys(data.others[0])).not.toContain('settings');
    expect(Object.keys(data.others[0])).not.toContain('schema');
    const back = restored(parseWorld(text));
    expect(back.world).toEqual(shown);
    expect(back.others).toEqual([others[1], others[2], others[0]]);
    // Relu puis réécrit : même texte ; relu puis avancé : même état qu'avant, au bit près.
    expect(serializeWorld(back.world, back.settings, back.others)).toBe(text);
    expect(JSON.stringify(advance(back.others[0], 600))).toBe(
      JSON.stringify(advance(others[1], 600)),
    );
  });

  it('les quatre environnements au plus lourd tiennent sous la limite de taille', () => {
    const [shown, ...rest] = ENVIRONMENT_IDS.map((id) => heaviest(3, id));
    const text = serializeWorld(shown, DEFAULT_SAVE_SETTINGS, rest);
    expect(text.length).toBeLessThan(MAX_SAVE_LENGTH);
    expect(restored(parseWorld(text)).others).toHaveLength(ENVIRONMENT_IDS.length - 1);
  }, 30_000);

  it('refuse d’écrire deux mondes du même environnement', () => {
    const tropical = createDefaultWorld(1);
    expect(() => saveData(tropical, DEFAULT_SAVE_SETTINGS, [createDefaultWorld(2)])).toThrow(
      /double/,
    );
    const pond = createDefaultWorld(1, 'bassin');
    expect(() => saveData(tropical, DEFAULT_SAVE_SETTINGS, [pond, pond])).toThrow(/double/);
    const explicit = createWorld(1, [], [sphereObstacle(0, 0, 0.2, 0, 0.05)], [], 'bassin');
    expect(() => saveData(tropical, DEFAULT_SAVE_SETTINGS, [explicit])).toThrow(/obstacles/);
  });

  it('une version antérieure (sans others) se relit : aucun autre environnement', () => {
    const data = JSON.parse(serializeWorld(played(5, 'tropical'))) as Record<string, unknown>;
    delete data['others'];
    expect(restored(parseSaveData(data)).others).toEqual([]);
  });

  /** Sauvegarde valide avec le bassin rangé, modifiée par `mutate`. */
  function withOthers(mutate: (others: Record<string, unknown>[]) => unknown): ParseWorldResult {
    const data = JSON.parse(
      serializeWorld(createDefaultWorld(4), DEFAULT_SAVE_SETTINGS, [played(4, 'bassin')]),
    ) as Record<string, unknown>;
    const replaced = mutate(data['others'] as Record<string, unknown>[]);
    if (replaced !== undefined) {
      data['others'] = replaced;
    }
    return parseSaveData(data);
  }

  it.each([
    ['others qui n’est pas une liste', () => ({}), /others doit être une liste/],
    ['un élément qui n’est pas un objet', () => [42], /autre environnement 0 : doit être un objet/],
    [
      'l’environnement affiché en double',
      (o: Record<string, unknown>[]) => [{ ...o[0], environment: 'tropical' }],
      /autre environnement tropical : en double/,
    ],
    [
      'deux fois le même environnement',
      (o: Record<string, unknown>[]) => [o[0], o[0]],
      /autre environnement bassin : en double/,
    ],
    [
      'trop d’éléments',
      (o: Record<string, unknown>[]) => [o[0], o[0], o[0], o[0]],
      /trop d’autres environnements/,
    ],
    [
      'un environnement inconnu',
      (o: Record<string, unknown>[]) => [{ ...o[0], environment: 'lune' }],
      /autre environnement 0 : environnement inconnu/,
    ],
    [
      'un corps corrompu',
      (o: Record<string, unknown>[]) => [{ ...o[0], tick: -1 }],
      /autre environnement bassin : tick/,
    ],
    [
      'un poisson d’un autre environnement',
      (o: Record<string, unknown>[]) => [{ ...o[0], environment: 'recif' }],
      /autre environnement recif : poisson 0 : l’espèce koi/,
    ],
  ])('refuse %s, sans lever', (_name, mutate, message) => {
    expect(refusal(withOthers(mutate))).toMatch(message);
  });

  it('ignore les champs inconnus d’un autre environnement', () => {
    const result = withOthers((o) => [{ ...o[0], settings: 'x', format: 1, inconnu: true }]);
    expect(restored(result).others).toHaveLength(1);
  });
});
