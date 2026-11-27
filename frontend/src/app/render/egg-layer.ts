import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';

import type { SpeciesId } from '../sim/species';
import {
  laysCapsules,
  laysInLeaves,
  laysNearAnemone,
  laysOnVegetation,
  MAX_EGGS,
  type Egg,
} from '../sim/eggs';
import type { SceneLayer } from './effect-layer';
import { ENVIRONMENT_TONES, PALETTE } from './palette';

/**
 * Œufs des corydoras (issue #478, ADR 0111), du poisson-clown (#653, orange) et du poisson rouge
 * (#675, crème, dessinés après l'eau comme ceux du clown : sous l'eau sombre du bassin, le long
 * des tiges des nénuphars) : un voxel crème par œuf, collé sur la vitre ou
 * dans une plante, de couleur plate sur toutes ses faces (ombré comme les granulés, son flanc
 * tombait sur le ton du sable et la grappe ne se lisait plus, capture du cycle 168). Un seul maillage
 * instancié de `MAX_EGGS` instances, alloué une fois (aucun tampon recréé en cours de partie) ;
 * sans œuf, il est masqué : images inchangées, à l'octet près.
 *
 * Couleur : le crème du flanc des corydoras (`PALETTE.koiBlanc`), déjà dans la palette ; un
 * œuf récent est un peu plus clair qu'un œuf près d'éclore (`EGG_RIPE_COLOR`), qui brunit
 * légèrement, comme un œuf fécondé.
 */

/**
 * Côté d'un œuf, en mètres : deux pixels de scène environ en vue de face (~7 mm par pixel).
 * Un vrai œuf de corydoras fait ~2 mm ; à un pixel, la grappe disparaissait (capture, cycle 168).
 */
export const EGG_VOXEL = 0.013;
/**
 * Épaisseur du liseré sombre autour d'un œuf, en mètres (de chaque côté : la moitié), environ
 * un pixel de scène : un contour sombre d'un pixel (DA, règle 4) détache la grappe de la vitre
 * et des plantes.
 */
export const EGG_OUTLINE = 0.008;
/** Couleur du liseré. */
export const EGG_OUTLINE_COLOR = PALETTE.koiNoir;
/**
 * Plancher du cœur d'un œuf, en pixels de scène (#501) : un œuf loin de la caméra (vue
 * trois-quarts, plantes du fond) tombait à un ou deux pixels et se confondait avec les
 * paillettes du sable ; son côté grandit alors pour garder au moins trois pixels. Les œufs
 * proches (vitre avant, vue de face) gardent leur taille de base.
 */
export const EGG_MIN_PIXELS = 3;
/**
 * Capsules de la néritine (#678, #853) : cœur agrandi de ce facteur, plancher en pixels compris,
 * liseré inchangé. À la taille d'un œuf de corydoras, elles ne faisaient que quelques pixels en
 * vue trois-quarts et se confondaient avec les reflets (revue du cycle 311). Une vraie capsule
 * fait ~1 mm ; la taille reste une lisibilité de jeu, réservée à l'espèce (`laysCapsules`).
 */
export const CAPSULE_SIZE_FACTOR = 1.6;
/** Plancher du liseré, en pixels de scène, des deux côtés ensemble : un pixel de chaque côté. */
export const EGG_MIN_OUTLINE_PIXELS = 2;
/**
 * Ordres de rendu : après le décor et les poissons opaques (0), le liseré d'abord, sans écrire
 * la profondeur, puis le cœur, qui le recouvre au centre ; tous deux testés contre la scène.
 */
export const EGG_OUTLINE_RENDER_ORDER = 1;
export const EGG_CORE_RENDER_ORDER = 2;
/**
 * Œufs du poisson-clown (#653) : dessinés après l'eau et le verre (file des transparents,
 * opacité pleine), comme les poissons (`FISH_RENDER_ORDER`, 2,5) et juste avant eux. Sous l'eau
 * bleue du récif, leur orange virait au rose pâle à la passe palette (capture du cycle 231).
 * Les œufs des corydoras restent dans la file opaque : images inchangées.
 */
export const EGG_AFTER_WATER_OUTLINE_RENDER_ORDER = 2.3;
export const EGG_AFTER_WATER_CORE_RENDER_ORDER = 2.4;
/** Couleur d'un œuf neuf. */
export const EGG_COLOR = PALETTE.koiBlanc;
/** Couleur d'un œuf près d'éclore. */
export const EGG_RIPE_COLOR = PALETTE.sableClair;
/**
 * Œufs du poisson-clown (#653) : orange vif de l'espèce (`clownOrange`), puis un orange plus
 * sombre près d'éclore (les embryons foncent avant l'éclosion).
 */
