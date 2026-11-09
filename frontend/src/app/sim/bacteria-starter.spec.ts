import { describe, expect, it } from 'vitest';

import {
  BACTERIA_STARTER_REDOSE_AT,
  BACTERIA_STARTER_SECONDS,
  BACTERIA_STARTER_TRACE,
  MAX_BACTERIA_STARTER,
  STARTER_FILTER_GAIN,
  doseBacteriaStarterInPlace,
  stepBacteriaStarterInPlace,
} from './bacteria-starter';
import { SIM_DT } from './constants';
import { parseWorld, serializeWorld } from './save';
import {
  changeWaterInPlace,
  copyWater,
  freshWater,
  readWater,
  stepWaterInPlace,
  type MutableWaterState,
  type WaterState,
} from './water';
import { createDefaultWorld, type MutableWorld } from './world';

const young = (extra: Partial<WaterState> = {}): MutableWaterState =>
  copyWater({ ...freshWater('tropical'), filter: 0.2, ...extra });

/** `seconds` secondes de simulation de l'eau, sans habitants. */
function run(water: MutableWaterState, seconds: number): MutableWaterState {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    stepWaterInPlace(water, SIM_DT, 0, 100, water.temperature);
  }
  return water;
}

describe('amorce de bactéries (#529)', () => {
  it('sans amorce, le filtre ne bouge pas et l’eau ne porte aucun champ de plus', () => {
    const water = run(young(), 600);
    expect(water.filter).toBe(0.2);
    expect('bacteriaStarter' in water).toBe(false);
  });

  it('avec amorce, le filtre mûrit plus vite et de façon reproductible', () => {
    const [a, b, control] = [young(), young(), young()];
    expect(doseBacteriaStarterInPlace(a, 1).ok).toBe(true);
    expect(doseBacteriaStarterInPlace(b, 1).ok).toBe(true);
    run(a, 600);
    run(b, 600);
    run(control, 600);
    expect(a.filter).toBeGreaterThan(control.filter);
    expect(a).toEqual(b);
  });

  it('n’a aucun effet chimique immédiat', () => {
    const water = young({ ammonia: 2, nitrite: 1, nitrate: 5 });
    const before = { ...water };
    doseBacteriaStarterInPlace(water, 1);
    expect({ ...water, bacteriaStarter: undefined }).toEqual({
      ...before,
      bacteriaStarter: undefined,
    });
  });

  it('une dose entière rend exactement son gain, puis la réserve disparaît', () => {
    const water = young();
    doseBacteriaStarterInPlace(water, 1);
    run(water, BACTERIA_STARTER_SECONDS + 1);
    expect(water.filter).toBeCloseTo(0.2 + STARTER_FILTER_GAIN, 6);
    expect(water.bacteriaStarter).toBeUndefined();
  });

  it('plafonne une surdose : réserve bornée, même gain, même vitesse', () => {
    const [big, one] = [young(), young()];
    expect(doseBacteriaStarterInPlace(big, 1e9).ok).toBe(true);
    expect(big.bacteriaStarter).toBe(MAX_BACTERIA_STARTER);
    doseBacteriaStarterInPlace(one, 1);
    expect(run(big, 300)).toEqual(run(one, 300));
  });

  it('refuse une dose répétée tant que la précédente est active, l’accepte ensuite', () => {
    const water = young();
    doseBacteriaStarterInPlace(water, 1);
    const held = { ...water };
    const refused = doseBacteriaStarterInPlace(water, 1);
    expect(refused).toMatchObject({ ok: false, reason: 'surdosage' });
    expect(water).toEqual(held);
    water.bacteriaStarter = BACTERIA_STARTER_REDOSE_AT;
    expect(doseBacteriaStarterInPlace(water, 1).ok).toBe(true);
    expect(water.bacteriaStarter).toBe(MAX_BACTERIA_STARTER);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('refuse la dose %s', (amount) => {
    const water = young();
    expect(doseBacteriaStarterInPlace(water, amount)).toMatchObject({
      ok: false,
      reason: 'dose-invalide',
    });
    expect(water.bacteriaStarter).toBeUndefined();
  });

  it('n’a aucun effet sur un filtre déjà mûr', () => {
    const water = copyWater(freshWater('tropical'));
    const before = { ...water };
    expect(doseBacteriaStarterInPlace(water, 1)).toMatchObject({
      ok: false,
      reason: 'filtre-mur',
    });
    expect(water).toEqual(before);
  });

  it('ne dépasse jamais 1 et disparaît dès que le filtre est mûr', () => {
    const water = young({ filter: 0.999, bacteriaStarter: 1 });
    run(water, 600);
    expect(water.filter).toBe(1);
    expect(water.bacteriaStarter).toBeUndefined();
  });

  it('ne fait rien sans réserve, même appelé directement', () => {
    const water = young();
    stepBacteriaStarterInPlace(water, SIM_DT);
    expect(water).toEqual(young());
  });

  it('un changement d’eau dilue la réserve, puis retire les traces', () => {
    const water = young({ bacteriaStarter: 1 });
    changeWaterInPlace(water, 'tropical');
    expect(water.bacteriaStarter).toBeCloseTo(0.7, 10);
    water.bacteriaStarter = BACTERIA_STARTER_TRACE;
    changeWaterInPlace(water, 'tropical');
    expect(water.bacteriaStarter).toBeUndefined();
  });

  describe('sauvegarde', () => {
    it('relit la réserve', () => {
      const parsed = readWater({ ...young(), bacteriaStarter: 0.4 }, 'tropical');
      expect(parsed).toMatchObject({ ok: true, water: { bacteriaStarter: 0.4 } });
    });

    it('charge une ancienne sauvegarde sans le champ', () => {
      const parsed = readWater({ ...freshWater('tropical') }, 'tropical');
      expect(parsed.ok).toBe(true);
      expect(parsed.ok && 'bacteriaStarter' in parsed.water).toBe(false);
    });

    it.each([-0.1, 1.5, 'x'])('refuse la réserve %s', (value) => {
      expect(readWater({ ...young(), bacteriaStarter: value }, 'tropical').ok).toBe(false);
    });

    it('fait l’aller-retour dans un monde complet', () => {
      const world = createDefaultWorld(7, 'tropical') as MutableWorld;
      world.water = young({ bacteriaStarter: 0.8 });
      const back = parseWorld(serializeWorld(world));
      expect(back).toMatchObject({ ok: true });
      expect(back.ok && back.world.water.bacteriaStarter).toBe(0.8);
    });
  });
});
