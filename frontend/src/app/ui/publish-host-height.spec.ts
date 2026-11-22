import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { publishHostHeight } from './publish-host-height';

const PROPERTY = '--essai-hauteur';

/** Observateur factice : jsdom n'a pas de `ResizeObserver` ; le rappel est appelé à la main. */
class FakeObserver {
  static last: FakeObserver | null = null;
  readonly observed: Element[] = [];
  disconnected = false;
  constructor(readonly callback: () => void) {
    FakeObserver.last = this;
  }
  observe(target: Element): void {
    this.observed.push(target);
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

@Component({
  selector: 'app-measured',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class Measured {
  readonly frozen = signal(false);
  constructor() {
    publishHostHeight(PROPERTY, () => this.frozen());
  }
}

@Component({
  selector: 'app-measured-always',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class MeasuredAlways {
  constructor() {
    publishHostHeight(PROPERTY);
  }
}

describe('publishHostHeight (#610, #773)', () => {
  const root = (): CSSStyleDeclaration => document.documentElement.style;

  afterEach(() => {
    vi.unstubAllGlobals();
    FakeObserver.last = null;
    root().removeProperty(PROPERTY);
  });

  it('publie la hauteur de l’hôte à chaque mesure, et la retire à la destruction', async () => {
    vi.stubGlobal('ResizeObserver', FakeObserver);
    const fixture = TestBed.createComponent(MeasuredAlways);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const observer = FakeObserver.last!;
    expect(observer.observed).toEqual([host]);
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(155, 12, 801, 66));
    observer.callback();
    expect(root().getPropertyValue(PROPERTY)).toBe('66px');
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(155, 12, 801, 0));
    observer.callback();
    expect(root().getPropertyValue(PROPERTY)).toBe('0px');
    fixture.destroy();
    expect(observer.disconnected).toBe(true);
    expect(root().getPropertyValue(PROPERTY)).toBe('');
  });

  it('gelée, la dernière valeur publiée reste ; dégelée, la mesure suivante la remplace', async () => {
    vi.stubGlobal('ResizeObserver', FakeObserver);
    const fixture = TestBed.createComponent(Measured);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const rect = vi.spyOn(host, 'getBoundingClientRect');
    const observer = FakeObserver.last!;
    rect.mockReturnValue(new DOMRect(0, 0, 10, 34));
    observer.callback();
    fixture.componentInstance.frozen.set(true);
    rect.mockReturnValue(new DOMRect(0, 0, 10, 336));
    observer.callback();
    expect(root().getPropertyValue(PROPERTY)).toBe('34px');
    fixture.componentInstance.frozen.set(false);
    observer.callback();
    expect(root().getPropertyValue(PROPERTY)).toBe('336px');
  });

  it('sans ResizeObserver (jsdom), rien n’est publié ni levé', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const fixture = TestBed.createComponent(MeasuredAlways);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root().getPropertyValue(PROPERTY)).toBe('');
    fixture.destroy();
    expect(root().getPropertyValue(PROPERTY)).toBe('');
  });
});
