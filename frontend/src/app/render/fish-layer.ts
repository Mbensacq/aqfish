import {
  Euler,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';

import { NEON, type SpeciesDefinition } from '../sim/species';
import { wrapAngle, type Fish } from '../sim/swimmer';
import { undulationAt, undulationScale, type Undulation } from '../sim/undulation';
import { createFishGeometry, modelBodyLength } from './fish-model';

/** Nombre maximal de poissons d'une espèce affichés (capacité des `InstancedMesh`). */
export const MAX_FISH_PER_SPECIES = 256;

const TWO_PI = Math.PI * 2;

/**
 * Ordre de rendu : après l'eau (1) et le verre (2), avant les arêtes (3) (voir
 * render/aquarium-scene.ts). Même 8 % de teinte de verre suffisent à faire basculer le rouge
 * néon vers le rouge koï à la quantification (constaté sur capture, cycle 3).
 */
export const FISH_RENDER_ORDER = 2.5;

/** Pose interpolée d'un poisson, en repère du bac. */
export interface FishPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Phase du battement de queue interpolée. */
  phase: number;
}

/**
 * Interpole la pose d'un poisson entre le pas précédent (`alpha = 0`) et le pas courant
 * (`alpha = 1`), par le plus court chemin pour les angles. Écrit dans `out` (aucune
 * allocation) et le renvoie. `alpha` est borné à [0, 1].
 */
export function interpolateFishPose(fish: Fish, alpha: number, out: FishPose): FishPose {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  out.x = fish.px + (fish.x - fish.px) * a;
  out.y = fish.py + (fish.y - fish.py) * a;
  out.z = fish.pz + (fish.z - fish.pz) * a;
  out.yaw = fish.pyaw + wrapAngle(fish.yaw - fish.pyaw) * a;
  out.pitch = fish.ppitch + (fish.pitch - fish.ppitch) * a;
  let dPhase = fish.phase - fish.pphase;
  if (dPhase < 0) {
    dPhase += TWO_PI;
  }
  out.phase = fish.pphase + dPhase * a;
  return out;
}

/**
 * Couche des poissons d'une espèce : deux `InstancedMesh` (corps et queue) partageant les
 * mêmes instances. `update()` recalcule les matrices à partir de l'état du monde, sans
 * allocation.
 */
export class FishLayer {
  readonly object = new Object3D();
  private readonly body: InstancedMesh;
  private readonly tail: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private readonly geometries: BufferGeometry[];
  private readonly halfLength: number;
  private readonly pose: FishPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, phase: 0 };
  private readonly undulation: Undulation = { bodySway: 0, tailSwing: 0 };
  private readonly bodyMatrix = new Matrix4();
  private readonly tailMatrix = new Matrix4();
  private readonly hinge = new Matrix4();
  private readonly swing = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YZX');
  private readonly unitScale = new Vector3(1, 1, 1);

  constructor(
    readonly species: SpeciesDefinition = NEON,
    readonly capacity: number = MAX_FISH_PER_SPECIES,
  ) {
    this.object.name = `poissons-${species.id}`;
    // Couleurs plates (sans éclairage) : un poisson ne fait que 2 à 4 pixels de scène de
    // haut, et toute nuance d'éclairage ferait basculer le bleu néon vers une teinte d'eau à
    // la quantification. Dessinés après l'eau et le verre (file des transparents, opacité
    // pleine) pour que leurs teintes ne les recouvrent pas (docs/PIEGES.md).
    this.material = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1 });
    const bodyGeometry = createFishGeometry(species, 'body');
    const tailGeometry = createFishGeometry(species, 'tail');
    this.geometries = [bodyGeometry, tailGeometry];
    this.body = new InstancedMesh(bodyGeometry, this.material, capacity);
    this.tail = new InstancedMesh(tailGeometry, this.material, capacity);
    this.body.name = `${this.object.name}-corps`;
    this.tail.name = `${this.object.name}-queue`;
    for (const mesh of [this.body, this.tail]) {
      mesh.count = 0;
      // Les sphères englobantes d'instances ne sont pas recalculées à chaque image.
      mesh.frustumCulled = false;
      mesh.renderOrder = FISH_RENDER_ORDER;
      this.object.add(mesh);
    }
    this.halfLength = modelBodyLength(species) / 2;
    this.hinge.makeTranslation(-this.halfLength, 0, 0);
  }

  /** Nombre d'instances affichées. */
  get count(): number {
    return this.body.count;
  }

  /** Place une instance par poisson de l'espèce, interpolée avec `alpha` ∈ [0, 1]. */
  update(entities: readonly Fish[], alpha: number): void {
    let n = 0;
    for (let i = 0; i < entities.length && n < this.capacity; i++) {
      const fish = entities[i];
      if (fish.species !== this.species.id) {
        continue;
      }
      const pose = interpolateFishPose(fish, alpha, this.pose);
      // Amplitude selon la vitesse du pas courant (non interpolée : elle varie lentement).
      const { bodySway: sway, tailSwing: swing } = undulationAt(
        pose.phase,
        undulationScale(this.species, fish.speed),
        this.undulation,
      );

      // Modèle orienté vers +X : inclinaison autour de Z, puis cap autour de Y
      // (cap mesuré de +X vers +Z, d'où le signe moins ; voir sim/swimmer.ts).
      this.euler.set(0, -pose.yaw + sway, pose.pitch);
      this.rotation.setFromEuler(this.euler);
      this.position.set(pose.x, pose.y, pose.z);
      this.bodyMatrix.compose(this.position, this.rotation, this.unitScale);
      this.body.setMatrixAt(n, this.bodyMatrix);

      this.swing.makeRotationY(swing);
      this.tailMatrix.multiplyMatrices(this.bodyMatrix, this.hinge).multiply(this.swing);
      this.tail.setMatrixAt(n, this.tailMatrix);
      n++;
    }
    this.body.count = n;
    this.tail.count = n;
    this.body.instanceMatrix.needsUpdate = true;
    this.tail.instanceMatrix.needsUpdate = true;
  }

  /** Lit la matrice d'une instance du corps (tests). */
  bodyMatrixAt(index: number, out: Matrix4): Matrix4 {
    this.body.getMatrixAt(index, out);
    return out;
  }

  /** Lit la matrice d'une instance de la queue (tests). */
  tailMatrixAt(index: number, out: Matrix4): Matrix4 {
    this.tail.getMatrixAt(index, out);
    return out;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.body.dispose();
    this.tail.dispose();
    this.geometries.forEach((g) => g.dispose());
    this.material.dispose();
  }
}
