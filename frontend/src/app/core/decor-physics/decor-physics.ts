import RAPIER from '@dimforge/rapier3d-compat';

import {
  DROP_MAX_STEPS,
  DROP_TIME_STEP,
  type DropPoint,
  type DropScene,
} from '../../sim/decor-drop';

/**
 * Chute d'un élément de décor avec le moteur Rapier (issue #170, ADR 0046). Ce module importe
 * le moteur : il n'est chargé qu'à la demande, par `loadDecorPhysics`
 * (`load-decor-physics.ts`), à la première ouverture de l'éditeur ; rien dans `sim/` ne
 * l'importe. Le moteur n'est utilisé que pendant le placement.
 */

/** Résultat d'une chute : pose de repos de la base et trajectoire, un point par pas. */
export interface DropResult {
  readonly rest: DropPoint;
  /** Base du corps après chaque pas (départ exclu), pour l'animation de l'éditeur. */
  readonly path: readonly DropPoint[];
  /** Vrai si le corps s'est immobilisé avant `DROP_MAX_STEPS`. */
  readonly settled: boolean;
}

/** Moteur de chute prêt à l'emploi. */
export interface DecorDropper {
  drop(scene: DropScene): DropResult;
}

/** Gravité, en m/s². */
const GRAVITY = -9.81;
/** Frottement du corps et du décor : assez pour tenir sur un rocher peu pentu. */
const FRICTION = 0.7;
/** Vitesse en dessous de laquelle le corps est jugé immobile (m/s). */
const REST_SPEED = 1e-3;
/** Nombre de pas consécutifs sous `REST_SPEED` pour conclure au repos. */
const REST_STEPS = 6;
/** Épaisseur des boîtes du sol et des vitres (m). */
const WALL = 0.5;

/** Initialise le moteur (WebAssembly embarqué en base64 : aucun fichier `.wasm` à servir). */
export async function initDecorPhysics(): Promise<DecorDropper> {
  await RAPIER.init();
  return { drop: simulateDrop };
}

/**
 * Fait tomber le corps de `scene` jusqu'au repos ou pendant `DROP_MAX_STEPS` pas fixes. Le
 * corps ne tourne pas (rotations bloquées) : la rotation enregistrée est celle choisie dans
 * l'éditeur. Monde neuf à chaque appel, objets créés dans un ordre fixe : même scène, même
 * résultat.
 */
export function simulateDrop(scene: DropScene): DropResult {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  try {
    world.timestep = DROP_TIME_STEP;
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const box = (hx: number, hy: number, hz: number, x: number, y: number, z: number) =>
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(FRICTION),
        ground,
      );
    const { halfWidth: w, halfDepth: d, floorY } = scene;
    box(w + WALL, WALL, d + WALL, 0, floorY - WALL, 0);
    box(WALL, 1, d + WALL, -w - WALL, floorY + 1, 0);
    box(WALL, 1, d + WALL, w + WALL, floorY + 1, 0);
    box(w + WALL, 1, WALL, 0, floorY + 1, -d - WALL);
    box(w + WALL, 1, WALL, 0, floorY + 1, d + WALL);
    for (const s of scene.fixed) {
      world.createCollider(
        RAPIER.ColliderDesc.ball(s.radius).setTranslation(s.x, s.y, s.z).setFriction(FRICTION),
        ground,
      );
    }
    const { x, y, z } = scene.start;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).lockRotations(),
    );
    for (const s of scene.body) {
      world.createCollider(
        RAPIER.ColliderDesc.ball(s.radius)
          .setTranslation(s.x, s.y, s.z)
          .setFriction(FRICTION)
          .setRestitution(0),
        body,
      );
    }
    const path: DropPoint[] = [];
    let still = 0;
    let settled = false;
    for (let step = 0; step < DROP_MAX_STEPS; step++) {
      world.step();
      const t = body.translation();
      path.push({ x: t.x, y: t.y, z: t.z });
      const v = body.linvel();
      still = Math.hypot(v.x, v.y, v.z) < REST_SPEED ? still + 1 : 0;
      if (body.isSleeping() || still >= REST_STEPS) {
        settled = true;
        break;
      }
    }
    return { rest: path[path.length - 1], path, settled };
  } finally {
    world.free();
  }
}
