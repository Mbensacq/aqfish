import { CABINET_OVERHANG, roomInterior } from '../sim/room';
import type { TankDimensions, Vec3 } from './camera-presets';
import {
  FREE_CAMERA_CLEARANCE,
  FREE_CAMERA_IDLE,
  FREE_CAMERA_MAX_DT,
  FREE_CAMERA_MAX_PITCH,
  FREE_CAMERA_SPEED,
  FREE_CAMERA_STEP,
  constrainFreePosition,
  freeCameraBounds,
  freeCameraDirection,
  freeCameraFromPose,
  freeCameraPose,
  insideBox,
  isFreeCameraAtRest,
  isFreePositionAllowed,
  stepFreeCamera,
  turnFreeCamera,
  type FreeCameraInput,
  type FreeCameraState,
} from './free-camera';

const TANK: TankDimensions = { width: 0.8, height: 0.45, depth: 0.35 };
const CABINET = 0.75;
const BOUNDS = freeCameraBounds(TANK, CABINET);

function at(position: Vec3, yaw = 0, pitch = 0): FreeCameraState {
  return { position, yaw, pitch, velocity: [0, 0, 0] };
}

/** Avance `seconds` de temps réel, en images de 1/60 s. */
function run(state: FreeCameraState, input: FreeCameraInput, seconds: number): FreeCameraState {
  let current = state;
  let carry = 0;
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
    const next = stepFreeCamera(current, input, 1 / 60, BOUNDS, carry);
    current = next.state;
    carry = next.remainder;
  }
  return current;
}

const FORWARD: FreeCameraInput = { forward: 1, strafe: 0, vertical: 0 };

describe('freeCameraBounds (#343)', () => {
  it('dérive la pièce de roomInterior, à la marge près', () => {
    const inner = roomInterior(TANK);
    const c = FREE_CAMERA_CLEARANCE;
    expect(BOUNDS.room.minX).toBeCloseTo(inner.minX + c, 9);
    expect(BOUNDS.room.maxX).toBeCloseTo(inner.maxX - c, 9);
    expect(BOUNDS.room.minZ).toBeCloseTo(inner.minZ + c, 9);
    expect(BOUNDS.room.maxZ).toBeCloseTo(inner.maxZ - c, 9);
    expect(BOUNDS.room.maxY).toBeCloseTo(inner.beamY - c, 9);
    expect(BOUNDS.room.minY).toBeCloseTo(-CABINET + c, 9);
  });

  it('englobe le bac et son meuble, plateau en débord compris', () => {
    const o = BOUNDS.obstacle;
    expect(o.maxX).toBeCloseTo(TANK.width / 2 + CABINET_OVERHANG + FREE_CAMERA_CLEARANCE, 9);
    expect(o.maxY).toBeCloseTo(TANK.height + FREE_CAMERA_CLEARANCE, 9);
    expect(o.minY).toBeLessThan(BOUNDS.room.minY);
    expect(o.maxZ).toBeCloseTo(TANK.depth / 2 + CABINET_OVERHANG + FREE_CAMERA_CLEARANCE, 9);
  });

  it('meuble de hauteur nulle : sol au pied du bac', () => {
    expect(freeCameraBounds(TANK, 0).room.minY).toBeCloseTo(FREE_CAMERA_CLEARANCE, 9);
  });

  it('refuse des dimensions ou une hauteur invalides', () => {
    expect(() => freeCameraBounds({ ...TANK, width: 0 }, CABINET)).toThrow(RangeError);
    expect(() => freeCameraBounds({ ...TANK, depth: Number.NaN }, CABINET)).toThrow(RangeError);
    expect(() => freeCameraBounds(TANK, -0.1)).toThrow(RangeError);
    expect(() => freeCameraBounds(TANK, Infinity)).toThrow(RangeError);
  });
});

