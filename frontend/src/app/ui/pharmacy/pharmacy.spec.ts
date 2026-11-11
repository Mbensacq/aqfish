import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { GuidePage } from '../../sim/care-guide';
import { EMPTY_HEALTH_SUMMARY } from '../../sim/health-summary';
import { DEFAULT_WATER_SAMPLE } from '../../sim/water-dashboard';
import {
  startWaterTest,
  WATER_TEST_TICKS,
  waterTestView,
  type WaterKit,
} from '../../sim/water-test';
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

  describe('kits de test de l’eau (#564)', () => {
    const SAMPLE = { ph: 7.13, ammonia: 3.5, nitrite: 0, nitrate: 0, gh: 10, kh: 4 };
    const kit = (name: string) =>
      root().querySelector<HTMLButtonElement>(`[data-water-kit="${name}"]`)!;
    const result = () => root().querySelector<HTMLElement>('[data-water-test]')!;

    it('un bouton par kit, qui demande le test', async () => {
      const kits: WaterKit[] = [];
      fixture.componentInstance.waterTestRequested.subscribe((k) => kits.push(k));
      await openPharmacy();
      expect(root().querySelectorAll('[data-water-kit]').length).toBe(5);
      expect(result().getAttribute('data-state')).toBe('aucun');
      kit('nitrates').click();
      expect(kits).toEqual(['nitrates']);
    });

    it('en cours : kits désactivés, secondes restantes', async () => {
      fixture.componentRef.setInput('waterTest', waterTestView(startWaterTest('ph', SAMPLE, 0), 0));
      await openPharmacy();
      expect(result().getAttribute('data-state')).toBe('en-cours');
      expect(result().textContent).toContain('résultat dans 10 s');
      expect(kit('ph').disabled).toBe(true);
    });

    it('terminé : valeur arrondie et conseil', async () => {
      fixture.componentRef.setInput(
        'waterTest',
        waterTestView(startWaterTest('ammoniaque', SAMPLE, 0), WATER_TEST_TICKS),
      );
      await openPharmacy();
      expect(result().getAttribute('data-state')).toBe('termine');
      expect(root().querySelector('[data-water-result]')?.textContent).toContain('≈ 4 u.');
      expect(root().querySelector('[data-water-test-advice]')?.textContent).toContain(
        'à surveiller',
      );
      expect(kit('ph').disabled).toBe(false);
    });

    it('dureté : GH et KH séparés par « · », un seul séparateur (#574)', async () => {
      fixture.componentRef.setInput(
        'waterTest',
        waterTestView(startWaterTest('durete', SAMPLE, 0), WATER_TEST_TICKS),
      );
      await openPharmacy();
      const values = [...root().querySelectorAll('[data-water-result]')].map((e) =>
        e.textContent?.trim(),
      );
      expect(values).toHaveLength(2);
      expect(values[0]).toMatch(/^GH ≈/);
      expect(values[1]).toMatch(/^KH ≈/);
      const separators = result().querySelectorAll('.pharmacy__separator');
      expect(separators.length).toBe(1);
      // Le séparateur est entre les deux valeurs.
      expect(separators[0].previousElementSibling?.textContent).toMatch(/^GH/);
      expect(separators[0].nextElementSibling?.textContent).toMatch(/^KH/);
      // De vrais espaces autour du point : texte lu « GH ≈ … · KH ≈ … ».
      expect(result().textContent).toMatch(/GH ≈ \d+ gouttes · KH ≈ \d+ gouttes/);
    });

    it('une seule grandeur : aucun séparateur', async () => {
      fixture.componentRef.setInput(
        'waterTest',
        waterTestView(startWaterTest('ph', SAMPLE, 0), WATER_TEST_TICKS),
      );
      await openPharmacy();
      expect(root().querySelectorAll('[data-water-result]').length).toBe(1);
      expect(result().querySelector('.pharmacy__separator')).toBeNull();
    });
  });
});
