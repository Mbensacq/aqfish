import type { WoodCell, WoodModel } from '../sim/wood';
import { PALETTE } from './palette';
import { buildVoxelMesh, cellHash, type VoxelMeshData } from './rock-model';

/**
 * Maillage voxel d'un bois flotté (`sim/wood.ts`, ADR 0045), contour compris par la couche du
 * décor (coque, comme les rochers).
 *
 * Trois tons bruns de la palette (docs/DA.md) : dessus clair (`sableSombre`, bois blanchi),
 * flancs `sableOmbre`, quelques nœuds et la rangée de contact avec le sable en `rocheSombre`.
 * Les gris des rochers (`roche`) ne sont pas utilisés : bois et pierre restent distincts.
 */

/** Couleurs d'un bois flotté : dessus, flanc, ombre (nœuds et contact). */
export const WOOD_COLORS = {
  top: PALETTE.sableSombre,
  side: PALETTE.sableOmbre,
  shade: PALETTE.rocheSombre,
} as const;

/** Part des flancs en ton d'ombre (nœuds, fentes de l'écorce). */
const KNOT_SHARE = 0.18;

/** Couleur (nom de palette résolu) d'une face d'un voxel de bois. */
export function woodFaceColor(seed: number, cell: WoodCell, up: boolean): string {
  if (up) {
    return WOOD_COLORS.top;
  }
  return cell.j === 0 || cellHash(seed, cell.i, cell.j, cell.k) < KNOT_SHARE
    ? WOOD_COLORS.shade
    : WOOD_COLORS.side;
}

/**
 * Maillage d'un bois flotté dans son repère local (mètres, Y = 0 à la base). `seed` place les
 * nœuds (même graine, même bois).
 */
export function buildWoodMesh(model: WoodModel, seed: number): VoxelMeshData {
  return buildVoxelMesh(model.cells, model.voxelSize, (cell, up) => woodFaceColor(seed, cell, up));
}
