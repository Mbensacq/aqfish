import {
  AddEquation,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  type Material,
  MeshBasicMaterial,
  OneFactor,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
  ZeroFactor,
} from 'three';

import { DEFAULT_FOOD_STYLE, type FoodStyle } from '../core/food-style/food-style';
import {
  FOOD_SHADE_COUNT,
  FOOD_SHAPES,
  MAX_FOOD,
  foodLook,
  type FoodPellet,
  type FoodShape,
} from '../sim/food';
import { BUBBLE_RENDER_ORDER } from './bubble-layer';
import { foodCoreSize, foodOutlineExtra, foodVoxelDimensions, foodVoxelSide } from './food-size';
import { FOOD_TONES, PALETTE } from './palette';

/**
 * Teintes des granulés (issue #226, ADR 0022 et 0056), une par nuance (`FoodLook.shade`,
 * tirée de l'identifiant) : ocre, beige et brun-rouge, des tons de nourriture réelle, mats,
 * plutôt que le jaune saturé d'avant. Ocre et brun-rouge sont des tons de la nourriture
 * (`FOOD_TONES`), proposés par la passe aux seuls pixels de granulé.
 * C'est la couleur de la face du dessus d'un voxel (et du cœur d'un point) ; les autres faces
 * en sont des fractions (`FOOD_FACE_SHADING`), que la passe palette ramène aux tons plus
 * sombres de la même famille.
 */
export const FOOD_SHADE_COLORS: readonly string[] = [
  FOOD_TONES.granuleOcre,
  PALETTE.sableSombre,
  FOOD_TONES.granuleBrunRouge,
];
/** Couleur de référence des granulés (première nuance) : bouton, légendes, tests. */
export const FOOD_COLOR = FOOD_SHADE_COLORS[0];
/** Liseré des granulés en points : contour sombre d'un pixel (DA, règle 4). */
export const FOOD_OUTLINE_COLOR = PALETTE.koiNoir;
/**
 * Ombrage par face des voxels (issue #226), facteur de la teinte en espace linéaire, dans
 * l'ordre des faces de `BoxGeometry` : +x, -x, +y (dessus), -y (dessous), +z, -z. Le dessus
 * garde la teinte ; les flancs x et z diffèrent pour que deux flancs voisins se distinguent
 * et que le cube se lise comme un volume, sans liseré.
 */
export const FOOD_FACE_SHADING: readonly number[] = [0.5, 0.5, 1, 0.35, 0.72, 0.72];
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

/**
 * Opacité écrite par les granulés dans la cible de scène (ADR 0056) : un marqueur, pas une
 * transparence. Le mélange des granulés remplace la couleur et l'opacité de la destination
 * (`withFoodMarker`) ; la passe palette ne propose les tons de la nourriture (`FOOD_TONES`)
 * qu'aux pixels d'opacité inférieure à 1.
 */
export const FOOD_ALPHA_MARKER = 0.5;

/**
 * Mélange des granulés : couleur et opacité de la source écrites telles quelles (ni la
 * couleur ni l'image ne dépendent de l'opacité), pour poser le marqueur `FOOD_ALPHA_MARKER`.
 */
export function withFoodMarker<T extends Material>(material: T): T {
  material.transparent = true;
  material.opacity = FOOD_ALPHA_MARKER;
  material.blending = CustomBlending;
  material.blendEquation = AddEquation;
  material.blendSrc = OneFactor;
  material.blendDst = ZeroFactor;
  material.blendEquationAlpha = AddEquation;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = ZeroFactor;
  return material;
}

function withFoodDepthBias<T extends PointsMaterial | MeshBasicMaterial>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = withDepthBias(shader.vertexShader, FOOD_DEPTH_BIAS);
  };
  return material;
}

function flatPointsMaterial(color: string, size: number): PointsMaterial {
  // Même file que les bulles (transparents) : couleur exacte, marqueur d'opacité.
  return withFoodDepthBias(
    withFoodMarker(new PointsMaterial({ color, size, sizeAttenuation: false })),
  );
}

