import { deriveSeed } from '../core/random/prng';
import { createDayClock } from './daylight';
import { setPopulation } from './population';
import {
  createRoom,
  defaultTankName,
  findTank,
  MAX_ROOM_TANKS,
  placeOf,
  resolveSelectedTank,
  roomWorlds,
  stepRoom,
  syncRoom,
  TANK_SEED_SALT,
  tankSeed,
  type RoomState,
} from './room-state';
import { serializeWorld } from './save';
import { advance, changeWorldWater, createDefaultWorld, feed, type World } from './world';

/** Texte complet d'un monde (schéma 1) : comparaison au bit près. */
const text = (world: World): string => serializeWorld(world);

describe('tankSeed : graines des bacs (ADR 0061)', () => {
  it('le bac 0 a la graine de la pièce', () => {
    expect(tankSeed(42, 0)).toBe(42);
    expect(tankSeed(0, 0)).toBe(0);
    expect(tankSeed(0xffffffff, 0)).toBe(0xffffffff);
  });

  it('les autres bacs ont une graine dérivée avec le sel, distincte du sous-générateur des poissons', () => {
    for (const id of [1, 2, 31, 0xffffffff]) {
      expect(tankSeed(42, id)).toBe(deriveSeed(deriveSeed(42, TANK_SEED_SALT), id));
      expect(tankSeed(42, id)).not.toBe(deriveSeed(42, id));
    }
    const seeds = new Set(Array.from({ length: MAX_ROOM_TANKS }, (_, id) => tankSeed(7, id)));
    expect(seeds.size).toBe(MAX_ROOM_TANKS);
  });

  it('refuse une graine ou un identifiant invalide', () => {
    expect(() => tankSeed(-1, 0)).toThrow(RangeError);
    expect(() => tankSeed(1.5, 1)).toThrow(RangeError);
    expect(() => tankSeed(42, -1)).toThrow(RangeError);
    expect(() => tankSeed(42, 2 ** 32)).toThrow(RangeError);
  });
});

describe('createRoom', () => {
  it('pièce par défaut : un bac tropical, identique au monde de départ', () => {
    const room = createRoom(42);
    expect(room).toMatchObject({ seed: 42, tick: 0, nextTankId: 1 });
    expect(room.tanks).toHaveLength(1);
    expect(room.tanks[0]).toMatchObject({ id: 0, name: 'Bac tropical', place: 'piece' });
    expect(text(room.tanks[0]!.world)).toBe(text(createDefaultWorld(42)));
  });

  it('plusieurs bacs : graines dérivées, bassin au jardin', () => {
    const room = createRoom(9, ['tropical', 'bassin', 'recif']);
    expect(room.tanks.map((t) => [t.id, t.place, t.world.seed])).toEqual([
      [0, 'piece', 9],
      [1, 'jardin', tankSeed(9, 1)],
      [2, 'piece', tankSeed(9, 2)],
    ]);
    expect(room.nextTankId).toBe(3);
  });

  it('refuse une pièce vide ou trop grande', () => {
    expect(() => createRoom(1, [])).toThrow(RangeError);
    expect(() =>
      createRoom(
        1,
        Array.from({ length: MAX_ROOM_TANKS + 1 }, () => 'tropical' as const),
      ),
    ).toThrow(RangeError);
  });
});

describe('stepRoom : temps commun, aucune lecture croisée', () => {
  /** Pièce de deux bacs dont l'un a une eau très différente (affamé, eau changée, nourri). */
  function twoTanks(): RoomState {
    const room = createRoom(42, ['tropical', 'recif']);
    const busy = changeWorldWater(feed(setPopulation(room.tanks[1]!.world, 'clown', 0), 0, 0));
    return { ...room, tanks: [room.tanks[0]!, { ...room.tanks[1]!, world: busy }] };
  }

  it('déterminisme : deux exécutions identiques donnent le même état', () => {
    const clock = createDayClock(6, 120, false);
    const a = stepRoom(stepRoom(twoTanks(), 120, clock), 80, clock);
    const b = stepRoom(stepRoom(twoTanks(), 120, clock), 80, clock);
    expect(a.tick).toBe(200);
    expect(a.tanks.map((t) => text(t.world))).toEqual(b.tanks.map((t) => text(t.world)));
  });

  it('chaque bac évolue comme s’il était seul (eau, population, hasard)', () => {
    const clock = createDayClock(20, 300, false);
    const room = twoTanks();
    const after = stepRoom(room, 300, clock);
    for (const [i, tank] of room.tanks.entries()) {
      expect(text(after.tanks[i]!.world)).toBe(text(advance(tank.world, 300, clock)));
    }
    // Le bac 0 ne dépend pas de son voisin : même résultat avec un voisin différent.
    const other = { ...room, tanks: [room.tanks[0]!] };
    expect(text(stepRoom(other, 300, clock).tanks[0]!.world)).toBe(text(after.tanks[0]!.world));
    expect(after.tanks[0]!.world.water).not.toEqual(after.tanks[1]!.world.water);
  });

  it('est pure et accepte zéro pas', () => {
    const room = twoTanks();
    const before = room.tanks.map((t) => text(t.world));
    stepRoom(room, 50);
    expect(room.tanks.map((t) => text(t.world))).toEqual(before);
    const same = stepRoom(room, 0);
    expect(same.tick).toBe(0);
    expect(same.tanks.map((t) => t.world)).toEqual(room.tanks.map((t) => t.world));
    expect(() => stepRoom(room, -1)).toThrow(RangeError);
    expect(() => stepRoom(room, 0.5)).toThrow(RangeError);
  });
});

