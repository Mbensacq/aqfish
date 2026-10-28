import { createDayClock } from './daylight';
import { DEFAULT_ROOM } from './room';
import {
  MAX_ROOM_SAVE_LENGTH,
  migrateSchema1,
  parseSave,
  parseSaveWorlds,
  roomSaveData,
  serializeRoom,
  type ParseSaveResult,
} from './room-save';
import { createRoom, MAX_ROOM_TANKS, stepRoom, tankSeed, type RoomState } from './room-state';
import {
  DEFAULT_SAVE_SETTINGS,
  MAX_SAVE_LENGTH,
  SAVE_FORMAT,
  SAVE_SCHEMA,
  SAVE_SCHEMA_1,
  serializeWorld,
  type SaveSettings,
} from './save';
import { MAX_TANK } from './tank';
import { environmentById } from './environment';
import { advance, createDefaultWorld, createWorld, feed, type World } from './world';

type Loaded = Extract<ParseSaveResult, { ok: true }>;

function loaded(result: ParseSaveResult): Loaded {
  if (!result.ok) {
    throw new Error(`sauvegarde refusée : ${result.error}`);
  }
  return result;
}

function refusal(result: ParseSaveResult): string {
  if (result.ok) {
    throw new Error('sauvegarde acceptée à tort');
  }
  return result.error;
}

/** Bac avancé et nourri : état non trivial (granulés, faim, eau). */
function played(seed: number, environment: World['environment'] = 'tropical'): World {
  return advance(feed(advance(createDefaultWorld(seed, environment), 90), 0, 0), 25);
}

/** Texte au schéma 1 d'un monde (comparaison au bit près). */
const text1 = (world: World): string => serializeWorld(world);

/** Pièce de trois bacs avancée. */
function room3(): RoomState {
  return stepRoom(createRoom(42, ['tropical', 'bassin', 'recif']), 60);
}

/** Document au schéma 2 valide, en données modifiables. */
function validDoc(): Record<string, unknown> {
  return JSON.parse(serializeRoom(room3(), 2)) as Record<string, unknown>;
}

function parseMutated(mutate: (doc: Record<string, unknown>) => void): ParseSaveResult {
  const doc = validDoc();
  mutate(doc);
  return parseSave(JSON.stringify(doc));
}

function tanksOf(doc: Record<string, unknown>): Record<string, unknown>[] {
  return doc['tanks'] as Record<string, unknown>[];
}

