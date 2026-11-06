import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three';

import { ALGAE_VISIBLE_COVERAGE, drawnRadius, type AlgaePatch, type AlgaeWall } from '../sim/algae';
import type { SceneLayer } from './effect-layer';
import { PALETTE } from './palette';

/**
 * Plaques d'algues vertes sur les vitres (issue #476, ADR 0109) : une tache plate de pixels
 * carrés par plaque (`sim/algae.ts`), posée contre la face intérieure de sa vitre. Sa taille
 * suit la couverture (rayon dessiné `drawnRadius`) ; sous `ALGAE_VISIBLE_COVERAGE`, elle est
 * masquée.
 *
 * Aspect (#488) : un voile terne et filamenteux, pour ne pas ressembler aux plantes (contour
 * sombre, feuilles claires et reflets lumineux). Fond `vegetation` (vert moyen, sans reflet),
 * filaments verticaux `vegetationOmbre` une colonne sur deux, coupés par endroits ; bord
 * tramé (une case sur deux) au lieu d'un contour, pour un bord flou où l'eau transparaît.
 * Couleurs de la végétation de la palette, voilées par l'eau comme les plantes : aucune
 * couleur ajoutée à la palette. Sans algue, la couche est masquée : images inchangées, à
 * l'octet près.
 */

/** Côté d'un pixel de plaque, en mètres (comme les voxels des feuilles de catappa). */
export const ALGAE_PIXEL = 0.01;
/** Retrait de la plaque vers l'intérieur du bac, en mètres : devant la vitre, sans la toucher. */
export const ALGAE_INSET = 0.003;
/** Couleurs du voile et de ses filaments (#488 : ni contour sombre, ni reflet clair). */
export const ALGAE_COLORS = {
  voile: PALETTE.vegetation,
  filament: PALETTE.vegetationOmbre,
} as const;

/**
 * Vrai si la case (`r`, `c`) d'une plaque de variante `variant` porte un filament : une
 * colonne sur deux, coupée une case sur cinq environ (motif fixe, sans hasard).
 */
export function isFilament(r: number, c: number, variant: number): boolean {
  return (c + variant) % 2 === 0 && (r * 3 + c * 7 + variant) % 5 !== 0;
}

/**
 * Forme d'une plaque de rayon `cells` pixels : les cases dont le centre tombe dans un disque
 * au bord irrégulier (bosses fixes, tirées de `variant`). `true` : case pleine. Déterministe.
 */
export function algaeMask(cells: number, variant: number): boolean[][] {
  const n = Math.max(1, Math.round(cells));
  const size = 2 * n;
  const mask: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      const x = c + 0.5 - n;
      const y = r + 0.5 - n;
      const angle = Math.atan2(y, x);
      // Bord en lobes : trois bosses, décalées selon la plaque.
      const lobe = 1 + 0.18 * Math.sin(3 * angle + variant * 1.7) - 0.1;
      row.push(Math.hypot(x, y) <= n * lobe);
    }
    mask.push(row);
  }
  return mask;
}

/**
 * Triangles d'une plaque (plan local XY, centré) : voile `voile` et filaments `filament`
 * (`isFilament`) ; au bord, une case sur deux seulement (trame), sans contour.
 */
export function buildAlgaePatch(
  cells: number,
  variant: number,
): { readonly positions: Float32Array; readonly colors: Float32Array } {
  const mask = algaeMask(cells, variant);
  const size = mask.length;
  const filled = (r: number, c: number) => r >= 0 && r < size && c >= 0 && c < size && mask[r][c];
  const voile = new Color(ALGAE_COLORS.voile);
  const filament = new Color(ALGAE_COLORS.filament);
  const positions: number[] = [];
  const colors: number[] = [];
  const p = ALGAE_PIXEL;
  const half = (size * p) / 2;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!filled(r, c)) {
        continue;
      }
      const edge = !filled(r - 1, c) || !filled(r + 1, c) || !filled(r, c - 1) || !filled(r, c + 1);
      // Bord tramé : une case sur deux, l'eau passe entre (bord flou, pas de contour).
      if (edge && (r + c) % 2 === 1) {
        continue;
      }
      const color = isFilament(r, c, variant) ? filament : voile;
      const x0 = c * p - half;
      const y0 = half - (r + 1) * p;
      const x1 = x0 + p;
      const y1 = y0 + p;
      for (const [x, y] of [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y0],
        [x1, y1],
        [x0, y1],
      ]) {
        positions.push(x, y, 0);
        colors.push(color.r, color.g, color.b);
      }
    }
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
}

