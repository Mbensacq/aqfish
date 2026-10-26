import { SIM_DT } from './constants';
import { ENVIRONMENT_IDS, environmentById, environmentWater } from './environment';
import { SPECIES_IDS } from './population';
import { waterLiters, waterLoad } from './water';
import {
  FRESH_PH,
  freshPh,
  inPhRange,
  MAX_PH,
  MIN_PH,
  PH_DROP_PER_LOAD_LITER,
  PH_ZONE_LABELS,
  phAfterWaterChange,
  phBands,
  phOutOfTolerance,
  phZone,
  sameBands,
  SPECIES_PH,
  stepPh,
} from './water-ph';
import { createDefaultWorld } from './world';

describe('plages de pH des espèces', () => {
  it.each(SPECIES_IDS)('%s : idéale dans la tolérée, toutes deux dans [4 ; 9,5]', (id) => {
    const { tolerated, ideal } = SPECIES_PH[id];
    expect(tolerated.min).toBeGreaterThanOrEqual(MIN_PH);
    expect(tolerated.max).toBeLessThanOrEqual(MAX_PH);
    expect(tolerated.min).toBeLessThan(tolerated.max);
    expect(ideal.min).toBeLessThan(ideal.max);
    expect(ideal.min).toBeGreaterThanOrEqual(tolerated.min);
    expect(ideal.max).toBeLessThanOrEqual(tolerated.max);
  });

  it.each(ENVIRONMENT_IDS)(
    '%s : l’eau neuve est tolérée par chaque espèce qui y vit et dans l’échelle',
    (environment) => {
      const ph = freshPh(environment);
      expect(ph).toBe(FRESH_PH[environment]);
      expect(ph).toBeGreaterThanOrEqual(MIN_PH);
      expect(ph).toBeLessThanOrEqual(MAX_PH);
      for (const species of environmentById(environment).species) {
        expect(phOutOfTolerance(ph, species)).toBe(false);
      }
    },
  );

  it.each(ENVIRONMENT_IDS)(
    '%s : la population par défaut reste dans les plages tolérées 30 min simulées',
    (environment) => {
      const world = createDefaultWorld(42, environment);
      const liters = waterLiters(environmentWater(environment));
      const drop = ((PH_DROP_PER_LOAD_LITER * waterLoad(world.entities)) / liters) * 1800;
      const ph = freshPh(environment) - drop;
      expect(drop).toBeGreaterThan(0);
      for (const species of environmentById(environment).species) {
        expect(phOutOfTolerance(ph, species)).toBe(false);
      }
    },
  );
});

describe('stepPh et phAfterWaterChange', () => {
  it('baisse proportionnelle à la charge par litre et au temps', () => {
    expect(stepPh(7, 10, 0, 100)).toBe(7);
    expect(stepPh(7, 10, 50, 100)).toBeCloseTo(7 - PH_DROP_PER_LOAD_LITER * 0.5 * 10, 12);
    expect(stepPh(7, SIM_DT, 50, 100)).toBeLessThan(7);
  });

  it('bornée à [4 ; 9,5] ; NaN ramené au plancher', () => {
    expect(stepPh(4.000001, 1000, 1000, 1)).toBe(MIN_PH);
    expect(stepPh(12, 1, 0, 1)).toBe(MAX_PH);
    expect(stepPh(Number.NaN, 1, 0, 1)).toBe(MIN_PH);
    expect(phAfterWaterChange(Number.NaN, 7, 0.3)).toBe(MIN_PH);
  });

  it('changement d’eau : moyenne pondérée vers l’eau neuve', () => {
    expect(phAfterWaterChange(6, 7, 0.3)).toBeCloseTo(6.3, 12);
    expect(phAfterWaterChange(8, 7, 0.3)).toBeCloseTo(7.7, 12);
    expect(phAfterWaterChange(7, 7, 0.3)).toBe(7);
    expect(phAfterWaterChange(6, 7, 0)).toBe(6);
    expect(phAfterWaterChange(6, 7, 1)).toBe(7);
  });
});