export const CLOWN_EGG_COLOR = ENVIRONMENT_TONES.clownOrange;
export const CLOWN_EGG_RIPE_COLOR = PALETTE.tritonOrange;

/**
 * Vrai si les œufs de l'espèce sont dessinés après l'eau : ponte près d'une anémone (récif,
 * `laysNearAnemone`), frai sur la végétation (bassin, `laysOnVegetation`), ponte du triton dans
 * les feuilles (paludarium, `laysInLeaves`, #676) ou capsules de la néritine (bac tropical,
 * `laysCapsules`, #678 : dans la file opaque, leur blanc virait au bleu pâle des bulles). Tiré des listes de
 * `sim/eggs.ts`, sans identifiant d'espèce en dur (#662, #685) : une espèce qui rejoint l'une de
 * ces listes hérite du traitement.
 */
export function eggDrawnAfterWater(species: SpeciesId): boolean {
  return (
    laysNearAnemone(species) ||
    laysOnVegetation(species) ||
    laysInLeaves(species) ||
    laysCapsules(species)
  );
}

export class EggLayer implements SceneLayer {
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshBasicMaterial({ color: '#ffffff' });
  private readonly outlineMaterial = new MeshBasicMaterial({
    color: EGG_OUTLINE_COLOR,
    depthWrite: false,
  });
  readonly mesh = new InstancedMesh(this.geometry, this.material, MAX_EGGS);
  readonly outline = new InstancedMesh(this.geometry, this.outlineMaterial, MAX_EGGS);
  readonly object = new Group();
  private readonly baseOutline = new Color(EGG_OUTLINE_COLOR);
  private readonly fresh = new Color(EGG_COLOR);
  private readonly ripe = new Color(EGG_RIPE_COLOR);
  private readonly reefFresh = new Color(CLOWN_EGG_COLOR);
  private readonly reefRipe = new Color(CLOWN_EGG_RIPE_COLOR);
  private readonly white = new Color('#ffffff');
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3(EGG_VOXEL, EGG_VOXEL, EGG_VOXEL);
  private readonly outlineScale = new Vector3(
    EGG_VOXEL + EGG_OUTLINE,
    EGG_VOXEL + EGG_OUTLINE,
    EGG_VOXEL + EGG_OUTLINE,
  );
  private brightnessFactor = 1;
  /** Vrai quand les œufs sont dessinés après l'eau (clown #653, poisson rouge #675). */
  private afterWater = false;
  /** Derniers œufs posés (relus quand le point de vue change) et leur durée d'incubation. */
  private eggs: readonly Egg[] | undefined;
  private hatchTime = 1;
  /** Point de vue : position de la caméra et pixels de scène par mètre à un mètre (0 : inconnu). */
  private readonly viewpoint = new Vector3();
  private pixelsPerMeterAtUnit = 0;

  constructor() {
    this.object.name = 'oeufs';
    this.mesh.name = 'oeufs-cœur';
    this.outline.name = 'oeufs-liseré';
    this.mesh.setColorAt(0, this.fresh);
    this.mesh.instanceColor?.setUsage(DynamicDrawUsage);
    for (const mesh of [this.mesh, this.outline]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
    }
    this.outline.renderOrder = EGG_OUTLINE_RENDER_ORDER;
    this.mesh.renderOrder = EGG_CORE_RENDER_ORDER;
    this.object.add(this.outline, this.mesh);
    this.object.visible = false;
  }

  /** Pose les œufs du monde (au plus `MAX_EGGS`), sans allocation ; masquée sans œuf. */
  update(eggs: readonly Egg[] | undefined, hatchTime: number): void {
    this.eggs = eggs;
    this.hatchTime = hatchTime;
    this.layout();
  }

  /**
   * Point de vue de l'image (#501) : position de la caméra et pixels de scène par mètre à un
   * mètre de distance (`scenePixelsPerMeter(1, fov, hauteur)`). Un œuf dont le côté ferait
   * moins de `EGG_MIN_PIXELS` à sa distance est agrandi, liseré compris. Valeur invalide ou
   * nulle : tailles de base. Les œufs déjà posés sont replacés si le point de vue change.
   */
  setViewpoint(x: number, y: number, z: number, pixelsPerMeterAtUnit: number): void {
    const k =
      Number.isFinite(pixelsPerMeterAtUnit) && pixelsPerMeterAtUnit > 0 ? pixelsPerMeterAtUnit : 0;
    if (
      k === this.pixelsPerMeterAtUnit &&
      x === this.viewpoint.x &&
      y === this.viewpoint.y &&
      z === this.viewpoint.z
    ) {
      return;
    }
    this.pixelsPerMeterAtUnit = k;
    this.viewpoint.set(x, y, z);
    this.layout();
  }