/** Rotation autour de la verticale qui tourne le plan XY de la plaque vers sa vitre. */
const WALL_YAW: Readonly<Record<AlgaeWall, number>> = {
  fond: 0,
  devant: Math.PI,
  gauche: Math.PI / 2,
  droite: -Math.PI / 2,
};

/** Déplacement de la plaque vers l'intérieur du bac, selon sa vitre (x, z). */
const WALL_INWARD: Readonly<Record<AlgaeWall, readonly [number, number]>> = {
  fond: [0, 1],
  devant: [0, -1],
  gauche: [1, 0],
  droite: [-1, 0],
};

/**
 * Couche des algues : un maillage par plaque, créé quand les plaques changent (autre bac,
 * autres dimensions) ; `setAlgae` ne fait ensuite que montrer, masquer et mettre à l'échelle.
 */
export class AlgaeLayer implements SceneLayer {
  readonly object = new Group();
  private readonly material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
  private patches: readonly AlgaePatch[] = [];
  private meshes: Mesh[] = [];
  private shown = 0;
  private brightnessFactor = 1;

  constructor() {
    this.object.name = 'algues';
    this.object.visible = false;
  }

  /**
   * Montre chaque plaque de `patches` dont la couverture (`algae`, même ordre) atteint
   * `ALGAE_VISIBLE_COVERAGE`, à son rayon dessiné. Sans algue, la couche est masquée.
   */
  setAlgae(patches: readonly AlgaePatch[], algae: readonly number[] | undefined): void {
    if (patches !== this.patches) {
      this.rebuild(patches);
    }
    let shown = 0;
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      const cover = algae?.[i] ?? 0;
      const visible = cover >= ALGAE_VISIBLE_COVERAGE;
      mesh.visible = visible;
      if (visible) {
        const scale = drawnRadius(patches[i], cover) / patches[i].radius;
        mesh.scale.setScalar(scale);
        mesh.updateMatrix();
        shown++;
      }
    }
    this.shown = shown;
    this.object.visible = shown > 0;
  }

  private rebuild(patches: readonly AlgaePatch[]): void {
    this.disposeMeshes();
    this.patches = patches;
    this.meshes = patches.map((patch, index) => {
      const data = buildAlgaePatch(patch.radius / ALGAE_PIXEL, index);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
      geometry.setAttribute('color', new BufferAttribute(data.colors, 3));
      const mesh = new Mesh(geometry, this.material);
      const [ix, iz] = WALL_INWARD[patch.wall];
      mesh.position.set(patch.x + ix * ALGAE_INSET, patch.y, patch.z + iz * ALGAE_INSET);
      mesh.rotation.y = WALL_YAW[patch.wall];
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.object.add(mesh);
      return mesh;
    });
  }

  /** Nombre de plaques affichées (tests). */
  get count(): number {
    return this.shown;
  }

  /**
   * Luminosité des couleurs plates (`render/night-shade.ts`) : 1, couleurs d'origine. Une
   * valeur non finie ou négative est ignorée.
   */
  setBrightness(factor: number): void {
    if (!Number.isFinite(factor) || factor < 0 || factor === this.brightnessFactor) {
      return;
    }
    this.brightnessFactor = factor;
    this.material.color.setRGB(factor, factor, factor);
  }

  /** Luminosité appliquée (tests). */
  get brightness(): number {
    return this.brightnessFactor;
  }

  private disposeMeshes(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      this.object.remove(mesh);
    }
    this.meshes = [];
  }

  dispose(): void {
    this.disposeMeshes();
    this.material.dispose();
  }
}
