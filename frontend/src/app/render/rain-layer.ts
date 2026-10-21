import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  LineBasicMaterial,
  LineSegments,
} from 'three';

import {
  createRainBuffer,
  fillRain,
  MAX_RAIN_DROPS,
  MAX_RIPPLES,
  RAIN_STREAK_LENGTH,
  RIPPLE_DURATION,
  RIPPLE_RING_GAP,
  rippleRadius,
} from '../sim/rain';
import type { Box3 } from '../sim/tank';
import { BUBBLE_RENDER_ORDER } from './bubble-layer';
import { PALETTE } from './palette';
import { SURFACE_RENDER_ORDER } from './water-light';

/** Couleur des gouttes : la plus claire des eaux. */
export const RAIN_DROP_COLOR = PALETTE.eauTresClaire;
/** Couleur d'un rond jeune (première moitié de sa vie), puis d'un rond qui s'éteint. */
export const RIPPLE_YOUNG_COLOR = PALETTE.eauTresClaire;
export const RIPPLE_OLD_COLOR = PALETTE.eauClaire;
/** Segments d'un rond (cercle polygonal : au rayon maximal, ~12 pixels de scène vu de dessus). */
export const RIPPLE_SEGMENTS = 16;
/** Ronds concentriques par impact : extérieur, puis intérieur (`RIPPLE_RING_GAP` plus petit). */
export const RIPPLE_RINGS = 2;
/** Hauteur des ronds au-dessus de la surface, en mètres (évite le conflit de profondeur). */
export const RIPPLE_LIFT = 0.001;
/**
 * Ordres de rendu (opacité pleine, file des transparents : couleurs exactes de la palette,
 * ADR 0009) : les ronds juste après les rides de la surface et avant les nénuphars, qui les
 * cachent par la profondeur ; les gouttes après les poissons et les bulles.
 */
export const RIPPLE_RENDER_ORDER = SURFACE_RENDER_ORDER + 0.1;
export const RAIN_DROP_RENDER_ORDER = BUBBLE_RENDER_ORDER + 0.1;

/** Sommets d'un rond (deux par segment, `LineSegments`). */
const RING_VERTICES = 2 * RIPPLE_SEGMENTS;

/** Cosinus et sinus des sommets d'un cercle unité, calculés une fois. */
const CIRCLE = Array.from({ length: RIPPLE_SEGMENTS + 1 }, (_, i) => {
  const a = (2 * Math.PI * i) / RIPPLE_SEGMENTS;
  return [Math.cos(a), Math.sin(a)] as const;
});

/**
 * Couche de la pluie (issue #106, ADR 0032) : gouttes en traits verticaux et ronds
 * concentriques à la surface, posés à chaque image selon `fillRain` au temps simulé
 * (contrat de capture). Lignes d'un pixel de la cible (donc d'un pixel de scène en pixel
 * art), sans lissage. Tout est alloué à la construction : `update` réécrit les positions en
 * place, sans allocation. Masquée tant que la pluie n'est pas activée (`setEnabled`).
 */
