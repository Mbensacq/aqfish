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
import { TROPICAL_TANK, type Environment } from '../sim/environment';
import { DEFAULT_TANK, SAND_THICKNESS, WATER_LEVEL_RATIO, type TankDimensions } from '../sim/tank';
import { PALETTE, type PaletteColorName } from './palette';
import { createStoneBorder } from './stone-border';

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
/**
 * Teintes d'entrée de l'eau et du sol de l'ambiance la nuit (issue #73, ADR 0021) : bleues
 * et saturées, car l'eau est translucide (30 % d'opacité) ; l'image affichée est ramenée aux
 * tons de nuit de la palette (`NIGHT_TONES`) par la passe.
 */
export const NIGHT_WATER_BODY = '#2050a8';
export const NIGHT_WATER_SURFACE = '#3a6eb0';
/** Couleur du sol de la lumière ambiante la nuit (faces tournées vers le bas, côtés du sable). */
export const NIGHT_GROUND = '#3c5a8c';
/** Dessous du sable la nuit (non éclairé : vue de dessous, ADR 0006). */
export const NIGHT_SAND_BOTTOM = '#3c5272';

/**
 * Couleur de la palette nommée `name` (teintes des environnements, `sim/environment.ts`).
 * @throws RangeError si le nom n'est pas celui d'une couleur de `PALETTE`.
 */
export function paletteColor(name: string): string {
  if (!Object.hasOwn(PALETTE, name)) {
    throw new RangeError(`couleur inconnue de la palette : ${name}`);
  }
  return PALETTE[name as PaletteColorName];
}

export interface AquariumScene {
  readonly scene: Scene;
  readonly dimensions: TankDimensions;
  /** Environnement représenté (`sim/environment.ts`). */
  readonly environment: Environment;
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
 * Construit la scène statique d'un environnement (`sim/environment.ts`, le bac tropical par
 * défaut) : sol, volume d'eau teinté, bordure (parois vitrées translucides avec arêtes
 * visibles, ou margelle de pierre), éclairage doux venant du haut.
 * Repère : Y vers le haut, origine au centre du fond du bac, unités en mètres.
 * @throws RangeError si une teinte de l'environnement n'est pas dans la palette.
 */
export function createAquariumScene(environment: Environment = TROPICAL_TANK): AquariumScene {
  const dims = environment.dimensions;
  const ground = {
    top: paletteColor(environment.ground.top),
    side: paletteColor(environment.ground.side),
    bottom: paletteColor(environment.ground.bottom),
  };
  const waterTint = {
    body: paletteColor(environment.water.body),
    surface: paletteColor(environment.water.surface),
  };
  const scene = new Scene();
  scene.background = new Color(PALETTE.fondScene);

  const lights = createLights(dims, ground.bottom);
  scene.add(lights.group);
  const sand = createSand(dims, ground);
  scene.add(sand);
  const water = createWater(dims, waterTint);
  scene.add(water);
  const stones = environment.border === 'pierre' ? createStoneBorder(dims) : null;
  if (stones) {
    scene.add(stones.object);
  } else {
    scene.add(...createGlass(dims));
  }

  const [body, , surface] = water.material as MeshBasicMaterial[];
  const sandBottom = (sand.material as MeshBasicMaterial[])[3];
  const waterColors = {
    dayBody: new Color(waterTint.body),
    nightBody: new Color(NIGHT_WATER_BODY),
    daySurface: new Color(waterTint.surface),
    nightSurface: new Color(NIGHT_WATER_SURFACE),
    dayGround: new Color(ground.bottom),
    nightGround: new Color(NIGHT_GROUND),
    daySandBottom: new Color(ground.bottom),
    nightSandBottom: new Color(NIGHT_SAND_BOTTOM),
  };

  return {
    scene,
    dimensions: dims,
    environment,
    setDaylight: (light) => {
      const day = light.intensity;
      lights.ambient.intensity = mix(NIGHT_AMBIENT_INTENSITY, DAY_AMBIENT_INTENSITY, day);
      setRgb(lights.ambient.color, light.sky);
      lights.ambient.groundColor.lerpColors(
        waterColors.dayGround,
        waterColors.nightGround,
        1 - day,
      );
      lights.sun.intensity = DAY_SUN_INTENSITY * mix(NIGHT_SUN_RATIO, 1, day);
      setRgb(lights.sun.color, light.tint);
      // `lerpColors(a, b, 0)` vaut exactement `a` : à midi, couleurs d'origine.
      body.color.lerpColors(waterColors.dayBody, waterColors.nightBody, 1 - day);
      surface.color.lerpColors(waterColors.daySurface, waterColors.nightSurface, 1 - day);
      sandBottom.color.lerpColors(waterColors.daySandBottom, waterColors.nightSandBottom, 1 - day);
      stones?.setDaylight(day);
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

function createLights(dims: TankDimensions, groundColor: string): Lights {
  const group = new Object3D();
  group.name = 'lumieres';
  // À midi, lumières neutres (blanches) pour ne pas altérer les teintes de la palette ; le
  // cycle jour/nuit les teinte ensuite (`setDaylight`).
  // Ambiance : ciel blanc, sol couleur du dessous du sol (les faces tournées vers le bas
  // restent lisibles).
  const ambient = new HemisphereLight('#ffffff', groundColor, DAY_AMBIENT_INTENSITY);
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
 * Sol (sable du bac, vase du bassin) : dalle opaque. Faces latérales et inférieure plus
 * sombres pour qu'on lise la coupe du substrat de côté et de dessous (voir ADR 0006).
 */
function createSand(
  dims: TankDimensions,
  colors: { readonly top: string; readonly side: string; readonly bottom: string },
): Mesh {
  const geometry = new BoxGeometry(dims.width, SAND_THICKNESS, dims.depth);
  const top = new MeshLambertMaterial({ color: colors.top });
  const side = new MeshLambertMaterial({ color: colors.side });
  const bottom = new MeshBasicMaterial({ color: colors.bottom });
  // Ordre des faces d'une BoxGeometry : +X, -X, +Y, -Y, +Z, -Z.
  const mesh = new Mesh(geometry, [side, side, top, bottom, side, side]);
  mesh.name = 'sable';
  mesh.position.y = SAND_THICKNESS / 2;
  return mesh;
}

/** Eau : volume translucide teinté entre le sable et la surface, surface plus claire. */
function createWater(
  dims: TankDimensions,
  colors: { readonly body: string; readonly surface: string },
): Mesh {
  const surfaceY = dims.height * WATER_LEVEL_RATIO;
  const waterHeight = Math.max(surfaceY - SAND_THICKNESS, 0.001);
  const geometry = new BoxGeometry(dims.width, waterHeight, dims.depth);
  const body = transparentBasic(colors.body, 0.3);
  const surface = transparentBasic(colors.surface, 0.5);
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
