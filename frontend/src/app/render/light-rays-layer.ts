import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial } from 'three';
import type { EnvironmentId } from '../sim/environment';
import { DEFAULT_TANK, SAND_THICKNESS, WATER_LEVEL_RATIO, type TankDimensions } from '../sim/tank';
import { PALETTE } from './palette';

/**
 * Rayons de lumière dans l'eau (issue #567, ADR 0134) : quelques faisceaux clairs qui
 * descendent de la surface, penchés selon l'heure (`sim/light-rays.ts`).
 *
 * Pixel art (docs/DA.md) : chaque faisceau est découpé en colonnes de cases fixes
 * (`RAY_CELL`). Chaque colonne est un **trait continu** qui part de la surface et s'arrête à
 * une profondeur propre : plus longue au cœur du faisceau, plus courte sur ses bords, nulle
 * pour une colonne sur trois environ (`RAY_GAP`, entre les traits) ; le bout du trait
 * s'effiloche par un tramage ordonné (Bayer 4 × 4). Les longueurs suivent la force des
 * rayons. Une case allumée prend une seule couleur de la palette, d'opacité fixe : jamais de
 * dégradé translucide, que la passe palette rendrait terne. Aucune nouvelle couleur.
 *
 * Géométrie : un seul maillage (un appel de dessin), un quadrilatère par faisceau tourné vers
 * la caméra autour de la verticale dans le shader. Les traits raccourcissent jusqu'à
 * disparaître quand la caméra regarde de dessus (ou de dessous) : vus ainsi, ils ne seraient
 * que des taches.
 *
 * Mouvement : léger balancement du pied des faisceaux et longueur des traits qui respire,
 * fonction du seul temps passé à `update` (temps simulé, contrat de capture), ramené à
 * `RAY_TIME_PERIOD`. L'hôte y met une horloge décorative arrêtée sous « Réduire les
 * mouvements » : rayons fixes.
 *
 * `rayCellLit` est la référence en TypeScript du code GLSL (mêmes constantes, mêmes
 * formules) : elle sert aux tests.
 */

/**
 * Environnements aux rayons de lumière : eaux libres sous le ciel ou sous la rampe (bac
 * tropical, récif, bassin, où la pluie les atténue). Le paludarium (eau basse sous la berge)
 * et le bac d'eau froide (pénombre des axolotls) n'en ont pas.
 */
export const LIGHT_RAY_ENVIRONMENTS: readonly EnvironmentId[] = ['tropical', 'recif', 'bassin'];

/** Côté d'une case de rayon, en mètres (≈ un pixel de scène au cadrage par défaut). */
export const RAY_CELL = 0.01;
/**
 * Couleur (celle du reflet de surface) et opacité des cases allumées, dans tous les
 * environnements (au récif, un bleu d'entrée retombait sur l'eau ou sur le violet des coraux
 * après la passe palette, captures du cycle 203).
 */
export const RAY_COLOR = PALETTE.eauTresClaire;
export const RAY_OPACITY = 0.3;
/** Ordre de rendu : après le volume d'eau (1), avant le reflet de surface et le verre. */
export const RAY_RENDER_ORDER = 1.4;
/** Force en dessous de laquelle les rayons ne sont pas dessinés (nuit). */
export const MIN_RAY_STRENGTH = 0.02;
/** Longueur maximale d'un trait, en part de la hauteur d'eau (cœur du faisceau, midi). */
export const RAY_MAX_LENGTH = 0.75;
/** Part de la longueur ajoutée au bout du trait, effilochée par le tramage. */
export const RAY_TAIL = 0.5;
/** Colonnes sans trait : celles dont la graine est sous ce seuil (une sur trois environ). */
export const RAY_GAP = 0.3;
/** Période temporelle du mouvement, en secondes (temps ramené pour la précision). */
export const RAY_TIME_PERIOD = 60;
/** Amplitude du balancement au pied du rayon, en mètres (nul à la surface). */
export const RAY_SWAY = 0.006;
/** Part de la longueur des traits qui respire (le reste est fixe). */
export const RAY_FLICKER = 0.2;
/**
 * Effacement selon la verticale de la vue (|composante y de la direction vers la caméra|) :
 * rayons entiers en dessous de `RAY_FADE_START`, absents au-delà de `RAY_FADE_END`.
 */
