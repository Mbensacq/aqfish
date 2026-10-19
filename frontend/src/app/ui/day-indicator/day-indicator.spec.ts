import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PALETTE } from '../../render/palette';
import type { DayPhase } from '../../sim/daylight';
import {
  DAY_ICON_GRID,
  DAY_ICON_PIXEL,
  DAY_PHASE_LABELS,
  DayIndicator,
  dayIconPixels,
} from './day-indicator';

const PHASES: readonly DayPhase[] = ['jour', 'aube', 'crepuscule', 'nuit'];

describe('dayIconPixels', () => {
  it('chaque moment a une icône non vide, dans la grille, en couleurs de la palette', () => {
    const palette = new Set<string>(Object.values(PALETTE));
    for (const phase of PHASES) {
      const pixels = dayIconPixels(phase);
      expect(pixels.length).toBeGreaterThan(0);
      for (const p of pixels) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(DAY_ICON_GRID);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(DAY_ICON_GRID);
        expect(palette.has(p.color)).toBe(true);
      }
    }
  });

  it('soleil, lune et horizon se distinguent ; aube et crépuscule par la couleur', () => {
    const shape = (phase: DayPhase) =>
      dayIconPixels(phase)
        .map((p) => `${p.x},${p.y}`)
        .join(' ');
    expect(shape('jour')).not.toBe(shape('nuit'));
    expect(shape('jour')).not.toBe(shape('aube'));
    expect(shape('aube')).toBe(shape('crepuscule'));
    const color = (phase: DayPhase) => dayIconPixels(phase)[0].color;
    expect(color('aube')).not.toBe(color('crepuscule'));
    expect(color('jour')).toBe(PALETTE.poissonJaune);
    expect(color('nuit')).toBe(PALETTE.texteInterface);
  });

  it('libellés en français, un par moment', () => {
    expect(PHASES.map((p) => DAY_PHASE_LABELS[p])).toEqual(['jour', 'aube', 'crépuscule', 'nuit']);
  });
});

@Component({
  selector: 'app-test-host',
  imports: [DayIndicator],
  template: `<app-day-indicator [phase]="phase()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestHost {
  readonly phase = signal<DayPhase>('jour');
}

describe('DayIndicator', () => {
  it('affiche une icône pixel art avec un nom accessible qui suit le moment', async () => {
    const fixture = TestBed.createComponent(TestHost);
    await fixture.whenStable();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Moment de la journée : jour');
    expect(svg.getAttribute('data-phase')).toBe('jour');
    expect(svg.getAttribute('width')).toBe(String(DAY_ICON_GRID * DAY_ICON_PIXEL));
    expect(svg.querySelectorAll('rect').length).toBe(dayIconPixels('jour').length);
    expect(svg.querySelector('title')?.textContent).toBe('Moment de la journée : jour');

    fixture.componentInstance.phase.set('nuit');
    await fixture.whenStable();
    expect(svg.getAttribute('aria-label')).toBe('Moment de la journée : nuit');
    expect(svg.querySelectorAll('rect').length).toBe(dayIconPixels('nuit').length);

    fixture.componentInstance.phase.set('crepuscule');
    await fixture.whenStable();
    expect(svg.getAttribute('aria-label')).toBe('Moment de la journée : crépuscule');
  });
});
