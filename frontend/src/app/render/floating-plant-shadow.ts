import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial } from 'three';

import type { DecorItem } from '../sim/decor';
import { FLOATING_LEAF_ROW, plantModel, type PlantModel } from '../sim/plant';
import { SAND_THICKNESS } from '../sim/tank';
import { PALETTE } from './palette';

/**
 * Ombre d'une plante flottante sur le fond (issue #824), comme celle des nénuphars
 * (`render/lily-pad-layer.ts`) : un carré plat par colonne de feuilles du radeau, dans la
 * couleur de l'eau profonde, posé juste au-dessus du sable et décalé à l'opposé du soleil.
 * Elle reste en pixels : chaque carré a l'arête d'un voxel de la plante.
 */

/** Hauteur de l'ombre au-dessus du sable, en mètres (évite le conflit de profondeur). */
export const FLOATING_SHADOW_LIFT = 0.003;

/** Décalage de l'ombre sur le fond, repère du bac (mètres) : celui des nénuphars. */
export const FLOATING_SHADOW_OFFSET = { x: -0.009, z: -0.044 } as const;

/** Couleur de l'ombre : l'eau, plus sombre sous le radeau. */
export const FLOATING_SHADOW_COLOR = PALETTE.eauProfonde;

/** Ordre de rendu de l'ombre : après le volume d'eau (1), comme l'ombre des nénuphars. */
export const FLOATING_SHADOW_RENDER_ORDER = 1.2;

/** Matériau partagé des ombres des plantes flottantes d'une couche. */
export function createFloatingShadowMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: FLOATING_SHADOW_COLOR,
    side: DoubleSide,
    depthWrite: false,
  });
}

/**
 * Géométrie de l'ombre du radeau `model`, dans son repère local (Y = 0) : deux triangles
 * tournés vers le haut par voxel de la rangée des feuilles (`FLOATING_LEAF_ROW`).
 */
export function floatingPlantShadowGeometry(model: PlantModel): BufferGeometry {
  const v = model.voxelSize;
  const leaves = model.cells.filter((c) => c.j === FLOATING_LEAF_ROW);
  const positions = new Float32Array(leaves.length * 18);
  leaves.forEach((c, n) => {
    const x0 = c.i * v;
    const x1 = x0 + v;
    const z0 = c.k * v;
    const z1 = z0 + v;
    positions.set([x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0], n * 18);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}

/**
 * Ombre de la plante flottante `item` (élément `n` du décor), placée sur le fond sous son
 * radeau, même rotation ; sa géométrie est à libérer par l'appelant.
 */
export function createFloatingPlantShadow(
  item: DecorItem,
  n: number,
  material: MeshBasicMaterial,
): Mesh {
  const geometry = floatingPlantShadowGeometry(plantModel(item.seed, item.scale, 'floating'));
  const shadow = new Mesh(geometry, material);
  shadow.name = `plante-${n}-ombre`;
  shadow.renderOrder = FLOATING_SHADOW_RENDER_ORDER;
  shadow.position.set(
    item.x + FLOATING_SHADOW_OFFSET.x,
    SAND_THICKNESS + FLOATING_SHADOW_LIFT,
    item.z + FLOATING_SHADOW_OFFSET.z,
  );
  shadow.rotation.y = item.rotation;
  return shadow;
}
