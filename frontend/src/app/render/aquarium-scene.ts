import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  FrontSide,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Scene,
} from 'three';

import type { TankDimensions } from './camera-presets';
import { PALETTE } from './palette';

/** Bac par défaut : 120 × 60 × 50 cm, un format courant de bac d'eau douce. */
export const DEFAULT_TANK: TankDimensions = { width: 1.2, height: 0.6, depth: 0.5 };

/** Épaisseur de la couche de sable, en mètres. */
export const SAND_THICKNESS = 0.06;

/** Niveau de l'eau, en fraction de la hauteur du bac. */
export const WATER_LEVEL_RATIO = 0.9;

/** Épaisseur apparente du verre : le vitrage englobe légèrement l'eau et le sable. */
const GLASS_MARGIN = 0.008;

/** Ordre de rendu des objets transparents (après les opaques, du plus profond au plus proche). */
const RENDER_ORDER = { water: 1, glass: 2, edges: 3 } as const;

export interface AquariumScene {
  readonly scene: Scene;
  readonly dimensions: TankDimensions;
  /** Libère toutes les géométries et tous les matériaux de la scène. */
  dispose(): void;
}

/**
 * Construit la scène statique du bac : fond de sable, volume d'eau teinté, parois vitrées
 * translucides avec arêtes visibles, éclairage doux venant du haut.
 * Repère : Y vers le haut, origine au centre du fond du bac, unités en mètres.
 */
export function createAquariumScene(dims: TankDimensions = DEFAULT_TANK): AquariumScene {
  const scene = new Scene();
  scene.background = new Color(PALETTE.fondScene);

  scene.add(createLights(dims));
  scene.add(createSand(dims));
  scene.add(createWater(dims));
  scene.add(...createGlass(dims));

  return {
    scene,
    dimensions: dims,
    dispose: () => disposeObject(scene),
  };
}

function createLights(dims: TankDimensions): Object3D {
  const group = new Object3D();
  group.name = 'lumieres';
  // Lumières neutres (blanches) pour ne pas altérer les teintes de la palette.
  // Ambiance : ciel blanc, sol couleur sable (les faces tournées vers le bas restent lisibles).
  group.add(new HemisphereLight('#ffffff', PALETTE.sableSombre, 2));
  // Lumière principale venant du haut, légèrement de face.
  const sun = new DirectionalLight('#ffffff', 1.2);
  sun.position.set(dims.width * 0.2, dims.height * 4, dims.depth * 1.5);
  group.add(sun);
  return group;
}

/**
 * Sable : dalle opaque. Faces latérales et inférieure plus sombres pour qu'on lise la
 * coupe du substrat de côté et de dessous (voir ADR 0006).
 */
function createSand(dims: TankDimensions): Mesh {
  const geometry = new BoxGeometry(dims.width, SAND_THICKNESS, dims.depth);
  const top = new MeshLambertMaterial({ color: PALETTE.sableClair });
  const side = new MeshLambertMaterial({ color: PALETTE.sable });
  const bottom = new MeshBasicMaterial({ color: PALETTE.sableSombre });
  // Ordre des faces d'une BoxGeometry : +X, -X, +Y, -Y, +Z, -Z.
  const mesh = new Mesh(geometry, [side, side, top, bottom, side, side]);
  mesh.name = 'sable';
  mesh.position.y = SAND_THICKNESS / 2;
  return mesh;
}

/** Eau : volume translucide teinté entre le sable et la surface, surface plus claire. */
function createWater(dims: TankDimensions): Mesh {
  const surfaceY = dims.height * WATER_LEVEL_RATIO;
  const waterHeight = Math.max(surfaceY - SAND_THICKNESS, 0.001);
  const geometry = new BoxGeometry(dims.width, waterHeight, dims.depth);
  const body = transparentBasic(PALETTE.eauMoyenne, 0.3);
  const surface = transparentBasic(PALETTE.eauClaire, 0.5);
  const mesh = new Mesh(geometry, [body, body, surface, body, body, body]);
  mesh.name = 'eau';
  mesh.position.y = SAND_THICKNESS + waterHeight / 2;
  mesh.renderOrder = RENDER_ORDER.water;
  return mesh;
}

/** Verre : parois à peine teintées et arêtes claires, légèrement en dehors de l'eau. */
function createGlass(dims: TankDimensions): Object3D[] {
  const geometry = new BoxGeometry(
    dims.width + GLASS_MARGIN,
    dims.height + GLASS_MARGIN,
    dims.depth + GLASS_MARGIN,
  );
  const panes = new Mesh(geometry, transparentBasic(PALETTE.eauTresClaire, 0.08));
  panes.name = 'verre';
  panes.position.y = dims.height / 2;
  panes.renderOrder = RENDER_ORDER.glass;

  const edges = new LineSegments(
    new EdgesGeometry(geometry),
    new LineBasicMaterial({ color: PALETTE.eauTresClaire, transparent: true, opacity: 0.9 }),
  );
  edges.name = 'aretes';
  edges.position.y = dims.height / 2;
  edges.renderOrder = RENDER_ORDER.edges;
  return [panes, edges];
}

function transparentBasic(color: string, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    // Les surfaces translucides n'écrivent pas la profondeur : pas d'occlusion entre elles.
    depthWrite: false,
    side: FrontSide,
  });
}

/** Libère récursivement géométries et matériaux (une ressource partagée n'est libérée qu'une fois). */
export function disposeObject(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (object instanceof Mesh || object instanceof LineSegments) {
      geometries.add(object.geometry as BufferGeometry);
      const material = object.material as Material | Material[];
      for (const m of Array.isArray(material) ? material : [material]) {
        materials.add(m);
      }
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
