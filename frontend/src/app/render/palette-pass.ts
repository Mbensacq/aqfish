import {
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  WebGLRenderTarget,
} from 'three';

import {
  ENVIRONMENT_TONE_COLORS,
  FOOD_TONE_COLORS,
  ENVIRONMENT_TONE_NAMES,
  isEnvironmentToneName,
  NIGHT_TONE_COLORS,
  PALETTE_COLORS,
  TWILIGHT_TONE_COLORS,
} from './palette';
import { TONE_PENALTY_OFF } from './night-shade';
import { flattenPalette, hexToRgb, lowResolutionSize, PIXEL_SIZE, type Size } from './pixel-art';

/**
 * Shader de la passe palette. Chaque pixel d'affichage lit le pixel de scène qui le couvre
 * (`texelFetch` : aucun filtrage), le ramène en sRGB puis le remplace par la couleur la
 * plus proche de la palette, avec la même métrique que `nearestPaletteIndex`
 * (`render/pixel-art.ts`) : distance euclidienne en sRGB, première couleur en cas d'égalité.
 *
 * Palette étendue (ADR 0021) : après les `DAY_SIZE` couleurs de jour viennent les tons de
 * nuit puis ceux du crépuscule ; leur distance reçoit une pénalité (`uNightPenalty`,
 * `uTwilightPenalty`) fixée selon l'heure. Pénalité `TONE_PENALTY_OFF` : le ton ne peut
 * jamais l'emporter (plein jour : image identique à celle de la palette de jour seule).
 * Viennent ensuite les tons d'environnement (ADR 0039), chacun avec sa pénalité
 * (`uEnvironmentPenalty`) : nulle dans l'environnement qui le déclare, `TONE_PENALTY_OFF`
 * ailleurs. Enfin les tons de la nourriture (ADR 0056), proposés pixel par pixel : sans
 * pénalité si l'opacité du pixel de scène est sous `FOOD_ALPHA_THRESHOLD` (un granulé y a
 * écrit son marqueur), `TONE_PENALTY_OFF` sinon. Rien d'autre n'écrit d'opacité inférieure
 * à 1 dans la cible (fond opaque, mélanges qui gardent 1 sur une destination à 1).
 *
 * La couleur écrite est la valeur sRGB exacte de la palette : le shader n'inclut pas
 * `colorspace_fragment`, Three.js n'y ajoute donc aucune conversion.
 */
const VERTEX_SHADER = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uScene;
uniform vec2 uSceneSize;
uniform float uPixelScale;
uniform vec3 uPalette[PALETTE_SIZE];
uniform float uNightPenalty;
uniform float uTwilightPenalty;
uniform float uEnvironmentPenalty[ENVIRONMENT_PENALTY_SIZE];

/** Pénalité des tons de la nourriture pour le pixel en cours (fixée dans main). */
float foodPenalty;

float penalty(int i) {
  if (i < DAY_SIZE) {
    return 0.0;
  }
  if (i < TWILIGHT_START) {
    return uNightPenalty;
  }
  if (i < ENVIRONMENT_START) {
    return uTwilightPenalty;
  }
  return i < FOOD_START ? uEnvironmentPenalty[i - ENVIRONMENT_START] : foodPenalty;
}

vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 low = c * 12.92;
  vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(high, low, vec3(lessThanEqual(c, vec3(0.0031308))));
}

