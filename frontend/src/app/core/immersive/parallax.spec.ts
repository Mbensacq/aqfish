import {
  PARALLAX,
  angleDelta,
  createParallaxState,
  parallaxStep,
  resetParallax,
  type ParallaxFrame,
} from './parallax';

/** Téléphone en portrait : 65 × 140 mm, œil à 350 mm. */
const PHONE: ParallaxFrame = {
  eyeDistance: 350,
  screenWidth: 65,
  screenHeight: 140,
  screenAngleDeg: 0,
};

/** Fait converger l'œil (beaucoup de petits pas) avec la lecture donnée. */
function settle(
  state = createParallaxState(),
  beta: number,
  gamma: number,
  frame: ParallaxFrame = PHONE,
  seconds = 1,
) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    parallaxStep(state, { beta, gamma }, 1 / 60, frame);
  }
  return state;
}

describe('parallaxe du mode immersif (#346)', () => {
  it('angleDelta : écart ramené à [−180 ; 180[, sans saut au passage de ±180', () => {
    expect(angleDelta(10, 0)).toBe(10);
    expect(angleDelta(-10, 0)).toBe(-10);
    expect(angleDelta(179, -179)).toBe(-2);
    expect(angleDelta(-179, 179)).toBe(2);
    expect(angleDelta(0, 0)).toBe(0);
    expect(angleDelta(360, 0)).toBe(0);
  });

  it('première lecture = pose neutre : l’œil reste centré', () => {
    const state = createParallaxState();
    parallaxStep(state, { beta: 60, gamma: 5 }, 1 / 60, PHONE);
    expect(state.hasReference).toBe(true);
    expect(state.refBeta).toBe(60);
    expect(state.refGamma).toBe(5);
    expect(state.eyeX).toBe(0);
    expect(state.eyeY).toBe(0);
  });

  it('incliner le bord droit vers l’arrière décale l’œil à gauche, le haut vers soi en haut', () => {
    const state = createParallaxState();
    parallaxStep(state, { beta: 60, gamma: 0 }, 1 / 60, PHONE);
    settle(state, 60, 5, PHONE, 0.5);
    expect(state.eyeX).toBeLessThan(0);
    expect(Math.abs(state.eyeY)).toBeLessThan(1e-6);
    const other = createParallaxState();
    parallaxStep(other, { beta: 60, gamma: 0 }, 1 / 60, PHONE);
    settle(other, 65, 0, PHONE, 0.5);
    expect(other.eyeY).toBeGreaterThan(0);
    expect(Math.abs(other.eyeX)).toBeLessThan(1e-6);
  });

  it('décalage proche de d · sin θ pour une petite inclinaison', () => {
    const state = createParallaxState();
    parallaxStep(state, { beta: 60, gamma: 0 }, 1 / 60, PHONE);
    settle(state, 60, 3, PHONE, 0.5);
    // Le recentrage (4 s) a déjà rapproché la référence : un peu moins que 350 · sin 3°.
    const ideal = -350 * Math.sin((3 * Math.PI) / 180);
    expect(state.eyeX).toBeLessThan(ideal * 0.8);
    expect(state.eyeX).toBeGreaterThan(ideal);
  });

  it('borné : écart d’angle et décalage limités à la demi-taille de l’écran', () => {
    const state = createParallaxState();
    parallaxStep(state, { beta: 0, gamma: 0 }, 1 / 60, PHONE);
    for (let i = 0; i < 120; i++) {
      parallaxStep(state, { beta: 89, gamma: -89 }, 1 / 60, PHONE);
      expect(Math.abs(state.eyeX)).toBeLessThanOrEqual((65 / 2) * PARALLAX.maxOffsetRatio + 1e-9);
      expect(Math.abs(state.eyeY)).toBeLessThanOrEqual((140 / 2) * PARALLAX.maxOffsetRatio + 1e-9);
    }
    expect(state.eyeX).toBeCloseTo((65 / 2) * PARALLAX.maxOffsetRatio, 1);
    // Grand écran : la borne d'angle (30°) agit avant celle de l'écran.
    const big: ParallaxFrame = { ...PHONE, screenWidth: 2000, screenHeight: 2000 };
    const wide = createParallaxState();
    parallaxStep(wide, { beta: 0, gamma: 0 }, 1 / 60, big);
    for (let i = 0; i < 30; i++) {
      parallaxStep(wide, { beta: 0, gamma: 80 }, 1 / 60, big);
    }
    expect(wide.eyeX).toBeGreaterThanOrEqual(-350 * Math.sin(Math.PI / 6) - 1e-9);
  });

  it('amorti : un saut d’inclinaison n’est rejoint que progressivement, sans dépassement', () => {
    const state = createParallaxState();
    parallaxStep(state, { beta: 0, gamma: 0 }, 1 / 60, PHONE);
    parallaxStep(state, { beta: 0, gamma: 4 }, 1 / 60, PHONE);
    const target = -350 * Math.sin((4 * Math.PI) / 180);
    expect(state.eyeX).toBeLessThan(0);
    expect(state.eyeX).toBeGreaterThan(target * 0.3);
    let previous = state.eyeX;
    for (let i = 0; i < 20; i++) {
      parallaxStep(state, { beta: 0, gamma: 4 }, 1 / 60, PHONE);
      expect(state.eyeX).toBeLessThanOrEqual(previous + 1e-9);
      expect(state.eyeX).toBeGreaterThanOrEqual(target - 1e-9);
      previous = state.eyeX;
    }
  });

  it('indépendant de la cadence : 30 ou 60 images par seconde donnent presque le même œil', () => {
    const at60 = createParallaxState();
    const at30 = createParallaxState();
    parallaxStep(at60, { beta: 0, gamma: 0 }, 0, PHONE);
    parallaxStep(at30, { beta: 0, gamma: 0 }, 0, PHONE);
    for (let i = 0; i < 30; i++) {
      parallaxStep(at60, { beta: 0, gamma: 4 }, 1 / 60, PHONE);
    }
    for (let i = 0; i < 15; i++) {
      parallaxStep(at30, { beta: 0, gamma: 4 }, 1 / 30, PHONE);
    }
    expect(at30.eyeX).toBeCloseTo(at60.eyeX, 0);
  });

  it('recentrage lent : une inclinaison maintenue revient vers le centre', () => {
    const state = createParallaxState();
    parallaxStep(state, { beta: 0, gamma: 0 }, 1 / 60, PHONE);
    settle(state, 0, 6, PHONE, 0.5);
    const early = Math.abs(state.eyeX);
    settle(state, 0, 6, PHONE, 20);
    expect(Math.abs(state.eyeX)).toBeLessThan(early * 0.05);
    expect(state.refGamma).toBeCloseTo(6, 1);
  });

  it('entrées invalides ignorées : lecture absente ou non finie, pas de temps négatif', () => {
    const state = createParallaxState();
    parallaxStep(state, { beta: NaN, gamma: 3 }, 1 / 60, PHONE);
    expect(state.hasReference).toBe(false);
    parallaxStep(state, { beta: 10, gamma: Infinity }, 1 / 60, PHONE);
    expect(state.hasReference).toBe(false);
    parallaxStep(state, { beta: 0, gamma: 0 }, 1 / 60, PHONE);
    settle(state, 0, 10, PHONE, 0.3);
    const x = state.eyeX;
    parallaxStep(state, { beta: 0, gamma: 20 }, -1, PHONE);
    parallaxStep(state, { beta: 0, gamma: 20 }, NaN, PHONE);
    expect(state.eyeX).toBe(x);
    // Sans lecture : retour progressif au centre.
    for (let i = 0; i < 120; i++) {
      parallaxStep(state, null, 1 / 60, PHONE);
    }
    expect(Math.abs(state.eyeX)).toBeLessThan(0.01);
  });

  it('écran ou distance invalides : œil au centre, sans exception', () => {
    const state = settle(createParallaxState(), 0, 0);
    settle(state, 0, 10, PHONE, 0.3);
    parallaxStep(state, { beta: 0, gamma: 10 }, 1 / 60, { ...PHONE, eyeDistance: 0 });
    expect(state.eyeX).toBe(0);
    settle(state, 0, 10, PHONE, 0.3);
    parallaxStep(state, { beta: 0, gamma: 10 }, 1 / 60, { ...PHONE, screenWidth: NaN });
    expect(state.eyeX).toBe(0);
    expect(() =>
      parallaxStep(state, { beta: 0, gamma: 10 }, 1 / 60, { ...PHONE, screenAngleDeg: NaN }),
    ).not.toThrow();
  });

  it('pas de temps énorme borné (image sautée) : pas de saut jusqu’à la cible', () => {
    const state = createParallaxState();
    parallaxStep(state, { beta: 0, gamma: 0 }, 1 / 60, PHONE);
    parallaxStep(state, { beta: 0, gamma: 4 }, 0.1, PHONE);
    const tenth = state.eyeX;
    const other = createParallaxState();
    parallaxStep(other, { beta: 0, gamma: 0 }, 1 / 60, PHONE);
    parallaxStep(other, { beta: 0, gamma: 4 }, 3600, PHONE);
    const target = -350 * Math.sin((4 * Math.PI) / 180);
    expect(other.eyeX).toBeLessThan(tenth);
    expect(other.eyeX).toBeGreaterThan(target);
  });

  it('écran tourné (paysage) : l’inclinaison gauche-droite de l’appareil devient verticale', () => {
    const landscape: ParallaxFrame = {
      eyeDistance: 350,
      screenWidth: 140,
      screenHeight: 65,
      screenAngleDeg: 90,
    };
    const state = createParallaxState();
    parallaxStep(state, { beta: 0, gamma: 0 }, 1 / 60, landscape);
    settle(state, 0, 4, landscape, 0.5);
    // Appareil : œil vers −x ; écran tourné de 90° : vers −y.
    expect(Math.abs(state.eyeX)).toBeLessThan(1e-6);
    expect(state.eyeY).toBeLessThan(0);
    const flipped = createParallaxState();
    parallaxStep(flipped, { beta: 0, gamma: 0 }, 1 / 60, { ...PHONE, screenAngleDeg: 180 });
    settle(flipped, 0, 4, { ...PHONE, screenAngleDeg: 180 }, 0.5);
    expect(flipped.eyeX).toBeGreaterThan(0);
  });

  it('resetParallax : oublie la pose neutre et recentre', () => {
    const state = createParallaxState();
    parallaxStep(state, { beta: 0, gamma: 0 }, 1 / 60, PHONE);
    settle(state, 0, 8, PHONE, 0.3);
    resetParallax(state);
    expect(state).toEqual(createParallaxState());
  });
});
