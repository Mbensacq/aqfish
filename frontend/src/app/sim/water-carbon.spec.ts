import { describe, expect, it } from 'vitest';

import { SIM_DT } from './constants';
import { dashboardAlerts } from './dashboard-alerts';
import { healthSummary } from './health-summary';
import {
  dosePhRegulatorInPlace,
  PH_REGULATOR_MAX_PER_DAY,
  PH_REGULATOR_STEP,
  PH_REGULATOR_WAIT_SECONDS,
  stepPhRegulatorInPlace,
} from './ph-regulator';
import {
  applyTreatmentInPlace,
  medicationProtects,
  stepTreatmentInPlace,
  TREATMENT_DAY_SECONDS,
  type TreatedSubject,
  type TreatmentContext,
} from './treatment';
import { freshWater, readWater, type MutableWaterState } from './water';
import {
  carbonAgainstMedication,
  CARBON_TREATMENT_WARNING,
  setCarbonInPlace,
} from './water-carbon';
import { waterSample } from './water-dashboard';
import { MAX_PH, MIN_PH, phBands } from './water-ph';
import { waterReadout } from './water-quality';

const CONTEXT: TreatmentContext = { environment: 'tropical', species: ['guppy'], infected: 1 };

function water(extra: Partial<MutableWaterState> = {}): MutableWaterState {
  return { ...freshWater('tropical'), ...extra };
}

function treat(state: MutableWaterState, animals: TreatedSubject[], seconds: number): void {
  for (let t = 0; t < seconds; t += 1) {
    stepTreatmentInPlace(state, animals, 1);
  }
}

describe('charbon actif (#531)', () => {
  it('neutralise un traitement en cours', () => {
    const state = water({ medication: 1, ichCure: 0.1, carbon: true });
    const animals = [{ ich: 10 }];
    treat(state, animals, 900);
    expect(state.medication).toBeUndefined();
    expect(state.ichCure).toBeUndefined();
    expect(animals[0].ich).toBe(10);
  });

  it('laisse le traitement agir sans charbon', () => {
    const state = water({ medication: 1, ichCure: 0.1 });
    treat(state, [{ ich: 10 }], 900);
    expect(medicationProtects(state)).toBe(true);
    expect(state.ichCure).toBeGreaterThan(0.1);
  });

  it('ne retire pas le sel', () => {
    const state = water({ salt: 5, temperature: 26, carbon: true });
    treat(state, [{ ich: 10 }], 900);
    expect(state.salt).toBe(5);
    expect(state.ichCure).toBeGreaterThan(0);
  });

  it('retire la teinte des tanins, pas les feuilles', () => {
    const leaves = { catappa: [1] };
    expect(waterReadout(water(leaves), 'tropical', []).tea).toBe(1);
    const carbon = waterReadout(water({ ...leaves, carbon: true }), 'tropical', []);
    expect(carbon.tea).toBe(0);
    expect(carbon.catappa).toBe(1);
  });

  it('met en garde quand un médicament est versé avec du charbon', () => {
    const outcome = applyTreatmentInPlace(water({ carbon: true }), 'medicament', 1, CONTEXT);
    expect(outcome).toMatchObject({ ok: true, warning: CARBON_TREATMENT_WARNING });
  });

  it('ne met pas en garde sans charbon, ni pour un soin refusé', () => {
    expect(applyTreatmentInPlace(water(), 'medicament', 1, CONTEXT)).not.toHaveProperty('warning');
    const refused = applyTreatmentInPlace(water({ carbon: true }), 'medicament', 0, CONTEXT);
    expect(refused).toMatchObject({ ok: false, reason: 'dose-invalide' });
  });

  it('met en garde quand le charbon rejoint un médicament', () => {
    expect(setCarbonInPlace(water({ medication: 1 }), true).warning).toBe(CARBON_TREATMENT_WARNING);
    expect(setCarbonInPlace(water(), true).warning).toBeUndefined();
  });

  it('se retire sans laisser de champ', () => {
    const state = water();
    setCarbonInPlace(state, true);
    expect(state.carbon).toBe(true);
    setCarbonInPlace(state, false);
    expect(state).toEqual(water());
  });

  it('lève une alerte du tableau de bord tant que le médicament reste', () => {
    const alerts = (state: MutableWaterState) =>
      dashboardAlerts({
        sample: waterSample(state, 'tropical', 0),
        phBands: phBands(['guppy']),
        health: healthSummary([]),
      }).map((alert) => alert.id);
    expect(alerts(water({ carbon: true, medication: 1 }))).toContain('carbon');
    expect(alerts(water({ carbon: true }))).not.toContain('carbon');
    expect(alerts(water({ medication: 1 }))).not.toContain('carbon');
    expect(carbonAgainstMedication(water({ carbon: true }))).toBe(false);
  });
});

