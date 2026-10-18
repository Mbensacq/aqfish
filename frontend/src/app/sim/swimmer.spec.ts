import { SIM_DT } from './constants';
import { NEON } from './species';
import { createFish, stepFish, swimBounds, wrapAngle, type Fish, type SwimBounds } from './swimmer';
import { waterVolume, type Box3 } from './tank';

type MutableFish = { -readonly [K in keyof Fish]: Fish[K] };

const BOUNDS = swimBounds(NEON, waterVolume());
const EPS = 1e-12;

function inside(box: Box3, f: Fish): boolean {
  return (
    f.x >= box.minX - EPS &&
    f.x <= box.maxX + EPS &&
    f.y >= box.minY - EPS &&
    f.y <= box.maxY + EPS &&
    f.z >= box.minZ - EPS &&
    f.z <= box.maxZ + EPS
  );
}

function swim(fish: MutableFish, steps: number, bounds: SwimBounds = BOUNDS): void {
  for (let i = 0; i < steps; i++) {
    stepFish(fish, SIM_DT, bounds);
  }
}

describe('swimBounds', () => {
  it('zone interdite = volume d’eau moins la marge ; zone d’évitement plus intérieure', () => {
    const water = waterVolume();
    expect(BOUNDS.hard.minX).toBeCloseTo(water.minX + NEON.wallMargin, 12);
    expect(BOUNDS.hard.maxY).toBeCloseTo(water.maxY - NEON.wallMargin, 12);
    expect(BOUNDS.soft.minX).toBeGreaterThan(BOUNDS.hard.minX);
    expect(BOUNDS.soft.maxZ).toBeLessThan(BOUNDS.hard.maxZ);
  });
});