describe('serializeRoom / parseSave : schéma 2', () => {
  it('SAVE_SCHEMA vaut 2 et le document a la forme de l’ADR 0069', () => {
    expect(SAVE_SCHEMA).toBe(2);
    const doc = validDoc();
    expect(Object.keys(doc)).toEqual([
      'format',
      'schema',
      'seed',
      'tick',
      'nextTankId',
      'selectedTankId',
      'tanks',
      'settings',
    ]);
    expect(doc).toMatchObject({ format: SAVE_FORMAT, schema: 2, seed: 42, tick: 60 });
    expect(tanksOf(doc).map((t) => [t['id'], t['name'], t['place']])).toEqual([
      [0, 'Bac tropical', 'piece'],
      [1, 'Bassin', 'jardin'],
      [2, 'Récif', 'piece'],
    ]);
    // Corps du schéma 1, sans enveloppe ni réglages.
    const body = tanksOf(doc)[0]!['world'] as Record<string, unknown>;
    expect(body).not.toHaveProperty('format');
    expect(body).not.toHaveProperty('settings');
    expect(body['seed']).toBe(42);
  });

  it('aller-retour : la pièce relue est identique, et avance comme la pièce jamais sauvegardée', () => {
    const room = room3();
    const settings: SaveSettings = {
      speed: 2,
      clock: createDayClock(18.5, 600, true),
      foodStyle: DEFAULT_SAVE_SETTINGS.foodStyle,
      room: { ...DEFAULT_ROOM, shown: true },
    };
    const text = serializeRoom(room, 1, settings);
    const back = loaded(parseSave(text));
    expect(back.schema).toBe(2);
    expect(back.selectedTankId).toBe(1);
    expect(back.settings.speed).toBe(2);
    expect(back.settings.clock).toEqual(settings.clock);
    expect(back.settings.room?.shown).toBe(true);
    expect(back.room.tick).toBe(room.tick);
    expect(serializeRoom(back.room, 1, settings)).toBe(text);
    const clock = createDayClock(5, 120, false);
    expect(serializeRoom(stepRoom(back.room, 200, clock), 1)).toBe(
      serializeRoom(stepRoom(room, 200, clock), 1),
    );
  });

  it('bac sélectionné absent ou omis : le plus petit identifiant', () => {
    expect(loaded(parseMutated((d) => (d['selectedTankId'] = 7))).selectedTankId).toBe(0);
    expect(loaded(parseMutated((d) => delete d['selectedTankId'])).selectedTankId).toBe(0);
  });

  it('serializeRoom refuse une pièce incohérente', () => {
    const room = room3();
    expect(() => serializeRoom(room, 9)).toThrow(/sélectionné absent/);
    expect(() => serializeRoom({ ...room, nextTankId: 2 }, 0)).toThrow(/nextTankId/);
    expect(() => serializeRoom({ ...room, tanks: [...room.tanks].reverse() }, 0)).toThrow(
      /croissants/,
    );
    expect(() => roomSaveData({ ...room, tanks: [] }, 0)).toThrow(RangeError);
    expect(() => serializeRoom(room, 0, { ...DEFAULT_SAVE_SETTINGS, speed: 3 as never })).toThrow(
      /vitesse/,
    );
  });

  it('accepte le plafond de bacs, et les dimensions extrêmes', () => {
    const big = createRoom(
      1,
      Array.from({ length: MAX_ROOM_TANKS }, () => 'tropical' as const),
    );
    expect(loaded(parseSave(serializeRoom(big, 31))).room.tanks).toHaveLength(MAX_ROOM_TANKS);
    const huge = createWorld(5, environmentById('tropical').population, [], [], {
      environment: 'tropical',
      dimensions: MAX_TANK,
    });
    const room: RoomState = {
      ...createRoom(5),
      tanks: [{ ...createRoom(5).tanks[0]!, world: huge }],
    };
    const back = loaded(parseSave(serializeRoom(room, 0)));
    expect(back.room.tanks[0]!.world.dimensions).toEqual(MAX_TANK);
  });

  it.each<[string, (d: Record<string, unknown>) => void, RegExp]>([
    ['schéma inconnu', (d) => (d['schema'] = 3), /version de sauvegarde inconnue/],
    ['graine invalide', (d) => (d['seed'] = -1), /seed/],
    ['tick hors bornes', (d) => (d['tick'] = 2 ** 40), /tick/],
    ['compteur trop petit', (d) => (d['nextTankId'] = 2), /nextTankId/],
    ['sélection invalide', (d) => (d['selectedTankId'] = 'a'), /selectedTankId/],
    ['bacs absents', (d) => delete d['tanks'], /tanks doit être une liste/],
    ['aucun bac', (d) => (d['tanks'] = []), /nombre de bacs/],
    [
      'trop de bacs',
      (d) => (d['tanks'] = Array.from({ length: MAX_ROOM_TANKS + 1 }, () => ({}))),
      /nombre de bacs/,
    ],
    ['bac non objet', (d) => (tanksOf(d)[1] = 3 as never), /bac 1 : doit être un objet/],
    ['identifiants en désordre', (d) => tanksOf(d).reverse(), /croissants/],
    ['identifiant invalide', (d) => (tanksOf(d)[0]!['id'] = 1.5), /id doit être/],
    ['nom vide', (d) => (tanksOf(d)[0]!['name'] = '  '), /bac 0 : name/],
    ['nom trop long', (d) => (tanksOf(d)[0]!['name'] = 'x'.repeat(41)), /name trop long/],
    ['bassin dans la pièce', (d) => (tanksOf(d)[1]!['place'] = 'piece'), /jardin/],
    ['récif au jardin', (d) => (tanksOf(d)[2]!['place'] = 'jardin'), /piece/],
    [
      'deux bacs au jardin',
      (d) => {
        tanksOf(d)[2] = { ...tanksOf(d)[1], id: 2 };
      },
      /un seul bac au jardin/,
    ],
    ['monde absent', (d) => delete tanksOf(d)[0]!['world'], /bac 0 : world doit être un objet/],
    [
      'monde corrompu',
      (d) => ((tanksOf(d)[2]!['world'] as Record<string, unknown>)['fish'] = 'x'),
      /bac 2 : fish doit être une liste/,
    ],
    ['réglages absents', (d) => delete d['settings'], /settings/],
  ])('refuse : %s', (_, mutate, message) => {
    expect(refusal(parseMutated(mutate))).toMatch(message);
  });

  it('refuse un texte invalide, sans lever', () => {
    expect(refusal(parseSave(''))).toMatch(/JSON/);
    expect(refusal(parseSave('{"format":"aqfish","sche'))).toMatch(/JSON/);
    expect(refusal(parseSave('[]'))).toMatch(/objet/);
    expect(refusal(parseSave('{"schema":2}'))).toMatch(/pas une sauvegarde aqfish/);
    expect(refusal(parseSave(42 as unknown as string))).toMatch(/texte/);
    expect(refusal(parseSave(' '.repeat(MAX_ROOM_SAVE_LENGTH + 1)))).toMatch(/volumineux/);
    expect(refusal(parseSave('{"__proto__":{"format":"aqfish","schema":2},"tanks":[]}'))).toMatch(
      /pas une sauvegarde aqfish/,
    );
  });

  it('refuse le corps d’un bac au-delà de 256 Kio', () => {
    expect(
      refusal(
        parseMutated(
          (d) =>
            ((tanksOf(d)[0]!['world'] as Record<string, unknown>)['pad'] = 'x'.repeat(
              MAX_SAVE_LENGTH,
            )),
        ),
      ),
    ).toMatch(/world trop volumineux/);
  });
});