describe('phBands et phZone', () => {
  it('sans espèce : toute l’échelle est idéale', () => {
    const bands = phBands([]);
    expect(bands).toEqual({
      tolerated: { min: MIN_PH, max: MAX_PH },
      ideal: { min: MIN_PH, max: MAX_PH },
    });
    expect(phZone(MIN_PH, bands)).toBe('ideal');
    expect(phZone(MAX_PH, bands)).toBe('ideal');
  });

  it('une espèce : ses plages ; doublons sans effet', () => {
    expect(phBands(['neon'])).toEqual(SPECIES_PH.neon);
    expect(phBands(['neon', 'neon', 'neon'])).toEqual(SPECIES_PH.neon);
  });

  it('plusieurs espèces : intersection des plages, ordre indifférent', () => {
    const bands = phBands(['neon', 'guppy', 'corydora']);
    expect(bands).toEqual({ tolerated: { min: 6.5, max: 7.8 }, ideal: { min: 7, max: 7 } });
    expect(sameBands(bands, phBands(['corydora', 'guppy', 'neon', 'guppy']))).toBe(true);
  });

  it('besoins presque incompatibles : idéal vide, tolérée réduite à un point', () => {
    const bands = phBands(['neon', 'clown']);
    expect(bands).toEqual({ tolerated: { min: 7.8, max: 7.8 }, ideal: null });
    expect(phZone(7.8, bands)).toBe('tolere');
    for (const ph of [MIN_PH, 7, 7.9, MAX_PH]) {
      expect(phZone(ph, bands)).toBe('hors-plage');
    }
  });

  it('plages vides : toujours hors plage', () => {
    const bands = { tolerated: null, ideal: null };
    for (const ph of [MIN_PH, 7, MAX_PH]) {
      expect(phZone(ph, bands)).toBe('hors-plage');
    }
  });

  it('zones bornes comprises : idéal, toléré, hors plage ; NaN hors plage', () => {
    const bands = phBands(['guppy']);
    expect(phZone(7, bands)).toBe('ideal');
    expect(phZone(8, bands)).toBe('ideal');
    expect(phZone(6.5, bands)).toBe('tolere');
    expect(phZone(8.5, bands)).toBe('tolere');
    expect(phZone(6.49, bands)).toBe('hors-plage');
    expect(phZone(8.51, bands)).toBe('hors-plage');
    expect(phZone(Number.NaN, bands)).toBe('hors-plage');
  });

  it('plage idéale vide mais tolérée commune : orange au mieux', () => {
    const bands = phBands(['neon', 'koi']);
    expect(bands.ideal).toEqual({ min: 7, max: 7 });
    const disjoint = { tolerated: { min: 6, max: 8 }, ideal: null };
    expect(phZone(7, disjoint)).toBe('tolere');
    expect(phZone(5, disjoint)).toBe('hors-plage');
  });

  it('sameBands distingue des plages différentes', () => {
    expect(sameBands(phBands(['neon']), phBands(['guppy']))).toBe(false);
    expect(sameBands(phBands(['neon', 'clown']), phBands(['neon']))).toBe(false);
    expect(sameBands(phBands(['neon', 'clown']), phBands(['clown', 'neon', 'clown']))).toBe(true);
    expect(sameBands({ tolerated: null, ideal: null }, { tolerated: null, ideal: null })).toBe(
      true,
    );
  });

  it('inPhRange et phOutOfTolerance', () => {
    expect(inPhRange(6, { min: 6, max: 7 })).toBe(true);
    expect(inPhRange(Number.NaN, { min: 6, max: 7 })).toBe(false);
    expect(phOutOfTolerance(8.2, 'clown')).toBe(false);
    expect(phOutOfTolerance(7, 'clown')).toBe(true);
  });

  it('chaque zone a un libellé', () => {
    expect(Object.keys(PH_ZONE_LABELS).sort()).toEqual(['hors-plage', 'ideal', 'tolere']);
  });
});
