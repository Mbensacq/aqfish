import { SIM_DT } from './constants';
import {
  createDayClock,
  createDayLight,
  DAY_ELEVATION,
  DEFAULT_DAY_CLOCK,
  DEFAULT_DAY_LENGTH_SECONDS,
  freezeClock,
  hourAt,
  lightAt,
  lightAtInto,
  mix,
  NIGHT_ELEVATION,
  NIGHT_SKY,
  NIGHT_TINT,
  normalizeHour,
  resumeClock,
  sunElevation,
  toggleClock,
  type DayLight,
} from './daylight';
import { advance, createDefaultWorld, createWorld, ticksFor } from './world';

/** Plus grand écart entre deux lumières (toutes composantes confondues). */
function lightDistance(a: DayLight, b: DayLight): number {
  let d = Math.abs(a.intensity - b.intensity);
  for (let i = 0; i < 3; i++) {
    d = Math.max(d, Math.abs(a.tint[i] - b.tint[i]), Math.abs(a.sky[i] - b.sky[i]));
  }
  return d;
}

describe('lightAt : courbe de lumière', () => {
  it('midi : plein jour, lumière et ciel exactement blancs', () => {
    expect(lightAt(12)).toEqual({ intensity: 1, tint: [1, 1, 1], sky: [1, 1, 1] });
  });

  it('minuit : intensité nulle, teintes de nuit exactes', () => {
    expect(lightAt(0)).toEqual({ intensity: 0, tint: NIGHT_TINT, sky: NIGHT_SKY });
  });

  it('bornes : 0 h et 24 h donnent la même lumière ; périodique de 24 h', () => {
    expect(lightAt(24)).toEqual(lightAt(0));
    for (const h of [0.5, 3, 6.25, 12, 17.9, 23.99]) {
      const a = lightAt(h);
      for (const b of [lightAt(h + 24), lightAt(h - 24), lightAt(h + 48)]) {
        expect(lightDistance(a, b)).toBeLessThan(1e-12);
      }
    }
  });

  it('plein jour de 8 h à 16 h, pleine nuit avant 5 h et après 19 h', () => {
    for (const h of [8, 9, 10, 14, 16]) {
      expect(lightAt(h).intensity).toBe(1);
      expect(lightAt(h).tint).toEqual([1, 1, 1]);
    }
    for (const h of [0, 2, 4, 5, 19, 21, 23.5]) {
      expect(lightAt(h).intensity).toBe(0);
      expect(lightAt(h).tint).toEqual(NIGHT_TINT);
    }
  });

  it('6 h : valeur exacte de l’aube (smoothstep de l’élévation nulle)', () => {
    const x = (0 - NIGHT_ELEVATION) / (DAY_ELEVATION - NIGHT_ELEVATION);
    expect(lightAt(6).intensity).toBeCloseTo(x * x * (3 - 2 * x), 12);
    expect(lightAt(6).intensity).toBeCloseTo(7 / 27, 12);
  });

  it('aube et crépuscule : lumière orangée (rouge > bleu), symétriques autour de midi', () => {
    for (const h of [6, 6.5, 7]) {
      const dawn = lightAt(h);
      expect(dawn.tint[0]).toBeGreaterThan(dawn.tint[2]);
      expect(lightDistance(dawn, lightAt(24 - h))).toBeLessThan(1e-12);
    }
  });

  it('nuit : lumière bleutée (bleu > rouge)', () => {
    const night = lightAt(2);
    expect(night.tint[2]).toBeGreaterThan(night.tint[0]);
    expect(night.sky[2]).toBeGreaterThan(night.sky[0]);
  });

  it('continue : deux heures voisines (pas d’une minute) donnent des lumières voisines', () => {
    const minute = 1 / 60;
    let previous = lightAt(0);
    for (let h = minute; h <= 24 + 1e-9; h += minute) {
      const current = lightAt(h);
      expect(lightDistance(previous, current)).toBeLessThan(0.01);
      previous = current;
    }
  });

  it('valeurs toujours dans [0, 1]', () => {
    for (let h = 0; h < 24; h += 0.1) {
      const light = lightAt(h);
      for (const v of [light.intensity, ...light.tint, ...light.sky]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('heure non finie : RangeError', () => {
    for (const h of [Number.NaN, Infinity, -Infinity]) {
      expect(() => lightAt(h)).toThrow(RangeError);
    }
  });
});

describe('sunElevation et normalizeHour', () => {
  it('élévation : −1 à minuit, 1 à midi, ≈ 0 à 6 h et 18 h', () => {
    expect(sunElevation(0)).toBe(-1);
    expect(sunElevation(12)).toBe(1);
    expect(Math.abs(sunElevation(6))).toBeLessThan(1e-12);
    expect(Math.abs(sunElevation(18))).toBeLessThan(1e-12);
  });

  it('normalise dans [0, 24), sans −0', () => {
    expect(normalizeHour(24)).toBe(0);
    expect(normalizeHour(-1)).toBe(23);
    expect(normalizeHour(49.5)).toBe(1.5);
    expect(Object.is(normalizeHour(-0), 0)).toBe(true);
    expect(Object.is(normalizeHour(-24), 0)).toBe(true);
    // Reste négatif infime : arrondi à 24, ramené à 0.
    expect(normalizeHour(-1e-17)).toBe(0);
  });

  it('mix est exact aux bornes', () => {
    expect(mix(0.55, 1, 1)).toBe(1);
    expect(mix(0.55, 1, 0)).toBe(0.55);
  });
});

describe('horloge de journée', () => {
  it('par défaut : départ à midi, journée de 180 s, en marche', () => {
    expect(DEFAULT_DAY_CLOCK).toEqual({ startHour: 12, dayLengthSeconds: 180, frozen: false });
    expect(createDayClock()).toEqual(DEFAULT_DAY_CLOCK);
    expect(DEFAULT_DAY_LENGTH_SECONDS).toBe(180);
  });

  it('une journée entière dure dayLengthSeconds : minuit à mi-journée, midi au bout', () => {
    const clock = createDayClock(12, 180);
    expect(hourAt(clock, 0)).toBe(12);
    expect(hourAt(clock, 45)).toBe(18);
    expect(hourAt(clock, 90)).toBe(0);
    expect(hourAt(clock, 135)).toBe(6);
    expect(hourAt(clock, 180)).toBe(12);
    expect(hourAt(createDayClock(0, 60), 30)).toBe(12);
  });

  it('figée : l’heure ne dépend plus du temps', () => {
    const clock = createDayClock(21.5, 180, true);
    for (const t of [0, 1, 90, 3600]) {
      expect(hourAt(clock, t)).toBe(21.5);
    }
  });

  it('figer puis reprendre : aucun saut, puis l’heure avance de nouveau', () => {
    const running = createDayClock(12, 180);
    const frozen = freezeClock(running, 30);
    expect(frozen.frozen).toBe(true);
    expect(hourAt(frozen, 30)).toBe(16);
    expect(hourAt(frozen, 100)).toBe(16);
    const resumed = resumeClock(frozen, 100);
    expect(resumed.frozen).toBe(false);
    expect(hourAt(resumed, 100)).toBeCloseTo(16, 12);
    expect(hourAt(resumed, 115)).toBeCloseTo(18, 12);
    // Idempotence.
    expect(freezeClock(frozen, 50)).toBe(frozen);
    expect(resumeClock(running, 50)).toBe(running);
    // Bascule.
    expect(toggleClock(running, 30)).toEqual(frozen);
    expect(toggleClock(frozen, 100)).toEqual(resumed);
  });

  it('reprise loin dans le temps : heure de départ ramenée dans [0, 24)', () => {
    const resumed = resumeClock(createDayClock(3, 180, true), 1000);
    expect(resumed.startHour).toBeGreaterThanOrEqual(0);
    expect(resumed.startHour).toBeLessThan(24);
    expect(hourAt(resumed, 1000)).toBeCloseTo(3, 9);
  });

  it('valeurs invalides : RangeError', () => {
    for (const len of [0, -1, Number.NaN, Infinity]) {
      expect(() => createDayClock(12, len)).toThrow(RangeError);
    }
    expect(() => createDayClock(Number.NaN)).toThrow(RangeError);
    for (const t of [-1, Number.NaN, Infinity]) {
      expect(() => hourAt(DEFAULT_DAY_CLOCK, t)).toThrow(RangeError);
      expect(() => resumeClock(createDayClock(1, 180, true), t)).toThrow(RangeError);
    }
    expect(createDayClock(25).startHour).toBe(1);
  });

  it('l’heure suit le pas fixe du monde (world.time), pas l’horloge murale', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1e9);
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(1e12);
    try {
      const world = createWorld(42);
      const clock = DEFAULT_DAY_CLOCK;
      expect(hourAt(clock, world.time)).toBe(12);
      // 45 s simulées = 6 h, atteintes par pas fixes de SIM_DT.
      const later = advance(world, ticksFor(45));
      expect(later.time).toBeCloseTo(45, 9);
      expect(hourAt(clock, later.time)).toBeCloseTo(18, 9);
      // Un pas de plus avance l’heure de exactement 24 · SIM_DT / 180.
      const next = advance(later, 1);
      expect(hourAt(clock, next.time) - hourAt(clock, later.time)).toBeCloseTo(
        (24 * SIM_DT) / 180,
        12,
      );
      // L’horloge murale n’est jamais lue.
      expect(now).not.toHaveBeenCalled();
      expect(dateNow).not.toHaveBeenCalled();
      // Même monde, même heure (déterminisme), quel que soit le moment du calcul.
      expect(hourAt(clock, advance(createDefaultWorld(7), 120).time)).toBe(
        hourAt(clock, advance(createDefaultWorld(7), 120).time),
      );
    } finally {
      now.mockRestore();
      dateNow.mockRestore();
    }
  });
});

describe('lightAtInto : variante sans allocation', () => {
  const HOURS = [
    0, 0.5, 4.99, 5.02, 6, 6.5, 7.3, 8, 12, 15.99, 18, 18.97, 19, 23.999, 24, -3, 37.5,
  ];

  it('identique à lightAt, composante par composante (égalité exacte)', () => {
    const out = createDayLight();
    for (const h of HOURS) {
      expect(lightAtInto(h, out)).toEqual(lightAt(h));
    }
  });

  it('renvoie et réutilise le même tampon (mêmes tableaux de teinte et de ciel)', () => {
    const out = createDayLight();
    const { tint, sky } = out;
    expect(lightAtInto(0, out)).toBe(out);
    expect(out.tint).toBe(tint);
    expect(out.sky).toBe(sky);
    expect(out).toEqual({ intensity: 0, tint: NIGHT_TINT, sky: NIGHT_SKY });
    // Retour à midi après la nuit : aucune valeur résiduelle.
    lightAtInto(12, out);
    expect(out).toEqual({ intensity: 1, tint: [1, 1, 1], sky: [1, 1, 1] });
    expect(out.tint).toBe(tint);
  });

  it('createDayLight : lumière de midi, tampons indépendants', () => {
    const a = createDayLight();
    const b = createDayLight();
    expect(a).toEqual(lightAt(12));
    lightAtInto(0, a);
    expect(b).toEqual(lightAt(12));
    expect(a.tint).not.toBe(b.tint);
  });

  it('heure invalide : RangeError, tampon inchangé', () => {
    const out = lightAtInto(18, createDayLight());
    const before = structuredClone(out);
    for (const h of [Number.NaN, Infinity, -Infinity]) {
      expect(() => lightAtInto(h, out)).toThrow(RangeError);
      expect(out).toEqual(before);
    }
  });
});
