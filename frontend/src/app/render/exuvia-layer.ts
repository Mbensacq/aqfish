import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';

import { exuviaAge, MAX_EXUVIAE, type Exuvia } from '../sim/shrimp-molt';
import { SPECIES } from '../sim/species';
import type { SceneLayer } from './effect-layer';
import { PALETTE } from './palette';

/**
 * Exuvies des crevettes (issue #859, ADR 0188) : une carapace vide posée au sol, dessinée comme
 * un voxel allongé dans l'axe de la crevette au moment de la mue, de couleur plate claire et
 * entouré d'un liseré d'un pixel (DA, règle 4), comme les œufs (`render/egg-layer.ts`), dessiné
 * après l'eau. Deux
 * teintes seulement (pixel art) : fraîche, puis passée à la seconde moitié de sa vie, quand elle
 * se dissout. Un maillage instancié de `MAX_EXUVIAE` instances, alloué une fois ; sans exuvie,
 * la couche est masquée et ne pose rien : images inchangées, à l'octet près.
 */

/** Longueur d'une exuvie par rapport au modèle de la crevette (corps sans antennes). */
export const EXUVIA_LENGTH_RATIO = 0.6;
/** Largeur et hauteur d'une exuvie par rapport à sa longueur. */
export const EXUVIA_WIDTH_RATIO = 0.3;
export const EXUVIA_HEIGHT_RATIO = 0.2;
/** Épaisseur du liseré, en mètres (de chaque côté : la moitié), environ un pixel de scène. */
export const EXUVIA_OUTLINE = 0.008;
/** Couleur d'une exuvie fraîche : le crème clair de la palette, translucide à l'œil. */
export const EXUVIA_COLOR = PALETTE.koiBlanc;
/** Couleur d'une exuvie qui se dissout. */
export const EXUVIA_OLD_COLOR = PALETTE.sableClair;
/** Couleur du liseré : l'ombre du sable, plus douce que le noir des œufs (aucun bruit noir). */
export const EXUVIA_OUTLINE_COLOR = PALETTE.sableOmbre;
/**
 * Ordres de rendu : après l'eau et le verre (file des transparents, opacité pleine), comme les
 * capsules de la néritine (`EGG_AFTER_WATER_*`) : dans la file opaque, la passe palette faisait
 * virer le crème au vert d'eau pâle (essai du cycle 317). Liseré d'abord, puis le cœur.
 */
export const EXUVIA_OUTLINE_RENDER_ORDER = 2.3;
export const EXUVIA_CORE_RENDER_ORDER = 2.4;

export class ExuviaLayer implements SceneLayer {
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshBasicMaterial({ color: '#ffffff', transparent: true });
  private readonly outlineMaterial = new MeshBasicMaterial({
    color: EXUVIA_OUTLINE_COLOR,
    depthWrite: false,
    transparent: true,
  });
  readonly mesh = new InstancedMesh(this.geometry, this.material, MAX_EXUVIAE);
  readonly outline = new InstancedMesh(this.geometry, this.outlineMaterial, MAX_EXUVIAE);
  readonly object = new Group();
  private readonly baseOutline = new Color(EXUVIA_OUTLINE_COLOR);
  private readonly fresh = new Color(EXUVIA_COLOR);
  private readonly old = new Color(EXUVIA_OLD_COLOR);
  private readonly white = new Color('#ffffff');
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly euler = new Euler();
  private readonly scale = new Vector3();
  private brightnessFactor = 1;

  constructor() {
    this.object.name = 'exuvies';
    this.mesh.name = 'exuvies-cœur';
    this.outline.name = 'exuvies-liseré';
    this.mesh.setColorAt(0, this.fresh);
    this.mesh.instanceColor?.setUsage(DynamicDrawUsage);
    for (const mesh of [this.mesh, this.outline]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
    }
    this.outline.renderOrder = EXUVIA_OUTLINE_RENDER_ORDER;
    this.mesh.renderOrder = EXUVIA_CORE_RENDER_ORDER;
    this.object.add(this.outline, this.mesh);
    this.object.visible = false;
  }

  /** Pose les exuvies du monde au temps `time` (au plus `MAX_EXUVIAE`), sans allocation. */
  update(exuviae: readonly Exuvia[] | undefined, time: number): void {
    const count = Math.min(exuviae?.length ?? 0, MAX_EXUVIAE);
    if (count === 0 && this.mesh.count === 0) {
      return;
    }
    for (let i = 0; i < count; i++) {
      this.place(i, exuviae![i], time);
    }
    this.mesh.count = count;
    this.outline.count = count;
    this.object.visible = count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.outline.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  private place(i: number, shell: Exuvia, time: number): void {
    const length = SPECIES[shell.species].bodyLength * shell.size * EXUVIA_LENGTH_RATIO;
    const width = length * EXUVIA_WIDTH_RATIO;
    const height = length * EXUVIA_HEIGHT_RATIO;
    // Cap de la simulation mesuré de +X vers +Z : rotation de −yaw autour de Y (comme les poissons).
    this.euler.set(0, -shell.yaw, 0);
    this.rotation.setFromEuler(this.euler);
    this.position.set(shell.x, shell.y, shell.z);
    this.scale.set(length, height, width);
    this.matrix.compose(this.position, this.rotation, this.scale);
    this.mesh.setMatrixAt(i, this.matrix);
    this.scale.set(length + EXUVIA_OUTLINE, height + EXUVIA_OUTLINE, width + EXUVIA_OUTLINE);
    this.matrix.compose(this.position, this.rotation, this.scale);
    this.outline.setMatrixAt(i, this.matrix);
    this.mesh.setColorAt(i, exuviaAge(shell, time) * 2 >= 1 ? this.old : this.fresh);
  }

  /** Nombre d'exuvies affichées (tests). */
  get count(): number {
    return this.mesh.count;
  }

  /** Luminosité des couleurs plates (`render/night-shade.ts`) ; 1 : couleurs d'origine. */
  setBrightness(factor: number): void {
    if (!Number.isFinite(factor) || factor < 0 || factor === this.brightnessFactor) {
      return;
    }
    this.brightnessFactor = factor;
    this.material.color.copy(this.white).multiplyScalar(factor);
    this.outlineMaterial.color.copy(this.baseOutline).multiplyScalar(factor);
  }

  /** Luminosité appliquée (tests). */
  get brightness(): number {
    return this.brightnessFactor;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.outlineMaterial.dispose();
    this.mesh.dispose();
    this.outline.dispose();
  }
}
