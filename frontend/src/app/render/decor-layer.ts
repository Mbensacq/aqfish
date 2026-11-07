import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Raycaster,
  ShaderMaterial,
  Vector2,
} from 'three';

import { anemoneBaseY, anemoneModel, type Anemone } from '../sim/anemones';
import { coralBaseY, coralModel, type CoralColony } from '../sim/corals';
import {
  decorElevation,
  plantBaseY,
  rockBaseY,
  rockModel,
  woodBaseY,
  type DecorItem,
} from '../sim/decor';
import { plantModel, type PlantForm } from '../sim/plant';
import { isGrowingPlant } from '../sim/plant-growth';
import { woodModel } from '../sim/wood';
import { buildAnemoneMesh } from './anemone-model';
import { buildCoralMesh } from './coral-model';
import { FISH_RENDER_ORDER } from './fish-layer';
import { PALETTE } from './palette';
import {
  applyPlantSway,
  buildPlantMesh,
  cachedPlantMesh,
  paddedPlantMesh,
  plantVertexCapacity,
  writePlantMesh,
  type PlantMeshData,
} from './plant-model';
import {
  buildRockMesh,
  createOutlineGeometry,
  createRockGeometry,
  type VoxelMeshData,
} from './rock-model';
import { buildWoodMesh } from './wood-model';

/**
 * Couleur du contour du décor (docs/DA.md, règle 4) : la couleur la plus sombre de la
 * palette après le fond de la scène.
 */
export const OUTLINE_COLOR = PALETTE.koiNoir;

/** Épaisseur du contour, en pixels de la cible de rendu (un pixel de scène en pixel art). */
export const OUTLINE_WIDTH_PX = 1;

/**
 * Contour de l'élément sélectionné dans l'éditeur de décor (#167) : clair, la couleur du texte
 * de l'interface, et deux fois plus épais que le contour ordinaire, pour se lire à l'échelle
 * normale sur le sable comme sur l'eau.
 */
export const SELECTION_COLOR = PALETTE.texteInterface;
export const SELECTION_WIDTH_PX = 2;

/**
 * Ordre de rendu du décor : dans la file des transparents (opacité pleine), après l'eau et
 * le verre, juste avant les poissons. Comme les poissons (ADR 0009), les rochers gardent
 * ainsi les couleurs exactes de la palette, sans teinte d'eau.
 */
export const DECOR_RENDER_ORDER = FISH_RENDER_ORDER - 0.1;

const OUTLINE_VERTEX = /* glsl */ `
uniform vec2 uResolution;
uniform float uWidth;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec3 viewNormal = normalize(normalMatrix * normal);
  vec2 dir = (projectionMatrix * vec4(viewNormal, 0.0)).xy;
  float len = length(dir);
  if (len > 1e-6) {
    // Décalage constant en pixels de la cible : 2 / résolution par pixel en coordonnées
    // normalisées, multiplié par w pour annuler la division perspective.
    clip.xy += dir / len * uWidth * 2.0 / uResolution * clip.w;
  }
  gl_Position = clip;
}
`;

const OUTLINE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Coque de contour (« inverted hull ») : faces arrière du modèle, gonflées d'un pixel de la
 * cible le long des normales lissées projetées à l'écran. Seul le liseré qui dépasse de la
 * silhouette reste visible, d'un pixel quel que soit le zoom ; l'eau, qui n'a pas de coque,
 * n'a jamais de contour.
 */
export function createOutlineMaterial(
  color: string = OUTLINE_COLOR,
  width: number = OUTLINE_WIDTH_PX,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uResolution: { value: new Vector2(1, 1) },
      uWidth: { value: width },
      uColor: { value: new Color(color) },
    },
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: BackSide,
    transparent: true,
  });
}

/** Plante affichée : ses données d'ondulation et l'attribut de positions partagé. */
interface SwayingPlant {
  data: PlantMeshData;
  amplitude: number;
  readonly rotation: number;
  position: BufferAttribute;
}

/** Plante du décor (`World.decor`) dont la hauteur suit la pousse (issue #477). */
interface GrowingPlant {
  readonly sway: SwayingPlant;
  readonly item: DecorItem;
  /** Pousse affichée, en voxels entiers. */
  growth: number;
  /** Tableaux rendus, à la taille prévue pour la pousse (`paddedPlantMesh`). */
  buffers: PlantMeshData;
}

/**
 * Couche du décor : un maillage voxel et une coque de contour par élément de `World.decor`,
 * placés selon ses données (même transformation que `decorToTank` côté simulation), puis par
 * colonie de corail (`sim/corals.ts`). Les plantes ondulent (`update`) : leur maillage et leur
 * coque partagent un même attribut de positions, réécrit en place à chaque image.
 */
