import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Points,
  PointsMaterial,
} from 'three';

import { MAX_FOOD, type FoodPellet } from '../sim/food';
import { BUBBLE_RENDER_ORDER } from './bubble-layer';
import { PALETTE } from './palette';

/** Couleur des granulés (docs/DA.md, palette) : orangé brun, lisible sur le sable et l'eau. */
export const FOOD_COLOR = PALETTE.tritonOrange;
/** Côté d'un granulé, en pixels de scène. */
export const FOOD_POINT_SIZE = 2;

/**
 * Couche de la nourriture (issue #67) : un nuage de points de taille fixe à l'écran
 * (`FOOD_POINT_SIZE` pixels de scène), d'une couleur plate de la palette, assombrie la nuit
 * comme les poissons et les bulles (`setBrightness`, ADR 0019). Capacité `MAX_FOOD`,
 * allouée à la construction : `update` réécrit les positions en place. Sans granulé, rien
 * n'est dessiné (plage de dessin vide) : l'image est celle d'avant la nourriture.
 */
export class FoodLayer {
  readonly geometry = new BufferGeometry();
  private readonly position = new BufferAttribute(new Float32Array(MAX_FOOD * 3), 3);
  private readonly material = new PointsMaterial({
    color: FOOD_COLOR,
    size: FOOD_POINT_SIZE,
    sizeAttenuation: false,
    // Même file que les bulles (opacité pleine) : couleur exacte de la palette.
    transparent: true,
    opacity: 1,
  });
  readonly object = new Points(this.geometry, this.material);
  private readonly baseColor = new Color(FOOD_COLOR);
  private brightnessFactor = 1;
  private pointScale = 1;
  private drawn = 0;

  constructor() {
    this.position.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setDrawRange(0, 0);
    this.object.name = 'nourriture';
    this.object.renderOrder = BUBBLE_RENDER_ORDER;
    this.object.frustumCulled = false;
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
      this.material.size = FOOD_POINT_SIZE * s;
    }
  }

  /** Taille courante des points, en pixels de la surface de rendu (tests). */
  get pointSize(): number {
    return this.material.size;
  }

  /**
   * Luminosité des couleurs plates (`render/night-shade.ts`). 1 : couleur d'origine,
   * exactement. Une valeur non finie ou négative est ignorée.
   */
  setBrightness(factor: number): void {
    if (!Number.isFinite(factor) || factor < 0 || factor === this.brightnessFactor) {
      return;
    }
    this.brightnessFactor = factor;
    this.material.color.copy(this.baseColor).multiplyScalar(factor);
  }

  /** Luminosité appliquée (tests). */
  get brightness(): number {
    return this.brightnessFactor;
  }

  /** Couleur courante du matériau, en hexadécimal (tests). */
  get colorHex(): number {
    return this.material.color.getHex();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
