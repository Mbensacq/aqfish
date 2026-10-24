import type { FoodStyle } from '../../core/food-style/food-style';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { EnvironmentId } from '../../sim/environment';
import type { PopulationCounts } from '../../sim/population';
import type { SaveMessage, SaveStatus } from '../../core/save-storage/save-storage';
import { MAX_SAVE_LENGTH } from '../../sim/save';
import { SIM_SPEEDS } from '../../sim/sim-speed';
import {
  CONTROL_PANEL_ID,
  ControlPanel,
  populationInput,
  type PopulationRequest,
  saveStatusText,
  sliderHour,
  speciesCountLabel,
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
    [decorEditable]="editable()"
    [foodStyle]="foodStyle()"
    [population]="population()"
    [populationMax]="populationMax()"
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
    (environmentChanged)="environments.push($event)"
    (foodStyleToggled)="foodToggles = foodToggles + 1"
    (editRequested)="edits = edits + 1"
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
  readonly foodStyle = signal<FoodStyle>('points');
  foodToggles = 0;
  readonly editable = signal(true);
  edits = 0;
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
  });
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
    expect(byLabel('Nombre de grenouilles')?.value).toBe('0');
    expect(byLabel('Nombre de tritons')?.value).toBe('0');
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

  it('sections extensibles : environnement, simulation, journée, décor, population, sauvegarde, chacune avec sa légende', async () => {
    await openPanel();
    const sections = [...root().querySelectorAll('fieldset')];
    expect(sections.map((s) => s.getAttribute('data-section'))).toEqual([
      'environnement',
      'simulation',
      'journee',
      'decor',
      'population',
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
      'Décor',
      'Population',
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
    // pièce » (#187), puis « − », champ et « + » pour chacune des 3 espèces (#69), puis
    // « Exporter » et « Importer » (#70).
    expect(controls).toHaveLength(5 + 1 + 1 + 1 + 3 * 3 + 2);
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
