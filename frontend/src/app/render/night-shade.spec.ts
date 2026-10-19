import { lightAt } from '../sim/daylight';
import { flatBrightness, NIGHT_FLAT_BRIGHTNESS } from './night-shade';

describe('flatBrightness : luminosité des couleurs plates', () => {
  it('plein jour : exactement 1 (captures de midi inchangées)', () => {
    expect(flatBrightness(1)).toBe(1);
    expect(flatBrightness(lightAt(12).intensity)).toBe(1);
  });

  it('pleine nuit : NIGHT_FLAT_BRIGHTNESS, dans ]0, 1[', () => {
    expect(flatBrightness(0)).toBe(NIGHT_FLAT_BRIGHTNESS);
    expect(flatBrightness(lightAt(0).intensity)).toBe(NIGHT_FLAT_BRIGHTNESS);
    expect(NIGHT_FLAT_BRIGHTNESS).toBeGreaterThan(0);
    expect(NIGHT_FLAT_BRIGHTNESS).toBeLessThan(1);
  });

  it('croissante et linéaire entre la nuit et le jour', () => {
    let previous = flatBrightness(0);
    for (let i = 1; i <= 20; i++) {
      const b = flatBrightness(i / 20);
      expect(b).toBeGreaterThan(previous);
      previous = b;
    }
    expect(flatBrightness(0.5)).toBeCloseTo((NIGHT_FLAT_BRIGHTNESS + 1) / 2, 12);
  });

  it('intensité hors de [0, 1] bornée ; non finie : plein jour', () => {
    expect(flatBrightness(-2)).toBe(NIGHT_FLAT_BRIGHTNESS);
    expect(flatBrightness(3)).toBe(1);
    expect(flatBrightness(Number.NaN)).toBe(1);
    expect(flatBrightness(Infinity)).toBe(1);
    expect(flatBrightness(-Infinity)).toBe(1);
  });
});
