import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { SAND_THICKNESS, type Box3 } from '../sim/tank';
import type { EffectLayer } from './effect-layer';
import { DECOR_RENDER_ORDER } from './decor-layer';
import { PALETTE } from './palette';

/** Couleur des chevrons : l'eau la plus claire, comme les bulles (docs/DA.md, palette). */
export const CURRENT_INDICATOR_COLOR = PALETTE.eauTresClaire;
/** Demi-envergure d'un chevron (mètres). */
export const CHEVRON_HALF_SPAN = 0.018;
/** Épaisseur d'une branche de chevron (mètres). */
export const CHEVRON_THICKNESS = 0.006;
/** Écart entre deux chevrons consécutifs (mètres). */
export const CHEVRON_GAP = 0.022;
/** Nombre de chevrons visibles de chaque force (doux, fort). */
export const CHEVRON_COUNTS = { doux: 2, fort: 3 } as const;
/** Glissement des chevrons vers l'aval (mètres) et période (secondes du temps simulé). */
export const CHEVRON_SLIDE = 0.012;
export const CHEVRON_SLIDE_PERIOD = 2;
/** Distance du repère à la vitre avant (mètres), posé juste au-dessus du sable. */
export const INDICATOR_FRONT_INSET = 0.045;
const INDICATOR_LIFT = 0.002;

/**
 * Indicateur discret du sens du courant (issue #460, ADR 0108) : deux ou trois chevrons
 * clairs posés sur le sable, le long de la vitre avant, pointés vers l'aval. Ils glissent
 * doucement dans le sens de l'eau au temps simulé (contrat de capture) ; mouvements réduits,
 * ils restent immobiles. Masqué courant coupé. Géométrie partagée, allouée à la construction.
 */
export class CurrentIndicatorLayer implements EffectLayer {
  readonly object = new Group();
  private readonly arrow = new Group();
  private readonly geometry = chevronGeometry();
  private readonly material = new MeshBasicMaterial({
    color: CURRENT_INDICATOR_COLOR,
    transparent: true,
    opacity: 1,
    side: DoubleSide,
  });
  private readonly baseColor = new Color(CURRENT_INDICATOR_COLOR);
  private readonly chevrons: readonly Mesh[];
  private brightnessFactor = 1;
  private still = false;
  private shown = 0;

  constructor(water: Box3) {
    this.object.name = 'courant';
    this.object.visible = false;
    this.arrow.position.set(
      (water.minX + water.maxX) / 2,
      SAND_THICKNESS + INDICATOR_LIFT,
      water.maxZ - INDICATOR_FRONT_INSET,
    );
    this.chevrons = Array.from({ length: CHEVRON_COUNTS.fort }, (_, i) => {
      const mesh = new Mesh(this.geometry, this.material);
      mesh.name = `courant-chevron-${i}`;
      mesh.renderOrder = DECOR_RENDER_ORDER;
      this.arrow.add(mesh);
      return mesh;
    });
    this.object.add(this.arrow);
  }

  /**
   * Courant affiché : direction (radians, 0 vers +X, π/2 vers +Z, `sim/water-current.ts`) et
   * nombre de chevrons (0 : masqué).
   */
  setCurrent(direction: number, chevrons: number): void {
    this.shown = Math.max(0, Math.min(this.chevrons.length, Math.floor(chevrons)));
    this.object.visible = this.shown > 0;
    // Rotation autour de Y : +X tourne vers −Z ; la direction se compte de +X vers +Z.
    this.arrow.rotation.y = -direction;
    for (let i = 0; i < this.chevrons.length; i++) {
      this.chevrons[i].visible = i < this.shown;
    }
  }

  /** Mouvements réduits (#406) : chevrons immobiles. */
  setStill(still: boolean): void {
    this.still = still;
  }

  setSeed(): void {
    // Aucun hasard : le repère ne dépend que du courant.
  }

  update(time: number): void {
    const slide = this.still
      ? 0
      : CHEVRON_SLIDE * ((Math.max(0, time) % CHEVRON_SLIDE_PERIOD) / CHEVRON_SLIDE_PERIOD);
    const start = (-(this.shown - 1) * CHEVRON_GAP) / 2;
    for (let i = 0; i < this.shown; i++) {
      this.chevrons[i].position.x = start + i * CHEVRON_GAP + slide;
    }
  }

  setBrightness(factor: number): void {
    if (!Number.isFinite(factor) || factor < 0 || factor === this.brightnessFactor) {
      return;
    }
    this.brightnessFactor = factor;
    this.material.color.copy(this.baseColor).multiplyScalar(factor);
  }

  /** Chevrons affichés (tests). */
  get count(): number {
    return this.object.visible ? this.shown : 0;
  }

  /** Abscisse locale du premier chevron (tests). */
  get firstOffset(): number {
    return this.chevrons[0].position.x;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Chevron « > » à plat (plan X-Z), pointe vers +X : deux branches de `CHEVRON_THICKNESS`. */
function chevronGeometry(): BufferGeometry {
  const a = CHEVRON_HALF_SPAN;
  const t = CHEVRON_THICKNESS;
  // Branche haute : de (−a, −a) à (0, 0) ; branche basse : de (−a, a) à (0, 0), épaissies vers −X.
  const quads = [
    [-a, -a, 0, 0, -t, 0, -a - t, -a],
    [-a, a, 0, 0, -t, 0, -a - t, a],
  ];
  const positions: number[] = [];
  for (const [x0, z0, x1, z1, x2, z2, x3, z3] of quads) {
    positions.push(x0, 0, z0, x1, 0, z1, x2, 0, z2, x0, 0, z0, x2, 0, z2, x3, 0, z3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeBoundingSphere();
  return geometry;
}
