import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { EnvironmentId } from '../../sim/environment';
import type { PopulationCounts } from '../../sim/population';
import { SIM_SPEEDS } from '../../sim/sim-speed';
import {
  CONTROL_PANEL_ID,
  ControlPanel,
  populationInput,
  type PopulationRequest,
  sliderHour,
  speciesPlural,
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

  it('populationInput : entier arrondi et borné à [0, max], null si non numérique', () => {
    expect(populationInput('12', 40)).toBe(12);
    expect(populationInput(7, 40)).toBe(7);
    expect(populationInput('0', 40)).toBe(0);
    expect(populationInput('2.4', 40)).toBe(2);
    expect(populationInput('2.6', 40)).toBe(3);
    expect(populationInput('-3', 40)).toBe(0);
    expect(populationInput('500', 40)).toBe(40);
    expect(populationInput('5', -2)).toBe(0);
    for (const value of ['', ' ', 'abc', 'Infinity', Number.NaN]) {
      expect(populationInput(value, 40)).toBeNull();
    }
  });

  it('speciesPlural : nom de l’espèce au pluriel, en minuscules', () => {
    expect(speciesPlural('neon')).toBe('néons');
    expect(speciesPlural('guppy')).toBe('guppys');
    expect(speciesPlural('corydora')).toBe('corydoras');
  });
});

/** Hôte de test : fournit l'état au panneau et note ce qu'il émet. */
@Component({
  imports: [ControlPanel],
  template: `<app-control-panel
    [environment]="environment()"
    [speed]="speed()"
    [hour]="hour()"
    [clockRunning]="running()"
    [decorVisible]="decor()"
    [population]="population()"
    [populationMax]="populationMax()"
    (populationChanged)="requests.push($event)"
    (speedChanged)="events.push(['vitesse', $event])"
    (hourChanged)="events.push(['heure', $event])"
    (clockRunningChanged)="events.push(['auto', $event])"
    (decorVisibleChanged)="events.push(['decor', $event])"
    (environmentChanged)="environments.push($event)"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestHost {
  readonly environment = signal<EnvironmentId>('tropical');
  readonly environments: EnvironmentId[] = [];
  readonly speed = signal(1);
  readonly hour = signal(12);
  readonly running = signal(true);
  readonly decor = signal(true);
  readonly population = signal<PopulationCounts>({ neon: 12, guppy: 6, corydora: 0, koi: 0 });
  readonly populationMax = signal<PopulationCounts>({ neon: 40, guppy: 6, corydora: 16, koi: 14 });
  readonly events: [string, number | boolean][] = [];
  readonly requests: PopulationRequest[] = [];
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

  it('liste des environnements nommée, sélection fournie par l’hôte, choix émis (#87)', async () => {
    await openPanel();
    const select = root().querySelector<HTMLSelectElement>('select[aria-label="Environnement"]')!;
    expect(select).not.toBeNull();
    expect(select.id).toBe('panneau-environnement');
    expect(root().querySelector('label[for="panneau-environnement"]')).not.toBeNull();
    expect([...select.options].map((o) => [o.value, o.textContent?.trim()])).toEqual([
      ['tropical', 'Bac tropical'],
      ['bassin', 'Bassin'],
    ]);
    expect(select.value).toBe('tropical');

    select.value = 'bassin';
    select.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.environments).toEqual(['bassin']);

    // L'hôte confirme : la liste suit ; re-choisir l'environnement courant n'émet rien.
    fixture.componentInstance.environment.set('bassin');
    await fixture.whenStable();
    expect(select.value).toBe('bassin');
    select.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.environments).toEqual(['bassin']);
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

  it('sections extensibles : environnement, simulation, journée, décor, population, chacune avec sa légende', async () => {
    await openPanel();
    const sections = [...root().querySelectorAll('fieldset')];
    expect(sections.map((s) => s.getAttribute('data-section'))).toEqual([
      'environnement',
      'simulation',
      'journee',
      'decor',
      'population',
    ]);
    expect(sections.map((s) => s.querySelector('legend')?.textContent?.trim())).toEqual([
      'Environnement',
      'Simulation',
      'Journée',
      'Décor',
      'Population',
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
    // 5 contrôles de #52, puis « − », champ et « + » pour chacune des 3 espèces (#69).
    expect(controls).toHaveLength(5 + 3 * 3);
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

  describe('population (#69)', () => {
    const field = (plural: string) => byLabel(`Nombre de ${plural}`)!;
    const button = (label: string) =>
      root().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

    it('un champ numérique par espèce, nommé, avec la valeur et le maximum de l’hôte', async () => {
      await openPanel();
      const rows = [
        ...root().querySelectorAll('[data-section="population"] .control-panel__count'),
      ];
      expect(rows.map((r) => r.getAttribute('data-species'))).toEqual([
        'neon',
        'guppy',
        'corydora',
      ]);
      expect(rows.map((r) => r.querySelector('label')?.textContent?.trim())).toEqual([
        'Néon',
        'Guppy',
        'Corydora',
      ]);
      const neons = field('néons');
      expect(neons.type).toBe('number');
      expect(neons.min).toBe('0');
      expect(neons.max).toBe('40');
      expect(neons.step).toBe('1');
      expect(neons.value).toBe('12');
      // Le libellé visible désigne bien le champ.
      expect(rows[0].querySelector('label')?.getAttribute('for')).toBe(neons.id);
      expect(field('guppys').value).toBe('6');
      expect(field('corydoras').value).toBe('0');
      fixture.componentInstance.population.set({ neon: 20, guppy: 6, corydora: 0, koi: 0 });
      await fixture.whenStable();
      expect(neons.value).toBe('20');
    });

    it('boutons « − » et « + » : émettent l’effectif voisin', async () => {
      await openPanel();
      button('Ajouter un néon').click();
      button('Retirer un néon').click();
      button('Ajouter un corydora').click();
      expect(fixture.componentInstance.requests).toEqual([
        { species: 'neon', count: 13 },
        { species: 'neon', count: 11 },
        { species: 'corydora', count: 1 },
      ]);
    });

    it('aux bornes : bouton marqué inactif, focalisable, sans effet', async () => {
      await openPanel();
      // Corydoras à 0, guppys au maximum (6).
      const minus = button('Retirer un corydora');
      const plus = button('Ajouter un guppy');
      expect(minus.getAttribute('aria-disabled')).toBe('true');
      expect(plus.getAttribute('aria-disabled')).toBe('true');
      expect(button('Ajouter un néon').getAttribute('aria-disabled')).toBe('false');
      expect(minus.disabled).toBe(false);
      minus.click();
      plus.click();
      expect(fixture.componentInstance.requests).toEqual([]);
    });

    it('saisie : valeur bornée émise et réécrite ; invalide ou inchangée : rien émis', async () => {
      await openPanel();
      const neons = field('néons');
      neons.value = '25';
      neons.dispatchEvent(new Event('change'));
      neons.value = '999';
      neons.dispatchEvent(new Event('change'));
      expect(neons.value).toBe('40');
      neons.value = '2.6';
      neons.dispatchEvent(new Event('change'));
      expect(neons.value).toBe('3');
      neons.value = '';
      neons.dispatchEvent(new Event('change'));
      expect(neons.value).toBe('12');
      neons.value = '12';
      neons.dispatchEvent(new Event('change'));
      expect(fixture.componentInstance.requests).toEqual([
        { species: 'neon', count: 25 },
        { species: 'neon', count: 40 },
        { species: 'neon', count: 3 },
      ]);
    });
  });
});