  /**
   * Côtés du cœur et du liseré d'un œuf à cette distance de la caméra, en mètres, écrits dans
   * `scale` et `outlineScale` (réutilisés : aucune allocation par œuf ni par image, #507). Le
   * cœur est multiplié par `factor` (1, ou `CAPSULE_SIZE_FACTOR` pour la néritine, #853).
   */
  private applySides(distance: number, factor: number): void {
    const ppm =
      this.pixelsPerMeterAtUnit > 0 && distance > 0 ? this.pixelsPerMeterAtUnit / distance : 0;
    if (ppm === 0) {
      this.scale.setScalar(EGG_VOXEL * factor);
      this.outlineScale.setScalar(EGG_VOXEL * factor + EGG_OUTLINE);
      return;
    }
    const core = Math.max(EGG_VOXEL, EGG_MIN_PIXELS / ppm) * factor;
    this.scale.setScalar(core);
    this.outlineScale.setScalar(core + Math.max(EGG_OUTLINE, EGG_MIN_OUTLINE_PIXELS / ppm));
  }

  private layout(): void {
    const eggs = this.eggs;
    const hatchTime = this.hatchTime;
    const count = Math.min(eggs?.length ?? 0, MAX_EGGS);
    if (count === 0 && this.mesh.count === 0) {
      return;
    }
    let afterWater = false;
    for (let i = 0; i < count && !afterWater; i++) {
      afterWater = eggDrawnAfterWater(eggs![i].species);
    }
    this.setAfterWater(afterWater);
    for (let i = 0; i < count; i++) {
      const egg = eggs![i];
      this.position.set(egg.x, egg.y, egg.z);
      const factor = laysCapsules(egg.species) ? CAPSULE_SIZE_FACTOR : 1;
      this.applySides(this.position.distanceTo(this.viewpoint), factor);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      this.matrix.compose(this.position, this.rotation, this.outlineScale);
      this.outline.setMatrixAt(i, this.matrix);
      // Deux teintes seulement (pixel art) : neuf, puis mûr à la seconde moitié ; les capsules
      // de la néritine (#678), jamais fécondées en eau douce, restent blanches.
      const ripe = egg.age * 2 >= hatchTime && !laysCapsules(egg.species);
      // Orange des œufs de récif (clown, #653) ; crème pour les autres.
      if (laysNearAnemone(egg.species)) {
        this.mesh.setColorAt(i, ripe ? this.reefRipe : this.reefFresh);
      } else {
        this.mesh.setColorAt(i, ripe ? this.ripe : this.fresh);
      }
    }
    this.mesh.count = count;
    this.outline.count = count;
    this.object.visible = count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.outline.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Passe les œufs dans la file des transparents (après l'eau, opacité pleine) ou les remet
   * dans la file opaque ; sans effet si rien ne change.
   */
  private setAfterWater(after: boolean): void {
    if (after === this.afterWater) {
      return;
    }
    this.afterWater = after;
    for (const material of [this.material, this.outlineMaterial]) {
      material.transparent = after;
      material.needsUpdate = true;
    }
    this.outline.renderOrder = after
      ? EGG_AFTER_WATER_OUTLINE_RENDER_ORDER
      : EGG_OUTLINE_RENDER_ORDER;
    this.mesh.renderOrder = after ? EGG_AFTER_WATER_CORE_RENDER_ORDER : EGG_CORE_RENDER_ORDER;
  }

  /** Vrai si les œufs sont dessinés après l'eau (tests). */
  get drawnAfterWater(): boolean {
    return this.afterWater;
  }

  /** Nombre d'œufs affichés (tests). */
  get count(): number {
    return this.mesh.count;
  }

  /** Luminosité des couleurs plates (`render/night-shade.ts`) ; 1 : couleurs d'origine. */
  setBrightness(factor: number): void {
    if (!Number.isFinite(factor) || factor < 0 || factor === this.brightnessFactor) {
      return;
    }
    this.brightnessFactor = factor;
    this.material.color.copy(this.white).multiplyScalar(factor);
    this.outlineMaterial.color.copy(this.baseOutline).multiplyScalar(factor);
  }

  /** Luminosité appliquée (tests). */
  get brightness(): number {
    return this.brightnessFactor;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.outlineMaterial.dispose();
    this.mesh.dispose();
    this.outline.dispose();
  }
}