export class RainLayer {
  readonly object = new Group();
  private readonly buffer = createRainBuffer();
  private readonly dropGeometry = new BufferGeometry();
  private readonly dropPositions = new BufferAttribute(new Float32Array(MAX_RAIN_DROPS * 6), 3);
  private readonly dropMaterial = new LineBasicMaterial({
    color: RAIN_DROP_COLOR,
    transparent: true,
    opacity: 1,
  });
  private readonly rippleGeometry = new BufferGeometry();
  private readonly ripplePositions = new BufferAttribute(
    new Float32Array(MAX_RIPPLES * RIPPLE_RINGS * RING_VERTICES * 3),
    3,
  );
  private readonly rippleColors = new BufferAttribute(
    new Float32Array(MAX_RIPPLES * RIPPLE_RINGS * RING_VERTICES * 3),
    3,
  );
  private readonly rippleMaterial = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
  });
  private readonly dropBase = new Color(RAIN_DROP_COLOR);
  private readonly youngColor = new Color(RIPPLE_YOUNG_COLOR);
  private readonly oldColor = new Color(RIPPLE_OLD_COLOR);
  private seed = 0;
  private enabled = false;
  private brightnessFactor = 1;
  private drops = 0;
  private ripples = 0;
  private rings = 0;

  constructor(private readonly water: Box3) {
    this.object.name = 'pluie';
    this.object.visible = false;
    this.dropPositions.setUsage(DynamicDrawUsage);
    this.dropGeometry.setAttribute('position', this.dropPositions);
    this.dropGeometry.setDrawRange(0, 0);
    this.ripplePositions.setUsage(DynamicDrawUsage);
    this.rippleColors.setUsage(DynamicDrawUsage);
    this.rippleGeometry.setAttribute('position', this.ripplePositions);
    this.rippleGeometry.setAttribute('color', this.rippleColors);
    this.rippleGeometry.setDrawRange(0, 0);
    const drops = new LineSegments(this.dropGeometry, this.dropMaterial);
    drops.name = 'pluie-gouttes';
    drops.renderOrder = RAIN_DROP_RENDER_ORDER;
    const ripples = new LineSegments(this.rippleGeometry, this.rippleMaterial);
    ripples.name = 'pluie-ronds';
    ripples.renderOrder = RIPPLE_RENDER_ORDER;
    // Les positions changent à chaque image : la sphère englobante n'a pas de sens.
    drops.frustumCulled = false;
    ripples.frustumCulled = false;
    this.object.add(ripples, drops);
  }

  /** Graine du monde affiché : à appeler une fois par monde. */
  setSeed(seed: number): void {
    this.seed = seed;
  }

  /** Affiche la pluie (`true`) ou la masque ; masquée, `update` ne calcule rien. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.object.visible = enabled;
    if (!enabled) {
      this.drops = 0;
      this.ripples = 0;
      this.rings = 0;
      this.dropGeometry.setDrawRange(0, 0);
      this.rippleGeometry.setDrawRange(0, 0);
    }
  }

  /** Vrai si la pluie est affichée. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Luminosité des couleurs plates (`render/night-shade.ts`), comme les bulles : 1 en plein
   * jour (couleurs d'origine, exactement). Une valeur non finie ou négative est ignorée.
   */
  setBrightness(factor: number): void {
    if (!Number.isFinite(factor) || factor < 0) {
      return;
    }
    this.brightnessFactor = factor;
    this.dropMaterial.color.copy(this.dropBase).multiplyScalar(factor);
    // Couleurs des sommets multipliées par la couleur du matériau.
    this.rippleMaterial.color.setScalar(factor);
  }

  /** Luminosité appliquée (tests). */
  get brightness(): number {
    return this.brightnessFactor;
  }

  /** Pose gouttes et ronds au temps simulé `time` (secondes), sans allocation. */
  update(time: number): void {
    if (!this.enabled) {
      return;
    }
    const rain = this.buffer;
    fillRain(this.seed, Math.max(0, time), this.water, rain);
    const drops = this.dropPositions.array as Float32Array;
    for (let i = 0; i < rain.dropCount; i++) {
      const x = rain.drops[3 * i];
      const y = rain.drops[3 * i + 1];
      const z = rain.drops[3 * i + 2];
      const j = 6 * i;
      drops[j] = x;
      drops[j + 1] = y;
      drops[j + 2] = z;
      drops[j + 3] = x;
      drops[j + 4] = y + RAIN_STREAK_LENGTH;
      drops[j + 5] = z;
    }
    this.drops = rain.dropCount;
    this.dropGeometry.setDrawRange(0, 2 * rain.dropCount);
    this.dropPositions.needsUpdate = true;

    const surfaceY = this.water.maxY + RIPPLE_LIFT;
    let rings = 0;
    for (let i = 0; i < rain.rippleCount; i++) {
      const x = rain.ripples[3 * i];
      const z = rain.ripples[3 * i + 1];
      const age = rain.ripples[3 * i + 2];
      const outer = rippleRadius(age);
      const color = age < RIPPLE_DURATION / 2 ? this.youngColor : this.oldColor;
      // Le rond extérieur, puis l'intérieur dès qu'il a un rayon.
      for (let ring = 0; ring < RIPPLE_RINGS; ring++) {
        const radius = outer - ring * RIPPLE_RING_GAP;
        if (radius <= 0) {
          break;
        }
        this.writeRing(rings++, x, surfaceY, z, radius, color);
      }
    }
    this.ripples = rain.rippleCount;
    this.rings = rings;
    this.rippleGeometry.setDrawRange(0, rings * RING_VERTICES);
    this.ripplePositions.needsUpdate = true;
    this.rippleColors.needsUpdate = true;
  }

  /** Gouttes posées par le dernier `update` (tests). */
  get dropCount(): number {
    return this.drops;
  }

  /** Ronds (impacts) posés par le dernier `update` (tests). */
  get rippleCount(): number {
    return this.ripples;
  }

  /** Cercles dessinés par le dernier `update`, intérieurs compris (tests). */
  get ringCount(): number {
    return this.rings;
  }

  dispose(): void {
    this.dropGeometry.dispose();
    this.dropMaterial.dispose();
    this.rippleGeometry.dispose();
    this.rippleMaterial.dispose();
  }

  /** Écrit le cercle n° `index` (centre, rayon, couleur) dans les tampons des ronds. */
  private writeRing(
    index: number,
    x: number,
    y: number,
    z: number,
    radius: number,
    color: Color,
  ): void {
    const positions = this.ripplePositions.array as Float32Array;
    const colors = this.rippleColors.array as Float32Array;
    let v = index * RING_VERTICES * 3;
    // Segment s : du sommet s au sommet s + 1 du cercle.
    for (let k = 0; k < RING_VERTICES; k++) {
      const point = CIRCLE[(k >> 1) + (k & 1)];
      positions[v] = x + radius * point[0];
      positions[v + 1] = y;
      positions[v + 2] = z + radius * point[1];
      colors[v] = color.r;
      colors[v + 1] = color.g;
      colors[v + 2] = color.b;
      v += 3;
    }
  }
}
