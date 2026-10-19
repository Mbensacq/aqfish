import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
} from 'three';
import {
  createBubbleBuffer,
  DEFAULT_BUBBLE_SOURCE,
  DIFFUSER_HEIGHT,
  fillBubbles,
  MAX_BUBBLES,
  type BubbleSource,
} from '../sim/bubbles';
import { SAND_THICKNESS } from '../sim/tank';
import { DECOR_RENDER_ORDER } from './decor-layer';
import { FISH_RENDER_ORDER } from './fish-layer';
import { PALETTE } from './palette';

/** Couleur des bulles : la plus claire des eaux (docs/DA.md, palette). */
export const BUBBLE_COLOR = PALETTE.eauTresClaire;
/** Couleur du diffuseur (pierre poreuse). */
export const DIFFUSER_COLOR = PALETTE.rocheSombre;
/** Côté du diffuseur, en mètres. */
export const DIFFUSER_SIZE = 0.024;
/**
 * Ordre de rendu des bulles : après les poissons (file des transparents, opacité pleine),
 * pour garder la couleur exacte de la palette (ADR 0009), le tampon de profondeur gérant
 * les occultations.
 */
export const BUBBLE_RENDER_ORDER = FISH_RENDER_ORDER + 0.1;

/**
 * Couche des bulles (ADR 0017) : deux nuages de points de taille fixe à l'écran, un par
 * taille (1 et 2 pixels de la cible de rendu, donc 1 et 2 pixels de scène en pixel art), et
 * le diffuseur posé sur le sable. Tout est alloué à la construction : `update` réécrit les
 * positions en place, sans allocation.
 */
export class BubbleLayer {
  readonly object = new Group();
  private readonly buffer = createBubbleBuffer();
  private readonly clouds: readonly BubbleCloud[];
  private readonly diffuserGeometry = new BoxGeometry(
    DIFFUSER_SIZE,
    DIFFUSER_HEIGHT,
    DIFFUSER_SIZE,
  );
  private readonly diffuserMaterial = new MeshBasicMaterial({
    color: DIFFUSER_COLOR,
    transparent: true,
    opacity: 1,
  });
  private readonly diffuserColor = new Color(DIFFUSER_COLOR);
  private readonly bubbleColor = new Color(BUBBLE_COLOR);
  private brightnessFactor = 1;
  private seed = 0;
  /** Pixels de la cible par pixel de scène (1 en pixel art, PIXEL_SIZE × ratio sans filtre). */
  private pointScale = 1;

  constructor(private readonly source: BubbleSource = DEFAULT_BUBBLE_SOURCE) {
    this.object.name = 'bulles';
    this.clouds = ([1, 2] as const).map((size) => new BubbleCloud(size));
    for (const cloud of this.clouds) {
      this.object.add(cloud.points);
    }
    const diffuser = new Mesh(this.diffuserGeometry, this.diffuserMaterial);
    diffuser.name = 'diffuseur';
    // Dessus du diffuseur à BUBBLE_START_Y : les bulles naissent dessus.
    diffuser.position.set(source.x, SAND_THICKNESS + DIFFUSER_HEIGHT / 2, source.z);
    diffuser.renderOrder = DECOR_RENDER_ORDER;
    this.object.add(diffuser);
  }

  /** Graine du monde affiché : à appeler une fois par monde. */
  setSeed(seed: number): void {
    this.seed = seed;
  }

  /** Taille d'un pixel de scène en pixels de la surface de rendu. */
  setPointScale(scale: number): void {
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
    if (s !== this.pointScale) {
      this.pointScale = s;
      for (const cloud of this.clouds) {
        cloud.material.size = cloud.size * s;
      }
    }
  }

  /**
   * Luminosité des couleurs plates (`render/night-shade.ts`) : facteur appliqué aux
   * couleurs des bulles et du diffuseur. 1 : couleurs d'origine, exactement.
   * Une valeur non finie ou négative est ignorée.
   */
  setBrightness(factor: number): void {
    if (!Number.isFinite(factor) || factor < 0 || factor === this.brightnessFactor) {
      return;
    }
    this.brightnessFactor = factor;
    for (const cloud of this.clouds) {
      cloud.material.color.copy(this.bubbleColor).multiplyScalar(factor);
    }
    this.diffuserMaterial.color.copy(this.diffuserColor).multiplyScalar(factor);
  }

  /** Luminosité appliquée (tests). */
  get brightness(): number {
    return this.brightnessFactor;
  }

  /** Pose les bulles au temps simulé `time` (secondes), sans allocation. */
  update(time: number): void {
    const { positions, sizes } = this.buffer;
    const count = fillBubbles(this.seed, Math.max(0, time), this.buffer, this.source);
    for (const cloud of this.clouds) {
      cloud.count = 0;
    }
    for (let i = 0; i < count; i++) {
      const cloud = this.clouds[sizes[i] - 1];
      const array = cloud.position.array as Float32Array;
      const j = 3 * cloud.count;
      array[j] = positions[3 * i];
      array[j + 1] = positions[3 * i + 1];
      array[j + 2] = positions[3 * i + 2];
      cloud.count++;
    }
    for (const cloud of this.clouds) {
      cloud.geometry.setDrawRange(0, cloud.count);
      cloud.position.needsUpdate = true;
    }
  }

  /** Nombre de bulles affichées par le dernier `update` (tests). */
  get count(): number {
    return this.clouds[0].count + this.clouds[1].count;
  }

  /** Nombre de bulles affichées de chaque taille, `[1 pixel, 2 pixels]` (tests). */
  get countsBySize(): readonly [number, number] {
    return [this.clouds[0].count, this.clouds[1].count];
  }

  dispose(): void {
    for (const cloud of this.clouds) {
      cloud.geometry.dispose();
      cloud.material.dispose();
    }
    this.diffuserGeometry.dispose();
    this.diffuserMaterial.dispose();
  }
}

/** Nuage de points d'une taille : capacité `MAX_BUBBLES`, plage de dessin ajustée. */
class BubbleCloud {
  readonly geometry = new BufferGeometry();
  readonly position = new BufferAttribute(new Float32Array(MAX_BUBBLES * 3), 3);
  readonly material: PointsMaterial;
  readonly points: Points;
  count = 0;

  constructor(readonly size: 1 | 2) {
    this.position.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setDrawRange(0, 0);
    this.material = new PointsMaterial({
      color: BUBBLE_COLOR,
      size,
      // Taille fixe en pixels de la cible : 1 ou 2 pixels de scène quel que soit le zoom.
      sizeAttenuation: false,
      transparent: true,
      opacity: 1,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.name = `bulles-${size}px`;
    this.points.renderOrder = BUBBLE_RENDER_ORDER;
    // Les positions changent à chaque image : la sphère englobante n'a pas de sens.
    this.points.frustumCulled = false;
  }
}