describe('isFreePositionAllowed et constrainFreePosition (#343)', () => {
  const r = BOUNDS.room;
  const o = BOUNDS.obstacle;

  it('accepte les huit coins de la pièce, refuse au-delà', () => {
    for (const x of [r.minX, r.maxX]) {
      for (const y of [r.minY, r.maxY]) {
        for (const z of [r.minZ, r.maxZ]) {
          if (insideBox(o, [x, y, z])) {
            continue; // coins du fond, au ras du meuble : vérifiés plus bas
          }
          expect(isFreePositionAllowed(BOUNDS, [x, y, z])).toBe(true);
          expect(isFreePositionAllowed(BOUNDS, [x + Math.sign(x) * 0.01, y, z])).toBe(false);
        }
      }
    }
    expect(isFreePositionAllowed(BOUNDS, [0, r.maxY + 0.01, 1])).toBe(false);
    expect(isFreePositionAllowed(BOUNDS, [0, r.minY - 0.01, 1])).toBe(false);
  });

  it('refuse l’intérieur du bac et du meuble, accepte leurs faces', () => {
    expect(isFreePositionAllowed(BOUNDS, [0, TANK.height / 2, 0])).toBe(false);
    expect(isFreePositionAllowed(BOUNDS, [0, -0.3, 0])).toBe(false);
    expect(isFreePositionAllowed(BOUNDS, [0, o.maxY, 0])).toBe(true);
    expect(isFreePositionAllowed(BOUNDS, [o.maxX, 0.2, 0])).toBe(true);
  });

  it('ramène dans la pièce une position hors des murs', () => {
    const p = constrainFreePosition(BOUNDS, [100, 50, -100]);
    expect(p).toEqual([r.maxX, r.maxY, r.minZ]);
    expect(isFreePositionAllowed(BOUNDS, p)).toBe(true);
  });

  it('sort du bac par la face la plus proche', () => {
    const p = constrainFreePosition(BOUNDS, [0.1, TANK.height - 0.02, 0]);
    expect(p).toEqual([0.1, o.maxY, 0]);
    const front = constrainFreePosition(BOUNDS, [0, 0.2, TANK.depth / 2]);
    expect(front[2]).toBeCloseTo(o.maxZ, 9);
  });

  it('position permise : inchangée ; valeurs non finies remplacées', () => {
    expect(constrainFreePosition(BOUNDS, [1, 1, 1])).toEqual([1, 1, 1]);
    const p = constrainFreePosition(BOUNDS, [Number.NaN, Infinity, Number.NaN]);
    expect(isFreePositionAllowed(BOUNDS, p)).toBe(true);
  });
});

describe('freeCameraFromPose et freeCameraPose (#343)', () => {
  it('garde la position et la direction de visée de la pose orbitale', () => {
    const pose = { position: [1, 1, 1.5] as Vec3, target: [0, 0.225, 0] as Vec3 };
    const state = freeCameraFromPose(pose, BOUNDS);
    expect(state.position).toEqual([1, 1, 1.5]);
    expect(isFreeCameraAtRest(state)).toBe(true);
    const d = freeCameraDirection(state.yaw, state.pitch);
    const expected = [-1, -0.775, -1.5];
    const n = Math.hypot(...expected);
    for (let i = 0; i < 3; i++) {
      expect(d[i]).toBeCloseTo(expected[i] / n, 9);
    }
    const back = freeCameraPose(state, n);
    for (let i = 0; i < 3; i++) {
      expect(back.target[i]).toBeCloseTo(pose.target[i], 9);
    }
  });

  it('pose verticale : inclinaison bornée ; pose dégénérée : vers le mur du fond', () => {
    const top = freeCameraFromPose({ position: [0, 2, 0], target: [0, 0, 0] }, BOUNDS);
    expect(top.pitch).toBe(-FREE_CAMERA_MAX_PITCH);
    const same = freeCameraFromPose({ position: [1, 1, 1], target: [1, 1, 1] }, BOUNDS);
    expect(same.yaw).toBe(0);
    expect(same.pitch).toBe(0);
    expect(freeCameraDirection(0, 0)).toEqual([-0, 0, -1]);
  });

  it('pose orbitale hors de la pièce : ramenée dedans', () => {
    const state = freeCameraFromPose({ position: [0, 9, 9], target: [0, 0.2, 0] }, BOUNDS);
    expect(isFreePositionAllowed(BOUNDS, state.position)).toBe(true);
  });

  it('distance de visée invalide : 1 m', () => {
    const pose = freeCameraPose(at([1, 1, 1]), Number.NaN);
    expect(pose.target).toEqual([1, 1, 0]);
  });
});

