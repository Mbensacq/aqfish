import {
  ALERT_ORDER,
  algaeAlert,
  alertsAnnouncement,
  animalCount,
  dashboardAlerts,
  finRotAlert,
  velvetAlert,
  ichAlert,
  treatmentAlert,
  MAX_SHOWN_ALERTS,
  mixAlert,
  shownAlerts,
  type AlertInput,
  type DashboardAlert,
} from './dashboard-alerts';
import { ALGAE_BAD_COVERAGE, ALGAE_WATCH_COVERAGE } from './algae';
import { mixWarnings } from './compatibility';
import { ICH_AGGRAVATED_AT, ICH_VISIBLE_AT } from './disease';
import { FIN_ROT_ADVANCED_AT, FIN_ROT_VISIBLE_AT } from './fin-rot';
import { VELVET_ADVANCED_AT, VELVET_VISIBLE_AT } from './velvet';
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

describe('alerte des points blancs (#366)', () => {
  const visible = ICH_VISIBLE_AT + 60;

  it('sans animal aux points visibles (sains, en incubation) : aucune alerte ni lien', () => {
    expect(ichAlert(HEALTHY)).toBeNull();
    const incubating = healthSummary([
      { species: 'neon', health: 1, hunger: 0.2, ich: 0 },
      { species: 'neon', health: 1, hunger: 0.2, ich: ICH_VISIBLE_AT - 1 },
    ]);
    expect(ichAlert(incubating)).toBeNull();
    expect(dashboardAlerts(input({}, incubating))).toEqual([]);
  });

  it('points visibles : « Points blancs », attention, lien vers la page « Maladies » du wiki', () => {
    const health = healthSummary([
      { species: 'neon', health: 1, hunger: 0.2, ich: visible },
      { species: 'guppy', health: 1, hunger: 0.2 },
    ]);
    const alerts = dashboardAlerts(input({}, health));
    expect(alerts).toEqual([
      {
        id: 'ich',
        severity: 'attention',
        message: 'Points blancs',
        cause: 'parasite (Ichthyophthirius) favorisé par une eau instable ; 1 animal touché',
        action:
          'Traiter plusieurs jours : Réglages, Soins ; garder l’eau stable (température, ammoniaque, nitrites)',
        wiki: 'maladies',
      },
    ]);
    expect(alertsAnnouncement(alerts)).toBe('1 alerte : Points blancs (attention).');
  });

  it('traitement en cours (#361) : attention, jours restants, délai avant de redoser', () => {
    expect(treatmentAlert(null)).toBeNull();
    const salted = { products: 'sel 5,0 g/L', remainingDays: 3.5, medicationDays: null };
    expect(treatmentAlert(salted)).toEqual({
      id: 'treatment',
      severity: 'attention',
      message: 'Traitement en cours',
      cause: 'sel 5,0 g/L ; points blancs en recul',
      action: 'Continuer encore 3,5 j ; un changement d’eau retire une part du produit',
      wiki: 'produits',
    });
    const medicated = { products: 'médicament 0,8 dose', remainingDays: 2, medicationDays: 1.2 };
    expect(treatmentAlert(medicated)?.action).toBe(
      'Continuer encore 2,0 j ; redoser le médicament avant 1,2 j ; un changement d’eau retire une part du produit',
    );
    // Juste après les points blancs, à gravité égale.
    const health = healthSummary([{ species: 'neon', health: 1, hunger: 0.2, ich: visible }]);
    expect(
      dashboardAlerts({ ...input({}, health), treatment: medicated }).map((a) => a.id),
    ).toEqual(['ich', 'treatment']);
  });

  it('stade aggravé : critique, effectif des aggravés dans la cause', () => {
    const health = healthSummary([
      { species: 'neon', health: 1, hunger: 0.2, ich: visible },
      { species: 'neon', health: 1, hunger: 0.2, ich: ICH_AGGRAVATED_AT },
      { species: 'neon', health: 1, hunger: 0.2, ich: ICH_AGGRAVATED_AT },
    ]);
    const alert = ichAlert(health);
    expect(alert).toMatchObject({ id: 'ich', severity: 'critique', wiki: 'maladies' });
    expect(alert?.cause).toBe(
      'parasite (Ichthyophthirius) favorisé par une eau instable ; 3 animaux touchés, dont 2 au stade aggravé',
    );
  });

  it('les malades aux points blancs ne sont pas recomptés dans l’alerte de santé', () => {
    const onlyIch = healthSummary([
      { species: 'neon', health: 0.5, hunger: 0.2, ich: visible },
      { species: 'guppy', health: 1, hunger: 0.2 },
    ]);
    expect(ids(dashboardAlerts(input({}, onlyIch)))).toEqual(['ich']);
    const both = healthSummary([
      { species: 'neon', health: 0.5, hunger: 0.2, ich: visible },
      { species: 'guppy', health: 0.6, hunger: 0.2 },
    ]);
    const alerts = dashboardAlerts(input({}, both));
    expect(ids(alerts)).toEqual(['ich', 'health']);
    expect(alerts[1]?.cause).toBe('gêne passée, santé encore basse ; animaux touchés : 1');
    // Seule l'alerte des points blancs porte un lien vers le wiki.
    expect(alerts.filter((a) => a.wiki !== undefined).map((a) => a.id)).toEqual(['ich']);
  });

  it('gravité de l’alerte de santé : seuls les faibles sans points blancs comptent (#370)', () => {
    // Néon faible aux points blancs + guppy malade sans être faible : « attention ».
    const mixed = healthSummary([
      { species: 'neon', health: HEALTH_FLOOR, hunger: 0.2, ich: ICH_AGGRAVATED_AT },
      { species: 'guppy', health: 0.6, hunger: 0.2 },
    ]);
    expect(mixed).toMatchObject({ sick: 2, ich: 1, weak: 1, weakWithoutIch: 0 });
    const health = dashboardAlerts(input({}, mixed)).find((a) => a.id === 'health');
    expect(health).toMatchObject({ severity: 'attention', message: 'Animaux malades' });
    expect(health?.cause).toBe('gêne passée, santé encore basse ; animaux touchés : 1');
    // Le même guppy devenu faible : « critique », même avec le néon aux points blancs.
    const weakOther = healthSummary([
      { species: 'neon', health: HEALTH_FLOOR, hunger: 0.2, ich: ICH_AGGRAVATED_AT },
      { species: 'guppy', health: HEALTH_FLOOR, hunger: 0.2 },
    ]);
    expect(weakOther).toMatchObject({ sick: 2, ich: 1, weak: 2, weakWithoutIch: 1 });
    const critical = dashboardAlerts(input({}, weakOther)).find((a) => a.id === 'health');
    expect(critical).toMatchObject({ severity: 'critique', message: 'Animaux en détresse' });
    // Faible sous le seuil de visibilité des points : compté comme faible sans points blancs.
    const hidden = healthSummary([
      { species: 'neon', health: HEALTH_FLOOR, hunger: 0.2, ich: ICH_VISIBLE_AT - 1 },
    ]);
    expect(hidden).toMatchObject({ ich: 0, weakWithoutIch: 1 });
    expect(dashboardAlerts(input({}, hidden)).find((a) => a.id === 'health')?.severity).toBe(
      'critique',
    );
  });

  it('ordre : après le pH, avant la faim, à gravité égale', () => {
    const health = healthSummary([{ species: 'neon', health: 1, hunger: 1, ich: visible }]);
    const alerts = dashboardAlerts(
      input({ nitrite: COMPOUND_THRESHOLDS.nitrite.watch, nitrate: 50 }, health),
    );
    expect(ids(alerts).indexOf('ich')).toBeGreaterThan(ids(alerts).indexOf('nitrite'));
    expect(ALERT_ORDER.indexOf('ich')).toBe(ALERT_ORDER.indexOf('ph') + 1);
    expect(ALERT_ORDER.indexOf('ich')).toBeLessThan(ALERT_ORDER.indexOf('hunger'));
  });
});

