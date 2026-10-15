import { TestBed } from '@angular/core/testing';

import { App } from './app';
import { isCaptureReady, resetCaptureReady } from './core/capture/capture-ready';

describe('App', () => {
  beforeEach(async () => {
    resetCaptureReady();
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  afterEach(() => resetCaptureReady());

  it("crée l'application", () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('affiche le nom du projet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('aqfish');
  });

  it('signale au harnais de capture que le premier rendu est prêt', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(isCaptureReady()).toBe(true);
  });
});
