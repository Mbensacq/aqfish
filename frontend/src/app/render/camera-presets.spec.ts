import { PerspectiveCamera, Vector3 } from 'three';

import { CAMERA_PRESETS, type CameraPreset } from '../core/capture/capture-params';
import {
  CAMERA_FOV_DEG,
  cameraPresetPose,
  framingDistance,
  tankBoundingRadius,
  tankCenter,
  type TankDimensions,
} from './camera-presets';

const TANK: TankDimensions = { width: 1.2, height: 0.6, depth: 0.5 };

/** Coins du bac (repère : origine au centre du fond, Y vers le haut). */
function tankCorners(dims: TankDimensions): Vector3[] {
  const corners: Vector3[] = [];
  for (const x of [-dims.width / 2, dims.width / 2]) {
    for (const y of [0, dims.height]) {
      for (const z of [-dims.depth / 2, dims.depth / 2]) {
        corners.push(new Vector3(x, y, z));
      }
    }
  }
  return corners;
}

/** Vrai si tous les coins du bac se projettent dans le cadre de la caméra. */
function seesWholeTank(preset: CameraPreset, dims: TankDimensions, aspect: number): boolean {
  const pose = cameraPresetPose(preset, dims, aspect);
  const camera = new PerspectiveCamera(CAMERA_FOV_DEG, aspect, 0.01, 1000);
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  return tankCorners(dims).every((corner) => {
    const ndc = corner.clone().project(camera);
    return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z > -1 && ndc.z < 1;
  });
}

describe('cameraPresetPose', () => {
  it('produit 5 positions distinctes', () => {
    const keys = CAMERA_PRESETS.map((preset) =>
      cameraPresetPose(preset, TANK, 16 / 9)
        .position.map((c) => c.toFixed(4))
        .join(','),
    );
    expect(new Set(keys).size).toBe(CAMERA_PRESETS.length);
  });

  it.each(CAMERA_PRESETS)('« %s » vise le centre du bac', (preset) => {
    expect(cameraPresetPose(preset, TANK, 16 / 9).target).toEqual([0, TANK.height / 2, 0]);
  });

  it('« top » est au-dessus du bac, presque à la verticale', () => {
    const [x, y, z] = cameraPresetPose('top', TANK, 16 / 9).position;
    expect(y).toBeGreaterThan(TANK.height);
    expect(Math.hypot(x, z)).toBeLessThan(0.01 * (y - TANK.height / 2));
  });

  it('« bottom » est sous le fond du bac, en contre-plongée légèrement avant', () => {
    const [x, y, z] = cameraPresetPose('bottom', TANK, 16 / 9).position;
    expect(y).toBeLessThan(0);
    expect(x).toBe(0);
    expect(z).toBeGreaterThan(0);
    // Plus en dessous qu'en avant : on regarde le fond, pas la vitre avant.
    expect(Math.abs(y - TANK.height / 2)).toBeGreaterThan(z);
  });

  it('« front » est devant (+Z) et à mi-hauteur, « side » sur le côté (+X)', () => {
    const front = cameraPresetPose('front', TANK, 16 / 9).position;
    const side = cameraPresetPose('side', TANK, 16 / 9).position;
    expect(front[0]).toBe(0);
    expect(front[1]).toBe(TANK.height / 2);
    expect(front[2]).toBeGreaterThan(TANK.depth / 2);
    expect(side[0]).toBeGreaterThan(TANK.width / 2);
    expect(side[2]).toBe(0);
  });

  it('« three-quarter » est devant, à droite et au-dessus du centre', () => {
    const [x, y, z] = cameraPresetPose('three-quarter', TANK, 16 / 9).position;
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(TANK.height / 2);
    expect(z).toBeGreaterThan(0);
  });

  it.each(CAMERA_PRESETS.flatMap((p) => [16 / 9, 1, 9 / 16, 4].map((a) => [p, a] as const)))(
    '« %s » montre tout le bac (aspect %f)',
    (preset, aspect) => {
      expect(seesWholeTank(preset, TANK, aspect)).toBe(true);
    },
  );

  it('montre tout un bac très allongé', () => {
    const long: TankDimensions = { width: 3, height: 0.2, depth: 0.2 };
    for (const preset of CAMERA_PRESETS) {
      expect(seesWholeTank(preset, long, 16 / 9)).toBe(true);
    }
  });

  it('est déterministe', () => {
    expect(cameraPresetPose('side', TANK, 1.5)).toEqual(cameraPresetPose('side', TANK, 1.5));
  });

  it('recule la caméra quand le cadre est plus étroit', () => {
    expect(framingDistance(TANK, CAMERA_FOV_DEG, 0.5)).toBeGreaterThan(
      framingDistance(TANK, CAMERA_FOV_DEG, 2),
    );
  });
});

describe('géométrie du bac', () => {
  it('centre au milieu de la hauteur', () => {
    expect(tankCenter(TANK)).toEqual([0, 0.3, 0]);
  });

  it('rayon englobant = demi-diagonale', () => {
    expect(tankBoundingRadius({ width: 2, height: 2, depth: 1 })).toBeCloseTo(1.5);
  });

  it.each([
    [{ width: 0, height: 1, depth: 1 }, 45, 1],
    [{ width: 1, height: -1, depth: 1 }, 45, 1],
    [{ width: 1, height: 1, depth: Number.NaN }, 45, 1],
    [TANK, 0, 1],
    [TANK, 180, 1],
    [TANK, 45, 0],
    [TANK, 45, Number.POSITIVE_INFINITY],
  ])('rejette des paramètres invalides (%j, fov %f, aspect %f)', (dims, fov, aspect) => {
    expect(() => framingDistance(dims, fov, aspect)).toThrow(RangeError);
  });
});
