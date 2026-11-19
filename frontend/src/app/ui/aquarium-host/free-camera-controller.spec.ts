import { signal } from '@angular/core';

import type { CameraPreset } from '../../core/capture/capture-params';
import { FREE_CAMERA_STORAGE_KEY } from '../../core/free-camera-pref/free-camera-pref';
import type { AquariumView } from '../../render/aquarium-view';
import { FreeCameraController } from './free-camera-controller';

/** Double minimal de la vue : seule la caméra libre compte ici. */
class FakeView {
  freeCameraActive = false;
  roomShown = true;
  readonly steps: number[] = [];
  enterFreeCamera(): boolean {
    this.freeCameraActive = this.roomShown;
    return this.roomShown;
  }
  exitFreeCamera(): void {
    this.freeCameraActive = false;
  }
  stepFreeCamera(axes: { forward: number }, dt: number): boolean {
    this.steps.push(axes.forward);
    return axes.forward !== 0 && dt > 0;
  }
}

/** Stockage en mémoire de la préférence d'affichage. */
class MemoryStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('FreeCameraController (#696)', () => {
  let fake: FakeView;
  let view: AquariumView | null;
  let capture: boolean;
  let wallpaper: boolean;
  let storage: MemoryStorage;
  let published: boolean[];
  let frames: number;
  const activePreset = signal<CameraPreset | null>('front');
  let free: FreeCameraController;
  const key = (type: string, name: string): KeyboardEvent =>
    new KeyboardEvent(type, { key: name, cancelable: true });

  beforeEach(() => {
    fake = new FakeView();
    // Le double ne porte que ce que le contrôleur lit de la vue.
    view = fake as unknown as AquariumView;
    capture = false;
    wallpaper = false;
    storage = new MemoryStorage();
    published = [];
    frames = 0;
    activePreset.set('front');
    free = new FreeCameraController({
      view: () => view,
      isCapture: () => capture,
      isWallpaper: () => wallpaper,
      prefStorage: () => storage,
      activePreset,
      publishFreeCamera: (active) => published.push(active),
      publishCamera: () => undefined,
      scheduleFrame: () => frames++,
    });
  });

  it('entrer puis revenir : préréglage rendu, préférence mémorisée', () => {
    free.toggle();
    expect(free.active()).toBe(true);
    expect(activePreset()).toBeNull();
    expect(storage.getItem(FREE_CAMERA_STORAGE_KEY)).not.toBeNull();
    const freeValue = storage.getItem(FREE_CAMERA_STORAGE_KEY);
    free.toggle();
    expect(free.active()).toBe(false);
    expect(activePreset()).toBe('front');
    expect(storage.getItem(FREE_CAMERA_STORAGE_KEY)).not.toBe(freeValue);
    expect(published).toEqual([true, false]);
  });

  it('sans pièce, en capture, en fond d’écran ou sans vue : bascule sans effet', () => {
    fake.roomShown = false;
    free.toggle();
    expect(free.active()).toBe(false);
    fake.roomShown = true;
    capture = true;
    free.toggle();
    capture = false;
    wallpaper = true;
    free.toggle();
    wallpaper = false;
    view = null;
    free.toggle();
    expect(free.active()).toBe(false);
    expect(storage.data.size).toBe(0);
    expect(frames).toBe(0);
  });

  it('préférence reprise au démarrage, sauf en capture ou en fond d’écran', () => {
    free.toggle();
    free.reset();
    fake.exitFreeCamera();
    wallpaper = true;
    free.resumeStored();
    expect(free.active()).toBe(false);
    wallpaper = false;
    free.resumeStored();
    expect(free.active()).toBe(true);
  });

  it('touche tenue lue à chaque image, relâchée, ignorée hors caméra libre', () => {
    const outside = key('keydown', 'z');
    free.onKey(outside, true);
    expect(outside.defaultPrevented).toBe(false);
    free.toggle();
    const down = key('keydown', 'z');
    free.onKey(down, true);
    expect(down.defaultPrevented).toBe(true);
    expect(free.step(view!, 0.1)).toBe(true);
    free.onKey(key('keyup', 'z'), false);
    expect(free.step(view!, 0.1)).toBe(false);
    free.onKey(key('keydown', 'z'), true);
    free.releaseAll();
    expect(free.step(view!, 0.1)).toBe(false);
  });

  it('bouton tenu : comme une touche, sans effet hors caméra libre', () => {
    free.setMoveHeld('avancer', true);
    expect(frames).toBe(0);
    free.toggle();
    free.setMoveHeld('avancer', true);
    expect(free.step(view!, 0.1)).toBe(true);
    free.setMoveHeld('avancer', false);
    expect(free.step(view!, 0.1)).toBe(false);
  });

  it('préréglage choisi : orbite mémorisée, touches relâchées', () => {
    free.toggle();
    free.setMoveHeld('avancer', true);
    free.leaveForPreset();
    expect(free.active()).toBe(false);
    const orbit = storage.getItem(FREE_CAMERA_STORAGE_KEY);
    fake.exitFreeCamera();
    expect(free.step(view!, 0.1)).toBe(false);
    free.toggle();
    expect(storage.getItem(FREE_CAMERA_STORAGE_KEY)).not.toBe(orbit);
  });

  it('pièce masquée : retour au préréglage d’avant seulement si la vue a quitté le mode', () => {
    free.toggle();
    free.roomShownChanged();
    expect(free.active()).toBe(true);
    fake.exitFreeCamera();
    free.roomShownChanged();
    expect(free.active()).toBe(false);
    expect(activePreset()).toBe('front');
  });
});
