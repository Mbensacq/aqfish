import {
  CATAPPA_DECAY_SECONDS,
  CATAPPA_PH_FLOOR,
  CATAPPA_REFERENCE_LITERS,
  MAX_CATAPPA_LEAVES,
  catappaActive,
  catappaPh,
  catappaStrength,
  catappaTint,
  readCatappa,
  stepCatappaInPlace,
  withCatappaCount,
} from './catappa';
import { SIM_DT } from './constants';
import { parseWorld, serializeWorld } from './save';
import {
  freshWater,
  readWater,
  stepWater,
  stepWaterInPlace,
  type MutableWaterState,
} from './water';
import { likesAcidWater } from './water-ph';
import { CATAPPA_HEALTH_FLOOR, HEALTH_FLOOR, stepHealth, stepWellbeingInPlace } from './wellbeing';
import { SPECIES } from './species';
import {
  advance,
  advanceInPlace,
  createDefaultWorld,
  setWorldCatappa,
  setWorldCatappaInPlace,
  type MutableWorld,
} from './world';

const LITERS = CATAPPA_REFERENCE_LITERS;

/** Avance l'eau `water` de `seconds` secondes sans habitant (aucune dérive organique). */
function runEmpty(water: MutableWaterState, seconds: number, dt = 1): MutableWaterState {
  for (let t = 0; t < seconds; t += dt) {
    stepWaterInPlace(water, dt, 0, LITERS, water.temperature);
  }
  return water;
}

