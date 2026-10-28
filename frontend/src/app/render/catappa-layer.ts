import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshBasicMaterial } from 'three';

import { MAX_CATAPPA_LEAVES } from '../sim/catappa';
import type { Box3 } from '../sim/tank';
import { FOOD_CORE_RENDER_ORDER, withFoodMarker } from './food-layer';
import { FOOD_TONES } from './palette';
import type { SceneLayer } from './effect-layer';

/**
 * Feuilles de catappa posées sur le sol du bac (issue #239, ADR 0071) : feuilles voxel
 * brunes, à plat, à des emplacements fixes (aucun hasard : mêmes images pour un même nombre
 * de feuilles). Une feuille dont la réserve est épuisée est plus sombre : elle n'agit plus et
 * attend d'être retirée.
 *
 * Couleurs : les bruns de la nourriture (`FOOD_TONES`), que la passe palette ne propose
 * qu'aux pixels marqués d'une opacité inférieure à 1 (`withFoodMarker`, ADR 0056) ; aucune
 * couleur ajoutée à la palette (`CATAPPA_RENDER_ORDER`). Sans feuille, la couche est vide et masquée : images
 * inchangées, à l'octet près.
 */

/** Côté d'un voxel de feuille, en mètres. */
export const CATAPPA_VOXEL = 0.01;
/** Épaisseur de la feuille, en mètres. */
export const CATAPPA_THICKNESS = 0.004;
/**
 * Hauteur du dessous de la feuille au-dessus du sol, en mètres : sous 6 mm, les ombres
 * plates du décor posées sur le sable la masquaient entièrement (mesuré à la capture, cycle
 * 94) ; 8 mm restent sous un pixel de scène en vue trois-quarts (~6 mm par pixel).
 */
export const CATAPPA_LIFT = 0.008;
/**
 * Ordre de rendu : file des transparents, après l'eau et les vitres, juste avant les
 * granulés (`FOOD_CORE_RENDER_ORDER`) : dessinée avant l'eau, la feuille voyait son marqueur
 * d'opacité recouvert par l'eau et les vitres et tombait sur les gris de la palette. Comme
 * les granulés, elle n'est donc pas voilée par l'eau.
 */
export const CATAPPA_RENDER_ORDER = FOOD_CORE_RENDER_ORDER - 0.005;

/**
 * Forme d'une feuille, vue de dessus : `#` plein, `.` vide ; la nervure est la ligne du
 * milieu, le pétiole à gauche. Feuille obovale, plus large vers la pointe, comme celle du
 * badamier (Terminalia catappa).
 */
export const CATAPPA_MASK: readonly string[] = [
  '.....####....',
  '...########..',
  '.###########.',
  '#############',
  '.###########.',
  '...########..',
  '.....####....',
];

/**
 * Emplacements des feuilles, en fractions de la demi-largeur et de la demi-profondeur de
 * l'eau, et angle autour de la verticale (radians) : devant, sur le sable dégagé, sans se
 * chevaucher.
 */
export const CATAPPA_SPOTS: readonly (readonly [number, number, number])[] = [
  [-0.3, 0.72, 0.35],
  [0.12, 0.8, -0.45],
  [-0.62, 0.62, 2.1],
  [0.45, 0.7, 2.7],
  [-0.08, 0.55, -1.4],
];

/** Couleurs (dessus clair, dessus sombre, nervure, flancs) d'une feuille neuve et épuisée. */
export const CATAPPA_COLORS = {
  fresh: [
    FOOD_TONES.granuleBrunRouge,
    FOOD_TONES.granuleBrun,
    FOOD_TONES.granuleOcre,
    FOOD_TONES.granuleBrun,
  ],
  spent: [
    FOOD_TONES.granuleBrun,
    FOOD_TONES.granuleBrun,
    FOOD_TONES.granuleBrun,
    FOOD_TONES.granuleBrun,
  ],
} as const;

/** Assombrissement des flancs (facteur de la couleur en espace linéaire). */
const SIDE_SHADE = 0.6;

/** Données d'une feuille : triangles (positions, couleurs), centrée sur l'origine. */
export interface CatappaLeafData {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
}

/**
 * Maillage d'une feuille (`CATAPPA_MASK`) : dessus de chaque voxel, flancs seulement vers
 * une case vide (pas de faces cachées), dessous omis (posée au sol). Moitié haute du masque
 * en ton clair, moitié basse en ton sombre, nervure à part.
 */
