import {
  ALERT_ORDER,
  alertsAnnouncement,
  animalCount,
  dashboardAlerts,
  MAX_SHOWN_ALERTS,
  mixAlert,
  shownAlerts,
  type AlertInput,
  type DashboardAlert,
} from './dashboard-alerts';
import { mixWarnings } from './compatibility';
import { EMPTY_HEALTH_SUMMARY, healthSummary, type HealthSummary } from './health-summary';
import { freshWater, WATER_TEMPERATURES } from './water';
import { waterSample, type WaterSample } from './water-dashboard';
import { phBands, SPECIES_PH } from './water-ph';
import { COMPOUND_THRESHOLDS, TEMPERATURE_THRESHOLDS } from './water-quality';
import { HEALTH_FLOOR } from './wellbeing';

const TROPICAL = ['neon', 'guppy', 'corydora'] as const;
const HEALTHY: HealthSummary = healthSummary([
  { species: 'neon', health: 1, hunger: 0.5 },
  { species: 'guppy', health: 1, hunger: 0.4 },
]);

function sample(changes: Partial<WaterSample> = {}): WaterSample {
  return { ...waterSample(freshWater('tropical'), 'tropical', 0), ...changes };
}

function input(changes: Partial<WaterSample> = {}, health = HEALTHY): AlertInput {
  return { sample: sample(changes), phBands: phBands(TROPICAL), health };
}

const ids = (alerts: readonly DashboardAlert[]) => alerts.map((a) => a.id);

