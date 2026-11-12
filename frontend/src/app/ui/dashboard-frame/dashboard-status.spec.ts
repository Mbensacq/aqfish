import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { DayPhase } from '../../sim/daylight';
import type { EnvironmentId } from '../../sim/environment';
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import { EMPTY_HEALTH_SUMMARY, healthSummary, type HealthSummary } from '../../sim/health-summary';
import { DEFAULT_WATER_SAMPLE, type WaterSample } from '../../sim/water-dashboard';
import { DEFAULT_WATER_READOUT } from '../../sim/water-quality';
import { HEALTH_FLOOR } from '../../sim/wellbeing';
import { DASHBOARD_COLORS, DASHBOARD_REST_OPACITY, DashboardFrame } from './dashboard-frame';
import { ALERT_TOPICS } from '../../sim/beginner-help';
import { BeginnerGuideState } from '../beginner-guide/beginner-guide-state';
import {
  alertDetailId,
  alertWhyLabel,
  alertWikiLabel,
  DashboardStatus,
  SEVERITY_LEVELS,
} from './dashboard-status';
import {
  initialMaintenance,
  MAINTENANCE_DAY_SECONDS,
  maintenanceDone,
  maintenanceReadout,
  type MaintenanceReadout,
  type MaintenanceTask,
} from '../../sim/maintenance';
import type { ReviewPoint } from '../../sim/bilan';
import type { JournalLine } from '../../sim/journal';
import { NO_ALERT_TARGETS, type AlertTargets } from '../../sim/alert-animals';
import type { GuidePage } from '../../sim/care-guide';
import { ICH_AGGRAVATED_AT } from '../../sim/disease';

const STARVED: HealthSummary = healthSummary(
  Array.from({ length: 4 }, () => ({ species: 'neon' as const, health: HEALTH_FLOOR, hunger: 1 })),
);

