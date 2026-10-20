import { BoxGeometry, Color, Mesh, MeshLambertMaterial, Object3D } from 'three';

import type { TankDimensions } from '../sim/tank';
import { NIGHT_TONES, PALETTE } from './palette';

/**
 * Margelle de pierre du bassin (issue #87, ADR 0026) : un anneau de blocs autour du volume
 * d'eau, du sol jusqu'un peu au-dessus du bord. Les blocs sont séparés par un joint étroit
 * (le fond de la scène, sombre, y apparaît comme un joint de mortier) et leurs hauteurs
 * varient d'un bloc à l'autre selon un motif fixe : rendu déterministe, sans hasard.
 */

/** Épaisseur de la margelle (vers l'extérieur), en mètres. */
export const STONE_BORDER_THICKNESS = 0.12;
/** Longueur visée d'un bloc ; la longueur réelle divise exactement chaque côté. */
export const STONE_BLOCK_LENGTH = 0.26;
/** Joint entre deux blocs : environ deux pixels de scène en vue de dessus. */
export const STONE_JOINT = 0.014;
/** Dépassement du haut des blocs au-dessus du bord du bassin, en mètres. */
export const STONE_RISE = 0.025;
/** Variations de hauteur des blocs, répétées le long de l'anneau (mètres). */
const HEIGHT_PATTERN = [0, 0.012, -0.006, 0.018, 0.004, -0.01, 0.009] as const;

/** Bloc de la margelle : boîte alignée sur les axes (centre et tailles, en mètres). */
export interface StoneBlock {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  /** Rang du bloc le long de l'anneau (choix de la couleur du dessus). */
  readonly index: number;
}

/**
 * Blocs de la margelle autour d'un volume `dims` centré en X et Z, posé sur y = 0 : les deux
 * longs côtés (selon X) couvrent les coins, les deux autres s'arrêtent à leur contact. Aucun
 * bloc n'entre dans le volume d'eau.
 * @throws RangeError si une dimension n'est pas un réel strictement positif.
 */
export function stoneBorderBlocks(dims: TankDimensions): StoneBlock[] {
  for (const value of [dims.width, dims.height, dims.depth]) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new RangeError(`dimensions invalides : ${JSON.stringify(dims)}`);
    }
  }
  const t = STONE_BORDER_THICKNESS;
  const blocks: StoneBlock[] = [];
  const side = (length: number, along: 'x' | 'z', offset: number, start: number): void => {
    const count = Math.max(1, Math.round(length / STONE_BLOCK_LENGTH));
    const step = length / count;
    for (let i = 0; i < count; i++) {
      const index = blocks.length;
      const height = dims.height + STONE_RISE + HEIGHT_PATTERN[index % HEIGHT_PATTERN.length];
      const center = start + (i + 0.5) * step;
      const size = Math.max(step - STONE_JOINT, step / 2);
      blocks.push({
        x: along === 'x' ? center : offset,
        y: height / 2,
        z: along === 'x' ? offset : center,
        width: along === 'x' ? size : t,
        height,
        depth: along === 'x' ? t : size,
        index,
      });
    }
  };
  const fullWidth = dims.width + 2 * t;
  side(fullWidth, 'x', -(dims.depth + t) / 2, -fullWidth / 2);
  side(dims.depth, 'z', (dims.width + t) / 2, -dims.depth / 2);
  side(fullWidth, 'x', (dims.depth + t) / 2, -fullWidth / 2);
  side(dims.depth, 'z', -(dims.width + t) / 2, -dims.depth / 2);
  return blocks;
}

/** Teintes du dessus des blocs, en alternance (pierres de deux tons). */
const TOP_COLORS = [PALETTE.roche, PALETTE.sableOmbre] as const;

/**
 * Lueur des pierres en pleine nuit (ADR 0026) : sans elle, les côtés de la margelle, peu
 * éclairés par la lune, se confondraient avec le fond de la scène. Nulle à midi.
 */
export const STONE_NIGHT_GLOW = NIGHT_TONES.rocheLuneSombre;

/** Margelle ajoutée à la scène, avec sa teinte selon l'heure. */
export interface StoneBorder {
  readonly object: Object3D;
  /** Intensité du jour dans [0, 1] : à 1 (midi), aucune lueur ; à 0, `STONE_NIGHT_GLOW`. */
  setDaylight(intensity: number): void;
}

/**
 * Margelle prête à ajouter à la scène : un `Mesh` par bloc, dessus clair (deux tons en
 * alternance), côtés `rocheSombre`. Matériaux éclairés, partagés entre les blocs.
 */
export function createStoneBorder(dims: TankDimensions): StoneBorder {
  const object = new Object3D();
  object.name = 'margelle';
  const tops = TOP_COLORS.map((color) => new MeshLambertMaterial({ color }));
  const side = new MeshLambertMaterial({ color: PALETTE.rocheSombre });
  const materials = [...tops, side];
  for (const block of stoneBorderBlocks(dims)) {
    const top = tops[block.index % tops.length];
    // Ordre des faces d'une BoxGeometry : +X, -X, +Y, -Y, +Z, -Z.
    const mesh = new Mesh(new BoxGeometry(block.width, block.height, block.depth), [
      side,
      side,
      top,
      side,
      side,
      side,
    ]);
    mesh.name = `pierre-${block.index}`;
    mesh.position.set(block.x, block.y, block.z);
    object.add(mesh);
  }
  const black = new Color(0, 0, 0);
  const glow = new Color(STONE_NIGHT_GLOW);
  return {
    object,
    setDaylight: (intensity) => {
      const day = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 1));
      for (const material of materials) {
        // `lerpColors(a, b, 0)` vaut exactement `a` : noir (aucune lueur) à midi.
        material.emissive.lerpColors(black, glow, 1 - day);
      }
    },
  };
}
