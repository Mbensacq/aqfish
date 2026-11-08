import {
  Color,
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';

import {
  NEON,
  speciesVariantIndex,
  speciesVariants,
  type SpeciesDefinition,
  type SpeciesVariant,
} from '../sim/species';
import { wrapAngle, type Fish } from '../sim/swimmer';
import { activeBehavior, behaviorGesture, type BehaviorGesture } from '../sim/behaviors';
import { undulationAt, undulationScale, type Undulation } from '../sim/undulation';
import { ichSeverity, isIchContagious } from '../sim/disease';
import { finRotSeverity, showsFinRot } from '../sim/fin-rot';
import { dullness } from '../sim/wellbeing';
import { fryScale } from '../sim/fry';
import { PALETTE } from './palette';
import {
  FRAY_ATTRIBUTE,
  SILHOUETTES,
  SPOT_ATTRIBUTE,
  SPOT_COLOR,
  createFishGeometry,
  modelBodyLength,
} from './fish-model';

/** Nombre maximal de poissons d'une espèce affichés (capacité des `InstancedMesh`). */
export const MAX_FISH_PER_SPECIES = 256;

const TWO_PI = Math.PI * 2;

/**
 * Ordre de rendu : après l'eau (1) et le verre (2), avant les arêtes (3) (voir
 * render/aquarium-scene.ts). Même 8 % de teinte de verre suffisent à faire basculer le rouge
 * néon vers le rouge koï à la quantification (constaté sur capture, cycle 3).
 */
export const FISH_RENDER_ORDER = 2.5;

/**
 * Couleurs ternies d'un animal en mauvaise santé (issue #208, ADR 0054) : au ternissement
 * maximal (`dullness` = 1, santé au plancher), la couleur perd `DULL_DESATURATION` de sa
 * saturation (mélange vers sa luminance) et `DULL_DARKENING` de sa luminosité. Valeurs
 * choisies sur capture, après la passe palette.
 */
export const DULL_DESATURATION = 0.3;
export const DULL_DARKENING = 0.15;

/** Attribut d'instance du ternissement, dans [0, 1]. */
export const DULL_ATTRIBUTE = 'aqfishDull';

const COLOR_VERTEX = '#include <color_vertex>';
const BEGIN_VERTEX = '#include <begin_vertex>';

/**
 * Points blancs (issue #366, ADR 0089) : part des voxels **tachables** d'un poisson blanchis à
 * l'intensité maximale (stade aggravé). Les voxels trop pâles pour qu'un point s'y voie (ventre
 * blanc cassé et nageoires menthe du néon) ne sont jamais tachés (`spotContrasts`,
 * `render/fish-model.ts`, issue #370) : à 0,25 de tous les voxels, la moitié des points du néon
 * tombaient sur son ventre ou sa caudale et ne se voyaient pas. Choisie sur capture
 * (`front-points-blancs`) : à 0,4 des voxels colorés, le néon montre des points blancs sur sa
 * bande rouge et bleue sans cesser d'être reconnaissable.
 */
export const ICH_SPOT_SHARE = 0.4;
/** Intensité des points dès leur apparition (début du stade visible), dans [0, 1]. */
export const ICH_SPOT_MIN = 0.4;
/** Couleur des points : blanc cassé de la palette (`koiBlanc`, `docs/DA.md`). */
export const ICH_SPOT_COLOR = SPOT_COLOR;
/** Attribut d'instance de l'intensité des points blancs, dans [0, 1]. */
export const ICH_ATTRIBUTE = 'aqfishIch';

/**
 * Intensité des points blancs d'un poisson (issue #366), dans [0, 1] : 0 sain ou en
 * incubation (`ich` absent ou invalide compris), puis de `ICH_SPOT_MIN` au début du stade
 * visible à 1 au stade aggravé (`ichSeverity`, `sim/disease.ts`).
 */
export function ichSpots(ich: number | undefined): number {
  if (!isIchContagious(ich)) {
    return 0;
  }
  return ICH_SPOT_MIN + (1 - ICH_SPOT_MIN) * ichSeverity(ich);
}

/**
 * Ajoute les points blancs par instance au shader de sommets déjà terni (`withDullness`) :
 * un voxel dont le rang de taché (`aqfishSpot`, `render/fish-model.ts`) est sous
 * `intensité × ICH_SPOT_SHARE` prend la couleur `ICH_SPOT_COLOR`, après le ternissement (les
 * points restent clairs sur un poisson terni). Intensité nulle : aucun sommet touché, rang
 * dans [0, 1) (captures inchangées à l'octet).
 * @throws Error si le shader n'a pas le point d'insertion attendu.
 */
export function withIchSpots(vertexShader: string): string {
  if (!vertexShader.includes(COLOR_VERTEX)) {
    throw new Error(`Shader de poissons sans ${COLOR_VERTEX}`);
  }
  const c = new Color(ICH_SPOT_COLOR);
  const rgb = [c.r, c.g, c.b].map((v) => v.toFixed(4)).join(', ');
  return `attribute float ${ICH_ATTRIBUTE};
attribute float ${SPOT_ATTRIBUTE};
${vertexShader.replace(
  COLOR_VERTEX,
  `${COLOR_VERTEX}
	if ( ${SPOT_ATTRIBUTE} < ${ICH_ATTRIBUTE} * ${ICH_SPOT_SHARE.toFixed(4)} ) vColor.xyz = vec3( ${rgb} );`,
)}`;
}

/**
 * Pourriture des nageoires (issue #485, ADR 0114) : à l'intensité maximale, part du rang
 * d'effilochage (`voxelFrayRank`, `render/fish-model.ts`) dont les voxels disparaissent :
 * le bout de la caudale et quelques voxels du bord des nageoires, en dents irrégulières.
 * Choisie sur capture (`side-pourriture`) : 0,3 au cycle 172 ; 0,35 depuis #509, assez pour
 * que la caudale se lise rongée en vue de côté sans disparaître sous le liseré.
 */
export const FIN_ROT_LOSS_SHARE = 0.35;
/**
 * Largeur, en rang d'effilochage, du liseré de tissu abîmé gardé juste au-delà des voxels
 * perdus : il prend `FIN_ROT_EDGE_COLOR`. 0,15 au cycle 172 ; 0,3 depuis #509 : le reste de
 * la caudale et le bord des nageoires du corps (rang ≥ 0,3, `voxelFrayRank`) sont touchés.
 */
export const FIN_ROT_EDGE = 0.3;
/** Intensité dès les premiers signes (début du stade effiloché), dans [0, 1]. */
export const FIN_ROT_MIN = 0.35;
/**
 * Couleur du liseré abîmé : sable clair de la palette (`docs/DA.md`), tissu pâli et effiloché,
 * distinct du blanc des points blancs pour ne pas confondre les deux maladies. Gris de roche au
 * cycle 172 : trop proche de l'eau sombre, il ne se lisait pas en vue de côté (#509).
 */
export const FIN_ROT_EDGE_COLOR = PALETTE.sableClair;
/** Attribut d'instance de l'intensité de la pourriture des nageoires, dans [0, 1]. */
export const FIN_ROT_ATTRIBUTE = 'aqfishFinRot';

/**
 * Intensité de la pourriture des nageoires d'un poisson (issue #485), dans [0, 1] : 0 sain ou
 * au début (progression absente ou invalide comprise), puis de `FIN_ROT_MIN` aux premiers
 * signes à 1 au maximum (`finRotSeverity`, `sim/fin-rot.ts`).
 */
export function finRotFray(finRot: number | undefined): number {
  if (!showsFinRot(finRot)) {
    return 0;
  }
  return FIN_ROT_MIN + (1 - FIN_ROT_MIN) * finRotSeverity(finRot);
}

/**
 * Ajoute la pourriture des nageoires par instance au shader de sommets : un sommet dont le
 * rang d'effilochage (`aqfishFray`) est sous `intensité × FIN_ROT_LOSS_SHARE` est ramené à
 * l'origine du modèle (triangles dégénérés : le voxel disparaît), un sommet juste au-delà
 * (`FIN_ROT_EDGE`) prend `FIN_ROT_EDGE_COLOR`. Intensité nulle : aucun sommet touché
 * (garde explicite, captures inchangées à l'octet).
 * @throws Error si le shader n'a pas les points d'insertion attendus.
 */
export function withFinRot(vertexShader: string): string {
  for (const chunk of [COLOR_VERTEX, BEGIN_VERTEX]) {
    if (!vertexShader.includes(chunk)) {
      throw new Error(`Shader de poissons sans ${chunk}`);
    }
  }
  const c = new Color(FIN_ROT_EDGE_COLOR);
  const rgb = [c.r, c.g, c.b].map((v) => v.toFixed(4)).join(', ');
  const loss = `${FIN_ROT_ATTRIBUTE} * ${FIN_ROT_LOSS_SHARE.toFixed(4)}`;
  return `attribute float ${FIN_ROT_ATTRIBUTE};
attribute float ${FRAY_ATTRIBUTE};
${vertexShader
  .replace(
    COLOR_VERTEX,
    `${COLOR_VERTEX}
	if ( ${FIN_ROT_ATTRIBUTE} > 0.0 && ${FRAY_ATTRIBUTE} < ${loss} + ${FIN_ROT_EDGE.toFixed(4)} ) vColor.xyz = vec3( ${rgb} );`,
  )
  .replace(
    BEGIN_VERTEX,
    `${BEGIN_VERTEX}
	if ( ${FIN_ROT_ATTRIBUTE} > 0.0 && ${FRAY_ATTRIBUTE} < ${loss} ) transformed = vec3( 0.0 );`,
  )}`;
}

/**
 * Ajoute le ternissement par instance au shader de sommets d'un `MeshBasicMaterial` à
 * couleurs de sommet, juste après le calcul de `vColor`. À ternissement nul, `mix(c, g, 0)`
 * puis `× 1` rendent exactement la couleur d'avant (captures inchangées à l'octet).
 * @throws Error si le shader n'a pas le point d'insertion attendu (version de three.js
 * incompatible), plutôt que d'ignorer silencieusement l'effet.
 */
export function withDullness(vertexShader: string): string {
  if (!vertexShader.includes(COLOR_VERTEX)) {
    throw new Error(`Shader de poissons sans ${COLOR_VERTEX}`);
  }
  return `attribute float ${DULL_ATTRIBUTE};
${vertexShader.replace(
  COLOR_VERTEX,
  `${COLOR_VERTEX}
	vColor.xyz = mix( vColor.xyz, vec3( dot( vColor.xyz, vec3( 0.2126, 0.7152, 0.0722 ) ) ), ${DULL_ATTRIBUTE} * ${DULL_DESATURATION.toFixed(4)} ) * ( 1.0 - ${DULL_ATTRIBUTE} * ${DULL_DARKENING.toFixed(4)} );`,
)}`;
}

/** Pose interpolée d'un poisson, en repère du bac. */
export interface FishPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Phase du battement de queue interpolée. */
  phase: number;
}

