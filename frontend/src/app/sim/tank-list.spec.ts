import { setPopulation } from './population';
import { createRoom, type RoomState, type RoomTank } from './room-state';
import {
  animalCountText,
  hungerText,
  tankList,
  tankListDetail,
  tankListEntry,
  tankListHint,
  worstAlert,
} from './tank-list';
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

  it('faim en clair dans la ligne (#318), absente sans animal nourri', () => {
    expect(hungerText(40)).toBe('faim 40 %');
    expect(hungerText(0)).toBe('faim 0 %');
    expect(hungerText(100)).toBe('faim 100 %');
    expect(hungerText(null)).toBeNull();
    expect(hungerText(Number.NaN)).toBeNull();
    expect(tankListDetail({ animals: 3, liters: 54, hunger: 40 })).toBe(
      '3 animaux · 54 L · faim 40 %',
    );
    expect(tankListDetail({ animals: 3, liters: 54, hunger: null })).toBe('3 animaux · 54 L');
    // Bac sans animal : moyenne nulle, pas de division par zéro ni de « NaN ».
    const room = createRoom(7, ['tropical']);
    const empty = tankListEntry(
      { ...room.tanks[0], world: { ...room.tanks[0].world, entities: [] } },
      0,
    );
    expect(tankListDetail(empty)).toMatch(/^vide · \d+ L$/);
    const lived = tankListEntry(room.tanks[0], 0);
    expect(tankListDetail(lived)).toMatch(/ · faim \d+ %$/);
  });

  it('Paludarium (#492) : « sans granulés » et infobulle à la place de la faim', () => {
    const room = createRoom(42, ['tropical', 'paludarium']);
    const palu = tankListEntry(room.tanks[1], 0);
    expect(palu.animals).toBeGreaterThan(0);
    expect(palu.pelletFed).toBe(0);
    expect(palu.hunger).toBeNull();
    expect(tankListDetail(palu)).toBe(`${palu.animals} animaux · ${palu.liters} L · sans granulés`);
    expect(tankListHint(palu)).toMatch(/aucun animal .* granulés/i);
    // Bac tropical : tous nourris aux granulés, faim affichée, aucune infobulle.
    const tropical = tankListEntry(room.tanks[0], 0);
    expect(tropical.pelletFed).toBe(tropical.animals);
    expect(tankListDetail(tropical)).toMatch(/ · faim \d+ %$/);
    expect(tankListHint(tropical)).toBeNull();
    // Paludarium vidé : « vide », ni indicateur ni infobulle.
    const empty = tankListEntry(
      { ...room.tanks[1], world: { ...room.tanks[1].world, entities: [] } },
      0,
    );
    expect(tankListDetail(empty)).toMatch(/^vide · \d+ L$/);
    expect(tankListHint(empty)).toBeNull();
  });

  it('bac mixte (#492) : faim des seuls nourris aux granulés, expliquée dans l’infobulle', () => {
    const room = createRoom(42, ['tropical', 'paludarium']);
    const [tropical, palu] = room.tanks;
    const mixed = tankListEntry(
      {
        ...tropical,
        world: {
          ...tropical.world,
          entities: [...tropical.world.entities, ...palu.world.entities],
        },
      },
      0,
    );
    expect(mixed.pelletFed).toBe(tropical.world.entities.length);
    expect(mixed.animals).toBe(mixed.pelletFed + palu.world.entities.length);
    expect(mixed.hunger).toBe(tankListEntry(tropical, 0).hunger);
    expect(tankListDetail(mixed)).toMatch(/ · faim \d+ %$/);
    expect(tankListDetail(mixed)).not.toContain('sans granulés');
    expect(tankListHint(mixed)).toBe(
      `Faim moyenne des seuls animaux nourris aux granulés (${mixed.pelletFed} sur ${mixed.animals}).`,
    );
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