describe('alerte des algues (#476)', () => {
  it('aucune algue ou couverture sous le seuil : aucune alerte', () => {
    expect(algaeAlert(undefined)).toBeNull();
    expect(algaeAlert(0)).toBeNull();
    expect(dashboardAlerts(input({ algae: ALGAE_WATCH_COVERAGE - 0.01 }))).toEqual([]);
  });

  it('prolifération au seuil (compris), avec lien vers la page « Entretien » du wiki', () => {
    const alerts = dashboardAlerts(input({ algae: ALGAE_WATCH_COVERAGE }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: 'algae',
      severity: 'attention',
      message: 'Algues en prolifération',
      wiki: 'entretien',
    });
    expect(alerts[0].cause).toContain('25 %');
    expect(alerts[0].action).toMatch(/raclette/);
    // #488 : la raclette est dans la section « Eau » (« Soins » n'apparaît qu'avec des points
    // blancs).
    expect(alerts[0].action).toContain('Passer la raclette (Réglages, Eau)');
    expect(alerts[0].action).not.toContain('Soins');
  });

  it('grave au second seuil ; couverture non finie : critique, mesure invalide', () => {
    expect(algaeAlert(ALGAE_BAD_COVERAGE)).toMatchObject({
      severity: 'critique',
      message: 'Algues envahissantes',
    });
    expect(algaeAlert(Number.NaN)).toMatchObject({ severity: 'critique' });
    expect(algaeAlert(Number.NaN)?.cause).toMatch(/invalide/);
  });

  it('rangée après les nitrates, sa cause ; une seule alerte', () => {
    expect(ALERT_ORDER.indexOf('algae')).toBe(ALERT_ORDER.indexOf('nitrate') + 1);
    const alerts = dashboardAlerts(
      input({ algae: ALGAE_WATCH_COVERAGE, nitrate: COMPOUND_THRESHOLDS.nitrate.watch }),
    );
    expect(ids(alerts)).toEqual(['nitrate', 'algae']);
  });

  it('relevé de l’eau : couverture moyenne seulement si des algues existent', () => {
    expect(waterSample(freshWater('tropical'), 'tropical', 0).algae).toBeUndefined();
    const water = { ...freshWater('tropical'), algae: [0.2, 0.4, 0.6, 0.8, 0, 0, 0, 0.4] };
    expect(waterSample(water, 'tropical', 0).algae).toBeCloseTo(0.3, 12);
    // Sauvegarde courte (#488) : moyenne sur les huit plaques du bac.
    const short = { ...freshWater('tropical'), algae: [0.8, 0.4] };
    expect(waterSample(short, 'tropical', 0).algae).toBeCloseTo(0.15, 12);
  });
});

