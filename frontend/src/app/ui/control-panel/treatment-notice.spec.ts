import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { GuidePage } from '../../sim/care-guide';
import { doseBacteriaStarterInPlace } from '../../sim/bacteria-starter';
import type { MutableWaterState } from '../../sim/water';
import { TreatmentNotice } from './treatment-notice';

describe('TreatmentNotice : lien « Produits et traitements » (#554)', () => {
  let fixture: ComponentFixture<TreatmentNotice>;
  let pages: GuidePage[];

  const root = () => fixture.nativeElement as HTMLElement;
  const link = () => root().querySelector<HTMLButtonElement>('[data-products-link]');

  async function show(text: string, warning: string | null = null): Promise<void> {
    fixture.componentRef.setInput('notice', { ok: true, text, warning });
    await fixture.whenStable();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(TreatmentNotice);
    pages = [];
    fixture.componentInstance.wikiPageRequested.subscribe((page) => pages.push(page));
  });

  it('message de l’amorce : le titre est un bouton qui ouvre la page « produits »', async () => {
    const text = 'Amorce versée (voir la page « Produits et traitements » du wiki).';
    await show(text);
    expect(link()).not.toBeNull();
    expect(link()!.type).toBe('button');
    expect(link()!.textContent?.trim()).toBe('Produits et traitements');
    // Le texte lu est inchangé : guillemets et suite du message autour du lien.
    expect(root().textContent?.replace(/\s+/g, ' ').trim()).toBe(text);
    link()!.click();
    expect(pages).toEqual(['produits']);
  });

  it('vrai message de l’amorce (filtre déjà mûr) : lien présent', async () => {
    const water = { filter: 1 } as MutableWaterState;
    const outcome = doseBacteriaStarterInPlace(water, 1);
    expect(outcome.ok).toBe(false);
    await show(outcome.message);
    expect(link()).not.toBeNull();
    link()!.click();
    expect(pages).toEqual(['produits']);
  });

  it('message sans renvoi au wiki : pas de lien, texte tel quel', async () => {
    await show('Sel : 1,0 g/L.', 'Prudence : néons.');
    expect(link()).toBeNull();
    expect(root().textContent).toContain('Sel : 1,0 g/L.');
    expect(root().querySelector('[data-treatment-warning]')?.textContent?.trim()).toBe(
      'Prudence : néons.',
    );
    expect(pages).toEqual([]);
  });

  it('titre cité sans guillemets : pas de lien', async () => {
    await show('Voir Produits et traitements.');
    expect(link()).toBeNull();
  });

  it('renvoi en fin de message et mise en garde : lien et mise en garde', async () => {
    await show('Refusé ; voir la page « Produits et traitements »', 'Attention.');
    expect(link()).not.toBeNull();
    expect(root().textContent).toContain('»');
    expect(root().querySelector('[data-treatment-warning]')).not.toBeNull();
  });
});
