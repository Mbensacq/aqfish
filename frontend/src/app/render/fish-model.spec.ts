import { NEON, SPECIES } from '../sim/species';
import {
  buildVoxelMesh,
  createFishGeometry,
  modelBodyLength,
  SLENDER_FISH,
  voxelSize,
} from './fish-model';
import { PALETTE_COLORS } from './palette';

const UNIT = { x: 1, y: 1, z: 1 };

describe('couleurs des espèces', () => {
  it.each(Object.values(SPECIES))(
    '$name : toutes ses couleurs appartiennent à la palette (survivent à la quantification)',
    (def) => {
      for (const color of Object.values(def.colors)) {
        expect(PALETTE_COLORS).toContain(color);
      }
    },
  );
});

describe('buildVoxelMesh', () => {
  it('un voxel isolé : 6 faces, 36 sommets', () => {
    const data = buildVoxelMesh(['s'], 1, NEON.colors, UNIT, 'center');
    expect(data.quads).toBe(6);
    expect(data.positions.length).toBe(36 * 3);
    expect(data.normals.length).toBe(36 * 3);
    expect(data.colors.length).toBe(36 * 3);
  });

  it('deux voxels voisins : la face commune n’est pas émise (10 faces)', () => {
    expect(buildVoxelMesh(['ss'], 1, NEON.colors, UNIT, 'center').quads).toBe(10);
    expect(buildVoxelMesh(['s', 's'], 1, NEON.colors, UNIT, 'center').quads).toBe(10);
    expect(buildVoxelMesh(['s'], 2, NEON.colors, UNIT, 'center').quads).toBe(10);
  });

  it('les cases vides n’émettent rien', () => {
    expect(buildVoxelMesh(['..'], 1, NEON.colors, UNIT, 'center').quads).toBe(0);
  });

  it('ancrage centré : boîte englobante symétrique', () => {
    const { positions } = buildVoxelMesh(['ss', 'ss'], 2, NEON.colors, UNIT, 'center');
    const xs = positions.filter((_, i) => i % 3 === 0);
    const ys = positions.filter((_, i) => i % 3 === 1);
    const zs = positions.filter((_, i) => i % 3 === 2);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-1, 1]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([-1, 1]);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([-1, 1]);
  });

  it('ancrage à droite : le bord droit est en x = 0 (pivot de la queue)', () => {
    const { positions } = buildVoxelMesh(['ff'], 1, NEON.colors, UNIT, 'right');
    const xs = positions.filter((_, i) => i % 3 === 0);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-2, 0]);
  });

  it('normales unitaires, faces orientées vers l’extérieur', () => {
    const { positions, normals } = buildVoxelMesh(['s'], 1, NEON.colors, UNIT, 'center');
    for (let t = 0; t < positions.length; t += 9) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(t, t + 9);
      const ux = bx - ax, uy = by - ay, uz = bz - az; // prettier-ignore
      const vx = cx - ax, vy = cy - ay, vz = cz - az; // prettier-ignore
      const cross = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const n = [normals[t], normals[t + 1], normals[t + 2]];
      expect(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2]).toBeGreaterThan(0);
      expect(Math.hypot(n[0], n[1], n[2])).toBe(1);
    }
  });

  it('refuse un caractère sans rôle, des rangées inégales, un gabarit vide, une épaisseur nulle', () => {
    expect(() => buildVoxelMesh(['x'], 1, NEON.colors, UNIT, 'center')).toThrow(/rôle/);
    expect(() => buildVoxelMesh(['ss', 's'], 1, NEON.colors, UNIT, 'center')).toThrow();
    expect(() => buildVoxelMesh([], 1, NEON.colors, UNIT, 'center')).toThrow();
    expect(() => buildVoxelMesh(['s'], 0, NEON.colors, UNIT, 'center')).toThrow();
  });
});

describe('modèle du néon', () => {
  it('la longueur du corps du modèle est celle de la définition', () => {
    expect(modelBodyLength(NEON)).toBeCloseTo(NEON.bodyLength, 12);
    expect(voxelSize(NEON).x).toBeCloseTo(NEON.bodyLength / SLENDER_FISH.body[0].length, 12);
  });

  it('géométries du corps et de la queue : attributs position, normale et couleur', () => {
    for (const part of ['body', 'tail'] as const) {
      const geometry = createFishGeometry(NEON, part);
      expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
      expect(geometry.getAttribute('normal').count).toBe(geometry.getAttribute('position').count);
      expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
      geometry.dispose();
    }
  });

  it('le corps tient dans sa longueur et la queue reste derrière le pivot', () => {
    const body = createFishGeometry(NEON, 'body');
    body.computeBoundingBox();
    expect(body.boundingBox!.max.x).toBeCloseTo(NEON.bodyLength / 2, 6);
    expect(body.boundingBox!.min.x).toBeCloseTo(-NEON.bodyLength / 2, 6);
    const tail = createFishGeometry(NEON, 'tail');
    tail.computeBoundingBox();
    expect(tail.boundingBox!.max.x).toBeCloseTo(0, 6);
    expect(tail.boundingBox!.min.x).toBeLessThan(0);
    body.dispose();
    tail.dispose();
  });
});
