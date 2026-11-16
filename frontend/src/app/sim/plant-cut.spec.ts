import {
  CARE_SESSION_TEXT,
  careSessionPruned,
  careSessionSummary,
  completeCareStep,
  MAX_CARE_CUTS,
  pruneStepHint,
  readCareSession,
  serializeCareSession,
  skipAbsentCareSteps,
  skipCareStep,
  startCareSession,
  withCut,
  type CareSession,
} from './care-session';
import { SIM_DT } from './constants';
import { DEFAULT_DECOR } from './decor';
import { environmentWater } from './environment';
import { isGrowingPlant, plantLimits, stepPlantGrowthInPlace } from './plant-growth';
import { MAX_CONCENTRATION, type MutableWaterState } from './water';
import {
  createDefaultWorld,
  createWorld,
  cutWorldPlantInPlace,
  PLANT_CUT_AMMONIA,
  worldHasCuttablePlants,
  worldHasPrunablePlants,
  worldShownPlantGrowth,
  type MutableWorld,
} from './world';

/** Bac tropical au décor par défaut, sans animal, plantes à tige poussées de `growth` voxels. */
function grownTank(growth: number): MutableWorld {
  const world = createWorld(42, [], [], DEFAULT_DECOR, 'tropical') as MutableWorld;
  const plantGrowth: Record<string, number> = {};
  for (const item of world.decor.filter(isGrowingPlant)) {
    plantGrowth[String(item.seed)] = growth;
  }
  (world.water as MutableWaterState).plantGrowth = plantGrowth;
  return world;
}

const tallIndices = (world: MutableWorld): number[] =>
  world.decor.flatMap((item, index) => (isGrowingPlant(item) ? [index] : []));

/** Séance arrivée à l'étape « taille » (étapes d'avant sautées). */
function atPrune(): CareSession {
  let session = startCareSession();
  while (session.step !== 'taille') {
    session = skipCareStep(session);
  }
  return session;
}