export class DecorLayer {
  readonly object = new Group();
  private readonly material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
  });
  private readonly outlineMaterial = createOutlineMaterial();
  /** Contour de l'élément sélectionné (`setSelected`). */
  private readonly selectionMaterial = createOutlineMaterial(SELECTION_COLOR, SELECTION_WIDTH_PX);
  private geometries: BufferGeometry[] = [];
  /** Maillage voxel et coque de chaque élément de `World.decor`, dans l'ordre (sélection). */
  private items: { readonly voxels: Mesh; readonly hull: Mesh }[] = [];
  private selected: number | null = null;
  private plants: SwayingPlant[] = [];
  /** Plante de chaque élément de `World.decor` (`undefined` pour un rocher ou un bois). */
  private growing: (GrowingPlant | undefined)[] = [];
  /** Temps et facteur de la dernière ondulation (`update`), repris après un changement de pousse. */
  private swayTime = 0;
  private swayScale = 1;
  private corals = 0;
  private anemones = 0;

  constructor() {
    this.object.name = 'decor';
  }

  /**
   * Remplace le décor affiché : éléments `items`, puis colonies de corail `corals`, puis
   * anémones `anemones` (dont les tentacules ondulent comme les plantes).
   */
  setDecor(
    items: readonly DecorItem[],
    corals: readonly CoralColony[] = [],
    anemones: readonly Anemone[] = [],
  ): void {
    this.clear();
    items.forEach((item, n) => {
      let data: VoxelMeshData;
      let baseY: number;
      let name: string;
      let sway: SwayingPlant | undefined;
      if (item.kind === 'plant') {
        const model = plantModel(item.seed, item.scale, item.form as PlantForm);
        const plant = buildPlantMesh(model, item.seed);
        // Plante à tige (#477) : tampons prévus pour sa pousse, dessinés sur ses seuls sommets.
        data = isGrowingPlant(item)
          ? paddedPlantMesh(plant, plantVertexCapacity(item.seed, item.scale, 'tall'))
          : plant;
        baseY = plantBaseY(model.voxelSize);
        name = `plante-${n}`;
        sway = {
          data: plant,
          amplitude: model.amplitude,
          rotation: item.rotation,
          position: new BufferAttribute(data.positions, 3),
        };
        this.plants.push(sway);
      } else if (item.kind === 'wood') {
        const model = woodModel(item.seed, item.scale);
        data = buildWoodMesh(model, item.seed);
        baseY = woodBaseY(model.voxelSize);
        name = `bois-${n}`;
      } else {
        const model = rockModel(item.seed, item.scale);
        data = buildRockMesh(model, item.seed);
        baseY = rockBaseY(model.voxelSize);
        name = `rocher-${n}`;
      }
      const geometry = createRockGeometry(data);
      const outline = createOutlineGeometry(data);
      if (sway) {
        sway.position.setUsage(DynamicDrawUsage);
        geometry.setAttribute('position', sway.position);
        outline.setAttribute('position', sway.position);
      }
      this.geometries.push(geometry, outline);
      const group = new Group();
      group.name = name;
      group.position.set(item.x, baseY + decorElevation(item), item.z);
      group.rotation.y = item.rotation;
      const mesh = new Mesh(geometry, this.material);
      mesh.name = `${name}-voxels`;
      const hull = new Mesh(outline, this.outlineMaterial);
      hull.name = `${name}-contour`;
      for (const m of [hull, mesh]) {
        m.renderOrder = DECOR_RENDER_ORDER;
        // Une plante qui ondule sort de sa sphère englobante au repos.
        m.frustumCulled = sway === undefined;
        group.add(m);
      }
      this.object.add(group);
      this.items.push({ voxels: mesh, hull });
      if (sway && data !== sway.data) {
        const count = sway.data.heights.length;
        geometry.setDrawRange(0, count);
        outline.setDrawRange(0, count);
      }
      this.growing.push(
        sway && data !== sway.data
          ? { sway, item, growth: 0, buffers: data as PlantMeshData }
          : undefined,
      );
    });
    corals.forEach((colony, n) => {
      const model = coralModel(colony.form, colony.seed, colony.scale);
      const data = buildCoralMesh(colony.form, model, colony.hue, colony.seed);
      const group = this.addVoxelGroup(`corail-${n}`, data);
      group.position.set(colony.x, coralBaseY(model.voxelSize), colony.z);
      group.rotation.y = (colony.quarterTurns * Math.PI) / 2;
    });
    this.corals = corals.length;
    anemones.forEach((anemone, n) => {
      const model = anemoneModel(anemone.seed, anemone.scale);
      const data = buildAnemoneMesh(model);
      const sway: SwayingPlant = {
        data,
        amplitude: model.amplitude,
        rotation: 0,
        position: new BufferAttribute(data.positions, 3),
      };
      this.plants.push(sway);
      const group = this.addVoxelGroup(`anemone-${n}`, data, sway.position);
      group.position.set(anemone.x, anemoneBaseY(model.voxelSize), anemone.z);
    });
    this.anemones = anemones.length;
  }

  /**
   * Groupe d'un maillage voxel et de sa coque de contour, ajouté à la couche ; immobile, ou,
   * avec `position`, attribut de positions partagé réécrit à chaque image (ondulation).
   */
  private addVoxelGroup(name: string, data: VoxelMeshData, position?: BufferAttribute): Group {
    const geometry = createRockGeometry(data);
    const outline = createOutlineGeometry(data);
    if (position) {
      position.setUsage(DynamicDrawUsage);
      geometry.setAttribute('position', position);
      outline.setAttribute('position', position);
    }
    this.geometries.push(geometry, outline);
    const group = new Group();
    group.name = name;
    const mesh = new Mesh(geometry, this.material);
    mesh.name = `${name}-voxels`;
    const hull = new Mesh(outline, this.outlineMaterial);
    hull.name = `${name}-contour`;
    for (const m of [hull, mesh]) {
      m.renderOrder = DECOR_RENDER_ORDER;
      // Un maillage qui ondule sort de sa sphère englobante au repos.
      m.frustumCulled = position === undefined;
      group.add(m);
    }
    this.object.add(group);
    return group;
  }

  /**
   * Sélectionne l'élément d'indice `index` de `World.decor` (contour clair et épais,
   * `SELECTION_COLOR`), ou aucun avec `null` ou un indice inexistant.
   */
  setSelected(index: number | null): void {
    if (this.selected !== null) {
      this.items[this.selected].hull.material = this.outlineMaterial;
    }
    this.selected = index !== null && index >= 0 && index < this.items.length ? index : null;
    if (this.selected !== null) {
      this.items[this.selected].hull.material = this.selectionMaterial;
    }
  }

  /**
   * Place l'élément d'indice `index` en (`x`, `z`) sans reconstruire son maillage (aperçu du
   * glissement, #168) ; sans effet pour un indice inexistant.
   */
  moveItem(index: number, x: number, z: number): void {
    const group = this.items[index]?.voxels.parent;
    if (group) {
      group.position.x = x;
      group.position.z = z;
    }
  }

  /**
   * Place l'élément d'indice `index` à la base (`x`, `y`, `z`), repère du bac, sans toucher
   * au monde : image de la chute de l'éditeur (ADR 0046).
   */
  placeItem(index: number, x: number, y: number, z: number): void {
    this.items[index]?.voxels.parent?.position.set(x, y, z);
  }

  /** Position (x, z) affichée de l'élément d'indice `index`, `null` s'il n'existe pas. */
  itemPosition(index: number): { x: number; z: number } | null {
    const group = this.items[index]?.voxels.parent;
    return group ? { x: group.position.x, z: group.position.z } : null;
  }

  /** Indice de l'élément sélectionné, `null` sinon (tests). */
  get selectedIndex(): number | null {
    return this.selected;
  }

  /**
   * Indice dans `World.decor` de l'élément le plus proche touché par le rayon `raycaster`
   * (maillages voxels, coraux et anémones exclus), `null` si aucun ou si le décor est masqué.
   */
  pickItem(raycaster: Raycaster): number | null {
    if (!this.object.visible || this.items.length === 0) {
      return null;
    }
    const voxels = this.items.map((item) => item.voxels);
    // Positions des plantes réécrites à chaque image : boîtes englobantes à recalculer.
    for (const mesh of voxels) {
      mesh.geometry.boundingSphere = null;
      mesh.geometry.boundingBox = null;
    }
    this.object.updateMatrixWorld();
    const hit = raycaster.intersectObjects(voxels, false)[0];
    return hit ? voxels.indexOf(hit.object as Mesh) : null;
  }

  /**
   * Pousse affichée de la plante d'indice `index` de `World.decor` (issue #477), en voxels
   * entiers : son maillage est remplacé par celui de cette hauteur (`cachedPlantMesh`, un
   * maillage par palier) seulement si la pousse change ; sinon rien n'est alloué. Renvoie vrai
   * si le maillage a changé. Sans effet pour un autre élément ou une pousse invalide.
   */
  setPlantGrowth(index: number, growth: number): boolean {
    const plant = this.growing[index];
    if (!plant || plant.growth === growth || !Number.isInteger(growth) || growth < 0) {
      return false;
    }
    const { item, sway } = plant;
    const { model, mesh } = cachedPlantMesh(item.seed, item.scale, item.form as PlantForm, growth);
    const { voxels, hull } = this.items[index];
    if (writePlantMesh(mesh, plant.buffers)) {
      // Mêmes tampons, réécrits en place : aucun objet WebGL créé ni détruit.
      for (const name of ['position', 'normal', 'color'] as const) {
        voxels.geometry.getAttribute(name).needsUpdate = true;
      }
      hull.geometry.getAttribute('normal').needsUpdate = true;
    } else {
      // Au-delà de la pousse prévue (`PLANT_GROWTH_HEADROOM`) : nouveaux tampons.
      const buffers = paddedPlantMesh(mesh, 0);
      const position = new BufferAttribute(buffers.positions, 3);
      position.setUsage(DynamicDrawUsage);
      const geometry = createRockGeometry(buffers);
      const outline = createOutlineGeometry(buffers);
      geometry.setAttribute('position', position);
      outline.setAttribute('position', position);
      for (const [m, next] of [
        [voxels, geometry],
        [hull, outline],
      ] as const) {
        const old = m.geometry;
        old.dispose();
        this.geometries[this.geometries.indexOf(old)] = next;
        m.geometry = next;
      }
      plant.buffers = buffers;
      sway.position = position;
    }
    const count = mesh.heights.length;
    voxels.geometry.setDrawRange(0, count);
    hull.geometry.setDrawRange(0, count);
    sway.data = mesh;
    sway.amplitude = model.amplitude;
    plant.growth = growth;
    applyPlantSway(
      mesh,
      model.amplitude * this.swayScale,
      sway.rotation,
      this.swayTime,
      plant.buffers.positions,
    );
    return true;
  }

  /** Pousse affichée de la plante d'indice `index`, `null` pour un autre élément (tests). */
  plantGrowth(index: number): number | null {
    return this.growing[index]?.growth ?? null;
  }

  /**
   * Pose les plantes au temps simulé `time` (secondes), sans allocation. `swayScale` multiplie
   * l'amplitude d'ondulation (1 : inchangée, #406 : atténuée si les mouvements sont réduits).
   */
  update(time: number, swayScale = 1): void {
    this.swayTime = time;
    this.swayScale = swayScale;
    for (const plant of this.plants) {
      applyPlantSway(
        plant.data,
        plant.amplitude * swayScale,
        plant.rotation,
        time,
        plant.position.array as Float32Array,
      );
      plant.position.needsUpdate = true;
    }
  }

  /**
   * Teinte du décor (facteur linéaire par canal, `render/night-shade.ts`, `decorTintInto`) :
   * multiplie les couleurs de sommet des plantes et des rochers. Blanc (1, 1, 1) en plein
   * jour : couleurs d'origine, à l'octet près. `factor` (ombre des plantes hautes, #477)
   * multiplie les trois canaux ; 1 : sans effet.
   */
  setTint(tint: readonly [number, number, number], factor = 1): void {
    this.material.color.setRGB(tint[0] * factor, tint[1] * factor, tint[2] * factor);
  }

  /** Teinte courante du décor (tests). */
  get tint(): readonly [number, number, number] {
    const c = this.material.color;
    return [c.r, c.g, c.b];
  }

  /** Nombre de plantes affichées. */
  get plantCount(): number {
    return this.plants.length;
  }

  /** Nombre de colonies de corail affichées. */
  get coralCount(): number {
    return this.corals;
  }

  /** Nombre d'anémones affichées. */
  get anemoneCount(): number {
    return this.anemones;
  }

  /** Nombre d'éléments affichés (coraux et anémones compris). */
  get count(): number {
    return this.object.children.length;
  }

  /** Résolution de la surface de rendu, en pixels (épaisseur constante du contour). */
  setResolution(width: number, height: number): void {
    for (const material of [this.outlineMaterial, this.selectionMaterial]) {
      (material.uniforms['uResolution'].value as Vector2).set(
        Math.max(1, width),
        Math.max(1, height),
      );
    }
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.outlineMaterial.dispose();
    this.selectionMaterial.dispose();
  }

  private clear(): void {
    this.object.clear();
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
    this.plants = [];
    this.growing = [];
    this.items = [];
    this.selected = null;
    this.corals = 0;
    this.anemones = 0;
  }
}
