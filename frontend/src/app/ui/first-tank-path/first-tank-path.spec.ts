import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FIRST_TANK_STEPS, type FirstTankPathView } from '../../sim/first-tank-path';
import { BeginnerGuideState } from '../beginner-guide/beginner-guide-state';
import { createFallbackStore } from '../commands-help/commands-help-store';
import { FirstTankPath } from './first-tank-path';
import {
  FIRST_TANK_PATH_STORAGE_KEY,
  FIRST_TANK_PATH_STORE,
  FirstTankPathPrefs,
} from './first-tank-path-prefs';

const view = (index: number, doneCount = index): FirstTankPathView => ({
  current: FIRST_TANK_STEPS[index] ?? null,
  currentNumber: index < FIRST_TANK_STEPS.length ? index + 1 : 0,
  doneCount,
  total: FIRST_TANK_STEPS.length,
});

function setup(saved: string | null = null, value: FirstTankPathView | null = view(0)) {
  const store = createFallbackStore(null);
  if (saved !== null) {
    store.write(FIRST_TANK_PATH_STORAGE_KEY, saved);
  }
  TestBed.configureTestingModule({
    providers: [{ provide: FIRST_TANK_PATH_STORE, useValue: store }],
  });
  const fixture = TestBed.createComponent(FirstTankPath);
  fixture.componentRef.setInput('view', value);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const q = (selector: string) => root.querySelector<HTMLElement>(selector);
  const render = () => fixture.detectChanges();
  return { fixture, root, q, render, store };
}

describe('FirstTankPath (#512)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('replié par défaut : languette et avancement, sans texte d’étape', () => {
    const { q } = setup();
    expect(q('[data-first-tank-toggle]')?.textContent).toContain('0/5');
    expect(q('[data-first-tank-toggle]')?.getAttribute('aria-expanded')).toBe('false');
    expect(q('[data-first-tank-body]')).toBeNull();
    expect(q('[data-first-tank-path]')?.getAttribute('data-step')).toBe('cycle');
  });

  it('se déplie, montre l’étape et son pourquoi, se replie, et s’en souvient', () => {
    const { q, render, store } = setup();
    q('[data-first-tank-toggle]')?.click();
    render();
    expect(q('[data-first-tank-body]')?.textContent).toContain(`1. ${FIRST_TANK_STEPS[0].title}`);
    expect(q('[data-first-tank-body]')?.textContent).toContain('Pourquoi ?');
    expect(store.read(FIRST_TANK_PATH_STORAGE_KEY)).toBe('ouvert');
    q('[data-first-tank-toggle]')?.click();
    render();
    expect(q('[data-first-tank-body]')).toBeNull();
    expect(store.read(FIRST_TANK_PATH_STORAGE_KEY)).toBe('replie');
  });

  it('relit la préférence ; une valeur inconnue vaut « replié »', () => {
    expect(setup('ouvert').q('[data-first-tank-body]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(setup('nimporte').q('[data-first-tank-toggle]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(setup('nimporte').q('[data-first-tank-body]')).toBeNull();
  });

  it('« Masquer » retire le panneau ; le guide peut le rendre', () => {
    const { q, render } = setup('ouvert');
    q('[data-first-tank-hide]')?.click();
    render();
    expect(q('[data-first-tank-path]')).toBeNull();
    TestBed.inject(FirstTankPathPrefs).setMode('ouvert');
    render();
    expect(q('[data-first-tank-path]')).not.toBeNull();
  });

  it('rien pour un bac sans parcours', () => {
    expect(setup('ouvert', null).q('[data-first-tank-path]')).toBeNull();
  });

  it('renvoie au wiki ou au guide selon l’étape', () => {
    const { fixture, q, render } = setup('ouvert');
    const pages: string[] = [];
    fixture.componentInstance.wikiPageRequested.subscribe((page) => pages.push(page));
    q('[data-first-tank-link]')?.click();
    expect(pages).toEqual(['entretien']);

    const guide = TestBed.inject(BeginnerGuideState);
    const show = vi.spyOn(guide, 'show');
    fixture.componentRef.setInput('view', view(2));
    render();
    q('[data-first-tank-link]')?.click();
    expect(show).toHaveBeenCalledWith('nourriture');
  });

  it('félicite à la fin, sans lien', () => {
    const { q } = setup('ouvert', view(5, 5));
    expect(q('[data-first-tank-path]')?.getAttribute('data-step')).toBe('fin');
    expect(q('[data-first-tank-body]')?.textContent).toContain('Parcours terminé');
    expect(q('[data-first-tank-link]')).toBeNull();
  });
});