describe('alerte de la pourriture des nageoires (#485)', () => {
  const frayed = FIN_ROT_VISIBLE_AT + 30;

  it('sans nageoires effilochées (sains, au début) : aucune alerte', () => {
    expect(finRotAlert(HEALTHY)).toBeNull();
    const early = healthSummary([{ species: 'neon', health: 1, hunger: 0.2, finRot: 10 }]);
    expect(finRotAlert(early)).toBeNull();
    expect(dashboardAlerts(input({}, early))).toEqual([]);
  });

  it('nageoires effilochées : cause probable, action, lien « Maladies »', () => {
    const health = healthSummary([
      { species: 'neon', health: 1, hunger: 0.2, finRot: frayed },
      { species: 'guppy', health: 1, hunger: 0.2 },
    ]);
    const alerts = dashboardAlerts(input({}, health));
    expect(alerts).toEqual([
      {
        id: 'finRot',
        severity: 'attention',
        message: 'Nageoires effilochées',
        cause:
          'eau trop chargée (ammoniaque ou nitrites) : bactéries de la pourriture des nageoires ; 1 animal touché',
        action:
          'Changer l’eau (30 % renouvelés) et nourrir moins : les nageoires repoussent une fois l’eau propre',
        wiki: 'maladies',
      },
    ]);
  });

  it('stade avancé : critique ; malades exclus de l’alerte de santé, même faibles', () => {
    const health = healthSummary([
      { species: 'neon', health: HEALTH_FLOOR, hunger: 0.2, finRot: FIN_ROT_ADVANCED_AT },
      { species: 'neon', health: HEALTH_FLOOR, hunger: 0.2, finRot: frayed },
    ]);
    const alert = finRotAlert(health);
    expect(alert?.severity).toBe('critique');
    expect(alert?.cause).toContain('2 animaux touchés, dont 1 au stade avancé');
    expect(ids(dashboardAlerts(input({}, health)))).toEqual(['finRot']);
  });

  it('points blancs et nageoires effilochées sur le même animal : compté une fois parmi les malades', () => {
    const health = healthSummary([
      { species: 'neon', health: 0.5, hunger: 0.2, ich: ICH_VISIBLE_AT, finRot: frayed },
      { species: 'neon', health: 0.5, hunger: 0.2 },
    ]);
    expect(health.sick).toBe(2);
    expect(health.diseased).toBe(1);
    expect(health.ich).toBe(1);
    expect(health.finRot).toBe(1);
    const found = dashboardAlerts(input({}, health));
    expect(ids(found)).toEqual(['ich', 'finRot', 'health']);
    expect(found.find((a) => a.id === 'health')?.cause).toContain('animaux touchés : 1');
  });

  it('eau chargée et nageoires effilochées : l’ammoniaque d’abord', () => {
    const health = healthSummary([{ species: 'neon', health: 1, hunger: 0.2, finRot: frayed }]);
    const alerts = dashboardAlerts(input({ ammonia: COMPOUND_THRESHOLDS.ammonia.bad + 1 }, health));
    expect(ids(alerts).slice(0, 2)).toEqual(['ammonia', 'finRot']);
  });
});