describe('migrateSchema1 : schéma 1 → pièce', () => {
  it('sauvegarde du schéma 1 : le monde devient le bac 0, rien ne change', () => {
    const world = played(42);
    const settings: SaveSettings = { ...DEFAULT_SAVE_SETTINGS, speed: 0.5 };
    const back = loaded(parseSave(serializeWorld(world, settings)));
    expect(back.schema).toBe(SAVE_SCHEMA_1);
    expect(back.selectedTankId).toBe(0);
    expect(back.room).toMatchObject({ seed: 42, tick: world.tick, nextTankId: 1 });
    expect(back.room.tanks[0]).toMatchObject({ id: 0, name: 'Bac tropical', place: 'piece' });
    expect(text1(back.room.tanks[0]!.world)).toBe(text1(world));
    expect(back.settings.speed).toBe(0.5);
    // Relu puis avancé : identique au monde jamais sauvegardé.
    expect(text1(advance(back.room.tanks[0]!.world, 100))).toBe(text1(advance(world, 100)));
  });

  it('états par environnement du c85 (others) : un bac chacun, graines enregistrées', () => {
    const shown = played(7, 'recif');
    const others = [played(7, 'tropical'), played(7, 'bassin'), played(7, 'paludarium')];
    const back = loaded(parseSave(serializeWorld(shown, DEFAULT_SAVE_SETTINGS, others)));
    expect(back.room.tanks.map((t) => [t.id, t.world.environment, t.place, t.world.seed])).toEqual([
      [0, 'recif', 'piece', 7],
      [1, 'tropical', 'piece', 7],
      [2, 'bassin', 'jardin', 7],
      [3, 'paludarium', 'piece', 7],
    ]);
    // Graine enregistrée, pas la graine dérivée (ADR 0069).
    expect(back.room.tanks[1]!.world.seed).not.toBe(tankSeed(7, 1));
    for (const original of others) {
      const tank = back.room.tanks.find((t) => t.world.environment === original.environment)!;
      expect(text1(tank.world)).toBe(text1(original));
    }
    // Ré-écrit au schéma 2 puis relu : la même pièce.
    const again = loaded(parseSave(serializeRoom(back.room, back.selectedTankId, back.settings)));
    expect(again.schema).toBe(2);
    expect(again.room.tanks.map((t) => text1(t.world))).toEqual(
      back.room.tanks.map((t) => text1(t.world)),
    );
  });

  it('bassin affiché : bac 0 au jardin', () => {
    const back = loaded(parseSave(serializeWorld(played(3, 'bassin'))));
    expect(back.room.tanks.map((t) => [t.id, t.place, t.name])).toEqual([[0, 'jardin', 'Bassin']]);
  });

  it('bac aux dimensions extrêmes : migré sans perte', () => {
    const world = createWorld(11, environmentById('tropical').population, [], [], {
      environment: 'tropical',
      dimensions: MAX_TANK,
    });
    const back = loaded(parseSave(serializeWorld(advance(world, 50))));
    expect(back.room.tanks[0]!.world.dimensions).toEqual(MAX_TANK);
    expect(text1(back.room.tanks[0]!.world)).toBe(text1(advance(world, 50)));
  });

  it('sauvegarde vide, tronquée ou corrompue : refusée avec le message du schéma 1', () => {
    expect(refusal(parseSave(''))).toMatch(/JSON/);
    const text = serializeWorld(played(1));
    expect(refusal(parseSave(text.slice(0, text.length / 2)))).toMatch(/JSON/);
    const corrupt = JSON.parse(text) as Record<string, unknown>;
    corrupt['nextFishId'] = -3;
    expect(refusal(parseSave(JSON.stringify(corrupt)))).toMatch(/nextFishId/);
    expect(refusal(parseSave('{"format":"aqfish","schema":1}'))).toMatch(/environnement inconnu/);
    // Limite historique du schéma 1 : tout le document.
    expect(
      refusal(
        parseSave(
          JSON.stringify({ format: SAVE_FORMAT, schema: 1, pad: 'x'.repeat(MAX_SAVE_LENGTH) }),
        ),
      ),
    ).toMatch(/volumineux/);
  });

  it('migrateSchema1 est pure et ne copie pas les mondes', () => {
    const world = createDefaultWorld(4);
    const migrated = migrateSchema1(world, []);
    expect(migrated.room.tanks[0]!.world).toBe(world);
    expect(migrated.selectedTankId).toBe(0);
  });
});

describe('parseSaveWorlds : mondes de l’hôte du lot 1', () => {
  it('renvoie le bac sélectionné et les autres', () => {
    const result = parseSaveWorlds(serializeRoom(room3(), 1));
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.world.environment).toBe('bassin');
    expect(result.others.map((w) => w.environment)).toEqual(['tropical', 'recif']);
  });

  it('refuse une pièce de deux bacs du même environnement, et relaie les refus', () => {
    const twin = parseSaveWorlds(serializeRoom(createRoom(1, ['tropical', 'tropical']), 0));
    expect(twin.ok).toBe(false);
    expect(parseSaveWorlds('nope').ok).toBe(false);
  });
});
