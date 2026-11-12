import {
  FEEDER_CAPACITY,
  FEEDER_DEFAULT_HOURS,
  FEEDER_MAX_RATIONS_PER_DAY,
  clockHoursIn,
  copyFeeder,
  createFeeder,
  feederHours,
  feederReadout,
  feederSpot,
  hasFeeder,
  isFeederEmpty,
  isFeederHour,
  rationsBetween,
  rationsDue,
  rationsInFrame,
  readFeeder,
  refillFeederInPlace,
  takeRationsInPlace,
} from './auto-feeder';
import { SIM_DT } from './constants';
import { createDayClock, freezeClockAt, hourAt } from './daylight';
import { dashboardAlerts, feederAlert } from './dashboard-alerts';
import { environmentWater } from './environment';
import { EMPTY_HEALTH_SUMMARY } from './health-summary';
import { parseWorld, serializeWorld } from './save';
import { scaledDt } from './sim-speed';
import { DEFAULT_WATER_SAMPLE } from './water-dashboard';
import { DEFAULT_WATER_READOUT } from './water-quality';
import {
  advance,
  createDefaultWorld,
  createWorld,
  refillWorldFeederInPlace,
  setWorldFeederInPlace,
  type MutableWorld,
  type World,
} from './world';
import { setCareModeInPlace } from './care-mode';

/** Horloge partant de `hour`, journée courte de 48 s (tests rapides : 2 s par heure de jeu). */
const DAY_SECONDS = 48;
const clockAt = (hour: number) => createDayClock(hour, DAY_SECONDS);
/** Pas `SIM_DT` dans une heure de jeu, avec `clockAt`. */
const STEPS_PER_HOUR = Math.round(DAY_SECONDS / 24 / SIM_DT);

/** Bac tropical vide (sans poisson : pas rapides), avec un distributeur aux heures `hours`. */
function worldWithFeeder(hours: readonly number[], seed = 7): MutableWorld {
  const world = structuredClone(createWorld(seed)) as MutableWorld;
  expect(setWorldFeederInPlace(world, hours)).toBe(true);
  return world;
}

