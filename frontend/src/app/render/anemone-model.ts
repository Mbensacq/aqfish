import {
  TENTACLE_PHASE_STEP,
  tentacleHeight,
  type AnemoneCell,
  type AnemoneModel,
} from '../sim/anemones';
import { PALETTE } from './palette';
import type { PlantMeshData } from './plant-model';
import { buildVoxelMesh } from './rock-model';

/**
 * Maillage voxel d'une anémone (`sim/anemones.ts`, ADR 0041) et de quoi onduler ses
 * tentacules avec l'ondulation des plantes (`applyPlantSway`, ADR 0016).
 *
 * Couleurs plates de la palette commune (ADR 0009) : pied `sableSombre` (ocre, comme le pied
 * d'une anémone à bulles), tentacules `koiRouge`, bouts renflés `poissonRose`. Aucun rouge
 * parmi les coraux (`render/coral-model.ts`) : l'anémone s'en distingue, et l'orange des
 * poissons-clowns (`clownOrange`) tranche sur elle.
 */
export const ANEMONE_COLORS = {
  column: PALETTE.sableSombre,
  tentacle: PALETTE.koiRouge,
  tip: PALETTE.poissonRose,
} as const;

/** Couleur (`#rrggbb`) d'une face d'un voxel d'anémone. */
export function anemoneFaceColor(cell: AnemoneCell): string {
  if (cell.part === 'column') {
    return ANEMONE_COLORS.column;
  }
  return cell.tip ? ANEMONE_COLORS.tip : ANEMONE_COLORS.tentacle;
}

/**
 * Maillage d'une anémone dans son repère local (mètres, Y = 0 à la base, axe du pied en
 * X = Z = 0). Hauteur relative de l'ondulation par sommet (`tentacleHeight`) : nulle sur tout
 * le pied, qui reste immobile ; phase propre à chaque tentacule.
 */
export function buildAnemoneMesh(model: AnemoneModel): PlantMeshData {
  const mesh = buildVoxelMesh(model.cells, model.voxelSize, (cell) => anemoneFaceColor(cell));
  const count = mesh.positions.length / 3;
  const heights = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let n = 0; n < count; n++) {
    const cell = model.cells[mesh.vertexCells[n]];
    heights[n] = cell.part === 'column' ? 0 : tentacleHeight(model, mesh.positions[3 * n + 1]);
    phases[n] = model.phase + TENTACLE_PHASE_STEP * cell.strand;
  }
  return { ...mesh, rest: mesh.positions.slice(), heights, phases };
}
