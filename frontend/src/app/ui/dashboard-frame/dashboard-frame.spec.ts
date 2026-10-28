import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { freshWater, WATER_TEMPERATURES } from '../../sim/water';
import {
  DEFAULT_WATER_SAMPLE,
  TREND_WINDOW_TICKS,
  waterSample,
  type WaterSample,
} from '../../sim/water-dashboard';
import { MAX_PH, MIN_PH, phBands } from '../../sim/water-ph';
import { DEFAULT_WATER_READOUT, GAUGE_MAX, type WaterReadout } from '../../sim/water-quality';
import { parseHex, fadedContrast, type Rgb } from './contrast';
import {
  DASHBOARD_BACKGROUND_ALPHA,
  DASHBOARD_COLORS,
  DASHBOARD_GAUGES_ID,
  DASHBOARD_MUTED_ALPHA,
  DASHBOARD_REST_OPACITY,
  DashboardFrame,
  GAUGE_BOUNDS,
  LEVEL_ICON_GRID,
  levelIconPixels,
  PH_ZONE_COLORS,
  phGaugeBackground,
  phPercent,
  TREND_ARROWS,
} from './dashboard-frame';

describe('tableau de bord : fonctions de présentation (#256)', () => {
  it('icônes de niveau : dans la grille, non vides, de formes distinctes', () => {
    const shapes = (['vert', 'orange', 'rouge'] as const).map((level) => {
      const pixels = levelIconPixels(level);
      expect(pixels.length).toBeGreaterThan(0);
      for (const [x, y] of pixels) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(LEVEL_ICON_GRID);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(LEVEL_ICON_GRID);
      }
      return pixels.map(([x, y]) => `${x},${y}`).join(' ');
    });
    expect(new Set(shapes).size).toBe(3);
  });

  it('flèches de tendance distinctes', () => {
    expect(new Set(Object.values(TREND_ARROWS)).size).toBe(3);
  });

  // Déplacés du panneau de contrôle (#236) avec la jauge pH.
  it('phPercent : position sur [4 ; 9,5], bornée, au dixième de pour cent (#236)', () => {
    expect(phPercent(MIN_PH)).toBe(0);
    expect(phPercent(MAX_PH)).toBe(100);
    expect(phPercent(6.75)).toBe(50);
    expect(phPercent(2)).toBe(0);
    expect(phPercent(12)).toBe(100);
    expect(phPercent(Number.NaN)).toBe(0);
    expect(phPercent(7)).toBe(54.5);
  });

  it('phGaugeBackground : rouge, orange, vert, orange, rouge aux bornes des plages (#236)', () => {
    const { ideal, tolere, horsPlage } = PH_ZONE_COLORS;
    expect(phGaugeBackground(phBands(['guppy']))).toBe(
      `linear-gradient(to right, ${horsPlage} 0%, ${horsPlage} 45.5%, ` +
        `${tolere} 45.5%, ${tolere} 50.9%, ${ideal} 50.9%, ${ideal} 72.7%, ` +
        `${tolere} 72.7%, ${tolere} 81.8%, ${horsPlage} 81.8%, ${horsPlage} 100%)`,
    );
    // Sans espèce : tout est idéal.
    expect(phGaugeBackground(phBands([]))).toContain(`${ideal} 0%, ${ideal} 100%`);
    // Idéal commun vide : pas de vert.
    expect(phGaugeBackground(phBands(['neon', 'clown']))).not.toContain(ideal);
    // Aucune plage commune : tout rouge.
    expect(phGaugeBackground({ tolerated: null, ideal: null })).toBe(
      `linear-gradient(to right, ${horsPlage} 0%, ${horsPlage} 100%)`,
    );
  });

  it('estompé au repos, le texte lu garde un contraste d’au moins 4,5:1 sur toute scène', () => {
    // Scènes extrêmes et typiques derrière le cadre : blanc, noir, sable clair, eau, fond.
    const scenes: Rgb[] = ['#ffffff', '#000000', '#e8d3a8', '#3c9c8c', '#141418'].map(parseHex);
    const texts = [
      { text: DASHBOARD_COLORS.ink },
      { text: DASHBOARD_COLORS.ink, textAlpha: DASHBOARD_MUTED_ALPHA },
      { text: DASHBOARD_COLORS.vert },
      { text: DASHBOARD_COLORS.orange },
      { text: DASHBOARD_COLORS.rouge },
    ];
    expect(DASHBOARD_REST_OPACITY).toBeLessThan(1);
    for (const scene of scenes) {
      for (const { text, textAlpha } of texts) {
        const ratio = fadedContrast({
          text: parseHex(text),
          textAlpha,
          background: parseHex(DASHBOARD_COLORS.background),
          backgroundAlpha: DASHBOARD_BACKGROUND_ALPHA,
          groupOpacity: DASHBOARD_REST_OPACITY,
          scene,
        });
        expect(ratio, `${text} (${textAlpha ?? 1}) sur ${scene.join(',')}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });
});

@Component({
  imports: [DashboardFrame],
  template: `<app-dashboard-frame [sample]="sample()" [readout]="readout()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestHost {
  readonly sample = signal<WaterSample>(DEFAULT_WATER_SAMPLE);
  readonly readout = signal<WaterReadout>(DEFAULT_WATER_READOUT);
}

describe('DashboardFrame (#256)', () => {
  let fixture: ComponentFixture<TestHost>;
  const root = () => fixture.nativeElement as HTMLElement;
  const toggle = () => root().querySelector<HTMLButtonElement>('.dashboard__toggle')!;
  const gauge = (id: string) => root().querySelector<HTMLElement>(`[data-gauge="${id}"]`);
  const meter = (id: string) => gauge(id)!.querySelector<HTMLElement>('[role="meter"]')!;
  const value = (id: string) =>
    gauge(id)!.querySelector('[data-gauge-value]')?.textContent?.trim() ?? null;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    fixture = TestBed.createComponent(TestHost);
    await fixture.whenStable();
  });

  async function set(sample: Partial<WaterSample>, readout: Partial<WaterReadout> = {}) {
    fixture.componentInstance.sample.update((s) => ({ ...s, ...sample }));
    fixture.componentInstance.readout.update((r) => ({ ...r, ...readout }));
    await fixture.whenStable();
  }

  it('déplié au départ : cinq jauges nommées, dans l’ordre, chacune un `meter` lu', () => {
    expect(root().querySelector('[data-dashboard]')?.getAttribute('aria-label')).toBe(
      'Tableau de bord de l’eau',
    );
    const ids = [...root().querySelectorAll('[data-gauge]')].map((g) =>
      g.getAttribute('data-gauge'),
    );
    expect(ids).toEqual(['temperature', 'ammonia', 'nitrite', 'nitrate', 'ph']);
    const names = {
      temperature: 'Température',
      ammonia: 'Ammoniaque (NH₃/NH₄⁺)',
      nitrite: 'Nitrites (NO₂⁻)',
      nitrate: 'Nitrates (NO₃⁻)',
      ph: 'pH',
    } as const;
    for (const id of ids as (keyof typeof names)[]) {
      expect(meter(id).getAttribute('aria-label')).toBe(names[id]);
      expect(meter(id).getAttribute('aria-valuemin')).toBe(String(GAUGE_BOUNDS[id].min));
      expect(meter(id).getAttribute('aria-valuemax')).toBe(String(GAUGE_BOUNDS[id].max));
      expect(meter(id).getAttribute('aria-valuetext')).toMatch(/, (bon|idéal), stable$/);
      // Niveau en texte et en icône, pas seulement en couleur.
      const level = gauge(id)!.querySelector('[data-level-label]')!;
      expect(level.textContent?.trim()).toMatch(/^(Bon|Idéal)$/);
      expect(level.querySelectorAll('svg rect').length).toBeGreaterThan(0);
    }
    expect(value('temperature')).toBe('24,0');
    expect(gauge('temperature')?.textContent).toContain('°C');
    expect(gauge('nitrate')?.textContent).toContain('u.');
    expect(value('ph')).toBe('7,0');
  });

  it('trois composés : valeur au dixième, plein de la jauge, niveau aux seuils', async () => {
    await set({ ammonia: 0.84, nitrite: 2, nitrate: 42.46 });
    expect(value('ammonia')).toBe('0,8');
    expect(value('nitrite')).toBe('2,0');
    expect(value('nitrate')).toBe('42,5');
    expect(meter('nitrate').getAttribute('aria-valuemax')).toBe(String(GAUGE_MAX.nitrate));
    expect(meter('nitrate').getAttribute('aria-valuenow')).toBe('42.5');
    expect(gauge('ammonia')?.getAttribute('data-level')).toBe('vert');
    expect(gauge('nitrite')?.getAttribute('data-level')).toBe('orange');
    expect(gauge('nitrate')?.getAttribute('data-level')).toBe('rouge');
    expect(gauge('nitrate')?.querySelector('[data-level-label]')?.textContent?.trim()).toBe(
      'Critique',
    );
    expect(meter('nitrate').getAttribute('aria-valuetext')).toBe(
      'Nitrates (NO₃⁻) : 42,5 unités de jeu, critique, stable',
    );
    const fill = gauge('nitrate')!.querySelector<HTMLElement>('.dashboard__fill')!;
    expect(parseFloat(fill.style.width)).toBeCloseTo((42.46 / GAUGE_MAX.nitrate) * 100, 6);
  });

  it('jauge pH (#236) : valeur, zone lisible sans la couleur, repère et zones', async () => {
    expect(gauge('ph')?.getAttribute('data-level')).toBe('vert');
    expect(meter('ph').getAttribute('aria-valuetext')).toBe('pH : 7,0, idéal, stable');
    await set({ ph: 6.2 }, { ph: 6.2, phZone: 'hors-plage', phBands: phBands(['guppy']) });
    expect(value('ph')).toBe('6,2');
    expect(gauge('ph')?.getAttribute('data-level')).toBe('rouge');
    expect(meter('ph').getAttribute('aria-valuenow')).toBe('6.2');
    expect(meter('ph').getAttribute('aria-valuetext')).toBe('pH : 6,2, hors plage, stable');
    expect(gauge('ph')?.querySelector('[data-level-label]')?.textContent?.trim()).toBe(
      'Hors plage',
    );
    const mark = meter('ph').querySelector<HTMLElement>('.dashboard__mark')!;
    expect(parseFloat(mark.style.left)).toBeCloseTo(phPercent(6.2), 6);
    // Zones des espèces présentes : celles du guppy.
    const zones = meter('ph').querySelector<HTMLElement>('.dashboard__zones')!;
    expect(zones.style.background).toContain('linear-gradient');
    // Toléré (6,84) : même texte que l'ancienne jauge du panneau (« pH 6,8, toléré »).
    await set({ ph: 6.84 }, { ph: 6.8, phZone: 'tolere' });
    expect(meter('ph').getAttribute('aria-valuetext')).toBe('pH : 6,8, toléré, stable');
  });

  it('indicateur global en toutes lettres sur le bouton, suit l’hôte (déplacé du panneau)', async () => {
    const quality = () => toggle().querySelector('.dashboard__quality')!;
    expect(quality().textContent?.trim()).toBe('Bonne');
    expect(toggle().getAttribute('data-water-quality')).toBe('bonne');
    await set({}, { quality: 'a-surveiller' });
    expect(quality().textContent?.trim()).toBe('À surveiller');
    await set({}, { quality: 'mauvaise' });
    expect(quality().textContent?.trim()).toBe('Mauvaise');
    expect(toggle().getAttribute('data-water-quality')).toBe('mauvaise');
    expect(quality().getAttribute('data-level')).toBe('rouge');
    expect(quality().querySelectorAll('svg rect').length).toBeGreaterThan(0);
  });

  it('se replie et se déplie : `aria-expanded`, `aria-controls`, libellé', async () => {
    expect(toggle().getAttribute('type')).toBe('button');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-controls')).toBe(DASHBOARD_GAUGES_ID);
    expect(root().querySelector(`#${DASHBOARD_GAUGES_ID}`)).not.toBeNull();
    expect(toggle().getAttribute('aria-label')).toBe('Eau : bonne. Replier les jauges');
    toggle().click();
    await fixture.whenStable();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(root().querySelector('[data-gauge]')).toBeNull();
    expect(toggle().getAttribute('aria-label')).toBe('Eau : bonne. Déplier les jauges');
    // Replié, l'indicateur global reste visible.
    expect(toggle().textContent).toContain('Bonne');
    toggle().click();
    await fixture.whenStable();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(root().querySelectorAll('[data-gauge]')).toHaveLength(5);
  });

  it('tendance : flèche et texte lu suivent les relevés successifs (fenêtre en pas)', async () => {
    const reference = WATER_TEMPERATURES.tropical;
    const tropical = (tick: number, nitrate: number, temperature = reference): WaterSample => ({
      ...waterSample(freshWater('tropical'), 'tropical', tick),
      nitrate,
      temperature,
    });
    fixture.componentInstance.sample.set(tropical(0, 10));
    await fixture.whenStable();
    expect(gauge('nitrate')?.getAttribute('data-trend')).toBe('stable');
    fixture.componentInstance.sample.set(tropical(TREND_WINDOW_TICKS / 2, 11, reference - 1));
    await fixture.whenStable();
    expect(gauge('nitrate')?.getAttribute('data-trend')).toBe('hausse');
    expect(gauge('temperature')?.getAttribute('data-trend')).toBe('baisse');
    expect(gauge('nitrate')?.querySelector('[data-trend-arrow]')?.textContent?.trim()).toBe(
      TREND_ARROWS.hausse,
    );
    expect(meter('nitrate').getAttribute('aria-valuetext')).toMatch(/, en hausse$/);
    expect(meter('temperature').getAttribute('aria-valuetext')).toMatch(/, en baisse$/);
    // Nouveau monde (pas qui recule) : la tendance repart de zéro.
    fixture.componentInstance.sample.set(tropical(0, 0));
    await fixture.whenStable();
    expect(gauge('nitrate')?.getAttribute('data-trend')).toBe('stable');
  });

  it('valeur non finie : tiret, pas de `aria-valuenow`, niveau critique', async () => {
    await set({ nitrite: Number.NaN });
    expect(value('nitrite')).toBe('–');
    expect(meter('nitrite').hasAttribute('aria-valuenow')).toBe(false);
    expect(gauge('nitrite')?.getAttribute('data-level')).toBe('rouge');
  });

  it('couleurs et opacités du test de contraste posées en variables CSS sur l’hôte', () => {
    const host = root().querySelector<HTMLElement>('app-dashboard-frame')!;
    expect(host.style.getPropertyValue('--dashboard-ink')).toBe(DASHBOARD_COLORS.ink);
    expect(host.style.getPropertyValue('--dashboard-background')).toBe(DASHBOARD_COLORS.background);
    expect(host.style.getPropertyValue('--dashboard-rouge')).toBe(DASHBOARD_COLORS.rouge);
    expect(Number(host.style.getPropertyValue('--dashboard-rest-opacity'))).toBe(
      DASHBOARD_REST_OPACITY,
    );
    expect(Number(host.style.getPropertyValue('--dashboard-muted-alpha'))).toBe(
      DASHBOARD_MUTED_ALPHA,
    );
    expect(Number(host.style.getPropertyValue('--dashboard-background-alpha'))).toBe(
      DASHBOARD_BACKGROUND_ALPHA,
    );
  });
});
