import { Matrix4, Object3D, Vector3 } from 'three';

import { NEON } from '../sim/species';
import { createFish, stepFish, swimBounds, type Fish } from '../sim/swimmer';
import { waterVolume } from '../sim/tank';
import { FishLayer, interpolateFishPose, type FishPose } from './fish-layer';

const BOUNDS = swimBounds(NEON, waterVolume());

function fishAfterSteps(id: number, steps: number): Fish {
  const fish = createFish(42, id, 'neon', BOUNDS) as { -readonly [K in keyof Fish]: Fish[K] };
  for (let i = 0; i < steps; i++) {
    stepFish(fish, 1 / 60, BOUNDS);
  }
  return fish;
}

function pose(): FishPose {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, phase: 0 };
}

describe('interpolateFishPose', () => {
  const fish: Fish = {
    ...fishAfterSteps(0, 0),
    px: 0,
    x: 1,
    py: 2,
    y: 4,
    pz: -1,
    z: 1,
    pyaw: 3,
    yaw: -3, // passage par ±π : le plus court chemin fait ~0,28 rad, pas ~6 rad
    ppitch: 0,
    pitch: 0.2,
    pphase: 6,
    phase: 0.2, // phase repassée par 0
  };

  it('alpha = 0 : pas précédent ; alpha = 1 : pas courant', () => {
    expect(interpolateFishPose(fish, 0, pose())).toMatchObject({ x: 0, y: 2, z: -1, yaw: 3 });
    const end = interpolateFishPose(fish, 1, pose());
    expect(end.x).toBe(1);
    expect(end.y).toBe(4);
    expect(end.pitch).toBeCloseTo(0.2, 12);
  });

  it('alpha = 0,5 : milieu, angles par le plus court chemin', () => {
    const mid = interpolateFishPose(fish, 0.5, pose());
    expect(mid.x).toBeCloseTo(0.5, 12);
    expect(Math.abs(Math.abs(mid.yaw) - Math.PI)).toBeLessThan(0.15);
    expect(mid.phase).toBeGreaterThan(6);
    expect(mid.phase).toBeLessThan(2 * Math.PI + 0.2);
  });

  it('alpha hors de [0, 1] est borné', () => {
    expect(interpolateFishPose(fish, -1, pose()).x).toBe(0);
    expect(interpolateFishPose(fish, 2, pose()).x).toBe(1);
  });

  it('écrit dans out et le renvoie (aucune allocation)', () => {
    const out = pose();
    expect(interpolateFishPose(fish, 0.3, out)).toBe(out);
  });
});

describe('FishLayer', () => {
  let layer: FishLayer;
  const m = new Matrix4();
  const p = new Vector3();

  beforeEach(() => (layer = new FishLayer(NEON, 4)));
  afterEach(() => layer.dispose());

  it('une instance par poisson, placée à la position interpolée', () => {
    const entities = [fishAfterSteps(0, 10), fishAfterSteps(1, 10)];
    layer.update(entities, 1);
    expect(layer.count).toBe(2);
    p.setFromMatrixPosition(layer.bodyMatrixAt(1, m));
    expect(p.x).toBeCloseTo(entities[1].x, 6);
    expect(p.y).toBeCloseTo(entities[1].y, 6);
    expect(p.z).toBeCloseTo(entities[1].z, 6);
  });

  it('orienté dans le sens de la nage (à l’ondulation près)', () => {
    const fish = {
      ...fishAfterSteps(0, 0),
      yaw: Math.PI / 2,
      pyaw: Math.PI / 2,
      pitch: 0,
      ppitch: 0,
    };
    layer.update([fish], 1);
    const forward = new Vector3(1, 0, 0).transformDirection(layer.bodyMatrixAt(0, m));
    // cap π/2 : nage vers +Z
    expect(forward.z).toBeGreaterThan(0.95);
  });

  it('la queue est accrochée à l’arrière du corps', () => {
    const fish = fishAfterSteps(0, 0);
    layer.update([fish], 1);
    const hinge = new Vector3().setFromMatrixPosition(layer.tailMatrixAt(0, m));
    const center = new Vector3(fish.x, fish.y, fish.z);
    expect(hinge.distanceTo(center)).toBeCloseTo(NEON.bodyLength / 2, 6);
  });

  it('la pose de la queue dépend de la phase (temps simulé), et elle seule', () => {
    const fish = fishAfterSteps(0, 0);
    const phaseA = { ...fish, phase: 0.5, pphase: 0.5 };
    const phaseB = { ...fish, phase: 2.5, pphase: 2.5 };
    layer.update([phaseA], 1);
    const a = layer.tailMatrixAt(0, new Matrix4());
    layer.update([phaseB], 1);
    const b = layer.tailMatrixAt(0, new Matrix4());
    layer.update([phaseA], 1);
    const again = layer.tailMatrixAt(0, new Matrix4());
    expect(b.equals(a)).toBe(false);
    expect(again.equals(a)).toBe(true);
  });

  it('ne dépasse pas sa capacité et ignore les autres espèces', () => {
    const many = Array.from({ length: 10 }, (_, i) => fishAfterSteps(i, 0));
    layer.update(many, 0);
    expect(layer.count).toBe(4);
    layer.update([{ ...many[0], species: 'autre' as Fish['species'] }], 0);
    expect(layer.count).toBe(0);
    layer.update([], 0);
    expect(layer.count).toBe(0);
  });

  it('dispose retire la couche de la scène', () => {
    const own = new FishLayer(NEON, 1);
    const scene = new Object3D();
    scene.add(own.object);
    own.dispose();
    expect(scene.children).toEqual([]);
  });
});