describe('turnFreeCamera (#343)', () => {
  it('glisser à droite tourne à droite, vers le haut lève la vue', () => {
    const turned = turnFreeCamera(at([1, 1, 1]), 100, -50);
    expect(turned.yaw).toBeLessThan(0);
    expect(turned.pitch).toBeGreaterThan(0);
    // Cap négatif : la visée part vers +X (la droite quand on regarde vers −Z).
    expect(freeCameraDirection(turned.yaw, 0)[0]).toBeGreaterThan(0);
  });

  it('borne l’inclinaison et ramène le cap dans ]−π, π]', () => {
    const up = turnFreeCamera(at([1, 1, 1]), 0, -1e6);
    expect(up.pitch).toBe(FREE_CAMERA_MAX_PITCH);
    const down = turnFreeCamera(at([1, 1, 1]), 0, 1e6);
    expect(down.pitch).toBe(-FREE_CAMERA_MAX_PITCH);
    const spun = turnFreeCamera(at([1, 1, 1]), 1e5, 0);
    expect(spun.yaw).toBeGreaterThan(-Math.PI);
    expect(spun.yaw).toBeLessThanOrEqual(Math.PI);
  });

  it('glissement nul ou non fini : état inchangé', () => {
    const state = at([1, 1, 1]);
    expect(turnFreeCamera(state, 0, 0)).toBe(state);
    expect(turnFreeCamera(state, Number.NaN, Infinity)).toBe(state);
  });
});

