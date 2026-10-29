import { deriveSeed } from '../core/random/prng';
import { createDayClock } from './daylight';
import { setPopulation } from './population';
import {
  createRoom,
  defaultTankName,
  findTank,
  MAX_ROOM_TANKS,
  MAX_TANK_NAME_LENGTH,
  normalizeTankName,
  placeOf,
  renameTank,
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

/** Empreinte du bac tropical de graine 42 après 600 pas, relevée sur `main` (v1.3.2). */
const GOLDEN_HASH = '92dfd116';

/** Empreinte FNV-1a 32 bits du texte complet d'un monde : « état haché ». */
function hashWorld(world: World): string {
  let hash = 0x811c9dc5;
  for (const char of text(world)) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

describe('stepRoom sauf le bac affiché (#316, lot 3b)', () => {
  /** Pièce de trois bacs : le bac 0 est le bac affiché, les autres avancent sans lui. */
  function threeTanks(seed: number): RoomState {
    return createRoom(seed, ['tropical', 'recif', 'eaufroide']);
  }

  it('un bac non affiché avance de N pas (eau, faim), de façon déterministe', () => {
    const clock = createDayClock(9, 120, false);
    const room = threeTanks(42);
    const a = stepRoom(room, 900, clock, 0);
    const b = stepRoom(threeTanks(42), 900, clock, 0);
    for (const i of [1, 2]) {
      const before = room.tanks[i]!.world;
      const after = a.tanks[i]!.world;
      expect(after.tick).toBe(before.tick + 900);
      expect(after.water).not.toEqual(before.water);
      expect(after.entities[0]!.hunger).toBeGreaterThan(before.entities[0]!.hunger);
      // Même graine, même état ; par lots ou d'un coup, même état aussi.
      expect(text(after)).toBe(text(b.tanks[i]!.world));
      const batched = stepRoom(
        stepRoom(stepRoom(room, 300, clock, 0), 300, clock, 0),
        300,
        clock,
        0,
      );
      expect(text(batched.tanks[i]!.world)).toBe(text(after));
    }
    // Autre graine, autre état.
    expect(text(stepRoom(threeTanks(43), 900, clock, 0).tanks[1]!.world)).not.toBe(
      text(a.tanks[1]!.world),
    );
  });

  it('le bac affiché n’est pas touché (même objet) et reste identique à l’avant-lot', () => {
    const clock = createDayClock(9, 120, false);
    const room = threeTanks(42);
    const stepped = stepRoom(room, 600, clock, 0);
    expect(stepped.tanks[0]!.world).toBe(room.tanks[0]!.world);
    // L'hôte avance le bac affiché seul, en place : même état, avec ou sans voisins avancés.
    const alone = advance(room.tanks[0]!.world, 600, clock);
    const withRoom = advance(stepped.tanks[0]!.world, 600, clock);
    expect(hashWorld(withRoom)).toBe(hashWorld(alone));
    // Empreinte relevée sur `main` avant le lot 3b (v1.3.2) : la boucle du bac affiché n'a
    // pas changé.
    expect(hashWorld(alone)).toBe(GOLDEN_HASH);
  });

  it('un identifiant inconnu avance tous les bacs', () => {
    const room = threeTanks(1);
    const all = stepRoom(room, 10, null, 99);
    expect(all.tanks.every((tank, i) => tank.world.tick === room.tanks[i]!.world.tick + 10)).toBe(
      true,
    );
  });
});

describe('renameTank : saisie libre (#316)', () => {
  const room = createRoom(5, ['tropical', 'recif']);

  it('renomme un bac, nom normalisé, les autres inchangés', () => {
    const renamed = renameTank(room, 1, '  Récif\tdu  salon\n');
    expect(findTank(renamed!, 1)?.name).toBe('Récif du salon');
    expect(findTank(renamed!, 0)).toBe(room.tanks[0]);
    expect(room.tanks[1]!.name).toBe('Récif');
  });

  it('refuse un nom vide (après normalisation) ou trop long', () => {
    for (const name of ['', '   ', '\u0000\u0007', '\n\t']) {
      expect(renameTank(room, 0, name)).toBeNull();
    }
    const max = 'a'.repeat(MAX_TANK_NAME_LENGTH);
    expect(findTank(renameTank(room, 0, max)!, 0)?.name).toBe(max);
    expect(renameTank(room, 0, `${max}b`)).toBeNull();
    // La borne porte sur le nom normalisé : des blancs en trop ne comptent pas.
    expect(renameTank(room, 0, `  ${max}  `)).not.toBeNull();
  });

  it('normalizeTankName remplace les caractères de contrôle', () => {
    expect(normalizeTankName('a\u0001b\u007fc')).toBe('a b c');
    expect(normalizeTankName('Bac 🐟')).toBe('Bac 🐟');
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
