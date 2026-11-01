import { ICH_AGGRAVATED_AT, ichStage, stepIchInPlace } from './disease';
import type { SpeciesId } from './species';
import {
  applyTreatmentInPlace,
  heatCeiling,
  ichCureSeconds,
  ichCycleDays,
  ichProtected,
  ICH_CURE_CYCLES,
  MEDICATION_EFFECTIVE,
  MEDICATION_HALF_LIFE,
  medicationDaysLeft,
  sameTreatment,
  stepTreatmentInPlace,
  TREATMENT_DAY_SECONDS,
  TREATMENT_KINDS,
  TREATMENTS,
  treatmentGroup,
  treatmentHazard,
  treatmentReadout,
  treatmentSourcesLine,
  treatmentSourceText,
  treatmentStatusText,
  type TreatmentContext,
} from './treatment';
import {
  changeWaterInPlace,
  copyWater,
  freshWater,
  MAX_MEDICATION,
  MAX_SALT,
  readWater,
  type MutableWaterState,
} from './water';
import { advanceInPlace, createWorld, infectWorldInPlace, treatWorldInPlace } from './world';

/** Bac tropical de 8 néons, tous au stade aggravé. */
interface Animal {
  readonly id: number;
  readonly species: SpeciesId;
  ich?: number;
}

function sickNeons(count = 8): Animal[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    species: 'neon' as const,
    ich: ICH_AGGRAVATED_AT,
  }));
}

function infected(animals: readonly Animal[]): number {
  return animals.filter((a) => a.ich !== undefined).length;
}

function context(animals: readonly Animal[]): TreatmentContext {
  return {
    environment: 'tropical',
    species: animals.map((a) => a.species),
    infected: infected(animals),
  };
}

/**
 * Fait vivre la maladie et le traitement de `seconds` secondes simulées par pas de 1 s
 * (graine 42, sans stress), en appelant `dose(jour)` au début de chaque pas. Renvoie la
 * seconde de la guérison complète, ou `null`.
 */
function run(
  water: MutableWaterState,
  animals: Animal[],
  seconds: number,
  dose: (second: number) => void = () => undefined,
  start = 0,
): number | null {
  for (let t = start; t < start + seconds; t++) {
    dose(t);
    stepIchInPlace(animals, 1, 0, 'tropical', 42, t, ichProtected(water));
    stepTreatmentInPlace(water, animals, 1);
    if (infected(animals) === 0) {
      return t + 1;
    }
  }
  return null;
}

const DAY = TREATMENT_DAY_SECONDS;