/**
 * Interpole la pose d'un poisson entre le pas précédent (`alpha = 0`) et le pas courant
 * (`alpha = 1`), par le plus court chemin pour les angles. Écrit dans `out` (aucune
 * allocation) et le renvoie. `alpha` est borné à [0, 1].
 */
export function interpolateFishPose(fish: Fish, alpha: number, out: FishPose): FishPose {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  out.x = fish.px + (fish.x - fish.px) * a;
  out.y = fish.py + (fish.y - fish.py) * a;
  out.z = fish.pz + (fish.z - fish.pz) * a;
  out.yaw = fish.pyaw + wrapAngle(fish.yaw - fish.pyaw) * a;
  out.pitch = fish.ppitch + (fish.pitch - fish.ppitch) * a;
  let dPhase = fish.phase - fish.pphase;
  if (dPhase < 0) {
    dPhase += TWO_PI;
  }
  out.phase = fish.pphase + dPhase * a;
  return out;
}

/**
 * Contexte des gestes de comportement (issue #427, `sim/behaviors.ts`) : temps simulé du monde
 * affiché, présence d'un granulé posé (fouille), et facteur des mouvements (1 normal, 0 :
 * « Réduire les mouvements », ADR 0098).
 */
export interface BehaviorFrame {
  readonly time: number;
  readonly landedFood: boolean;
  readonly motion: number;
}