describe('alertes du tableau de bord (#260)', () => {
  it('eau saine et animaux en bonne santé : aucune alerte', () => {
    expect(dashboardAlerts(input())).toEqual([]);
    expect(dashboardAlerts(input({}, EMPTY_HEALTH_SUMMARY))).toEqual([]);
  });

  it('une alerte par composé hors plage, gravité selon le seuil (compris)', () => {
    for (const compound of ['ammonia', 'nitrite', 'nitrate'] as const) {
      const { watch, bad } = COMPOUND_THRESHOLDS[compound];
      expect(dashboardAlerts(input({ [compound]: watch - 0.01 }))).toEqual([]);
      const attention = dashboardAlerts(input({ [compound]: watch }));
      expect(attention).toHaveLength(1);
      expect(attention[0]).toMatchObject({ id: compound, severity: 'attention' });
      const critique = dashboardAlerts(input({ [compound]: bad }));
      expect(critique[0]).toMatchObject({ id: compound, severity: 'critique' });
      expect(critique[0]?.message).not.toBe('');
      expect(critique[0]?.cause).not.toBe('');
      expect(critique[0]?.action).toMatch(/Changer l’eau/);
    }
  });

  it('nitrites : message, cause et action en français', () => {
    const [alert] = dashboardAlerts(input({ nitrite: COMPOUND_THRESHOLDS.nitrite.bad }));
    expect(alert).toEqual({
      id: 'nitrite',
      severity: 'critique',
      message: 'Nitrites trop hauts',
      cause: 'filtre jeune ou trop de poissons',
      action: 'Changer l’eau (30 % renouvelés), ne pas ajouter d’animaux',
    });
  });

  it('température : trop chaude ou trop froide, action vers la température de l’environnement', () => {
    const reference = WATER_TEMPERATURES.tropical;
    const hot = dashboardAlerts(input({ temperature: reference + TEMPERATURE_THRESHOLDS.watch }));
    expect(hot[0]).toMatchObject({
      id: 'temperature',
      severity: 'attention',
      message: 'Eau trop chaude',
      action: `Régler le chauffage sur ${reference} °C`,
    });
    const cold = dashboardAlerts(input({ temperature: reference - TEMPERATURE_THRESHOLDS.bad }));
    expect(cold[0]).toMatchObject({ severity: 'critique', message: 'Eau trop froide' });
    expect(dashboardAlerts(input({ temperature: reference + 2.9 }))).toEqual([]);
  });

  it('pH : toléré → attention, hors plage → critique, du bon côté', () => {
    const bands = phBands(TROPICAL);
    const ideal = bands.ideal!;
    const tolerated = bands.tolerated!;
    const low = dashboardAlerts(input({ ph: ideal.min - 0.01 }));
    expect(low[0]).toMatchObject({ id: 'ph', severity: 'attention', message: 'pH un peu acide' });
    const high = dashboardAlerts(input({ ph: ideal.max + 0.01 }));
    expect(high[0]).toMatchObject({ severity: 'attention', message: 'pH un peu basique' });
    const acid = dashboardAlerts(input({ ph: tolerated.min - 0.01 }));
    expect(acid[0]).toMatchObject({ severity: 'critique', message: 'pH trop acide' });
    expect(acid[0]?.action).toMatch(/Changer l’eau/);
    const basic = dashboardAlerts(input({ ph: tolerated.max + 0.01 }));
    expect(basic[0]).toMatchObject({ severity: 'critique', message: 'pH trop basique' });
    // Bornes de la plage idéale comprises : aucune alerte.
    expect(dashboardAlerts(input({ ph: ideal.min }))).toEqual([]);
    expect(dashboardAlerts(input({ ph: ideal.max }))).toEqual([]);
  });

  it('pH : espèces sans plage commune → critique ; sans idéal commun → attention', () => {
    const none = dashboardAlerts({
      sample: sample({ ph: 8 }),
      phBands: { tolerated: null, ideal: null },
      health: HEALTHY,
    });
    expect(none[0]).toMatchObject({
      id: 'ph',
      severity: 'critique',
      message: 'pH impossible à tenir',
    });
    const noIdeal = dashboardAlerts({
      sample: sample({ ph: 7 }),
      phBands: { tolerated: { min: 6, max: 8 }, ideal: null },
      health: HEALTHY,
    });
    expect(noIdeal[0]).toMatchObject({ severity: 'attention', message: 'pH sans idéal commun' });
    // Récif : pH de l'eau neuve dans l'idéal des espèces du récif.
    const clownBands = phBands(['clown', 'chirurgien']);
    expect(
      dashboardAlerts({
        sample: { ...waterSample(freshWater('recif'), 'recif', 0) },
        phBands: clownBands,
        health: HEALTHY,
      }),
    ).toEqual([]);
    expect(SPECIES_PH.clown.tolerated.min).toBeGreaterThan(7);
  });

  it('valeurs non finies : alertes critiques « mesure invalide », jamais rassurantes', () => {
    const alerts = dashboardAlerts(
      input({
        ammonia: Number.NaN,
        nitrite: Infinity,
        nitrate: -Infinity,
        temperature: Number.NaN,
        ph: Number.NaN,
      }),
    );
    expect(ids(alerts)).toEqual(['ammonia', 'nitrite', 'temperature', 'ph', 'nitrate']);
    expect(alerts.every((a) => a.severity === 'critique')).toBe(true);
    expect(alerts.every((a) => a.cause.startsWith('mesure invalide'))).toBe(true);
    expect(alerts.find((a) => a.id === 'temperature')?.message).toBe('Température anormale');
  });

  it('faim : affamés → critique avec effectif, faim moyenne haute → attention', () => {
    const starving = healthSummary([
      { species: 'neon', health: 1, hunger: 1 },
      { species: 'neon', health: 1, hunger: 1 },
    ]);
    const [alert] = dashboardAlerts(input({}, starving)).filter((a) => a.id === 'hunger');
    expect(alert).toMatchObject({ severity: 'critique', message: 'Animaux affamés' });
    expect(alert?.cause).toBe('2 animaux sans repas depuis longtemps');
    expect(alert?.action).toMatch(/Nourrir/);
    const hungry = healthSummary([{ species: 'neon', health: 1, hunger: 0.8 }]);
    expect(dashboardAlerts(input({}, hungry))[0]).toMatchObject({
      id: 'hunger',
      severity: 'attention',
    });
  });

  it('santé : malades → attention, faibles → critique, causes tirées des autres alertes', () => {
    const sick = healthSummary([{ species: 'neon', health: 0.7, hunger: 0.2 }]);
    const [recovering] = dashboardAlerts(input({}, sick));
    expect(recovering).toMatchObject({
      id: 'health',
      severity: 'attention',
      message: 'Animaux malades',
    });
    expect(recovering?.action).toBe('Rien à faire : la santé remonte seule');
    const weak = healthSummary([{ species: 'neon', health: HEALTH_FLOOR, hunger: 1 }]);
    const alerts = dashboardAlerts(input({ nitrate: COMPOUND_THRESHOLDS.nitrate.bad }, weak));
    const health = alerts.find((a) => a.id === 'health');
    expect(health).toMatchObject({ severity: 'critique', message: 'Animaux en détresse' });
    expect(health?.cause).toBe('santé usée par : eau mauvaise, faim ; animaux touchés : 1');
  });

  it('ordre : critiques d’abord, puis ordre fixe ; stable et sans doublon', () => {
    const weak = healthSummary([{ species: 'neon', health: HEALTH_FLOOR, hunger: 1 }]);
    const alerts = dashboardAlerts(
      input(
        {
          nitrate: COMPOUND_THRESHOLDS.nitrate.bad,
          nitrite: COMPOUND_THRESHOLDS.nitrite.watch,
          ammonia: COMPOUND_THRESHOLDS.ammonia.bad,
          temperature: WATER_TEMPERATURES.tropical + TEMPERATURE_THRESHOLDS.watch,
        },
        weak,
      ),
    );
    expect(ids(alerts)).toEqual([
      'ammonia',
      'hunger',
      'nitrate',
      'health',
      'nitrite',
      'temperature',
    ]);
    expect(new Set(ids(alerts)).size).toBe(alerts.length);
    // Même entrée, même liste (aucun état caché).
    expect(dashboardAlerts(input({ nitrate: 50, ammonia: 6 }, weak))).toEqual(
      dashboardAlerts(input({ nitrate: 50, ammonia: 6 }, weak)),
    );
    expect(new Set(ALERT_ORDER).size).toBe(ALERT_ORDER.length);
  });

  it('au plus trois alertes affichées, les autres comptées', () => {
    const alerts = dashboardAlerts(
      input({ ammonia: 6, nitrite: 6, nitrate: 50, temperature: 40, ph: 3 }),
    );
    expect(alerts).toHaveLength(5);
    const { shown, hidden } = shownAlerts(alerts);
    expect(shown).toHaveLength(MAX_SHOWN_ALERTS);
    expect(shown).toEqual(alerts.slice(0, 3));
    expect(hidden).toBe(2);
    expect(shownAlerts([])).toEqual({ shown: [], hidden: 0 });
    expect(shownAlerts(alerts, 10).hidden).toBe(0);
    expect(shownAlerts(alerts, -1)).toEqual({ shown: [], hidden: 5 });
    expect(shownAlerts(alerts, Number.NaN).shown).toHaveLength(MAX_SHOWN_ALERTS);
  });

  it('annonce : sujets et gravités seulement, indépendante des valeurs', () => {
    expect(alertsAnnouncement([])).toBe('Aucune alerte.');
    const one = dashboardAlerts(input({ nitrate: 45 }));
    expect(alertsAnnouncement(one)).toBe('1 alerte : Nitrates trop hauts (critique).');
    expect(alertsAnnouncement(dashboardAlerts(input({ nitrate: 55 })))).toBe(
      alertsAnnouncement(one),
    );
    expect(alertsAnnouncement(dashboardAlerts(input({ nitrate: 45, ammonia: 2.5 })))).toBe(
      '2 alertes : Nitrates trop hauts (critique), Ammoniaque trop haute (attention).',
    );
  });

  it('effectifs au singulier et au pluriel', () => {
    expect(animalCount(1)).toBe('1 animal');
    expect(animalCount(3)).toBe('3 animaux');
  });
});