describe('stepFreeCamera (#343)', () => {
  const start = at([0, 1, 1.5]);

  it('avance vers −Z au cap 0, vitesse amortie jusqu’à la croisière', () => {
    const early = run(start, FORWARD, 0.05);
    const later = run(start, FORWARD, 1);
    expect(early.position[2]).toBeLessThan(1.5);
    expect(-early.velocity[2]).toBeLessThan(FREE_CAMERA_SPEED * 0.5);
    expect(-later.velocity[2]).toBeCloseTo(FREE_CAMERA_SPEED, 2);
    expect(later.position[0]).toBeCloseTo(0, 9);
    expect(later.position[1]).toBeCloseTo(1, 9);
  });

  it('s’arrête en douceur une fois la touche relâchée', () => {
    const moving = run(start, FORWARD, 0.5);
    const coasting = run(moving, FREE_CAMERA_IDLE, 0.1);
    expect(coasting.position[2]).toBeLessThan(moving.position[2]);
    const stopped = run(moving, FREE_CAMERA_IDLE, 3);
    expect(isFreeCameraAtRest(stopped)).toBe(true);
  });

  it('reculer, côtés, monter et descendre', () => {
    const back = run(start, { forward: -1, strafe: 0, vertical: 0 }, 0.3);
    expect(back.position[2]).toBeGreaterThan(1.5);
    const right = run(start, { forward: 0, strafe: 1, vertical: 0 }, 0.3);
    expect(right.position[0]).toBeGreaterThan(0);
    const up = run(start, { forward: 0, strafe: 0, vertical: 1 }, 0.3);
    expect(up.position[1]).toBeGreaterThan(1);
    const down = run(start, { forward: 0, strafe: 0, vertical: -1 }, 0.3);
    expect(down.position[1]).toBeLessThan(1);
  });

  it('avance dans le plan horizontal même tête levée', () => {
    const looking = run(at([0, 1, 1.5], 0, 1.2), FORWARD, 0.5);
    expect(looking.position[1]).toBeCloseTo(1, 9);
  });

  it('diagonale : pas plus vite qu’en ligne droite', () => {
    const diagonal = run(start, { forward: 1, strafe: 1, vertical: 0 }, 2);
    expect(Math.hypot(diagonal.velocity[0], diagonal.velocity[2])).toBeLessThanOrEqual(
      FREE_CAMERA_SPEED + 1e-9,
    );
  });

  it('ne traverse ni les murs, ni le sol, ni le plafond (coins de la pièce)', () => {
    const r = BOUNDS.room;
    const corners: [Vec3, FreeCameraInput, number][] = [
      [[r.maxX - 0.2, 1, r.maxZ - 0.2], { forward: -1, strafe: 1, vertical: 1 }, 0],
      [[r.minX + 0.2, 1, r.maxZ - 0.2], { forward: -1, strafe: -1, vertical: -1 }, 0],
      [[r.minX + 0.2, 1, r.minZ + 0.2], { forward: 1, strafe: -1, vertical: 1 }, 0],
      [[r.maxX - 0.2, 1, r.minZ + 0.2], { forward: 1, strafe: 1, vertical: -1 }, 0],
    ];
    for (const [position, input, yaw] of corners) {
      const end = run(at(position, yaw), input, 4);
      expect(isFreePositionAllowed(BOUNDS, end.position)).toBe(true);
      // Plaqué dans le coin visé, sur les trois axes.
      expect(Math.min(Math.abs(end.position[0] - r.minX), Math.abs(end.position[0] - r.maxX))).toBe(
        0,
      );
      expect(Math.min(Math.abs(end.position[1] - r.minY), Math.abs(end.position[1] - r.maxY))).toBe(
        0,
      );
      expect(Math.min(Math.abs(end.position[2] - r.minZ), Math.abs(end.position[2] - r.maxZ))).toBe(
        0,
      );
      expect(isFreeCameraAtRest(run(end, input, 0.1))).toBe(true);
    }
  });

  it('ne traverse pas le bac : arrêt sur sa boîte, de chaque côté et par-dessus', () => {
    const o = BOUNDS.obstacle;
    const cases: [Vec3, FreeCameraInput, number, number][] = [
      // Devant, en avançant vers le bac : arrêt sur la face avant.
      [[0, 0.2, 1.5], FORWARD, 2, o.maxZ],
      // À droite, en allant à gauche : arrêt sur la face droite.
      [[1.5, 0.2, 0], { forward: 0, strafe: -1, vertical: 0 }, 0, o.maxX],
      // À gauche, en allant à droite.
      [[-1.5, 0.2, 0], { forward: 0, strafe: 1, vertical: 0 }, 0, o.minX],
      // Au-dessus, en descendant : arrêt sur le dessus.
      [[0, 1.2, 0], { forward: 0, strafe: 0, vertical: -1 }, 1, o.maxY],
    ];
    for (const [position, input, axis, face] of cases) {
      let state = at(position);
      let carry = 0;
      for (let i = 0; i < 300; i++) {
        const next = stepFreeCamera(state, input, 1 / 60, BOUNDS, carry);
        state = next.state;
        carry = next.remainder;
        expect(insideBox(o, state.position)).toBe(false);
      }
      expect(state.position[axis]).toBeCloseTo(face, 9);
    }
  });

  it('glisse le long du bac au lieu de s’y bloquer', () => {
    const o = BOUNDS.obstacle;
    // Avance en diagonale vers l'avant-gauche du bac, depuis l'avant-droite.
    const end = run(at([0.3, 0.2, 0.8]), { forward: 1, strafe: -1, vertical: 0 }, 0.9);
    expect(end.position[2]).toBeCloseTo(o.maxZ, 9);
    expect(end.position[0]).toBeLessThan(0);
    expect(end.position[0]).toBeGreaterThan(o.minX);
  });

  it('pas fixes : même trajectoire quel que soit le découpage du temps', () => {
    const coarse = (() => {
      let state = start;
      let carry = 0;
      for (let i = 0; i < 10; i++) {
        const next = stepFreeCamera(state, FORWARD, 0.1, BOUNDS, carry);
        state = next.state;
        carry = next.remainder;
      }
      return state;
    })();
    const fine = (() => {
      let state = start;
      let carry = 0;
      for (let i = 0; i < 100; i++) {
        const next = stepFreeCamera(state, FORWARD, 0.01, BOUNDS, carry);
        state = next.state;
        carry = next.remainder;
      }
      return state;
    })();
    expect(fine.position[2]).toBeCloseTo(coarse.position[2], 3);
  });

  it('temps nul, négatif ou non fini : aucun pas ; temps énorme : borné', () => {
    expect(stepFreeCamera(start, FORWARD, 0, BOUNDS).state).toBe(start);
    expect(stepFreeCamera(start, FORWARD, -1, BOUNDS).state).toBe(start);
    expect(stepFreeCamera(start, FORWARD, Number.NaN, BOUNDS).state).toBe(start);
    const tiny = stepFreeCamera(start, FORWARD, FREE_CAMERA_STEP / 2, BOUNDS);
    expect(tiny.state).toBe(start);
    expect(tiny.remainder).toBeCloseTo(FREE_CAMERA_STEP / 2, 12);
    const huge = stepFreeCamera(start, FORWARD, 1e6, BOUNDS).state;
    expect(1.5 - huge.position[2]).toBeLessThanOrEqual(FREE_CAMERA_SPEED * FREE_CAMERA_MAX_DT);
  });

  it('consigne non finie ou hors bornes : ramenée dans [−1, 1]', () => {
    // À côté du bac : rien ne barre la route vers le mur du fond pendant 1 s.
    const wild = run(at([2, 1, 1.5]), { forward: 99, strafe: Number.NaN, vertical: Infinity }, 1);
    expect(-wild.velocity[2]).toBeCloseTo(FREE_CAMERA_SPEED, 2);
    expect(wild.velocity[1]).toBe(0); // non fini : axe ignoré
    expect(wild.position[0]).toBe(2);
  });

  it('déterministe : mêmes entrées, même état', () => {
    const a = run(start, { forward: 1, strafe: 0.5, vertical: 0.2 }, 1.3);
    const b = run(start, { forward: 1, strafe: 0.5, vertical: 0.2 }, 1.3);
    expect(a).toEqual(b);
  });
});