describe('feuilles de catappa (#239)', () => {
  describe('réserve et décomposition', () => {
    it('réserve totale : 0 sans feuille, somme des réserves sinon', () => {
      expect(catappaStrength(undefined)).toBe(0);
      expect(catappaStrength([])).toBe(0);
      expect(catappaStrength([1, 0.5, 0])).toBe(1.5);
      expect(catappaStrength([Number.NaN, -1, 0.25])).toBe(0.25);
      expect(catappaActive([0, 0])).toBe(false);
      expect(catappaActive([0, 0.01])).toBe(true);
    });

    it('une feuille se décompose linéairement en CATAPPA_DECAY_SECONDS, puis reste à 0', () => {
      const leaves = [1];
      stepCatappaInPlace(leaves, CATAPPA_DECAY_SECONDS / 2);
      expect(leaves[0]).toBeCloseTo(0.5, 12);
      stepCatappaInPlace(leaves, CATAPPA_DECAY_SECONDS);
      expect(leaves[0]).toBe(0);
      const corrupt = [Number.NaN];
      stepCatappaInPlace(corrupt, 1);
      expect(corrupt[0]).toBe(0);
    });

    it('teinte : un seul palier, 1 tant qu’une feuille agit', () => {
      expect(catappaTint(undefined)).toBe(0);
      expect(catappaTint([0])).toBe(0);
      expect(catappaTint([0.001])).toBe(1);
      expect(catappaTint([1, 1, 1])).toBe(1);
    });
  });

  describe('pH', () => {
    it('effet nul à 0 feuille : même eau, au bit près', () => {
      const without = runEmpty({ ...freshWater('tropical') } as MutableWaterState, 600);
      const withEmpty = runEmpty(
        { ...freshWater('tropical'), catappa: [] } as MutableWaterState,
        600,
      );
      expect(withEmpty.ph).toBe(without.ph);
      expect(without.ph).toBe(7);
      expect(catappaPh(7, 0, LITERS, 1)).toBe(7);
    });

    it('abaisse le pH sans jamais passer sous le plancher, même avec 5 feuilles longtemps', () => {
      const water = {
        ...freshWater('tropical'),
        catappa: withCatappaCount(undefined, MAX_CATAPPA_LEAVES),
      } as MutableWaterState;
      let previous = water.ph;
      for (let i = 0; i < 40; i++) {
        runEmpty(water, 300, 5);
        expect(water.ph).toBeLessThanOrEqual(previous);
        expect(water.ph).toBeGreaterThanOrEqual(CATAPPA_PH_FLOOR);
        previous = water.ph;
      }
      expect(water.ph).toBeLessThan(6.3);
      // Pas énorme (dt extrême) : borné par le plancher.
      expect(catappaPh(8, 5, 10, 1e9)).toBe(CATAPPA_PH_FLOOR);
    });

    it('une feuille seule : lent et modéré (7,0 → environ 6,6 sur toute sa vie)', () => {
      const water = { ...freshWater('tropical'), catappa: [1] } as MutableWaterState;
      runEmpty(water, 60);
      // Lent : moins d'un centième de pH par minute simulée.
      expect(7 - water.ph).toBeGreaterThan(0);
      expect(7 - water.ph).toBeLessThan(0.01);
      runEmpty(water, CATAPPA_DECAY_SECONDS, 5);
      expect(water.ph).toBeGreaterThan(6.5);
      expect(water.ph).toBeLessThan(6.7);
      expect(water.catappa).toEqual([0]);
      // Feuille décomposée : plus d'effet.
      const spent = water.ph;
      runEmpty(water, 600);
      expect(water.ph).toBe(spent);
    });

    it('un pH déjà sous le plancher ne baisse pas à cause des feuilles', () => {
      expect(catappaPh(5.5, 5, LITERS, 1000)).toBe(5.5);
      expect(catappaPh(CATAPPA_PH_FLOOR, 5, LITERS, 1000)).toBe(CATAPPA_PH_FLOOR);
    });

    it('plus d’eau, effet plus lent ; plus de feuilles, effet plus rapide', () => {
      const small = catappaPh(7, 1, LITERS / 2, 600);
      const ref = catappaPh(7, 1, LITERS, 600);
      const big = catappaPh(7, 1, LITERS * 2, 600);
      const more = catappaPh(7, 3, LITERS, 600);
      expect(small).toBeLessThan(ref);
      expect(big).toBeGreaterThan(ref);
      expect(more).toBeLessThan(ref);
    });

    it('stepWater ne modifie ni l’eau ni ses feuilles', () => {
      const water = { ...freshWater('tropical'), catappa: [1, 0.5] };
      const next = stepWater(water, 10, 0, LITERS, 24);
      expect(water.catappa).toEqual([1, 0.5]);
      expect(next.catappa).not.toBe(water.catappa);
      expect(next.catappa![0]).toBeLessThan(1);
      expect(next.ph).toBeLessThan(water.ph);
    });
  });

  describe('nombre de feuilles', () => {
    it('ajoute des feuilles neuves, retire d’abord les plus décomposées', () => {
      expect(withCatappaCount(undefined, 2)).toEqual([1, 1]);
      expect(withCatappaCount([0.2, 0.9], 3)).toEqual([1, 0.9, 0.2]);
      expect(withCatappaCount([0.2, 0.9, 0], 1)).toEqual([0.9]);
      expect(withCatappaCount([0.4], 0)).toEqual([]);
    });

    it('refuse un nombre hors de [0, 5] ou non entier', () => {
      for (const bad of [-1, 6, 1.5, Number.NaN]) {
        expect(() => withCatappaCount([], bad)).toThrow(RangeError);
      }
    });

    it('setWorldCatappa : nouvel état ; à 0, le champ disparaît de l’eau', () => {
      const world = createDefaultWorld(7);
      const withLeaves = setWorldCatappa(world, 3);
      expect(world.water.catappa).toBeUndefined();
      expect(withLeaves.water.catappa).toEqual([1, 1, 1]);
      const none = setWorldCatappa(withLeaves, 0);
      expect(Object.hasOwn(none.water, 'catappa')).toBe(false);
      expect(() => setWorldCatappa(world, 9)).toThrow(RangeError);
    });
  });

  describe('santé', () => {
    it('espèces d’eau acide : néon, rasbora, tétra, kuhli ; pas le guppy', () => {
      expect(likesAcidWater('neon')).toBe(true);
      expect(likesAcidWater('rasbora')).toBe(true);
      expect(likesAcidWater('tetra')).toBe(true);
      expect(likesAcidWater('kuhli')).toBe(true);
      expect(likesAcidWater('guppy')).toBe(false);
      expect(likesAcidWater('clown')).toBe(false);
    });

    it('plancher relevé : la baisse s’arrête à CATAPPA_HEALTH_FLOOR, sans saut vers le haut', () => {
      expect(CATAPPA_HEALTH_FLOOR).toBeGreaterThan(HEALTH_FLOOR);
      expect(stepHealth(1, 2, 10_000, CATAPPA_HEALTH_FLOOR)).toBe(CATAPPA_HEALTH_FLOOR);
      expect(stepHealth(1, 2, 10_000)).toBe(HEALTH_FLOOR);
      // Déjà sous le plancher relevé : ne baisse plus, ne remonte pas d'un coup.
      expect(stepHealth(0.25, 2, 10_000, CATAPPA_HEALTH_FLOOR)).toBe(0.25);
      // Sans cause : regain habituel.
      expect(stepHealth(0.25, 0, 1, CATAPPA_HEALTH_FLOOR)).toBeGreaterThan(0.25);
    });

    it('stepWellbeingInPlace : seul le néon profite des feuilles, le guppy non', () => {
      const animals = [
        { species: 'neon' as const, hunger: 1, health: 1 },
        { species: 'guppy' as const, hunger: 1, health: 1 },
      ];
      stepWellbeingInPlace(animals, 10_000, true, (id) => SPECIES[id], 7, true);
      expect(animals[0].health).toBe(CATAPPA_HEALTH_FLOOR);
      expect(animals[1].health).toBe(HEALTH_FLOOR);
    });
  });

  describe('monde, déterminisme et sauvegarde', () => {
    it('même graine, mêmes feuilles : même eau au bit près ; pH plus bas qu’avec 0 feuille', () => {
      const a = setWorldCatappa(createDefaultWorld(11), 4);
      const b = setWorldCatappa(createDefaultWorld(11), 4);
      const none = createDefaultWorld(11);
      const steps = Math.round(20 / SIM_DT);
      const ra = advance(a, steps);
      const rb = advance(b, steps);
      const rn = advance(none, steps);
      expect(ra.water).toEqual(rb.water);
      expect(ra.water.ph).toBeLessThan(rn.water.ph);
      expect(ra.water.catappa![0]).toBeLessThan(1);
      // Graine différente : eau identique (aucun hasard dans l'eau).
      const other = advance(setWorldCatappa(createDefaultWorld(12), 4), steps);
      expect(other.water.catappa).toEqual(ra.water.catappa);
    });

    it('sauvegarde : aller-retour avec feuilles', () => {
      const world: MutableWorld = createDefaultWorld(5);
      setWorldCatappaInPlace(world, 2);
      advanceInPlace(world, 60);
      const text = serializeWorld(world);
      const back = parseWorld(text);
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(back.world.water.catappa).toEqual(world.water.catappa);
        expect(back.world.water.ph).toBe(world.water.ph);
      }
    });

    it('ancienne sauvegarde sans feuilles : chargée sans erreur, aucune feuille', () => {
      const world = createDefaultWorld(5);
      const text = serializeWorld(world);
      expect(text).not.toContain('catappa');
      const back = parseWorld(text);
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(back.world.water.catappa).toBeUndefined();
      }
    });

    it('relecture : liste vide oubliée, valeurs invalides refusées', () => {
      const base = freshWater('tropical');
      const empty = readWater({ ...base, catappa: [] }, 'tropical');
      expect(empty.ok && Object.hasOwn(empty.water, 'catappa')).toBe(false);
      expect(readWater({ ...base, catappa: [1, 0.3] }, 'tropical')).toEqual({
        ok: true,
        water: { ...base, catappa: [1, 0.3] },
      });
      for (const bad of [[1.5], [-0.1], ['1'], [Number.NaN], [1, 1, 1, 1, 1, 1], 'x', {}]) {
        expect(readWater({ ...base, catappa: bad }, 'tropical').ok).toBe(false);
      }
      expect(readCatappa([0, 1])).toEqual({ ok: true, leaves: [0, 1] });
    });
  });
});
