import { SAND_THICKNESS, DEFAULT_TANK } from '../sim/tank';
import { sandPoint } from './decor-pick';

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
