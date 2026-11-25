import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { CareMode } from '../../sim/care-mode';
import { environmentById } from '../../sim/environment';
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import { possibleSpecies, type PossibleSpecies } from '../../sim/possible-species';
import type { SpeciesId } from '../../sim/species';
import { NO_CAPACITY, type CapacityShown } from '../../sim/capacity-shown';
import type { PopulationEntry } from '../../sim/world-types';
import { PopulationSection } from './population-section';
import { PossibleSpeciesList } from './possible-species-list';

const BOUNDS: PopulationCounts = Object.fromEntries(
  Object.keys(NO_FISH).map((id) => [id, 20]),
) as unknown as PopulationCounts; // Toutes les espèces de `NO_FISH`, borne commune.

function possibleIn(population: PopulationEntry[]): readonly PossibleSpecies[] {
  return possibleSpecies({
    liters: 300,
    population,
    species: environmentById('tropical').species,
    bounds: BOUNDS,
  });
}

@Component({
  imports: [PossibleSpeciesList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-possible-species-list [entries]="entries()" [careMode]="mode()" />`,
})
class ListHost {
  readonly entries = signal<readonly PossibleSpecies[]>(possibleIn([]));
  readonly mode = signal<CareMode>('soins');
}

describe('liste des espèces encore possibles (#818)', () => {
  let fixture: ComponentFixture<ListHost>;
  const root = () => fixture.nativeElement as HTMLElement;
  const toggle = () => root().querySelector<HTMLButtonElement>('[data-possible-toggle]');
  const item = (id: SpeciesId) =>
    root().querySelector<HTMLElement>(`[data-possible-species="${id}"]`);

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [ListHost] });
    fixture = TestBed.createComponent(ListHost);
    await fixture.whenStable();
  });

  it('fermée au départ : un bouton disclosure qui compte les espèces possibles', () => {
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle()?.textContent?.trim()).toBe('Espèces encore possibles (17 sur 17)');
    expect(root().querySelector('[data-possible-list]')).toBeNull();
  });

  it('ouverte : un cartel par espèce, nom en gras, nom scientifique en italique', async () => {
    toggle()!.click();
    await fixture.whenStable();

    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');
    expect(root().querySelectorAll('[data-possible-species]')).toHaveLength(17);
    expect(item('neon')?.querySelector('b')?.textContent).toBe('Néon');
    expect(item('neon')?.querySelector('i')?.textContent).toBe('Paracheirodon innesi');
    expect(item('neon')?.textContent).toContain('Compatible · encore');
  });

  it('un prédateur présent : la proie passe en précautions, raison et source visibles', async () => {
    fixture.componentInstance.entries.set(possibleIn([{ species: 'xipho', count: 1 }]));
    toggle()!.click();
    await fixture.whenStable();

    expect(item('cerise')?.getAttribute('data-possible-level')).toBe('precautions');
    expect(item('cerise')?.querySelector('[data-possible-reason]')?.textContent).toBe(
      'Avec les xiphos : xipho mange les jeunes (précautions) — FishKeeper',
    );
    expect(toggle()?.textContent).toContain('sur 17');
  });

  it('deux instances : chaque bouton vise sa propre liste par un id unique (#820)', async () => {
    const other = TestBed.createComponent(ListHost);
    await other.whenStable();
    const roots = [root(), other.nativeElement as HTMLElement];
    for (const el of roots) {
      el.querySelector<HTMLButtonElement>('[data-possible-toggle]')!.click();
    }
    await fixture.whenStable();
    await other.whenStable();

    const ids = roots.map((el) => el.querySelector('[data-possible-list]')?.id ?? '');
    expect(ids[0]).toMatch(/^especes-possibles-\d+$/);
    expect(ids[1]).not.toBe(ids[0]);
    roots.forEach((el, i) => {
      const button = el.querySelector('[data-possible-toggle]');
      expect(button?.getAttribute('aria-controls')).toBe(ids[i]);
    });
  });

  it('mode décor ou liste vide : rien n’est affiché', async () => {
    fixture.componentInstance.mode.set('decor');
    await fixture.whenStable();
    expect(toggle()).toBeNull();

    fixture.componentInstance.mode.set('soins');
    fixture.componentInstance.entries.set([]);
    await fixture.whenStable();
    expect(toggle()).toBeNull();
  });
});

@Component({
  imports: [PopulationSection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<fieldset
    app-population-section
    [population]="population()"
    [populationMax]="max"
    [capacity]="capacity()"
  ></fieldset>`,
})
class SectionHost {
  readonly population = signal<PopulationCounts>({ ...NO_FISH, cerise: 6 });
  readonly capacity = signal<CapacityShown>(NO_CAPACITY);
  readonly max = BOUNDS;
}

describe('avertissement d’ajout fondé sur le verdict (#818)', () => {
  let fixture: ComponentFixture<SectionHost>;
  const root = () => fixture.nativeElement as HTMLElement;
  const verdicts = () =>
    [...root().querySelectorAll('[data-add-verdict]')].map((p) => p.textContent?.trim());

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [SectionHost] });
    fixture = TestBed.createComponent(SectionHost);
    await fixture.whenStable();
  });

  it('xipho ajouté à des crevettes cerises : raison sourcée sous sa ligne, qui suit la population', async () => {
    root().querySelector<HTMLButtonElement>('[aria-label="Ajouter un xipho"]')!.click();
    const population: PopulationEntry[] = [
      { species: 'cerise', count: 6 },
      { species: 'xipho', count: 1 },
    ];
    fixture.componentInstance.population.set({ ...NO_FISH, cerise: 6, xipho: 1 });
    fixture.componentInstance.capacity.set({ ...NO_CAPACITY, possible: possibleIn(population) });
    await fixture.whenStable();

    expect(verdicts()).toEqual([
      'Avec les crevettes cerises : xipho mange les jeunes (précautions) — FishKeeper',
    ]);

    fixture.componentInstance.population.set({ ...NO_FISH, xipho: 1 });
    fixture.componentInstance.capacity.set({
      ...NO_CAPACITY,
      possible: possibleIn([{ species: 'xipho', count: 1 }]),
    });
    await fixture.whenStable();
    expect(verdicts()).toEqual([]);
  });

  it('sans capacité relevée (avant le démarrage) : aucune ligne de verdict', async () => {
    root().querySelector<HTMLButtonElement>('[aria-label="Ajouter un xipho"]')!.click();
    await fixture.whenStable();

    expect(verdicts()).toEqual([]);
  });
});
