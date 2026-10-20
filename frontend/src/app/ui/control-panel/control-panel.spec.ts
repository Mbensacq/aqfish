import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { SIM_SPEEDS } from '../../sim/sim-speed';
import {
  CONTROL_PANEL_ID,
  ControlPanel,
  sliderHour,
  speedAt,
  speedIndex,
  speedLabel,
} from './control-panel';

describe('fonctions du panneau de contrôle', () => {
  it('speedLabel : « Pause » à 0, sinon × avec virgule décimale', () => {
    expect(SIM_SPEEDS.map(speedLabel)).toEqual(['Pause', '×0,5', '×1', '×2', '×4']);
  });

  it('speedIndex / speedAt : aller-retour sur toutes les vitesses', () => {
    SIM_SPEEDS.forEach((speed, i) => {
      expect(speedIndex(speed)).toBe(i);
      expect(speedAt(String(i))).toBe(speed);
      expect(speedAt(i)).toBe(speed);
    });
  });

  it('speedIndex : vitesse inconnue ⇒ rang de ×1 ; speedAt : rang invalide ⇒ null', () => {
    expect(speedIndex(3)).toBe(2);
    expect(speedIndex(Number.NaN)).toBe(2);
    for (const value of ['-1', '5', '1.5', '', 'abc', Number.NaN]) {
      expect(speedAt(value)).toBeNull();
    }
  });

  it('sliderHour : heure dans [0, 24), sinon null', () => {
    expect(sliderHour('14.5')).toBe(14.5);
    expect(sliderHour('0')).toBe(0);
    expect(sliderHour(23.75)).toBe(23.75);
    for (const value of ['24', '-0.25', 'abc', 'Infinity', '', ' ']) {
      expect(sliderHour(value)).toBeNull();
    }
  });
});

/** Hôte de test : fournit l'état au panneau et note ce qu'il émet. */
@Component({
  imports: [ControlPanel],
  template: `<app-control-panel
    [speed]="speed()"
    [hour]="hour()"
    [clockRunning]="running()"
    [decorVisible]="decor()"
    (speedChanged)="events.push(['vitesse', $event])"
    (hourChanged)="events.push(['heure', $event])"
    (clockRunningChanged)="events.push(['auto', $event])"
    (decorVisibleChanged)="events.push(['decor', $event])"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestHost {
  readonly speed = signal(1);
  readonly hour = signal(12);
  readonly running = signal(true);
  readonly decor = signal(true);
  readonly events: [string, number | boolean][] = [];
}

describe('ControlPanel', () => {
  let fixture: ComponentFixture<TestHost>;
  const root = () => fixture.nativeElement as HTMLElement;
  const toggle = () => root().querySelector<HTMLButtonElement>('.control-panel__toggle')!;
  const byLabel = (label: string) =>
    root().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  const checkbox = (text: string) =>
    [...root().querySelectorAll<HTMLLabelElement>('.control-panel__check')]
      .find((label) => label.textContent?.includes(text))
      ?.querySelector('input') ?? null;

  async function openPanel(): Promise<void> {
    toggle().click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    fixture = TestBed.createComponent(TestHost);
    await fixture.whenStable();
  });

  it('fermé par défaut : seul le bouton « Réglages » est affiché', () => {
    expect(toggle().textContent?.trim()).toBe('Réglages');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-controls')).toBe(CONTROL_PANEL_ID);
    expect(root().querySelector('section')).toBeNull();
  });

  it('se déplie et se replie au bouton', async () => {
    await openPanel();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    const section = root().querySelector('section');
    expect(section?.id).toBe(CONTROL_PANEL_ID);
    expect(section?.getAttribute('aria-label')).toBe('Réglages de l’aquarium');
    await openPanel();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(root().querySelector('section')).toBeNull();
  });

  it('sections extensibles : simulation, journée, décor, chacune avec sa légende', async () => {
    await openPanel();
    const sections = [...root().querySelectorAll('fieldset')];
    expect(sections.map((s) => s.getAttribute('data-section'))).toEqual([
      'simulation',
      'journee',
      'decor',
    ]);
    expect(sections.map((s) => s.querySelector('legend')?.textContent?.trim())).toEqual([
      'Simulation',
      'Journée',
      'Décor',
    ]);
  });

  it('curseur de vitesse : 5 crans, valeur et libellé de l’hôte, émet la vitesse choisie', async () => {
    await openPanel();
    const range = byLabel('Vitesse de la simulation')!;
    expect(range.type).toBe('range');
    expect(range.min).toBe('0');
    expect(range.max).toBe('4');
    expect(range.value).toBe('2');
    expect(range.getAttribute('aria-valuetext')).toBe('×1');
    fixture.componentInstance.speed.set(0);
    await fixture.whenStable();
    expect(range.value).toBe('0');
    expect(range.getAttribute('aria-valuetext')).toBe('Pause');
    expect(root().querySelector('[data-section="simulation"] output')?.textContent).toBe('Pause');
    range.value = '4';
    range.dispatchEvent(new Event('input'));
    range.value = '1';
    range.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.events).toEqual([
      ['vitesse', 4],
      ['vitesse', 0.5],
    ]);
  });

  it('curseur d’heure : libellé « 14:30 », crans d’un quart d’heure, émet l’heure', async () => {
    fixture.componentInstance.hour.set(14.5);
    await openPanel();
    const range = byLabel('Heure de la journée')!;
    expect(range.min).toBe('0');
    expect(range.max).toBe('23.75');
    expect(range.step).toBe('0.25');
    expect(range.value).toBe('14.5');
    expect(range.getAttribute('aria-valuetext')).toBe('14:30');
    expect(root().querySelector('[data-section="journee"] output')?.textContent).toBe('14:30');
    range.value = '6.25';
    range.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.events).toEqual([['heure', 6.25]]);
  });

  it('case « Heure automatique » : suit l’hôte et émet la demande', async () => {
    await openPanel();
    const box = checkbox('Heure automatique')!;
    expect(box.checked).toBe(true);
    fixture.componentInstance.running.set(false);
    await fixture.whenStable();
    expect(box.checked).toBe(false);
    box.click();
    expect(fixture.componentInstance.events).toEqual([['auto', true]]);
  });

  it('case « Afficher le décor » : suit l’hôte et émet la demande', async () => {
    await openPanel();
    const box = checkbox('Afficher le décor')!;
    expect(box.checked).toBe(true);
    box.click();
    expect(fixture.componentInstance.events).toEqual([['decor', false]]);
    fixture.componentInstance.decor.set(false);
    await fixture.whenStable();
    expect(box.checked).toBe(false);
  });

  it('chaque contrôle a un nom accessible et est atteignable au clavier (aucun tabindex négatif)', async () => {
    await openPanel();
    const controls = [...root().querySelectorAll<HTMLElement>('button, input')];
    expect(controls).toHaveLength(5);
    for (const control of controls) {
      const name =
        control.getAttribute('aria-label') ??
        control.closest('label')?.textContent?.trim() ??
        control.textContent?.trim();
      expect(name, control.outerHTML).toBeTruthy();
      expect(control.tabIndex).toBeGreaterThanOrEqual(0);
      expect(control.hasAttribute('disabled')).toBe(false);
    }
  });
});
