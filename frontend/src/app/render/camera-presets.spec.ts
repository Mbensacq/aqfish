import { PerspectiveCamera, Vector3 } from 'three';

import { CAMERA_PRESETS, type CameraPreset } from '../core/capture/capture-params';
import {
  CAMERA_FOV_DEG,
  cameraPresetPose,
  framingDistance,
  orbitDistanceLimits,
  panTargetRadius,
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

describe('orbitDistanceLimits', () => {
  it.each([TANK, { width: 3, height: 0.2, depth: 0.2 }, { width: 0.3, height: 1, depth: 0.3 }])(
    'garde la caméra hors du bac sous tous les angles (%j)',
    (dims) => {
      const { min } = orbitDistanceLimits(dims);
      const center = new Vector3(...tankCenter(dims));
      // Le coin le plus éloigné du centre est plus proche que la borne minimale.
      const farthest = Math.max(...tankCorners(dims).map((c) => c.distanceTo(center)));
      expect(min).toBeGreaterThan(farthest);
    },
  );

  it('laisse le cadrage des préréglages dans les bornes', () => {
    const { min, max } = orbitDistanceLimits(TANK);
    for (const aspect of [16 / 9, 1, 9 / 16, 4]) {
      const d = framingDistance(TANK, CAMERA_FOV_DEG, aspect);
      expect(d).toBeGreaterThan(min);
      expect(d).toBeLessThan(max);
    }
  });

  it('rejette des dimensions invalides', () => {
    expect(() => orbitDistanceLimits({ width: 0, height: 1, depth: 1 })).toThrow(RangeError);
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

describe('panTargetRadius (bug #10)', () => {
  const SHAPES: TankDimensions[] = [
    TANK,
    { width: 3, height: 0.2, depth: 0.2 },
    { width: 0.3, height: 1, depth: 0.3 },
  ];

  it('vaut 90 % de distanceMin × sin(demi-champ) (valeur exacte)', () => {
    const { min } = orbitDistanceLimits(TANK);
    expect(panTargetRadius(TANK)).toBeCloseTo(min * Math.sin(Math.PI / 8) * 0.9, 12);
    expect(panTargetRadius(TANK, 90)).toBeCloseTo(min * Math.SQRT1_2 * 0.9, 12);
  });

  it.each(SHAPES)(
    'cible au bord de la sphère, caméra au plus près : le centre reste dans le champ (%j)',
    (dims) => {
      const radius = panTargetRadius(dims);
      const { min } = orbitDistanceLimits(dims);
      const center = new Vector3(...tankCenter(dims));
      const halfFov = (CAMERA_FOV_DEG * Math.PI) / 360;
      // Plusieurs directions de décalage de la cible et de visée, pire cas compris
      // (visée perpendiculaire au décalage).
      const offsets = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, -1)];
      const views = [new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, -1, 0.45)];
      for (const offset of offsets) {
        for (const viewDir of views) {
          const target = center.clone().addScaledVector(offset, radius);
          const camera = target.clone().addScaledVector(viewDir.clone().normalize(), min);
          const toTarget = target.clone().sub(camera).normalize();
          const toCenter = center.clone().sub(camera).normalize();
          expect(toTarget.angleTo(toCenter)).toBeLessThan(halfFov);
        }
      }
    },
  );

  it('est plus petit que le rayon englobant : la cible ne quitte pas les abords du bac', () => {
    for (const dims of SHAPES) {
      expect(panTargetRadius(dims)).toBeGreaterThan(0);
      expect(panTargetRadius(dims)).toBeLessThan(tankBoundingRadius(dims));
    }
  });

  it.each([0, -10, 180, Number.NaN])('rejette un champ de vision invalide (%f)', (fov) => {
    expect(() => panTargetRadius(TANK, fov)).toThrow(RangeError);
  });

  it('rejette des dimensions invalides', () => {
    expect(() => panTargetRadius({ width: 0, height: 1, depth: 1 })).toThrow(RangeError);
  });
});