/** Cube unité dont chaque face porte son ombrage (`FOOD_FACE_SHADING`) en couleur de sommet. */
export function shadedVoxelGeometry(): BoxGeometry {
  const geometry = new BoxGeometry(1, 1, 1);
  const vertices = geometry.getAttribute('position').count;
  const colors = new Float32Array(vertices * 3);
  // BoxGeometry : 6 faces de 4 sommets, dans l'ordre +x, -x, +y, -y, +z, -z.
  for (let v = 0; v < vertices; v++) {
    const shade = FOOD_FACE_SHADING[Math.floor(v / 4)] ?? 1;
    colors.set([shade, shade, shade], 3 * v);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function voxelMesh(
  geometry: BufferGeometry,
  material: MeshBasicMaterial,
  shape: FoodShape,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, MAX_FOOD);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Couleur par instance (nuance du granulé), allouée d'emblée : le programme du shader ne
  // change pas au premier granulé.
  mesh.setColorAt(0, new Color(FOOD_COLOR));
  mesh.instanceColor?.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.name = `nourriture-${shape}`;
  mesh.renderOrder = FOOD_CORE_RENDER_ORDER;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Couche de la nourriture (issues #67, #83, #117, #226), en deux rendus au choix
 * (`setStyle`) :
 *
 * - **voxels** (par défaut, #226) : un petit volume par granulé, de la forme, de la taille,
 *   de l'orientation et de la nuance tirées de son identifiant (`foodLook`) ; un maillage
 *   instancié par forme, un cube unité ombré par face (`FOOD_FACE_SHADING`), sans liseré ;
 * - **points** : deux nuages de points qui partagent la même géométrie, le liseré
 *   (`FOOD_OUTLINE_COLOR`) dessiné d'abord, puis le cœur, de la nuance du granulé.
 *
 * La taille suit le zoom (`setPixelsPerMeter`, `render/food-size.ts`) avec un plancher d'un
 * pixel de scène. Les deux rendus sont rapprochés de la caméra pour le seul test de
 * profondeur (`FOOD_DEPTH_BIAS`) et assombris la nuit comme les poissons et les bulles
 * (`setBrightness`, ADR 0019). Capacité `MAX_FOOD`, allouée à la construction. Sans
 * granulé, rien n'est dessiné : l'image est celle d'avant la nourriture.
 */
export class FoodLayer {
  readonly geometry = new BufferGeometry();
  private readonly position = new BufferAttribute(new Float32Array(MAX_FOOD * 3), 3);
  private readonly pointColor = new BufferAttribute(new Float32Array(MAX_FOOD * 3), 3);
  private readonly coreMaterial = flatPointsMaterial('#ffffff', 1);
  private readonly outlineMaterial = flatPointsMaterial(FOOD_OUTLINE_COLOR, 1);
  readonly core = new Points(this.geometry, this.coreMaterial);
  readonly outline = new Points(this.geometry, this.outlineMaterial);
  private readonly voxelGeometry = shadedVoxelGeometry();
  private readonly voxelMaterial = withFoodDepthBias(
    withFoodMarker(new MeshBasicMaterial({ color: '#ffffff', vertexColors: true })),
  );
  /** Un maillage instancié par forme, dans l'ordre de `FOOD_SHAPES`. */
  readonly voxels: readonly InstancedMesh[] = FOOD_SHAPES.map((shape) =>
    voxelMesh(this.voxelGeometry, this.voxelMaterial, shape),
  );
  /** Objet à ajouter à la scène : les deux rendus, un seul visible. */
  readonly object = new Group();
  private readonly shadeColors = FOOD_SHADE_COLORS.map((hex) => new Color(hex));
  private readonly baseOutlineColor = new Color(FOOD_OUTLINE_COLOR);
  private readonly white = new Color('#ffffff');
  private readonly matrix = new Matrix4();
  private readonly translation = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly instanceCounts = new Array<number>(FOOD_SHAPES.length).fill(0);
  /** Aspect de chaque granulé affiché (`foodLook`), recalculé seulement quand l'identifiant change. */
  private readonly ids = new Float64Array(MAX_FOOD);
  private readonly shapes = new Uint8Array(MAX_FOOD);
  private readonly shades = new Uint8Array(MAX_FOOD);
  private readonly sizes = new Float32Array(MAX_FOOD);
  private readonly turns = new Float32Array(MAX_FOOD);
  private brightnessFactor = 1;
  private pointScale = 1;
  private pixelsPerMeter = 0;
  private currentStyle: FoodStyle = DEFAULT_FOOD_STYLE;
  /** Vrai si les matrices des voxels ne correspondent plus aux granulés ou à la taille. */
  private voxelsDirty = false;
  private drawn = 0;

  constructor() {
    this.position.setUsage(DynamicDrawUsage);
    this.pointColor.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('color', this.pointColor);
    this.geometry.setDrawRange(0, 0);
    this.coreMaterial.vertexColors = true;
    this.object.name = 'nourriture';
    this.outline.name = 'nourriture-liseré';
    this.core.name = 'nourriture-cœur';
    this.outline.renderOrder = BUBBLE_RENDER_ORDER;
    this.core.renderOrder = FOOD_CORE_RENDER_ORDER;
    this.outline.frustumCulled = false;
    this.core.frustumCulled = false;
    this.object.add(this.outline, this.core, ...this.voxels);
    this.applySizes();
    this.applyStyle();
  }

  /** Pose les granulés du monde (au plus `MAX_FOOD`), sans allocation. */
  update(food: readonly FoodPellet[]): void {
    const array = this.position.array as Float32Array;
    const colors = this.pointColor.array as Float32Array;
    const count = Math.min(food.length, MAX_FOOD);
    for (let i = 0; i < count; i++) {
      const pellet = food[i];
      array[3 * i] = pellet.x;
      array[3 * i + 1] = pellet.y;
      array[3 * i + 2] = pellet.z;
      if (this.ids[i] !== pellet.id || i >= this.drawn) {
        const look = foodLook(pellet.id);
        this.ids[i] = pellet.id;
        this.shapes[i] = FOOD_SHAPES.indexOf(look.shape);
        this.shades[i] = look.shade % FOOD_SHADE_COUNT;
        this.sizes[i] = look.size;
        this.turns[i] = look.turn;
        const tint = this.shadeColors[this.shades[i]];
        colors[3 * i] = tint.r;
        colors[3 * i + 1] = tint.g;
        colors[3 * i + 2] = tint.b;
        this.pointColor.needsUpdate = true;
      }
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

  /** Nombre de voxels dessinés par forme, dans l'ordre de `FOOD_SHAPES` (tests). */
  get voxelCounts(): readonly number[] {
    return this.voxels.map((mesh) => mesh.count);
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

  /** Côté courant d'un grain de taille 1, en mètres (tests). */
  get voxelSide(): number {
    return foodVoxelSide(this.pixelsPerMeter);
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
    this.coreMaterial.color.copy(this.white).multiplyScalar(factor);
    this.outlineMaterial.color.copy(this.baseOutlineColor).multiplyScalar(factor);
    this.voxelMaterial.color.copy(this.white).multiplyScalar(factor);
  }

  /** Luminosité appliquée (tests). */
  get brightness(): number {
    return this.brightnessFactor;
  }

  /** Facteur courant des matériaux teintés par granulé, en hexadécimal (tests). */
  get colorHex(): number {
    return this.coreMaterial.color.getHex();
  }

  /** Couleur courante du liseré des points, en hexadécimal (tests). */
  get outlineColorHex(): number {
    return this.outlineMaterial.color.getHex();
  }

  /** Facteur courant du matériau des voxels, en hexadécimal (tests). */
  get voxelColorHex(): number {
    return this.voxelMaterial.color.getHex();
  }

  dispose(): void {
    this.geometry.dispose();
    this.coreMaterial.dispose();
    this.outlineMaterial.dispose();
    this.voxelGeometry.dispose();
    this.voxelMaterial.dispose();
    for (const mesh of this.voxels) {
      mesh.dispose();
    }
  }

  private applyStyle(): void {
    const points = this.currentStyle === 'points';
    this.core.visible = points;
    this.outline.visible = points;
    for (const mesh of this.voxels) {
      mesh.visible = !points;
    }
    this.voxelsDirty = true;
    this.refreshVoxels();
  }

  private applySizes(): void {
    const core = foodCoreSize(this.pixelsPerMeter);
    this.coreMaterial.size = core * this.pointScale;
    this.outlineMaterial.size = (core + foodOutlineExtra(core)) * this.pointScale;
  }

  /**
   * Matrices et couleurs des voxels : chaque granulé va dans le maillage de sa forme, posé
   * sur son point (centre relevé d'une demi-épaisseur), tourné autour de la verticale et
   * teinté de sa nuance. Recalculées seulement si les granulés ou la taille ont changé, et
   * seulement quand les voxels sont affichés.
   */
  private refreshVoxels(): void {
    if (this.currentStyle !== 'voxels' || !this.voxelsDirty) {
      return;
    }
    const array = this.position.array as Float32Array;
    this.instanceCounts.fill(0);
    for (let i = 0; i < this.drawn; i++) {
      const shapeIndex = this.shapes[i];
      const mesh = this.voxels[shapeIndex];
      const slot = this.instanceCounts[shapeIndex]++;
      const [sx, sy, sz] = foodVoxelDimensions(
        FOOD_SHAPES[shapeIndex],
        this.sizes[i],
        this.pixelsPerMeter,
      );
      this.translation.set(array[3 * i], array[3 * i + 1] + sy / 2, array[3 * i + 2]);
      this.rotation.setFromAxisAngle(this.up, this.turns[i]);
      this.matrix.compose(this.translation, this.rotation, this.scale.set(sx, sy, sz));
      mesh.setMatrixAt(slot, this.matrix);
      mesh.setColorAt(slot, this.shadeColors[this.shades[i]]);
    }
    this.voxels.forEach((mesh, index) => {
      mesh.count = this.instanceCounts[index];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    });
    this.voxelsDirty = false;
  }
}
