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
import { showsVelvet, velvetSeverity } from '../sim/velvet';
import { fungusSeverity, showsFungus } from '../sim/fungus';
import { dropsyScales, dropsyStage, dropsySwelling, showsDropsy } from '../sim/dropsy';
import { dullness } from '../sim/wellbeing';
import { fryPallor, fryScale } from '../sim/fry';
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
 * Déclare l'attribut `name` en tête du shader s'il ne l'est pas déjà : points blancs et velours
 * lisent le même rang de taché (`aqfishSpot`), qu'une double déclaration rendrait invalide.
 */
function declareAttribute(vertexShader: string, name: string): string {
  const line = `attribute float ${name};`;
  return vertexShader.includes(line) ? vertexShader : `${line}\n${vertexShader}`;
}

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
${declareAttribute(vertexShader, SPOT_ATTRIBUTE).replace(
  COLOR_VERTEX,
  `${COLOR_VERTEX}
	if ( ${SPOT_ATTRIBUTE} < ${ICH_ATTRIBUTE} * ${ICH_SPOT_SHARE.toFixed(4)} ) vColor.xyz = vec3( ${rgb} );`,
)}`;
}

/**
 * Velours (issue #532, ADR 0124) : voile fin doré. À l'intensité maximale, chaque voxel du
 * corps et des nageoires se mêle à peine à `VELVET_COLOR` (`VELVET_VEIL`), et la part
 * `VELVET_DUST_SHARE` des voxels tachables, prise à l'autre bout du rang de taché que les points
 * blancs, devient une poussière dorée (`VELVET_DUST_MIX`). Valeurs choisies sur capture
 * (`side-velours`, `front-velours`) : un voile plus fort (0,45, puis 0,2) faisait basculer le
 * rouge et le bleu du néon vers l'orange et le menthe à la passe palette.
 */
export const VELVET_VEIL = 0.08;
export const VELVET_DUST_SHARE = 0.5;
export const VELVET_DUST_MIX = 1;
/**
 * Voxels épargnés par la poussière (#556) : ceux dont la couleur est saturée (écart entre la plus
 * forte et la plus faible composante, en couleur linéaire, d'au moins cette valeur). Le rouge
 * (~0,75) et le bleu (~0,86) du néon gardent leur couleur, la poussière tombe sur le ventre et le
 * dos, plus ternes ; sur un poisson orange, la poussière dorée se serait de toute façon confondue
 * avec lui. Valeur choisie sur capture (`front-velours`, `side-velours`).
 */
export const VELVET_SPARED_SATURATION = 0.55;
/** Intensité dès l'apparition du voile, dans [0, 1]. */
export const VELVET_MIN = 0.4;
/**
 * Couleur du voile : or koï de la palette (`docs/DA.md`), « poussière dorée » des descriptions
 * du velours ; distinct du blanc des points blancs et du sable pâle de la pourriture.
 */
export const VELVET_COLOR = PALETTE.koiOr;
/** Attribut d'instance de l'intensité du velours, dans [0, 1]. */
export const VELVET_ATTRIBUTE = 'aqfishVelvet';

/**
 * Intensité du velours d'un poisson, dans [0, 1] : 0 sain ou en incubation (progression
 * absente ou invalide comprise), puis de `VELVET_MIN` à l'apparition du voile à 1 au maximum.
 */
export function velvetVeil(velvet: number | undefined): number {
  if (!showsVelvet(velvet)) {
    return 0;
  }
  return VELVET_MIN + (1 - VELVET_MIN) * velvetSeverity(velvet);
}

/**
 * Ajoute le velours par instance au shader de sommets : voile doré sur tous les voxels, et
 * poussière dorée sur les voxels dont le rang de taché dépasse `1 − intensité ×
 * VELVET_DUST_SHARE` (les voxels trop pâles, rang hors de [0, 1), n'en reçoivent pas), sauf
 * les voxels saturés (`VELVET_SPARED_SATURATION`, #556).
 * Intensité nulle : garde explicite, aucun sommet touché (captures inchangées à l'octet).
 * @throws Error si le shader n'a pas le point d'insertion attendu.
 */
export function withVelvet(vertexShader: string): string {
  if (!vertexShader.includes(COLOR_VERTEX)) {
    throw new Error(`Shader de poissons sans ${COLOR_VERTEX}`);
  }
  const c = new Color(VELVET_COLOR);
  const rgb = [c.r, c.g, c.b].map((v) => v.toFixed(4)).join(', ');
  const v = VELVET_ATTRIBUTE;
  const s = SPOT_ATTRIBUTE;
  return `attribute float ${v};
