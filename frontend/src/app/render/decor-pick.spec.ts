import { SAND_THICKNESS, DEFAULT_TANK } from '../sim/tank';
import { planePoint, sandHit, sandPlanePoint, sandPoint } from './decor-pick';

describe('sandPoint', () => {
  it('trouve le point visé sur le sable, vu de biais comme d’aplomb', () => {
    const p = sandPoint([0, 1, 1], [0.1, -(1 - SAND_THICKNESS), -1], DEFAULT_TANK);
    expect(p!.x).toBeCloseTo(0.1, 12);
    expect(p!.z).toBeCloseTo(0, 12);
    const down = sandPoint([0.2, 2, -0.1], [0, -1, 0], DEFAULT_TANK);
    expect(down).toEqual({ x: 0.2, z: -0.1 });
  });

  it('rien pour un rayon parallèle, qui s’éloigne ou qui sort du bac', () => {
    expect(sandPoint([0, 1, 0], [1, 0, 0], DEFAULT_TANK)).toBeNull();
    expect(sandPoint([0, 1, 0], [0, 1, 0], DEFAULT_TANK)).toBeNull();
    expect(sandPoint([DEFAULT_TANK.width, 1, 0], [0, -1, 0], DEFAULT_TANK)).toBeNull();
    expect(sandPoint([0, 1, DEFAULT_TANK.depth], [0, -1, 0], DEFAULT_TANK)).toBeNull();
  });

  it('accepte le bord exact du bac', () => {
    const edge = DEFAULT_TANK.width / 2;
    expect(sandPoint([edge, 1, 0], [0, -1, 0], DEFAULT_TANK)).toEqual({ x: edge, z: 0 });
  });
});

describe('sandPlanePoint', () => {
  it('suit le rayon hors du bac (glissement borné ensuite)', () => {
    const far = sandPlanePoint([DEFAULT_TANK.width, 1, 0], [0, -1, 0]);
    expect(far).toEqual({ x: DEFAULT_TANK.width, z: 0 });
    // Vu de dessous : le rayon remonte vers le sable.
    const below = sandPlanePoint([0.1, -1, 0.05], [0, 1, 0]);
    expect(below).toEqual({ x: 0.1, z: 0.05 });
  });

  it('rien pour un rayon parallèle ou qui s’éloigne du plan', () => {
    expect(sandPlanePoint([0, 1, 0], [1, 0, 0])).toBeNull();
    expect(sandPlanePoint([0, 1, 0], [0, 1, 0])).toBeNull();
    expect(sandPlanePoint([0, 1, 0], [0, Number.NaN, 0])).toBeNull();
  });
});

describe('sandHit (#202)', () => {
  it('donne le point de sandPoint et sa distance le long du rayon', () => {
    const origin: [number, number, number] = [0, 1, 1];
    const direction: [number, number, number] = [0.1, -(1 - SAND_THICKNESS), -1];
    const hit = sandHit(origin, direction, DEFAULT_TANK)!;
    const point = sandPoint(origin, direction, DEFAULT_TANK)!;
    expect({ x: hit.x, z: hit.z }).toEqual(point);
    expect(hit.distance).toBeCloseTo(1, 12);
    // Direction deux fois plus longue : distance moitié (même unité que la pièce visée).
    const doubled = sandHit(origin, [0.2, -2 * (1 - SAND_THICKNESS), -2], DEFAULT_TANK)!;
    expect(doubled.distance).toBeCloseTo(0.5, 12);
    expect(sandHit([0, 2, 0], [0, -1, 0], DEFAULT_TANK)!.distance).toBeCloseTo(
      2 - SAND_THICKNESS,
      12,
    );
  });

  it('rien quand sandPoint ne trouve rien', () => {
    expect(sandHit([0, 1, 0], [1, 0, 0], DEFAULT_TANK)).toBeNull();
    expect(sandHit([0, 1, 0], [0, 1, 0], DEFAULT_TANK)).toBeNull();
    expect(sandHit([DEFAULT_TANK.width, 1, 0], [0, -1, 0], DEFAULT_TANK)).toBeNull();
  });
});

describe('planePoint', () => {
  it('ne renvoie que (x, z)', () => {
    expect(planePoint([0.3, 2, -0.4], [0, -1, 0], 0.5)).toEqual({ x: 0.3, z: -0.4 });
    expect(planePoint([0, 1, 0], [0, 1, 0], 0.5)).toBeNull();
  });
});
