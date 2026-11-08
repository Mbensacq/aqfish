import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { Fish } from '../sim/swimmer';
import { interpolateFishPose, type FishPose } from './fish-layer';
import type { SceneLayer } from './effect-layer';
import { PALETTE } from './palette';

/** Couleur du repère : jaune franc, loin de l'eau et des plantes (docs/DA.md, palette). */
export const ALERT_MARKER_COLOR = PALETTE.poissonJaune;
/** Contour sombre du repère (docs/DA.md, règle des contours). */
export const ALERT_MARKER_OUTLINE = PALETTE.fondScene;
/** Côté d'un voxel du repère (mètres). */
export const ALERT_MARKER_VOXEL = 0.009;
/** Hauteur de la pointe du repère au-dessus du centre de l'animal (mètres). */
export const ALERT_MARKER_LIFT = 0.05;
/** Repères au plus : au-delà, les premiers de la liste seulement. */
export const MAX_ALERT_MARKERS = 512;
/** Dessinés après tout le reste : un repère n'est jamais caché par une plante. */
export const ALERT_MARKER_RENDER_ORDER = 20;

/** Flèche de voxels pointée vers le bas, pointe à l'origine ; `grow` épaissit chaque voxel. */
function arrowGeometry(grow: number): BufferGeometry {
  const v = ALERT_MARKER_VOXEL;
  const voxels: readonly (readonly [number, number])[] = [
    [0, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
    [0, 2],
    [0, 3],
  ];
  const parts = voxels.map(([x, y]) =>
    new BoxGeometry(v + grow, v + grow, v + grow).translate(x * v, y * v + v / 2, 0),
  );
  const merged = mergeGeometries(parts);
  for (const part of parts) {
    part.dispose();
  }
  return merged;
}

/**
 * Repère voxel au-dessus des animaux désignés par une alerte (issue #483, ADR 0115) : flèche
 * jaune à contour sombre, qui suit l'animal, sans aucun mouvement propre (« Réduire les
 * mouvements » n'a rien à retirer). Couche à part : le maillage des poissons n'est pas touché.
 * Masquée sans désignation, donc sans effet sur les captures.
 */
export class AlertHighlightLayer implements SceneLayer {
  readonly object: Object3D;
  private readonly fill: InstancedMesh;
  private readonly outline: InstancedMesh;
  private readonly fillGeometry = arrowGeometry(0);
  private readonly outlineGeometry = arrowGeometry(ALERT_MARKER_VOXEL / 2);
  private readonly fillMaterial = new MeshBasicMaterial({
    color: new Color(ALERT_MARKER_COLOR),
    depthTest: false,
    transparent: true,
  });
  private readonly outlineMaterial = new MeshBasicMaterial({
    color: new Color(ALERT_MARKER_OUTLINE),
    depthTest: false,
    transparent: true,
  });
  private readonly matrix = new Matrix4();
  private readonly pose: FishPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, phase: 0 };
  private ids: ReadonlySet<number> = new Set();

  constructor() {
    this.outline = this.mesh(this.outlineGeometry, this.outlineMaterial, 0);
    this.fill = this.mesh(this.fillGeometry, this.fillMaterial, 1);
    this.outline.add(this.fill);
    this.object = this.outline;
    this.object.name = 'reperes-alerte';
    this.object.visible = false;
  }

  private mesh(geometry: BufferGeometry, material: MeshBasicMaterial, order: number) {
    const mesh = new InstancedMesh(geometry, material, MAX_ALERT_MARKERS);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = ALERT_MARKER_RENDER_ORDER + order;
    return mesh;
  }

  /** Animaux désignés ; vide : couche masquée. */
  setAnimals(ids: readonly number[]): void {
    this.ids = new Set(ids);
    this.object.visible = this.ids.size > 0;
  }

  /** Pose un repère au-dessus de chaque animal désigné encore présent. */
  update(entities: readonly Fish[], alpha: number): void {
    if (this.ids.size === 0) {
      return;
    }
    let count = 0;
    for (const entity of entities) {
      if (count >= MAX_ALERT_MARKERS) {
        break;
      }
      if (this.ids.has(entity.id)) {
        const pose = interpolateFishPose(entity, alpha, this.pose);
        this.matrix.makeTranslation(pose.x, pose.y + ALERT_MARKER_LIFT, pose.z);
        this.fill.setMatrixAt(count, this.matrix);
        this.outline.setMatrixAt(count, this.matrix);
        count += 1;
      }
    }
    this.fill.count = count;
    this.outline.count = count;
    this.fill.instanceMatrix.needsUpdate = true;
    this.outline.instanceMatrix.needsUpdate = true;
  }

  /** Repères posés (tests). */
  get count(): number {
    return this.object.visible ? this.fill.count : 0;
  }

  dispose(): void {
    this.fill.dispose();
    this.outline.dispose();
    this.fillGeometry.dispose();
    this.outlineGeometry.dispose();
    this.fillMaterial.dispose();
    this.outlineMaterial.dispose();
  }
}
