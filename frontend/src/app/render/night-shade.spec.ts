import { lightAt } from '../sim/daylight';
import {
  DECOR_NIGHT_TINT,
  decorTintInto,
  flatBrightness,
  type MutableTint,
  NIGHT_FLAT_BRIGHTNESS,
  TONE_PENALTY_OFF,
  TONE_PENALTY_SCALE,
  tonePenaltiesInto,
  tonePenalty,
  twilightWeight,
} from './night-shade';

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

describe('twilightWeight : poids de l’aube et du crépuscule', () => {
  it('nul en plein jour et en pleine nuit, 1 à mi-transition', () => {
    expect(twilightWeight(1)).toBe(0);
    expect(twilightWeight(0)).toBe(0);
    expect(twilightWeight(0.5)).toBe(1);
  });

  it('borne les valeurs hors de [0, 1] ; non fini = plein jour', () => {
    expect(twilightWeight(-3)).toBe(0);
    expect(twilightWeight(7)).toBe(0);
    expect(twilightWeight(Number.NaN)).toBe(0);
  });
});

describe('decorTintInto : teinte du décor', () => {
  const tint = (i: number): MutableTint => decorTintInto(i, [0, 0, 0]);

  it('plein jour : exactement blanc (captures de midi inchangées)', () => {
    expect(tint(1)).toEqual([1, 1, 1]);
    expect(tint(lightAt(12).intensity)).toEqual([1, 1, 1]);
    expect(tint(Number.POSITIVE_INFINITY)).toEqual([1, 1, 1]);
  });

  it('pleine nuit : clair de lune, bleu plus fort que rouge et vert', () => {
    expect(tint(0)).toEqual([...DECOR_NIGHT_TINT]);
    const [r, g, b] = tint(lightAt(0).intensity);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it('crépuscule : teinte chaude (rouge > bleu)', () => {
    const [r, , b] = tint(lightAt(18).intensity);
    expect(r).toBeGreaterThan(b);
  });

  it('écrit dans le tampon fourni et le renvoie', () => {
    const out: MutableTint = [9, 9, 9];
    expect(decorTintInto(0.3, out)).toBe(out);
    expect(out).toEqual(decorTintInto(0.3, [0, 0, 0]));
  });
});

describe('tonePenalty et tonePenaltiesInto : tons ajoutés à la palette (ADR 0021)', () => {
  it('poids nul ou invalide : groupe écarté ; poids 1 : aucune pénalité', () => {
    expect(tonePenalty(0)).toBe(TONE_PENALTY_OFF);
    expect(tonePenalty(-1)).toBe(TONE_PENALTY_OFF);
    expect(tonePenalty(Number.NaN)).toBe(TONE_PENALTY_OFF);
    expect(tonePenalty(1)).toBe(0);
    expect(tonePenalty(3)).toBe(0);
    expect(tonePenalty(0.5)).toBeCloseTo(TONE_PENALTY_SCALE, 12);
  });

  it('décroissante avec le poids, jamais au-delà de TONE_PENALTY_OFF', () => {
    let previous = tonePenalty(1e-9);
    expect(previous).toBeLessThanOrEqual(TONE_PENALTY_OFF);
    for (let k = 1; k <= 20; k++) {
      const p = tonePenalty(k / 20);
      expect(p).toBeLessThan(previous);
      previous = p;
    }
  });

  it('TONE_PENALTY_OFF dépasse la distance au carré maximale entre deux couleurs (3)', () => {
    expect(TONE_PENALTY_OFF).toBeGreaterThan(3);
  });

  it('plein jour : nuit et crépuscule écartés', () => {
    expect(tonePenaltiesInto(1, { night: 0, twilight: 0 })).toEqual({
      night: TONE_PENALTY_OFF,
      twilight: TONE_PENALTY_OFF,
    });
    expect(tonePenaltiesInto(Number.NaN, { night: 0, twilight: 0 }).night).toBe(TONE_PENALTY_OFF);
  });

  it('pleine nuit : tons de nuit libres, crépuscule écarté', () => {
    expect(tonePenaltiesInto(0, { night: 1, twilight: 1 })).toEqual({
      night: 0,
      twilight: TONE_PENALTY_OFF,
    });
  });

  it('mi-transition : crépuscule libre, tons de nuit pénalisés', () => {
    const out = { night: 0, twilight: 0 };
    expect(tonePenaltiesInto(0.5, out)).toBe(out);
    expect(out.twilight).toBe(0);
    expect(out.night).toBeCloseTo(TONE_PENALTY_SCALE, 12);
  });
});
