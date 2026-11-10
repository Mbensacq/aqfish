import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { GuidePage } from '../../sim/care-guide';
import { EMPTY_HEALTH_SUMMARY } from '../../sim/health-summary';
import { DEFAULT_WATER_SAMPLE } from '../../sim/water-dashboard';
import { Pharmacy } from './pharmacy';

describe('Pharmacy (#533)', () => {
  let fixture: ComponentFixture<Pharmacy>;
  let opened: number;
  let pages: GuidePage[];

  const root = () => fixture.nativeElement as HTMLElement;
  const toggle = () => root().querySelector<HTMLButtonElement>('[data-pharmacy-toggle]')!;
  const panel = () => root().querySelector<HTMLElement>('#pharmacie-bac');
  const advice = () => root().querySelector<HTMLElement>('[data-pharmacy-advice]')!;
  const status = (product: string) =>
    root().querySelector(`[data-pharmacy-product="${product}"]`)?.getAttribute('data-status');
  const key = (target: HTMLElement, name: string, shiftKey = false) => {
    const event = new KeyboardEvent('keydown', {
      key: name,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  };

  async function openPharmacy(): Promise<void> {
    toggle().click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(Pharmacy);
    opened = 0;
    pages = [];
    fixture.componentInstance.opened.subscribe(() => opened++);
    fixture.componentInstance.wikiPageRequested.subscribe((page) => pages.push(page));
    document.body.appendChild(root());
    await fixture.whenStable();
  });

  afterEach(() => root().remove());

  it('fermée par défaut : seul le bouton est affiché', () => {
    expect(toggle().textContent?.trim()).toBe('Pharmacie');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();
  });

  it('s’ouvre en dialogue, focus sur son titre, et signale l’ouverture', async () => {
    await openPharmacy();
    expect(opened).toBe(1);
    expect(panel()?.getAttribute('role')).toBe('dialog');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.id).toBe('pharmacie-bac-titre');
  });

  it('sans alerte : aucun produit conseillé, tous disponibles', async () => {
    await openPharmacy();
    expect(advice().textContent).toContain('Aucune alerte');
    expect(root().querySelectorAll('[data-status="disponible"]')).toHaveLength(7);
  });

  it('chlore : conseille le conditionneur', async () => {
    fixture.componentRef.setInput('sample', { ...DEFAULT_WATER_SAMPLE, chlorine: 0.5 });
    await openPharmacy();
    expect(advice().getAttribute('data-product')).toBe('conditionneur');
    expect(advice().textContent).toContain('Chlore dans l’eau');
    expect(
      root().querySelector('.pharmacy__item--advised')?.getAttribute('data-pharmacy-product'),
    ).toBe('conditionneur');
  });

  it('points blancs, médicament déjà versé : « en cours », produit fini « terminé »', async () => {
    fixture.componentRef.setInput('health', {
      ...EMPTY_HEALTH_SUMMARY,
      sick: 1,
      diseased: 1,
      ich: 1,
    });
    fixture.componentRef.setInput('products', {
      active: ['medicament'],
      used: ['amorce', 'medicament'],
      filterMature: true,
    });
    await openPharmacy();
    expect(advice().getAttribute('data-product')).toBe('medicament');
    expect(advice().textContent).toContain('(en cours)');
    expect(status('medicament')).toBe('en-cours');
    expect(status('amorce')).toBe('termine');
    expect(status('sel')).toBe('disponible');
  });

  it('effets secondaires (#549) : sous le sel et le médicament seulement', async () => {
    await openPharmacy();
    const warned = [...root().querySelectorAll('[data-pharmacy-warning]')].map((el) =>
      el.closest('[data-pharmacy-product]')?.getAttribute('data-pharmacy-product'),
    );
    expect(warned).toEqual(['medicament', 'sel']);
    const salt = root().querySelector('[data-pharmacy-product="sel"] [data-pharmacy-warning]');
    expect(salt?.textContent).toContain('Plantes : pousse ralentie');
    // Sans alerte, pas d'avertissement sous le conseil.
    expect(root().querySelector('[data-pharmacy-advice-warning]')).toBeNull();
  });

  it('points blancs : avertissement du médicament sous le conseil, qui décrit le panneau', async () => {
    fixture.componentRef.setInput('health', {
      ...EMPTY_HEALTH_SUMMARY,
      sick: 1,
      diseased: 1,
      ich: 1,
    });
    await openPharmacy();
    expect(advice().getAttribute('data-product')).toBe('medicament');
    const warning = root().querySelector('[data-pharmacy-advice-warning]');
    expect(warning?.textContent).toContain('Filtre : un filtre jeune mûrit 25 % moins vite');
    expect(warning?.textContent).toContain('Invertébrés');
    expect(panel()?.getAttribute('aria-describedby')).toBe(advice().id);
  });

  it('conseil sans effet secondaire (conditionneur) : aucun avertissement', async () => {
    fixture.componentRef.setInput('sample', { ...DEFAULT_WATER_SAMPLE, chlorine: 0.5 });
    await openPharmacy();
    expect(root().querySelector('[data-pharmacy-advice-warning]')).toBeNull();
  });

  it('Tab et Maj+Tab tournent en boucle dans le panneau', async () => {
    await openPharmacy();
    const buttons = [...panel()!.querySelectorAll<HTMLButtonElement>('button')];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    expect(key(last, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(key(first, 'Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    // Au milieu : le navigateur avance seul.
    first.focus();
    expect(key(first, 'Tab').defaultPrevented).toBe(false);
    expect(key(first, 'a').defaultPrevented).toBe(false);
  });

  it('Échap ferme et rend le focus au bouton ; sans effet fermée', async () => {
    await openPharmacy();
    key(panel()!, 'Escape');
    await fixture.whenStable();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(toggle());
    expect(key(document.body, 'Escape').defaultPrevented).toBe(false);
  });

  it('« Fermer » et un second clic referment, focus rendu au bouton', async () => {
    await openPharmacy();
    root().querySelector<HTMLButtonElement>('[data-pharmacy-close]')!.click();
    await fixture.whenStable();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(toggle());
    await openPharmacy();
    await openPharmacy();
    expect(panel()).toBeNull();
    expect(opened).toBe(2);
  });

  it('lien vers la page « Produits et traitements » du wiki', async () => {
    await openPharmacy();
    root().querySelector<HTMLButtonElement>('[data-pharmacy-wiki]')!.click();
    expect(pages).toEqual(['produits']);
  });

  it('close() sans focus : repliée par l’application', async () => {
    await openPharmacy();
    fixture.componentInstance.close();
    await fixture.whenStable();
    expect(panel()).toBeNull();
  });
});
