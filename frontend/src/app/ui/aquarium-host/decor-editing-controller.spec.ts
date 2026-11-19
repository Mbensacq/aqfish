import type { DecorDropper } from '../../core/decor-physics/decor-physics';
import type { DecorItem } from '../../sim/decor';
import { DROP_TIME_STEP, type DropScene } from '../../sim/decor-drop';
import { createDefaultWorld } from '../../sim/world';
import type { MutableWorld } from '../../sim/world-types';
import {
  DecorEditingController,
  type DecorEditingPorts,
  type DecorEditingView,
  type RoomEditingPort,
} from './decor-editing-controller';

/** Vue 3D enregistrant ce que le contrôleur lui demande. */
class FakeView implements DecorEditingView {
  selection: number | null = null;
  dragEnabled = false;
  readonly moves: [number, number, number][] = [];
  readonly poses: [number, number, number, number][] = [];
  replaced = 0;
  setDecorSelection(index: number | null): void {
    this.selection = index;
  }
  previewDecorMove(index: number, x: number, z: number): void {
    this.moves.push([index, x, z]);
  }
  previewDecorPose(index: number, x: number, y: number, z: number): void {
    this.poses.push([index, x, y, z]);
  }
  replaceDecorItems(): void {
    this.replaced += 1;
  }
  setDecorDragEnabled(enabled: boolean): void {
    this.dragEnabled = enabled;
  }
}

/** Pièce sans élément, gestes enregistrés. */
function fakeRoom(): RoomEditingPort & { calls: string[]; current: number | null } {
  const port = {
    calls: [] as string[],
    current: null as number | null,
    selection: () => port.current,
    editable: () => true,
    clearSelection: () => {
      port.calls.push('clear');
      port.current = null;
    },
    select: (index: number | null) => port.calls.push(`select:${index}`),
    add: (kind: string, x: number, z: number) => port.calls.push(`add:${kind}:${x}:${z}`),
    turnSelected: (steps: number) => {
      port.calls.push(`turn:${steps}`);
      return true;
    },
    deleteSelected: () => {
      port.calls.push('delete');
      return true;
    },
  };
  return port;
}

/** Moteur de chute qui pose l'élément sur le sable à la verticale du départ, en deux points. */
const FALLING_DROPPER: DecorDropper = {
  drop: (scene: DropScene) => {
    const rest = { ...scene.start, y: scene.groundBaseY };
    return {
      rest,
      path: [{ ...scene.start, y: (scene.start.y + rest.y) / 2 }, rest],
      settled: true,
    };
  },
};

