import { ENVIRONMENT_IDS, environmentById } from './environment';
import { SPECIES_LABELS } from './species-catalog';
import { speciesSheet } from './species-sheet';
import {
  changeWater,
  changeWaterInPlace,
  freshWater,
  readWater,
  stepWater,
  WATER_CHANGE_SHARE,
  type MutableWaterState,
} from './water';
import {
  HARDNESS_TRACE,
  hardnessAfterWaterChange,
  isHardness,
  MAX_HARDNESS,
  MIN_HARDNESS,
  TAP_HARDNESS,
  tapHardness,
  waterHardness,
} from './water-hardness';

describe('dureté de l’eau du robinet (#484)', () => {
  it('chaque environnement a une GH et un KH finis, dans les bornes', () => {
    for (const id of ENVIRONMENT_IDS) {
      const { gh, kh } = tapHardness(id);
      expect(isHardness(gh), `${id}.gh`).toBe(true);
      expect(isHardness(kh), `${id}.kh`).toBe(true);
      expect(Object.isFrozen(TAP_HARDNESS[id]), id).toBe(true);
    }
  });

  it('récif : KH dans les 7–11 dKH de Holmes-Farley', () => {
    expect(tapHardness('recif').kh).toBeGreaterThanOrEqual(7);
    expect(tapHardness('recif').kh).toBeLessThanOrEqual(11);
  });

  it('eau neuve de chaque environnement dans la plage de dureté d’au moins une espèce qui y vit', () => {
    for (const id of ENVIRONMENT_IDS) {
      const tap = tapHardness(id);
      const fits = environmentById(id).species.filter((species) => {
        const { kind, min, max } = speciesSheet(species).hardness.value;
        const value = tap[kind];
        return value >= min && value <= max;
      });
      expect(fits.map((s) => SPECIES_LABELS[s].plural).length, id).toBeGreaterThan(0);
    }
  });
});

describe('waterHardness (#484)', () => {
  it('sans champ : dureté de l’eau du robinet du lieu (eau neuve sans dureté écrite)', () => {
    for (const id of ENVIRONMENT_IDS) {
      expect(waterHardness(freshWater(id), id)).toEqual(TAP_HARDNESS[id]);
      expect('gh' in freshWater(id) || 'kh' in freshWater(id), id).toBe(false);
    }
  });

  it('champs écrits : relus tels quels, bornes comprises', () => {
    expect(waterHardness({ gh: 3.5, kh: 0 }, 'tropical')).toEqual({ gh: 3.5, kh: 0 });
    expect(waterHardness({ gh: MAX_HARDNESS, kh: MIN_HARDNESS }, 'bassin')).toEqual({
      gh: MAX_HARDNESS,
      kh: MIN_HARDNESS,
    });
    expect(waterHardness({ kh: 2 }, 'tropical')).toEqual({ gh: 10, kh: 2 });
  });

  it('valeur non finie ou hors bornes (état corrompu) : celle de l’eau du robinet', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, -0.1, MAX_HARDNESS + 1]) {
      expect(waterHardness({ gh: bad, kh: bad }, 'paludarium'), String(bad)).toEqual(
        TAP_HARDNESS.paludarium,
      );
    }
  });
});

describe('hardnessAfterWaterChange (#484)', () => {
  it('rapproche de la part changée la dureté de celle de l’eau du robinet', () => {
    expect(hardnessAfterWaterChange(20, 10, 0.3)).toBeCloseTo(17, 12);
    expect(hardnessAfterWaterChange(0, 10, 0.3)).toBeCloseTo(3, 12);
    expect(hardnessAfterWaterChange(20, 10, 0)).toBe(20);
    expect(hardnessAfterWaterChange(20, 10, 1)).toBe(10);
    expect(hardnessAfterWaterChange(10, 10, 0.3)).toBe(10);
  });

  it('bornée ; une valeur non finie devient celle de l’eau du robinet', () => {
    expect(hardnessAfterWaterChange(MAX_HARDNESS, MAX_HARDNESS + 100, 0.3)).toBe(MAX_HARDNESS);
    expect(hardnessAfterWaterChange(0, -50, 0.3)).toBe(MIN_HARDNESS);
    expect(hardnessAfterWaterChange(Number.NaN, 8, 0.3)).toBe(8);
    expect(hardnessAfterWaterChange(Infinity, 8, 0.3)).toBe(8);
  });
});

