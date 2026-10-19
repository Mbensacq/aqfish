import {
  Color,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  type Side,
} from 'three';
import { DEFAULT_TANK, SAND_THICKNESS, WATER_LEVEL_RATIO, type TankDimensions } from '../sim/tank';
import { PALETTE } from './palette';

/**
 * Lumière dans l'eau (issue #50, ADR 0017) : caustiques sur le sable et reflet de surface.
 *
 * Les deux motifs sont des sommes de sinusoïdes évaluées **par case** d'une grille fixe du
 * bac (`*_CELL`, de l'ordre d'un à deux pixels de scène au cadrage par défaut) : chaque
 * case est allumée ou éteinte en bloc, d'où un motif pixelisé calculé à basse résolution,
 * indépendant de la résolution de l'écran. Une case allumée prend une seule couleur de la
 * palette, d'opacité fixe ; une case éteinte n'est pas dessinée. Aucune nouvelle couleur.
 *
 * Le motif est répétable dans l'espace (vecteurs d'onde multiples de 2π / `PATTERN_SPAN`)
 * et dans le temps (pulsations multiples de 2π / `LIGHT_TIME_PERIOD`) ; il ne dépend que du
 * temps **simulé** (contrat de capture). Le temps est ramené modulo la période avant
 * d'entrer dans le shader, pour garder la précision des flottants 32 bits.
 *
 * Les fonctions `causticLit` et `surfaceGlint` sont la référence en TypeScript du code GLSL
 * (mêmes constantes, mêmes formules) : elles servent aux tests.
 */

/** Période spatiale des motifs selon X et Z, en mètres. */
export const PATTERN_SPAN = 0.6;
/** Période temporelle des motifs, en secondes. */
export const LIGHT_TIME_PERIOD = 60;
/** Côté d'une case des caustiques, en mètres. */
export const CAUSTIC_CELL = 0.012;
/** Côté d'une case du reflet de surface, en mètres. */
export const SURFACE_CELL = 0.008;
/** Seuil des caustiques : une case est allumée si |somme des ondes| < seuil. */
export const CAUSTIC_THRESHOLD = 0.22;
/** Seuil du reflet : une case brille si l'onde dépasse ce seuil. */
export const SURFACE_THRESHOLD = 0.8;

/** Couleurs et opacités (cases allumées). */
export const CAUSTIC_COLOR = PALETTE.sableClair;
export const CAUSTIC_OPACITY = 1;
export const SURFACE_COLOR = PALETTE.eauTresClaire;
export const SURFACE_OPACITY = 0.4;

/** Ordre de rendu : caustiques après le sable et avant l'eau, reflet après l'eau, avant le verre. */
export const CAUSTIC_RENDER_ORDER = 2.3;
export const SURFACE_RENDER_ORDER = 1.5;
/** Hauteur des caustiques au-dessus du sable (évite le scintillement de profondeur). */
const CAUSTIC_LIFT = 0.0008;

const K = (2 * Math.PI) / PATTERN_SPAN;
const W = (2 * Math.PI) / LIGHT_TIME_PERIOD;

/** Ondes des caustiques : (kx, kz, ω), en multiples de K et W. */
const CAUSTIC_WAVES: readonly (readonly [number, number, number])[] = [
  [4, 1, 3],
  [-2, 4, -4],
  [3, -3, 5],
];

/** Onde du reflet : bande selon X, ondulée selon Z. */
const SURFACE_WAVE = {
  kx: 5,
  kz: 3,
  wMain: 4,
  wBend: -3,
  bend: 1.4,
  gx: 2,
  gz: 7,
  wGate: 5,
} as const;
/** Seuil de la seconde onde, qui découpe les bandes du reflet en éclats. */
export const SURFACE_GATE = 0.4;

/** Temps ramené dans [0, LIGHT_TIME_PERIOD) : le motif est périodique de cette durée. */
export function lightTime(time: number): number {
  if (!Number.isFinite(time)) {
    return 0;
  }
  const t = time % LIGHT_TIME_PERIOD;
  return t < 0 ? t + LIGHT_TIME_PERIOD : t;
}

function cellCenter(v: number, cell: number): number {
  return (Math.floor(v / cell) + 0.5) * cell;
}

/** Vrai si la case des caustiques qui contient (x, z) est allumée au temps `time`. */
export function causticLit(x: number, z: number, time: number): boolean {
  const cx = cellCenter(x, CAUSTIC_CELL);
  const cz = cellCenter(z, CAUSTIC_CELL);
  const t = lightTime(time);
  let v = 0;
  for (const [kx, kz, w] of CAUSTIC_WAVES) {
    v += Math.sin(K * (kx * cx + kz * cz) + W * w * t);
  }
  return Math.abs(v) < CAUSTIC_THRESHOLD;
}

