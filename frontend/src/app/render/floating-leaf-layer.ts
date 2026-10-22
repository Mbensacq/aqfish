import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector2,
} from 'three';

import {
  createFloatingLeafBuffer,
  fillFloatingLeaves,
  LEAF_LENGTH,
  LEAF_SHAPE_COUNT,
  LEAF_STRIDE,
  LEAF_TINT_COUNT,
  MAX_FLOATING_LEAVES,
} from '../sim/floating-leaves';
import type { Box3 } from '../sim/tank';
import { DECOR_RENDER_ORDER } from './decor-layer';
import {
  buildFloatingLeafHull,
  buildFloatingLeafMesh,
  floatingLeafOutline,
} from './floating-leaf-model';
import { createLilyPadOutlineMaterial, LILY_PAD_LIFT } from './lily-pad-layer';
import { LILY_PAD_THICKNESS } from './lily-pad-model';

/**
 * Hauteur du dessous d'une feuille morte au-dessus de la surface de l'eau, en mètres : juste
 * au-dessus du dessus des nénuphars, pour qu'une feuille qui passe sur l'un d'eux le recouvre
 * sans conflit de profondeur.
 */
export const FLOATING_LEAF_LIFT = LILY_PAD_LIFT + LILY_PAD_THICKNESS + 0.002;
/**
 * Ordre de rendu (opacité pleine, file des transparents : couleurs exactes de la palette) :
 * après les nénuphars et leurs fleurs (`DECOR_RENDER_ORDER` + 0,02), avant les poissons.
 */
export const FLOATING_LEAF_RENDER_ORDER = DECOR_RENDER_ORDER + 0.03;
/**
 * Longueur affichée sous laquelle le contour est masqué (pose et descente) : une feuille de
 * deux ou trois pixels réduite à son liseré ferait une tache noire.
 */
export const FLOATING_LEAF_OUTLINE_MIN_LENGTH = LEAF_LENGTH.min * 0.4;

interface Slot {
  readonly leaf: Group;
  readonly outline: Mesh;
  readonly body: Mesh;
}

/**
 * Couche des feuilles mortes (issue #107, ADR 0033) : `MAX_FLOATING_LEAVES` emplacements
 * créés une fois, posés à chaque image selon `fillFloatingLeaves` au temps simulé (contrat de
 * capture). Une forme par feuille parmi `LEAF_SHAPE_COUNT`, géométries partagées : `update`
 * ne fait que changer positions, échelles et géométries, sans allocation. Masquée hors du
 * bassin (`Environment.floatingLeaves`).
 */
export class FloatingLeafLayer {
  readonly object = new Group();
  private readonly buffer = createFloatingLeafBuffer();
  /** Comme les nénuphars : rapprochée de la caméra dans le tampon de profondeur. */
  private readonly material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  private readonly outlineMaterial = createLilyPadOutlineMaterial();
  /** Maillages par forme puis teinte (`shape * LEAF_TINT_COUNT + tint`), et coques par forme. */
  private readonly bodies: readonly BufferGeometry[];
  private readonly hulls: readonly BufferGeometry[];
  private readonly slots: readonly Slot[];
  private seed = 0;
  private visibleLeaves = 0;
  private brightnessFactor = 1;

  constructor(private readonly water: Box3) {
    this.object.name = 'feuilles-mortes';
    const bodies: BufferGeometry[] = [];
    const hulls: BufferGeometry[] = [];
    for (let shape = 0; shape < LEAF_SHAPE_COUNT; shape++) {
      const outline = floatingLeafOutline(shape);
      for (let tint = 0; tint < LEAF_TINT_COUNT; tint++) {
        const mesh = buildFloatingLeafMesh(outline, tint);
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
        geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
        geometry.setAttribute('color', new BufferAttribute(mesh.colors, 3));
        geometry.computeBoundingSphere();
        bodies.push(geometry);
      }
      const hull = buildFloatingLeafHull(outline);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(hull.positions, 3));
      geometry.setAttribute('offset', new BufferAttribute(hull.offsets, 3));
      geometry.computeBoundingSphere();
      hulls.push(geometry);
    }
    this.bodies = bodies;
    this.hulls = hulls;
    this.slots = Array.from({ length: MAX_FLOATING_LEAVES }, (_, n) => {
      const leaf = new Group();
      leaf.name = `feuille-morte-${n}`;
      leaf.position.y = water.maxY + FLOATING_LEAF_LIFT;
      leaf.visible = false;
      const outline = new Mesh(hulls[0], this.outlineMaterial);
      outline.name = `feuille-morte-${n}-contour`;
      const body = new Mesh(bodies[0], this.material);
      body.name = `feuille-morte-${n}-feuille`;
      for (const m of [outline, body]) {
        m.renderOrder = FLOATING_LEAF_RENDER_ORDER;
        leaf.add(m);
      }
      this.object.add(leaf);
      return { leaf, outline, body };
    });
  }

  /** Graine du monde affiché : à appeler une fois par monde. */
  setSeed(seed: number): void {
    this.seed = seed;
  }

  /** Pose les feuilles au temps simulé `time` (secondes), sans allocation. */
  update(time: number): void {
    const count = fillFloatingLeaves(this.seed, Math.max(0, time), this.water, this.buffer);
    const data = this.buffer.leaves;
    for (let i = 0; i < this.slots.length; i++) {
      const { leaf, outline, body } = this.slots[i];
      leaf.visible = i < count;
      if (i >= count) {
        continue;
      }
      const j = i * LEAF_STRIDE;
      const length = data[j + 3];
      const shape = data[j + 4];
      leaf.position.x = data[j];
      leaf.position.z = data[j + 1];
      leaf.rotation.y = data[j + 2];
      // Épaisseur absolue : seule l'emprise au sol suit la longueur.
      leaf.scale.set(Math.max(length, 1e-6), 1, Math.max(length, 1e-6));
      body.geometry = this.bodies[shape * LEAF_TINT_COUNT + data[j + 5]];
      outline.geometry = this.hulls[shape];
      outline.visible = length >= FLOATING_LEAF_OUTLINE_MIN_LENGTH;
    }
    this.visibleLeaves = count;
  }

  /**
   * Luminosité des couleurs plates (`render/night-shade.ts`), comme les bulles et la pluie :
   * 1 en plein jour (couleurs d'origine, exactement). Valeur non finie ou négative ignorée.
   */
  setBrightness(factor: number): void {
    if (!Number.isFinite(factor) || factor < 0) {
      return;
    }
    this.brightnessFactor = factor;
    this.material.color.setScalar(factor);
  }

  /** Luminosité appliquée (tests). */
  get brightness(): number {
    return this.brightnessFactor;
  }

  /** Feuilles posées par le dernier `update` (tests). */
  get count(): number {
    return this.visibleLeaves;
  }

  /** Couleur du matériau des feuilles (tests). */
  get color(): Color {
    return this.material.color;
  }

  /** Résolution de la surface de rendu, en pixels (épaisseur constante du contour). */
  setResolution(width: number, height: number): void {
    (this.outlineMaterial.uniforms['uResolution'].value as Vector2).set(
      Math.max(1, width),
      Math.max(1, height),
    );
  }

  dispose(): void {
    for (const g of [...this.bodies, ...this.hulls]) {
      g.dispose();
    }
    this.material.dispose();
    this.outlineMaterial.dispose();
  }
}
