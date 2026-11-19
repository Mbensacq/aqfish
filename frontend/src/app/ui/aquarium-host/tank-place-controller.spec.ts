import { signal } from '@angular/core';

import type { AquariumView } from '../../render/aquarium-view';
import type { EnvironmentId } from '../../sim/environment';
import type { StashedWorlds } from '../../sim/environment-worlds';
import { syncRoom, type RoomState } from '../../sim/room-state';
import { DEFAULT_TANK, type TankDimensions } from '../../sim/tank';
import { createWorld } from '../../sim/world';
import type { MutableWorld, World } from '../../sim/world-types';
import { CAMERA_ATTRIBUTE } from './aquarium-attributes';
import { AquariumProbe } from './aquarium-probe';
import { TankPlaceController } from './tank-place-controller';

describe('TankPlaceController (#696)', () => {
  let world: MutableWorld | null;
  let capture: boolean;
  let stash: StashedWorlds;
  let room: RoomState | null;
  let dims: ReturnType<typeof signal<TankDimensions | null>>;
  let selected: number | null;
  let calls: string[];
  let decorSelections: number[];
  let place: TankPlaceController;
  let element: HTMLElement;

  beforeEach(() => {
    world = createWorld(5, [{ species: 'neon', count: 2 }], [], [], 'tropical') as MutableWorld;
    capture = false;
    stash = new Map<EnvironmentId, World>();
    room = null;
    dims = signal<TankDimensions | null>(DEFAULT_TANK);
    selected = null;
    calls = [];
    decorSelections = [];
    const view = {
      setDecorSelection: (index: number) => decorSelections.push(index),
      cameraPosition: () => [0, 1, 2],
      cameraTarget: () => [0, 0, 0],
    };
    element = document.createElement('div');
    place = new TankPlaceController({
      probe: new AquariumProbe(element),
      world: () => world,
      setWorld: (next) => {
        world = next;
        calls.push(`monde:${next.environment}`);
      },
      view: () => view as unknown as AquariumView,
      isCapture: () => capture,
      tanks: {
        advanceBackground: () => calls.push('rattrapage'),
        sync: (shown: World) => {
          room = syncRoom(room, shown, []).room;
          return room;
        },
        get stash() {
          return stash;
        },
        setStash: (next: StashedWorlds) => {
          stash = next;
        },
        selectedTankId: 0,
      },
      refuse: (reason) => calls.push(`refus:${reason}`),
      finishDrop: () => calls.push('chute'),
      renderTime: () => 0,
      resetLoopClock: () => calls.push('boucle'),
      carryClock: () => calls.push('heure'),
      relight: () => calls.push('éclairage'),
      readouts: {
        refreshEnvironment: () => calls.push('environnement'),
        refreshPopulation: () => calls.push('effectifs'),
        refreshTankDimensions: () => calls.push('dimensions'),
        tankDimensions: dims,
      },
      refreshWater: () => calls.push('eau'),
      createView: (preset) => calls.push(`vue:${preset}`),
      activePreset: () => null,
      decorSelection: () => selected,
      saveNow: () => calls.push('sauvegarde'),
      scheduleFrame: () => calls.push('image'),
    });
  });

  it('environnement : monde rangé, repris, puis vue recréée et enregistré', () => {
    place.setEnvironment('bassin');
    expect(world!.environment).toBe('bassin');
    expect(stash.has('tropical')).toBe(true);
    expect(calls).toEqual([
      'chute',
      'rattrapage',
      'monde:bassin',
      'boucle',
      'heure',
      'éclairage',
      'environnement',
      'effectifs',
      'eau',
      'vue:top',
      'sauvegarde',
      'image',
    ]);
    expect(element.getAttribute(CAMERA_ATTRIBUTE)).not.toBeNull();
  });

  it('environnement inconnu, déjà affiché ou en capture : rien', () => {
    place.setEnvironment('lune');
    place.setEnvironment('tropical');
    capture = true;
    place.setEnvironment('bassin');
    expect(calls).toEqual([]);
  });

  it('dimensions : appliquées, vue recadrée, sélection hors du décor oubliée', () => {
    selected = 0;
    place.setTankDimensions({ ...DEFAULT_TANK, width: 1.4 });
    expect(calls).toEqual(['chute', 'dimensions', 'vue:three-quarter', 'sauvegarde', 'image']);
    // Monde sans décor : la sélection, hors du décor, n'est pas reposée sur la vue.
    expect(decorSelections).toEqual([]);
  });

  it('dimensions inchangées : la chute se termine, rien d’autre', () => {
    place.setTankDimensions(DEFAULT_TANK);
    expect(calls).toEqual(['chute']);
  });

  it('dimensions hors d’un bac réglable : rien', () => {
    dims.set(null);
    place.setTankDimensions(DEFAULT_TANK);
    expect(calls).toEqual([]);
  });

  it('forme du bassin : inchangée ignorée, nouvelle appliquée', () => {
    world = createWorld(5, [], [], [], 'bassin') as MutableWorld;
    place.setPondShape('rectangle');
    expect(calls).toEqual([]);
    place.setPondShape('haricot');
    expect(world.shape).toBe('haricot');
    expect(calls).toEqual(['chute', 'dimensions', 'vue:top', 'sauvegarde', 'image']);
  });
});
