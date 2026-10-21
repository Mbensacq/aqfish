import { POND_DIMENSIONS } from '../sim/environment';
import { cutawaySides, POND_SIDES } from './pond-cutaway';

describe('cutawaySides', () => {
  const dims = POND_DIMENSIONS; // 2 × 0,4 × 1,4 m
  const ground = 0.39;
  const sides = (x: number, y: number, z: number) => [...cutawaySides([x, y, z], dims, ground)];

  it('ne retire rien quand la caméra est au-dessus du sol (dessus, trois-quarts)', () => {
    expect(sides(0, 3, 0.003)).toEqual([]);
    expect(sides(1.8, 1.6, 2.4)).toEqual([]);
    // Au ras du sol exactement : pas encore sous le sol.
    expect(sides(3, ground, 0)).toEqual([]);
  });

  it('retire le côté de la caméra quand elle passe sous le sol (côté, face, dessous)', () => {
    expect(sides(3.4, 0.2, 0)).toEqual(['+x']);
    expect(sides(-3.4, 0.2, 0)).toEqual(['-x']);
    expect(sides(0, 0.2, 3.4)).toEqual(['+z']);
    expect(sides(0, 0.2, -3.4)).toEqual(['-z']);
    expect(sides(0, -3, 1.4)).toEqual(['+z']);
  });

  it('retire deux côtés pour une caméra basse en diagonale', () => {
    expect(new Set(sides(2, 0.1, -2))).toEqual(new Set(['+x', '-z']));
  });

  it('ne retire pas un côté dont la caméra est en deçà de la paroi', () => {
    // Sous le bassin, à l'aplomb de l'eau : aucune paroi entre la caméra et l'eau.
    expect(sides(0.5, -2, 0.5)).toEqual([]);
    // Pile sur le plan de la paroi : pas au-delà.
    expect(sides(dims.width / 2, 0, 0)).toEqual([]);
  });

  it('ne retire rien pour une position ou un niveau de sol non fini', () => {
    expect(sides(Number.NaN, 0, 3)).toEqual([]);
    expect(sides(3, Number.NEGATIVE_INFINITY, 0)).toEqual([]);
    expect([...cutawaySides([3, 0, 0], dims, Number.NaN)]).toEqual([]);
  });

  it('nomme les quatre côtés', () => {
    expect([...POND_SIDES].sort()).toEqual(['+x', '+z', '-x', '-z']);
  });
});
