import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three';

import { DEFAULT_FOOD_STYLE, type FoodStyle } from '../core/food-style/food-style';
import { MAX_FOOD, type FoodPellet } from '../sim/food';
import { BUBBLE_RENDER_ORDER } from './bubble-layer';
import { foodCoreSize, foodOutlineExtra, foodVoxelOutlineSide, foodVoxelSide } from './food-size';
import { PALETTE } from './palette';

/**
 * Couleur du cœur des granulés (docs/DA.md, palette ; issue #83) : jaune, absent du bac
 * tropical de jour, donc impossible à confondre avec les détails orangés des plantes et des
 * guppys. La nuit, assombri, il tombe sur `koiOr` (et non sur `tritonOrange` comme l'ancien
 * orangé, confondu alors avec les queues des guppys).
 */
export const FOOD_COLOR = PALETTE.poissonJaune;
/** Liseré des granulés : contour sombre d'un pixel, comme les animaux et le décor (DA, règle 4). */
export const FOOD_OUTLINE_COLOR = PALETTE.koiNoir;
/**
 * Ordre de rendu du cœur : juste après le liseré (`BUBBLE_RENDER_ORDER`), pour que tous les
 * liserés soient posés avant les cœurs. Le test de profondeur garde l'ordre entre granulés.
 */
export const FOOD_CORE_RENDER_ORDER = BUBBLE_RENDER_ORDER + 0.01;

/**
 * Rapprochement des granulés vers la caméra pour le seul test de profondeur, en mètres
 * (issue #83). Un point est un carré à l'écran mais n'a qu'une profondeur, celle de son
 * centre : posé sur le sable ou un rocher vus en biais, la surface passe devant la moitié
 * basse du carré et le cache (granulé réduit à un trait sombre). Avancer le point le long
 * du rayon de vue ne change ni sa position ni sa taille à l'écran, seulement sa profondeur.
 * 2,5 cm couvrent la pente du sable sous un carré de 4 pixels de scène (~6 mm par pixel
 * en vue trois-quarts) ; un objet à moins de 2,5 cm devant un granulé ne le cache plus.
 */
export const FOOD_DEPTH_BIAS = 0.025;

const PROJECT_VERTEX = '#include <project_vertex>';

/**
 * Ajoute au shader de sommets des points le rapprochement `bias` (mètres, vue caméra) le
 * long du rayon de vue, après la projection d'origine. Lève une erreur si le shader n'a pas
 * le point d'insertion attendu (version de three.js incompatible), plutôt que d'ignorer
 * silencieusement le correctif.
 */
export function withDepthBias(vertexShader: string, bias: number): string {
  if (!vertexShader.includes(PROJECT_VERTEX)) {
    throw new Error(`Shader de points sans ${PROJECT_VERTEX}`);
  }
  return vertexShader.replace(
    PROJECT_VERTEX,
    `${PROJECT_VERTEX}
	mvPosition.xyz += normalize( - mvPosition.xyz ) * ${bias.toFixed(4)};
	gl_Position = projectionMatrix * mvPosition;`,
  );
}

function withFoodDepthBias<T extends PointsMaterial | MeshBasicMaterial>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = withDepthBias(shader.vertexShader, FOOD_DEPTH_BIAS);
  };
  return material;
}

function flatPointsMaterial(color: string, size: number): PointsMaterial {
  return withFoodDepthBias(
    new PointsMaterial({
      color,
      size,
      sizeAttenuation: false,
      // Même file que les bulles (opacité pleine) : couleur exacte de la palette.
      transparent: true,
      opacity: 1,
    }),
  );
}