describe('createFish', () => {
  it('même graine et même identifiant ⇒ même poisson', () => {
    expect(createFish(42, 3, 'neon', BOUNDS)).toEqual(createFish(42, 3, 'neon', BOUNDS));
  });

  it('identifiants ou graines différents ⇒ poissons différents', () => {
    const a = createFish(42, 0, 'neon', BOUNDS);
    expect(createFish(42, 1, 'neon', BOUNDS).x).not.toBe(a.x);
    expect(createFish(43, 0, 'neon', BOUNDS).x).not.toBe(a.x);
  });

  it('naît dans la zone d’évitement, à vitesse bornée, état précédent = état courant', () => {
    for (let id = 0; id < 50; id++) {
      const f = createFish(7, id, 'neon', BOUNDS);
      expect(inside(BOUNDS.soft, f)).toBe(true);
      expect(f.speed).toBeGreaterThanOrEqual(NEON.minSpeed);
      expect(f.speed).toBeLessThanOrEqual(NEON.maxSpeed);
      expect([f.px, f.py, f.pz, f.pyaw, f.ppitch, f.pphase]).toEqual([
        f.x,
        f.y,
        f.z,
        f.yaw,
        f.pitch,
        f.phase,
      ]);
      expect(f.yaw).toBeGreaterThan(-Math.PI);
      expect(f.yaw).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('est sérialisable en JSON', () => {
    const f = createFish(1, 2, 'neon', BOUNDS);
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
  });
});

describe('stepFish', () => {
  it('même graine ⇒ mêmes positions après N pas', () => {
    const a = createFish(42, 5, 'neon', BOUNDS) as MutableFish;
    const b = createFish(42, 5, 'neon', BOUNDS) as MutableFish;
    swim(a, 1000);
    swim(b, 1000);
    expect(b).toEqual(a);
  });

  it('graines différentes ⇒ trajectoires différentes', () => {
    const a = createFish(1, 0, 'neon', BOUNDS) as MutableFish;
    const b = createFish(2, 0, 'neon', BOUNDS) as MutableFish;
    swim(a, 600);
    swim(b, 600);
    expect([a.x, a.y, a.z]).not.toEqual([b.x, b.y, b.z]);
  });

  it.each([0, 1, 42, 0xffffffff])(
    'graine %s : 10 000 pas sans sortir du bac, vitesse et inclinaison bornées',
    (seed) => {
      for (let id = 0; id < 4; id++) {
        const f = createFish(seed, id, 'neon', BOUNDS) as MutableFish;
        for (let i = 0; i < 10_000; i++) {
          stepFish(f, SIM_DT, BOUNDS);
          const moved = Math.hypot(f.x - f.px, f.y - f.py, f.z - f.pz);
          if (
            !inside(BOUNDS.hard, f) ||
            f.speed > NEON.maxSpeed ||
            f.speed < NEON.minSpeed ||
            moved > NEON.maxSpeed * SIM_DT + EPS ||
            Math.abs(f.pitch) > NEON.maxPitch + EPS ||
            !(f.yaw > -Math.PI && f.yaw <= Math.PI) ||
            !(f.phase >= 0 && f.phase < 2 * Math.PI)
          ) {
            throw new Error(`invariant violé au pas ${i} : ${JSON.stringify(f)}`);
          }
        }
      }
    },
  );

  it('ne reste pas immobile : explore une bonne part du bac en 10 000 pas', () => {
    const f = createFish(42, 0, 'neon', BOUNDS) as MutableFish;
    let minX = f.x;
    let maxX = f.x;
    for (let i = 0; i < 10_000; i++) {
      stepFish(f, SIM_DT, BOUNDS);
      minX = Math.min(minX, f.x);
      maxX = Math.max(maxX, f.x);
    }
    expect(maxX - minX).toBeGreaterThan((BOUNDS.hard.maxX - BOUNDS.hard.minX) / 2);
  });

  it('face à une paroi, vire pour revenir vers le centre', () => {
    const f = createFish(42, 0, 'neon', BOUNDS) as MutableFish;
    Object.assign(f, { x: BOUNDS.soft.maxX, z: 0, yaw: 0, turn: 0 }); // cap vers +X
    swim(f, 120);
    expect(Math.abs(f.yaw)).toBeGreaterThan(Math.PI / 2); // désormais tourné vers -X
    expect(f.x).toBeLessThanOrEqual(BOUNDS.hard.maxX);
  });

  it('près du fond, remonte ; près de la surface, descend', () => {
    const low = createFish(42, 0, 'neon', BOUNDS) as MutableFish;
    Object.assign(low, { y: BOUNDS.hard.minY, pitch: 0 });
    swim(low, 30);
    expect(low.pitch).toBeGreaterThan(0);

    const high = createFish(42, 1, 'neon', BOUNDS) as MutableFish;
    Object.assign(high, { y: BOUNDS.hard.maxY, pitch: 0 });
    swim(high, 30);
    expect(high.pitch).toBeLessThan(0);
  });

  it('un poisson hors des bornes (état corrompu) y est ramené dès le pas suivant', () => {
    const f = createFish(42, 0, 'neon', BOUNDS) as MutableFish;
    Object.assign(f, { x: 10, y: -10, z: 10 });
    stepFish(f, SIM_DT, BOUNDS);
    expect(inside(BOUNDS.hard, f)).toBe(true);
  });

  it('bac minuscule (bornes réduites à un point) : aucune valeur non finie', () => {
    const tiny = swimBounds(NEON, waterVolume({ width: 0.05, height: 0.08, depth: 0.05 }));
    const f = createFish(42, 0, 'neon', tiny) as MutableFish;
    swim(f, 500, tiny);
    expect([f.x, f.y, f.z, f.yaw, f.pitch, f.speed].every(Number.isFinite)).toBe(true);
    expect(inside(tiny.hard, f)).toBe(true);
  });

  it('la phase du battement avance avec le temps simulé', () => {
    const f = createFish(42, 0, 'neon', BOUNDS) as MutableFish;
    const before = f.phase;
    stepFish(f, SIM_DT, BOUNDS);
    expect(f.pphase).toBe(before);
    expect(f.phase).not.toBe(before);
  });
});

describe('stepFish : pilotage de banc', () => {
  function at(yaw: number, pitch = 0): MutableFish {
    const f = createFish(42, 0, 'neon', BOUNDS) as MutableFish;
    // Au centre du bac, loin des parois : aucun évitement.
    Object.assign(f, { x: 0, y: 0.3, z: 0, yaw, pitch, turn: 0, pitchTarget: 0 });
    return f;
  }

  it('pilotage nul (par défaut ou explicite) : exactement la nage solitaire', () => {
    const a = at(0.4);
    const b = at(0.4);
    for (let i = 0; i < 600; i++) {
      stepFish(a, SIM_DT, BOUNDS);
      stepFish(b, SIM_DT, BOUNDS, 0, 0, 0);
    }
    expect(b).toEqual(a);
  });

  it('tourne vers la direction voulue, d’au plus turnRate · dt par pas en plus de l’errance', () => {
    const steered = at(0);
    const free = at(0);
    stepFish(steered, SIM_DT, BOUNDS, 0, 0, 1); // vers +Z
    stepFish(free, SIM_DT, BOUNDS);
    const turnRate = (NEON.schooling as { turnRate: number }).turnRate;
    expect(steered.yaw - free.yaw).toBeCloseTo(turnRate * SIM_DT, 12);
  });

  it('petit écart : rejoint exactement la direction voulue', () => {
    const steered = at(0);
    const free = at(0);
    const angle = 0.001;
    stepFish(steered, SIM_DT, BOUNDS, Math.cos(angle) - 1, 0, Math.sin(angle));
    stepFish(free, SIM_DT, BOUNDS);
    expect(steered.yaw - free.yaw).toBeCloseTo(angle, 12);
  });

  it('un banc au-dessus fait monter le poisson', () => {
    const steered = at(0);
    for (let i = 0; i < 60; i++) {
      stepFish(steered, SIM_DT, BOUNDS, 0, 1, 0);
    }
    expect(steered.pitch).toBeGreaterThan(0.2);
    expect(steered.pitch).toBeLessThanOrEqual(NEON.maxPitch);
  });

  it('en retard sur son banc, accélère ; en avance, ralentit', () => {
    const behind = at(0);
    const ahead = at(0);
    const free = at(0);
    for (let i = 0; i < 120; i++) {
      stepFish(behind, SIM_DT, BOUNDS, 0.3, 0, 0);
      stepFish(ahead, SIM_DT, BOUNDS, -0.3, 0, 0);
      stepFish(free, SIM_DT, BOUNDS);
    }
    expect(behind.speed).toBeGreaterThan(free.speed);
    expect(ahead.speed).toBeLessThan(free.speed);
  });

  it('pilotage énorme ou opposé au cap : invariants respectés, valeurs finies', () => {
    const f = at(0);
    for (let i = 0; i < 2000; i++) {
      stepFish(f, SIM_DT, BOUNDS, -1e6, 1e6 * (i % 2 ? 1 : -1), 0);
      expect(inside(BOUNDS.hard, f)).toBe(true);
      expect(f.speed).toBeGreaterThanOrEqual(NEON.minSpeed);
      expect(f.speed).toBeLessThanOrEqual(NEON.maxSpeed);
      expect(Math.abs(f.pitch)).toBeLessThanOrEqual(NEON.maxPitch + EPS);
    }
    expect([f.x, f.y, f.z, f.yaw, f.pitch].every(Number.isFinite)).toBe(true);
  });

  it('direction voulue verticale : pas de virage, inclinaison bornée', () => {
    const steered = at(0);
    const free = at(0);
    // cap (1, 0, 0) + (−1, 1, 0) = (0, 1, 0) : aucune composante horizontale.
    stepFish(steered, SIM_DT, BOUNDS, -1, 1, 0);
    stepFish(free, SIM_DT, BOUNDS);
    expect(steered.yaw).toBe(free.yaw);
    expect(steered.pitch).toBeGreaterThan(free.pitch);
  });
});

describe('wrapAngle', () => {
  it.each([
    [0, 0],
    [Math.PI, Math.PI],
    [-Math.PI, Math.PI],
    [3 * Math.PI, Math.PI],
    [2 * Math.PI, 0],
    [-Math.PI / 2, -Math.PI / 2],
    [7, 7 - 2 * Math.PI],
    [-7, -7 + 2 * Math.PI],
  ])('wrapAngle(%s) = %s', (input, expected) => {
    expect(wrapAngle(input)).toBeCloseTo(expected, 12);
  });
});
