import { overcastBrightness, RAIN_OVERCAST_BRIGHTNESS } from './overcast';

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
