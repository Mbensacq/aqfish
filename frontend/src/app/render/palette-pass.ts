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

import { PALETTE_COLORS } from './palette';
import { flattenPalette, hexToRgb, lowResolutionSize, PIXEL_SIZE, type Size } from './pixel-art';

/**
 * Shader de la passe palette. Chaque pixel d'affichage lit le pixel de scène qui le couvre
 * (`texelFetch` : aucun filtrage), le ramène en sRGB puis le remplace par la couleur la
 * plus proche de la palette, avec la même métrique que `nearestPaletteIndex`
 * (`render/pixel-art.ts`) : distance euclidienne en sRGB, première couleur en cas d'égalité.
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

vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 low = c * 12.92;
  vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(high, low, vec3(lessThanEqual(c, vec3(0.0031308))));
}

void main() {
  ivec2 texel = ivec2(floor(gl_FragCoord.xy / uPixelScale));
  texel = clamp(texel, ivec2(0), ivec2(uSceneSize) - 1);
  vec3 color = linearToSrgb(texelFetch(uScene, texel, 0).rgb);

  vec3 best = uPalette[0];
  vec3 delta = color - best;
  float bestDistance = dot(delta, delta);
  for (int i = 1; i < PALETTE_SIZE; i++) {
    delta = color - uPalette[i];
    float d = dot(delta, delta);
    if (d < bestDistance) {
      bestDistance = d;
      best = uPalette[i];
    }
  }
  gl_FragColor = vec4(best, 1.0);
}
`;

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

  constructor(paletteHex: readonly string[] = PALETTE_COLORS) {
    if (paletteHex.length === 0) {
      throw new Error('Palette vide');
    }
    this.target = new WebGLRenderTarget(1, 1, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      colorSpace: SRGBColorSpace,
    });
    this.material = new ShaderMaterial({
      defines: { PALETTE_SIZE: paletteHex.length },
      uniforms: {
        uScene: { value: this.target.texture },
        uSceneSize: { value: [1, 1] },
        uPixelScale: { value: PIXEL_SIZE },
        uPalette: { value: flattenPalette(paletteHex.map(hexToRgb)) },
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
