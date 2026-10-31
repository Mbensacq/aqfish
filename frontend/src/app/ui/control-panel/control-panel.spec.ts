import type { FoodStyle } from '../../core/food-style/food-style';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { EnvironmentId } from '../../sim/environment';
import type { PopulationCounts } from '../../sim/population';
import type { SaveMessage, SaveStatus } from '../../core/save-storage/save-storage';
import { MAX_SAVE_LENGTH } from '../../sim/save';
import { SIM_SPEEDS } from '../../sim/sim-speed';
import { MAX_HEATER_TEMPERATURE, MIN_HEATER_TEMPERATURE } from '../../sim/water';
import { DEFAULT_WATER_READOUT, type WaterReadout } from '../../sim/water-quality';
import { SPECIES_LABELS } from '../../sim/species-catalog';
import type { RoomCatalog, TransferNotice } from '../aquarium-host/aquarium-host';
import type { TankListEntry } from '../../sim/tank-list';
import type { CareMode } from '../../sim/care-mode';
import {
  CONTROL_PANEL_ID,
  ControlPanel,
  HEATER_SLIDER_STEP,
  heaterText,
  sliderHeater,
  populationInput,
  type PopulationRequest,
  saveStatusText,
  sliderHour,
  speciesCountLabel,
  speciesPlural,
  speciesSliderLabel,
  speciesStepLabel,
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

  it('sliderHeater : consigne dans les bornes du chauffage, sinon null (#207)', () => {
    expect(sliderHeater('26.5')).toBe(26.5);
    expect(sliderHeater(MIN_HEATER_TEMPERATURE)).toBe(MIN_HEATER_TEMPERATURE);
    expect(sliderHeater(String(MAX_HEATER_TEMPERATURE))).toBe(MAX_HEATER_TEMPERATURE);
    for (const value of ['15.9', '32.1', '', 'abc', 'Infinity', Number.NaN]) {
      expect(sliderHeater(value)).toBeNull();
    }
  });

  it('heaterText : consigne seule une fois atteinte, sinon avec la température de l’eau', () => {
    expect(heaterText(DEFAULT_WATER_READOUT)).toBe('24,0 °C');
    expect(heaterText({ ...DEFAULT_WATER_READOUT, target: 28, temperature: 25.3 })).toBe(
      '28,0 °C · eau 25,3 °C',
    );
  });

  it('saveStatusText : un texte par état de la sauvegarde automatique', () => {
    expect(saveStatusText('active')).toMatch(/Enregistré automatiquement/);
    expect(saveStatusText('plein')).toMatch(/plein/);
    expect(saveStatusText('indisponible')).toMatch(/indisponible/);
    expect(saveStatusText(null)).toMatch(/désactivée/);
  });

  it('speciesPlural : nom de l’espèce au pluriel, en minuscules', () => {
    expect(speciesPlural('neon')).toBe('néons');
    expect(speciesPlural('guppy')).toBe('guppys');
    expect(speciesPlural('corydora')).toBe('corydoras');
    expect(speciesPlural('axolotl')).toBe('axolotls');
  });

  it('speciesCountLabel : élision devant une voyelle (#130)', () => {
    expect(speciesCountLabel('neon')).toBe('Nombre de néons');
    expect(speciesCountLabel('koi')).toBe('Nombre de koïs');
    expect(speciesCountLabel('axolotl')).toBe('Nombre d’axolotls');
  });

  it('speciesStepLabel : genre porté par le catalogue (#95)', () => {
    expect(speciesStepLabel('neon', -1)).toBe('Retirer un néon');
    expect(speciesStepLabel('neon', 1)).toBe('Ajouter un néon');
    expect(speciesStepLabel('grenouille', 1)).toBe('Ajouter un sonneur oriental');
    expect(speciesStepLabel('triton', -1)).toBe('Retirer un triton à ventre de feu');
    expect(speciesStepLabel('clown', 1)).toBe('Ajouter un poisson-clown');
    expect(speciesStepLabel('chirurgien', -1)).toBe('Retirer un chirurgien bleu');
  });

  it('speciesStepLabel : article féminin, sur des libellés factices (#284)', () => {
    const labels = {
      ...SPECIES_LABELS,
      neon: { singular: 'raie', plural: 'raies', feminine: true },
    };
    expect(speciesStepLabel('neon', 1, labels)).toBe('Ajouter une raie');
    expect(speciesStepLabel('neon', -1, labels)).toBe('Retirer une raie');
    expect(speciesStepLabel('guppy', 1, labels)).toBe('Ajouter un guppy');
  });

  it('speciesSliderLabel : distinct du champ, élision conservée (#189)', () => {
    expect(speciesSliderLabel('neon')).toBe('Curseur du nombre de néons');
    expect(speciesSliderLabel('axolotl')).toBe('Curseur du nombre d’axolotls');
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
    [rain]="rain()"
    [roomShown]="room()"
    [roomCatalog]="catalog()"
    [tankList]="tanks()"
    [transferNotice]="notice()"
    (tankSelected)="layout.push(['selection', $event])"
    (animalTransferred)="layout.push(['transfert', $event])"
    (tankRenamed)="layout.push(['renommage', $event])"
    [careMode]="careMode()"
    (careModeChanged)="layout.push(['mode', $event])"
    (careReturned)="layout.push(['retour-soins', $event])"
    [decorEditable]="editable()"
    [foodStyle]="foodStyle()"
    [population]="population()"
    [populationMax]="populationMax()"
    [tankLiters]="tankLiters()"
    [water]="water()"
    [saveStatus]="saveStatus()"
    [saveMessage]="saveMessage()"
    (exportRequested)="exports = exports + 1"
    (importRequested)="imports.push($event)"
    (importRejected)="rejections.push($event)"
    (populationChanged)="requests.push($event)"
    (speedChanged)="events.push(['vitesse', $event])"
    (hourChanged)="events.push(['heure', $event])"
    (clockRunningChanged)="events.push(['auto', $event])"
    (decorVisibleChanged)="events.push(['decor', $event])"
    (rainChanged)="events.push(['pluie', $event])"
    (roomShownChanged)="events.push(['piece', $event])"
    (supportAdded)="layout.push(['meuble', $event])"
    (tankAdded)="layout.push(['bac', $event])"
    (tankRemoved)="layout.push(['retrait-bac', $event])"
    (supportRemoved)="layout.push(['retrait-meuble', $event])"
    (environmentChanged)="environments.push($event)"
    (foodStyleToggled)="foodToggles = foodToggles + 1"
    (editRequested)="edits = edits + 1"
    (immersiveRequested)="immersives = immersives + 1"
    (heaterChanged)="events.push(['chauffage', $event])"
    (catappaChanged)="events.push(['catappa', $event])"
    (waterChangeRequested)="waterChanges = waterChanges + 1"
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
  readonly rain = signal(false);
  readonly room = signal(false);
  readonly catalog = signal<RoomCatalog>({ tanks: [], supports: [], message: null });
  readonly layout: [string, unknown][] = [];
  readonly tanks = signal<readonly TankListEntry[]>([]);
  readonly careMode = signal<CareMode>('soins');
  readonly notice = signal<TransferNotice | null>(null);
  readonly foodStyle = signal<FoodStyle>('points');
  foodToggles = 0;
  readonly editable = signal(true);
  edits = 0;
  immersives = 0;
  readonly population = signal<PopulationCounts>({
    neon: 12,
    guppy: 6,
    corydora: 0,
    koi: 0,
    axolotl: 0,
    grenouille: 0,
    triton: 0,
    clown: 0,
    chirurgien: 0,
    rasbora: 0,
    tetra: 0,
    kuhli: 0,
    gourami: 0,
  });
  readonly populationMax = signal<PopulationCounts>({
    neon: 40,
    guppy: 6,
    corydora: 16,
    koi: 14,
    axolotl: 4,
    grenouille: 0,
    triton: 0,
    clown: 0,
    chirurgien: 0,
    rasbora: 0,
    tetra: 0,
    kuhli: 0,
    gourami: 0,
  });
  readonly tankLiters = signal<number | null>(288);
  readonly water = signal<WaterReadout>(DEFAULT_WATER_READOUT);
  waterChanges = 0;
  readonly events: [string, number | boolean][] = [];
  readonly requests: PopulationRequest[] = [];
  readonly saveStatus = signal<SaveStatus | null>('active');
  readonly saveMessage = signal<SaveMessage | null>(null);
  exports = 0;
  readonly imports: string[] = [];
  readonly rejections: string[] = [];
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

  describe('liste des bacs (#306)', () => {
    const entry = (over: Partial<TankListEntry>): TankListEntry => ({
      id: 0,
      name: 'Bac tropical',
      environment: 'tropical',
      environmentName: 'Bac tropical',
      liters: 288,
      animals: 18,
      hunger: 20,
      mode: 'soins',
      worst: null,
      selected: true,
      selectable: true,
      ...over,
    });
    const section = () => root().querySelector<HTMLElement>('[data-section="bacs"]')!;
    const tankButton = (id: number) =>
      section().querySelector<HTMLButtonElement>(`[data-tank="${id}"] button`)!;

    beforeEach(() => {
      fixture.componentInstance.tanks.set([
        entry({}),
        entry({
          id: 1,
          name: 'Récif',
          environment: 'recif',
          environmentName: 'Récif',
          liters: 540,
          animals: 5,
          worst: 'critique',
          selected: false,
        }),
        entry({ id: 2, animals: 0, liters: 90, selected: false, selectable: false }),
      ]);
    });

    it('une ligne par bac : sélection, alerte, contenu, bac posé non sélectionnable', async () => {
      await openPanel();
      expect(tankButton(0).getAttribute('aria-pressed')).toBe('true');
      expect(tankButton(1).getAttribute('aria-pressed')).toBe('false');
      expect(tankButton(1).textContent).toContain('Critique');
      expect(tankButton(1).getAttribute('aria-label')).toContain('alerte critique');
      expect(section().querySelector('[data-tank="1"]')!.getAttribute('data-tank-alert')).toBe(
        'critique',
      );
      expect(tankButton(0).textContent).toContain('18 animaux · 288 L');
      expect(tankButton(2).textContent).toContain('vide · 90 L · posé');
      expect(tankButton(2).getAttribute('aria-disabled')).toBe('true');
    });

    it('cliquer un bac le sélectionne ; ni le bac sélectionné ni un bac posé', async () => {
      await openPanel();
      tankButton(0).click();
      tankButton(2).click();
      tankButton(1).click();
      expect(fixture.componentInstance.layout).toEqual([['selection', 1]]);
    });

    it('transfert : espèces présentes, bacs d’arrivée, émission et message', async () => {
      await openPanel();
      const species = section().querySelector<HTMLSelectElement>('[data-transfer-species]')!;
      const target = section().querySelector<HTMLSelectElement>('[data-transfer-target]')!;
      expect([...species.options].map((o) => o.value)).toEqual(['neon', 'guppy']);
      expect([...target.options].map((o) => o.value)).toEqual(['1', '2']);
      species.value = 'guppy';
      species.dispatchEvent(new Event('change'));
      target.value = '2';
      target.dispatchEvent(new Event('change'));
      section().querySelector<HTMLButtonElement>('[data-transfer]')!.click();
      expect(fixture.componentInstance.layout).toEqual([
        ['transfert', { species: 'guppy', toId: 2 }],
      ]);
      fixture.componentInstance.notice.set({ kind: 'erreur', text: 'Refusé' });
      await fixture.whenStable();
      const notice = section().querySelector('[data-transfer-notice]')!;
      expect(notice.textContent).toContain('Refusé');
      expect(notice.classList).toContain('control-panel__message--error');
    });

    it('faim de chaque bac exposée (#316)', async () => {
      await openPanel();
      expect(section().querySelector('[data-tank="0"]')!.getAttribute('data-tank-hunger')).toBe(
        '20',
      );
    });

    it('renommer : bac sélectionné par défaut, nom borné, émission (#316)', async () => {
      await openPanel();
      const target = section().querySelector<HTMLSelectElement>('[data-rename-tank]')!;
      const name = section().querySelector<HTMLInputElement>('[data-rename-name]')!;
      expect(target.value).toBe('0');
      expect(name.value).toBe('Bac tropical');
      expect(name.getAttribute('maxlength')).toBe('40');
      name.value = 'Bac du salon';
      section().querySelector<HTMLButtonElement>('[data-rename]')!.click();
      target.value = '2';
      target.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      name.value = 'Nano';
      name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(fixture.componentInstance.layout).toEqual([
        ['renommage', { id: 0, name: 'Bac du salon' }],
        ['renommage', { id: 2, name: 'Nano' }],
      ]);
    });

    it('un seul bac : ni transfert ni renommage proposés', async () => {
      fixture.componentInstance.tanks.set([entry({})]);
      await openPanel();
      expect(section().querySelector('[data-transfer]')).toBeNull();
      // Renommage dès deux bacs (#316) : le panneau tient en deux colonnes à 1280 × 720.
      expect(section().querySelector('[data-rename]')).toBeNull();
    });
  });

  it('fermé par défaut : seul le bouton « Réglages » est affiché', () => {
    expect(toggle().textContent?.trim()).toBe('Réglages');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-controls')).toBe(CONTROL_PANEL_ID);
    expect(root().querySelector('section')).toBeNull();
  });

  it('paludarium (#130, #131, #133) : compteurs des axolotls, des grenouilles et des tritons', async () => {
    await openPanel();
    fixture.componentInstance.environment.set('paludarium');
    await fixture.whenStable();
    const section = root().querySelector('[data-section="population"]')!;
    const rows = [...section.querySelectorAll('[data-species]')];
    expect(rows.map((row) => row.getAttribute('data-species'))).toEqual([
      'axolotl',
      'grenouille',
      'triton',
    ]);
    expect(section.querySelector('[data-population-empty]')).toBeNull();
    expect(byLabel('Nombre d’axolotls')?.value).toBe('0');
    expect(byLabel('Nombre de sonneurs orientaux')?.value).toBe('0');
    expect(byLabel('Nombre de tritons à ventre de feu')?.value).toBe('0');
  });

  it('mélange déconseillé (#209) : un libellé par couple incompatible présent', async () => {
    await openPanel();
    const warnings = () =>
      [...root().querySelectorAll('[data-mix-warning]')].map((p) => p.textContent?.trim());
    expect(warnings()).toEqual([]);
    fixture.componentInstance.environment.set('paludarium');
    fixture.componentInstance.population.set({
      ...fixture.componentInstance.population(),
      axolotl: 2,
      grenouille: 0,
      triton: 2,
    });
    await fixture.whenStable();
    expect(warnings()).toEqual([
      'Mélange déconseillé : axolotls et tritons à ventre de feu (prédateur)',
    ]);
    fixture.componentInstance.population.set({
      ...fixture.componentInstance.population(),
      axolotl: 0,
    });
    await fixture.whenStable();
    expect(warnings()).toEqual([]);
  });

  describe('mode du bac (#278)', () => {
    const modeButton = () => root().querySelector<HTMLButtonElement>('[data-care-mode-toggle]')!;
    const confirmBox = () => root().querySelector<HTMLElement>('[data-care-mode-confirm]');
    const speciesShown = () =>
      [...root().querySelectorAll<HTMLElement>('[data-species]')].map((el) =>
        el.getAttribute('data-species'),
      );

    it('changer de mode demande une confirmation qui explique la conséquence', async () => {
      await openPanel();
      expect(modeButton().textContent).toContain('Mode : soins');
      expect(confirmBox()).toBeNull();
      modeButton().click();
      await fixture.whenStable();
      expect(confirmBox()?.getAttribute('role')).toBe('alertdialog');
      expect(confirmBox()?.textContent).toContain('mises en pause, pas effacées');
      // Annuler : rien n'est émis.
      [...confirmBox()!.querySelectorAll('button')].at(-1)!.click();
      await fixture.whenStable();
      expect(confirmBox()).toBeNull();
      expect(fixture.componentInstance.layout).toEqual([]);
      modeButton().click();
      await fixture.whenStable();
      confirmBox()!.querySelector<HTMLButtonElement>('[data-care-mode-confirm-yes]')!.click();
      await fixture.whenStable();
      expect(fixture.componentInstance.layout).toEqual([['mode', 'decor']]);
      expect(confirmBox()).toBeNull();
    });

    it('en mode décor : retour aux soins expliqué, catalogue complet, aucun avertissement', async () => {
      await openPanel();
      fixture.componentInstance.environment.set('paludarium');
      fixture.componentInstance.population.update((p) => ({ ...p, axolotl: 2, triton: 2 }));
      await fixture.whenStable();
      const ownSpecies = speciesShown();
      expect(root().querySelector('[data-mix-warning]')).not.toBeNull();
      fixture.componentInstance.careMode.set('decor');
      await fixture.whenStable();
      expect(modeButton().textContent).toContain('Mode : décor');
      expect(speciesShown().slice(0, ownSpecies.length)).toEqual(ownSpecies);
      expect(speciesShown()).toContain('clown');
      expect(root().querySelector('[data-mix-warning]')).toBeNull();
      modeButton().click();
      await fixture.whenStable();
      expect(confirmBox()?.textContent).toContain('reprennent où elles en étaient');
      confirmBox()!.querySelector<HTMLButtonElement>('[data-care-mode-confirm-yes]')!.click();
      await fixture.whenStable();
      expect(fixture.componentInstance.layout).toEqual([['mode', 'soins']]);
    });
  });

  describe('retour en soins : animaux inadaptés (#278, lot 2)', () => {
    const modeButton = () => root().querySelector<HTMLButtonElement>('[data-care-mode-toggle]')!;
    const confirmBox = () => root().querySelector<HTMLElement>('[data-care-mode-confirm]');
    const listed = () =>
      [...(confirmBox()?.querySelectorAll<HTMLElement>('[data-unsuitable]') ?? [])].map((el) =>
        el.getAttribute('data-unsuitable'),
      );

    async function askReturn(): Promise<void> {
      await openPanel();
      fixture.componentInstance.careMode.set('decor');
      await fixture.whenStable();
      modeButton().click();
      await fixture.whenStable();
    }

    it('sans animal inadapté : aucune liste, « Revenir au mode soins »', async () => {
      await askReturn();
      expect(confirmBox()).not.toBeNull();
      expect(confirmBox()!.querySelector('[data-unsuitable]')).toBeNull();
      expect(confirmBox()!.querySelector('[data-care-mode-remove]')).toBeNull();
      expect(confirmBox()!.querySelector('[data-care-mode-confirm-yes]')?.textContent).toContain(
        'Revenir au mode soins',
      );
    });

    it('liste les espèces inadaptées et leur raison ; « Tout retirer » émet la liste', async () => {
      fixture.componentInstance.population.update((p) => ({ ...p, clown: 2, koi: 1 }));
      await askReturn();
      expect(listed()).toEqual(['koi', 'clown']);
      const clown = confirmBox()!.querySelector('[data-unsuitable="clown"]')!;
      expect(clown.textContent).toContain('Poisson-clown (2)');
      expect(clown.textContent).toContain('Autre milieu : vit dans « Récif »');
      confirmBox()!.querySelector<HTMLButtonElement>('[data-care-mode-remove]')!.click();
      await fixture.whenStable();
      expect(fixture.componentInstance.layout).toEqual([['retour-soins', ['koi', 'clown']]]);
      expect(confirmBox()).toBeNull();
    });

    it('« Tout garder » ne retire rien ; en soins, l’avertissement de milieu s’affiche', async () => {
      fixture.componentInstance.population.update((p) => ({ ...p, clown: 2 }));
      await askReturn();
      const keep = confirmBox()!.querySelector<HTMLButtonElement>('[data-care-mode-confirm-yes]')!;
      expect(keep.textContent).toContain('Tout garder');
      keep.click();
      await fixture.whenStable();
      expect(fixture.componentInstance.layout).toEqual([['mode', 'soins']]);
      // Aucun avertissement de milieu en décor, un en soins.
      expect(root().querySelector('[data-milieu-warning]')).toBeNull();
      fixture.componentInstance.careMode.set('soins');
      await fixture.whenStable();
      const notes = [...root().querySelectorAll('[data-milieu-warning]')].map((el) =>
        el.textContent!.trim(),
      );
      expect(notes).toEqual(['Poisson-clown (2) : Autre milieu : vit dans « Récif »']);
    });
  });

  describe('bacs et meubles (#305)', () => {
    const section = () => root().querySelector('[data-section="bacs-meubles"]');
    const CATALOG: RoomCatalog = {
      tanks: [
        { id: 0, name: 'Bac tropical', animals: 18, shown: true, on: null },
        { id: 1, name: 'Récif', animals: 6, shown: false, on: null },
        { id: 2, name: 'Bac tropical', animals: 0, shown: false, on: 'Commode 1' },
      ],
      supports: [
        { id: 0, name: 'Commode 1', occupied: true },
        { id: 1, name: 'Étagère basse 2', occupied: false },
      ],
      message: null,
    };

    async function openWithRoom(): Promise<void> {
      fixture.componentInstance.room.set(true);
      fixture.componentInstance.catalog.set(CATALOG);
      await openPanel();
    }

    it('absent tant que la pièce est masquée, ou hors du bac tropical', async () => {
      await openPanel();
      expect(section()).toBeNull();
      fixture.componentInstance.room.set(true);
      fixture.componentInstance.environment.set('recif');
      await fixture.whenStable();
      expect(section()).toBeNull();
      fixture.componentInstance.environment.set('tropical');
      await fixture.whenStable();
      expect(section()).not.toBeNull();
    });

    it('ajoute un meuble, puis un bac choisi (environnement, taille, meuble)', async () => {
      await openWithRoom();
      section()!.querySelector<HTMLButtonElement>('[data-add-support="etagere-bacs"]')!.click();
      section()!.querySelector<HTMLButtonElement>('[data-add-tank]')!.click();
      const pick = (selector: string, value: string): void => {
        const select = section()!.querySelector<HTMLSelectElement>(selector)!;
        select.value = value;
        select.dispatchEvent(new Event('change'));
      };
      pick('[data-new-tank-environment]', 'paludarium');
      pick('[data-new-tank-size]', 'petit');
      pick('[data-new-tank-support]', '1');
      await fixture.whenStable();
      section()!.querySelector<HTMLButtonElement>('[data-add-tank]')!.click();
      expect(fixture.componentInstance.layout).toEqual([
        ['meuble', 'etagere-bacs'],
        ['bac', { environment: 'tropical', size: 'moyen', supportId: null }],
        ['bac', { environment: 'paludarium', size: 'petit', supportId: 1 }],
      ]);
      // Le bassin, au jardin, n'est pas proposé.
      const options = [
        ...section()!.querySelectorAll<HTMLOptionElement>('[data-new-tank-environment] option'),
      ].map((o) => o.value);
      expect(options).not.toContain('bassin');
      expect(options).toContain('tropical');
    });

    it('liste les bacs ; le bac affiché ne se retire pas ; un bac vide se retire aussitôt', async () => {
      await openWithRoom();
      const rows = [...section()!.querySelectorAll('[data-room-tank]')];
      expect(rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        'Bac tropical affiché, 18 animaux',
        'Récif rangé, 6 animaux Retirer',
        'Bac tropical posé sur Commode 1, vide Retirer',
      ]);
      expect(rows[0]!.querySelector('[data-remove-tank]')).toBeNull();
      rows[2]!.querySelector<HTMLButtonElement>('[data-remove-tank]')!.click();
      expect(fixture.componentInstance.layout).toEqual([['retrait-bac', 2]]);
    });

    it('singulier (#315) : « 1 animal », pas « 1 animaux »', async () => {
      fixture.componentInstance.catalog.set({
        ...CATALOG,
        tanks: CATALOG.tanks.map((tank) => (tank.id === 2 ? { ...tank, animals: 1 } : tank)),
      });
      fixture.componentInstance.room.set(true);
      await openPanel();
      const row = section()!.querySelector('[data-room-tank="2"]')!;
      expect(row.textContent?.replace(/\s+/g, ' ')).toContain(
        'posé sur Commode 1, 1 animal Retirer',
      );
    });

    it('un bac peuplé demande une confirmation ; « Garder » l’annule', async () => {
      await openWithRoom();
      const row = () => section()!.querySelector('[data-room-tank="1"]')!;
      row().querySelector<HTMLButtonElement>('[data-remove-tank]')!.click();
      await fixture.whenStable();
      expect(fixture.componentInstance.layout).toEqual([]);
      const confirm = row().querySelector<HTMLButtonElement>('[data-confirm-remove]')!;
      expect(confirm.textContent?.trim()).toBe('Retirer avec 6 animaux');
      [...row().querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => b.textContent?.trim() === 'Garder')!
        .click();
      await fixture.whenStable();
      expect(row().querySelector('[data-confirm-remove]')).toBeNull();
      row().querySelector<HTMLButtonElement>('[data-remove-tank]')!.click();
      await fixture.whenStable();
      row().querySelector<HTMLButtonElement>('[data-confirm-remove]')!.click();
      expect(fixture.componentInstance.layout).toEqual([['retrait-bac', 1]]);
    });

    it('meuble occupé : « Retirer » sans effet ; libre : retiré ; message de refus affiché', async () => {
      await openWithRoom();
      const remove = (id: number) =>
        section()!.querySelector<HTMLButtonElement>(`[data-room-support="${id}"] button`)!;
      expect(remove(0).getAttribute('aria-disabled')).toBe('true');
      remove(0).click();
      remove(1).click();
      expect(fixture.componentInstance.layout).toEqual([['retrait-meuble', 1]]);
      fixture.componentInstance.catalog.set({ ...CATALOG, message: 'La pièce est pleine.' });
      await fixture.whenStable();
      expect(section()!.querySelector('[role="status"]')?.textContent?.trim()).toBe(
        'La pièce est pleine.',
      );
    });
  });

  describe('fiches d’espèces (#237)', () => {
    const sheetToggle = (id: string) =>
      root().querySelector<HTMLButtonElement>(`[data-sheet-toggle="${id}"]`)!;
    const sheet = () => root().querySelector<HTMLElement>('[data-species-sheet]');
    const addWarnings = () =>
      [...root().querySelectorAll('[data-add-warning]')].map((p) => p.textContent?.trim());
    const stepButton = (label: string) =>
      root().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

    it('« Fiche » ouvre la fiche (région titrée, statuts) ; un second clic la referme', async () => {
      await openPanel();
      const button = sheetToggle('neon');
      expect(button.textContent?.trim()).toBe('Fiche');
      expect(button.getAttribute('aria-label')).toBe('Fiche : Néon');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(sheet()).toBeNull();
      button.click();
      await fixture.whenStable();
      expect(button.getAttribute('aria-expanded')).toBe('true');
      const region = sheet()!;
      expect(region.getAttribute('role')).toBe('region');
      expect(region.id).toBe(button.getAttribute('aria-controls'));
      const title = root().querySelector(`#${region.getAttribute('aria-labelledby')}`);
      expect(title?.textContent).toContain('Fiche : Néon');
      expect(region.getAttribute('data-species-sheet')).toBe('neon');
      const rows = region.querySelectorAll('[data-sheet-field]');
      expect(rows).toHaveLength(11);
      // Statut légal (#269) : dernière ligne, avec la prudence DDPP ; aucune mise en garde.
      expect(rows[10].getAttribute('data-sheet-field')).toBe('legal');
      expect(rows[10].textContent).toContain('à vérifier auprès de la DDPP');
      expect(region.querySelectorAll('[data-sheet-note]')).toHaveLength(0);
      const statuses = [...region.querySelectorAll('[data-sheet-status]')].map((el) =>
        el.textContent?.trim(),
      );
      expect(statuses).toHaveLength(11);
      expect(statuses).toContain('Approximation de jeu');
      expect(statuses).toContain('Source : documentation du projet (FishBase)');
      button.click();
      await fixture.whenStable();
      expect(sheet()).toBeNull();
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('une seule fiche à la fois ; Échap et « Fermer la fiche » referment et rendent le focus', async () => {
      await openPanel();
      sheetToggle('neon').click();
      await fixture.whenStable();
      sheetToggle('guppy').click();
      await fixture.whenStable();
      expect(root().querySelectorAll('[data-species-sheet]')).toHaveLength(1);
      expect(sheet()?.getAttribute('data-species-sheet')).toBe('guppy');

      const close = sheet()!.querySelector<HTMLButtonElement>('[data-sheet-close]')!;
      close.focus();
      close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await fixture.whenStable();
      expect(sheet()).toBeNull();
      expect(document.activeElement).toBe(sheetToggle('guppy'));

      sheetToggle('neon').click();
      await fixture.whenStable();
      sheet()!.querySelector<HTMLButtonElement>('[data-sheet-close]')!.click();
      await fixture.whenStable();
      expect(sheet()).toBeNull();
      expect(document.activeElement).toBe(sheetToggle('neon'));
    });

    it('Échap sur le bouton « Fiche » referme la fiche ; sans fiche ouverte, Échap remonte', async () => {
      await openPanel();
      const button = sheetToggle('neon');
      button.click();
      await fixture.whenStable();
      const open = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      button.dispatchEvent(open);
      await fixture.whenStable();
      expect(sheet()).toBeNull();
      let bubbled = false;
      root().addEventListener('keydown', () => (bubbled = true));
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(bubbled).toBe(true);
    });

    it('changer d’environnement referme la fiche', async () => {
      await openPanel();
      sheetToggle('neon').click();
      await fixture.whenStable();
      fixture.componentInstance.environment.set('bassin');
      await fixture.whenStable();
      expect(sheet()).toBeNull();
    });

    it('avertissement d’ajout : groupe trop petit, puis disparu quand le groupe suffit', async () => {
      await openPanel();
      fixture.componentInstance.population.update((p) => ({ ...p, neon: 0 }));
      await fixture.whenStable();
      expect(addWarnings()).toEqual([]);
      stepButton('Ajouter un néon').click();
      expect(fixture.componentInstance.requests.at(-1)).toEqual({ species: 'neon', count: 1 });
      fixture.componentInstance.population.update((p) => ({ ...p, neon: 1 }));
      await fixture.whenStable();
      expect(addWarnings()).toEqual(['Groupe trop petit : 1 néon, 6 au moins conseillés']);
      // L'avertissement est sous la ligne de l'espèce ajoutée.
      const row = root().querySelector('[data-species="neon"]')!;
      expect(row.nextElementSibling?.hasAttribute('data-add-warning')).toBe(true);
      fixture.componentInstance.population.update((p) => ({ ...p, neon: 6 }));
      await fixture.whenStable();
      expect(addWarnings()).toEqual([]);
    });

    it('avertissement d’ajout : volume trop petit ; volume inconnu ignoré', async () => {
      fixture.componentInstance.tankLiters.set(81);
      await openPanel();
      stepButton('Ajouter un corydora').click();
      fixture.componentInstance.population.update((p) => ({ ...p, corydora: 6 }));
      await fixture.whenStable();
      expect(addWarnings()).toEqual(['Bac trop petit pour des corydoras : 81 L, 100 L conseillés']);
      fixture.componentInstance.tankLiters.set(null);
      await fixture.whenStable();
      expect(addWarnings()).toEqual([]);
    });

    it('avertissement d’ajout : espèce incompatible présente ; une baisse l’efface', async () => {
      fixture.componentInstance.environment.set('paludarium');
      fixture.componentInstance.population.update((p) => ({ ...p, axolotl: 2, triton: 0 }));
      fixture.componentInstance.populationMax.update((p) => ({ ...p, triton: 3 }));
      fixture.componentInstance.tankLiters.set(105);
      await openPanel();
      stepButton('Ajouter un triton à ventre de feu').click();
      fixture.componentInstance.population.update((p) => ({ ...p, triton: 1 }));
      await fixture.whenStable();
      expect(addWarnings()).toEqual([
        'Tritons à ventre de feu déconseillés avec les axolotls (prédateur)',
      ]);
      stepButton('Retirer un triton à ventre de feu').click();
      expect(fixture.componentInstance.requests.at(-1)).toEqual({ species: 'triton', count: 0 });
      await fixture.whenStable();
      expect(addWarnings()).toEqual([]);
    });
  });

  it('récif (#150, #151) : la population propose poissons-clowns et chirurgiens bleus', async () => {
    await openPanel();
    fixture.componentInstance.environment.set('recif');
    await fixture.whenStable();
    const section = root().querySelector('[data-section="population"]')!;
    const rows = [...section.querySelectorAll('[data-species]')];
    expect(rows.map((r) => r.getAttribute('data-species'))).toEqual(['clown', 'chirurgien']);
    expect(section.querySelector('[data-population-empty]')).toBeNull();
    expect(byLabel('Nombre de poissons-clowns')).not.toBeNull();
    expect(byLabel('Nombre de chirurgiens bleus')).not.toBeNull();
    expect(speciesPlural('clown')).toBe('poissons-clowns');
    expect(speciesPlural('chirurgien')).toBe('chirurgiens bleus');
    expect(speciesPlural('neon')).toBe('néons');
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
      ['paludarium', 'Paludarium'],
      ['recif', 'Récif'],
      ['eaufroide', 'Bac d’eau froide'],
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

  it('sections extensibles : environnement, simulation, journée, eau, décor, population, bacs, sauvegarde, chacune avec sa légende', async () => {
    await openPanel();
    const sections = [...root().querySelectorAll('fieldset')];
    expect(sections.map((s) => s.getAttribute('data-section'))).toEqual([
      'environnement',
      'simulation',
      'journee',
      'eau',
      'decor',
      'population',
      'bacs',
      'sauvegarde',
    ]);
    // Titre de la section : sa légende, ou l'élément qui la nomme (`aria-labelledby`) quand la
    // légende porte aussi un bouton (« Décor » et « Éditer le décor », #167).
    const title = (s: HTMLFieldSetElement) => {
      const labelledBy = s.getAttribute('aria-labelledby');
      const label = labelledBy
        ? s.querySelector(`legend #${labelledBy}`)
        : s.querySelector('legend');
      return label?.textContent?.trim();
    };
    expect(sections.map(title)).toEqual([
      'Environnement',
      'Simulation',
      'Journée',
      'Eau',
      'Décor',
      'Population',
      'Bacs',
      'Sauvegarde',
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

  it('case « Pluie » (#106) : bassin seulement, suit l’hôte et émet la demande', async () => {
    await openPanel();
    expect(checkbox('Pluie')).toBeNull();
    fixture.componentInstance.environment.set('bassin');
    await fixture.whenStable();
    const box = checkbox('Pluie')!;
    expect(box.checked).toBe(false);
    box.click();
    expect(fixture.componentInstance.events).toEqual([['pluie', true]]);
    fixture.componentInstance.rain.set(true);
    await fixture.whenStable();
    expect(checkbox('Pluie')!.checked).toBe(true);
    // Sur la ligne de « Heure automatique » : le panneau ne grandit pas (#101).
    expect(box.closest('.control-panel__row')).toBe(
      checkbox('Heure automatique')!.closest('.control-panel__row'),
    );
  });

  it('case « Afficher la pièce » (#187) : bac tropical seulement, suit l’hôte et émet la demande', async () => {
    await openPanel();
    const box = checkbox('Afficher la pièce')!;
    expect(box.checked).toBe(false);
    expect(box.closest('[data-section="environnement"]')).not.toBeNull();
    // Avec le libellé « Lieu » (sur sa ligne, #101), après la liste dans l'ordre du clavier.
    expect(box.closest('.control-panel__field')?.textContent).toContain('Lieu');
    const select = root().querySelector('#panneau-environnement')!;
    expect(select.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    box.click();
    expect(fixture.componentInstance.events).toEqual([['piece', true]]);
    fixture.componentInstance.room.set(true);
    await fixture.whenStable();
    expect(checkbox('Afficher la pièce')!.checked).toBe(true);
    checkbox('Afficher la pièce')!.click();
    expect(fixture.componentInstance.events).toEqual([
      ['piece', true],
      ['piece', false],
    ]);
    for (const id of ['bassin', 'paludarium', 'recif'] as const) {
      fixture.componentInstance.environment.set(id);
      await fixture.whenStable();
      expect(checkbox('Afficher la pièce'), id).toBeNull();
    }
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
    // Le champ de fichier natif est masqué : le bouton « Importer » l'ouvre (#70).
    const controls = [...root().querySelectorAll<HTMLElement>('button, input:not([type="file"])')];
    // 5 contrôles de #52, « Éditer le décor » (#167), « Granulés » (#117), « Afficher la
    // pièce » (#187), « Changer l’eau » et le curseur du chauffage (#207), « − » et « + » des
    // feuilles de catappa (#239), puis « − », champ, « + » (#69), curseur (#189) et « Fiche »
    // (#237) pour chacune des 7 espèces du bac tropical (#238), puis « Exporter » et
    // « Importer » (#70), le mode du bac (#278), et « Mode immersif » (#345).
    expect(controls).toHaveLength(5 + 1 + 1 + 1 + 2 + 2 + 7 * 5 + 2 + 1 + 1);
    expect(root().querySelectorAll('input[type="file"]')).toHaveLength(1);
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

  it('bouton « Mode immersif » (#345) : sur la ligne du titre « Simulation », émet la demande', async () => {
    await openPanel();
    const button = root().querySelector<HTMLButtonElement>(
      '[data-section="simulation"] legend [data-immersive-open]',
    )!;
    expect(button.textContent?.trim()).toBe('Mode immersif');
    button.click();
    expect(fixture.componentInstance.immersives).toBe(1);
  });

  it('bouton « Éditer le décor » (#167) : émet la demande si le décor est modifiable', async () => {
    await openPanel();
    const button = () =>
      root().querySelector<HTMLButtonElement>('[data-section="decor"] [data-decor-edit]')!;
    expect(button().textContent?.trim()).toBe('Éditer le décor');
    expect(button().getAttribute('aria-disabled')).toBe('false');
    expect(button().getAttribute('aria-label')).toBe('Éditer le décor');
    button().click();
    expect(fixture.componentInstance.edits).toBe(1);
    fixture.componentInstance.editable.set(false);
    await fixture.whenStable();
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(button().getAttribute('aria-label')).toBe('Éditer le décor (bac tropical seulement)');
    button().click();
    expect(fixture.componentInstance.edits).toBe(1);
  });

  it('bouton « Granulés » (#117) : rendu de l’hôte, émet la bascule', async () => {
    await openPanel();
    const button = () =>
      root().querySelector<HTMLButtonElement>('[data-section="decor"] button[data-food-style]')!;
    expect(button().textContent?.trim()).toBe('Granulés : points');
    expect(button().getAttribute('aria-label')).toBe('Granulés : points, changer de rendu');
    button().click();
    expect(fixture.componentInstance.foodToggles).toBe(1);
    fixture.componentInstance.foodStyle.set('voxels');
    await fixture.whenStable();
    expect(button().textContent?.trim()).toBe('Granulés : voxels');
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
        'rasbora',
        'tetra',
        'kuhli',
        'gourami',
      ]);
      expect(rows.map((r) => r.querySelector('label')?.textContent?.trim())).toEqual([
        'Néon',
        'Guppy',
        'Corydora',
        'Rasbora arlequin',
        'Tétra citron',
        'Loche kuhli',
        'Gourami nain',
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
      fixture.componentInstance.population.set({
        neon: 20,
        guppy: 6,
        corydora: 0,
        koi: 0,
        axolotl: 0,
        grenouille: 0,
        triton: 0,
        clown: 0,
        chirurgien: 0,
        rasbora: 0,
        tetra: 0,
        kuhli: 0,
        gourami: 0,
      });
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

    it('curseur (#189) : échelle de l’espèce, valeur de l’hôte, bornée à la place restante', async () => {
      await openPanel();
      const slider = (plural: string) => byLabel(`Curseur du nombre de ${plural}`)!;
      const neons = slider('néons');
      expect(neons.type).toBe('range');
      expect(neons.min).toBe('0');
      expect(neons.max).toBe('40');
      expect(neons.value).toBe('12');
      // Échelle fixe de l'espèce (`maxPopulation`), même quand l'hôte permet moins (guppys : 6).
      expect(slider('corydoras').max).toBe('16');
      expect(slider('guppys').max).toBe('20');
      neons.value = '20';
      neons.dispatchEvent(new Event('input'));
      // Guppys au maximum fourni par l'hôte (6) : le curseur est ramené et rien n'est émis.
      const guppys = slider('guppys');
      guppys.value = '15';
      guppys.dispatchEvent(new Event('input'));
      expect(guppys.value).toBe('6');
      expect(fixture.componentInstance.requests).toEqual([{ species: 'neon', count: 20 }]);
    });

    it('libellé : nom scientifique en info-bulle (#189)', async () => {
      await openPanel();
      const label = root().querySelector('[data-species="neon"] label')!;
      expect(label.getAttribute('title')).toBe('Paracheirodon innesi');
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

  describe('eau (#207)', () => {
    const section = () => root().querySelector<HTMLElement>('[data-section="eau"]')!;
    const heater = () => byLabel('Consigne du chauffage')!;

    it('« Changer l’eau » émet la demande', async () => {
      await openPanel();
      const button = section().querySelector<HTMLButtonElement>('[data-water-change]')!;
      expect(button.textContent?.trim()).toBe('Changer l’eau');
      button.click();
      button.click();
      expect(fixture.componentInstance.waterChanges).toBe(2);
    });

    it('curseur du chauffage : bornes du modèle, consigne de l’hôte, émet la consigne', async () => {
      await openPanel();
      expect(heater().min).toBe(String(MIN_HEATER_TEMPERATURE));
      expect(heater().max).toBe(String(MAX_HEATER_TEMPERATURE));
      expect(heater().step).toBe(String(HEATER_SLIDER_STEP));
      expect(heater().value).toBe('24');
      expect(section().textContent).toContain('24,0 °C');
      fixture.componentInstance.water.set({
        ...DEFAULT_WATER_READOUT,
        target: 28.5,
        temperature: 26.1,
      });
      await fixture.whenStable();
      expect(heater().value).toBe('28.5');
      expect(heater().getAttribute('aria-valuetext')).toBe('28,5 °C · eau 26,1 °C');
      heater().value = '30';
      heater().dispatchEvent(new Event('input'));
      expect(fixture.componentInstance.events).toEqual([['chauffage', 30]]);
    });

    it('ne garde que ce qui se règle : ni indicateur ni jauge, même eau mauvaise (#256)', async () => {
      await openPanel();
      fixture.componentInstance.water.set({
        ...DEFAULT_WATER_READOUT,
        quality: 'mauvaise',
        nitrate: 50,
        ph: 6,
        phZone: 'hors-plage',
      });
      await fixture.whenStable();
      // Jauges et indicateur global vivent dans le tableau de bord (ui/dashboard-frame).
      expect(section().querySelector('[data-water-quality]')).toBeNull();
      expect(section().querySelectorAll('[data-gauge], meter, [role="meter"]')).toHaveLength(0);
      expect(section().textContent).not.toContain('Mauvaise');
      expect(section().textContent).not.toContain('Nitrates');
      // Restent : le changement d'eau, le chauffage et les feuilles de catappa (#239).
      expect(section().querySelector('[data-water-change]')).not.toBeNull();
      expect(heater()).not.toBeNull();
      expect(
        [...section().querySelectorAll('button, input')].map(
          (el) => el.getAttribute('aria-label') ?? el.textContent?.trim(),
        ),
      ).toEqual([
        'Changer l’eau',
        'Consigne du chauffage',
        'Retirer une feuille de catappa',
        'Ajouter une feuille de catappa',
      ]);
    });

    it('feuilles de catappa (#239) : « + » et « − » émettent le nombre voulu, bornés à [0, 5]', async () => {
      await openPanel();
      const add = () =>
        section().querySelector<HTMLButtonElement>(
          '[aria-label="Ajouter une feuille de catappa"]',
        )!;
      const remove = () =>
        section().querySelector<HTMLButtonElement>(
          '[aria-label="Retirer une feuille de catappa"]',
        )!;
      expect(section().querySelector('[data-catappa-count]')?.textContent?.trim()).toBe('0');
      expect(remove().getAttribute('aria-disabled')).toBe('true');
      remove().click();
      add().click();
      fixture.componentInstance.water.set({ ...DEFAULT_WATER_READOUT, catappa: 5, tea: 1 });
      await fixture.whenStable();
      expect(section().querySelector('[data-catappa-count]')?.textContent?.trim()).toBe('5');
      expect(add().getAttribute('aria-disabled')).toBe('true');
      add().click();
      remove().click();
      expect(fixture.componentInstance.events.filter(([kind]) => kind === 'catappa')).toEqual([
        ['catappa', 1],
        ['catappa', 4],
      ]);
      expect(section().querySelector('[data-catappa-note]')?.textContent).toContain(
        'ne remplace pas un test de pH',
      );
    });
  });

  describe('sauvegarde (#70)', () => {
    const section = () => root().querySelector<HTMLElement>('[data-section="sauvegarde"]')!;
    const button = (text: string) =>
      [...section().querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === text,
      )!;
    const fileInput = () => section().querySelector<HTMLInputElement>('input[type="file"]')!;

    /** Simule le choix d'un fichier dans le champ masqué. */
    async function choose(file: File): Promise<void> {
      Object.defineProperty(fileInput(), 'files', { configurable: true, value: [file] });
      fileInput().dispatchEvent(new Event('change'));
      // Lecture asynchrone du fichier.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await fixture.whenStable();
    }

    it('affiche l’état de la sauvegarde automatique fourni par l’hôte', async () => {
      await openPanel();
      expect(section().querySelector('[data-save-status]')?.textContent).toMatch(
        /Enregistré automatiquement/,
      );
      fixture.componentInstance.saveStatus.set('plein');
      await fixture.whenStable();
      expect(section().querySelector('[data-save-status]')?.textContent).toMatch(/plein/);
    });

    it('boutons « Exporter » et « Importer » nommés ; « Exporter » émet une demande', async () => {
      await openPanel();
      expect(button('Exporter').type).toBe('button');
      expect(button('Importer').type).toBe('button');
      button('Exporter').click();
      expect(fixture.componentInstance.exports).toBe(1);
    });

    it('« Importer » ouvre le choix de fichier (champ JSON masqué)', async () => {
      await openPanel();
      const click = vi.spyOn(fileInput(), 'click').mockImplementation(() => undefined);
      button('Importer').click();
      expect(click).toHaveBeenCalledOnce();
      expect(fileInput().accept).toContain('.json');
    });

    it('transmet le texte du fichier choisi à l’hôte', async () => {
      await openPanel();
      await choose(new File(['{"format":"aqfish"}'], 'bac.json', { type: 'application/json' }));
      expect(fixture.componentInstance.imports).toEqual(['{"format":"aqfish"}']);
      expect(fixture.componentInstance.rejections).toEqual([]);
    });

    it('refuse un fichier trop volumineux sans le lire', async () => {
      await openPanel();
      const big = new File(['x'.repeat(MAX_SAVE_LENGTH + 1)], 'gros.json');
      const text = vi.spyOn(big, 'text');
      await choose(big);
      expect(text).not.toHaveBeenCalled();
      expect(fixture.componentInstance.imports).toEqual([]);
      expect(fixture.componentInstance.rejections[0]).toMatch(/trop volumineux/);
    });

    it('signale un fichier illisible', async () => {
      await openPanel();
      const broken = new File(['x'], 'casse.json');
      vi.spyOn(broken, 'text').mockRejectedValue(new Error('lecture'));
      await choose(broken);
      expect(fixture.componentInstance.rejections).toEqual(['fichier illisible']);
    });

    it('affiche le message de l’hôte : erreur en alerte, information en statut', async () => {
      await openPanel();
      expect(section().querySelector('[data-save-message]')).toBeNull();
      fixture.componentInstance.saveMessage.set({ kind: 'erreur', text: 'Import refusé : x.' });
      await fixture.whenStable();
      const message = section().querySelector<HTMLElement>('[data-save-message]')!;
      expect(message.getAttribute('role')).toBe('alert');
      expect(message.textContent?.trim()).toBe('Import refusé : x.');
      fixture.componentInstance.saveMessage.set({ kind: 'info', text: 'Aquarium importé.' });
      await fixture.whenStable();
      expect(section().querySelector('[data-save-message]')?.getAttribute('role')).toBe('status');
    });
  });
});

describe('ControlPanel : exclusif avec « Commandes » sur petit écran (#136)', () => {
  let fixture: ComponentFixture<ControlPanel>;
  const toggle = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.control-panel__toggle',
    )!;
  const section = () => (fixture.nativeElement as HTMLElement).querySelector('section');

  beforeEach(async () => {
    fixture = TestBed.createComponent(ControlPanel);
    await fixture.whenStable();
  });

  it('déplié au bouton : émet `opened` ; replié : rien', async () => {
    let opened = 0;
    fixture.componentInstance.opened.subscribe(() => opened++);
    toggle().click();
    await fixture.whenStable();
    expect(section()).not.toBeNull();
    expect(opened).toBe(1);
    toggle().click();
    await fixture.whenStable();
    expect(section()).toBeNull();
    expect(opened).toBe(1);
  });

  it('`close()` replie sans émettre, et reste sans effet si déjà replié', async () => {
    let opened = 0;
    fixture.componentInstance.opened.subscribe(() => opened++);
    toggle().click();
    await fixture.whenStable();
    fixture.componentInstance.close();
    await fixture.whenStable();
    expect(section()).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    fixture.componentInstance.close();
    expect(fixture.componentInstance.open()).toBe(false);
    expect(opened).toBe(1);
  });
});