${declareAttribute(vertexShader, s).replace(
  COLOR_VERTEX,
  `${COLOR_VERTEX}
	if ( ${v} > 0.0 ) {
		float aqfishVelvetSat = max( max( vColor.r, vColor.g ), vColor.b ) - min( min( vColor.r, vColor.g ), vColor.b );
		vColor.xyz = mix( vColor.xyz, vec3( ${rgb} ), ${v} * ${VELVET_VEIL.toFixed(4)} );
		if ( ${s} < 1.0 && ${s} >= 1.0 - ${v} * ${VELVET_DUST_SHARE.toFixed(4)} && aqfishVelvetSat < ${VELVET_SPARED_SATURATION.toFixed(4)} ) vColor.xyz = mix( vColor.xyz, vec3( ${rgb} ), ${VELVET_DUST_MIX.toFixed(4)} );
	}`,
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
${declareAttribute(vertexShader, FRAY_ATTRIBUTE)
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
 * Champignons (Saprolegnia, issue #548, ADR 0128) : touffes de coton blanc grisâtre. À
 * l'intensité maximale, la part `FUNGUS_TUFT_SHARE` du rang d'effilochage (bout et bord de la
 * caudale, bord des nageoires du corps, `voxelFrayRank`) et une bande `FUNGUS_PATCH_SHARE` du
 * rang de taché (prise juste au-dessus de celle des points blancs, `ICH_SPOT_SHARE`) prennent
 * `FUNGUS_COLOR`. Des voxels pleins plutôt qu'un mélange, pour que la passe palette ne change
 * pas l'espèce (`docs/PIEGES.md`, cycle 189). Valeurs choisies sur capture (`front-champignons`).
 */
export const FUNGUS_TUFT_SHARE = 0.6;
export const FUNGUS_PATCH_SHARE = 0.2;
/** Intensité dès l'apparition du coton, dans [0, 1]. */
export const FUNGUS_MIN = 0.4;
/**
 * Couleur du coton : blanc grisâtre de l'interface (`docs/DA.md`), « coton » des descriptions de
 * la saprolégniose ; distinct du blanc crème des points blancs et du sable de la pourriture.
 */
export const FUNGUS_COLOR = PALETTE.texteInterface;
/** Attribut d'instance de l'intensité des champignons, dans [0, 1]. */
export const FUNGUS_ATTRIBUTE = 'aqfishFungus';

/**
 * Intensité des champignons d'un poisson, dans [0, 1] : 0 sain ou au début (progression absente
 * ou invalide comprise), puis de `FUNGUS_MIN` à l'apparition du coton à 1 au maximum.
 */
export function fungusTufts(fungus: number | undefined): number {
  if (!showsFungus(fungus)) {
    return 0;
  }
  return FUNGUS_MIN + (1 - FUNGUS_MIN) * fungusSeverity(fungus);
}

/**
 * Ajoute les champignons par instance au shader de sommets : coton sur les voxels de rang
 * d'effilochage sous `intensité × FUNGUS_TUFT_SHARE` et sur ceux dont le rang de taché est dans
 * [`ICH_SPOT_SHARE`, `ICH_SPOT_SHARE` + `intensité × FUNGUS_PATCH_SHARE`). Intensité nulle :
 * garde explicite, aucun sommet touché (captures inchangées à l'octet).
 * @throws Error si le shader n'a pas le point d'insertion attendu.
 */
export function withFungus(vertexShader: string): string {
  if (!vertexShader.includes(COLOR_VERTEX)) {
    throw new Error(`Shader de poissons sans ${COLOR_VERTEX}`);
  }
  const c = new Color(FUNGUS_COLOR);
  const rgb = [c.r, c.g, c.b].map((v) => v.toFixed(4)).join(', ');
  const f = FUNGUS_ATTRIBUTE;
  const s = SPOT_ATTRIBUTE;
  const low = ICH_SPOT_SHARE.toFixed(4);
  return `attribute float ${f};
${declareAttribute(declareAttribute(vertexShader, s), FRAY_ATTRIBUTE).replace(
  COLOR_VERTEX,
  `${COLOR_VERTEX}
	if ( ${f} > 0.0 && ( ${FRAY_ATTRIBUTE} < ${f} * ${FUNGUS_TUFT_SHARE.toFixed(4)} || ( ${s} >= ${low} && ${s} < ${low} + ${f} * ${FUNGUS_PATCH_SHARE.toFixed(4)} ) ) ) vColor.xyz = vec3( ${rgb} );`,
)}`;
}

/**
 * Hydropisie (issue #565, ADR 0132) : ventre gonflé puis écailles hérissées « en pomme de pin ».
 * - Ventre : les sommets du corps sous la ligne médiane descendent (`DROPSY_BELLY_SWELL` de leur
 *   hauteur au milieu du corps, rien aux deux bouts) et le corps s'élargit
 *   (`DROPSY_WIDTH_SWELL`), selon un poids en cloche `b = max(0, 1 − (x / demi-longueur)²)`,
 *   fonction de la seule position du sommet : deux voxels voisins gardent leurs coins communs,
 *   sans fente.
 * - Écailles : au stade avancé, une bande `DROPSY_SCALE_SHARE` du rang de taché (prise au-dessus
 *   de celles des points blancs et des champignons) prend `DROPSY_SCALE_COLOR` sur le corps.
 * La queue reçoit une hydropisie toujours nulle (attribut d'instance à part) : ni gonflée ni
 * hérissée. Valeurs choisies sur capture
 * (`side-hydropisie`, `front-hydropisie`).
 */
export const DROPSY_BELLY_SWELL = 0.7;
export const DROPSY_WIDTH_SWELL = 0.6;
/** Gonflement dès l'apparition des signes, dans [0, 1]. */
export const DROPSY_MIN = 0.5;
export const DROPSY_SCALE_SHARE = 0.2;
/** Bas de la bande des écailles dans le rang de taché (au-delà des champignons). */
export const DROPSY_SCALE_LOW = ICH_SPOT_SHARE + FUNGUS_PATCH_SHARE;
/** Écailles dès l'entrée au stade avancé, dans [0, 1]. */
export const DROPSY_SCALE_MIN = 0.5;
/**
 * Couleur des écailles hérissées : sable sombre de la palette (`docs/DA.md`), bords d'écailles
 * soulevés qui accrochent la lumière ; distinct du sable clair de la pourriture, du blanc des
 * points blancs et des champignons et de l'or du velours.
 */
export const DROPSY_SCALE_COLOR = PALETTE.sableSombre;
/** Attribut d'instance de l'hydropisie : (gonflement, écailles), chacun dans [0, 1]. */
export const DROPSY_ATTRIBUTE = 'aqfishDropsy';
/**
 * Uniforme de la demi-longueur du corps (unités du modèle), propre à chaque couche : le poids de
 * ventre se calcule dans le shader, sans attribut de sommet de plus (WebGL limite le nombre
 * d'attributs : un de plus faisait échouer l'édition des liens du programme, `docs/PIEGES.md`).
 */
export const BODY_HALF_UNIFORM = 'aqfishBodyHalf';

/**
 * Gonflement du ventre d'un poisson, dans [0, 1] : 0 sain ou au début, puis de `DROPSY_MIN` à
 * l'apparition des signes à 1 au stade avancé (`dropsySwelling`, `sim/dropsy.ts`).
 */
export function dropsyBelly(dropsy: number | undefined): number {
  if (!showsDropsy(dropsy)) {
    return 0;
  }
  return DROPSY_MIN + (1 - DROPSY_MIN) * dropsySwelling(dropsy);
}

/** Écailles hérissées d'un poisson, dans [0, 1] : 0 avant le stade avancé. */
export function dropsyRaisedScales(dropsy: number | undefined): number {
  if (dropsyStage(dropsy) !== 'herisse') {
    return 0;
  }
  return DROPSY_SCALE_MIN + (1 - DROPSY_SCALE_MIN) * dropsyScales(dropsy);
}

/**
 * Ajoute l'hydropisie par instance au shader de sommets (voir `DROPSY_BELLY_SWELL`).
 * Intensité nulle : gardes explicites, aucun sommet touché (captures inchangées à l'octet).
 * @throws Error si le shader n'a pas les points d'insertion attendus.
 */
export function withDropsy(vertexShader: string): string {
  for (const chunk of [COLOR_VERTEX, BEGIN_VERTEX]) {
    if (!vertexShader.includes(chunk)) {
      throw new Error(`Shader de poissons sans ${chunk}`);
    }
  }
  const c = new Color(DROPSY_SCALE_COLOR);
  const rgb = [c.r, c.g, c.b].map((v) => v.toFixed(4)).join(', ');
  const d = DROPSY_ATTRIBUTE;
  const h = BODY_HALF_UNIFORM;
  const s = SPOT_ATTRIBUTE;
  const low = DROPSY_SCALE_LOW.toFixed(4);
  const bell = `max( 0.0, 1.0 - pow( position.x / max( ${h}, 1e-6 ), 2.0 ) )`;
  return `attribute vec2 ${d};
uniform float ${h};
${declareAttribute(vertexShader, s)
  .replace(
    COLOR_VERTEX,
    `${COLOR_VERTEX}
	if ( ${d}.y > 0.0 && ${bell} > 0.0 && ${s} >= ${low} && ${s} < ${low} + ${d}.y * ${DROPSY_SCALE_SHARE.toFixed(4)} ) vColor.xyz = vec3( ${rgb} );`,
  )
  .replace(
    BEGIN_VERTEX,
    `${BEGIN_VERTEX}
	if ( ${d}.x > 0.0 ) {
		float aqfishBell = ${bell};
		if ( transformed.y < 0.0 ) transformed.y *= 1.0 + ${d}.x * ${DROPSY_BELLY_SWELL.toFixed(4)} * aqfishBell;
		transformed.z *= 1.0 + ${d}.x * ${DROPSY_WIDTH_SWELL.toFixed(4)} * aqfishBell;
	}`,
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

/**
 * Couleur d'un alevin presque translucide (issue #566) : sable de la palette (`docs/DA.md`),
 * un gris chaud qui se lit sur l'eau sans passer pour un poisson malade (le ternissement tire
 * vers le gris froid et assombrit).
 */
export const FRY_PALE_COLOR = PALETTE.sable;
/** Attribut d'instance de la pâleur d'alevin (`fryPallor`), dans [0, 1]. */
export const FRY_PALE_ATTRIBUTE = 'aqfishFryPale';

/**
 * Ajoute la pâleur des alevins au shader de sommets : la couleur du voxel se mêle à
 * `FRY_PALE_COLOR` dans la part `aqfishFryPale`, **avant** le ternissement et les maladies
 * (insérée en dernier, donc exécutée en premier). Pâleur nulle (adulte) : aucun sommet
 * touché (captures inchangées à l'octet).
 * @throws Error si le shader n'a pas le point d'insertion attendu.
 */
export function withFryPallor(vertexShader: string): string {
  if (!vertexShader.includes(COLOR_VERTEX)) {
    throw new Error(`Shader de poissons sans ${COLOR_VERTEX}`);
  }
  const c = new Color(FRY_PALE_COLOR);
  const rgb = [c.r, c.g, c.b].map((v) => v.toFixed(4)).join(', ');
  return `attribute float ${FRY_PALE_ATTRIBUTE};
${vertexShader.replace(
  COLOR_VERTEX,
  `${COLOR_VERTEX}
	if ( ${FRY_PALE_ATTRIBUTE} > 0.0 ) vColor.xyz = mix( vColor.xyz, vec3( ${rgb} ), ${FRY_PALE_ATTRIBUTE} );`,
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
  /** Intensité du velours par instance (`velvetVeil`, issue #532), idem. */
  private readonly velvet: InstancedBufferAttribute;
  /** Intensité des champignons par instance (`fungusTufts`, issue #548), idem. */
  private readonly fungus: InstancedBufferAttribute;
  /** Hydropisie par instance (`dropsyBelly`, `dropsyRaisedScales`, issue #565), idem. */
  private readonly dropsy: InstancedBufferAttribute;
  /** Demi-longueur du corps, en unités du modèle (uniforme `BODY_HALF_UNIFORM`). */
  private readonly bodyHalf: number;
  private readonly fryPale: InstancedBufferAttribute;
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
      // Velours (#532) entre les points blancs et le liseré de la pourriture.
      // Champignons (#548) en dernier : le coton recouvre le liseré de la pourriture.
      // Hydropisie (#565) en premier : ses écailles passent sous les autres signes.
      // Pâleur des alevins (#566) avant tout le reste : un alevin malade ternit aussi.
      shader.uniforms[BODY_HALF_UNIFORM] = { value: this.bodyHalf };
      shader.vertexShader = withFryPallor(
        withDullness(
          withIchSpots(withVelvet(withFinRot(withFungus(withDropsy(shader.vertexShader))))),
        ),
      );
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
    this.velvet = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.velvet.setUsage(DynamicDrawUsage);
    this.fungus = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.fungus.setUsage(DynamicDrawUsage);
    this.dropsy = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    this.dropsy.setUsage(DynamicDrawUsage);
    bodyGeometry.computeBoundingBox();
    const box = bodyGeometry.boundingBox;
    this.bodyHalf = box === null ? 0 : Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
    this.fryPale = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.fryPale.setUsage(DynamicDrawUsage);
    for (const geometry of this.geometries) {
      geometry.setAttribute(DULL_ATTRIBUTE, this.dull);
      geometry.setAttribute(ICH_ATTRIBUTE, this.ich);
      geometry.setAttribute(FIN_ROT_ATTRIBUTE, this.finRot);
      geometry.setAttribute(VELVET_ATTRIBUTE, this.velvet);
      geometry.setAttribute(FUNGUS_ATTRIBUTE, this.fungus);
      geometry.setAttribute(FRY_PALE_ATTRIBUTE, this.fryPale);
    }
    // Hydropisie : le corps seul ; la queue lit des zéros jamais mis à jour.
    bodyGeometry.setAttribute(DROPSY_ATTRIBUTE, this.dropsy);
    tailGeometry.setAttribute(
      DROPSY_ATTRIBUTE,
      new InstancedBufferAttribute(new Float32Array(capacity * 2), 2),
    );
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
      this.velvet.setX(n, velvetVeil(fish.velvet));
      this.fungus.setX(n, fungusTufts(fish.fungus));
      this.dropsy.setXY(n, dropsyBelly(fish.dropsy), dropsyRaisedScales(fish.dropsy));
      this.fryPale.setX(n, fryPallor(fish.growth));
      n++;
    }
    this.body.count = n;
    this.tail.count = n;
    this.body.instanceMatrix.needsUpdate = true;
    this.tail.instanceMatrix.needsUpdate = true;
    this.dull.needsUpdate = true;
    this.ich.needsUpdate = true;
    this.finRot.needsUpdate = true;
    this.velvet.needsUpdate = true;
    this.fungus.needsUpdate = true;
    this.dropsy.needsUpdate = true;
    this.fryPale.needsUpdate = true;
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

  /** Intensité du velours d'une instance, dans [0, 1] (tests). */
  velvetVeilAt(index: number): number {
    return this.velvet.getX(index);
  }

  /** Hydropisie de l'instance `index` : (gonflement, écailles) (tests). */
  dropsyAt(index: number): readonly [number, number] {
    return [this.dropsy.getX(index), this.dropsy.getY(index)];
  }

  /** Intensité des champignons de l'instance `index` (tests). */
  fungusTuftsAt(index: number): number {
    return this.fungus.getX(index);
  }

  /** Lit la pâleur d'alevin d'une instance (tests). */
  fryPallorAt(index: number): number {
    return this.fryPale.getX(index);
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
