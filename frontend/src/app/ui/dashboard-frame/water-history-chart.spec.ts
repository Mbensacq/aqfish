import { TestBed } from '@angular/core/testing';

import { WATER_HISTORY_CAPACITY, type WaterHistoryView } from '../../sim/water-history';
import {
  CURVE_HEIGHT,
  WaterHistoryChart,
  curveGeometry,
  curveSummary,
} from './water-history-chart';

describe('mini-courbe : géométrie (#511)', () => {
  it('sans valeur finie : rien à dessiner', () => {
    for (const values of [[], [Number.NaN, Number.POSITIVE_INFINITY]]) {
      const geometry = curveGeometry(values, [], { min: 0, max: 1 }, 1);
      expect(geometry.columns).toEqual([]);
      expect(geometry.band).toBeNull();
      expect(geometry.range).toBeNull();
    }
  });

  it('le relevé le plus récent est à droite', () => {
    const { columns, marks } = curveGeometry([1, 2], [1], null, 1);
    expect(columns.map((c) => c.x)).toEqual([
      WATER_HISTORY_CAPACITY - 2,
      WATER_HISTORY_CAPACITY - 1,
    ]);
    expect(marks).toEqual([WATER_HISTORY_CAPACITY - 1]);
  });

  it('valeur haute en haut, valeur basse en bas, colonnes reliées', () => {
    const { columns } = curveGeometry([0, 10], [], null, 1);
    expect(columns[0]).toEqual({
      x: WATER_HISTORY_CAPACITY - 2,
      y: CURVE_HEIGHT - 1,
      height: 1,
    });
    expect(columns[1]).toEqual({ x: WATER_HISTORY_CAPACITY - 1, y: 0, height: CURVE_HEIGHT });
  });

  it('un trou coupe la courbe', () => {
    const { columns } = curveGeometry([0, Number.NaN, 10], [], null, 1);
    expect(columns).toHaveLength(2);
    expect(columns[1]!.height).toBe(1);
  });

  it('eau stable : au milieu, échelle d’au moins l’écart minimal', () => {
    const geometry = curveGeometry([7, 7, 7], [], null, 0.5);
    expect(geometry.max - geometry.min).toBeCloseTo(0.5);
    expect(geometry.columns[0]!.y).toBe(Math.round((CURVE_HEIGHT - 1) / 2));
  });

  it('plage : rognée à l’échelle, couvre tout si les valeurs y sont, absente hors échelle', () => {
    expect(curveGeometry([1, 2], [], { min: 0, max: 40 }, 1).band).toEqual({
      y: 0,
      height: CURVE_HEIGHT,
    });
    expect(curveGeometry([50, 60], [], { min: 0, max: 40 }, 1).band).toBeNull();
    const partial = curveGeometry([30, 50], [], { min: 0, max: 40 }, 1).band!;
    expect(partial.y).toBe(CURVE_HEIGHT / 2);
    expect(partial.height).toBe(CURVE_HEIGHT / 2);
  });

  it('phrase lue : valeur, extrêmes, changements d’eau', () => {
    const geometry = curveGeometry([1, 2], [], null, 1);
    expect(curveSummary('nitrate', 2, geometry, 0)).toBe(
      'Nitrates (NO₃⁻) sur les dernières 24 h : 2,0 unités de jeu maintenant, minimum 1,0 unités de jeu, maximum 2,0 unités de jeu, aucun changement d’eau.',
    );
    expect(curveSummary('ph', 7, geometry, 2)).toContain('2 changements d’eau');
    expect(curveSummary('ph', 7, curveGeometry([], [], null, 1), 0)).toContain(
      'pas encore de relevé',
    );
  });
});

describe('mini-courbe : composant (#511)', () => {
  const view: WaterHistoryView = {
    count: 3,
    series: {
      temperature: [25, 25, 25],
      ammonia: [0, 0, 0],
      nitrite: [0, 0, 0],
      nitrate: [10, 30, 5],
      ph: [7, 7, 7],
    },
    marks: [2],
  };

  function render(history: WaterHistoryView | null) {
    const fixture = TestBed.createComponent(WaterHistoryChart);
    fixture.componentRef.setInput('gauge', 'nitrate');
    fixture.componentRef.setInput('history', history);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('expose ses points et ses marques, et lit la valeur sans couleur', () => {
    const root = render(view);
    const curve = root.querySelector('[data-water-curve]')!;
    expect(curve.getAttribute('data-points')).toBe('3');
    expect(curve.getAttribute('data-marks')).toBe('1');
    expect(root.querySelector('[data-water-curve-band]')?.getAttribute('fill')).toBe(
      'url(#curve-trame)',
    );
    expect(root.querySelector('[data-water-curve-now]')?.textContent).toContain('u.');
    expect(root.textContent).toContain('min 5,0 · max 30,0');
    expect(root.querySelector('svg')?.getAttribute('role')).toBe('img');
    expect(root.querySelector('svg')?.getAttribute('aria-label')).toContain('1 changement d’eau');
  });

  it('sans historique : le dit', () => {
    const root = render(null);
    expect(root.querySelector('[data-water-curve]')?.getAttribute('data-points')).toBe('0');
    expect(root.textContent).toContain('pas encore de relevé');
  });
});
