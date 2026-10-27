import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { DayPhase } from '../../sim/daylight';
import { EMPTY_HEALTH_SUMMARY, healthSummary, type HealthSummary } from '../../sim/health-summary';
import { DEFAULT_WATER_SAMPLE, type WaterSample } from '../../sim/water-dashboard';
import { DEFAULT_WATER_READOUT } from '../../sim/water-quality';
import { HEALTH_FLOOR } from '../../sim/wellbeing';
import { DASHBOARD_COLORS, DASHBOARD_REST_OPACITY, DashboardFrame } from './dashboard-frame';
import { alertDetailId, DashboardStatus, SEVERITY_LEVELS } from './dashboard-status';

const STARVED: HealthSummary = healthSummary(
  Array.from({ length: 4 }, () => ({ species: 'neon' as const, health: HEALTH_FLOOR, hunger: 1 })),
);

/** `alarm()` : bac tropical à cinq alertes (ammoniaque, faim, nitrates, santé, nitrites). */
@Component({
  imports: [DashboardStatus],
  template: `<app-dashboard-status [sample]="sample()" [readout]="readout" [health]="health()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class StatusHost {
  readonly sample = signal<WaterSample>(DEFAULT_WATER_SAMPLE);
  readonly readout = DEFAULT_WATER_READOUT;
  readonly health = signal<HealthSummary>(EMPTY_HEALTH_SUMMARY);

  /** Bac à cinq alertes, valeurs de l'eau décalées de `shift`. */
  alarm(shift = 0): void {
    this.sample.set({
      ...DEFAULT_WATER_SAMPLE,
      ammonia: 6 + shift,
      nitrite: 2.5 + shift,
      nitrate: 50 + shift,
    });
    this.health.set(STARVED);
  }
}

describe('DashboardStatus (#260)', () => {
  let fixture: ComponentFixture<StatusHost>;
  const root = () => fixture.nativeElement as HTMLElement;
  const chips = () => [...root().querySelectorAll<HTMLButtonElement>('.status__chip')];
  const announcement = () => root().querySelector('[role="status"]')!.textContent!.trim();

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [StatusHost] });
    fixture = TestBed.createComponent(StatusHost);
    await fixture.whenStable();
  });

  it('bac sans alerte : « Aucune alerte » avec icône, annoncé sobrement', () => {
    const none = root().querySelector('[data-alert-none]')!;
    expect(none.textContent).toContain('Aucune alerte');
    expect(none.querySelectorAll('svg rect').length).toBeGreaterThan(0);
    expect(chips()).toHaveLength(0);
    expect(announcement()).toBe('Aucune alerte.');
  });

  it('santé : quatre lignes en texte et icône, texte lu complet', async () => {
    fixture.componentInstance.health.set(STARVED);
    await fixture.whenStable();
    const items = [...root().querySelectorAll<HTMLElement>('[data-health]')];
    expect(items.map((i) => i.dataset['health'])).toEqual([
      'health',
      'hunger',
      'sick',
      'distressed',
    ]);
    const value = (id: string) =>
      root().querySelector(`[data-health-value="${id}"]`)!.textContent!.trim();
    expect(value('health')).toBe('20 %');
    expect(value('hunger')).toBe('100 %');
    expect(value('sick')).toBe('4');
    expect(value('distressed')).toBe('4');
    for (const item of items) {
      expect(item.querySelectorAll('svg rect').length).toBeGreaterThan(0);
      expect(item.querySelector('.visually-hidden')!.textContent!.trim()).toBe(item.title);
    }
    expect(items[0]!.dataset['level']).toBe('rouge');
  });

  it('au plus trois alertes, icône + gravité + message, et un compteur « +N »', async () => {
    fixture.componentInstance.alarm();
    await fixture.whenStable();
    expect(chips()).toHaveLength(3);
    const first = chips()[0]!;
    expect(first.querySelector('.status__severity')!.textContent!.trim()).toBe('Critique');
    expect(first.querySelector('.status__message')!.textContent!.trim()).toBe(
      'Ammoniaque trop haute',
    );
    expect(first.querySelectorAll('svg rect').length).toBeGreaterThan(0);
    expect(first.dataset['level']).toBe(SEVERITY_LEVELS.critique);
    const more = root().querySelector('[data-alerts-more]')!;
    expect(more.textContent).toContain('+2');
    expect(more.textContent).toContain('2 autres alertes');
    expect(announcement()).toMatch(/^5 alertes : Ammoniaque trop haute \(critique\)/);
  });

  it('une alerte se déplie (une à la fois) sur sa cause et son action, `aria-expanded`', async () => {
    fixture.componentInstance.alarm();
    await fixture.whenStable();
    const [first, second] = chips();
    expect(first!.getAttribute('aria-expanded')).toBe('false');
    expect(first!.hasAttribute('aria-controls')).toBe(false);
    expect(root().querySelector('[data-alert-detail]')).toBeNull();

    first!.click();
    await fixture.whenStable();
    expect(first!.getAttribute('aria-expanded')).toBe('true');
    expect(first!.getAttribute('aria-controls')).toBe(alertDetailId('ammonia'));
    const detail = root().querySelector(`#${alertDetailId('ammonia')}`)!;
    expect(detail.textContent).toContain('Cause probable : déchets des animaux');
    expect(detail.textContent).toContain('À faire : Changer l’eau');

    second!.click();
    await fixture.whenStable();
    expect(first!.getAttribute('aria-expanded')).toBe('false');
    expect(second!.getAttribute('aria-expanded')).toBe('true');
    expect(root().querySelectorAll('[data-alert-detail]')).toHaveLength(1);
    second!.click();
    await fixture.whenStable();
    expect(root().querySelector('[data-alert-detail]')).toBeNull();
  });

  it('alertes calculées depuis l’eau et la santé reçues, ordonnées par gravité', async () => {
    fixture.componentInstance.sample.set({ ...DEFAULT_WATER_SAMPLE, nitrite: 6 });
    fixture.componentInstance.health.set(STARVED);
    await fixture.whenStable();
    const ids = [...root().querySelectorAll<HTMLElement>('[data-alert]')].map(
      (el) => el.dataset['alert'],
    );
    expect(ids).toEqual(['nitrite', 'hunger', 'health']);
  });

  it('couleurs du cadre posées en variables CSS sur l’hôte (même test de contraste)', () => {
    const host = root().querySelector<HTMLElement>('app-dashboard-status')!;
    expect(host.style.getPropertyValue('--dashboard-ink')).toBe(DASHBOARD_COLORS.ink);
    expect(host.style.getPropertyValue('--dashboard-rest-opacity')).toBe(
      String(DASHBOARD_REST_OPACITY),
    );
  });

  it('alerte dépliée qui disparaît : le détail se referme', async () => {
    fixture.componentInstance.alarm();
    await fixture.whenStable();
    chips()[0]!.click();
    await fixture.whenStable();
    fixture.componentInstance.sample.set(DEFAULT_WATER_SAMPLE);
    fixture.componentInstance.health.set(EMPTY_HEALTH_SUMMARY);
    await fixture.whenStable();
    expect(root().querySelector('[data-alert-detail]')).toBeNull();
  });

  it('annonce non répétée : même liste d’alertes recalculée, aucun changement du texte annoncé', async () => {
    fixture.componentInstance.alarm();
    await fixture.whenStable();
    const status = root().querySelector('[role="status"]')!;
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(status, { childList: true, characterData: true, subtree: true });
    for (let i = 0; i < 5; i++) {
      // Nouveau relevé, nouvelles valeurs, mêmes sujets et gravités.
      fixture.componentInstance.alarm(i / 10);
      fixture.componentInstance.health.set(
        healthSummary([{ species: 'neon', health: 0.21 + i / 100, hunger: 1 }]),
      );
      await fixture.whenStable();
    }
    observer.disconnect();
    expect(changes).toEqual([]);
  });
});

