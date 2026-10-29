import { setPopulation } from './population';
import { createRoom, type RoomState, type RoomTank } from './room-state';
import { animalCountText, tankList, tankListDetail, tankListEntry, worstAlert } from './tank-list';
import { advance, type World } from './world';

function withWorld(room: RoomState, id: number, world: World): RoomState {
  return { ...room, tanks: room.tanks.map((t) => (t.id === id ? { ...t, world } : t)) };
}

describe('liste des bacs (#306)', () => {
  it('une ligne par bac : nom, environnement, litrage, animaux, sélection', () => {
    const room = createRoom(42, ['tropical', 'recif', 'paludarium']);
    const entries = tankList(room.tanks, 1);
    expect(entries.map((e) => e.id)).toEqual([0, 1, 2]);
    expect(entries.map((e) => e.environment)).toEqual(['tropical', 'recif', 'paludarium']);
    expect(entries.map((e) => e.selected)).toEqual([false, true, false]);
    expect(entries.every((e) => e.selectable)).toBe(true);
    expect(entries[0].name).toBe('Bac tropical');
    expect(entries[0].environmentName).toBe('Bac tropical');
    expect(entries[0].animals).toBe(room.tanks[0].world.entities.length);
    expect(entries.every((e) => Number.isInteger(e.liters) && e.liters > 0)).toBe(true);
  });

  it('liste vide : aucune ligne', () => {
    expect(tankList([], 0)).toEqual([]);
  });

  it('bac vide : « vide », sans alerte', () => {
    const room = createRoom(7, ['tropical']);
    let world = room.tanks[0].world;
    for (const species of ['neon', 'guppy', 'corydora'] as const) {
      world = setPopulation(world, species, 0);
    }
    const empty = withWorld(room, 0, { ...world, entities: [] });
    const entry = tankListEntry(empty.tanks[0], 0);
    expect(entry.animals).toBe(0);
    expect(entry.hunger).toBeNull();
    expect(entry.worst).toBeNull();
    expect(tankListDetail(entry)).toMatch(/^vide · \d+ L$/);
    expect(tankListDetail({ animals: 1, liters: 54 })).toBe('1 animal · 54 L');
    expect(tankListDetail({ animals: 12, liters: 200 })).toBe('12 animaux · 200 L');
  });

  it('« vide », « 1 animal », « N animaux » (#316)', () => {
    expect(animalCountText(0)).toBe('vide');
    expect(animalCountText(1)).toBe('1 animal');
    expect(animalCountText(2)).toBe('2 animaux');
  });

  it('faim moyenne en pour cent : elle monte avec le temps (#316)', () => {
    const tank = createRoom(42, ['tropical']).tanks[0];
    const before = tankListEntry(tank, 0).hunger;
    const after = tankListEntry({ ...tank, world: advance(tank.world, 1800) }, 0).hunger;
    expect(before).not.toBeNull();
    expect(Number.isInteger(after)).toBe(true);
    expect(after!).toBeGreaterThan(before!);
    expect(after!).toBeLessThanOrEqual(100);
  });

  it('un bac neuf n’a pas d’alerte', () => {
    for (const tank of createRoom(3, ['tropical', 'recif', 'paludarium']).tanks) {
      expect(worstAlert(tank.world)).toBeNull();
    }
  });

  it('l’alerte d’un bac non sélectionné apparaît dans sa ligne', () => {
    const room = createRoom(42, ['tropical', 'recif']);
    const reef = room.tanks[1].world;
    // Nitrites très hauts dans le récif, qui n'est pas sélectionné.
    const sick = withWorld(room, 1, { ...reef, water: { ...reef.water, nitrite: 50 } });
    const entries = tankList(sick.tanks, 0);
    expect(entries[0].selected).toBe(true);
    expect(entries[0].worst).toBeNull();
    expect(entries[1].selected).toBe(false);
    expect(entries[1].worst).toBe('critique');
  });

  it('une gravité « attention » est rapportée telle quelle, et la pire gagne', () => {
    const room = createRoom(42, ['tropical']);
    const world = room.tanks[0].world;
    const warm = { ...world, water: { ...world.water, temperature: 27.5 } };
    expect(worstAlert(warm)).toBe('attention');
    const both = { ...warm, water: { ...warm.water, nitrite: 50 } };
    expect(worstAlert(both)).toBe('critique');
  });

  it('un bac posé n’est pas sélectionnable ; la gravité fournie est reprise', () => {
    const room = createRoom(42, ['tropical', 'tropical']);
    const posed: RoomTank = {
      ...room.tanks[1],
      placement: { supportId: null, x: 1, z: 1, quarter: 0 },
    };
    const entries = tankList([room.tanks[0], posed], 0, (tank) =>
      tank.id === 1 ? 'attention' : null,
    );
    expect(entries[1].selectable).toBe(false);
    expect(entries[1].worst).toBe('attention');
  });
});