describe('sélection et mondes de l’hôte', () => {
  it('resolveSelectedTank retombe sur le plus petit identifiant', () => {
    const room = createRoom(1, ['tropical', 'recif']);
    expect(resolveSelectedTank(room, 1)).toBe(1);
    expect(resolveSelectedTank(room, 7)).toBe(0);
    expect(resolveSelectedTank(room, null)).toBe(0);
    expect(resolveSelectedTank(room, undefined)).toBe(0);
    expect(() => resolveSelectedTank({ ...room, tanks: [] }, 0)).toThrow(RangeError);
    expect(findTank(room, 1)?.world.environment).toBe('recif');
    expect(findTank(room, 2)).toBeUndefined();
  });

  it('roomWorlds : le bac sélectionné et les autres, dans l’ordre des identifiants', () => {
    const room = createRoom(1, ['tropical', 'recif', 'bassin']);
    const worlds = roomWorlds(room, 1);
    expect(worlds.selectedTankId).toBe(1);
    expect(worlds.world).toBe(room.tanks[1]!.world);
    expect(worlds.others).toEqual([room.tanks[0]!.world, room.tanks[2]!.world]);
  });

  it('roomWorlds refuse deux bacs du même environnement (lots suivants)', () => {
    expect(() => roomWorlds(createRoom(1, ['tropical', 'tropical']), 0)).toThrow(
      /même environnement/,
    );
  });

  it('syncRoom garde identifiants et noms, et numérote les environnements nouveaux', () => {
    const tropical = createDefaultWorld(5);
    const first = syncRoom(null, tropical, []);
    expect(first.selectedTankId).toBe(0);
    expect(first.room).toMatchObject({ seed: 5, tick: 0, nextTankId: 1 });
    const renamed: RoomState = {
      ...first.room,
      tanks: [{ ...first.room.tanks[0]!, name: 'Mon bac' }],
    };
    const pond = advance(createDefaultWorld(5, 'bassin'), 30);
    const second = syncRoom(renamed, pond, [tropical]);
    expect(second.selectedTankId).toBe(1);
    expect(second.room.tick).toBe(30);
    expect(second.room.tanks.map((t) => [t.id, t.name, t.place])).toEqual([
      [0, 'Mon bac', 'piece'],
      [1, 'Bassin', 'jardin'],
    ]);
    // Un environnement quitté puis absent disparaît ; son identifiant n'est pas réutilisé.
    const third = syncRoom(second.room, createDefaultWorld(5, 'recif'), [pond]);
    expect(third.room.tanks.map((t) => t.id)).toEqual([1, 2]);
    expect(third.room.nextTankId).toBe(3);
  });

  it('syncRoom sans pièce : monde affiché en bac 0, autres dans l’ordre des environnements', () => {
    const shown = createDefaultWorld(3, 'recif');
    const synced = syncRoom(null, shown, [
      createDefaultWorld(3, 'paludarium'),
      createDefaultWorld(3, 'bassin'),
    ]);
    expect(synced.room.tanks.map((t) => t.world.environment)).toEqual([
      'recif',
      'bassin',
      'paludarium',
    ]);
    expect(synced.room.tanks.map((t) => t.world.seed)).toEqual([3, 3, 3]);
  });

  it('syncRoom refuse un environnement en double', () => {
    const tropical = createDefaultWorld(1);
    expect(() => syncRoom(null, tropical, [createDefaultWorld(2)])).toThrow(/double/);
  });

  it('placeOf et defaultTankName', () => {
    expect(placeOf('bassin')).toBe('jardin');
    expect(placeOf('eaufroide')).toBe('piece');
    expect(defaultTankName('recif')).toBe('Récif');
  });
});