describe('taille de la séance d’entretien (#623)', () => {
  describe('coupe dans le monde', () => {
    it('réduit la plante coupée de cette partie seulement, et charge un peu l’eau', () => {
      const world = grownTank(9.5);
      const [first, second] = tallIndices(world);
      expect(second).toBeDefined();
      const before = worldShownPlantGrowth(world, first!);
      const other = worldShownPlantGrowth(world, second!);
      const ammonia = world.water.ammonia;
      const nitrite = world.water.nitrite;
      expect(cutWorldPlantInPlace(world, first!)).toBe(true);
      expect(worldShownPlantGrowth(world, first!)).toBeLessThan(before);
      expect(worldShownPlantGrowth(world, second!)).toBe(other);
      expect(world.water.ammonia).toBeCloseTo(ammonia + PLANT_CUT_AMMONIA, 12);
      expect(world.water.nitrite).toBe(nitrite);
    });

    it('déchet d’une coupe : une constante, bornée au maximum des concentrations', () => {
      expect(PLANT_CUT_AMMONIA).toBeGreaterThan(0);
      expect(PLANT_CUT_AMMONIA).toBeLessThan(0.5);
      const world = grownTank(9.5);
      (world.water as MutableWaterState).ammonia = MAX_CONCENTRATION;
      expect(cutWorldPlantInPlace(world, tallIndices(world)[0]!)).toBe(true);
      expect(world.water.ammonia).toBe(MAX_CONCENTRATION);
    });

    it('plante déjà taillée : chaque coupe raccourcit encore, jusqu’à sa hauteur d’origine', () => {
      const world = grownTank(9.5);
      const index = tallIndices(world)[0]!;
      const heights: number[] = [worldShownPlantGrowth(world, index)];
      while (cutWorldPlantInPlace(world, index)) {
        heights.push(worldShownPlantGrowth(world, index));
        expect(heights.length).toBeLessThan(50);
      }
      expect(heights.length).toBeGreaterThanOrEqual(2);
      expect(heights.at(-1)).toBe(0);
      for (let i = 1; i < heights.length; i++) {
        expect(heights[i]).toBeLessThan(heights[i - 1]!);
      }
      // Rien à couper : ni pousse retirée, ni déchet.
      const ammonia = world.water.ammonia;
      expect(cutWorldPlantInPlace(world, index)).toBe(false);
      expect(world.water.ammonia).toBe(ammonia);
    });

    it('plante sans pousse, autre élément, indice inconnu : aucune exception, monde inchangé', () => {
      const bare = createWorld(42, [], [], DEFAULT_DECOR, 'tropical') as MutableWorld;
      const grown = grownTank(9.5);
      const rock = grown.decor.findIndex((d) => d.kind === 'rock');
      for (const [world, index] of [
        [bare, tallIndices(bare)[0]!],
        [grown, rock],
        [grown, -1],
        [grown, 999],
        [grown, 0.5],
        [grown, Number.NaN],
      ] as const) {
        const water = JSON.stringify(world.water);
        expect(() => cutWorldPlantInPlace(world, index)).not.toThrow();
        expect(cutWorldPlantInPlace(world, index)).toBe(false);
        expect(JSON.stringify(world.water)).toBe(water);
      }
    });

    it('pousse à couper (#644) : vraie tant qu’une coupe raccourcit, fausse à hauteur d’origine', () => {
      const bare = createWorld(42, [], [], DEFAULT_DECOR, 'tropical') as MutableWorld;
      expect(worldHasPrunablePlants(bare)).toBe(true);
      expect(worldHasCuttablePlants(bare)).toBe(false);
      // Pousse trop courte pour que la taille en retire un voxel : rien à couper.
      expect(worldHasCuttablePlants(grownTank(0.5))).toBe(false);
      const world = grownTank(9.5);
      expect(worldHasCuttablePlants(world)).toBe(true);
      for (const index of tallIndices(world)) {
        while (cutWorldPlantInPlace(world, index)) {
          // Jusqu'à la hauteur d'origine.
        }
      }
      expect(worldHasCuttablePlants(world)).toBe(false);
      for (const env of ['recif', 'bassin'] as const) {
        expect(worldHasCuttablePlants(createDefaultWorld(42, env))).toBe(false);
      }
    });

    it('bac sans plante à tailler (récif, bassin) : rien n’est coupé', () => {
      for (const env of ['recif', 'bassin'] as const) {
        const world = createDefaultWorld(42, env) as MutableWorld;
        expect(worldHasPrunablePlants(world)).toBe(false);
        const water = JSON.stringify(world.water);
        for (let index = 0; index < world.decor.length; index++) {
          expect(cutWorldPlantInPlace(world, index)).toBe(false);
        }
        expect(JSON.stringify(world.water)).toBe(water);
      }
    });

    it('la plante repousse ensuite selon son modèle', () => {
      const world = grownTank(9.5);
      const index = tallIndices(world)[0]!;
      const item = world.decor[index]!;
      const surface = environmentWater(world).maxY;
      expect(cutWorldPlantInPlace(world, index)).toBe(true);
      const growth = world.water.plantGrowth as Record<string, number>;
      const key = String(item.seed);
      const cut = growth[key] ?? 0;
      const dt = 600 * SIM_DT;
      stepPlantGrowthInPlace(growth, world.decor, dt, surface);
      expect(growth[key]).toBeCloseTo(cut + plantLimits(item, surface).rate * dt, 12);
    });
  });

  describe('étape de la séance', () => {
    it('une phrase « pourquoi » parle des feuilles abîmées et des nitrates', () => {
      expect(CARE_SESSION_TEXT.taille.why).toMatch(/abîmées/);
      expect(CARE_SESSION_TEXT.taille.why).toMatch(/nitrates/);
    });

    it('chaque coupe est comptée, seulement à l’étape « taille »', () => {
      expect(withCut(startCareSession())).toEqual(startCareSession());
      let session = atPrune();
      expect(careSessionPruned(session)).toBe(false);
      session = withCut(withCut(session));
      expect(session.cuts).toBe(2);
      expect(careSessionPruned(session)).toBe(true);
      session = completeCareStep(session);
      expect(session.step).toBe('bilan');
      expect(session.outcomes.taille).toBe('fait');
      expect(withCut(session)).toBe(session);
    });

    it('coupes plafonnées à `MAX_CARE_CUTS`', () => {
      let session: CareSession = { ...atPrune(), cuts: MAX_CARE_CUTS };
      session = withCut(session);
      expect(session.cuts).toBe(MAX_CARE_CUTS);
    });

    it('étape sautée sans coupe : rien à enregistrer au calendrier', () => {
      const session = skipCareStep(atPrune());
      expect(session.outcomes.taille).toBe('saute');
      expect(careSessionPruned(session)).toBe(false);
    });

    it('bac sans plante à tailler : étape sautée d’office, bilan sans ligne « taille »', () => {
      const session = skipAbsentCareSteps(atPrune(), false);
      expect(session.step).toBe('bilan');
      expect(careSessionPruned(session)).toBe(false);
      expect(careSessionSummary(session, false).map((line) => line.step)).toEqual([
        'vitres',
        'siphon',
        'filtre',
        'eau',
      ]);
      expect(careSessionSummary(session).map((line) => line.step)).toContain('taille');
      // Avec des plantes, ou à une autre étape : rien ne change.
      const prune = atPrune();
      expect(skipAbsentCareSteps(prune, true)).toBe(prune);
      const start = startCareSession();
      expect(skipAbsentCareSteps(start, false)).toBe(start);
    });

    it('consigne « rien à tailler » sans pousse à couper, tant qu’aucune coupe n’est faite (#644)', () => {
      expect(pruneStepHint(0, true)).toBe(pruneStepHint(0));
      expect(pruneStepHint(0, false)).toBe(
        'Aucune tige ne dépasse : rien à tailler pour l’instant, passez l’étape.',
      );
      expect(pruneStepHint(Number.NaN, false)).toBe(pruneStepHint(0, false));
      // Après une coupe, le compte des coupes l'emporte, même s'il ne reste rien à couper.
      expect(pruneStepHint(1, false)).toBe(pruneStepHint(1));
      expect(pruneStepHint(2, false)).toMatch(/^2 coupes/);
    });

    it('consigne : invite à couper, puis compte les coupes', () => {
      expect(pruneStepHint(0)).toMatch(/Cliquez ou touchez/);
      expect(pruneStepHint(Number.NaN)).toBe(pruneStepHint(0));
      expect(pruneStepHint(1)).toMatch(/^Une coupe/);
      expect(pruneStepHint(3)).toMatch(/^3 coupes/);
    });

    it('coupes enregistrées et relues ; séance ancienne sans coupes : aucune coupe', () => {
      const session = withCut(atPrune());
      expect(readCareSession(serializeCareSession(session))).toEqual(session);
      const old = readCareSession(
        JSON.stringify({
          step: 'taille',
          outcomes: { vitres: 'fait', siphon: 'saute', filtre: 'saute', eau: 'saute' },
        }),
      );
      expect(old).not.toBeNull();
      expect(old!.cuts).toBeUndefined();
      expect(careSessionPruned(old!)).toBe(false);
      expect(serializeCareSession(atPrune())).not.toMatch(/cuts/);
    });

    it('coupes enregistrées hors bornes : séance refusée', () => {
      const base = {
        step: 'taille',
        outcomes: { vitres: 'fait', siphon: 'saute', filtre: 'saute', eau: 'saute' },
      };
      for (const cuts of [-1, 1.5, MAX_CARE_CUTS + 1, 'deux', null]) {
        expect(readCareSession(JSON.stringify({ ...base, cuts }))).toBeNull();
      }
    });
  });
});
