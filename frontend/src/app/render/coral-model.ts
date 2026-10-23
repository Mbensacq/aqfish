import type { CoralCell, CoralForm, CoralHue, CoralModel } from '../sim/corals';
import { ENVIRONMENT_TONES, PALETTE } from './palette';
import { buildVoxelMesh, cellHash, type VoxelMeshData } from './rock-model';

/**
 * Maillage voxel d'une colonie de corail (`sim/corals.ts`, ADR 0040). Couleurs plates, comme
 * les rochers et les poissons (ADR 0009) : chaque teinte a une couleur de flanc et une
 * couleur claire pour les dessus et les bouts des branches. Le violet, absent de la palette
 * commune, est un ton du récif (`ENVIRONMENT_TONES`, ADR 0039).
 */
export const CORAL_COLORS: Readonly<
  Record<CoralHue, { readonly side: string; readonly top: string }>
> = {
  rose: { side: PALETTE.nenupharRose, top: PALETTE.axolotlRose },
  orange: { side: PALETTE.tritonOrange, top: PALETTE.koiOrange },
  violet: { side: ENVIRONMENT_TONES.corailViolet, top: ENVIRONMENT_TONES.corailVioletClair },
  jaune: { side: PALETTE.koiOr, top: PALETTE.poissonJaune },
};

/** Part des dessus d'un dôme laissés en couleur de flanc (polypes), par hachage du voxel. */
export const CORAL_TOP_SPECKLE = 0.25;

/**
 * Couleur (`#rrggbb`) d'une face d'un voxel de corail de la forme `form` (modèle `model`) :
 * flancs foncés, dessus clairs ; bouts des branches clairs ; dessus d'un dôme semé de polypes
 * foncés ; rebord d'une table foncé, qui cerne de dessus son plateau clair et uni.
 */
export function coralFaceColor(
  form: CoralForm,
  hue: CoralHue,
  model: CoralModel,
  seed: number,
  cell: CoralCell,
  up: boolean,
): string {
  const colors = CORAL_COLORS[hue];
  if (cell.tip) {
    return colors.top;
  }
  if (!up) {
    return colors.side;
  }
  if (form === 'table') {
    return cell.j === model.maxJ - 1 ? colors.side : colors.top;
  }
  if (form === 'dome') {
    return cellHash(seed, cell.i, cell.j, cell.k) < CORAL_TOP_SPECKLE ? colors.side : colors.top;
  }
  return colors.top;
}

/**
 * Maillage d'une colonie dans son repère local (mètres, Y = 0 à la base) ; `seed` choisit
 * les polypes des dômes (même graine, même colonie).
 */
export function buildCoralMesh(
  form: CoralForm,
  model: CoralModel,
  hue: CoralHue,
  seed: number,
): VoxelMeshData {
  return buildVoxelMesh(model.cells, model.voxelSize, (cell, up) =>
    coralFaceColor(form, hue, model, seed, cell, up),
  );
}