function voxelMesh(
  geometry: BufferGeometry,
  material: MeshBasicMaterial,
  name: string,
  renderOrder: number,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, MAX_FOOD);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.name = name;
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Couche de la nourriture (issues #67, #83, #117), en deux rendus au choix (`setStyle`) :
 *
 * - **points** (par défaut) : deux nuages de points qui partagent la même géométrie, le
 *   liseré (`FOOD_OUTLINE_COLOR`) dessiné d'abord, puis le cœur (`FOOD_COLOR`) centré dessus ;
 * - **voxels** : un petit cube par granulé, en `FOOD_COLOR` sur toutes ses faces (une face
 *   plus sombre retombe la nuit sur l'orangé des guppys : #83), cerné d'une coque sombre
 *   (cube plus grand dont seules les faces arrière sont dessinées).
 *
 * La taille suit le zoom (`setPixelsPerMeter`, `render/food-size.ts`) avec un plancher d'un
 * pixel de scène ; le liseré est réduit sous un seuil. Les deux rendus sont rapprochés de la
 * caméra pour le seul test de profondeur (`FOOD_DEPTH_BIAS`) et assombris la nuit comme les
 * poissons et les bulles (`setBrightness`, ADR 0019). Capacité `MAX_FOOD`, allouée à la
 * construction. Sans granulé, rien n'est dessiné : l'image est celle d'avant la nourriture.
 */
export class FoodLayer {
  readonly geometry = new BufferGeometry();
  private readonly position = new BufferAttribute(new Float32Array(MAX_FOOD * 3), 3);
  private readonly coreMaterial = flatPointsMaterial(FOOD_COLOR, 1);
  private readonly outlineMaterial = flatPointsMaterial(FOOD_OUTLINE_COLOR, 1);
  readonly core = new Points(this.geometry, this.coreMaterial);
  readonly outline = new Points(this.geometry, this.outlineMaterial);
  private readonly voxelGeometry = new BoxGeometry(1, 1, 1);
  private readonly voxelMaterial = withFoodDepthBias(
    new MeshBasicMaterial({ color: FOOD_COLOR, transparent: true, opacity: 1 }),
  );
  private readonly voxelOutlineMaterial = withFoodDepthBias(
    new MeshBasicMaterial({
      color: FOOD_OUTLINE_COLOR,
      side: BackSide,
      transparent: true,
      opacity: 1,
    }),
  );
  readonly voxels = voxelMesh(
    this.voxelGeometry,
    this.voxelMaterial,
    'nourriture-voxels',
    FOOD_CORE_RENDER_ORDER,
  );
  readonly voxelOutline = voxelMesh(
    this.voxelGeometry,
    this.voxelOutlineMaterial,
    'nourriture-voxels-liseré',
    BUBBLE_RENDER_ORDER,
  );
  /** Objet à ajouter à la scène : les deux rendus, un seul visible. */
  readonly object = new Group();
  private readonly baseColor = new Color(FOOD_COLOR);
  private readonly baseOutlineColor = new Color(FOOD_OUTLINE_COLOR);
  private readonly matrix = new Matrix4();
  private readonly translation = new Vector3();
  private readonly scale = new Vector3();
  private readonly identity = new Quaternion();
  private brightnessFactor = 1;
  private pointScale = 1;
  private pixelsPerMeter = 0;
  private currentStyle: FoodStyle = DEFAULT_FOOD_STYLE;
  /** Vrai si les matrices des voxels ne correspondent plus aux granulés ou à la taille. */
  private voxelsDirty = false;
  private drawn = 0;

  constructor() {
    this.position.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setDrawRange(0, 0);
    this.object.name = 'nourriture';
    this.outline.name = 'nourriture-liseré';
    this.core.name = 'nourriture-cœur';
    this.outline.renderOrder = BUBBLE_RENDER_ORDER;
    this.core.renderOrder = FOOD_CORE_RENDER_ORDER;
    this.outline.frustumCulled = false;
    this.core.frustumCulled = false;
    this.object.add(this.outline, this.core, this.voxelOutline, this.voxels);
    this.applySizes();
    this.applyStyle();
  }

  /** Pose les granulés du monde (au plus `MAX_FOOD`), sans allocation. */
  update(food: readonly FoodPellet[]): void {
    const array = this.position.array as Float32Array;
    const count = Math.min(food.length, MAX_FOOD);
    for (let i = 0; i < count; i++) {
      const pellet = food[i];
      array[3 * i] = pellet.x;
      array[3 * i + 1] = pellet.y;
      array[3 * i + 2] = pellet.z;
    }
    if (count > 0 || this.drawn > 0) {
      this.position.needsUpdate = true;
      this.voxelsDirty = true;
    }
    this.drawn = count;
    this.geometry.setDrawRange(0, count);
    this.refreshVoxels();
  }

  /** Nombre de granulés affichés par le dernier `update` (tests). */
  get count(): number {
    return this.drawn;
  }

  /** Rendu courant des granulés. */
  get style(): FoodStyle {
    return this.currentStyle;
  }

  /** Choisit le rendu des granulés (points ou voxels) ; l'autre est masqué. */
  setStyle(style: FoodStyle): void {
    if (style !== this.currentStyle) {
      this.currentStyle = style;
      this.applyStyle();
    }
  }

  /** Taille d'un pixel de scène en pixels de la surface de rendu (comme les bulles). */
  setPointScale(scale: number): void {
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
    if (s !== this.pointScale) {
      this.pointScale = s;
      this.applySizes();
    }
  }

  /**
   * Échelle de la vue : pixels de scène par mètre à la distance de la cible de la caméra
   * (`scenePixelsPerMeter`). Fixe la taille des granulés ; 0 ou une valeur invalide : taille
   * plancher.
   */
  setPixelsPerMeter(pixelsPerMeter: number): void {
    const ppm = Number.isFinite(pixelsPerMeter) && pixelsPerMeter > 0 ? pixelsPerMeter : 0;
    if (ppm !== this.pixelsPerMeter) {
      this.pixelsPerMeter = ppm;
      this.applySizes();
      this.voxelsDirty = true;
      this.refreshVoxels();
    }
  }

  /** Taille courante du cœur, en pixels de la surface de rendu (tests). */
  get pointSize(): number {
    return this.coreMaterial.size;
  }

  /** Taille courante du liseré, en pixels de la surface de rendu (tests). */
  get outlineSize(): number {
    return this.outlineMaterial.size;
  }

  /** Côté courant d'un granulé en voxel et de sa coque, en mètres (tests). */
  get voxelSides(): readonly [number, number] {
    return [foodVoxelSide(this.pixelsPerMeter), foodVoxelOutlineSide(this.pixelsPerMeter)];
  }

  /**
   * Luminosité des couleurs plates (`render/night-shade.ts`). 1 : couleurs d'origine,
   * exactement. Une valeur non finie ou négative est ignorée.
   */
  setBrightness(factor: number): void {
    if (!Number.isFinite(factor) || factor < 0 || factor === this.brightnessFactor) {
      return;
    }
    this.brightnessFactor = factor;
    this.coreMaterial.color.copy(this.baseColor).multiplyScalar(factor);
    this.outlineMaterial.color.copy(this.baseOutlineColor).multiplyScalar(factor);
    this.voxelMaterial.color.copy(this.baseColor).multiplyScalar(factor);
    this.voxelOutlineMaterial.color.copy(this.baseOutlineColor).multiplyScalar(factor);
  }

  /** Luminosité appliquée (tests). */
  get brightness(): number {
    return this.brightnessFactor;
  }

  /** Couleur courante du cœur, en hexadécimal (tests). */
  get colorHex(): number {
    return this.coreMaterial.color.getHex();
  }

  /** Couleur courante du liseré, en hexadécimal (tests). */
  get outlineColorHex(): number {
    return this.outlineMaterial.color.getHex();
  }

  /** Couleurs courantes d'un voxel et de sa coque, en hexadécimal (tests). */
  get voxelColors(): { readonly hex: number; readonly outlineHex: number } {
    return {
      hex: this.voxelMaterial.color.getHex(),
      outlineHex: this.voxelOutlineMaterial.color.getHex(),
    };
  }

  dispose(): void {
    this.geometry.dispose();
    this.coreMaterial.dispose();
    this.outlineMaterial.dispose();
    this.voxelGeometry.dispose();
    this.voxelMaterial.dispose();
    this.voxelOutlineMaterial.dispose();
    this.voxels.dispose();
    this.voxelOutline.dispose();
  }

  private applyStyle(): void {
    const points = this.currentStyle === 'points';
    this.core.visible = points;
    this.outline.visible = points;
    this.voxels.visible = !points;
    this.voxelOutline.visible = !points;
    this.refreshVoxels();
  }

  private applySizes(): void {
    const core = foodCoreSize(this.pixelsPerMeter);
    this.coreMaterial.size = core * this.pointScale;
    this.outlineMaterial.size = (core + foodOutlineExtra(core)) * this.pointScale;
  }

  /**
   * Matrices des voxels : un cube par granulé, posé sur son point (centre relevé d'un
   * demi-côté), coque centrée sur le cube. Recalculées seulement si les granulés ou la taille
   * ont changé, et seulement quand les voxels sont affichés.
   */
  private refreshVoxels(): void {
    if (this.currentStyle !== 'voxels') {
      return;
    }
    const count = this.drawn;
    if (this.voxelsDirty) {
      const [side, outlineSide] = this.voxelSides;
      const array = this.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        this.translation.set(array[3 * i], array[3 * i + 1] + side / 2, array[3 * i + 2]);
        this.matrix.compose(this.translation, this.identity, this.scale.setScalar(side));
        this.voxels.setMatrixAt(i, this.matrix);
        this.matrix.compose(this.translation, this.identity, this.scale.setScalar(outlineSide));
        this.voxelOutline.setMatrixAt(i, this.matrix);
      }
      this.voxels.instanceMatrix.needsUpdate = true;
      this.voxelOutline.instanceMatrix.needsUpdate = true;
      this.voxelsDirty = false;
    }
    this.voxels.count = count;
    this.voxelOutline.count = count;
  }
}