describe('alerte du velours (#532)', () => {
  it('sain ou en incubation : aucune alerte', () => {
    expect(velvetAlert(HEALTHY)).toBeNull();
    const early = healthSummary([{ species: 'neon', health: 1, hunger: 0.2, velvet: 10 }]);
    expect(dashboardAlerts(input({}, early))).toEqual([]);
  });

  it('voile visible : remède du jeu (médicament, pas le sel), lien « Maladies »', () => {
    const health = healthSummary([
      { species: 'neon', health: 1, hunger: 0.2, velvet: VELVET_VISIBLE_AT },
      { species: 'neon', health: 1, hunger: 0.2, velvet: VELVET_ADVANCED_AT },
    ]);
    const [alert] = dashboardAlerts(input({}, health));
    expect(alert.id).toBe('velvet');
    expect(alert.severity).toBe('critique');
    expect(alert.message).toBe('Velours (voile doré)');
    expect(alert.cause).toContain('2 animaux touchés, dont 1 au stade avancé');
    expect(alert.action).toContain('Médicament');
    expect(alert.action).toContain('le sel et la chaleur n’y font rien');
    expect(alert.wiki).toBe('maladies');
  });

  it('points blancs et velours : deux alertes distinctes, dans l’ordre fixe', () => {
    const health = healthSummary([
      { species: 'neon', health: 1, hunger: 0.2, ich: ICH_VISIBLE_AT },
      { species: 'neon', health: 1, hunger: 0.2, velvet: VELVET_VISIBLE_AT },
    ]);
    expect(ids(dashboardAlerts(input({}, health)))).toEqual(['ich', 'velvet']);
  });
});
