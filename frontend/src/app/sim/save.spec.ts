import { createDayClock } from './daylight';
import { MAX_FOOD } from './food';
import { MAX_TOTAL_FISH, populationCounts, setPopulation } from './population';
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
import { sphereObstacle } from './obstacles';
import { advance, createDefaultWorld, createWorld, feed, type World } from './world';

/** Monde restauré, ou échec du test avec le message de refus. */
function restored(result: ParseWorldResult): { world: World; settings: SaveSettings } {
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
    [
      'population réglée (identifiants non consécutifs)',
      () => setPopulation(setPopulation(createDefaultWorld(9), 'neon', 3), 'guppy', 9),
    ],
  ])('restitue le %s sans perte', (_name, make) => {
    const world = make();
    const { world: back } = restored(parseWorld(serializeWorld(world)));
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

  it('restitue les réglages de vitesse, d’heure et de rendu des granulés', () => {
    const settings: SaveSettings = {
      speed: 4,
      clock: createDayClock(18.5, 1200, true),
      foodStyle: 'voxels',
    };
    const { settings: back } = restored(
      parseWorld(serializeWorld(createDefaultWorld(1), settings)),
    );
    expect(back).toEqual(settings);
  });

  it('ne partage aucune donnée avec le monde sauvegardé', () => {
    const world = createDefaultWorld(42);
    const data = saveData(world);
    expect(data.decor[0]).not.toBe(world.decor[0]);
    const { world: back } = restored(parseSaveData(structuredClone(data)));
    expect(back.entities[0]).not.toBe(world.entities[0]);
  });

  it('refuse d’écrire un monde à obstacles explicites (hors décor)', () => {
    const world = createWorld(1, [], [sphereObstacle(0, 0, 0.2, 0, 0.05)]);
    expect(() => serializeWorld(world)).toThrow(RangeError);
  });

  it('granulés en points si le réglage n’est pas donné, à l’écriture comme à la relecture', () => {
    const settings: SaveSettings = { speed: 2, clock: createDayClock(9, 1200, false) };
    const data = saveData(createDefaultWorld(1), settings);
    expect(data.settings.foodStyle).toBe('points');
    expect(restored(parseSaveData(structuredClone(data))).settings.foodStyle).toBe('points');
  });

  it('accepte une ancienne sauvegarde sans rendu des granulés (#117)', () => {
    const data = structuredClone(saveData(createDefaultWorld(3))) as unknown as {
      settings: Record<string, unknown>;
    };
    delete data.settings['foodStyle'];
    const { settings } = restored(parseSaveData(data));
    expect(settings.foodStyle).toBe('points');
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
    expect(refusal(parseMutated((d) => (d['environment'] = 'recif')))).toMatch(/environnement/);
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

  it('refuse sans lever des types inattendus partout', () => {
    for (const key of ['decor', 'fish', 'food', 'settings']) {
      for (const value of [null, 1, 'x', {}, [null], [1]]) {
        const result = parseMutated((d) => (d[key] = value));
        expect(result.ok).toBe(false);
      }
    }
    expect(parseWorld(undefined as unknown as string).ok).toBe(false);
  });
});
