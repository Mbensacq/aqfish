import { ENVIRONMENT_IDS } from './environment';
import { freshWater, MAX_CONCENTRATION, WATER_TEMPERATURES, type WaterState } from './water';
import {
  COMPOUND_THRESHOLDS,
  DEFAULT_WATER_READOUT,
  GAUGE_MAX,
  isWaterQuality,
  sameReadout,
  sampleWater,
  waterReadout,
  gaugeFill,
  levelOf,
  TEMPERATURE_THRESHOLDS,
  WATER_COMPOUNDS,
  WATER_QUALITIES,
  WATER_QUALITY_LABELS,
  waterQuality,
  waterTurbidity,
  worseQuality,
} from './water-quality';

/** Eau saine du bac tropical modifiée par `patch`. */
function tropical(patch: Partial<WaterState>): WaterState {
  return { ...freshWater('tropical'), ...patch };
}

describe('levelOf', () => {
  const thresholds = { watch: 2, bad: 5 };

  it('zéro : bonne', () => {
    expect(levelOf(0, thresholds)).toBe('bonne');
  });

  it('juste sous un seuil : niveau inférieur ; au seuil : niveau atteint', () => {
    expect(levelOf(1.999999, thresholds)).toBe('bonne');
    expect(levelOf(2, thresholds)).toBe('a-surveiller');
    expect(levelOf(4.999999, thresholds)).toBe('a-surveiller');
    expect(levelOf(5, thresholds)).toBe('mauvaise');
  });

  it('valeurs extrêmes : très grande, mauvaise ; non finie, mauvaise (jamais rassurant)', () => {
    expect(levelOf(MAX_CONCENTRATION, thresholds)).toBe('mauvaise');
    expect(levelOf(Number.NaN, thresholds)).toBe('mauvaise');
    expect(levelOf(Number.POSITIVE_INFINITY, thresholds)).toBe('mauvaise');
  });
});

describe('worseQuality', () => {
  it('renvoie le pire des deux, quel que soit l’ordre', () => {
    for (const a of WATER_QUALITIES) {
      for (const b of WATER_QUALITIES) {
        const expected =
          WATER_QUALITIES[Math.max(WATER_QUALITIES.indexOf(a), WATER_QUALITIES.indexOf(b))];
        expect(worseQuality(a, b)).toBe(expected);
        expect(worseQuality(b, a)).toBe(expected);
      }
    }
  });
});

