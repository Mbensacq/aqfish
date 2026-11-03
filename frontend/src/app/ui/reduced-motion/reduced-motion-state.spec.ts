import { TestBed } from '@angular/core/testing';

import {
  REDUCED_MOTION_QUERY,
  REDUCED_MOTION_STORAGE_KEY,
} from '../../core/reduced-motion/reduced-motion';
import { ReducedMotionState } from './reduced-motion-state';

/** Requête média factice dont on peut changer la réponse et signaler le changement. */
class FakeMediaQuery {
  readonly listeners = new Set<(event: { matches: boolean }) => void>();
  constructor(public matches: boolean) {}
  addEventListener(_type: string, listener: (event: { matches: boolean }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: (event: { matches: boolean }) => void): void {
    this.listeners.delete(listener);
  }
  change(matches: boolean): void {
    this.matches = matches;
    this.listeners.forEach((listener) => listener({ matches }));
  }
}

describe('ReducedMotionState (#406)', () => {
  let query: FakeMediaQuery;
  let queries: string[];

  function stubSystem(matches: boolean): void {
    query = new FakeMediaQuery(matches);
    queries = [];
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (q: string) => {
        queries.push(q);
        return query;
      },
    });
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    localStorage.clear();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('sans choix mémorisé : initialisé sur la préférence système', () => {
    stubSystem(true);
    const state = TestBed.inject(ReducedMotionState);
    expect(queries).toContain(REDUCED_MOTION_QUERY);
    expect(state.choice()).toBeNull();
    expect(state.reduced()).toBe(true);
  });

  it('suit la préférence système en direct tant qu’aucun choix n’est fait', () => {
    stubSystem(false);
    const state = TestBed.inject(ReducedMotionState);
    expect(state.reduced()).toBe(false);
    query.change(true);
    expect(state.reduced()).toBe(true);
    query.change(false);
    expect(state.reduced()).toBe(false);
  });

  it('le choix des réglages l’emporte sur le système et est mémorisé', () => {
    stubSystem(true);
    const state = TestBed.inject(ReducedMotionState);
    state.setReduced(false);
    expect(state.reduced()).toBe(false);
    expect(localStorage.getItem(REDUCED_MOTION_STORAGE_KEY)).toBe('normaux');
    query.change(true);
    expect(state.reduced()).toBe(false);
    state.setReduced(true);
    expect(localStorage.getItem(REDUCED_MOTION_STORAGE_KEY)).toBe('reduits');
  });

  it('choix mémorisé relu au démarrage suivant', () => {
    stubSystem(false);
    localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, 'reduits');
    expect(TestBed.inject(ReducedMotionState).reduced()).toBe(true);
  });

  it('sans matchMedia : mouvements normaux, l’option marche quand même', () => {
    const state = TestBed.inject(ReducedMotionState);
    expect(state.system()).toBe(false);
    expect(state.reduced()).toBe(false);
    state.setReduced(true);
    expect(state.reduced()).toBe(true);
  });

  it('stockage qui refuse l’écriture : choix gardé pour la session', () => {
    stubSystem(false);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      const state = TestBed.inject(ReducedMotionState);
      expect(() => state.setReduced(true)).not.toThrow();
      expect(state.reduced()).toBe(true);
    } finally {
      setItem.mockRestore();
    }
  });

  it('se désabonne de la requête média à la destruction', () => {
    stubSystem(false);
    TestBed.inject(ReducedMotionState);
    expect(query.listeners.size).toBe(1);
    TestBed.resetTestingModule();
    expect(query.listeners.size).toBe(0);
  });
});
