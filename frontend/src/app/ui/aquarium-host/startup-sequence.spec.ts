import { signal } from '@angular/core';

import type { CameraPreset } from '../../core/capture/capture-params';
import { DEFAULT_FOOD_STYLE, type FoodStyle } from '../../core/food-style/food-style';
import type { RenderFilter } from '../../core/render-filter/render-filter';
import { DEFAULT_DAY_CLOCK, type DayClock } from '../../sim/daylight';
import { DEFAULT_ROOM, type Room } from '../../sim/room';
import { syncRoom } from '../../sim/room-state';
import { DEFAULT_SIM_SPEED, type SimSpeed } from '../../sim/sim-speed';
import { createWorld } from '../../sim/world';
import type { MutableWorld, World } from '../../sim/world-types';
import { AquariumProbe } from './aquarium-probe';
import type { ImportedSave, RestoredSave } from './save-share-controller';
import {
  initialDayClock,
  StartupSequence,
  type StartupControllers,
  type StartupMode,
} from './startup-sequence';

describe('StartupSequence (#696)', () => {
  let calls: string[];
  let modes: StartupMode[];
  let world: MutableWorld | null;
  let dayClock: DayClock;
  let stored: RestoredSave | null;
  let cleanups: (() => void)[];
  let keys: boolean[];
  let defaultView: Window | null;
  let speed: ReturnType<typeof signal<SimSpeed>>;
  let foodStyle: ReturnType<typeof signal<FoodStyle>>;
  let room: ReturnType<typeof signal<Room>>;
  let sequence: StartupSequence;

  beforeEach(() => {
    calls = [];
    modes = [];
    world = null;
    dayClock = DEFAULT_DAY_CLOCK;
    stored = null;
    cleanups = [];
    keys = [];
    defaultView = window;
    speed = signal<SimSpeed>(DEFAULT_SIM_SPEED);
    foodStyle = signal<FoodStyle>(DEFAULT_FOOD_STYLE);
    room = signal<Room>(DEFAULT_ROOM);
    const log = (name: string) => (): void => {
      calls.push(name);
    };
    const controllers = {
      clock: { refreshFrozen: log('heure figée ?'), applySpeed: log('vitesse') },
      saves: {
        readStored: () => {
          calls.push('sauvegarde lue');
          return stored;
        },
        activate: log('sauvegarde active'),
        publishStatus: log('état de la sauvegarde'),
        status: signal(null),
      },
      tanks: {
        stashOthers: log('mondes rangés'),
        restore: log('pièce reprise'),
        sync: (shown: World) => {
          calls.push('pièce');
          return syncRoom(null, shown, []).room;
        },
      },
      roomLayout: { applyCaptureLayout: log('bacs de capture') },
      waterCare: { presetWaterTest: log('test de l’eau') },
      readouts: {
        refreshEnvironment: log('environnement'),
        refreshPopulation: log('effectifs'),
      },
      decorEdit: {
        applyEditing: (editing: boolean) => calls.push(`éditeur:${editing}`),
        showCaptureSelection: log('sélection du décor'),
      },
      roomEdit: {
        editable: () => false,
        count: () => 0,
        showCaptureSelection: log('sélection de la pièce'),
      },
      free: {
        resumeStored: log('caméra libre reprise'),
        onKey: (_event: KeyboardEvent, down: boolean) => keys.push(down),
        releaseAll: log('touches relâchées'),
      },
      loop: { setHidden: log('masquée'), resetClock: log('boucle remise') },
    } as unknown as StartupControllers;
    const doc = {
      get defaultView() {
        return defaultView;
      },
      visibilityState: 'visible',
      addEventListener: (type: string, listener: EventListener) =>
        document.addEventListener(type, listener),
      removeEventListener: (type: string, listener: EventListener) =>
        document.removeEventListener(type, listener),
    } as unknown as Document;
    sequence = new StartupSequence({
      document: doc,
      saveStorage: null,
      probe: new AquariumProbe(document.createElement('div')),
      signals: {
        speed,
        foodStyle,
        room,
        rain: signal(false),
        filter: signal<RenderFilter>('pixel'),
        soundAllowed: signal(false),
      },
      controllers: () => controllers,
      isStopped: () => false,
      setMode: (mode) => {
        modes.push(mode);
        calls.push('mode');
      },
      isWallpaper: () => modes.at(-1)?.wallpaper ?? false,
      setWallpaperFps: log('cadence'),
      forbidSound: log('silence'),
      dayClock: () => dayClock,
      setDayClock: (clock) => {
        dayClock = clock;
        calls.push('horloge');
      },
      setWorld: (next) => {
        world = next;
        calls.push('monde');
      },
      setPixelRatio: log('pixel ratio'),
      decorVisible: () => true,
      relight: log('éclairage'),
      refreshWater: log('eau'),
      createView: (preset: CameraPreset) => calls.push(`vue:${preset}`),
      view: () => null,
      clearActivePreset: log('préréglage quitté'),
      onCleanup: (cleanup) => cleanups.push(cleanup),
      scheduleFrame: log('image'),
    });
  });

  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  it('ne démarre rien sans fenêtre', () => {
    defaultView = null;
    sequence.start();
    expect(calls).toEqual([]);
  });

  it('démarre un monde neuf dans l’ordre figé des étapes', () => {
    sequence.start();
    expect(modes).toEqual([{ capture: false, fouling: 0, wallpaper: false }]);
    expect(calls).toEqual([
      'mode',
      'horloge',
      'sauvegarde lue',
      'monde',
      'pièce',
      'sauvegarde active',
      'heure figée ?',
      'environnement',
      'effectifs',
      'eau',
      'état de la sauvegarde',
      'pixel ratio',
      'vue:three-quarter',
      'éditeur:false',
      'caméra libre reprise',
      'image',
    ]);
    expect(world?.environment).toBe('tropical');
    expect(dayClock).toEqual(initialDayClock(null, false));
  });

  it('reprend la sauvegarde lue : mondes rangés, pièce, réglages et horloge', () => {
    const saved = createWorld(9, [{ species: 'neon', count: 3 }], [], [], 'tropical');
    const clock = { ...DEFAULT_DAY_CLOCK, startHour: 7 };
    stored = {
      room: syncRoom(null, saved, []).room,
      selectedTankId: 0,
      world: saved,
      settings: { speed: 2 as SimSpeed, clock, foodStyle: 'points' as FoodStyle },
      others: [],
    };
    sequence.start();
    expect(world).toBe(saved);
    expect(speed()).toBe(2);
    expect(foodStyle()).toBe('points');
    expect(room()).toEqual(DEFAULT_ROOM);
    expect(dayClock).toBe(clock);
    const index = calls.indexOf('sauvegarde lue');
    expect(calls.slice(index, index + 5)).toEqual([
      'sauvegarde lue',
      'mondes rangés',
      'pièce reprise',
      'horloge',
      'monde',
    ]);
  });

  it('écoute la fenêtre : redimensionnement, touches tenues, perte du focus, puis se désabonne', () => {
    sequence.start();
    calls = [];
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'z' }));
    window.dispatchEvent(new Event('blur'));
    expect(calls).toEqual(['image', 'touches relâchées']);
    expect(keys).toEqual([true, false]);
    cleanups.splice(0).forEach((cleanup) => cleanup());
    calls = [];
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }));
    expect(calls).toEqual([]);
    expect(keys).toEqual([true, false]);
  });

  it('installe une sauvegarde importée puis recrée la vue sur la caméra de son environnement', () => {
    const imported = createWorld(4, [], [], [], 'bassin');
    const clock = { ...DEFAULT_DAY_CLOCK, startHour: 20 };
    sequence.loadImported({
      ok: true,
      room: syncRoom(null, imported, []).room,
      selectedTankId: 0,
      world: imported,
      settings: { speed: 4 as SimSpeed, clock },
      others: [],
    } as unknown as ImportedSave);
    expect(world).toBe(imported);
    expect(dayClock).toBe(clock);
    expect(foodStyle()).toBe(DEFAULT_FOOD_STYLE);
    expect(calls).toEqual([
      'pièce reprise',
      'monde',
      'mondes rangés',
      'boucle remise',
      'vitesse',
      'horloge',
      'éclairage',
      'heure figée ?',
      'environnement',
      'effectifs',
      'eau',
      'vue:top',
      'image',
    ]);
  });
});