describe('waterQuality', () => {
  it('eau saine de chaque environnement : bonne', () => {
    for (const id of ENVIRONMENT_IDS) {
      expect(waterQuality(freshWater(id), id)).toBe('bonne');
    }
  });

  it('chaque composé : sous le seuil, bonne ; aux seuils, à surveiller puis mauvaise', () => {
    for (const compound of WATER_COMPOUNDS) {
      const { watch, bad } = COMPOUND_THRESHOLDS[compound];
      expect(waterQuality(tropical({ [compound]: watch * 0.99 }), 'tropical')).toBe('bonne');
      expect(waterQuality(tropical({ [compound]: watch }), 'tropical')).toBe('a-surveiller');
      expect(waterQuality(tropical({ [compound]: bad }), 'tropical')).toBe('mauvaise');
      expect(waterQuality(tropical({ [compound]: MAX_CONCENTRATION }), 'tropical')).toBe(
        'mauvaise',
      );
    }
  });

  it('seuils ordonnés : « à surveiller » avant « mauvaise », strictement positifs', () => {
    for (const { watch, bad } of [...Object.values(COMPOUND_THRESHOLDS), TEMPERATURE_THRESHOLDS]) {
      expect(watch).toBeGreaterThan(0);
      expect(bad).toBeGreaterThan(watch);
    }
  });

  it('température : écart à celle de l’environnement, dans les deux sens', () => {
    const base = WATER_TEMPERATURES.tropical;
    const { watch, bad } = TEMPERATURE_THRESHOLDS;
    expect(waterQuality(tropical({ temperature: base + watch - 0.01 }), 'tropical')).toBe('bonne');
    expect(waterQuality(tropical({ temperature: base + watch }), 'tropical')).toBe('a-surveiller');
    expect(waterQuality(tropical({ temperature: base - watch }), 'tropical')).toBe('a-surveiller');
    expect(waterQuality(tropical({ temperature: base + bad }), 'tropical')).toBe('mauvaise');
    expect(waterQuality(tropical({ temperature: base - bad }), 'tropical')).toBe('mauvaise');
  });

  it('même eau, environnement différent : la température idéale change le verdict', () => {
    // 25 °C : bonne pour le bac tropical, mauvaise pour le bassin (18 °C, écart de 7 °C).
    const water = freshWater('tropical');
    expect(waterQuality(water, 'tropical')).toBe('bonne');
    expect(waterQuality(water, 'bassin')).toBe('mauvaise');
  });

  it('le pire critère l’emporte', () => {
    const water = tropical({
      ammonia: COMPOUND_THRESHOLDS.ammonia.watch,
      nitrate: COMPOUND_THRESHOLDS.nitrate.bad,
    });
    expect(waterQuality(water, 'tropical')).toBe('mauvaise');
  });

  it('le filtre n’entre pas dans l’indicateur', () => {
    expect(waterQuality(tropical({ filter: 0 }), 'tropical')).toBe('bonne');
  });

  it('valeur non finie (état corrompu) : mauvaise', () => {
    expect(waterQuality(tropical({ nitrite: Number.NaN }), 'tropical')).toBe('mauvaise');
    expect(waterQuality(tropical({ temperature: Number.NaN }), 'tropical')).toBe('mauvaise');
  });

  it('chaque niveau a un libellé en toutes lettres', () => {
    expect(WATER_QUALITY_LABELS).toEqual({
      bonne: 'Bonne',
      'a-surveiller': 'À surveiller',
      mauvaise: 'Mauvaise',
    });
  });
});

describe('gaugeFill', () => {
  it('0 à vide, 1 au plein et au-delà, proportionnel entre les deux', () => {
    for (const compound of WATER_COMPOUNDS) {
      expect(gaugeFill(compound, 0)).toBe(0);
      expect(gaugeFill(compound, GAUGE_MAX[compound] / 2)).toBeCloseTo(0.5, 12);
      expect(gaugeFill(compound, GAUGE_MAX[compound])).toBe(1);
      expect(gaugeFill(compound, MAX_CONCENTRATION)).toBe(1);
    }
  });

  it('valeur négative ou non finie : jauge vide', () => {
    expect(gaugeFill('nitrate', -1)).toBe(0);
    expect(gaugeFill('nitrate', Number.NaN)).toBe(0);
  });

  it('le plein de chaque jauge dépasse le seuil « mauvaise » : les trois zones se voient', () => {
    for (const compound of WATER_COMPOUNDS) {
      expect(GAUGE_MAX[compound]).toBeGreaterThan(COMPOUND_THRESHOLDS[compound].bad);
    }
  });
});

describe('waterTurbidity', () => {
  it('trouble seulement pour une eau mauvaise', () => {
    expect(waterTurbidity('bonne')).toBe(0);
    expect(waterTurbidity('a-surveiller')).toBe(0);
    expect(waterTurbidity('mauvaise')).toBe(1);
  });
});

