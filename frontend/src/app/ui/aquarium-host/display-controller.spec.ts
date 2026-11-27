import type { AquariumView } from '../../render/aquarium-view';
import { LUNAR_CYCLE_DAYS, moonGlow, NEW_MOON_GLOW, REDUCED_MOON_AMPLITUDE } from '../../sim/moon';
import type { Room } from '../../sim/room';
import {
  FILTER_ATTRIBUTE,
  FOOD_STYLE_ATTRIBUTE,
  RAIN_ATTRIBUTE,
  REDUCED_MOTION_ATTRIBUTE,
  ROOM_ATTRIBUTE,
} from './aquarium-attributes';
import { AquariumProbe } from './aquarium-probe';
import { DisplayController } from './display-controller';

/** Double de la vue : accepte ce que le test lui dit d'accepter. */
class FakeView {
  acceptsRain = true;
  roomShown = false;
  reduced: boolean | null = null;
  layouts = 0;
  setFilter(): boolean {
    return true;
  }
  decorShown = true;
  setDecorVisible(visible: boolean): void {
    this.decorShown = visible;
  }
  setRain(enabled: boolean): boolean {
    return enabled && this.acceptsRain;
  }
  foodStyle = '';
  setFoodStyle(style: string): void {
    this.foodStyle = style;
  }
  setRoomLayout(): void {
    this.layouts++;
  }
  setRoom(room: Room): void {
    this.roomShown = room.shown;
  }
  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }
}

describe('DisplayController (#696)', () => {
  let element: HTMLElement;
  let view: FakeView | null;
  let capture: boolean;
  let stored: Map<string, string>;
  let system: boolean;
  let reduced: boolean;
  let moonEnabled: boolean;
  let calls: string[];
  let display: DisplayController;

  beforeEach(() => {
    element = document.createElement('div');
    view = new FakeView();
    capture = false;
    stored = new Map();
    system = false;
    reduced = false;
    moonEnabled = true;
    calls = [];
    display = new DisplayController({
      probe: new AquariumProbe(element),
      view: () => view as unknown as AquariumView | null,
      isCapture: () => capture,
      filterStorage: () => ({
        getItem: (key) => stored.get(key) ?? null,
        setItem: (key, value) => void stored.set(key, value),
      }),
      motion: { system: () => system, reduced: () => reduced },
      moon: { enabled: () => moonEnabled },
      roomState: () => null,
      roomShown: (_room, shown) => calls.push(`pièce:${shown}`),
      saveNow: () => calls.push('sauvegarde'),
      scheduleFrame: () => calls.push('image'),
    });
  });

  it('lune (#856) : variation entière, minimale avec « Réduire les mouvements », nulle sans l’option', () => {
    const newMoonDay = LUNAR_CYCLE_DAYS / 2;
    expect(display.moonGlowAt(0)).toBe(1);
    expect(display.moonGlowAt(newMoonDay)).toBe(NEW_MOON_GLOW);
    reduced = true;
    expect(display.moonGlowAt(newMoonDay)).toBe(moonGlow(0, REDUCED_MOON_AMPLITUDE));
    moonEnabled = false;
    expect(display.moonGlowAt(newMoonDay)).toBe(1);
  });

  it('lune en capture : option mémorisée ignorée, `lune=` fixe la phase', () => {
    display.setCaptureMoonPhase(0);
    expect(display.moonGlowAt(0)).toBe(1);
    capture = true;
    moonEnabled = false;
    expect(display.moonGlowAt(0)).toBe(1);
    display.setCaptureMoonPhase(0);
    expect(display.moonGlowAt(0)).toBe(NEW_MOON_GLOW);
    system = true;
    expect(display.moonGlowAt(0)).toBe(moonGlow(0, REDUCED_MOON_AMPLITUDE));
    display.setCaptureMoonPhase(null);
    expect(display.moonGlowAt(0)).toBe(1);
  });

  it('filtre : appliqué, exposé et mémorisé ; jamais mémorisé en capture', () => {
    display.toggleFilter();
    expect(display.filter()).toBe('aucun');
    expect(element.getAttribute(FILTER_ATTRIBUTE)).toBe('aucun');
    expect([...stored.values()]).toEqual(['aucun']);
    capture = true;
    stored.clear();
    display.toggleFilter();
    expect(display.filter()).toBe('pixel');
    expect(stored.size).toBe(0);
  });

  it('pluie : refusée hors du bassin, état exposé', () => {
    view!.acceptsRain = false;
    display.setRain(true);
    expect(display.rain()).toBe(false);
    expect(element.getAttribute(RAIN_ATTRIBUTE)).toBe('false');
    view!.acceptsRain = true;
    display.setRain(true);
    expect(display.rain()).toBe(true);
  });

  it('granulés : bascule enregistrée ; style inconnu ignoré', () => {
    display.toggleFoodStyle();
    expect(display.foodStyle()).toBe('points');
    expect(element.getAttribute(FOOD_STYLE_ATTRIBUTE)).toBe('points');
    expect(view!.foodStyle).toBe('points');
    expect(calls).toEqual(['sauvegarde', 'image']);
    // Valeur venue de l'extérieur : hors du type, refusée à l'exécution.
    display.setFoodStyle('bulles' as never);
    expect(calls).toEqual(['sauvegarde', 'image']);
  });

  it('pièce : affichée, exposée, suivie ; sans effet si déjà dans l’état demandé', () => {
    display.setRoomShown(true);
    expect(display.room().shown).toBe(true);
    expect(element.getAttribute(ROOM_ATTRIBUTE)).toBe('true');
    expect(view!.layouts).toBe(1);
    expect(calls).toEqual(['pièce:true', 'sauvegarde', 'image']);
    display.setRoomShown(true);
    expect(calls.length).toBe(3);
  });

  it('mouvements réduits : option hors capture, préférence système en capture', () => {
    reduced = true;
    display.applyReducedMotion();
    expect(view!.reduced).toBe(true);
    expect(element.getAttribute(REDUCED_MOTION_ATTRIBUTE)).toBe('true');
    capture = true;
    expect(display.reducedMotion()).toBe(false);
    system = true;
    expect(display.reducedMotion()).toBe(true);
  });

  it('avant le démarrage ou en capture : aucun réglage', () => {
    view = null;
    display.setDecorVisible(false);
    display.setRain(true);
    display.setRoomShown(true);
    display.toggleFilter();
    view = new FakeView();
    capture = true;
    display.setDecorVisible(false);
    display.toggleFoodStyle();
    expect(display.decorVisible()).toBe(true);
    expect(display.foodStyle()).toBe('voxels');
    expect(calls).toEqual([]);
  });
});