@Component({
  imports: [DashboardFrame],
  template: `<app-dashboard-frame
    [sample]="sample()"
    [readout]="readout"
    [phase]="phase()"
    [hour]="hour()"
    [speed]="speed()"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class FrameHost {
  readonly sample = signal<WaterSample>(DEFAULT_WATER_SAMPLE);
  readonly readout = DEFAULT_WATER_READOUT;
  readonly phase = signal<DayPhase>('jour');
  readonly hour = signal(12);
  readonly speed = signal(1);
}

describe('DashboardFrame : simulation et alertes (#260)', () => {
  let fixture: ComponentFixture<FrameHost>;
  const root = () => fixture.nativeElement as HTMLElement;
  const sim = () => root().querySelector<HTMLElement>('[data-dashboard-sim]')!;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [FrameHost] });
    fixture = TestBed.createComponent(FrameHost);
    await fixture.whenStable();
  });

  it('moment de la journée (icône et texte), heure et vitesse', async () => {
    expect(sim().textContent).toContain('Jour');
    expect(sim().querySelector('[data-dashboard-hour]')!.textContent!.trim()).toBe('12:00');
    expect(sim().querySelector('[data-dashboard-speed]')!.textContent).toContain('×1');
    expect(sim().querySelectorAll('svg rect').length).toBeGreaterThan(0);
    expect(sim().title).toBe('Simulation : jour, 12:00, vitesse ×1');
    fixture.componentInstance.phase.set('nuit');
    fixture.componentInstance.hour.set(22.5);
    fixture.componentInstance.speed.set(0);
    await fixture.whenStable();
    expect(sim().dataset['phase']).toBe('nuit');
    expect(sim().textContent).toContain('Nuit');
    expect(sim().textContent).toContain('22:30');
    expect(sim().textContent).toContain('Pause');
    expect(sim().title).toBe('Simulation : nuit, 22:30, en pause');
    fixture.componentInstance.hour.set(Number.NaN);
    await fixture.whenStable();
    expect(sim().querySelector('[data-dashboard-hour]')!.textContent!.trim()).toBe('–');
  });
});
