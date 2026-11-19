import { DEFAULT_ROOM, type Room } from '../../sim/room';
import { DEFAULT_TANK } from '../../sim/tank';
import {
  RoomEditingController,
  type DecorEditorPort,
  type RoomEditingPorts,
  type RoomEditingView,
} from './room-editing-controller';

/** Vue 3D enregistrant ce que le contrôleur lui demande. */
class FakeView implements RoomEditingView {
  selection: number | null = null;
  readonly previews: Room[] = [];
  setRoomSelection(index: number | null): void {
    this.selection = index;
  }
  previewRoom(room: Room): void {
    this.previews.push(room);
  }
}

const SHELF = { kind: 'etagere', x: -1.25, z: -0.17, quarter: 0 } as const;
const POT = { kind: 'plante-pot', x: -1.4, z: -0.17 } as const;

describe('RoomEditingController (#695)', () => {
  let room: Room;
  let view: FakeView;
  let editing: boolean;
  let refused: boolean;
  let editorCalls: string[];
  let saves: number;
  let edit: RoomEditingController;

  beforeEach(() => {
    room = { ...DEFAULT_ROOM, shown: true };
    view = new FakeView();
    editing = true;
    refused = false;
    editorCalls = [];
    saves = 0;
    const editor: DecorEditorPort = {
      editing: () => editing,
      setRefused: (value) => {
        refused = value;
      },
      hideDecorSelection: () => editorCalls.push('masque-decor'),
      deselectAll: () => editorCalls.push('aucune-selection'),
    };
    const ports: RoomEditingPorts = {
      room: () => room,
      applyRoom: (next) => {
        room = next;
        edit.roomApplied(next, next.shown);
      },
      dimensions: () => DEFAULT_TANK,
      obstacles: () => [],
      view: () => view,
      probe: { publishRoomSelection: () => undefined, publishRoomCount: () => undefined },
      editor,
      saveNow: () => {
        saves += 1;
      },
      scheduleFrame: () => undefined,
    };
    edit = new RoomEditingController(ports);
    edit.roomApplied(room, true);
  });

  /** Étagère posée sur le parquet, puis pot de plante posé dessus. */
  function furnish(): void {
    edit.add('etagere', SHELF.x, SHELF.z);
    edit.add('plante-pot', POT.x, POT.z);
  }

  it('pose sur le parquet puis sur l’étagère : sélectionné, enregistré, refus effacé', () => {
    refused = true;
    furnish();
    expect(room.items).toEqual([SHELF, { ...POT, quarter: 0, elevation: 0.8 }]);
    expect(edit.selection()).toBe(1);
    expect(view.selection).toBe(1);
    expect(edit.count()).toBe(2);
    expect(refused).toBe(false);
    expect(saves).toBe(2);
    expect(editorCalls).toContain('masque-decor');
  });

  it('pose refusée (meuble du bac) : toute sélection levée, refus signalé, rien posé', () => {
    edit.add('etagere', 0, 0.1);
    expect(room.items).toBeUndefined();
    expect(editorCalls).toEqual(['aucune-selection']);
    expect(refused).toBe(true);
    expect(saves).toBe(0);
  });

  it('sélection : seulement en édition et pour un indice existant ; null désélectionne toujours', () => {
    furnish();
    edit.select(7);
    expect(edit.selection()).toBe(1);
    editing = false;
    edit.select(0);
    expect(edit.selection()).toBe(1);
    edit.select(null);
    expect(edit.selection()).toBeNull();
  });

  it('quart de tour : refusé dans le mur, accepté pour le pot ; pas nul ou sans sélection : rien', () => {
    furnish();
    expect(edit.turnSelected(-1)).toBe(true);
    expect(room.items?.[1]).toMatchObject({ quarter: 3, elevation: 0.8 });
    expect(edit.turnSelected(0)).toBe(false);
    edit.select(0);
    expect(edit.turnSelected(1)).toBe(false);
    expect(refused).toBe(true);
    edit.select(null);
    expect(edit.turnSelected(1)).toBe(false);
  });

  it('supprimer l’étagère : le pot retombe sur le parquet, sélection levée', () => {
    furnish();
    edit.select(0);
    expect(edit.deleteSelected()).toBe(true);
    expect(room.items).toEqual([{ ...POT, quarter: 0 }]);
    expect(edit.selection()).toBeNull();
    expect(edit.deleteSelected()).toBe(false);
  });

  it('dernier élément supprimé : la pièce n’a plus de liste d’éléments', () => {
    edit.add('etagere', SHELF.x, SHELF.z);
    expect(edit.deleteSelected()).toBe(true);
    expect(room).toEqual({ shown: true, cabinetHeight: DEFAULT_ROOM.cabinetHeight });
  });

  it('glisser : aperçu sans changer la pièce, dernière pose acceptée appliquée au relâchement', () => {
    furnish();
    const before = room;
    edit.startDrag(0);
    edit.moveDrag(0, -2.2, 0.6);
    edit.moveDrag(0, 0, 0);
    expect(room).toBe(before);
    expect(view.previews).toHaveLength(1);
    expect(edit.turnSelected(1)).toBe(false);
    edit.endDrag(0, true);
    expect(room.items?.[0]).toEqual({ ...SHELF, x: -2.2, z: 0.6 });
    expect(edit.selection()).toBe(0);
  });

  it('glisser sans pose acceptée : pièce rendue et refus ; abandonné : sans refus', () => {
    furnish();
    const before = room;
    edit.startDrag(1);
    edit.moveDrag(1, 0, 0);
    edit.endDrag(1, true);
    expect(room).toBe(before);
    expect(view.previews.at(-1)).toBe(before);
    expect(refused).toBe(true);
    edit.startDrag(1);
    edit.moveDrag(1, -2.2, 0.6);
    edit.endDrag(1, false);
    expect(room).toBe(before);
    expect(refused).toBe(false);
  });

  it('pièce masquée : non modifiable, sélection levée ; vue neuve : sélection et geste levés', () => {
    furnish();
    edit.roomApplied(room, false);
    expect(edit.editable()).toBe(false);
    expect(edit.selection()).toBeNull();
    expect(view.selection).toBeNull();
    edit.roomApplied(room, true);
    edit.startDrag(0);
    edit.moveDrag(0, -2.2, 0.6);
    edit.viewCreated();
    const before = room;
    edit.endDrag(0, true);
    expect(room).toBe(before);
    edit.showCaptureSelection(1);
    expect(edit.selection()).toBe(1);
    expect(view.selection).toBe(1);
  });
});
