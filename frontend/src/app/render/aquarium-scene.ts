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
  SRGBColorSpace,
} from 'three';

import { mix, type DayLight, type Rgb } from '../sim/daylight';
import { DEFAULT_TANK, SAND_THICKNESS, WATER_LEVEL_RATIO, type TankDimensions } from '../sim/tank';
import { PALETTE } from './palette';

// Géométrie du bac : définie dans sim/tank.ts (partagée avec les bornes de nage).
export { DEFAULT_TANK, SAND_THICKNESS, WATER_LEVEL_RATIO };

/** Épaisseur apparente du verre : le vitrage englobe légèrement l'eau et le sable. */
const GLASS_MARGIN = 0.008;

/** Ordre de rendu des objets transparents (après les opaques, du plus profond au plus proche). */
const RENDER_ORDER = { water: 1, glass: 2, edges: 3 } as const;

/** Intensités de l'éclairage en plein jour (midi) : celles d'avant le cycle jour/nuit. */
export const DAY_AMBIENT_INTENSITY = 2;
export const DAY_SUN_INTENSITY = 1.2;
/**
 * Lumière ambiante la nuit (clair de lune) : assez pour que le sable, les rochers et les
 * plantes restent lisibles (critère « la nuit, le bac reste lisible », issue #51).
 */
export const NIGHT_AMBIENT_INTENSITY = 1.1;
/** Lumière directe la nuit (lune), relative à celle de midi. */
export const NIGHT_SUN_RATIO = 0.2;

/**
 * Teintes de l'eau la nuit : couleurs de la palette vers lesquelles l'eau glisse quand
 * l'intensité du jour baisse (l'eau n'est pas éclairée : `MeshBasicMaterial`).
 */
const NIGHT_WATER_BODY = PALETTE.eauProfonde;
const NIGHT_WATER_SURFACE = PALETTE.eauSombre;

export interface AquariumScene {
  readonly scene: Scene;
  readonly dimensions: TankDimensions;
  /**
   * Applique la lumière du jour (`sim/daylight.ts`, ADR 0018) : intensité et teinte des
   * lumières, teinte de l'eau. À midi (`lightAt(12)`), la scène est exactement celle d'avant
   * le cycle jour/nuit (captures par défaut inchangées).
   */
  setDaylight(light: DayLight): void;
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

  const lights = createLights(dims);
  scene.add(lights.group);
  scene.add(createSand(dims));
  const water = createWater(dims);
  scene.add(water);
  scene.add(...createGlass(dims));

  const [body, , surface] = water.material as MeshBasicMaterial[];
  const waterColors = {
    dayBody: new Color(PALETTE.eauMoyenne),
    nightBody: new Color(NIGHT_WATER_BODY),
    daySurface: new Color(PALETTE.eauClaire),
    nightSurface: new Color(NIGHT_WATER_SURFACE),
  };

  return {
    scene,
    dimensions: dims,
    setDaylight: (light) => {
      const day = light.intensity;
      lights.ambient.intensity = mix(NIGHT_AMBIENT_INTENSITY, DAY_AMBIENT_INTENSITY, day);
      setRgb(lights.ambient.color, light.sky);
      lights.sun.intensity = DAY_SUN_INTENSITY * mix(NIGHT_SUN_RATIO, 1, day);
      setRgb(lights.sun.color, light.tint);
      // `lerpColors(a, b, 0)` vaut exactement `a` : à midi, couleurs d'origine.
      body.color.lerpColors(waterColors.dayBody, waterColors.nightBody, 1 - day);
      surface.color.lerpColors(waterColors.daySurface, waterColors.nightSurface, 1 - day);
    },
    dispose: () => disposeObject(scene),
  };
}

function setRgb(color: Color, rgb: Rgb): void {
  color.setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
}

interface Lights {
  readonly group: Object3D;
  readonly ambient: HemisphereLight;
  readonly sun: DirectionalLight;
}

function createLights(dims: TankDimensions): Lights {
  const group = new Object3D();
  group.name = 'lumieres';
  // À midi, lumières neutres (blanches) pour ne pas altérer les teintes de la palette ; le
  // cycle jour/nuit les teinte ensuite (`setDaylight`).
  // Ambiance : ciel blanc, sol couleur sable (les faces tournées vers le bas restent lisibles).
  const ambient = new HemisphereLight('#ffffff', PALETTE.sableSombre, DAY_AMBIENT_INTENSITY);
  ambient.name = 'lumiere-ambiante';
  group.add(ambient);
  // Lumière principale venant du haut, légèrement de face.
  const sun = new DirectionalLight('#ffffff', DAY_SUN_INTENSITY);
  sun.name = 'soleil';
  sun.position.set(dims.width * 0.2, dims.height * 4, dims.depth * 1.5);
  group.add(sun);
  return { group, ambient, sun };
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
