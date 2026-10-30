import {
  OVERCAST_FADE_SECONDS,
  overcastBrightness,
  RAIN_OVERCAST_BRIGHTNESS,
  stepOvercast,
} from './overcast';

describe('overcastBrightness : ciel couvert sous la pluie (#123)', () => {
  it('sans pluie : exactement 1 (captures sans pluie identiques à l’octet)', () => {
    expect(overcastBrightness(false)).toBe(1);
  });

  it('sous la pluie : légèrement plus sombre, jamais noir', () => {
    expect(overcastBrightness(true)).toBe(RAIN_OVERCAST_BRIGHTNESS);
    expect(RAIN_OVERCAST_BRIGHTNESS).toBeGreaterThan(0.7);
    expect(RAIN_OVERCAST_BRIGHTNESS).toBeLessThan(1);
  });
});

describe('stepOvercast : fondu du ciel couvert (#338)', () => {
  const rate = (1 - RAIN_OVERCAST_BRIGHTNESS) / OVERCAST_FADE_SECONDS;

  it('fondu de quelques secondes, ni instantané ni interminable', () => {
    expect(OVERCAST_FADE_SECONDS).toBeGreaterThanOrEqual(1);
    expect(OVERCAST_FADE_SECONDS).toBeLessThanOrEqual(10);
  });

  it('avance à vitesse constante dans les deux sens', () => {
    expect(stepOvercast(1, RAIN_OVERCAST_BRIGHTNESS, 1)).toBeCloseTo(1 - rate, 12);
    expect(stepOvercast(RAIN_OVERCAST_BRIGHTNESS, 1, 1)).toBeCloseTo(
      RAIN_OVERCAST_BRIGHTNESS + rate,
      12,
    );
    const half = stepOvercast(1, RAIN_OVERCAST_BRIGHTNESS, OVERCAST_FADE_SECONDS / 2);
    expect(half).toBeCloseTo((1 + RAIN_OVERCAST_BRIGHTNESS) / 2, 12);
  });

  it('atteint la cible exactement : 1 hors pluie, jamais 0,999…', () => {
    let value = RAIN_OVERCAST_BRIGHTNESS;
    let steps = 0;
    while (value !== 1 && steps < 10_000) {
      value = stepOvercast(value, 1, 1 / 60);
      steps++;
    }
    expect(value).toBe(1);
    // Environ OVERCAST_FADE_SECONDS à 60 images par seconde.
    expect(steps).toBeGreaterThanOrEqual(OVERCAST_FADE_SECONDS * 60 - 1);
    expect(steps).toBeLessThanOrEqual(OVERCAST_FADE_SECONDS * 60 + 1);
    expect(stepOvercast(1, RAIN_OVERCAST_BRIGHTNESS, 3600)).toBe(RAIN_OVERCAST_BRIGHTNESS);
  });

  it('jamais au-delà de la cible, même au départ d’un fondu interrompu', () => {
    const middle = stepOvercast(1, RAIN_OVERCAST_BRIGHTNESS, 1);
    // La pluie s'arrête en plein fondu : retour vers 1, sans saut.
    const back = stepOvercast(middle, 1, 0.5);
    expect(back).toBeGreaterThan(middle);
    expect(back).toBeLessThan(1);
    expect(stepOvercast(0.999, 1, 1)).toBe(1);
  });

  it('pas nul, négatif ou non fini : facteur inchangé ; facteur non fini : la cible', () => {
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(stepOvercast(0.9, 1, dt)).toBe(0.9);
    }
    expect(stepOvercast(1, 1, 1)).toBe(1);
    expect(stepOvercast(Number.NaN, 1, 0)).toBe(1);
  });
});
