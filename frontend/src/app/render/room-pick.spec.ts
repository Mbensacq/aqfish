import type { Room } from '../sim/room';
import { DEFAULT_TANK } from '../sim/tank';
import type { Vec3 } from './camera-presets';
import { pickRoom, rayBoxDistance } from './room-pick';

const BOX = { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };
const ROOM: Room = {
  shown: true,
  cabinetHeight: 0.75,
  items: [
    { kind: 'etagere', x: -1.25, z: -0.17, quarter: 0 },
    { kind: 'plante-pot', x: -1.4, z: -0.17, quarter: 0, elevation: 0.8 },
  ],
};

/** Rayon de `from` vers `to` (direction non normée). */
function ray(from: Vec3, to: Vec3): [Vec3, Vec3] {
  return [from, [to[0] - from[0], to[1] - from[1], to[2] - from[2]]];
}

describe('pièce : rayon contre boîte (#188)', () => {
  it('entre dans la boîte, part de dedans, ou la manque', () => {
    expect(rayBoxDistance([-3, 0, 0], [1, 0, 0], BOX)).toBe(2);
    expect(rayBoxDistance([0, 0, 0], [1, 0, 0], BOX)).toBe(0);
    expect(rayBoxDistance([-3, 2, 0], [1, 0, 0], BOX)).toBeNull();
    expect(rayBoxDistance([-3, 0, 0], [-1, 0, 0], BOX)).toBeNull();
    expect(rayBoxDistance([-3, -3, 0], [1, 1, 0], BOX)).toBe(2);
  });
});

describe('pièce : cible du rayon (#188)', () => {
  it('choisit le plus proche élément touché, avec le point visé sur lui', () => {
    // De haut, au-dessus de la plante posée sur l'étagère : la plante (plus haute) d'abord.
    const pick = pickRoom(...ray([-1.4, 3, -0.17], [-1.4, -0.75, -0.17]), DEFAULT_TANK, ROOM);
    expect(pick?.kind).toBe('room-item');
    expect(pick?.kind === 'room-item' && pick.index).toBe(1);
    expect(pick?.x).toBeCloseTo(-1.4, 9);
    expect(pick?.z).toBeCloseTo(-0.17, 9);
    const shelf = pickRoom(...ray([-1, 3, -0.17], [-1, -0.75, -0.17]), DEFAULT_TANK, ROOM);
    expect(shelf?.kind === 'room-item' && shelf.index).toBe(0);
  });

  it('sinon le point du parquet visé, dans les limites de la pièce', () => {
    const pick = pickRoom(...ray([1, 1, 2], [1.2, -0.75, 0.8]), DEFAULT_TANK, ROOM);
    expect(pick?.kind).toBe('floor');
    expect(pick?.x).toBeCloseTo(1.2, 9);
    expect(pick?.z).toBeCloseTo(0.8, 9);
    // Au-delà des marges ou dans le mur : rien.
    expect(pickRoom(...ray([1, 1, 2], [9, -0.75, 0.8]), DEFAULT_TANK, ROOM)).toBeNull();
    expect(pickRoom(...ray([0, 1, 2], [1.5, -0.75, -0.6]), DEFAULT_TANK, ROOM)).toBeNull();
    // Rayon horizontal ou montant : rien.
    expect(
      pickRoom([1, 1, 2], [0, 0, -1], DEFAULT_TANK, { shown: true, cabinetHeight: 0.75 }),
    ).toBeNull();
    expect(pickRoom([1, 1, 2], [0, 1, 0], DEFAULT_TANK, ROOM)).toBeNull();
  });

  it('le bac et son meuble cachent le parquet et les éléments derrière eux', () => {
    // De face, à travers le meuble : le parquet derrière n'est pas visé.
    expect(pickRoom(...ray([0, -0.4, 2], [0, -0.75, -0.3]), DEFAULT_TANK, ROOM)).toBeNull();
    // À travers le bac, vers l'étagère à gauche : cachée.
    expect(pickRoom(...ray([1.5, 0.3, 0], [-1.4, 0.3, -0.17]), DEFAULT_TANK, ROOM)).toBeNull();
  });

  it('pièce masquée : rien', () => {
    expect(
      pickRoom(...ray([1, 1, 2], [1.2, -0.75, 0.8]), DEFAULT_TANK, { ...ROOM, shown: false }),
    ).toBeNull();
  });
});
