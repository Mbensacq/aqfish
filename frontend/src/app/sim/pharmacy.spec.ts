import { describe, expect, it } from 'vitest';

import {
  chlorineAlert,
  dashboardAlerts,
  ichAlert,
  velvetAlert,
  type DashboardAlert,
} from './dashboard-alerts';
import { EMPTY_HEALTH_SUMMARY, type HealthSummary } from './health-summary';
import {
  activeProducts,
  EMPTY_PHARMACY,
  PHARMACY_INFO,
  PHARMACY_PRODUCTS,
  PHARMACY_STATUS_LABELS,
  pharmacyAdvice,
  pharmacyState,
  productStatus,
  samePharmacy,
  usedProducts,
  type PharmacyState,
  type PharmacyWater,
} from './pharmacy';
import { freshWater } from './water';
import { DEFAULT_WATER_SAMPLE } from './water-dashboard';
import { phBands } from './water-ph';

const YOUNG: PharmacyWater = { filter: 0.2 };
const state = (overrides: Partial<PharmacyState> = {}): PharmacyState => ({
  ...EMPTY_PHARMACY,
  ...overrides,
});
const alert = (id: DashboardAlert['id'], severity: DashboardAlert['severity'] = 'critique') =>
  ({
    id,
    severity,
    message: `alerte ${id}`,
    cause: 'cause',
    action: 'Régler le chauffage sur 25 °C',
  }) satisfies DashboardAlert;
const sick = (overrides: Partial<HealthSummary>): HealthSummary => ({
  ...EMPTY_HEALTH_SUMMARY,
  ...overrides,
});

describe('pharmacie : produits et états (#533)', () => {
  it('décrit chaque produit, sans en créer de nouveau', () => {
    expect(PHARMACY_PRODUCTS).toHaveLength(7);
    for (const product of PHARMACY_PRODUCTS) {
      expect(PHARMACY_INFO[product].label.length).toBeGreaterThan(0);
      expect(PHARMACY_INFO[product].where).toMatch(/^Réglages, /);
    }
    expect(Object.values(PHARMACY_STATUS_LABELS)).toEqual(['Disponible', 'En cours', 'Terminé']);
  });

  it('eau neuve : aucun produit en cours', () => {
    expect(activeProducts(freshWater('tropical'))).toEqual([]);
    expect(activeProducts(YOUNG)).toEqual([]);
  });

  it('relève chaque produit qui agit dans l’eau', () => {
    expect(
      activeProducts({
        filter: 0.5,
        ammoniaBinder: 10,
        bacteriaStarter: 0.5,
        medication: 0.3,
        salt: 2,
        carbon: true,
        phRegulatorWait: 100,
        catappa: [1],
      }),
    ).toEqual([...PHARMACY_PRODUCTS]);
    expect(activeProducts({ filter: 0.5, salt: 0 })).toEqual([]);
  });

  it('feuille de catappa décomposée : plus en cours', () => {
    expect(activeProducts({ filter: 1, catappa: [0] })).toEqual([]);
  });

  it('état : en cours, terminé, disponible', () => {
    expect(productStatus('amorce', ['amorce'], ['amorce'])).toBe('en-cours');
    expect(productStatus('amorce', [], ['amorce'])).toBe('termine');
    expect(productStatus('amorce', [], [])).toBe('disponible');
    expect(productStatus('sel', ['sel'], [])).toBe('en-cours');
  });

  it('mémoire des produits utilisés : union ordonnée, même tableau si rien ne change', () => {
    const used = ['sel'] as const;
    expect(usedProducts(used, [])).toBe(used);
    expect(usedProducts(used, ['sel'])).toBe(used);
    expect(usedProducts(used, ['amorce'])).toEqual(['amorce', 'sel']);
    expect(usedProducts([], [])).toEqual([]);
  });

  it('état du bac : un produit fini reste « terminé »', () => {
    const during = pharmacyState({ filter: 0.2, bacteriaStarter: 1 }, []);
    expect(during).toEqual({ active: ['amorce'], used: ['amorce'], filterMature: false });
    const after = pharmacyState({ filter: 1 }, during.used);
    expect(after).toEqual({ active: [], used: ['amorce'], filterMature: true });
    expect(productStatus('amorce', after.active, after.used)).toBe('termine');
  });

  it('compare deux états', () => {
    expect(samePharmacy(EMPTY_PHARMACY, state())).toBe(true);
    expect(samePharmacy(EMPTY_PHARMACY, state({ filterMature: true }))).toBe(false);
    expect(samePharmacy(EMPTY_PHARMACY, state({ active: ['sel'] }))).toBe(false);
    expect(samePharmacy(state({ used: ['sel'] }), state({ used: ['amorce'] }))).toBe(false);
    expect(samePharmacy(state({ used: ['sel'] }), state({ used: ['sel'] }))).toBe(true);
  });
});

