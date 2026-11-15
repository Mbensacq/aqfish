import { ALGAE_NITRATE_FULL, ALGAE_NITRATE_LIMIT } from './algae';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import {
  FOULING_FULL_DAYS,
  FOULING_GRACE_DAYS,
  FOULING_NITRATE_BOOST,
  NO_FOULING,
  foulingLevel,
  sampleFouling,
  tankFouling,
  trackingStart,
  worldFouling,
  type FoulingWorld,
} from './fouling';
import { initialMaintenance, maintenanceDone } from './maintenance';

const DAY = DEFAULT_DAY_LENGTH_SECONDS;

function world(overrides: Partial<FoulingWorld> = {}): FoulingWorld {
  return {
    environment: 'tropical',
    time: 30 * DAY,
    water: { nitrate: 0 },
    maintenance: initialMaintenance(0),
    ...overrides,
  };
}

describe('foulingLevel', () => {
  it('est nul juste après un geste et pendant tout le délai de grâce', () => {
    expect(foulingLevel(0, 0)).toBe(0);
    expect(foulingLevel(FOULING_GRACE_DAYS * DAY, 0)).toBe(0);
    expect(foulingLevel(FOULING_GRACE_DAYS * DAY, ALGAE_NITRATE_FULL)).toBe(0);
  });

  it('croît avec le temps puis plafonne à 1', () => {
    const levels = [4, 8, 12, 16, 20].map((d) => foulingLevel(d * DAY, 0));
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    }
    expect(foulingLevel((FOULING_GRACE_DAYS + FOULING_FULL_DAYS / 2) * DAY, 0)).toBeCloseTo(0.5);
    expect(foulingLevel((FOULING_GRACE_DAYS + FOULING_FULL_DAYS) * DAY, 0)).toBe(1);
    expect(foulingLevel(1e9 * DAY, 0)).toBe(1);
  });

  it('croît avec les nitrates au-delà du seuil « à surveiller », sans effet en dessous', () => {
    const t = 8 * DAY;
    expect(foulingLevel(t, ALGAE_NITRATE_LIMIT)).toBe(foulingLevel(t, 0));
    const mid = foulingLevel(t, (ALGAE_NITRATE_LIMIT + ALGAE_NITRATE_FULL) / 2);
    const full = foulingLevel(t, ALGAE_NITRATE_FULL);
    expect(mid).toBeGreaterThan(foulingLevel(t, 0));
    expect(full).toBeGreaterThan(mid);
    expect(full).toBeCloseTo(foulingLevel(t, 0) * (1 + FOULING_NITRATE_BOOST));
    // Au-delà du plein de la jauge : pas plus vite.
    expect(foulingLevel(t, 10 * ALGAE_NITRATE_FULL)).toBe(full);
  });

  it('reste dans [0, 1] pour toute entrée, non finie ou négative comprise', () => {
    for (const e of [-DAY, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(foulingLevel(e, 0)).toBe(0);
    }
    for (const n of [-50, Number.NaN, Number.POSITIVE_INFINITY]) {
      const level = foulingLevel(10 * DAY, n);
      expect(level).toBe(foulingLevel(10 * DAY, 0));
    }
    expect(foulingLevel(1e300, 1e300)).toBe(1);
  });

  it('est déterministe', () => {
    expect(foulingLevel(9.5 * DAY, 33)).toBe(foulingLevel(9.5 * DAY, 33));
  });
});

describe('tankFouling', () => {
  it('compte depuis le début du suivi tant que vitres et sol n’ont jamais été nettoyés', () => {
    const state = initialMaintenance(2 * DAY);
    expect(trackingStart(state)).toBe(2 * DAY);
    const f = tankFouling(state, 14 * DAY, 0);
    expect(f.glass).toBe(foulingLevel(12 * DAY, 0));
    expect(f.floor).toBe(f.glass);
  });

  it('début du suivi : la plus ancienne des tâches suivies dès le début', () => {
    const state = maintenanceDone(initialMaintenance(DAY), 'waterChange', 9 * DAY);
    expect(trackingStart(state)).toBe(DAY);
  });

  it('la raclette remet les vitres à zéro, le siphon le sol, chacun seul', () => {
    let state = initialMaintenance(0);
    const dirty = tankFouling(state, 20 * DAY, 0);
    expect(dirty.glass).toBeGreaterThan(0);
    expect(dirty.floor).toBeGreaterThan(0);
    state = maintenanceDone(state, 'glass', 20 * DAY);
    const glassDone = tankFouling(state, 20 * DAY, 0);
    expect(glassDone.glass).toBe(0);
    expect(glassDone.floor).toBe(dirty.floor);
    state = maintenanceDone(state, 'siphon', 20 * DAY);
    expect(tankFouling(state, 20 * DAY, 0)).toBe(NO_FOULING);
    // Puis le voile remonte avec le temps.
    expect(tankFouling(state, 30 * DAY, 0).glass).toBeGreaterThan(0);
  });

  it('un geste daté après l’horloge ne donne aucun voile', () => {
    const state = maintenanceDone(initialMaintenance(0), 'glass', 50 * DAY);
    expect(tankFouling(state, 10 * DAY, 0).glass).toBe(0);
  });
});

describe('worldFouling', () => {
  it('suit le calendrier et les nitrates du monde', () => {
    const clean = worldFouling(world(), 0);
    const nitrated = worldFouling(world({ water: { nitrate: ALGAE_NITRATE_FULL } }), 0);
    expect(clean.glass).toBeGreaterThan(0);
    expect(nitrated.glass).toBeGreaterThanOrEqual(clean.glass);
  });

  it('aucun voile en mode décor', () => {
    expect(worldFouling(world({ careMode: 'decor' }), 0)).toBe(NO_FOULING);
    expect(worldFouling(world({ careMode: 'soins' }), 0).glass).toBeGreaterThan(0);
  });

  it('aucun voile hors des bacs à algues (bassin, récif)', () => {
    expect(worldFouling(world({ environment: 'bassin' }), 0)).toBe(NO_FOULING);
    expect(worldFouling(world({ environment: 'recif' }), 0)).toBe(NO_FOULING);
    expect(worldFouling(world({ environment: 'eaufroide' }), 0).glass).toBeGreaterThan(0);
  });

  it('sans calendrier, compte depuis `start`', () => {
    const w = world({ maintenance: undefined, time: 10 * DAY });
    expect(worldFouling(w, 10 * DAY)).toBe(NO_FOULING);
    expect(worldFouling(w, 0).glass).toBe(foulingLevel(10 * DAY, 0));
  });

  it('bac neuf par défaut : propre', () => {
    expect(worldFouling(world({ time: 0, maintenance: undefined }), 0)).toBe(NO_FOULING);
  });
});

describe('sampleFouling', () => {
  it('vitres et sol au niveau donné, ramené dans [0, 1]', () => {
    expect(sampleFouling(0.7)).toEqual({ glass: 0.7, floor: 0.7 });
    expect(sampleFouling(5)).toEqual({ glass: 1, floor: 1 });
  });

  it('bac propre pour un niveau nul, négatif ou non fini', () => {
    for (const l of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(sampleFouling(l)).toBe(NO_FOULING);
    }
  });
});
