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

import { bankDecorLayout } from '../sim/bank-decor';
import { mix, type DayLight, type Rgb } from '../sim/daylight';
import { environmentDataWater, TROPICAL_TANK, type Environment } from '../sim/environment';
import {
  DEFAULT_TANK,
  SAND_THICKNESS,
  WATER_LEVEL_RATIO,
  type Box3,
  type TankDimensions,
} from '../sim/tank';
import { createBankDecorObject } from './bank-decor-mesh';
import { INPUT_TONES, PALETTE, type PaletteColorName } from './palette';
import { cutawaySides } from './pond-cutaway';
import { createPondGround, pondGroundTop } from './pond-ground';
import { createPondShapeBank } from './pond-shape-bank';
import { createStoneBorder } from './stone-border';
import { createTerrainMesh } from './terrain-mesh';

// Géométrie du bac : définie dans sim/tank.ts (partagée avec les bornes de nage).
export { DEFAULT_TANK, SAND_THICKNESS, WATER_LEVEL_RATIO };

/** Épaisseur apparente du verre : le vitrage englobe légèrement l'eau et le sable. */
const GLASS_MARGIN = 0.008;

/**
 * Retrait de l'eau d'un environnement à berge (paludarium, ADR 0034) par rapport aux vitres :
 * les flancs du sol, collés à la vitre, passent devant les faces de l'eau au lieu de leur
 * disputer la profondeur. Bien moins d'un pixel de scène : invisible ailleurs.
 */
export const TERRAIN_WATER_INSET = 0.001;

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
 * Teintes d'entrée de l'eau et du sol de l'ambiance la nuit (issue #73, ADR 0021), tirées
 * des tons d'entrée de la palette (`INPUT_TONES`, issue #81).
 */
export const NIGHT_WATER_BODY = INPUT_TONES.eauNuitEntree;
export const NIGHT_WATER_SURFACE = INPUT_TONES.surfaceNuitEntree;
/**
 * Teintes d'entrée d'une eau trouble (issue #207, ADR 0053), mêlées à celles de l'eau de jour
 * dans les proportions `TURBID_BODY_MIX` et `TURBID_SURFACE_MIX` × trouble (`setTurbidity`).
 */
export const TURBID_WATER_BODY = INPUT_TONES.eauTroubleEntree;
export const TURBID_WATER_SURFACE = INPUT_TONES.surfaceTroubleEntree;
/**
 * Part de la teinte trouble dans le volume et la surface de l'eau de jour pour un trouble de
 * 1 : « légèrement » (volume vert sombre, surface encore claire après la passe palette).
 */
export const TURBID_BODY_MIX = 0.8;
export const TURBID_SURFACE_MIX = 0.8;
/**
 * Teintes d'entrée d'une eau teintée par les feuilles de catappa (issue #239, ADR 0071),
 * mêlées à celles de l'eau de jour dans les proportions `TEA_BODY_MIX` et `TEA_SURFACE_MIX`
 * × teinte (`setTea`), avant le trouble.
 */
