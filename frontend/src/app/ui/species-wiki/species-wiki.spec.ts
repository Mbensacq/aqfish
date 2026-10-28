import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { NO_FISH, type PopulationCounts } from '../../sim/population';
import type { PopulationRequest } from '../control-panel/control-panel';
import { SpeciesWiki, wikiAddCount } from './species-wiki';

const counts = (values: Partial<Record<keyof PopulationCounts, number>>): PopulationCounts => ({
  ...NO_FISH,
  ...values,
});

describe('wikiAddCount (#287)', () => {
  it('un individu de plus, ou null si le bac est plein pour l’espèce', () => {
    const max = counts({ guppy: 2, neon: 0 });
    expect(wikiAddCount('guppy', counts({}), max)).toBe(1);
    expect(wikiAddCount('guppy', counts({ guppy: 1 }), max)).toBe(2);
    expect(wikiAddCount('guppy', counts({ guppy: 2 }), max)).toBeNull();
    expect(wikiAddCount('neon', counts({}), max)).toBeNull();
  });
});

describe('SpeciesWiki (#287)', () => {
  let fixture: ComponentFixture<SpeciesWiki>;
  let requests: PopulationRequest[];
  let opened: number;

  const root = () => fixture.nativeElement as HTMLElement;
  const toggle = () => root().querySelector<HTMLButtonElement>('[data-wiki-toggle]')!;
  const panel = () => root().querySelector<HTMLElement>('#wiki-especes');
  const names = (list: string) =>
    [...root().querySelectorAll(`[data-wiki-list="${list}"] [data-wiki-species]`)].map((b) =>
      b.getAttribute('data-wiki-species'),
    );
  const item = (id: string) =>
    root().querySelector<HTMLButtonElement>(`[data-wiki-species="${id}"]`)!;
  const sheet = () => root().querySelector<HTMLElement>('[data-wiki-sheet]');
  const button = (text: string) =>
    [...root().querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === text,
    )!;
  const escape = (target: HTMLElement) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  async function search(text: string): Promise<void> {
    const field = root().querySelector<HTMLInputElement>('input[type="search"]')!;
    field.value = text;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function openWiki(): Promise<void> {
    toggle().click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(SpeciesWiki);
    requests = [];
    opened = 0;
    fixture.componentInstance.populationChanged.subscribe((r) => requests.push(r));
    fixture.componentInstance.opened.subscribe(() => opened++);
    fixture.componentRef.setInput('environment', 'tropical');
    fixture.componentRef.setInput('population', counts({ neon: 12, corydora: 4 }));
    fixture.componentRef.setInput('populationMax', counts({ neon: 30, guppy: 20, corydora: 10 }));
    fixture.componentRef.setInput('tankLiters', 120);
    await fixture.whenStable();
  });

  it('replié par défaut ; le bouton ouvre et referme, « opened » à l’ouverture seulement', async () => {
    expect(panel()).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-label')).toBe('Wiki des espèces');
    await openWiki();
    expect(panel()).not.toBeNull();
    expect(panel()!.getAttribute('aria-labelledby')).toBe('wiki-especes-titre');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(opened).toBe(1);
    await openWiki();
    expect(panel()).toBeNull();
    expect(opened).toBe(1);
  });

  it('liste en deux parties : dans le bac avec effectif, puis ajoutables ici', async () => {
    await openWiki();
    expect(names('present')).toEqual(['neon', 'corydora']);
    expect(item('neon').textContent).toContain('12');
    expect(names('addable')).toEqual(['guppy']);
  });

  it('recherche sans casse ni accents ; aucun résultat : « Aucune espèce »', async () => {
    await openWiki();
    await search('NÉON');
    expect(names('present')).toEqual(['neon']);
    expect(names('addable')).toEqual([]);
    await search('poecilia');
    expect(names('addable')).toEqual(['guppy']);
    await search('requin');
    expect(root().querySelectorAll('.species-wiki__empty').length).toBe(2);
  });

  it('fiche : chaque champ avec son statut ; « Retour à la liste » rend le focus à l’espèce', async () => {
    await openWiki();
    item('neon').click();
    await fixture.whenStable();
    expect(sheet()?.getAttribute('data-wiki-sheet')).toBe('neon');
    expect(sheet()!.querySelectorAll('[data-wiki-field]').length).toBe(11);
    expect(sheet()!.querySelector('[data-wiki-status]')?.textContent?.trim()).toBe(
      'Approximation de jeu',
    );
    // Espèce présente : pas de bouton d'ajout.
    expect(button('Ajouter au bac')).toBeUndefined();
    button('Retour à la liste').click();
    await fixture.whenStable();
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(item('neon'));
  });

  it('« Ajouter au bac » : un individu, puis l’avertissement d’ajout du bac courant', async () => {
    document.body.appendChild(root());
    await openWiki();
    item('guppy').click();
    await fixture.whenStable();
    button('Ajouter au bac').click();
    expect(requests).toEqual([{ species: 'guppy', count: 1 }]);
    fixture.componentRef.setInput('population', counts({ neon: 12, corydora: 4, guppy: 1 }));
    await fixture.whenStable();
    expect(
      [...root().querySelectorAll('[data-wiki-add-warning]')].map((p) => p.textContent?.trim()),
    ).toEqual(['Groupe trop petit : 1 guppy, 3 au moins conseillés']);
    root().remove();
  });

  it('bac plein pour l’espèce : « Ajouter au bac » désactivé, sans effet', async () => {
    fixture.componentRef.setInput('populationMax', counts({ neon: 30, guppy: 0, corydora: 10 }));
    await openWiki();
    item('guppy').click();
    await fixture.whenStable();
    const add = button('Ajouter au bac');
    expect(add.getAttribute('aria-disabled')).toBe('true');
    add.click();
    expect(requests).toEqual([]);
  });

  it('Échap : ferme la fiche, puis le wiki, et rend le focus au bouton', async () => {
    document.body.appendChild(root());
    await openWiki();
    item('corydora').click();
    await fixture.whenStable();
    escape(button('Retour à la liste'));
    await fixture.whenStable();
    expect(sheet()).toBeNull();
    expect(panel()).not.toBeNull();
    escape(item('corydora'));
    await fixture.whenStable();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(toggle());
    root().remove();
  });

  it('Échap hors du wiki (focus sur la page, #289) : ferme la fiche, puis le wiki', async () => {
    document.body.appendChild(root());
    await openWiki();
    item('corydora').click();
    await fixture.whenStable();
    (document.activeElement as HTMLElement | null)?.blur();
    escape(document.body);
    await fixture.whenStable();
    expect(sheet()).toBeNull();
    expect(panel()).not.toBeNull();
    (document.activeElement as HTMLElement | null)?.blur();
    escape(document.body);
    await fixture.whenStable();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(toggle());
    root().remove();
  });

  it('Échap déjà traité ailleurs, ou wiki fermé : sans effet', async () => {
    document.body.appendChild(root());
    const handled = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    escape(document.body);
    await fixture.whenStable();
    expect(panel()).toBeNull();
    await openWiki();
    document.body.dispatchEvent(handled);
    await fixture.whenStable();
    expect(panel()).not.toBeNull();
    root().remove();
  });

  it('fermer oublie la recherche et la fiche ; un autre environnement referme la fiche', async () => {
    await openWiki();
    await search('cory');
    item('corydora').click();
    await fixture.whenStable();
    fixture.componentRef.setInput('environment', 'eaufroide');
    fixture.componentRef.setInput('population', counts({ axolotl: 1 }));
    await fixture.whenStable();
    expect(sheet()).toBeNull();
    fixture.componentInstance.close();
    await fixture.whenStable();
    await openWiki();
    expect((root().querySelector('input[type="search"]') as HTMLInputElement).value).toBe('');
    expect(names('present')).toEqual(['axolotl']);
    expect(names('addable')).toEqual([]);
  });
});