describe('distributeur automatique (#583)', () => {
  describe('heures', () => {
    it('heures entières de 0 à 23 seulement', () => {
      expect(isFeederHour(0)).toBe(true);
      expect(isFeederHour(23)).toBe(true);
      expect(isFeederHour(24)).toBe(false);
      expect(isFeederHour(-1)).toBe(false);
      expect(isFeederHour(8.5)).toBe(false);
      expect(isFeederHour('8')).toBe(false);
      expect(isFeederHour(Number.NaN)).toBe(false);
    });

    it('normalise : distinctes et triées, 1 à 4', () => {
      expect(feederHours([18, 9, 9])).toEqual([9, 18]);
      expect(feederHours([])).toBeNull();
      expect(feederHours([1, 2, 3, 4, 5])).toBeNull();
      expect(feederHours([1, 1, 2, 2, 3, 3, 4, 4])).toEqual([1, 2, 3, 4]);
      expect(feederHours([7, 24])).toBeNull();
    });

    it('heures proposées pour 1 à 4 rations : valides', () => {
      for (let n = 1; n <= FEEDER_MAX_RATIONS_PER_DAY; n++) {
        const hours = FEEDER_DEFAULT_HOURS[n as 1 | 2 | 3 | 4];
        expect(hours).toHaveLength(n);
        expect(feederHours(hours)).toEqual(hours);
      }
    });

    it('distributeur neuf : plein ; heures invalides refusées', () => {
      expect(createFeeder()).toEqual({ hours: [9], stock: FEEDER_CAPACITY });
      expect(FEEDER_CAPACITY).toBe(14);
      expect(() => createFeeder([25])).toThrow(RangeError);
    });

    it('bacs vitrés seulement', () => {
      expect(hasFeeder('tropical')).toBe(true);
      expect(hasFeeder('recif')).toBe(true);
      expect(hasFeeder('eaufroide')).toBe(true);
      expect(hasFeeder('bassin')).toBe(false);
      expect(hasFeeder('paludarium')).toBe(false);
    });
  });

  describe('planification (fonction pure)', () => {
    it('une ration au passage de son heure, borne de départ exclue, d’arrivée incluse', () => {
      expect(rationsBetween(8.9, 0.1, [9])).toBe(1);
      expect(rationsBetween(9, 0.5, [9])).toBe(0);
      expect(rationsBetween(8, 0.5, [9])).toBe(0);
      expect(rationsBetween(8, 0, [9])).toBe(0);
      expect(rationsBetween(8, -1, [9])).toBe(0);
      expect(rationsBetween(8, Number.NaN, [9])).toBe(0);
      expect(rationsBetween(8, Number.POSITIVE_INFINITY, [9])).toBe(0);
    });

    it('minuit : une ration à 0 h est lâchée en passant de 23 h 30 à 0 h 30', () => {
      expect(rationsBetween(23.5, 1, [0])).toBe(1);
      expect(rationsBetween(23.5, 0.4, [0])).toBe(0);
      expect(rationsBetween(23.5, 0.5, [0])).toBe(1);
    });

    it('changement de jour : chaque heure revient une fois par jour', () => {
      expect(rationsBetween(10, 24, [9, 18])).toBe(2);
      expect(rationsBetween(10, 48, [9, 18])).toBe(4);
      expect(rationsBetween(10, 23, [9])).toBe(1);
      expect(rationsBetween(10, 22.9, [9])).toBe(0);
      // Heure continue (au-delà de 24) : même compte qu'en heure ramenée.
      expect(rationsBetween(34, 24, [9, 18])).toBe(rationsBetween(10, 24, [9, 18]));
    });

    it('heure de départ invalide : erreur', () => {
      expect(() => rationsBetween(Number.NaN, 1, [9])).toThrow(RangeError);
    });

    it('horloge figée : aucune heure ne passe, aucune ration', () => {
      const frozen = freezeClockAt(clockAt(8), 8.99);
      expect(clockHoursIn(frozen, 600)).toBe(0);
      expect(rationsDue(frozen, 0, 600, [9])).toBe(0);
      expect(clockHoursIn(clockAt(8), DAY_SECONDS / 24)).toBeCloseTo(1, 12);
      expect(clockHoursIn(clockAt(8), -1)).toBe(0);
    });

    it('rationsDue : une journée simulée, une ration par heure prévue', () => {
      expect(rationsDue(clockAt(8), 0, DAY_SECONDS, [9, 18])).toBe(2);
      expect(rationsDue(clockAt(8), 600, 600, [9])).toBe(0);
    });

    it('pas successifs : chaque ration une seule fois, même sur une fin de pas exacte', () => {
      const clock = clockAt(0);
      const hours = [0, 1, 2, 3];
      let total = 0;
      for (let tick = 0; tick < 2 * 24 * STEPS_PER_HOUR; tick++) {
        total += rationsDue(clock, tick * SIM_DT, (tick + 1) * SIM_DT, hours);
      }
      // Départ à 0 h exclu : 0 h du premier jour non comptée, 0 h du troisième jour comptée.
      expect(total).toBe(8);
    });

    it('vitesse ×8 : une image couvre 8 fois plus d’heures, et lâche plusieurs rations', () => {
      const clock = createDayClock(8, 1200);
      const frame = 1 / 60;
      // 8 h 59 : la ration de 9 h tombe dans l'image à ×8, pas à ×1.
      const from = 9 - clockHoursIn(clock, frame * 4);
      expect(rationsInFrame(from, frame, 8, clock, [9])).toBe(1);
      expect(rationsInFrame(from, frame, 1, clock, [9])).toBe(0);
      // Une longue image à ×8 (1 200 s réelles = 8 journées) : 8 rations par heure prévue.
      expect(rationsInFrame(8, 1200, 8, clock, [9, 18])).toBe(16);
      expect(rationsInFrame(8, 1200, 0, clock, [9])).toBe(0);
    });

    it('vitesse de l’application (au plus ×4) : temps simulé = temps réel × vitesse', () => {
      const clock = createDayClock(8, 1200);
      const frame = 1 / 60;
      const from = 9 - clockHoursIn(clock, frame * 2);
      expect(rationsInFrame(from, frame, 4, clock, [9])).toBe(
        rationsBetween(from, clockHoursIn(clock, scaledDt(frame, 4)), [9]),
      );
      expect(rationsInFrame(from, frame, 4, clock, [9])).toBe(1);
    });
  });

  describe('réserve', () => {
    it('prend au plus la réserve, puis plus rien : vide', () => {
      const feeder = createFeeder([9]);
      expect(takeRationsInPlace(feeder, 3)).toBe(3);
      expect(feeder.stock).toBe(11);
      expect(takeRationsInPlace(feeder, 20)).toBe(11);
      expect(feeder.stock).toBe(0);
      expect(isFeederEmpty(feeder)).toBe(true);
      expect(takeRationsInPlace(feeder, 1)).toBe(0);
      expect(takeRationsInPlace(feeder, Number.NaN)).toBe(0);
      refillFeederInPlace(feeder);
      expect(feeder.stock).toBe(FEEDER_CAPACITY);
      expect(isFeederEmpty(undefined)).toBe(false);
    });

    it('alerte « distributeur vide » seulement quand il est vide', () => {
      expect(feederAlert(false)).toBeNull();
      const alert = feederAlert(true)!;
      expect(alert.id).toBe('feeder');
      expect(alert.severity).toBe('attention');
      expect(alert.message).toBe('Distributeur vide');
      const input = {
        sample: DEFAULT_WATER_SAMPLE,
        phBands: DEFAULT_WATER_READOUT.phBands,
        health: EMPTY_HEALTH_SUMMARY,
      };
      expect(dashboardAlerts(input).some((a) => a.id === 'feeder')).toBe(false);
      expect(dashboardAlerts({ ...input, feederEmpty: true }).some((a) => a.id === 'feeder')).toBe(
        true,
      );
    });

    it('relevé du tableau de bord', () => {
      expect(feederReadout({ hours: [9, 18], stock: 0 })).toEqual({
        stock: 0,
        capacity: 14,
        hours: [9, 18],
        schedule: '09:00 · 18:00',
        empty: true,
      });
    });

    it('point de chute dans l’eau, au fond à gauche', () => {
      const water = environmentWater('tropical');
      const spot = feederSpot(water);
      expect(spot.x).toBeGreaterThan(water.minX);
      expect(spot.x).toBeLessThan((water.minX + water.maxX) / 2);
      expect(spot.z).toBeGreaterThan(water.minZ);
      expect(spot.z).toBeLessThan((water.minZ + water.maxZ) / 2);
    });
  });

  describe('dans le monde', () => {
    it('sans distributeur : le monde avance comme avant, au bit près', () => {
      const world = createDefaultWorld(7);
      const withThenWithout = structuredClone(world) as MutableWorld;
      setWorldFeederInPlace(withThenWithout, [9]);
      setWorldFeederInPlace(withThenWithout, null);
      expect(withThenWithout.feeder).toBeUndefined();
      const clock = clockAt(8);
      expect(advance(withThenWithout, 300, clock)).toEqual(advance(world, 300, clock));
    });

    it('lâche une ration (comme un clic) à l’heure prévue, réserve diminuée', () => {
      const world = worldWithFeeder([9]);
      const clock = clockAt(8.5);
      const before = advance(world, STEPS_PER_HOUR / 2 - 1, clock);
      expect(before.food).toHaveLength(0);
      expect(before.feeder!.stock).toBe(14);
      const after = advance(before, 2, clock);
      expect(hourAt(clock, after.time)).toBeGreaterThan(9);
      expect(after.food.length).toBeGreaterThan(0);
      expect(after.feeder!.stock).toBe(13);
    });

    it('vitesse ×8 : mêmes rations, qu’on avance par images de 8 fois plus de pas ou pas à pas', () => {
      const clock = clockAt(8);
      const world = worldWithFeeder([9, 18]);
      const day = 24 * STEPS_PER_HOUR;
      // ×8 : 8 fois plus de pas par image ; le monde ne voit que des pas `SIM_DT`.
      let big: World = world;
      for (let frame = 0; frame < day / (8 * 5); frame++) {
        big = advance(big, 8 * 5, clock);
      }
      const fine = advance(world, day, clock);
      expect(big.feeder).toEqual(fine.feeder);
      expect(fine.feeder!.stock).toBe(12);
      expect(big).toEqual(fine);
    });

    it('réserve de 14 rations : vide, plus de ration', () => {
      const clock = clockAt(8);
      // 4 rations par jour : vide au bout de 3,5 jours.
      const world = advance(worldWithFeeder([8, 12, 16, 20]), 5 * 24 * STEPS_PER_HOUR, clock);
      expect(world.feeder!.stock).toBe(0);
      expect(isFeederEmpty(world.feeder)).toBe(true);
      const nextIds = world.nextFoodId;
      const later = advance(world, 24 * STEPS_PER_HOUR, clock);
      expect(later.nextFoodId).toBe(nextIds);
      // Rempli : les rations reprennent.
      const refilled = structuredClone(later) as MutableWorld;
      expect(refillWorldFeederInPlace(refilled)).toBe(true);
      expect(advance(refilled, 24 * STEPS_PER_HOUR, clock).feeder!.stock).toBe(10);
    });

    it('sans horloge ou en mode décor : aucune ration', () => {
      const world = worldWithFeeder([9]);
      expect(advance(world, 2 * STEPS_PER_HOUR).feeder!.stock).toBe(14);
      const decor = structuredClone(world) as MutableWorld;
      setCareModeInPlace(decor, 'decor');
      expect(advance(decor, 2 * STEPS_PER_HOUR, clockAt(8.5)).feeder!.stock).toBe(14);
    });

    it('réglage : heures changées sans toucher à la réserve ; refus hors bornes ou bassin', () => {
      const world = worldWithFeeder([9]);
      (world.feeder as { stock: number }).stock = 5;
      expect(setWorldFeederInPlace(world, [18, 7])).toBe(true);
      expect(world.feeder).toEqual({ hours: [7, 18], stock: 5 });
      expect(setWorldFeederInPlace(world, [30])).toBe(false);
      expect(world.feeder).toEqual({ hours: [7, 18], stock: 5 });
      const pond = structuredClone(createDefaultWorld(7, 'bassin')) as MutableWorld;
      expect(setWorldFeederInPlace(pond, [9])).toBe(false);
      expect(pond.feeder).toBeUndefined();
      expect(refillWorldFeederInPlace(pond)).toBe(false);
    });
  });

  describe('sauvegarde', () => {
    it('distributeur enregistré puis relu à l’identique', () => {
      const world = worldWithFeeder([8, 20]);
      (world.feeder as { stock: number }).stock = 3;
      const parsed = parseWorld(serializeWorld(world));
      expect(parsed.ok).toBe(true);
      expect(parsed.ok && parsed.world.feeder).toEqual({ hours: [8, 20], stock: 3 });
      expect(copyFeeder(world.feeder!)).toEqual(world.feeder);
    });

    it('ancien fichier (sans distributeur) : chargé sans erreur, aucun distributeur', () => {
      const text = serializeWorld(createDefaultWorld(7));
      expect(text).not.toContain('feeder');
      const parsed = parseWorld(text);
      expect(parsed.ok).toBe(true);
      expect(parsed.ok && parsed.world.feeder).toBeUndefined();
    });

    it('distributeur invalide : refusé avec un message', () => {
      const data = JSON.parse(serializeWorld(createDefaultWorld(7))) as Record<string, unknown>;
      for (const feeder of [
        { hours: [9], stock: 15 },
        { hours: [9, 9], stock: 3 },
        { hours: [], stock: 3 },
        { hours: [24], stock: 3 },
        { hours: [9], stock: 1.5 },
        [],
        null,
      ]) {
        const parsed = parseWorld(JSON.stringify({ ...data, feeder }));
        expect(parsed.ok).toBe(false);
      }
      const problems: string[] = [];
      expect(readFeeder({ hours: [9], stock: -1 }, problems)).toBeNull();
      expect(problems[0]).toContain('feeder.stock');
    });

    it('distributeur dans un bassin : refusé', () => {
      const data = JSON.parse(serializeWorld(createDefaultWorld(7, 'bassin'))) as Record<
        string,
        unknown
      >;
      const parsed = parseWorld(JSON.stringify({ ...data, feeder: { hours: [9], stock: 3 } }));
      expect(parsed.ok).toBe(false);
    });
  });
});