/** Vrai si la case du reflet qui contient (x, z) brille au temps `time`. */
export function surfaceGlint(x: number, z: number, time: number): boolean {
  const cx = cellCenter(x, SURFACE_CELL);
  const cz = cellCenter(z, SURFACE_CELL);
  const t = lightTime(time);
  const s = SURFACE_WAVE;
  const v = Math.sin(
    K * s.kx * cx + s.bend * Math.sin(K * s.kz * cz + W * s.wBend * t) + W * s.wMain * t,
  );
  const gate = Math.sin(K * (s.gx * cx + s.gz * cz) + W * s.wGate * t);
  return v > SURFACE_THRESHOLD && gate > SURFACE_GATE;
}

const glslFloat = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);

const VERTEX = /* glsl */ `
varying vec2 vTank;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vTank = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const CAUSTIC_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vTank;
void main() {
  vec2 c = (floor(vTank / ${glslFloat(CAUSTIC_CELL)}) + 0.5) * ${glslFloat(CAUSTIC_CELL)};
  float k = ${glslFloat(K)};
  float w = ${glslFloat(W)};
  float v = 0.0;
  ${CAUSTIC_WAVES.map(
    ([kx, kz, ww]) =>
      `v += sin(k * (${glslFloat(kx)} * c.x + ${glslFloat(kz)} * c.y) + w * ${glslFloat(ww)} * uTime);`,
  ).join('\n  ')}
  if (abs(v) >= ${glslFloat(CAUSTIC_THRESHOLD)}) discard;
  gl_FragColor = vec4(uColor, uOpacity);
  #include <colorspace_fragment>
}
`;

const SURFACE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vTank;
void main() {
  vec2 c = (floor(vTank / ${glslFloat(SURFACE_CELL)}) + 0.5) * ${glslFloat(SURFACE_CELL)};
  float k = ${glslFloat(K)};
  float w = ${glslFloat(W)};
  float bend = ${glslFloat(SURFACE_WAVE.bend)} * sin(k * ${glslFloat(SURFACE_WAVE.kz)} * c.y
    + w * ${glslFloat(SURFACE_WAVE.wBend)} * uTime);
  float v = sin(k * ${glslFloat(SURFACE_WAVE.kx)} * c.x + bend
    + w * ${glslFloat(SURFACE_WAVE.wMain)} * uTime);
  float gate = sin(k * (${glslFloat(SURFACE_WAVE.gx)} * c.x + ${glslFloat(SURFACE_WAVE.gz)} * c.y)
    + w * ${glslFloat(SURFACE_WAVE.wGate)} * uTime);
  if (v <= ${glslFloat(SURFACE_THRESHOLD)} || gate <= ${glslFloat(SURFACE_GATE)}) discard;
  gl_FragColor = vec4(uColor, uOpacity);
  #include <colorspace_fragment>
}
`;

function lightMaterial(fragment: string, color: string, opacity: number, side: Side) {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: VERTEX,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    side,
  });
}

/**
 * Couche de lumière de l'eau : un plan de caustiques posé sur le sable (visible de dessus)
 * et un plan de reflet à la surface, visible des deux côtés (dessus et dessous).
 */
export class WaterLightLayer {
  readonly object = new Group();
  readonly caustics: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly surface: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor(dims: TankDimensions = DEFAULT_TANK) {
    this.object.name = 'lumiere-eau';
    this.caustics = new Mesh(
      new PlaneGeometry(dims.width, dims.depth),
      lightMaterial(CAUSTIC_FRAGMENT, CAUSTIC_COLOR, CAUSTIC_OPACITY, FrontSide),
    );
    this.caustics.name = 'caustiques';
    this.caustics.rotation.x = -Math.PI / 2;
    this.caustics.position.y = SAND_THICKNESS + CAUSTIC_LIFT;
    this.caustics.renderOrder = CAUSTIC_RENDER_ORDER;

    this.surface = new Mesh(
      new PlaneGeometry(dims.width, dims.depth),
      lightMaterial(SURFACE_FRAGMENT, SURFACE_COLOR, SURFACE_OPACITY, DoubleSide),
    );
    this.surface.name = 'reflet-surface';
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.y = Math.max(dims.height * WATER_LEVEL_RATIO, SAND_THICKNESS);
    this.surface.renderOrder = SURFACE_RENDER_ORDER;

    this.object.add(this.caustics, this.surface);
  }

  /** Anime les motifs au temps simulé `time`, en secondes (jamais l'horloge murale). */
  update(time: number): void {
    const t = lightTime(time);
    this.caustics.material.uniforms['uTime'].value = t;
    this.surface.material.uniforms['uTime'].value = t;
  }

  dispose(): void {
    for (const mesh of [this.caustics, this.surface]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