describe('DecorEditingController (#695)', () => {
  let world: MutableWorld;
  let view: FakeView;
  let room: ReturnType<typeof fakeRoom>;
  let saves: number;
  let decorVisible: boolean;
  let capture: boolean;
  let loader: () => Promise<DecorDropper>;
  let published: string[];

  function controller(): DecorEditingController {
    const ports: DecorEditingPorts = {
      world: () => world,
      view: () => view,
      isCapture: () => capture,
      loadPhysics: () => loader(),
      probe: {
        publishDecorPhysics: (state) => published.push(`physique:${state}`),
        publishEditing: (editing) => published.push(`edition:${editing}`),
        publishDecorCount: (count) => published.push(`nombre:${count}`),
        publishDecorSelection: (index) => published.push(`selection:${index}`),
      },
      decorVisible: () => decorVisible,
      showDecor: () => {
        decorVisible = true;
      },
      decorChanged: () => published.push('decor-change'),
      room,
      saveNow: () => {
        saves += 1;
      },
      scheduleFrame: () => undefined,
    };
    return new DecorEditingController(ports);
  }

  beforeEach(() => {
    world = createDefaultWorld(42);
    view = new FakeView();
    room = fakeRoom();
    saves = 0;
    decorVisible = true;
    capture = false;
    loader = () => new Promise<never>(() => undefined);
    published = [];
  });

  it('entrer en édition : décor réaffiché, moteur demandé une fois, gestes permis', () => {
    decorVisible = false;
    const load = vi.fn(() => new Promise<never>(() => undefined));
    loader = load;
    const edit = controller();
    edit.setEditing(true);
    edit.setEditing(false);
    edit.setEditing(true);
    expect(decorVisible).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(edit.editing()).toBe(true);
    expect(edit.physics()).toBe('chargement');
    expect(view.dragEnabled).toBe(true);
    expect(published).toContain('physique:chargement');
  });

  it('en capture, ou dans un environnement non éditable : le mode ne change pas', () => {
    capture = true;
    const edit = controller();
    edit.setEditing(true);
    expect(edit.editing()).toBe(false);
    capture = false;
    world = createDefaultWorld(42, 'bassin');
    edit.setEditing(true);
    expect(edit.editing()).toBe(false);
  });

  it('applyEditing en capture : mode exposé, gestes refusés', () => {
    capture = true;
    const edit = controller();
    edit.showCaptureSelection(1);
    expect(edit.editing()).toBe(true);
    expect(view.dragEnabled).toBe(false);
    expect(edit.selection()).toBe(1);
    expect(view.selection).toBe(1);
  });

  it('moteur indisponible : retenu, et un lâcher est posé sur le sable avec le message', async () => {
    loader = () => Promise.reject(new Error('hors ligne'));
    const edit = controller();
    edit.setEditing(true);
    await vi.waitFor(() => expect(edit.physics()).toBe('indisponible'));
    edit.editAt({ kind: 'sand', x: 0, z: 0.1 });
    expect(world.decor.at(-1)).toMatchObject({ kind: 'rock', x: 0, z: 0.1 });
    expect(edit.dropGrounded()).toBe(true);
    expect(edit.selection()).toBe(world.decor.length - 1);
    expect(saves).toBe(1);
    expect(published).toContain('decor-change');
  });

  it('chute affichée : la vue suit la trajectoire puis rejoint la pose enregistrée', async () => {
    loader = () => Promise.resolve(FALLING_DROPPER);
    const edit = controller();
    edit.setEditing(true);
    await vi.waitFor(() => expect(edit.physics()).toBe('pret'));
    edit.editAt({ kind: 'sand', x: 0, z: 0.1 });
    const index = world.decor.length - 1;
    edit.stepDrop(0);
    edit.stepDrop(DROP_TIME_STEP);
    edit.stepDrop(10);
    expect(view.poses.map(([i]) => i)).toEqual([index, index, index]);
    const last = view.poses.at(-1)!;
    expect([last[1], last[3]]).toEqual([world.decor[index].x, world.decor[index].z]);
    // Chute finie : plus rien n'est demandé à la vue.
    edit.stepDrop(1);
    expect(view.poses).toHaveLength(3);
  });

  it('les gestes visant la pièce passent à la pièce', () => {
    const edit = controller();
    edit.setEditing(true);
    edit.setTool('etagere');
    edit.editAt({ kind: 'floor', x: 1, z: 2 });
    edit.setTool('select');
    edit.editAt({ kind: 'room-item', index: 3, x: 0, z: 0 });
    room.current = 3;
    expect(edit.rotateSelected(1)).toBe(true);
    expect(edit.scaleSelected(1)).toBe(false);
    expect(edit.deleteSelected()).toBe(true);
    expect(room.calls).toEqual(['add:etagere:1:2', 'select:3', 'turn:1', 'delete']);
  });

  it('sélectionner un élément du décor lève celle de la pièce ; hors édition, rien', () => {
    const edit = controller();
    edit.select(1);
    expect(edit.selection()).toBeNull();
    edit.setEditing(true);
    room.current = 0;
    edit.select(1);
    expect(edit.selection()).toBe(1);
    expect(room.calls).toContain('clear');
    expect(edit.refused()).toBe(false);
  });

  it('glisser : aperçu borné, pose enregistrée au lâcher, abandon si le décor a changé', () => {
    const edit = controller();
    edit.setEditing(true);
    const before: readonly DecorItem[] = world.decor;
    edit.startDrag(2);
    edit.moveDrag(2, 99, 0);
    expect(view.moves.at(-1)![1]).toBeLessThan(99);
    edit.endDrag(2, true);
    expect(world.decor).not.toBe(before);
    expect(world.decor[2].x).toBe(view.moves.at(-1)![1]);
    expect(saves).toBe(1);
    // Décor changé pendant le geste : abandonné sans pose.
    edit.startDrag(1);
    edit.moveDrag(1, 0, 0);
    edit.select(0);
    edit.deleteSelected();
    const after = world.decor;
    edit.endDrag(1, true);
    expect(world.decor).toBe(after);
  });

  it('nouvel environnement non éditable : le mode édition est quitté', () => {
    const edit = controller();
    edit.setEditing(true);
    edit.environmentChanged('bassin');
    expect(edit.editable()).toBe(false);
    expect(edit.editing()).toBe(false);
    expect(edit.count()).toBe(world.decor.length);
  });

  it('pièce masquée : un outil de la pièce redevient « Sélection »', () => {
    const edit = controller();
    edit.setTool('etagere');
    edit.roomShownChanged(true);
    expect(edit.tool()).toBe('etagere');
    edit.roomShownChanged(false);
    expect(edit.tool()).toBe('select');
    edit.setTool('licorne');
    expect(edit.tool()).toBe('select');
  });

  it('vue neuve : sélection et glissement levés', () => {
    const edit = controller();
    edit.setEditing(true);
    edit.startDrag(1);
    edit.moveDrag(1, 0, 0);
    edit.viewCreated();
    expect(edit.selection()).toBeNull();
    const decor = world.decor;
    edit.endDrag(1, true);
    expect(world.decor).toBe(decor);
  });
});
