import type { PlantCell, PlantModel } from '../sim/plant';
import { STRAND_PHASE_STEP } from '../sim/plant';
import { plantSway, type SwayOffset } from '../sim/plant-sway';
import { PALETTE } from './palette';
import { buildVoxelMesh, cellHash, type VoxelMeshData } from './rock-model';

/**
 * Maillage voxel d'une plante (`sim/plant.ts`, ADR 0016) et son ondulation.
 *
 * Couleurs plates de la palette (ADR 0009) : tiges `vegetationSombre` (dessus
 * `vegetationClaire`), feuillage `vegetationClaire` taché de `vegetation`, bouts des
 * feuilles et des brins `vegetationLumineuse`, bout des tiges `vegetationClaire`, collet
 * `vegetationOmbre`. Le maillage est
 * donné au repos ; `applyPlantSway` réécrit ses positions à partir du temps simulé, dans
 * un tableau alloué une fois (aucune allocation par image).
 */

/** Rangées du bas (en voxels) toujours dans l'ombre : collet au ras du sable. */
const SHADED_BASE_ROWS = 2;

/** Couleur (nom de palette résolu) d'une face d'un voxel de plante. */
export function plantFaceColor(seed: number, cell: PlantCell, up: boolean): string {
  if (cell.j < SHADED_BASE_ROWS) {
    return PALETTE.vegetationOmbre;
  }
  if (cell.tip) {
    return cell.part === 'leaf' ? PALETTE.vegetationLumineuse : PALETTE.vegetationClaire;
  }
  if (cell.part === 'stem') {
    return up ? PALETTE.vegetationClaire : PALETTE.vegetationSombre;
  }
  if (up) {
    return PALETTE.vegetationClaire;
  }
  return cellHash(seed, cell.i, cell.j, cell.k) < 0.4
    ? PALETTE.vegetation
    : PALETTE.vegetationClaire;
}

/** Maillage d'une plante : maillage voxel au repos, plus de quoi l'onduler par sommet. */
export interface PlantMeshData extends VoxelMeshData {
  /** Positions au repos (copie de `positions`, jamais modifiée). */
  readonly rest: Float32Array;
  /** Hauteur relative de chaque sommet, dans [0, 1] (0 à la racine). */
  readonly heights: Float32Array;
  /** Phase d'ondulation de chaque sommet (phase de la plante + décalage de sa tige). */
  readonly phases: Float32Array;
}

/**
 * Maillage d'une plante dans son repère local (mètres, Y = 0 à la racine). Les dessous de
 * la rangée enterrée sont omis, comme pour les rochers.
 */
export function buildPlantMesh(model: PlantModel, seed: number): PlantMeshData {
  const mesh = buildVoxelMesh(model.cells, model.voxelSize, (cell, up) =>
    plantFaceColor(seed, cell, up),
  );
  const count = mesh.positions.length / 3;
  const heights = new Float32Array(count);
  const phases = new Float32Array(count);
  const top = model.height * model.voxelSize;
  for (let n = 0; n < count; n++) {
    heights[n] = Math.min(1, Math.max(0, mesh.positions[3 * n + 1] / top));
    phases[n] = model.phase + STRAND_PHASE_STEP * model.cells[mesh.vertexCells[n]].strand;
  }
  return { ...mesh, rest: mesh.positions.slice(), heights, phases };
}

const offset: SwayOffset = { x: 0, z: 0 };

/**
 * Écrit dans `out` les positions de la plante au temps simulé `time` : chaque sommet est
 * déplacé de `plantSway` (repère du bac), ramené dans le repère local de la plante tournée
 * de `rotation` autour de Y (inverse de `decorToTank`). Y n'est pas modifié.
 */
export function applyPlantSway(
  data: PlantMeshData,
  amplitude: number,
  rotation: number,
  time: number,
  out: Float32Array,
): void {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const { rest, heights, phases } = data;
  for (let n = 0; n < heights.length; n++) {
    const p = 3 * n;
    plantSway(heights[n], time, phases[n], amplitude, offset);
    out[p] = rest[p] + c * offset.x - s * offset.z;
    out[p + 1] = rest[p + 1];
    out[p + 2] = rest[p + 2] + s * offset.x + c * offset.z;
  }
}