export const TEA_WATER_BODY = INPUT_TONES.eauTheEntree;
export const TEA_WATER_SURFACE = INPUT_TONES.surfaceTheEntree;
/** Part de la teinte brun-thé pour une teinte de 1. */
export const TEA_BODY_MIX = 1;
export const TEA_SURFACE_MIX = 1;
/** Couleur du sol de la lumière ambiante la nuit (faces tournées vers le bas, côtés du sable). */
export const NIGHT_GROUND = INPUT_TONES.solNuitEntree;
/** Dessous du sable la nuit (non éclairé : vue de dessous, ADR 0006). */
export const NIGHT_SAND_BOTTOM = INPUT_TONES.dessousSableNuitEntree;

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
  /**
   * Trouble de l'eau (issue #207), dans [0, 1] : teinte l'eau vers un vert trouble, de jour
   * comme de nuit, en changeant seulement la couleur de ses matériaux (aucun passage de rendu
   * en plus). À 0 (valeur initiale), couleurs exactement inchangées.
   * @throws RangeError si `turbidity` n'est pas un réel dans [0, 1].
   */
  setTurbidity(turbidity: number): void;
  /** Trouble de l'eau appliqué (`setTurbidity`). */
  readonly turbidity: number;
  /**
   * Teinte brun-thé des feuilles de catappa (issue #239), dans [0, 1], appliquée sous le
   * trouble. À 0 (valeur initiale), couleurs exactement inchangées.
   * @throws RangeError si `tea` n'est pas un réel dans [0, 1].
   */
  setTea(tea: number): void;
  /** Teinte brun-thé appliquée (`setTea`). */
  readonly tea: number;
  /**
   * Place le point de vue (position de la caméra) : pour le bassin enterré, retire le sol et
   * la margelle du côté de la caméra quand elle passe sous le niveau du sol (vue en coupe,
   * `pond-cutaway.ts`, #105). Sans effet pour le bac tropical.
   */
  setViewpoint(x: number, y: number, z: number): void;
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
  const waterBox = environmentDataWater(environment);
  // Sol : dalle plate (bac, bassin) ou berge en colonnes (paludarium, #129).
  const terrain = environment.terrain
    ? createTerrainMesh(environment.terrain, waterBox, ground.bottom)
    : null;
  const sand = terrain ? null : createSand(dims, ground);
  scene.add(terrain ? terrain.mesh : (sand as Mesh));
  // Mousses et racines de la berge (#132) : aménagement fixe, comme le sol.
  if (environment.terrain && environment.bankDecor) {
    const layout = bankDecorLayout(environment.bankDecor, environment.terrain, waterBox);
    scene.add(createBankDecorObject(layout, environment.terrain, waterBox));
  }
  const water = createWater(terrain ? insetWater(waterBox) : waterBox, waterTint);
  scene.add(water);
  const pond = environment.border === 'pierre';
  // Bassin ovale ou haricot (#190) : berge et margelle courbe à la place de la margelle droite.
  const shape = pond ? environment.shape : undefined;
  const bank =
    shape !== undefined && shape !== 'rectangle' ? createPondShapeBank(dims, shape) : null;
  const stones = pond && bank === null ? createStoneBorder(dims) : null;
  // Bassin enterré (#105) : le sol l'entoure, seule une margelle basse dépasse.
  const pondGround = pond ? createPondGround(dims) : null;
  if (pondGround) {
    // Margelle (ou berge) puis sol : même ordre qu'avant #190 pour le bassin rectangulaire.
    scene.add((bank ?? stones ?? pondGround).object, pondGround.object);
  } else {
    scene.add(...createGlass(dims));
  }

  const [body, , surface] = water.material as MeshBasicMaterial[];
  const sandBottom = terrain ? terrain.bottom : (sand?.material as MeshBasicMaterial[])[3];
  const waterColors = {
    dayBody: new Color(waterTint.body),
    nightBody: new Color(NIGHT_WATER_BODY),
    daySurface: new Color(waterTint.surface),
    nightSurface: new Color(NIGHT_WATER_SURFACE),
    turbidBody: new Color(TURBID_WATER_BODY),
    turbidSurface: new Color(TURBID_WATER_SURFACE),
    teaBody: new Color(TEA_WATER_BODY),
    teaSurface: new Color(TEA_WATER_SURFACE),
    // Eau de jour après la teinte brun-thé (`setTea`) : égales aux teintes de jour à 0.
    tintedBody: new Color(waterTint.body),
    tintedSurface: new Color(waterTint.surface),
    // Eau de jour après le trouble (`setTurbidity`) : égales aux teintes de jour à 0.
    clearBody: new Color(waterTint.body),
    clearSurface: new Color(waterTint.surface),
    dayGround: new Color(ground.bottom),
    nightGround: new Color(NIGHT_GROUND),
    daySandBottom: new Color(ground.bottom),
    nightSandBottom: new Color(NIGHT_SAND_BOTTOM),
  };

  let day = 1;
  let turbidity = 0;
  let tea = 0;
  // Teinte brun-thé puis trouble ; `lerpColors(a, b, 0)` vaut exactement `a`.
  const mixWaterTints = (): void => {
    waterColors.tintedBody.lerpColors(waterColors.dayBody, waterColors.teaBody, TEA_BODY_MIX * tea);
    waterColors.tintedSurface.lerpColors(
      waterColors.daySurface,
      waterColors.teaSurface,
      TEA_SURFACE_MIX * tea,
    );
    waterColors.clearBody.lerpColors(
      waterColors.tintedBody,
      waterColors.turbidBody,
      TURBID_BODY_MIX * turbidity,
    );
    waterColors.clearSurface.lerpColors(
      waterColors.tintedSurface,
      waterColors.turbidSurface,
      TURBID_SURFACE_MIX * turbidity,
    );
  };
  // `lerpColors(a, b, 0)` vaut exactement `a` : à midi et sans trouble, couleurs d'origine.
  const applyWaterColors = (): void => {
    body.color.lerpColors(waterColors.clearBody, waterColors.nightBody, 1 - day);
    surface.color.lerpColors(waterColors.clearSurface, waterColors.nightSurface, 1 - day);
  };

  return {
    scene,
    dimensions: dims,
    environment,
    get turbidity() {
      return turbidity;
    },
    setTurbidity: (value) => {
      if (!(value >= 0 && value <= 1)) {
        throw new RangeError(`trouble de l'eau dans [0, 1] attendu (reçu : ${value})`);
      }
      turbidity = value;
      mixWaterTints();
      applyWaterColors();
    },
    get tea() {
      return tea;
    },
    setTea: (value) => {
      if (!(value >= 0 && value <= 1)) {
        throw new RangeError(`teinte brun-thé dans [0, 1] attendue (reçu : ${value})`);
      }
      tea = value;
      mixWaterTints();
      applyWaterColors();
    },
    setDaylight: (light) => {
      day = light.intensity;
      lights.ambient.intensity = mix(NIGHT_AMBIENT_INTENSITY, DAY_AMBIENT_INTENSITY, day);
      setRgb(lights.ambient.color, light.sky);
      lights.ambient.groundColor.lerpColors(
        waterColors.dayGround,
        waterColors.nightGround,
        1 - day,
      );
      lights.sun.intensity = DAY_SUN_INTENSITY * mix(NIGHT_SUN_RATIO, 1, day);
      setRgb(lights.sun.color, light.tint);
      applyWaterColors();
      sandBottom.color.lerpColors(waterColors.daySandBottom, waterColors.nightSandBottom, 1 - day);
      stones?.setDaylight(day);
      bank?.setDaylight(day);
      pondGround?.setDaylight(day);
    },
    setViewpoint: (x, y, z) => {
      if (pondGround) {
        const hidden = cutawaySides([x, y, z], dims, pondGroundTop(dims));
        stones?.setHiddenSides(hidden);
        bank?.setCutaway(hidden.size > 0);
        pondGround.setHiddenSides(hidden);
      }
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
  const ambient = new HemisphereLight(
    INPUT_TONES.lumiereBlanche,
    groundColor,
    DAY_AMBIENT_INTENSITY,
  );
  ambient.name = 'lumiere-ambiante';
  group.add(ambient);
  // Lumière principale venant du haut, légèrement de face.
  const sun = new DirectionalLight(INPUT_TONES.lumiereBlanche, DAY_SUN_INTENSITY);
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

/** Volume d'eau rentré de `TERRAIN_WATER_INSET` sur ses côtés (pas en hauteur). */
function insetWater(water: Box3): Box3 {
  return {
    ...water,
    minX: water.minX + TERRAIN_WATER_INSET,
    maxX: water.maxX - TERRAIN_WATER_INSET,
    minZ: water.minZ + TERRAIN_WATER_INSET,
    maxZ: water.maxZ - TERRAIN_WATER_INSET,
  };
}

/** Eau : volume translucide teinté entre le sable et la surface, surface plus claire. */
function createWater(
  water: Box3,
  colors: { readonly body: string; readonly surface: string },
): Mesh {
  const waterHeight = Math.max(water.maxY - water.minY, 0.001);
  const geometry = new BoxGeometry(water.maxX - water.minX, waterHeight, water.maxZ - water.minZ);
  const body = transparentBasic(colors.body, 0.3);
  const surface = transparentBasic(colors.surface, 0.5);
  const mesh = new Mesh(geometry, [body, body, surface, body, body, body]);
  mesh.name = 'eau';
  mesh.position.set(
    (water.minX + water.maxX) / 2,
    water.minY + waterHeight / 2,
    (water.minZ + water.maxZ) / 2,
  );
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