describe('waterReadout et sameReadout', () => {
  it('eau saine : bonne, valeurs entières ; relevé par défaut du bac tropical', () => {
    expect(DEFAULT_WATER_READOUT).toEqual({
      quality: 'bonne',
      temperature: 25,
      target: 25,
      ammonia: 0,
      nitrite: 0,
      nitrate: 0,
      ph: 7,
      phZone: 'ideal',
      // Néons, guppys et corydoras (#236) : idéal commun réduit à 7,0.
      phBands: { tolerated: { min: 6.5, max: 7.8 }, ideal: { min: 7, max: 7 } },
    });
  });

  it('valeurs au dixième ; consigne du chauffage comme température visée', () => {
    const readout = waterReadout(
      tropical({ temperature: 25.26, ammonia: 0.84, nitrite: 1.25, nitrate: 19.96, heater: 27 }),
      'tropical',
    );
    expect(readout).toEqual({
      quality: 'bonne',
      temperature: 25.3,
      target: 27,
      ammonia: 0.8,
      nitrite: 1.3,
      nitrate: 20,
      ph: 7,
      phZone: 'ideal',
      phBands: { tolerated: { min: 4, max: 9.5 }, ideal: { min: 4, max: 9.5 } },
    });
  });

  it('niveau calculé sur la valeur exacte, pas sur l’arrondi', () => {
    // 19,96 s'affiche 20,0 mais reste sous le seuil de 20.
    expect(waterReadout(tropical({ nitrate: 19.96 }), 'tropical').quality).toBe('bonne');
  });

  it('sameReadout : vrai seulement si tout ce qui est affiché est égal', () => {
    const a = waterReadout(tropical({ nitrate: 12.31 }), 'tropical');
    expect(sameReadout(a, waterReadout(tropical({ nitrate: 12.29 }), 'tropical'))).toBe(true);
    for (const key of ['temperature', 'target', 'ammonia', 'nitrite', 'nitrate'] as const) {
      expect(sameReadout(a, { ...a, [key]: a[key] + 0.1 })).toBe(false);
    }
    expect(sameReadout(a, { ...a, quality: 'mauvaise' })).toBe(false);
  });

  it('pH (#236) : au dixième, zone sur la valeur exacte pour les espèces présentes', () => {
    const readout = waterReadout(tropical({ ph: 6.96 }), 'tropical', ['guppy', 'neon']);
    expect(readout.ph).toBe(7);
    // 6,96 s'affiche 7,0 mais reste sous l'idéal du guppy (7 à 8).
    expect(readout.phZone).toBe('tolere');
    expect(waterReadout(tropical({ ph: 6.2 }), 'tropical', ['guppy']).phZone).toBe('hors-plage');
    expect(waterReadout(tropical({ ph: 6.2 }), 'tropical', []).phZone).toBe('ideal');
  });

  it('sameReadout (#236) : sensible au pH, à sa zone et aux plages des espèces', () => {
    const a = waterReadout(tropical({ ph: 6.8 }), 'tropical', ['neon']);
    expect(sameReadout(a, waterReadout(tropical({ ph: 6.81 }), 'tropical', ['neon']))).toBe(true);
    expect(sameReadout(a, { ...a, ph: 6.9 })).toBe(false);
    expect(sameReadout(a, { ...a, phZone: 'tolere' })).toBe(false);
    expect(sameReadout(a, waterReadout(tropical({ ph: 6.8 }), 'tropical', ['corydora']))).toBe(
      false,
    );
  });
});

describe('sampleWater et isWaterQuality', () => {
  it('chaque niveau donne une eau de ce niveau, dans chaque environnement', () => {
    for (const id of ENVIRONMENT_IDS) {
      for (const quality of WATER_QUALITIES) {
        expect(waterQuality(sampleWater(id, quality), id)).toBe(quality);
      }
    }
  });

  it('nouvel objet à chaque appel', () => {
    expect(sampleWater('tropical', 'mauvaise')).not.toBe(sampleWater('tropical', 'mauvaise'));
  });

  it('isWaterQuality : les trois niveaux seulement', () => {
    for (const quality of WATER_QUALITIES) {
      expect(isWaterQuality(quality)).toBe(true);
    }
    for (const value of ['Bonne', 'autre', '', null, undefined, 1]) {
      expect(isWaterQuality(value)).toBe(false);
    }
  });
});
