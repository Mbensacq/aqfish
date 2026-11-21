import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { EnvironmentId } from '../../sim/environment';
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import type { SpeciesId } from '../../sim/species';
import { PopulationSection, type PopulationRequest } from './population-section';

const MAX: PopulationCounts = Object.fromEntries(
  Object.keys(NO_FISH).map((id) => [id, 20]),
) as unknown as PopulationCounts; // Toutes les espèces de `NO_FISH`, maximum commun.

@Component({
  imports: [PopulationSection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<fieldset
    app-population-section
    [environment]="environment()"
    [population]="population()"
    [populationMax]="max"
    [onlySpecies]="only()"
    (populationChanged)="requests.push($event)"
  ></fieldset>`,
})
class Host {
  readonly environment = signal<EnvironmentId>('tropical');
  readonly population = signal<PopulationCounts>({ ...NO_FISH, neon: 12, guppy: 6, corydora: 6 });
  readonly only = signal<readonly SpeciesId[] | null>(null);
  readonly max = MAX;
  readonly requests: PopulationRequest[] = [];
}

describe('section « Population » : tuiles, filtres et tri (#723)', () => {
  let fixture: ComponentFixture<Host>;
  const root = () => fixture.nativeElement as HTMLElement;
  const tiles = () =>
    [...root().querySelectorAll('[data-species]')].map((tile) => tile.getAttribute('data-species'));
  const filter = (id: string) =>
    root().querySelector<HTMLButtonElement>(`[data-population-filter="${id}"]`)!;
  const sort = () => root().querySelector<HTMLSelectElement>('[data-population-sort]')!;

  async function chooseSort(value: string): Promise<void> {
    sort().value = value;
    sort().dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('une tuile par espèce du milieu : nom, nom scientifique en italique, compteur, « Fiche »', () => {
    expect(tiles()).toHaveLength(17);
    const neon = root().querySelector('[data-species="neon"]')!;
    expect(neon.classList).toContain('population__tile');
    expect(neon.querySelector('label')?.textContent?.trim()).toBe('Néon');
    expect(neon.querySelector('i')?.textContent?.trim()).toBe('Paracheirodon innesi');
    expect(neon.querySelector('input[type="number"]')).not.toBeNull();
    expect(neon.querySelector('[data-sheet-toggle="neon"]')?.textContent?.trim()).toBe('Fiche');
  });

  it('résumé « 24 animaux, 3 espèces », suivi des effectifs', async () => {
    const summary = () => root().querySelector('[data-population-summary]')?.textContent?.trim();
    expect(summary()).toBe('24 animaux, 3 espèces');
    fixture.componentInstance.population.set({ ...NO_FISH, neon: 1 });
    await fixture.whenStable();
    expect(summary()).toBe('1 animal, 1 espèce');
  });

  it('filtres accolés : « Toutes » choisi au départ, un seul choisi à la fois', async () => {
    const pressed = () =>
      [...root().querySelectorAll('[data-population-filter]')]
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
        .map((button) => button.getAttribute('data-population-filter'));
    expect(root().querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Filtrer les espèces',
    );
    expect(pressed()).toEqual(['toutes']);
    filter('bac').click();
    await fixture.whenStable();
    expect(pressed()).toEqual(['bac']);
    expect(tiles()).toEqual(['neon', 'guppy', 'corydora']);
  });

  it('« Invertébrés » puis « Poissons » ; « Dans le bac » d’un bac vide : un message', async () => {
    filter('invertebres').click();
    await fixture.whenStable();
    expect(tiles()).toEqual(['cerise', 'neritine']);
    filter('poissons').click();
    await fixture.whenStable();
    expect(tiles()).toHaveLength(15);
    fixture.componentInstance.population.set(NO_FISH);
    filter('bac').click();
    await fixture.whenStable();
    expect(tiles()).toEqual([]);
    expect(root().querySelector('[data-population-none]')?.getAttribute('role')).toBe('status');
    expect(root().querySelector('[data-population-empty]')).toBeNull();
  });

  it('tri : ordre du milieu au départ, puis nom, nombre et taille adulte', async () => {
    expect(sort().value).toBe('milieu');
    expect(tiles().slice(0, 3)).toEqual(['neon', 'guppy', 'corydora']);
    await chooseSort('nom');
    expect(tiles()[0]).toBe('ancistrus');
    await chooseSort('nombre');
    expect(tiles().slice(0, 3)).toEqual(['neon', 'guppy', 'corydora']);
    await chooseSort('taille');
    expect(tiles().slice(0, 2)).toEqual(['molly', 'xipho']);
    await chooseSort('inconnu');
    expect(tiles().slice(0, 2)).toEqual(['molly', 'xipho']);
  });

  it('ajouter et retirer depuis une tuile, filtre et tri appliqués', async () => {
    filter('bac').click();
    await chooseSort('nom');
    const tile = root().querySelector('[data-species="guppy"]')!;
    tile.querySelector<HTMLButtonElement>('button[aria-label="Ajouter un guppy"]')!.click();
    tile.querySelector<HTMLButtonElement>('button[aria-label="Retirer un guppy"]')!.click();
    expect(fixture.componentInstance.requests).toEqual([
      { species: 'guppy', count: 7 },
      { species: 'guppy', count: 5 },
    ]);
  });

  it('recherche de la fenêtre : seules les espèces trouvées, quel que soit le filtre', async () => {
    filter('invertebres').click();
    fixture.componentInstance.only.set(['neon']);
    await fixture.whenStable();
    expect(tiles()).toEqual(['neon']);
    fixture.componentInstance.only.set(null);
    await fixture.whenStable();
    expect(tiles()).toEqual(['cerise', 'neritine']);
  });

  it('les fiches restent sous leur tuile, sur toute la largeur', async () => {
    root().querySelector<HTMLButtonElement>('[data-sheet-toggle="guppy"]')!.click();
    await fixture.whenStable();
    const sheet = root().querySelector('app-species-sheet')!;
    expect(sheet.classList).toContain('population__wide');
    expect(sheet.previousElementSibling?.getAttribute('data-species')).toBe('guppy');
  });
});
