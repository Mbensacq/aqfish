import { DEFAULT_ROOM } from '../../sim/room';
import { createRoom, type RoomState } from '../../sim/room-state';
import type { World } from '../../sim/world-types';
import {
  ROOM_LAYOUT_MESSAGES,
  RoomLayoutController,
  supportPlaceLabel,
  type RoomLayoutPorts,
} from './room-layout-controller';

describe('RoomLayoutController (#695)', () => {
  let state: RoomState;
  let editable: boolean;
  let capture: boolean;
  let forgotten: string[];
  let redraws: number;
  let saves: number;
  let published: [number, number][];
  let layout: RoomLayoutController;
  const world = (): World => state.tanks[0].world;

  function create(environments: Parameters<typeof createRoom>[1] = ['tropical']): void {
    state = createRoom(4, environments);
    const ports: RoomLayoutPorts = {
      world,
      isCapture: () => capture,
      editable: () => editable,
      roomState: () => state,
      setRoomState: (room) => {
        state = room;
      },
      syncRoomState: () => state,
      selectedTankId: () => 0,
      forgetStashed: (environment) => forgotten.push(environment),
      room: () => ({ ...DEFAULT_ROOM, shown: true }),
      redrawRoom: () => {
        redraws += 1;
      },
      probe: { publishRoomCatalog: (tanks, supports) => published.push([tanks, supports]) },
      saveNow: () => {
        saves += 1;
      },
      scheduleFrame: () => undefined,
    };
    layout = new RoomLayoutController(ports);
  }

  beforeEach(() => {
    editable = true;
    capture = false;
    forgotten = [];
    redraws = 0;
    saves = 0;
    published = [];
    create();
  });

  it('ajoute un meuble puis un bac posé dessus : catalogue, dessin et sauvegarde', () => {
    layout.addSupport('commode');
    const supportId = state.furniture[0].id;
    layout.addTank('tropical', 'petit', supportId);
    const catalog = layout.catalog();
    expect(catalog.supports).toEqual([{ id: supportId, name: 'Commode 1', occupied: true }]);
    expect(catalog.tanks.map((tank) => [tank.id, tank.shown])).toEqual([
      [0, true],
      [1, false],
    ]);
    expect(catalog.tanks[1].on).toBe('Commode 1');
    expect(catalog.message).toBeNull();
    expect([redraws, saves]).toEqual([2, 2]);
    expect(published.at(-1)).toEqual([2, 1]);
  });

  it('choix invalides : message, pièce inchangée', () => {
    const before = state;
    layout.addSupport('licorne');
    expect(layout.catalog().message).toBe(ROOM_LAYOUT_MESSAGES['position-invalide']);
    layout.addTank('lune', 'petit', null);
    expect(layout.catalog().message).toBe(ROOM_LAYOUT_MESSAGES['position-invalide']);
    layout.addTank('tropical', 'petit', 42);
    expect(layout.catalog().message).toBe(ROOM_LAYOUT_MESSAGES['meuble-inconnu']);
    expect(state).toBe(before);
    expect(saves).toBe(0);
  });

  it('pièce masquée ou capture : aucun ajout', () => {
    editable = false;
    layout.addSupport('commode');
    capture = true;
    editable = true;
    layout.addSupport('commode');
    layout.removeSupport(0);
    expect(state.furniture).toEqual([]);
    expect(published).toEqual([]);
  });

  it('retirer : le bac affiché ou inconnu est refusé ; un bac rangé quitte les mondes rangés', () => {
    create(['tropical', 'eaufroide']);
    layout.removeTank(0);
    expect(layout.catalog().message).toBe(ROOM_LAYOUT_MESSAGES['position-invalide']);
    layout.removeTank(9);
    expect(layout.catalog().message).toBe(ROOM_LAYOUT_MESSAGES['bac-inconnu']);
    layout.removeTank(1);
    expect(state.tanks).toHaveLength(1);
    expect(forgotten).toEqual(['eaufroide']);
    expect(layout.catalog().message).toBeNull();
  });

  it('un meuble qui porte un bac ne se retire pas', () => {
    layout.addSupport('commode');
    const supportId = state.furniture[0].id;
    layout.addTank('tropical', 'petit', supportId);
    layout.removeSupport(supportId);
    expect(layout.catalog().message).toBe(ROOM_LAYOUT_MESSAGES['support-occupe']);
    expect(state.furniture).toHaveLength(1);
  });

  it('bacs= en capture : meubles et bacs posés dans l’ordre, entrées invalides ignorées', () => {
    capture = true;
    layout.applyCaptureLayout(world(), [
      { kind: 'commode' },
      { kind: 'licorne' },
      { size: 'petit', on: 0 },
      { size: 'petit', on: 5 },
    ]);
    expect(state.furniture).toHaveLength(1);
    expect(state.tanks).toHaveLength(2);
    expect(layout.catalog().tanks[1].on).toBe('Commode 1');
    expect(saves).toBe(0);
  });

  it('nom de la place d’un bac : niveau précisé pour un meuble à plusieurs niveaux', () => {
    expect(supportPlaceLabel({ id: 0, kind: 'commode', x: 0, z: 0, quarter: 0 }, 0)).toBe(
      'Commode 1',
    );
    const rack = { id: 1, kind: 'etagere-animalerie', x: 0, z: 0, quarter: 0 } as const;
    expect(supportPlaceLabel(rack, 2)).toBe('Étagère d’animalerie 2, niveau 3');
  });
});