describe('SpeciesWiki, lot 2/2 (#291)', () => {
  let fixture: ComponentFixture<SpeciesWiki>;
  const root = () => fixture.nativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector<HTMLElement>(selector);
  const all = (selector: string) => [...root().querySelectorAll<HTMLElement>(selector)];

  async function click(selector: string): Promise<void> {
    q(selector)!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(SpeciesWiki);
    fixture.componentRef.setInput('environment', 'tropical');
    fixture.componentRef.setInput('population', counts({ neon: 12 }));
    fixture.componentRef.setInput('populationMax', counts({ neon: 30, guppy: 20, corydora: 10 }));
    fixture.componentRef.setInput('waterTemperature', 24);
    fixture.componentRef.setInput('waterPh', 7);
    await fixture.whenStable();
    await click('[data-wiki-toggle]');
  });

  it('fiche : comparaison avec le bac, alimentation, cohabitation', async () => {
    await click('[data-wiki-species="neon"]');
    expect(all('[data-wiki-compare]').map((r) => r.getAttribute('data-fit'))).toEqual([
      'dans-la-plage',
      'dans-la-plage',
    ]);
    expect(q('[data-wiki-compare="temperature"]')!.textContent).toContain('Bac : 24 °C');
    expect(all('[data-wiki-feeding]')).toHaveLength(4);
    expect(all('[data-wiki-mate="avoid"]').map((m) => m.getAttribute('data-species'))).toEqual([
      'koi',
      'axolotl',
    ]);
    expect(all('[data-wiki-mate="together"]')).toHaveLength(2);
    expect(all('[data-wiki-mate="elsewhere"]')).toHaveLength(1);

    // L'eau du bac change : la comparaison suit.
    fixture.componentRef.setInput('waterTemperature', 30);
    await fixture.whenStable();
    expect(q('[data-wiki-compare="temperature"]')!.getAttribute('data-fit')).toBe('hors-plage');
    expect(q('[data-wiki-compare="temperature"]')!.textContent).toContain(
      '5 °C au-dessus de la plage préférée',
    );
  });

  it('pages « Produits et traitements » et « Maladies » : ouvrir, retour, Échap', async () => {
    expect(all('[data-wiki-page]').map((b) => b.textContent?.trim())).toEqual([
      'Produits et traitements',
      'Maladies',
    ]);
    await click('[data-wiki-page="maladies"]');
    expect(q('[data-wiki-page-view]')!.getAttribute('data-wiki-page-view')).toBe('maladies');
    expect(q('[data-wiki-page-view]')!.textContent).toContain('pas un avis vétérinaire');
    expect(all('[data-wiki-entry]').length).toBeGreaterThanOrEqual(8);
    expect(all('[data-wiki-entry] [data-wiki-status]').length).toBe(
      all('[data-wiki-entry]').length,
    );
    await click('[data-wiki-back]');
    expect(q('[data-wiki-page-view]')).toBeNull();
    expect(q('input[type="search"]')).not.toBeNull();

    await click('[data-wiki-page="produits"]');
    expect(q('[data-wiki-entry="charbon"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(q('[data-wiki-page-view]')).toBeNull();
    expect(q('#wiki-especes')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(q('#wiki-especes')).toBeNull();
  });

  it('fermer puis rouvrir : la liste, pas la page', async () => {
    await click('[data-wiki-page="produits"]');
    await click('[data-wiki-toggle]');
    await click('[data-wiki-toggle]');
    expect(q('[data-wiki-page-view]')).toBeNull();
    expect(q('[data-wiki-list="present"]')).not.toBeNull();
  });
});