export const RAY_FADE_START = 0.55;
export const RAY_FADE_END = 0.85;

const W = (2 * Math.PI) / RAY_TIME_PERIOD;
/** Pulsations en multiples de W : balancement, respiration des traits. */
const SWAY_W = 2;
const FLICKER_W = 3;
/** Déphasage de la respiration d'une colonne à la suivante, en radians. */
const FLICKER_STEP = 2.3;
/** Pas de la graine des colonnes (nombre d'or) et poids de la phase du faisceau. */
const GOLDEN = 0.618034;
const PHASE_SEED = 0.37;

/**
 * Rayons du bac en fractions de ses dimensions : centre (x de −0,5 à 0,5, z de −0,5 à 0,5),
 * demi-largeur (fraction de la largeur du bac), phase. Disposition fixe, sans tirage.
 */
export const RAY_LAYOUT: readonly {
  readonly x: number;
  readonly z: number;
  readonly halfWidth: number;
  readonly phase: number;
}[] = [
  { x: -0.33, z: -0.3, halfWidth: 0.045, phase: 0 },
  { x: -0.12, z: 0.26, halfWidth: 0.03, phase: 2.1 },
  { x: 0.06, z: -0.06, halfWidth: 0.055, phase: 4.0 },
  { x: 0.24, z: 0.34, halfWidth: 0.035, phase: 1.3 },
  { x: 0.39, z: -0.22, halfWidth: 0.03, phase: 5.2 },
];

/** Temps ramené dans [0, RAY_TIME_PERIOD) ; non fini : 0. */
export function rayTime(time: number): number {
  if (!Number.isFinite(time)) {
    return 0;
  }
  const t = time % RAY_TIME_PERIOD;
  return t < 0 ? t + RAY_TIME_PERIOD : t;
}

const fract = (v: number): number => v - Math.floor(v);

/** Seuil de Bayer 2 × 2 d'une case entière, dans [0, 1) (formule du shader). */
function bayer2(x: number, y: number): number {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  return fract(fx / 2 + fy * fy * 0.75);
}

/** Seuil de Bayer 4 × 4 d'une case entière (`ix`, `iy`), dans [0, 1). */
export function bayer4(ix: number, iy: number): number {
  return bayer2(ix / 2, iy / 2) * 0.25 + bayer2(ix, iy);
}

/** Graine d'une colonne `column` d'un faisceau de phase `phase`, dans [0, 1). */
export function columnSeed(column: number, phase: number): number {
  return fract(column * GOLDEN + phase * PHASE_SEED);
}