export function buildCatappaLeaf(
  colors: readonly [string, string, string, string],
): CatappaLeafData {
  const rows = CATAPPA_MASK.length;
  const cols = CATAPPA_MASK[0].length;
  const filled = (r: number, c: number): boolean =>
    r >= 0 && r < rows && c >= 0 && c < cols && CATAPPA_MASK[r][c] === '#';
  const [light, dark, rib, side] = colors.map((c) => new Color(c));
  const sideColor = side.clone().multiplyScalar(SIDE_SHADE);
  const positions: number[] = [];
  const out: number[] = [];
  const v = CATAPPA_VOXEL;
  const h = CATAPPA_THICKNESS;
  const x0 = (-cols * v) / 2;
  const z0 = (-rows * v) / 2;
  const quad = (a: number[], b: number[], c: number[], d: number[], color: Color): void => {
    for (const p of [a, b, c, a, c, d]) {
      positions.push(p[0], p[1], p[2]);
      out.push(color.r, color.g, color.b);
    }
  };
  const mid = (rows - 1) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!filled(r, c)) {
        continue;
      }
      const xa = x0 + c * v;
      const xb = xa + v;
      const za = z0 + r * v;
      const zb = za + v;
      const top = r === mid ? rib : r < mid ? light : dark;
      // Dessus (normale +Y, sens anti-horaire vu de dessus).
      quad([xa, h, za], [xa, h, zb], [xb, h, zb], [xb, h, za], top);
      if (!filled(r, c - 1)) {
        quad([xa, 0, za], [xa, 0, zb], [xa, h, zb], [xa, h, za], sideColor);
      }
      if (!filled(r, c + 1)) {
        quad([xb, 0, zb], [xb, 0, za], [xb, h, za], [xb, h, zb], sideColor);
      }
      if (!filled(r - 1, c)) {
        quad([xb, 0, za], [xa, 0, za], [xa, h, za], [xb, h, za], sideColor);
      }
      if (!filled(r + 1, c)) {
        quad([xa, 0, zb], [xb, 0, zb], [xb, h, zb], [xa, h, zb], sideColor);
      }
    }
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(out) };
}

function toGeometry(data: CatappaLeafData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('color', new BufferAttribute(data.colors, 3));
  return geometry;
}

/**
 * Couche des feuilles de catappa : `MAX_CATAPPA_LEAVES` maillages créés une fois, deux
 * géométries partagées (neuve, épuisée). `setLeaves` ne fait que montrer, masquer et changer
 * de géométrie.
 */
export class CatappaLayer implements SceneLayer {
  readonly object = new Group();
  private readonly material = withFoodMarker(new MeshBasicMaterial({ vertexColors: true }));
  private readonly fresh = toGeometry(buildCatappaLeaf(CATAPPA_COLORS.fresh));
  private readonly spent = toGeometry(buildCatappaLeaf(CATAPPA_COLORS.spent));
  private readonly meshes: readonly Mesh[];
  private shown = 0;
  private brightnessFactor = 1;

  /** @param water volume d'eau du bac (`environmentDataWater`) : les feuilles reposent sur son fond. */
  constructor(water: Box3) {
    this.object.name = 'feuilles-catappa';
    const halfX = (water.maxX - water.minX) / 2;
    const halfZ = (water.maxZ - water.minZ) / 2;
    const cx = (water.maxX + water.minX) / 2;
    const cz = (water.maxZ + water.minZ) / 2;
    this.meshes = CATAPPA_SPOTS.slice(0, MAX_CATAPPA_LEAVES).map(([fx, fz, angle]) => {
      const mesh = new Mesh(this.fresh, this.material);
      mesh.position.set(cx + fx * halfX, water.minY + CATAPPA_LIFT, cz + fz * halfZ);
      mesh.rotation.y = angle;
      mesh.renderOrder = CATAPPA_RENDER_ORDER;
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.object.add(mesh);
      return mesh;
    });
    this.object.visible = false;
  }

  /**
   * Montre une feuille par réserve de `leaves` (au plus `MAX_CATAPPA_LEAVES`) : plus sombre
   * si sa réserve est épuisée. Sans feuille, la couche est masquée.
   */
  setLeaves(leaves: readonly number[] | undefined): void {
    const count = Math.min(leaves?.length ?? 0, this.meshes.length);
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      mesh.visible = i < count;
      if (i < count) {
        mesh.geometry = leaves![i] > 0 ? this.fresh : this.spent;
      }
    }
    this.shown = count;
    this.object.visible = count > 0;
  }

  /** Nombre de feuilles affichées (tests). */
  get count(): number {
    return this.shown;
  }

  /** Nombre de feuilles épuisées affichées (tests). */
  get spentCount(): number {
    let n = 0;
    for (let i = 0; i < this.shown; i++) {
      if (this.meshes[i].geometry === this.spent) {
        n++;
      }
    }
    return n;
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

  dispose(): void {
    this.fresh.dispose();
    this.spent.dispose();
    this.material.dispose();
  }
}
