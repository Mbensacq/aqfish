import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  EXCLUSIVE_PANELS,
  EXCLUSIVE_PANELS_MAX_WIDTH,
  exclusivePanelsQuery,
  matchesQuery,
} from './exclusive-panels';

/** Fenêtre factice dont `matchMedia` évalue `(max-width: Npx)` pour une largeur donnée. */
function fakeWindow(width: { value: number }): Pick<Window, 'matchMedia'> {
  return {
    matchMedia: (query: string) => {
      const max = Number(/\(max-width: (\d+)px\)/.exec(query)?.[1] ?? NaN);
      return { matches: width.value <= max } as MediaQueryList;
    },
  };
}

describe('panneaux exclusifs (#136)', () => {
  it('seuil : 640 px exclu, au-dessus des 631 px où les panneaux se recouvrent', () => {
    expect(EXCLUSIVE_PANELS_MAX_WIDTH).toBe(639);
    // « Réglages » : 59 + 260 px à gauche ; « Commandes » : 12 + 300 px à droite.
    expect(EXCLUSIVE_PANELS_MAX_WIDTH + 1).toBeGreaterThanOrEqual(59 + 260 + 12 + 300);
    expect(exclusivePanelsQuery()).toBe('(max-width: 639px)');
    expect(exclusivePanelsQuery(480)).toBe('(max-width: 480px)');
  });

  it.each([
    [320, true],
    [568, true],
    [639, true],
    [640, false],
    [800, false],
    [1280, false],
  ])('largeur %i px : exclusifs = %s', (value, expected) => {
    expect(matchesQuery(fakeWindow({ value }), exclusivePanelsQuery())).toBe(expected);
  });

  it('sans fenêtre ou sans matchMedia : jamais exclusifs', () => {
    expect(matchesQuery(null, exclusivePanelsQuery())).toBe(false);
    expect(matchesQuery(undefined, exclusivePanelsQuery())).toBe(false);
    expect(matchesQuery({} as Pick<Window, 'matchMedia'>, exclusivePanelsQuery())).toBe(false);
  });

  it('jeton : réévalué à chaque appel (rotation du téléphone)', () => {
    const width = { value: 1280 };
    const win = fakeWindow(width);
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView: win } }],
    });
    const exclusive = TestBed.inject(EXCLUSIVE_PANELS);
    expect(exclusive()).toBe(false);
    width.value = 568;
    expect(exclusive()).toBe(true);
    width.value = 844;
    expect(exclusive()).toBe(false);
  });
});