describe('traitements des points blancs (#361)', () => {
  describe('guérison', () => {
    it('médicament redosé tous les deux jours : bac guéri en 5 jours à 24 °C, à graine fixe', () => {
      const once = () => {
        const water = copyWater(freshWater('tropical'));
        const animals = sickNeons();
        const doses = new Set([0, 2 * DAY, 4 * DAY]);
        const cured = run(water, animals, 8 * DAY, (t) => {
          if (doses.has(t)) {
            const outcome = applyTreatmentInPlace(water, 'medicament', 1, context(animals));
            expect(outcome.ok).toBe(true);
          }
        });
        return { cured, water, animals };
      };
      const first = once();
      expect(first.cured).not.toBeNull();
      // Cinq cycles d'un jour à 24 °C, à une seconde près.
      expect(first.cured!).toBeGreaterThanOrEqual(5 * DAY - 1);
      expect(first.cured!).toBeLessThanOrEqual(5 * DAY + 1);
      expect(first.water.ichCure).toBeUndefined();
      expect(first.animals.every((a) => a.ich === undefined)).toBe(true);
      // Déterministe : même résultat à la seconde près.
      expect(once().cured).toBe(first.cured);
    });

    it('sel à 5 g/L dans une eau à 24 °C : guéri sans redoser, le sel reste', () => {
      const water = copyWater(freshWater('tropical'));
      const animals = sickNeons(3);
      for (let i = 0; i < 5; i++) {
        expect(applyTreatmentInPlace(water, 'sel', 1, context(animals)).ok).toBe(true);
      }
      expect(water.salt).toBe(5);
      const cured = run(water, animals, 6 * DAY)!;
      expect(Math.abs(cured - 5 * DAY)).toBeLessThanOrEqual(1);
      expect(water.salt).toBe(5);
    });

    it('les points reculent pendant le traitement, puis disparaissent', () => {
      const water = copyWater(freshWater('tropical'));
      const animals = sickNeons(2);
      applyTreatmentInPlace(water, 'medicament', 1, context(animals));
      run(water, animals, 2 * DAY);
      expect(water.ichCure).toBeCloseTo(0.4, 5);
      expect(animals[0].ich).toBeCloseTo(0.6 * ICH_AGGRAVATED_AT, 3);
      expect(ichStage(animals[0].ich)).toBe('visible');
      applyTreatmentInPlace(water, 'medicament', 1, context(animals));
      run(water, animals, 1.5 * DAY, undefined, 2 * DAY);
      // Au-delà des deux tiers, plus aucun signe visible (incubation).
      expect(ichStage(animals[0].ich)).toBe('incubation');
    });

    it('arrêté trop tôt (une seule dose) : la cure s’efface et la maladie reprend', () => {
      const water = copyWater(freshWater('tropical'));
      const animals = sickNeons();
      applyTreatmentInPlace(water, 'medicament', 1, context(animals));
      // Une dose agit ≈ 2,3 jours, le traitement en demande 5.
      const lapse = Math.round(2.4 * DAY);
      expect(run(water, animals, lapse)).toBeNull();
      expect(water.ichCure).toBeUndefined();
      expect(water.medication).toBeLessThan(MEDICATION_EFFECTIVE);
      expect(infected(animals)).toBe(8);
      // Les points avaient reculé (cure à ≈ 46 %)…
      expect(Math.max(...animals.map((a) => a.ich!))).toBeLessThan(0.7 * ICH_AGGRAVATED_AT);
      // … puis, sans protection, les infections vieillissent de nouveau : la maladie reprend.
      run(water, animals, DAY, undefined, lapse);
      expect(animals.every((a) => ichStage(a.ich) === 'aggravee')).toBe(true);
    });

    it('un changement d’eau sous le sel interrompt le traitement', () => {
      const water = copyWater(freshWater('tropical'));
      const animals = sickNeons(2);
      water.salt = 5;
      run(water, animals, DAY);
      expect(water.ichCure).toBeCloseTo(0.2, 5);
      changeWaterInPlace(water, 'tropical');
      expect(water.salt).toBeCloseTo(3.5, 10);
      expect(ichProtected(water)).toBe(false);
      run(water, animals, 1, undefined, DAY);
      expect(water.ichCure).toBeUndefined();
      expect(infected(animals)).toBe(2);
    });

    it('protégé : aucune nouvelle infection, même sous stress et avec des malades', () => {
      const water = copyWater(freshWater('tropical'));
      water.medication = 1;
      const animals: Animal[] = [
        { id: 0, species: 'neon', ich: ICH_AGGRAVATED_AT },
        ...Array.from({ length: 20 }, (_, i) => ({ id: i + 1, species: 'neon' as const })),
      ];
      for (let t = 0; t < 600; t++) {
        stepIchInPlace(animals, 1, 4, 'tropical', 7, t, ichProtected(water));
      }
      expect(infected(animals)).toBe(1);
      // Sans traitement, la même scène contamine le bac.
      const untreated: Animal[] = animals.map((a) => ({ id: a.id, species: a.species }));
      untreated[0].ich = ICH_AGGRAVATED_AT;
      for (let t = 0; t < 600; t++) {
        stepIchInPlace(untreated, 1, 4, 'tropical', 7, t, false);
      }
      expect(infected(untreated)).toBeGreaterThan(1);
    });

    it('le rythme dépend de la température : plus froid, traitement plus long', () => {
      expect(ichCycleDays(26)).toBe(1);
      expect(ichCycleDays(24)).toBe(1);
      expect(ichCycleDays(23.9)).toBe(2);
      expect(ichCycleDays(19)).toBe(2);
      expect(ichCycleDays(18.9)).toBe(4);
      expect(ichCycleDays(Number.NaN)).toBe(4);
      expect(ichCureSeconds(24)).toBe(ICH_CURE_CYCLES * DAY);
      expect(ichCureSeconds(18)).toBe(4 * ICH_CURE_CYCLES * DAY);
    });

    it('le sel n’agit pas sous 24 °C', () => {
      const water = { ...copyWater(freshWater('bassin')), salt: 5 };
      expect(water.temperature).toBeLessThan(24);
      expect(ichProtected(water)).toBe(false);
      expect(ichProtected({ ...water, temperature: 24 })).toBe(true);
    });
  });

  describe('pas du traitement', () => {
    it('le médicament se dégrade (demi-vie d’une journée) puis disparaît', () => {
      const water = copyWater(freshWater('tropical'));
      water.medication = 1;
      stepTreatmentInPlace(water, [], MEDICATION_HALF_LIFE);
      expect(water.medication).toBeCloseTo(0.5, 10);
      stepTreatmentInPlace(water, [], 20 * MEDICATION_HALF_LIFE);
      expect(water.medication).toBeUndefined();
    });

    it('bac sans malade : aucune cure, rien de guéri ; bac sans produit : cure effacée', () => {
      const water = copyWater(freshWater('tropical'));
      water.medication = 1;
      expect(stepTreatmentInPlace(water, [{ ich: undefined }], 1)).toBe(0);
      expect(water.ichCure).toBeUndefined();
      const bare = { ...copyWater(freshWater('tropical')), ichCure: 0.5 };
      stepTreatmentInPlace(bare, [{ ich: 600 }], 1);
      expect(bare.ichCure).toBeUndefined();
    });

    it('renvoie le nombre de guéris au pas de la guérison', () => {
      const water = { ...copyWater(freshWater('tropical')), medication: 1, ichCure: 0.999999 };
      expect(stepTreatmentInPlace(water, [{ ich: 10 }, { ich: 900 }, {}], 1)).toBe(2);
    });

    it('dt invalide : RangeError, eau inchangée', () => {
      const water = { ...copyWater(freshWater('tropical')), medication: 1 };
      for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => stepTreatmentInPlace(water, [], dt)).toThrow(RangeError);
      }
      expect(water.medication).toBe(1);
    });
  });

  describe('gestes et erreurs', () => {
    it('dose nulle, négative ou non finie : refusée, eau inchangée', () => {
      const water = copyWater(freshWater('tropical'));
      const before = { ...water };
      for (const kind of TREATMENT_KINDS) {
        for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
          const outcome = applyTreatmentInPlace(water, kind, amount, context(sickNeons(1)));
          expect(outcome).toMatchObject({ ok: false, reason: 'dose-invalide' });
        }
      }
      expect(water).toEqual(before);
    });

    it('bac sans malade : aucun traitement donné', () => {
      const water = copyWater(freshWater('tropical'));
      for (const kind of TREATMENT_KINDS) {
        const outcome = applyTreatmentInPlace(water, kind, 1, {
          environment: 'tropical',
          species: ['guppy'],
          infected: 0,
        });
        expect(outcome).toMatchObject({ ok: false, reason: 'aucun-malade' });
      }
      expect(water).toEqual(freshWater('tropical'));
    });

    it('sel et médicament refusés avec un amphibien dans le bac ; la chaleur reste permise', () => {
      for (const amphibian of ['axolotl', 'grenouille', 'triton'] as const) {
        expect(treatmentGroup(amphibian)).toBe('amphibien');
        const ctx: TreatmentContext = {
          environment: 'tropical',
          species: ['guppy', amphibian],
          infected: 1,
        };
        for (const kind of ['sel', 'medicament'] as const) {
          const water = copyWater(freshWater('tropical'));
          const outcome = applyTreatmentInPlace(water, kind, 1, ctx);
          expect(outcome).toMatchObject({ ok: false, reason: 'toxique' });
          expect(outcome.message).toContain('amphibiens');
          expect(outcome.message).toContain('Produits et traitements');
          expect(water.salt).toBeUndefined();
          expect(water.medication).toBeUndefined();
        }
      }
      expect(treatmentGroup('neon')).toBe('poisson');
    });

    it('sel et médicament refusés avec un invertébré dans le bac', () => {
      const groupOf = (id: SpeciesId) => (id === 'guppy' ? 'invertebre' : 'poisson');
      for (const kind of ['sel', 'medicament'] as const) {
        const hazard = treatmentHazard(kind, ['neon', 'guppy'], groupOf);
        expect(hazard).toMatchObject({ ok: false, reason: 'toxique' });
        expect(hazard!.message).toContain('invertébrés');
        expect(hazard!.message).not.toContain('amphibiens');
      }
      expect(treatmentHazard('chaleur', ['guppy'], groupOf)).toBeNull();
      expect(treatmentHazard('sel', ['neon'], groupOf)).toBeNull();
    });

    it('sel : surdosage refusé au-delà de 5 g/L, prudence pour les espèces sensibles', () => {
      const water = copyWater(freshWater('tropical'));
      const first = applyTreatmentInPlace(water, 'sel', 1, context(sickNeons(1)));
      expect(first).toMatchObject({ ok: true });
      expect(first.ok && first.warning).toContain('néons');
      expect(first.message).toContain('Il en faut 5 g/L');
      expect(applyTreatmentInPlace(water, 'sel', 4, context(sickNeons(1))).ok).toBe(true);
      const over = applyTreatmentInPlace(water, 'sel', 1, context(sickNeons(1)));
      expect(over).toMatchObject({ ok: false, reason: 'surdosage' });
      expect(water.salt).toBe(MAX_SALT);
      const guppies = applyTreatmentInPlace(copyWater(freshWater('tropical')), 'sel', 1, {
        environment: 'tropical',
        species: ['guppy'],
        infected: 1,
      });
      expect(guppies.ok && guppies.warning).toBeUndefined();
    });

    it('sel en eau froide : accepté, avec le rappel qu’il n’agit qu’à 24 °C', () => {
      const water = copyWater(freshWater('bassin'));
      const outcome = applyTreatmentInPlace(water, 'sel', 1, {
        environment: 'bassin',
        species: ['koi'],
        infected: 1,
      });
      expect(outcome.ok).toBe(true);
      expect(outcome.message).toContain('24 °C');
    });

    it('médicament : redosé trop tôt ou plus d’une dose à la fois, refusé', () => {
      const water = copyWater(freshWater('tropical'));
      expect(applyTreatmentInPlace(water, 'medicament', 2, context(sickNeons(1)))).toMatchObject({
        ok: false,
        reason: 'surdosage',
      });
      expect(applyTreatmentInPlace(water, 'medicament', 1, context(sickNeons(1))).ok).toBe(true);
      expect(applyTreatmentInPlace(water, 'medicament', 1, context(sickNeons(1)))).toMatchObject({
        ok: false,
        reason: 'surdosage',
      });
      water.medication = 0.5;
      expect(applyTreatmentInPlace(water, 'medicament', 1, context(sickNeons(1))).ok).toBe(true);
      expect(water.medication).toBe(MAX_MEDICATION);
    });

    it('chaleur : montée pas à pas, plafonnée à la plage tolérée de l’espèce la plus frileuse', () => {
      // Néon : 26 °C au plus ; guppy : 28 °C.
      expect(heatCeiling(['neon', 'guppy', 'guppy'])).toBe(26);
      expect(heatCeiling([])).toBe(32);
      const water = copyWater(freshWater('tropical'));
      const ctx = context([...sickNeons(1), { id: 9, species: 'guppy' }]);
      expect(applyTreatmentInPlace(water, 'chaleur', 1, ctx).ok).toBe(true);
      expect(water.heater).toBe(25);
      // L'eau est encore à 24 °C : un degré d'écart, encore permis.
      const second = applyTreatmentInPlace(water, 'chaleur', 1, ctx);
      expect(second.ok).toBe(true);
      expect(water.heater).toBe(26);
      const ceiling = applyTreatmentInPlace(water, 'chaleur', 1, ctx);
      expect(ceiling).toMatchObject({ ok: false, reason: 'plafond-espece' });
      expect(ceiling.message).toContain('néons');
      expect(water.heater).toBe(26);
    });

    it('chaleur : plafond atteint en cours de geste, et montée trop rapide refusée', () => {
      const water = { ...copyWater(freshWater('tropical')), heater: 25.5, temperature: 25.5 };
      const capped = applyTreatmentInPlace(water, 'chaleur', 1, context(sickNeons(1)));
      expect(capped.ok).toBe(true);
      expect(capped.message).toContain('Plafond atteint');
      expect(water.heater).toBe(26);
      const guppies: TreatmentContext = {
        environment: 'tropical',
        species: ['guppy'],
        infected: 1,
      };
      const lagging = { ...copyWater(freshWater('tropical')), heater: 26 };
      expect(applyTreatmentInPlace(lagging, 'chaleur', 1, guppies)).toMatchObject({
        ok: false,
        reason: 'montee-trop-rapide',
      });
      expect(lagging.heater).toBe(26);
      expect(
        applyTreatmentInPlace(copyWater(freshWater('tropical')), 'chaleur', 3, guppies),
      ).toMatchObject({ ok: false, reason: 'montee-trop-rapide' });
    });
  });

  describe('changement d’eau et sauvegarde', () => {
    it('un changement d’eau retire 30 % du produit, les traces disparaissent', () => {
      const water = { ...copyWater(freshWater('tropical')), salt: 5, medication: 1 };
      changeWaterInPlace(water, 'tropical');
      expect(water.salt).toBeCloseTo(3.5, 10);
      expect(water.medication).toBeCloseTo(0.7, 10);
      const traces = { ...copyWater(freshWater('tropical')), salt: 0.06, medication: 0.012 };
      changeWaterInPlace(traces, 'tropical');
      expect(traces.salt).toBeUndefined();
      expect(traces.medication).toBeUndefined();
    });

    it('relit sel, médicament et cure ; refuse les valeurs hors bornes', () => {
      const saved = { ...freshWater('tropical'), salt: 4, medication: 0.6, ichCure: 0.3 };
      const read = readWater(JSON.parse(JSON.stringify(saved)), 'tropical');
      expect(read).toEqual({ ok: true, water: saved });
      for (const [key, value] of [
        ['salt', 6],
        ['salt', -1],
        ['medication', 2],
        ['medication', 'x'],
        ['ichCure', 1],
        ['ichCure', Number.NaN],
      ] as const) {
        const result = readWater({ ...freshWater('tropical'), [key]: value }, 'tropical');
        expect(result.ok, `${key}=${String(value)}`).toBe(false);
      }
      expect(readWater(freshWater('tropical'), 'tropical')).toEqual({
        ok: true,
        water: freshWater('tropical'),
      });
    });
  });

  describe('dans le monde', () => {
    it('treatWorldInPlace compte les malades et les espèces du bac ; la cure avance au pas', () => {
      const world = createWorld(42, [{ species: 'neon', count: 4 }]);
      expect(treatWorldInPlace(world, 'medicament', 1)).toMatchObject({
        ok: false,
        reason: 'aucun-malade',
      });
      infectWorldInPlace(world);
      expect(treatWorldInPlace(world, 'medicament', 1).ok).toBe(true);
      advanceInPlace(world, 60);
      expect(world.water.ichCure).toBeGreaterThan(0);
      expect(world.water.medication).toBeLessThan(1);
    });
  });

  describe('affichage', () => {
    it('relevé : produits, jours restants et délai avant de redoser', () => {
      expect(treatmentReadout(freshWater('tropical'))).toBeNull();
      const water = { ...freshWater('tropical'), salt: 5, medication: 1, ichCure: 0.5 };
      const readout = treatmentReadout(water)!;
      expect(readout).toEqual({
        products: 'sel 5,0 g/L et médicament 1,0 dose',
        remainingDays: 2.5,
        medicationDays: 2.3,
      });
      expect(treatmentStatusText(readout)).toBe(
        'En cours : sel 5,0 g/L et médicament 1,0 dose, encore 2,5 j ; redoser le médicament avant 2,3 j.',
      );
      expect(treatmentStatusText(null)).toBe('Aucun traitement en cours.');
      const salted = treatmentReadout({ ...water, medication: undefined })!;
      expect(salted.medicationDays).toBeNull();
      expect(treatmentStatusText(salted)).toBe('En cours : sel 5,0 g/L, encore 2,5 j.');
    });

    it('sameTreatment, medicationDaysLeft', () => {
      const a = treatmentReadout({ ...freshWater('tropical'), medication: 1, ichCure: 0.2 });
      expect(sameTreatment(a, { ...a! })).toBe(true);
      expect(sameTreatment(a, null)).toBe(false);
      expect(sameTreatment(null, null)).toBe(true);
      expect(sameTreatment(a, { ...a!, remainingDays: 1 })).toBe(false);
      expect(medicationDaysLeft(MEDICATION_EFFECTIVE)).toBe(0);
      expect(medicationDaysLeft(0.4)).toBeCloseTo(1, 10);
    });

    it('chaque traitement affiche sa source (ou « approximation de jeu ») et son niveau de preuve', () => {
      for (const kind of TREATMENT_KINDS) {
        expect(treatmentSourceText(kind)).toContain(TREATMENTS[kind].source);
        expect(treatmentSourceText(kind)).toContain('niveau de preuve');
      }
      expect(TREATMENTS.chaleur.source).toContain('approximation de jeu');
      expect(treatmentSourcesLine()).toBe(
        'Sources : chaleur, approximation de jeu (soutien) ; sel, Merck ; médicament, notice Sera (efficaces).',
      );
    });
  });
});