describe('régulateur de pH (#531)', () => {
  it('déplace le pH d’un cran dans chaque sens, avec une mise en garde', () => {
    const state = water({ ph: 7 });
    const outcome = dosePhRegulatorInPlace(state, 1);
    expect(state.ph).toBeCloseTo(7 + PH_REGULATOR_STEP, 10);
    expect(outcome).toMatchObject({ ok: true, warning: expect.stringContaining('brusques') });
    const down = water({ ph: 7 });
    dosePhRegulatorInPlace(down, -1);
    expect(down.ph).toBeCloseTo(7 - PH_REGULATOR_STEP, 10);
  });

  it.each([
    [MAX_PH, 1 as const],
    [MIN_PH, -1 as const],
  ])('ne sort pas des bornes du modèle (pH %d)', (ph, direction) => {
    const state = water({ ph });
    expect(dosePhRegulatorInPlace(state, direction)).toMatchObject({ ok: false, reason: 'borne' });
    expect(state).toEqual(water({ ph }));
  });

  it('s’arrête à la borne quand le cran la dépasserait', () => {
    const high = water({ ph: MAX_PH - 0.04 });
    dosePhRegulatorInPlace(high, 1);
    expect(high.ph).toBe(MAX_PH);
    const low = water({ ph: MIN_PH + 0.04 });
    dosePhRegulatorInPlace(low, -1);
    expect(low.ph).toBe(MIN_PH);
  });

  it('plafonne la variation sur une journée simulée', () => {
    const state = water({ ph: 7 });
    let moved = 0;
    for (let t = 0; t < TREATMENT_DAY_SECONDS; t += 1) {
      const before = state.ph;
      dosePhRegulatorInPlace(state, 1);
      moved += Math.abs(state.ph - before);
      stepPhRegulatorInPlace(state, 1);
    }
    expect(moved).toBeLessThanOrEqual(PH_REGULATOR_MAX_PER_DAY + 1e-9);
    expect(moved).toBeCloseTo(PH_REGULATOR_MAX_PER_DAY, 10);
  });

  it('refuse sans changer l’eau pendant l’attente, puis accepte', () => {
    const state = water({ ph: 7 });
    dosePhRegulatorInPlace(state, 1);
    const held = { ...state };
    expect(dosePhRegulatorInPlace(state, -1)).toMatchObject({ ok: false, reason: 'trop-tot' });
    expect(state).toEqual(held);
    stepPhRegulatorInPlace(state, PH_REGULATOR_WAIT_SECONDS);
    expect(state.phRegulatorWait).toBeUndefined();
    expect(dosePhRegulatorInPlace(state, -1).ok).toBe(true);
  });

  it('avance l’attente sans toucher une eau qui n’en a pas', () => {
    const state = water();
    stepPhRegulatorInPlace(state, SIM_DT);
    expect(state).toEqual(water());
  });
});

describe('sauvegarde du charbon et du régulateur (#531)', () => {
  it('relit les deux champs', () => {
    const saved = { ...freshWater('tropical'), carbon: true, phRegulatorWait: 50 };
    expect(readWater(saved, 'tropical')).toMatchObject({
      ok: true,
      water: { carbon: true, phRegulatorWait: 50 },
    });
  });

  it('relit une ancienne sauvegarde sans ces champs', () => {
    const parsed = readWater(freshWater('tropical'), 'tropical');
    expect(parsed.ok).toBe(true);
    expect(parsed).not.toHaveProperty('water.carbon');
    expect(parsed).not.toHaveProperty('water.phRegulatorWait');
  });

  it.each([
    ['carbon', false],
    ['carbon', 1],
    ['phRegulatorWait', -1],
    ['phRegulatorWait', PH_REGULATOR_WAIT_SECONDS + 1],
  ])('refuse %s = %s', (key, value) => {
    expect(readWater({ ...freshWater('tropical'), [key]: value }, 'tropical').ok).toBe(false);
  });
});
