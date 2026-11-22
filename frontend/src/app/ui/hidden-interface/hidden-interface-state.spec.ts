import { TestBed } from '@angular/core/testing';

import {
  CURSOR_IDLE_MS,
  HiddenInterfaceState,
  HINT_DURATION_MS,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP_PX,
} from './hidden-interface-state';

function key(name: string, init: KeyboardEventInit = {}, target?: Element): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  if (target) {
    Object.defineProperty(event, 'target', { value: target });
  }
  return event;
}

/** Événement de pointeur minimal (jsdom n'a pas toujours `PointerEvent`). */
function pointer(
  x: number,
  y: number,
  init: { id?: number; primary?: boolean } = {},
): PointerEvent {
  return {
    pointerId: init.id ?? 1,
    isPrimary: init.primary ?? true,
    clientX: x,
    clientY: y,
  } as PointerEvent; // Seuls ces champs sont lus par l'état.
}

describe('HiddenInterfaceState (#725)', () => {
  let state: HiddenInterfaceState;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    state = TestBed.inject(HiddenInterfaceState);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('interface affichée au départ, sans indication ni curseur caché', () => {
    expect(state.hidden()).toBe(false);
    expect(state.hintShown()).toBe(false);
    expect(state.cursorHidden()).toBe(false);
  });

  it('masquer : indication 3 s puis effacée ; réafficher l’efface tout de suite', () => {
    state.setHidden(true);
    expect(state.hidden()).toBe(true);
    expect(state.hintShown()).toBe(true);
    vi.advanceTimersByTime(HINT_DURATION_MS - 1);
    expect(state.hintShown()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(state.hintShown()).toBe(false);
    expect(state.hidden()).toBe(true);

    state.setHidden(false);
    state.setHidden(true);
    state.setHidden(false);
    expect(state.hintShown()).toBe(false);
    vi.advanceTimersByTime(HINT_DURATION_MS);
    expect(state.hintShown()).toBe(false);
  });

  it('remasquer pendant l’indication ne la prolonge pas au-delà de 3 s du dernier masquage', () => {
    state.setHidden(true);
    vi.advanceTimersByTime(2000);
    state.setHidden(true); // déjà masquée : sans effet
    vi.advanceTimersByTime(1000);
    expect(state.hintShown()).toBe(false);
  });

  it('touche I : bascule, en minuscule comme en majuscule ; Échap réaffiche', () => {
    expect(state.onKeydown(key('i'))).toBe(true);
    expect(state.hidden()).toBe(true);
    expect(state.onKeydown(key('I'))).toBe(true);
    expect(state.hidden()).toBe(false);
    state.toggle();
    expect(state.onKeydown(key('Escape'))).toBe(true);
    expect(state.hidden()).toBe(false);
  });

  it('Échap interface affichée : laissée aux panneaux', () => {
    expect(state.onKeydown(key('Escape'))).toBe(false);
    expect(state.hidden()).toBe(false);
  });

  it('ignore I dans un champ de saisie, avec Ctrl, Alt ou Méta, ou déjà prise', () => {
    const input = document.createElement('input');
    expect(state.onKeydown(key('i', {}, input))).toBe(false);
    expect(state.onKeydown(key('i', { ctrlKey: true }))).toBe(false);
    expect(state.onKeydown(key('i', { altKey: true }))).toBe(false);
    expect(state.onKeydown(key('i', { metaKey: true }))).toBe(false);
    const taken = key('i');
    taken.preventDefault();
    expect(state.onKeydown(taken)).toBe(false);
    expect(state.onKeydown(key('p'))).toBe(false);
    expect(state.hidden()).toBe(false);
  });

  it('Échap masquée fonctionne même depuis un champ (le focus y est resté)', () => {
    state.setHidden(true);
    expect(state.onKeydown(key('Escape', {}, document.createElement('input')))).toBe(true);
    expect(state.hidden()).toBe(false);
  });

  it('curseur caché après 2 s d’immobilité, revenu au moindre mouvement', () => {
    state.setHidden(true);
    vi.advanceTimersByTime(CURSOR_IDLE_MS - 1);
    expect(state.cursorHidden()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(state.cursorHidden()).toBe(true);
    state.onPointerMove(pointer(5, 5));
    expect(state.cursorHidden()).toBe(false);
    vi.advanceTimersByTime(CURSOR_IDLE_MS);
    expect(state.cursorHidden()).toBe(true);
    state.setHidden(false);
    expect(state.cursorHidden()).toBe(false);
  });

  it('interface affichée : le curseur ne se cache jamais', () => {
    state.onPointerMove(pointer(0, 0));
    vi.advanceTimersByTime(CURSOR_IDLE_MS * 3);
    expect(state.cursorHidden()).toBe(false);
  });

  it('appui long immobile : l’interface revient', () => {
    state.setHidden(true);
    state.onPointerDown(pointer(100, 100));
    state.onPointerMove(pointer(100 + LONG_PRESS_SLOP_PX, 100));
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(state.hidden()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(state.hidden()).toBe(false);
  });

  it('appui bref, glisser (rotation de la caméra) ou second doigt : l’interface reste masquée', () => {
    state.setHidden(true);
    state.onPointerDown(pointer(100, 100));
    vi.advanceTimersByTime(LONG_PRESS_MS / 2);
    state.onPointerEnd();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(state.hidden()).toBe(true);

    state.onPointerDown(pointer(100, 100));
    state.onPointerMove(pointer(100 + LONG_PRESS_SLOP_PX + 1, 100));
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(state.hidden()).toBe(true);

    state.onPointerDown(pointer(10, 10, { id: 2, primary: false }));
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(state.hidden()).toBe(true);
  });

  it('interface affichée : un appui long ne fait rien', () => {
    state.onPointerDown(pointer(0, 0));
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(state.hidden()).toBe(false);
  });

  it('réafficher annule l’appui long en cours', () => {
    state.setHidden(true);
    state.onPointerDown(pointer(0, 0));
    state.onKeydown(key('Escape'));
    state.setHidden(true);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(state.hidden()).toBe(true);
  });
});