describe('pharmacie : conseil selon l’alerte (#533)', () => {
  it('aucune alerte : aucun conseil', () => {
    expect(pharmacyAdvice([], EMPTY_PHARMACY)).toBeNull();
  });

  it('nitrites, filtre jeune : l’amorce de bactéries', () => {
    const advice = pharmacyAdvice([alert('nitrite')], EMPTY_PHARMACY);
    expect(advice).toMatchObject({ alert: 'nitrite', product: 'amorce', inProgress: false });
    expect(advice?.text).toContain('changer l’eau');
  });

  it('nitrites, amorce déjà versée : poursuivre et changer l’eau', () => {
    const advice = pharmacyAdvice([alert('nitrite')], state({ active: ['amorce'] }));
    expect(advice).toMatchObject({ product: 'amorce', inProgress: true });
    expect(advice?.text).toMatch(/déjà versée.*changer l’eau/);
  });

  it('nitrites, filtre mûr : le changement d’eau, sans produit', () => {
    const advice = pharmacyAdvice([alert('nitrite')], state({ filterMature: true }));
    expect(advice).toMatchObject({ product: null, inProgress: false });
    expect(advice?.text).toMatch(/^Filtre déjà mûr.*changer l’eau/);
  });

  it('ammoniaque : même conseil que les nitrites', () => {
    expect(pharmacyAdvice([alert('ammonia')], EMPTY_PHARMACY)?.product).toBe('amorce');
  });

  it('chlore : le conditionneur', () => {
    const chlorine = chlorineAlert(0.5);
    expect(chlorine).not.toBeNull();
    const advice = pharmacyAdvice([chlorine!], EMPTY_PHARMACY);
    expect(advice).toMatchObject({ alert: 'chlorine', product: 'conditionneur' });
    expect(advice?.message).toBe('Chlore dans l’eau');
  });

  it('points blancs : médicament ou sel', () => {
    const ich = ichAlert(sick({ ich: 2, sick: 2, diseased: 2 }))!;
    const advice = pharmacyAdvice([ich], EMPTY_PHARMACY);
    expect(advice).toMatchObject({ alert: 'ich', product: 'medicament', inProgress: false });
    expect(advice?.text).toContain('sel');
  });

  it('points blancs, sel déjà dans l’eau : poursuivre au sel', () => {
    const advice = pharmacyAdvice([alert('ich')], state({ active: ['sel'], used: ['sel'] }));
    expect(advice).toMatchObject({ product: 'sel', inProgress: true });
  });

  it('velours : le médicament, jamais le sel', () => {
    const velvet = velvetAlert(sick({ velvet: 1, sick: 1, diseased: 1 }))!;
    const advice = pharmacyAdvice([velvet], state({ active: ['sel'] }));
    expect(advice).toMatchObject({ alert: 'velvet', product: 'medicament', inProgress: false });
    expect(advice?.text).toContain('le sel et la chaleur n’y font rien');
  });

  it('maladie, traitement déjà en cours : redoser plutôt que reverser', () => {
    for (const id of ['ich', 'velvet', 'treatment'] as const) {
      const advice = pharmacyAdvice([alert(id)], state({ active: ['medicament'] }));
      expect(advice).toMatchObject({ product: 'medicament', inProgress: true });
      expect(advice?.text).toMatch(/^Médicament déjà dans l’eau/);
    }
  });

  it('charbon pendant un traitement : le retirer, jamais « en cours » à poursuivre', () => {
    const advice = pharmacyAdvice([alert('carbon')], state({ active: ['charbon', 'medicament'] }));
    expect(advice).toMatchObject({ product: 'charbon', inProgress: false });
    expect(advice?.text).toMatch(/^Retirer le charbon/);
  });

  it('alerte sans produit : renvoie à son action', () => {
    const advice = pharmacyAdvice([alert('temperature')], EMPTY_PHARMACY);
    expect(advice).toMatchObject({ alert: 'temperature', product: null, inProgress: false });
    expect(advice?.text).toBe('Aucun produit pour cette alerte : régler le chauffage sur 25 °C.');
  });

  it('plusieurs alertes : la plus grave l’emporte', () => {
    const alerts = dashboardAlerts({
      sample: { ...DEFAULT_WATER_SAMPLE, nitrite: 50, chlorine: 0.01 },
      phBands: phBands(['neon']),
      health: EMPTY_HEALTH_SUMMARY,
    });
    // Chlore sous le seuil de nocivité (« attention »), nitrites au rouge (« critique »).
    expect(alerts.map((a) => a.id).slice(0, 2)).toEqual(['nitrite', 'chlorine']);
    expect(pharmacyAdvice(alerts, EMPTY_PHARMACY)?.product).toBe('amorce');
  });

  it('à gravité égale, l’ordre fixe des alertes décide', () => {
    const alerts = [alert('chlorine'), alert('nitrite')];
    expect(pharmacyAdvice(alerts, EMPTY_PHARMACY)?.product).toBe('conditionneur');
  });
});