/** `alarm()` : bac tropical à cinq alertes (ammoniaque, faim, nitrates, santé, nitrites). */
@Component({
  imports: [DashboardStatus],
  template: `<app-dashboard-status
    [sample]="sample()"
    [readout]="readout"
    [health]="health()"
    [environment]="environment()"
    [population]="population()"
    [targets]="targets()"
    [highlighted]="highlighted()"
    [maintenance]="maintenance()"
    [reviewOf]="reviewOf()"
    [journal]="journal()"
    (maintenanceDone)="done.push($event)"
    (showAnimalsRequested)="shown.push($event)"
    (wikiPageRequested)="wikiPages.push($event)"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class StatusHost {
  /** Pages du wiki demandées par les alertes (#366). */
  readonly wikiPages: GuidePage[] = [];
  /** Animaux dont la mise en évidence a été demandée (#483). */
  readonly shown: (readonly number[])[] = [];
  readonly done: MaintenanceTask[] = [];
  readonly maintenance = signal<MaintenanceReadout | null>(null);
  readonly reviewOf = signal<(() => readonly ReviewPoint[]) | null>(null);
  readonly journal = signal<readonly JournalLine[] | null>(null);
  readonly targets = signal<AlertTargets>(NO_ALERT_TARGETS);
  readonly highlighted = signal(0);
  readonly sample = signal<WaterSample>(DEFAULT_WATER_SAMPLE);
  readonly readout = DEFAULT_WATER_READOUT;
  readonly health = signal<HealthSummary>(EMPTY_HEALTH_SUMMARY);
  readonly environment = signal<EnvironmentId>('tropical');
  readonly population = signal<PopulationCounts>(NO_FISH);

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

describe('rappel d’entretien (#513)', () => {
  const DAY = MAINTENANCE_DAY_SECONDS;

  function mount(): { host: StatusHost; root: HTMLElement; flush: () => void } {
    const fixture = TestBed.createComponent(StatusHost);
    const flush = (): void => {
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
    };
    flush();
    return { host: fixture.componentInstance, root: fixture.nativeElement as HTMLElement, flush };
  }

  it('sans calendrier (capture), aucun rappel', () => {
    const { root } = mount();
    expect(root.querySelector('[data-maintenance]')).toBeNull();
  });

  it('affiche un rappel en texte et icône, sans créer d’alerte', () => {
    const { host, root, flush } = mount();
    host.maintenance.set(maintenanceReadout(initialMaintenance(0), 7 * DAY, ['waterChange']));
    flush();
    const chip = root.querySelector('[data-maintenance]')!;
    expect(chip.textContent).toContain('changement d’eau');
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(chip.getAttribute('data-level')).toBeNull();
    expect(root.querySelector('[data-alert-none]')).not.toBeNull();
  });

  it('déplie tâches et journal ; « Fait » seulement sans geste dans le jeu', () => {
    const { host, root, flush } = mount();
    const state = maintenanceDone(initialMaintenance(0), 'waterChange', DAY);
    host.maintenance.set(maintenanceReadout(state, 2 * DAY));
    flush();
    root.querySelector<HTMLElement>('[data-maintenance]')!.click();
    flush();
    expect(root.querySelector('[data-maintenance-log]')!.textContent).toContain(
      'Jour 2 : Changement d’eau',
    );
    expect(root.querySelector('[data-maintenance-done="waterChange"]')).toBeNull();
    root.querySelector<HTMLElement>('[data-maintenance-done="filter"]')!.click();
    expect(host.done).toEqual(['filter']);
  });

  it('bilan du bac (#514) : absent sans source, jamais déplié sans demande', () => {
    const { host, root, flush } = mount();
    expect(root.querySelector('[data-review]')).toBeNull();
    let calls = 0;
    const point: ReviewPoint = {
      id: 'density',
      severity: 'attention',
      title: 'Trop d’animaux pour ce bac',
      measure: '60 animaux dans 288 L',
      action: 'Retirer des animaux',
    };
    host.reviewOf.set(() => {
      calls++;
      return [point];
    });
    flush();
    const button = root.querySelector<HTMLElement>('[data-review]')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('[data-review-detail]')).toBeNull();
    expect(calls).toBe(0);
    button.click();
    flush();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe('bilan-detail');
    const detail = root.querySelector('#bilan-detail')!;
    expect(detail.getAttribute('role')).toBe('group');
    expect(detail.textContent).toContain('60 animaux dans 288 L');
    expect(detail.textContent).toContain('À faire');
    button.click();
    flush();
    expect(root.querySelector('[data-review-detail]')).toBeNull();
  });

  it('journal (#581) : absent sans journal ; vide, le dit ; rempli, liste datée', () => {
    const { host, root, flush } = mount();
    flush();
    expect(root.querySelector('[data-journal]')).toBeNull();
    host.journal.set([]);
    host.reviewOf.set(() => []);
    flush();
    const button = root.querySelector<HTMLElement>('[data-journal]')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    root.querySelector<HTMLElement>('[data-review]')!.click();
    flush();
    button.click();
    flush();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe('journal-detail');
    expect(root.querySelector('[data-journal-empty]')).not.toBeNull();
    expect(root.querySelector('[data-review-detail]')).toBeNull();
    host.journal.set([
      { kind: 'ponte', day: 2, text: 'Ponte : 3 œufs (Corydora)' },
      { kind: 'changementEau', day: 1, text: 'Changement d’eau' },
    ]);
    flush();
    const items = [...root.querySelectorAll('[data-journal-detail] li')];
    expect(items.map((item) => item.textContent!.trim())).toEqual([
      'Jour 2 : Ponte : 3 œufs (Corydora)',
      'Jour 1 : Changement d’eau',
    ]);
    button.click();
    flush();
    expect(root.querySelector('[data-journal-detail]')).toBeNull();
  });

  it('bilan vide : le dit ; le déplier replie le calendrier', () => {
    const { host, root, flush } = mount();
    host.maintenance.set(maintenanceReadout(initialMaintenance(0), DAY));
    host.reviewOf.set(() => []);
    flush();
    root.querySelector<HTMLElement>('[data-maintenance]')!.click();
    flush();
    root.querySelector<HTMLElement>('[data-review]')!.click();
    flush();
    expect(root.querySelector('[data-review-empty]')).not.toBeNull();
    expect(root.querySelector('[data-maintenance-detail]')).toBeNull();
  });
});

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

  it('alerte de faim dépliée : espèces nommées, bouton qui demande la mise en évidence (#483)', async () => {
    const host = fixture.componentInstance;
    host.alarm();
    host.targets.set({
      ...NO_ALERT_TARGETS,
      hunger: { ids: [1, 2, 7], groups: [{ species: 'neon', count: 3 }] },
    });
    await fixture.whenStable();
    root().querySelector<HTMLButtonElement>('[data-alert="hunger"] .status__chip')!.click();
    await fixture.whenStable();
    expect(root().querySelector('[data-alert-animals="hunger"]')!.textContent).toContain('3 néons');
    root().querySelector<HTMLButtonElement>('[data-alert-show="hunger"]')!.click();
    expect(host.shown).toEqual([[1, 2, 7]]);
    host.highlighted.set(3);
    await fixture.whenStable();
    expect(root().querySelector('[data-alert-highlight-announcement]')!.textContent).toContain(
      '3 animaux mis en évidence',
    );
  });

  it('alerte sans animal désigné : pas de bouton ; composé de l’eau : pas de ligne (#483)', async () => {
    const host = fixture.componentInstance;
    host.alarm();
    await fixture.whenStable();
    root().querySelector<HTMLButtonElement>('[data-alert="hunger"] .status__chip')!.click();
    await fixture.whenStable();
    expect(root().querySelector('[data-alert-animals="hunger"]')!.textContent).toContain('aucun');
    expect(root().querySelector('[data-alert-show]')).toBeNull();
    root().querySelector<HTMLButtonElement>('[data-alert="ammonia"] .status__chip')!.click();
    await fixture.whenStable();
    expect(root().querySelector('[data-alert-animals]')).toBeNull();
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

  it('« Pourquoi ? » sous une alerte dépliée : ouvre le guide sur l’explication liée (#240)', async () => {
    const guide = TestBed.inject(BeginnerGuideState);
    const show = vi.spyOn(guide, 'show');
    fixture.componentInstance.alarm();
    await fixture.whenStable();
    chips()[0]!.click();
    await fixture.whenStable();
    const why = root().querySelector<HTMLButtonElement>('[data-alert-why="ammonia"]')!;
    expect(why.textContent?.trim()).toBe('Pourquoi ?');
    expect(why.getAttribute('aria-haspopup')).toBe('dialog');
    expect(why.getAttribute('aria-label')).toBe(alertWhyLabel('ammonia'));
    expect(alertWhyLabel('ammonia')).toBe('Pourquoi ? Le cycle de l’azote');
    why.click();
    expect(show).toHaveBeenCalledWith(ALERT_TOPICS.ammonia);
    expect(guide.topic()).toBe('azote');
    guide.hide();
  });

  it('points blancs : alerte avec un bouton « Wiki : Maladies » qui demande la page (#366)', async () => {
    fixture.componentInstance.health.set(
      healthSummary([
        { species: 'neon', health: 1, hunger: 0.2, ich: ICH_AGGRAVATED_AT },
        { species: 'neon', health: 1, hunger: 0.2 },
      ]),
    );
    await fixture.whenStable();
    expect(chips()).toHaveLength(1);
    expect(chips()[0]!.textContent).toContain('Points blancs');
    expect(root().querySelector('[data-alert="ich"]')?.getAttribute('data-severity')).toBe(
      'critique',
    );
    expect(announcement()).toBe('1 alerte : Points blancs (critique).');
    chips()[0]!.click();
    await fixture.whenStable();
    const link = root().querySelector<HTMLButtonElement>('[data-alert-wiki="maladies"]')!;
    expect(link.textContent?.trim()).toBe('Wiki : Maladies');
    expect(link.getAttribute('aria-label')).toBe(alertWikiLabel('maladies'));
    expect(alertWikiLabel('maladies')).toBe('Ouvrir le wiki : page « Maladies »');
    link.click();
    expect(fixture.componentInstance.wikiPages).toEqual(['maladies']);
    const sick = root().querySelector('[data-health="sick"]')!;
    expect(sick.getAttribute('title')).toContain('dont 1 avec des points blancs');
  });

  it('alertes sans lien vers le wiki : aucun bouton « Wiki »', async () => {
    fixture.componentInstance.alarm();
    await fixture.whenStable();
    const alertIds = [...root().querySelectorAll<HTMLElement>('[data-alert]')].map(
      (alert) => alert.dataset['alert']!,
    );
    expect(alertIds.length).toBeGreaterThan(0);
    for (const id of alertIds) {
      root().querySelector<HTMLButtonElement>(`[data-alert="${id}"] .status__chip`)!.click();
      await fixture.whenStable();
      expect(root().querySelector('[data-alert-wiki]')).toBeNull();
    }
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

  it('mélange déconseillé de la population reçue : alerte « attention », retirée avec l’espèce (#271)', async () => {
    const host = fixture.componentInstance;
    host.environment.set('paludarium');
    host.population.set({ ...NO_FISH, axolotl: 2, grenouille: 3, triton: 2 });
    await fixture.whenStable();
    const alert = root().querySelector<HTMLElement>('[data-alert="mix"]');
    expect(alert?.dataset['severity']).toBe('attention');
    expect(alert?.textContent).toContain('Mélange déconseillé');
    expect(announcement()).toBe('1 alerte : Mélange déconseillé (attention).');

    host.population.set({ ...NO_FISH, grenouille: 3, triton: 2 });
    await fixture.whenStable();
    expect(root().querySelector('[data-alert="mix"]')).toBeNull();
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
