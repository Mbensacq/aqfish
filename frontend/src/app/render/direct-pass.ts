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

import { LINEAR_TO_SRGB_GLSL } from './palette-pass';
import type { Size } from './pixel-art';

/**
 * Shader de la passe directe (mode `filtre=aucun`, issue #40). Chaque pixel d'affichage lit
 * le pixel de même rang de la cible pleine résolution (`texelFetch` : aucun filtrage), le
 * ramène en sRGB par la même formule que la passe palette, et l'écrit tel quel, opaque :
 * aucune réduction à la palette. Le shader n'inclut pas `colorspace_fragment` : Three.js n'y
 * ajoute aucune conversion.
 */
const VERTEX_SHADER = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uScene;
uniform vec2 uSceneSize;

${LINEAR_TO_SRGB_GLSL}

void main() {
  ivec2 texel = clamp(ivec2(floor(gl_FragCoord.xy)), ivec2(0), ivec2(uSceneSize) - 1);
  gl_FragColor = vec4(linearToSrgb(texelFetch(uScene, texel, 0).rgb), 1.0);
}
`;

/**
 * Rendu sans filtre (ADR 0101) : la scène est rendue dans une cible pleine résolution du même
 * format que la cible du pixel art (sRGB 8 bits), où les translucides (eau, verre) se mélangent
 * en espace linéaire comme en pixel art, puis un quad plein écran la recopie à l'écran sans
 * passe palette. Sans cette cible, le mélange se faisait à l'écran sur des valeurs sRGB et les
 * teintes vues à travers l'eau s'écartaient du pixel art (sable verdâtre, eau grise).
 *
 * La cible reste à 1 × 1 tant que `setSize` n'est pas appelée : en pixel art (défaut), elle ne
 * coûte rien.
 */
export class DirectPass {
  readonly target: WebGLRenderTarget;
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly material: ShaderMaterial;
  /** Taille renvoyée par `setSize`, réutilisée d'une image à l'autre. */
  private readonly size: { width: number; height: number } = { width: 1, height: 1 };

  constructor() {
    this.target = new WebGLRenderTarget(1, 1, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      colorSpace: SRGBColorSpace,
    });
    this.material = new ShaderMaterial({
      uniforms: {
        uScene: { value: this.target.texture },
        uSceneSize: { value: [1, 1] },
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
   * Adapte la cible au tampon d'affichage : `width` × `height` pixels CSS à `pixelRatio`
   * pixels physiques par pixel CSS, arrondis à l'entier inférieur comme le fait
   * `WebGLRenderer.setSize`. Taille minimale 1 × 1 (surface nulle, négative ou non finie).
   * Renvoie la taille de la cible ; sans changement de taille, la cible n'est pas réallouée.
   * Appelée à chaque image sans filtre : n'alloue rien quand la taille ne change pas (l'objet
   * renvoyé est toujours le même, mis à jour en place : ne pas le conserver).
   */
  setSize(width: number, height: number, pixelRatio: number): Size {
    const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
    const w = physical(width, ratio);
    const h = physical(height, ratio);
    if (w !== this.target.width || h !== this.target.height) {
      this.target.setSize(w, h);
      this.material.uniforms['uSceneSize'].value = [w, h];
    }
    this.size.width = w;
    this.size.height = h;
    return this.size;
  }

  /** Taille de la scène lue par le shader (tests). */
  get sceneSize(): readonly [number, number] {
    return this.material.uniforms['uSceneSize'].value as [number, number];
  }

  dispose(): void {
    this.target.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

function physical(length: number, ratio: number): number {
  if (!Number.isFinite(length) || length <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor(length * ratio));
}