describe('dureté et modèle d’eau (#484)', () => {
  it('le pas de simulation ne touche pas à la dureté', () => {
    const water = { ...freshWater('tropical'), gh: 18, kh: 3 };
    const next = stepWater(water, 600, 45, 288, 24);
    expect(next.gh).toBe(18);
    expect(next.kh).toBe(3);
    expect('gh' in stepWater(freshWater('tropical'), 600, 45, 288, 24)).toBe(false);
  });

  it('changement d’eau : la dureté se rapproche de celle de l’eau du robinet', () => {
    const water = changeWater({ ...freshWater('tropical'), gh: 20, kh: 1 }, 'tropical');
    expect(water.gh).toBeCloseTo(20 + WATER_CHANGE_SHARE * (10 - 20), 12);
    expect(water.kh).toBeCloseTo(1 + WATER_CHANGE_SHARE * (6 - 1), 12);
  });

  it('changements répétés : revenue à l’eau du robinet, le champ disparaît', () => {
    const water: MutableWaterState = { ...freshWater('eaufroide'), gh: 30, kh: 0 };
    let n = 0;
    while ((water.gh !== undefined || water.kh !== undefined) && n < 100) {
      changeWaterInPlace(water, 'eaufroide');
      n += 1;
    }
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(100);
    expect(waterHardness(water, 'eaufroide')).toEqual(TAP_HARDNESS.eaufroide);
  });

  it('écart sous la trace après un changement : le champ disparaît, au-dessus il reste', () => {
    const tap = TAP_HARDNESS.tropical.gh;
    const near = changeWater({ ...freshWater('tropical'), gh: tap + HARDNESS_TRACE }, 'tropical');
    expect('gh' in near).toBe(false);
    const far = changeWater({ ...freshWater('tropical'), gh: tap + 0.1 }, 'tropical');
    expect(far.gh).toBeCloseTo(tap + 0.07, 12);
  });

  it('eau jamais modifiée : le changement d’eau n’écrit aucune dureté', () => {
    const water = changeWater(freshWater('recif'), 'recif');
    expect('gh' in water || 'kh' in water).toBe(false);
  });

  it('déterministe : même eau, même résultat au bit près', () => {
    const a = changeWater({ ...freshWater('bassin'), gh: 3.3, kh: 17.7 }, 'bassin');
    const b = changeWater({ ...freshWater('bassin'), gh: 3.3, kh: 17.7 }, 'bassin');
    expect(a).toEqual(b);
    expect(Object.is(a.gh, b.gh) && Object.is(a.kh, b.kh)).toBe(true);
  });
});

describe('readWater et dureté (#484)', () => {
  it('sans dureté (sauvegarde antérieure) : relue sans champ, dureté de l’eau du robinet', () => {
    const result = readWater(freshWater('tropical'), 'tropical');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('gh' in result.water || 'kh' in result.water).toBe(false);
      expect(waterHardness(result.water, 'tropical')).toEqual(TAP_HARDNESS.tropical);
    }
  });

  it('relit la GH et le KH écrits, bornes comprises', () => {
    for (const [gh, kh] of [
      [0, 0],
      [MAX_HARDNESS, MAX_HARDNESS],
      [12.5, 4],
    ]) {
      const result = readWater({ ...freshWater('bassin'), gh, kh }, 'bassin');
      expect(result).toEqual({ ok: true, water: { ...freshWater('bassin'), gh, kh } });
    }
  });

  it('refuse une dureté non finie, hors bornes ou non numérique', () => {
    for (const bad of [Number.NaN, Infinity, -1, MAX_HARDNESS + 0.5, '10', null]) {
      const gh = readWater({ ...freshWater('tropical'), gh: bad }, 'tropical');
      expect(gh.ok, String(bad)).toBe(false);
      if (!gh.ok) {
        expect(gh.error).toMatch(/^eau : gh doit être un nombre dans \[0, 400\]$/);
      }
      const kh = readWater({ ...freshWater('tropical'), kh: bad }, 'tropical');
      expect(kh.ok, String(bad)).toBe(false);
      if (!kh.ok) {
        expect(kh.error).toMatch(/^eau : kh doit/);
      }
    }
  });

  it('ignore une dureté héritée (propriétés propres seulement)', () => {
    const inherited = Object.create({ gh: 5 }) as Record<string, unknown>;
    Object.assign(inherited, freshWater('tropical'));
    const result = readWater(inherited, 'tropical');
    expect(result.ok && 'gh' in result.water).toBe(false);
  });
});
