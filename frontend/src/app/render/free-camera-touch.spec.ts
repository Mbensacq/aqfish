import { describe, expect, it } from 'vitest';
import {
  beginLook,
  beginPinch,
  combinedForward,
  decayThrust,
  LOOK_THRESHOLD_MOUSE_PX,
  LOOK_THRESHOLD_TOUCH_PX,
  lookThreshold,
  moveLook,
  movePinch,
  PINCH_THRESHOLD_PX,
  PINCH_THRUST_PER_PX,
  pinchDistance,
  pinchThrust,
  TOUCH_THRUST_DECAY_SECONDS,
  type LookDelta,
} from './free-camera-touch';
import { CLICK_TOLERANCE_PX } from './food-pick';

describe('free-camera-touch : glisser d’orientation', () => {
  const out: LookDelta = { dx: 0, dy: 0 };

  it('seuil plus large au doigt qu’à la souris, celui du clic à la souris', () => {
    expect(lookThreshold('mouse')).toBe(LOOK_THRESHOLD_MOUSE_PX);
    expect(LOOK_THRESHOLD_MOUSE_PX).toBe(CLICK_TOLERANCE_PX);
    expect(lookThreshold('touch')).toBe(LOOK_THRESHOLD_TOUCH_PX);
    expect(lookThreshold('pen')).toBe(LOOK_THRESHOLD_TOUCH_PX);
    expect(lookThreshold('')).toBe(LOOK_THRESHOLD_MOUSE_PX);
    expect(LOOK_THRESHOLD_TOUCH_PX).toBeGreaterThan(LOOK_THRESHOLD_MOUSE_PX);
  });

  it('sous le seuil : rien (un appui bref reste un clic)', () => {
    const g = beginLook(1, 100, 100, 'touch');
    expect(moveLook(g, 100 + LOOK_THRESHOLD_TOUCH_PX, 100, out)).toBe(false);
    expect(out).toEqual({ dx: 0, dy: 0 });
    expect(moveLook(g, 104, 106, out)).toBe(false);
    expect(g.engaged).toBe(false);
  });

  it('au franchissement : tout le déplacement depuis le départ, puis par différence', () => {
    const g = beginLook(1, 100, 100, 'touch');
    expect(moveLook(g, 112, 95, out)).toBe(true);
    expect(out).toEqual({ dx: 12, dy: -5 });
    expect(moveLook(g, 115, 95, out)).toBe(true);
    expect(out).toEqual({ dx: 3, dy: 0 });
    // Une fois engagé, même un retour près du départ oriente.
    expect(moveLook(g, 101, 100, out)).toBe(true);
    expect(out).toEqual({ dx: -14, dy: 5 });
  });

  it('à la souris, 5 px suffisent ; même point : aucun déplacement', () => {
    const g = beginLook(2, 0, 0, 'mouse');
    expect(moveLook(g, 5, 0, out)).toBe(true);
    expect(moveLook(g, 5, 0, out)).toBe(false);
    expect(out).toEqual({ dx: 0, dy: 0 });
  });

  it('coordonnées non finies ignorées, au départ comme en route', () => {
    const g = beginLook(3, Number.NaN, Infinity, 'mouse');
    expect(g.startX).toBe(0);
    expect(g.startY).toBe(0);
    expect(moveLook(g, Number.NaN, 50, out)).toBe(false);
    expect(moveLook(g, 50, 0, out)).toBe(true);
    expect(out.dx).toBe(50);
    expect(moveLook(g, Infinity, 0, out)).toBe(false);
    expect(g.lastX).toBe(50);
  });
});

describe('free-camera-touch : pincement', () => {
  it('écart de départ et identifiants', () => {
    const g = beginPinch(1, 0, 0, 2, 30, 40);
    expect(pinchDistance(g)).toBe(50);
    expect(g.reference).toBe(50);
    expect(g.engaged).toBe(false);
  });

  it('variation sous le seuil ignorée, puis comptée dès le seuil franchi', () => {
    const g = beginPinch(1, 0, 0, 2, 100, 0);
    expect(movePinch(g, 2, 100 + PINCH_THRESHOLD_PX, 0)).toBe(0);
    expect(movePinch(g, 2, 130, 0)).toBe(30);
    expect(g.engaged).toBe(true);
    // Ensuite chaque petite variation compte, depuis le dernier écart.
    expect(movePinch(g, 1, -2, 0)).toBe(2);
    expect(movePinch(g, 1, 10, 0)).toBe(-12);
  });

  it('rapprocher les doigts : variation négative', () => {
    const g = beginPinch(7, 0, 0, 8, 200, 0);
    expect(movePinch(g, 7, 50, 0)).toBe(-50);
  });

  it('autre pointeur ou coordonnées non finies : 0, état inchangé', () => {
    const g = beginPinch(1, 0, 0, 2, 100, 0);
    expect(movePinch(g, 3, 500, 0)).toBe(0);
    expect(movePinch(g, 1, Number.NaN, 0)).toBe(0);
    expect(g.ax).toBe(0);
    expect(pinchDistance(g)).toBe(100);
  });

  it('doigts confondus au départ : écart nul, pas de NaN', () => {
    const g = beginPinch(1, 10, 10, 2, 10, 10);
    expect(g.reference).toBe(0);
    expect(movePinch(g, 2, 40, 10)).toBe(30);
  });
});

describe('free-camera-touch : poussée et amortissement', () => {
  it('l’écartement pousse en avant, le rapprochement en arrière, borné à ±1', () => {
    expect(pinchThrust(0, 60)).toBeCloseTo(60 * PINCH_THRUST_PER_PX, 12);
    expect(pinchThrust(0, -60)).toBeCloseTo(-60 * PINCH_THRUST_PER_PX, 12);
    expect(pinchThrust(0.9, 1000)).toBe(1);
    expect(pinchThrust(-0.9, -1000)).toBe(-1);
    expect(pinchThrust(Number.NaN, Number.NaN)).toBe(0);
  });

  it('décroissance exponentielle de constante TOUCH_THRUST_DECAY_SECONDS', () => {
    expect(decayThrust(1, TOUCH_THRUST_DECAY_SECONDS)).toBeCloseTo(Math.exp(-1), 12);
    expect(decayThrust(-0.5, 0)).toBe(-0.5);
  });

  it('même résultat quel que soit le découpage du temps', () => {
    let a = 0.8;
    for (let i = 0; i < 12; i++) {
      a = decayThrust(a, 1 / 60);
    }
    expect(a).toBeCloseTo(decayThrust(0.8, 12 / 60), 12);
  });

  it('s’éteint complètement (zéro exact) ; dt invalide : inchangé ; borné à ±1', () => {
    expect(decayThrust(1, 10)).toBe(0);
    expect(decayThrust(-1, 10)).toBe(0);
    expect(decayThrust(0.4, -1)).toBe(0.4);
    expect(decayThrust(0.4, Number.NaN)).toBe(0.4);
    expect(decayThrust(5, 0)).toBe(1);
    expect(decayThrust(Number.NaN, 1)).toBe(0);
  });

  it('consigne combinée bornée : clavier et pincement s’ajoutent', () => {
    expect(combinedForward(1, 0.5)).toBe(1);
    expect(combinedForward(0, -0.25)).toBe(-0.25);
    expect(combinedForward(-1, -1)).toBe(-1);
    expect(combinedForward(Number.NaN, 0.3)).toBe(0.3);
  });
});