/**
 * Couche des poissons d'une apparence d'espèce (`speciesVariants`, par exemple les guppys
 * mâles) : deux `InstancedMesh` (corps et queue) partageant les mêmes instances. Une espèce
 * sans variantes a une seule couche. `update()` recalcule les matrices à partir de l'état
 * du monde, sans allocation.
 */
export class FishLayer {
  readonly object = new Object3D();
  private readonly body: InstancedMesh;
  private readonly tail: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  /** Ternissement par instance (`dullness` de la santé), partagé par le corps et la queue. */
  private readonly dull: InstancedBufferAttribute;
  /** Intensité des points blancs par instance (`ichSpots`, issue #366), idem. */
  private readonly ich: InstancedBufferAttribute;
  /** Intensité de la pourriture des nageoires par instance (`finRotFray`, issue #485), idem. */
  private readonly finRot: InstancedBufferAttribute;
  private readonly geometries: BufferGeometry[];
  private readonly halfLength: number;
  private readonly pose: FishPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, phase: 0 };
  private readonly undulation: Undulation = { bodySway: 0, tailSwing: 0 };
  private readonly gesture: BehaviorGesture = { pitch: 0, yaw: 0 };
  private readonly bodyMatrix = new Matrix4();
  private readonly tailMatrix = new Matrix4();
  private readonly hinge = new Matrix4();
  private readonly swing = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YZX');
  /** Échelle de l'instance : 1 pour un adulte, `fryScale` pour un alevin (issue #459). */
  private readonly scale = new Vector3(1, 1, 1);

  /** Apparence affichée par cette couche. */
  readonly variant: SpeciesVariant;

  /**
   * @param variantIndex indice de l'apparence dans `speciesVariants(species)`.
   * @throws RangeError si `variantIndex` ne désigne aucune apparence de l'espèce.
   */
  constructor(
    readonly species: SpeciesDefinition = NEON,
    readonly capacity: number = MAX_FISH_PER_SPECIES,
    readonly variantIndex = 0,
  ) {
    const variants = speciesVariants(species);
    const variant = variants[variantIndex];
    if (!Number.isInteger(variantIndex) || variant === undefined) {
      throw new RangeError(`apparence ${variantIndex} inconnue pour l'espèce ${species.id}`);
    }
    this.variant = variant;
    // Nom historique conservé pour une espèce à apparence unique.
    this.object.name =
      variants.length === 1 ? `poissons-${species.id}` : `poissons-${species.id}-${variant.id}`;
    // Couleurs plates (sans éclairage) : un poisson ne fait que 2 à 4 pixels de scène de
    // haut, et toute nuance d'éclairage ferait basculer le bleu néon vers une teinte d'eau à
    // la quantification. Dessinés après l'eau et le verre (file des transparents, opacité
    // pleine) pour que leurs teintes ne les recouvrent pas (docs/PIEGES.md).
    this.material = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1 });
    this.material.onBeforeCompile = (shader) => {
      // Chaque ajout s'insère juste après `color_vertex` : le dernier appliqué (ternissement)
      // passe donc avant les points blancs dans le shader, qui restent clairs.
      // Liseré de la pourriture des nageoires après les points blancs (#485).
      shader.vertexShader = withDullness(withIchSpots(withFinRot(shader.vertexShader)));
    };
    const bodyGeometry = createFishGeometry(species, 'body', variant);
    const tailGeometry = createFishGeometry(species, 'tail', variant);
    this.geometries = [bodyGeometry, tailGeometry];
    this.dull = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.dull.setUsage(DynamicDrawUsage);
    this.ich = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.ich.setUsage(DynamicDrawUsage);
    this.finRot = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.finRot.setUsage(DynamicDrawUsage);
    for (const geometry of this.geometries) {
      geometry.setAttribute(DULL_ATTRIBUTE, this.dull);
      geometry.setAttribute(ICH_ATTRIBUTE, this.ich);
      geometry.setAttribute(FIN_ROT_ATTRIBUTE, this.finRot);
    }
    this.body = new InstancedMesh(bodyGeometry, this.material, capacity);
    this.tail = new InstancedMesh(tailGeometry, this.material, capacity);
    this.body.name = `${this.object.name}-corps`;
    this.tail.name = `${this.object.name}-queue`;
    for (const mesh of [this.body, this.tail]) {
      mesh.count = 0;
      // Les sphères englobantes d'instances ne sont pas recalculées à chaque image.
      mesh.frustumCulled = false;
      mesh.renderOrder = FISH_RENDER_ORDER;
      this.object.add(mesh);
    }
    this.halfLength = modelBodyLength(species, SILHOUETTES[variant.silhouette], variant.scale) / 2;
    this.hinge.makeTranslation(-this.halfLength, 0, 0);
  }

  /** Nombre d'instances affichées. */
  get count(): number {
    return this.body.count;
  }

  /**
   * Place une instance par poisson de l'espèce et de l'apparence de la couche, interpolée avec
   * `alpha` ∈ [0, 1] ; `seed` (graine du monde) répartit les apparences des espèces à
   * `variantDraw: 'graine'` (`speciesVariantIndex`). Avec `behavior`, un poisson en plein
   * comportement (`activeBehavior`) reçoit son geste (`behaviorGesture`) ; sans, pose d'avant.
   */
  update(
    entities: readonly Fish[],
    alpha: number,
    seed = 0,
    behavior: BehaviorFrame | null = null,
  ): void {
    let n = 0;
    for (let i = 0; i < entities.length && n < this.capacity; i++) {
      const fish = entities[i];
      if (
        fish.species !== this.species.id ||
        speciesVariantIndex(this.species, fish.id, seed) !== this.variantIndex
      ) {
        continue;
      }
      const pose = interpolateFishPose(fish, alpha, this.pose);
      // Amplitude selon la vitesse du pas courant (non interpolée : elle varie lentement).
      const { bodySway: sway, tailSwing: swing } = undulationAt(
        pose.phase,
        undulationScale(this.species, fish.speed),
        this.undulation,
      );

      // Modèle orienté vers +X : inclinaison autour de Z, puis cap autour de Y
      // (cap mesuré de +X vers +Z, d'où le signe moins ; voir sim/swimmer.ts).
      const kind =
        behavior === null ? null : activeBehavior(fish, seed, behavior.time, behavior.landedFood);
      if (kind === null || behavior === null) {
        this.euler.set(0, -pose.yaw + sway, pose.pitch);
      } else {
        const g = behaviorGesture(kind, behavior.time, fish.id, behavior.motion, this.gesture);
        this.euler.set(0, -(pose.yaw + g.yaw) + sway, pose.pitch + g.pitch);
      }
      this.rotation.setFromEuler(this.euler);
      this.position.set(pose.x, pose.y, pose.z);
      this.scale.setScalar(fryScale(fish.growth));
      this.bodyMatrix.compose(this.position, this.rotation, this.scale);
      this.body.setMatrixAt(n, this.bodyMatrix);

      this.swing.makeRotationY(swing);
      this.tailMatrix.multiplyMatrices(this.bodyMatrix, this.hinge).multiply(this.swing);
      this.tail.setMatrixAt(n, this.tailMatrix);
      this.dull.setX(n, dullness(fish.health));
      this.ich.setX(n, ichSpots(fish.ich));
      this.finRot.setX(n, finRotFray(fish.finRot));
      n++;
    }
    this.body.count = n;
    this.tail.count = n;
    this.body.instanceMatrix.needsUpdate = true;
    this.tail.instanceMatrix.needsUpdate = true;
    this.dull.needsUpdate = true;
    this.ich.needsUpdate = true;
    this.finRot.needsUpdate = true;
  }

  /**
   * Luminosité des couleurs plates (`render/night-shade.ts`) : facteur appliqué à la
   * couleur du matériau, qui multiplie les couleurs de sommet. 1 : couleurs d'origine.
   * Une valeur non finie ou négative est ignorée.
   */
  setBrightness(factor: number): void {
    if (Number.isFinite(factor) && factor >= 0) {
      this.material.color.setScalar(factor);
    }
  }

  /** Luminosité appliquée (tests). */
  get brightness(): number {
    return this.material.color.r;
  }

  /** Ternissement d'une instance, dans [0, 1] (tests). */
  dullnessAt(index: number): number {
    return this.dull.getX(index);
  }

  /** Intensité des points blancs d'une instance, dans [0, 1] (tests). */
  ichSpotsAt(index: number): number {
    return this.ich.getX(index);
  }

  /** Intensité de la pourriture des nageoires d'une instance, dans [0, 1] (tests). */
  finRotFrayAt(index: number): number {
    return this.finRot.getX(index);
  }

  /** Lit la matrice d'une instance du corps (tests). */
  bodyMatrixAt(index: number, out: Matrix4): Matrix4 {
    this.body.getMatrixAt(index, out);
    return out;
  }

  /** Lit la matrice d'une instance de la queue (tests). */
  tailMatrixAt(index: number, out: Matrix4): Matrix4 {
    this.tail.getMatrixAt(index, out);
    return out;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.body.dispose();
    this.tail.dispose();
    this.geometries.forEach((g) => g.dispose());
    this.material.dispose();
  }
}
