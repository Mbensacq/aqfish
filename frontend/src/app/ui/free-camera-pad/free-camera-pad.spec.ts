import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { FREE_CAMERA_PAD_BUTTONS, FreeCameraPad, type FreeCameraPadEvent } from './free-camera-pad';

describe('FreeCameraPad', () => {
  let fixture: ComponentFixture<FreeCameraPad>;
  let events: FreeCameraPadEvent[];

  const button = (move: string): HTMLButtonElement =>
    (fixture.nativeElement as HTMLElement).querySelector(
      `[data-free-move="${move}"]`,
    ) as HTMLButtonElement;

  function pointer(target: Element, type: string, init: PointerEventInit = {}): PointerEvent {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 5,
      button: 0,
      ...init,
    });
    target.dispatchEvent(event);
    return event;
  }

  beforeEach(async () => {
    events = [];
    fixture = TestBed.createComponent(FreeCameraPad);
    fixture.componentInstance.moveHeld.subscribe((event) => events.push(event));
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('deux boutons nommés, de haut en bas : Avancer, Reculer', () => {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Avancer', 'Reculer']);
    expect(FREE_CAMERA_PAD_BUTTONS.map((b) => b.move)).toEqual(['avancer', 'reculer']);
    expect(buttons.every((b) => b.type === 'button')).toBe(true);
  });

  it('appui puis relâchement : tenu puis relâché, une seule fois chacun', () => {
    const forward = button('avancer');
    const down = pointer(forward, 'pointerdown');
    expect(down.defaultPrevented).toBe(true);
    pointer(forward, 'pointerdown');
    pointer(forward, 'pointerup');
    pointer(forward, 'pointercancel');
    expect(events).toEqual([
      { move: 'avancer', held: true },
      { move: 'avancer', held: false },
    ]);
  });

  it('annulation du pointeur ou perte du focus : relâché', () => {
    pointer(button('reculer'), 'pointerdown');
    pointer(button('reculer'), 'pointercancel');
    button('avancer').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    button('avancer').dispatchEvent(new FocusEvent('blur'));
    expect(events).toEqual([
      { move: 'reculer', held: true },
      { move: 'reculer', held: false },
      { move: 'avancer', held: true },
      { move: 'avancer', held: false },
    ]);
  });

  it('autre bouton de souris : ignoré', () => {
    pointer(button('avancer'), 'pointerdown', { button: 2 });
    expect(events).toEqual([]);
  });

  it('clavier : Espace tenu puis relâché ; autres touches ignorées', () => {
    const back = button('reculer');
    back.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', cancelable: true }));
    const down = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
    back.dispatchEvent(down);
    back.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', cancelable: true }));
    expect(down.defaultPrevented).toBe(true);
    expect(events).toEqual([
      { move: 'reculer', held: true },
      { move: 'reculer', held: false },
    ]);
  });
});