void main() {
  ivec2 texel = ivec2(floor(gl_FragCoord.xy / uPixelScale));
  texel = clamp(texel, ivec2(0), ivec2(uSceneSize) - 1);
  vec4 scene = texelFetch(uScene, texel, 0);
  vec3 color = linearToSrgb(scene.rgb);
  foodPenalty = scene.a < FOOD_ALPHA_THRESHOLD ? 0.0 : TONE_OFF;

  vec3 best = uPalette[0];
  vec3 delta = color - best;
  float bestDistance = dot(delta, delta);
  for (int i = 1; i < PALETTE_SIZE; i++) {
    delta = color - uPalette[i];
    float d = dot(delta, delta) + penalty(i);
    if (d < bestDistance) {
      bestDistance = d;
      best = uPalette[i];
    }
  }
  gl_FragColor = vec4(best, 1.0);
}
`;

/**
 * Opacité sous laquelle un pixel de scène est tenu pour un granulé (ADR 0056) : le marqueur
 * des granulés (`FOOD_ALPHA_MARKER`, 0,5) reste sous ce seuil même voilé ensuite par l'eau
 * translucide (0,3 + 0,5 × 0,7 = 0,65) ; un pixel opaque vaut 1 (255 sur 8 bits).
 */
export const FOOD_ALPHA_THRESHOLD = 254.5 / 255;

/**
 * Pipeline pixel art (ADR 0002) : cible basse résolution où la scène est rendue, puis
 * quad plein écran qui l'agrandit sans lissage et la ramène à la palette.
 */
export class PalettePass {
  /** Cible basse résolution : NearestFilter, sans mipmaps ; sRGB 8 bits (précision des sombres). */
  readonly target: WebGLRenderTarget;
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly material: ShaderMaterial;

  /** Nombre de tons d'environnement (fin de la palette du shader). */
  private readonly environmentToneCount: number;

  /**
   * @param paletteHex couleurs de jour (toujours proposées).
   * @param nightHex tons de nuit, puis `twilightHex` tons du crépuscule : proposés selon les
   *   pénalités de `setTonePenalties` (écartés tant qu'elle n'est pas appelée).
   * @param environmentHex tons d'environnement : proposés selon `setEnvironmentPenalties`
   *   (écartés tant qu'elle n'est pas appelée).
   * @param foodHex tons de la nourriture : proposés sur les seuls pixels marqués par un
   *   granulé (opacité sous `FOOD_ALPHA_THRESHOLD`).
   */
  constructor(
    paletteHex: readonly string[] = PALETTE_COLORS,
    nightHex: readonly string[] = NIGHT_TONE_COLORS,
    twilightHex: readonly string[] = TWILIGHT_TONE_COLORS,
    environmentHex: readonly string[] = ENVIRONMENT_TONE_COLORS,
    foodHex: readonly string[] = FOOD_TONE_COLORS,
  ) {
    if (paletteHex.length === 0) {
      throw new Error('Palette vide');
    }
    const all = [...paletteHex, ...nightHex, ...twilightHex, ...environmentHex, ...foodHex];
    this.environmentToneCount = environmentHex.length;
    this.target = new WebGLRenderTarget(1, 1, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      colorSpace: SRGBColorSpace,
    });
    this.material = new ShaderMaterial({
      defines: {
        PALETTE_SIZE: all.length,
        DAY_SIZE: paletteHex.length,
        TWILIGHT_START: paletteHex.length + nightHex.length,
        ENVIRONMENT_START: paletteHex.length + nightHex.length + twilightHex.length,
        FOOD_START:
          paletteHex.length + nightHex.length + twilightHex.length + environmentHex.length,
        FOOD_ALPHA_THRESHOLD: FOOD_ALPHA_THRESHOLD.toFixed(4),
        TONE_OFF: TONE_PENALTY_OFF.toFixed(1),
        // Un tableau GLSL ne peut pas être vide : une case inutilisée sans ton d'environnement.
        ENVIRONMENT_PENALTY_SIZE: Math.max(1, environmentHex.length),
      },
      uniforms: {
        uScene: { value: this.target.texture },
        uSceneSize: { value: [1, 1] },
        uPixelScale: { value: PIXEL_SIZE },
        uPalette: { value: flattenPalette(all.map(hexToRgb)) },
        uNightPenalty: { value: TONE_PENALTY_OFF },
        uTwilightPenalty: { value: TONE_PENALTY_OFF },
        uEnvironmentPenalty: {
          value: new Array<number>(Math.max(1, environmentHex.length)).fill(TONE_PENALTY_OFF),
        },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new Mesh(this.geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  /**
   * Pénalités des tons de nuit et du crépuscule (`render/night-shade.ts`,
   * `tonePenaltiesInto`). `TONE_PENALTY_OFF` pour les deux : palette de jour seule.
   */
  setTonePenalties(night: number, twilight: number): void {
    this.material.uniforms['uNightPenalty'].value = night;
    this.material.uniforms['uTwilightPenalty'].value = twilight;
  }

  /** Pénalités courantes `[nuit, crépuscule]` (tests). */
  get tonePenalties(): readonly [number, number] {
    const u = this.material.uniforms;
    return [u['uNightPenalty'].value as number, u['uTwilightPenalty'].value as number];
  }

  /**
   * Pénalités des tons d'environnement, une par ton dans l'ordre de `environmentHex`
   * (`environmentTonePenalties`).
   * @throws RangeError si le nombre de pénalités n'est pas celui des tons, ou si l'une n'est
   *   pas un réel positif ou nul.
   */
  setEnvironmentPenalties(penalties: readonly number[]): void {
    if (penalties.length !== this.environmentToneCount) {
      throw new RangeError(
        `${penalties.length} pénalités pour ${this.environmentToneCount} tons d'environnement`,
      );
    }
    if (penalties.some((p) => !Number.isFinite(p) || p < 0)) {
      throw new RangeError(`pénalités invalides : ${penalties.join(', ')}`);
    }
    const value = this.material.uniforms['uEnvironmentPenalty'].value as number[];
    penalties.forEach((p, i) => (value[i] = p));
  }

  /** Pénalités courantes des tons d'environnement (tests). */
  get environmentPenalties(): readonly number[] {
    const value = this.material.uniforms['uEnvironmentPenalty'].value as number[];
    return value.slice(0, this.environmentToneCount);
  }

  /**
   * Adapte la cible à une surface d'affichage de `width` × `height` pixels CSS rendue avec
   * `pixelRatio` pixels physiques par pixel CSS. Renvoie la taille de la cible.
   */
  setSize(width: number, height: number, pixelRatio: number): Size {
    const size = lowResolutionSize(width, height);
    this.target.setSize(size.width, size.height);
    this.material.uniforms['uSceneSize'].value = [size.width, size.height];
    const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
    this.material.uniforms['uPixelScale'].value = PIXEL_SIZE * ratio;
    return size;
  }

  dispose(): void {
    this.target.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Pénalités des tons d'environnement (`ENVIRONMENT_TONES`, ADR 0039) pour un environnement qui
 * déclare les tons `tones` : nulle pour ceux-ci, `TONE_PENALTY_OFF` pour les autres.
 * @throws RangeError si un nom n'est pas celui d'un ton d'environnement.
 */
export function environmentTonePenalties(tones: readonly string[]): number[] {
  for (const name of tones) {
    if (!isEnvironmentToneName(name)) {
      throw new RangeError(`ton d'environnement inconnu : ${name}`);
    }
  }
  return ENVIRONMENT_TONE_NAMES.map((name) => (tones.includes(name) ? 0 : TONE_PENALTY_OFF));
}
