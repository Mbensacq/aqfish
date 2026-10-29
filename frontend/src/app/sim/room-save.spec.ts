import { createDayClock } from './daylight';
import { DEFAULT_ROOM } from './room';
import {
  MAX_ROOM_SAVE_LENGTH,
  migrateSchema1,
  parseRoomSaveData,
  parseSave,
  parseSaveWorlds,
  roomSaveData,
  serializeRoom,
  type ParseSaveResult,
} from './room-save';
import {
  addSupport,
  addTank,
  createRoom,
  MAX_ROOM_SUPPORTS,
  MAX_ROOM_TANKS,
  removeSupport,
  removeTank,
  stepRoom,
  tankSeed,
  type RoomState,
} from './room-state';
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

describe('schéma 2, lot 2 : meubles et position des bacs (ADR 0073)', () => {
  /** Pièce de 3 bacs (2 posés) et 2 meubles. */
  function furnished(): RoomState {
    let room = createRoom(42);
    for (const step of [
      (r: RoomState) => addSupport(r, 'commode', 2, -2),
      (r: RoomState) => addSupport(r, 'etagere-bacs', -2, 2, 2),
      (r: RoomState) =>
        addTank(r, {
          environment: 'tropical',
          size: 'moyen',
          placement: { supportId: 0, x: 2, z: -2, quarter: 0 },
        }),
      (r: RoomState) =>
        addTank(r, {
          environment: 'paludarium',
          size: 'petit',
          placement: { supportId: null, x: 2.5, z: 2, quarter: 1 },
          name: 'Grenouilles',
        }),
    ]) {
      const result = step(room);
      if (!result.ok) {
        throw new Error(result.reason);
      }
      room = result.room;
    }
    return stepRoom(room, 30);
  }

  it('aller-retour : 3 bacs et 2 meubles, au bit près, avancés à l’identique', () => {
    const room = furnished();
    expect([room.tanks.length, room.furniture.length]).toEqual([3, 2]);
    const text = serializeRoom(room, 2);
    const back = loaded(parseSave(text));
    expect(back.room.furniture).toEqual(room.furniture);
    expect(back.room.nextFurnitureId).toBe(2);
    expect(back.room.tanks.map((t) => t.placement)).toEqual(room.tanks.map((t) => t.placement));
    expect(back.room.tanks.map((t) => t.name)).toEqual([
      'Bac tropical',
      'Bac tropical',
      'Grenouilles',
    ]);
    expect(back.selectedTankId).toBe(2);
    expect(serializeRoom(back.room, 2)).toBe(text);
    const a = stepRoom(back.room, 40).tanks.map((t) => text1(t.world));
    const b = stepRoom(room, 40).tanks.map((t) => text1(t.world));
    expect(a).toEqual(b);
  });

  it('pièce sans meuble : champs du lot 2 omis (document du lot 1 inchangé)', () => {
    const doc = JSON.parse(serializeRoom(room3(), 0)) as Record<string, unknown>;
    expect('furniture' in doc).toBe(false);
    expect('nextFurnitureId' in doc).toBe(false);
    expect((doc['tanks'] as Record<string, unknown>[]).some((t) => 'placement' in t)).toBe(false);
    const back = loaded(parseRoomSaveData(doc));
    expect(back.room.furniture).toEqual([]);
    expect(back.room.nextFurnitureId).toBe(0);
    expect(back.room.tanks.every((t) => t.placement === null)).toBe(true);
  });

  it('une sauvegarde du lot 1 relue puis réécrite est identique', () => {
    const lot1 = serializeRoom(room3(), 2);
    expect(serializeRoom(loaded(parseSave(lot1)).room, 2)).toBe(lot1);
  });

  it('meubles retirés et compteur conservé (identifiants jamais réutilisés)', () => {
    const room = furnished();
    const freed = removeTank(room, 1);
    if (!freed.ok) throw new Error(freed.reason);
    const bare = removeSupport(freed.room, 0);
    if (!bare.ok) throw new Error(bare.reason);
    const back = loaded(parseSave(serializeRoom(bare.room, 0)));
    expect(back.room.furniture.map((f) => f.id)).toEqual([1]);
    expect(back.room.nextFurnitureId).toBe(2);
  });

  function furnishedDoc(): Record<string, unknown> {
    return JSON.parse(serializeRoom(furnished(), 0)) as Record<string, unknown>;
  }

  const furniture = (d: Record<string, unknown>) => d['furniture'] as Record<string, unknown>[];
  const tank = (d: Record<string, unknown>, i: number) =>
    (d['tanks'] as Record<string, unknown>[])[i] as Record<string, unknown>;
  const placement = (d: Record<string, unknown>, i: number) =>
    tank(d, i)['placement'] as Record<string, unknown>;

  it.each<[string, (d: Record<string, unknown>) => void, RegExp]>([
    ['furniture non liste', (d) => (d['furniture'] = {}), /furniture doit être une liste/],
    ['compteur absent', (d) => delete d['nextFurnitureId'], /nextFurnitureId manquant/],
    ['compteur invalide', (d) => (d['nextFurnitureId'] = -1), /nextFurnitureId/],
    ['compteur trop petit', (d) => (d['nextFurnitureId'] = 1), /identifiant ≥ nextFurnitureId/],
    ['type inconnu', (d) => (furniture(d)[0]!['kind'] = 'buffet'), /meuble 0 : id, kind/],
    ['meuble non objet', (d) => (furniture(d)[1] = 3 as never), /meuble 1 : doit être un objet/],
    ['meuble non centimétrique', (d) => (furniture(d)[0]!['x'] = 2.001), /meuble 0/],
    ['meubles qui se chevauchent', (d) => (furniture(d)[1]!['x'] = 2), /chevauchement/],
    ['meubles non croissants', (d) => (furniture(d)[1]!['id'] = 0), /non strictement croissants/],
    [
      'trop de meubles',
      (d) => (d['furniture'] = Array.from({ length: MAX_ROOM_SUPPORTS + 1 }, () => ({}))),
      /trop de meubles/,
    ],
    ['placement non objet', (d) => (tank(d, 1)['placement'] = 'commode'), /placement doit être/],
    ['support invalide', (d) => (placement(d, 1)['supportId'] = 'a'), /supportId/],
    ['support inconnu', (d) => (placement(d, 1)['supportId'] = 9), /bac 1 : meuble-inconnu/],
    ['quart invalide', (d) => (placement(d, 1)['quarter'] = 5), /quarter/],
    ['position non centimétrique', (d) => (placement(d, 2)['z'] = 0.333), /centimètre/],
    ['bac hors du plateau', (d) => (placement(d, 1)['x'] = 2.4), /bac 1 : hors-support/],
    [
      'bacs qui se chevauchent',
      (d) => Object.assign(placement(d, 2), { x: 2, z: -2 }),
      /bac 2 : chevauchement/,
    ],
    [
      'position au jardin',
      (d) => {
        const doc = JSON.parse(serializeRoom(createRoom(1, ['tropical', 'bassin']), 0));
        Object.assign(d, doc);
        tank(d, 1)['placement'] = { supportId: null, x: 2, z: 2, quarter: 0 };
      },
      /placement interdit au jardin/,
    ],
  ])('refuse : %s', (_label, mutate, pattern) => {
    const doc = furnishedDoc();
    mutate(doc);
    expect(refusal(parseRoomSaveData(doc))).toMatch(pattern);
  });

  it('roomSaveData refuse une disposition incohérente', () => {
    const room = furnished();
    const bad: RoomState = { ...room, nextFurnitureId: 1 };
    expect(() => serializeRoom(bad, 0)).toThrow(/nextFurnitureId/);
  });
});
