import { TestBed } from '@angular/core/testing';

import { HiddenInterfaceHint } from './hidden-interface-hint';
import { HiddenInterfaceState } from './hidden-interface-state';

describe('HiddenInterfaceHint (#725, #775)', () => {
  function render(touch: boolean): HTMLElement {
    TestBed.configureTestingModule({});
    const state = TestBed.inject(HiddenInterfaceState);
    state.touch.set(touch);
    const fixture = TestBed.createComponent(HiddenInterfaceHint);
    state.setHidden(true);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('au clavier : la touche et Échap', () => {
    const hint = render(false).querySelector('[data-hidden-interface-hint]');
    expect(hint?.textContent?.trim()).toBe('I ou Échap pour revenir');
  });

  it('au doigt : l’appui long, sans touche', () => {
    const hint = render(true).querySelector('[data-hidden-interface-hint]');
    expect(hint?.textContent?.trim()).toBe('Appui long pour revenir');
  });

  it('rien tant que l’interface est affichée', () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(HiddenInterfaceHint);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-hidden-interface-hint]'),
    ).toBeNull();
  });
});