describe('alerte de mélange déconseillé (#271)', () => {
  const mixes = mixWarnings(['axolotl', 'grenouille', 'triton'], {
    axolotl: 2,
    grenouille: 3,
    triton: 2,
  });

  it('aucun mélange (absent ou vide) : aucune alerte', () => {
    expect(mixAlert([])).toBeNull();
    expect(dashboardAlerts({ ...input(), mixes: [] })).toEqual([]);
    expect(dashboardAlerts(input())).toEqual([]);
  });

  it('paludarium mixte : une seule alerte « attention » qui nomme chaque couple', () => {
    const alerts = dashboardAlerts({ ...input(), mixes });
    expect(alerts).toEqual([
      {
        id: 'mix',
        severity: 'attention',
        message: 'Mélange déconseillé',
        cause:
          'axolotls et sonneurs orientaux (prédateur) ; axolotls et tritons à ventre de feu (prédateur)',
        action: 'Retirer l’une des espèces : Réglages, Population',
      },
    ]);
    expect(alertsAnnouncement(alerts)).toBe('1 alerte : Mélange déconseillé (attention).');
  });

  it('après les alertes de l’eau de même gravité, avant la santé ; ne compte pas comme cause', () => {
    const sick = healthSummary([{ species: 'neon', health: 0.5, hunger: 0.1 }]);
    const alerts = dashboardAlerts({
      ...input({ nitrate: COMPOUND_THRESHOLDS.nitrate.watch }, sick),
      mixes,
    });
    expect(ids(alerts)).toEqual(['nitrate', 'mix', 'health']);
    expect(alerts.find((a) => a.id === 'health')?.cause).not.toContain('mélange');
    expect(new Set(ALERT_ORDER).size).toBe(ALERT_ORDER.length);
  });
});