/** Effacement selon la verticale de la vue : 1 de côté, 0 de dessus. */
export function viewFade(viewUp: number): number {
  const t = Math.min(
    1,
    Math.max(0, (Math.abs(viewUp) - RAY_FADE_START) / (RAY_FADE_END - RAY_FADE_START)),
  );
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Longueur du trait de la colonne qui contient `across` (référence du shader), en part de la
 * hauteur d'eau : `RAY_MAX_LENGTH · force · (1 − |a|) · (0,55 + 0,45 · graine) · respiration
 * · effacement`, 0 pour une colonne sans trait (graine < `RAY_GAP`) ; `a` est la position en
 * travers (−1 à 1) du centre de la colonne.
 */
export function rayLength(
  across: number,
  halfWidth: number,
  phase: number,
  time: number,
  strength: number,
  viewUp = 0,
): number {
  const column = Math.floor(across / RAY_CELL);
  const seed = columnSeed(column, phase);
  if (seed < RAY_GAP) {
    return 0;
  }
  const a = Math.min(1, Math.abs((column + 0.5) * RAY_CELL) / halfWidth);
  const t = rayTime(time);
  const flicker =
    1 - RAY_FLICKER + RAY_FLICKER * Math.sin(W * FLICKER_W * t + FLICKER_STEP * column + phase);
  return RAY_MAX_LENGTH * strength * (1 - a) * (0.55 + 0.45 * seed) * flicker * viewFade(viewUp);
}

/**
 * Vrai si la case de rayon qui contient (`across`, `depth`) est allumée (référence du
 * shader) : sous le trait de sa colonne, ou dans son bout effiloché si le seuil de Bayer de
 * la case dépasse l'avancée dans le bout.
 */
export function rayCellLit(
  across: number,
  depth: number,
  halfWidth: number,
  span: number,
  phase: number,
  time: number,
  strength: number,
  viewUp = 0,
): boolean {
  const length = rayLength(across, halfWidth, phase, time, strength, viewUp);
  if (!(length > 0)) {
    return false;
  }
  const row = Math.floor(depth / RAY_CELL);
  const d = Math.min(1, Math.max(0, ((row + 0.5) * RAY_CELL) / span));
  if (d >= length * (1 + RAY_TAIL)) {
    return false;
  }
  return bayer4(Math.floor(across / RAY_CELL), row) >= (d - length) / (length * RAY_TAIL);
}

const glslFloat = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);

/** Attribut de sommet : (travers en m, profondeur en m, demi-largeur en m, phase). */
export const RAY_ATTRIBUTE = 'aRay';

const VERTEX = /* glsl */ `
attribute vec4 ${RAY_ATTRIBUTE};
uniform float uTime;
uniform float uSlope;
uniform float uSpan;
varying vec4 vRay;
varying float vViewUp;
void main() {
  vec4 center = modelMatrix * vec4(position, 1.0);
  vec3 toCam = normalize(cameraPosition - center.xyz);
  float flat2 = length(toCam.xz);
  vec2 side = flat2 > 1e-4 ? vec2(toCam.z, -toCam.x) / flat2 : vec2(1.0, 0.0);
  float depth = ${RAY_ATTRIBUTE}.y;
  float sway = ${glslFloat(RAY_SWAY)} * sin(${glslFloat(W * SWAY_W)} * uTime + ${RAY_ATTRIBUTE}.w)
    * depth / uSpan;
  vec3 world = center.xyz;
  world.xz += side * ${RAY_ATTRIBUTE}.x;
  world.x += uSlope * depth + sway;
  vRay = ${RAY_ATTRIBUTE};
  vViewUp = abs(toCam.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uSpan;
uniform float uStrength;
uniform vec3 uColor;
uniform float uOpacity;
varying vec4 vRay;
varying float vViewUp;
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
void main() {
  vec2 cell = floor(vRay.xy / ${glslFloat(RAY_CELL)});
  float seed = fract(cell.x * ${glslFloat(GOLDEN)} + vRay.w * ${glslFloat(PHASE_SEED)});
  if (seed < ${glslFloat(RAY_GAP)}) discard;
  float a = min(1.0, abs((cell.x + 0.5) * ${glslFloat(RAY_CELL)}) / vRay.z);
  float flicker = ${glslFloat(1 - RAY_FLICKER)} + ${glslFloat(RAY_FLICKER)}
    * sin(${glslFloat(W * FLICKER_W)} * uTime + ${glslFloat(FLICKER_STEP)} * cell.x + vRay.w);
  float f = clamp((vViewUp - ${glslFloat(RAY_FADE_START)}) / ${glslFloat(RAY_FADE_END - RAY_FADE_START)}, 0.0, 1.0);
  float fade = 1.0 - f * f * (3.0 - 2.0 * f);
  float len = ${glslFloat(RAY_MAX_LENGTH)} * uStrength * (1.0 - a) * (0.55 + 0.45 * seed)
    * flicker * fade;
  if (len <= 0.0) discard;
  float d = clamp((cell.y + 0.5) * ${glslFloat(RAY_CELL)} / uSpan, 0.0, 1.0);
  if (d >= len * ${glslFloat(1 + RAY_TAIL)}) discard;
  float threshold = bayer2(0.5 * cell) * 0.25 + bayer2(cell);
  if (threshold < (d - len) / (len * ${glslFloat(RAY_TAIL)})) discard;
  gl_FragColor = vec4(uColor, uOpacity);
  #include <colorspace_fragment>
}
`;

/** Géométrie des rayons : 4 sommets par rayon, posés sur l'axe du rayon (décalés en GLSL). */
export function rayGeometry(
  dims: TankDimensions,
  bottomY: number,
  surfaceY: number,
): BufferGeometry {
  const span = Math.max(surfaceY - bottomY, 0.001);
  const count = RAY_LAYOUT.length;
  const positions = new Float32Array(count * 4 * 3);
  const rays = new Float32Array(count * 4 * 4);
  const index: number[] = [];
  RAY_LAYOUT.forEach((ray, i) => {
    const x = ray.x * dims.width;
    const z = ray.z * dims.depth;
    const hw = ray.halfWidth * dims.width;
    // Haut gauche, haut droit, bas gauche, bas droit.
    const corners: readonly (readonly [number, number])[] = [
      [-hw, 0],
      [hw, 0],
      [-hw, span],
      [hw, span],
    ];
    corners.forEach(([across, depth], k) => {
      const v = i * 4 + k;
      positions.set([x, surfaceY - depth, z], v * 3);
      rays.set([across, depth, hw, ray.phase], v * 4);
    });
    const b = i * 4;
    index.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute(RAY_ATTRIBUTE, new BufferAttribute(rays, 4));
  geometry.setIndex(index);
  return geometry;
}

/** Couche des rayons de lumière : un maillage, masqué la nuit et hors environnements clairs. */
export class LightRaysLayer {
  readonly object: Mesh<BufferGeometry, ShaderMaterial>;
  private readonly enabled: boolean;
  private strength = 1;

  /**
   * `enabled` : faux dans un environnement sans rayons (jamais affichés). `surfaceY` :
   * hauteur de la surface de l'eau ; les rayons descendent jusqu'au dessus du sable.
   */
  constructor(
    dims: TankDimensions = DEFAULT_TANK,
    enabled = true,
    surfaceY: number = Math.max(dims.height * WATER_LEVEL_RATIO, SAND_THICKNESS),
  ) {
    this.enabled = enabled;
    const span = Math.max(surfaceY - SAND_THICKNESS, 0.001);
    this.object = new Mesh(
      rayGeometry(dims, SAND_THICKNESS, surfaceY),
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSlope: { value: 0 },
          uSpan: { value: span },
          uStrength: { value: 1 },
          uColor: { value: new Color(RAY_COLOR) },
          uOpacity: { value: RAY_OPACITY },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.object.name = 'rayons-lumiere';
    this.object.renderOrder = RAY_RENDER_ORDER;
    // Sommets sur l'axe des rayons, élargis dans le shader : la sphère englobante serait fausse.
    this.object.frustumCulled = false;
    this.object.visible = enabled;
  }

  /**
   * Pose la force (dans [0, 1], non finie : 1) et l'inclinaison (radians par rapport à la
   * verticale, `sim/light-rays.ts`) ; masqué sous `MIN_RAY_STRENGTH`.
   */
  setRays(strength: number, tilt: number): void {
    const s = Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 1;
    this.strength = s;
    const uniforms = this.object.material.uniforms;
    uniforms['uStrength'].value = s;
    uniforms['uSlope'].value = Number.isFinite(tilt) ? Math.tan(tilt) : 0;
    this.object.visible = this.enabled && s >= MIN_RAY_STRENGTH;
  }

  /** Anime les rayons au temps `time`, en secondes (temps simulé ou horloge décorative). */
  update(time: number): void {
    this.object.material.uniforms['uTime'].value = rayTime(time);
  }

  /** Force posée par le dernier `setRays`. */
  get raysStrength(): number {
    return this.strength;
  }

  /** Pente (tan de l'inclinaison) posée par le dernier `setRays` (tests). */
  get slope(): number {
    return this.object.material.uniforms['uSlope'].value as number;
  }

  /** Temps posé par le dernier `update`, ramené à la période (tests). */
  get time(): number {
    return this.object.material.uniforms['uTime'].value as number;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}
