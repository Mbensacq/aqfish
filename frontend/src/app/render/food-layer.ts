import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  Points,
  PointsMaterial,
} from 'three';

import { MAX_FOOD, type FoodPellet } from '../sim/food';
import { BUBBLE_RENDER_ORDER } from './bubble-layer';
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
/** Côté du cœur d'un granulé, en pixels de scène. */
export const FOOD_POINT_SIZE = 2;
/** Épaisseur du liseré, en pixels de scène, de chaque côté du cœur. */
export const FOOD_OUTLINE_WIDTH = 1;
/** Côté d'un granulé liseré compris, en pixels de scène. */
export const FOOD_OUTLINED_SIZE = FOOD_POINT_SIZE + 2 * FOOD_OUTLINE_WIDTH;
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

function flatPointsMaterial(color: string, size: number): PointsMaterial {
  const material = new PointsMaterial({
    color,
    size,
    sizeAttenuation: false,
    // Même file que les bulles (opacité pleine) : couleur exacte de la palette.
    transparent: true,
    opacity: 1,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = withDepthBias(shader.vertexShader, FOOD_DEPTH_BIAS);
  };
  return material;
}

/**
 * Couche de la nourriture (issues #67, #83) : deux nuages de points de taille fixe à l'écran
 * qui partagent la même géométrie. Le liseré (`FOOD_OUTLINED_SIZE` pixels de scène,
 * `FOOD_OUTLINE_COLOR`) est dessiné d'abord, puis le cœur (`FOOD_POINT_SIZE`, `FOOD_COLOR`),
 * centré dessus : chaque granulé est un carré clair cerné d'un pixel sombre. Les deux
 * couleurs sont assombries la nuit comme les poissons et les bulles (`setBrightness`,
 * ADR 0019). Capacité `MAX_FOOD`, allouée à la construction : `update` réécrit les positions
 * en place. Sans granulé, rien n'est dessiné (plage de dessin vide) : l'image est celle
 * d'avant la nourriture.
 */
export class FoodLayer {
  readonly geometry = new BufferGeometry();
  private readonly position = new BufferAttribute(new Float32Array(MAX_FOOD * 3), 3);
  private readonly coreMaterial = flatPointsMaterial(FOOD_COLOR, FOOD_POINT_SIZE);
  private readonly outlineMaterial = flatPointsMaterial(FOOD_OUTLINE_COLOR, FOOD_OUTLINED_SIZE);
  readonly core = new Points(this.geometry, this.coreMaterial);
  readonly outline = new Points(this.geometry, this.outlineMaterial);
  /** Objet à ajouter à la scène : le liseré et le cœur. */
  readonly object = new Group();
  private readonly baseColor = new Color(FOOD_COLOR);
  private readonly baseOutlineColor = new Color(FOOD_OUTLINE_COLOR);
  private brightnessFactor = 1;
  private pointScale = 1;
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
    this.object.add(this.outline, this.core);
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
    }
    this.drawn = count;
    this.geometry.setDrawRange(0, count);
  }

  /** Nombre de granulés affichés par le dernier `update` (tests). */
  get count(): number {
    return this.drawn;
  }

  /** Taille d'un pixel de scène en pixels de la surface de rendu (comme les bulles). */
  setPointScale(scale: number): void {
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
    if (s !== this.pointScale) {
      this.pointScale = s;
      this.coreMaterial.size = FOOD_POINT_SIZE * s;
      this.outlineMaterial.size = FOOD_OUTLINED_SIZE * s;
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

  dispose(): void {
    this.geometry.dispose();
    this.coreMaterial.dispose();
    this.outlineMaterial.dispose();
  }
}
