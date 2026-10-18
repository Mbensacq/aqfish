import { CAMERA_PRESETS } from '../core/capture/capture-params';
import {
  CAMERA_TRANSITION_SECONDS,
  cameraPresetPose,
  interpolatePose,
  smoothstep,
  tankBoundingRadius,
  type CameraPose,
  type TankDimensions,
  type Vec3,
} from './camera-presets';

const TANK: TankDimensions = { width: 1.2, height: 0.6, depth: 0.5 };
const ASPECT = 16 / 9;

const pose = (preset: (typeof CAMERA_PRESETS)[number]): CameraPose =>
  cameraPresetPose(preset, TANK, ASPECT);

function offset(p: CameraPose): Vec3 {
  return [p.position[0] - p.target[0], p.position[1] - p.target[1], p.position[2] - p.target[2]];
}

function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

/** Angle (radians) entre les directions caméra-cible de deux poses. */
function angleBetween(a: CameraPose, b: CameraPose): number {
  const u = offset(a);
  const v = offset(b);
  const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (length(u) * length(v));
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

const STEPS = Array.from({ length: 41 }, (_, i) => i / 40);

describe('smoothstep', () => {
  it('vaut 0 au départ, 1 à l’arrivée, 0,5 au milieu', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 12);
  });

  it('est bornée hors de [0, 1] et tolère NaN', () => {
    expect(smoothstep(-3)).toBe(0);
    expect(smoothstep(7)).toBe(1);
    expect(smoothstep(Number.NaN)).toBe(0);
    expect(smoothstep(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('est croissante', () => {
    const values = STEPS.map(smoothstep);
    values.slice(1).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(values[i]));
  });
});

describe('interpolatePose', () => {
  it('la durée de transition reste courte (≤ 0,6 s)', () => {
    expect(CAMERA_TRANSITION_SECONDS).toBeGreaterThan(0);
    expect(CAMERA_TRANSITION_SECONDS).toBeLessThanOrEqual(0.6);
  });

  it('début = pose de départ, fin = préréglage, à l’identique', () => {
    const from = pose('front');
    const to = pose('side');
    expect(interpolatePose(from, to, 0)).toEqual(from);
    expect(interpolatePose(from, to, 1)).toEqual(to);
    // Au-delà des bornes : extrémités.
    expect(interpolatePose(from, to, -1)).toEqual(from);
    expect(interpolatePose(from, to, 2)).toEqual(to);
  });

  it('pose identique de part et d’autre : immobile', () => {
    const p = pose('three-quarter');
    for (const t of STEPS) {
      const mid = interpolatePose(p, p, t);
      mid.position.forEach((c, i) => expect(c).toBeCloseTo(p.position[i], 12));
    }
  });

  for (const fromPreset of CAMERA_PRESETS) {
    for (const toPreset of CAMERA_PRESETS) {
      if (fromPreset === toPreset) {
        continue;
      }
      it(`${fromPreset} → ${toPreset} : approche monotone, hors du bac, valeurs finies`, () => {
        const from = pose(fromPreset);
        const to = pose(toPreset);
        const radius = tankBoundingRadius(TANK);
        let previousAngle = Number.POSITIVE_INFINITY;
        for (const t of STEPS) {
          const mid = interpolatePose(from, to, t);
          mid.position.forEach((c) => expect(Number.isFinite(c)).toBe(true));
          // La caméra reste hors de la sphère englobant le bac.
          expect(length(offset(mid))).toBeGreaterThan(radius);
          // L'angle restant jusqu'au préréglage décroît (ou stagne aux extrémités lissées).
          const angle = angleBetween(mid, to);
          expect(angle).toBeLessThanOrEqual(previousAngle + 1e-9);
          previousAngle = angle;
        }
        // acos est imprécis près de 1 : tolérance de l’ordre de 1e-8 rad.
        expect(previousAngle).toBeLessThan(1e-6);
      });
    }
  }

  it('vers `top` : pas de dégénérescence, azimut final conservé (piège lookAt)', () => {
    const from = pose('side');
    const to = pose('top');
    const near = interpolatePose(from, to, 0.999);
    near.position.forEach((c) => expect(Number.isFinite(c)).toBe(true));
    // Juste avant l'arrivée, la caméra est quasi à l'aplomb, mais pas exactement.
    expect(angleBetween(near, to)).toBeLessThan(1e-3);
    expect(interpolatePose(from, to, 1).position[2]).toBeGreaterThan(0);
  });

  it('tourne autour du bac au lieu de le traverser (face → arrière)', () => {
    const from = pose('front');
    const back: CameraPose = {
      position: [from.position[0], from.position[1], -from.position[2]],
      target: from.target,
    };
    const mid = interpolatePose(from, back, 0.5);
    // En ligne droite, la caméra passerait par le centre du bac.
    expect(length(offset(mid))).toBeCloseTo(length(offset(from)), 9);
  });

  it('azimut par le plus court chemin (de -170° à +170° : 20°, pas 340°)', () => {
    const target: Vec3 = [0, 0, 0];
    const at = (deg: number): CameraPose => {
      const r = (deg * Math.PI) / 180;
      return { position: [Math.sin(r), 0, Math.cos(r)], target };
    };
    const mid = interpolatePose(at(-170), at(170), 0.5);
    // Milieu à 180° : derrière (z ≈ -1), pas devant (z ≈ +1).
    expect(mid.position[2]).toBeCloseTo(-1, 9);
  });

  it('interpole la cible en ligne droite (après un déplacement au clic droit)', () => {
    const to = pose('front');
    const from: CameraPose = {
      position: [to.position[0] + 2, to.position[1], to.position[2]],
      target: [to.target[0] + 2, to.target[1], to.target[2]],
    };
    const mid = interpolatePose(from, to, 0.5);
    expect(mid.target[0]).toBeCloseTo(to.target[0] + 1, 9);
  });

  it('cas dégénéré (caméra sur sa cible) : ligne droite, sans NaN', () => {
    const from: CameraPose = { position: [0, 0, 0], target: [0, 0, 0] };
    const to = pose('front');
    const mid = interpolatePose(from, to, 0.5);
    mid.position.forEach((c, i) => expect(c).toBeCloseTo(to.position[i] / 2, 9));
  });
});
