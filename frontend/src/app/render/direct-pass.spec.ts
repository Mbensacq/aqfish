import { NearestFilter, ShaderMaterial, SRGBColorSpace, type Mesh } from 'three';

import { DirectPass } from './direct-pass';
import { LINEAR_TO_SRGB_GLSL, PalettePass } from './palette-pass';

function material(pass: DirectPass | PalettePass): ShaderMaterial {
  return (pass.scene.children[0] as Mesh).material as ShaderMaterial;
}

describe('DirectPass (filtre aucun, #40)', () => {
  it('cible du même format que celle du pixel art : sRGB 8 bits, sans lissage ni mipmaps', () => {
    const pass = new DirectPass();
    const pixel = new PalettePass();
    for (const target of [pass.target, pixel.target]) {
      expect(target.texture.minFilter).toBe(NearestFilter);
      expect(target.texture.magFilter).toBe(NearestFilter);
      expect(target.texture.generateMipmaps).toBe(false);
      expect(target.texture.colorSpace).toBe(SRGBColorSpace);
      expect(target.samples).toBe(0);
      expect(target.depthBuffer).toBe(true);
    }
    expect(pass.target.texture.type).toBe(pixel.target.texture.type);
    expect(pass.target.texture.format).toBe(pixel.target.texture.format);
    pass.dispose();
    pixel.dispose();
  });

  it('reste à 1 × 1 tant qu’elle n’est pas dimensionnée (aucun coût en pixel art)', () => {
    const pass = new DirectPass();
    expect([pass.target.width, pass.target.height]).toEqual([1, 1]);
    expect(pass.sceneSize).toEqual([1, 1]);
    pass.dispose();
  });

  it('suit le tampon d’affichage en pixels physiques, arrondis à l’entier inférieur', () => {
    const pass = new DirectPass();
    expect(pass.setSize(1280, 721, 1)).toEqual({ width: 1280, height: 721 });
    expect(pass.setSize(801, 601, 1.5)).toEqual({ width: 1201, height: 901 });
    expect([pass.target.width, pass.target.height]).toEqual([1201, 901]);
    expect(pass.sceneSize).toEqual([1201, 901]);
    expect(pass.setSize(390, 844, 3)).toEqual({ width: 1170, height: 2532 });
    pass.dispose();
  });

  it('surface nulle, négative ou non finie, rapport invalide : 1 × 1 ou rapport 1', () => {
    const pass = new DirectPass();
    expect(pass.setSize(0, 0, 1)).toEqual({ width: 1, height: 1 });
    expect(pass.setSize(-5, Number.NaN, 2)).toEqual({ width: 1, height: 1 });
    expect(pass.setSize(Number.POSITIVE_INFINITY, 10, 1)).toEqual({ width: 1, height: 10 });
    expect(pass.setSize(0.2, 0.2, 2)).toEqual({ width: 1, height: 1 });
    expect(pass.setSize(640, 480, 0)).toEqual({ width: 640, height: 480 });
    expect(pass.setSize(640, 480, Number.NaN)).toEqual({ width: 640, height: 480 });
    expect(pass.setSize(640, 480, -2)).toEqual({ width: 640, height: 480 });
    pass.dispose();
  });

  it('même taille : la cible n’est pas réallouée', () => {
    const pass = new DirectPass();
    pass.setSize(640, 480, 1);
    let disposed = 0;
    pass.target.addEventListener('dispose', () => disposed++);
    pass.setSize(640, 480, 1);
    pass.setSize(640.4, 480.9, 1);
    expect(disposed).toBe(0);
    pass.setSize(641, 480, 1);
    expect(disposed).toBe(1);
    pass.dispose();
  });

  it('appels répétés (chaque image) : aucune allocation, même objet et mêmes uniformes', () => {
    const pass = new DirectPass();
    const first = pass.setSize(640, 480, 1);
    const scene = pass.sceneSize;
    const again = pass.setSize(640, 480, 1);
    expect(again).toBe(first);
    expect(pass.sceneSize).toBe(scene);
    // Le même objet suit la nouvelle taille.
    expect(pass.setSize(320, 200, 2)).toBe(first);
    expect(first).toEqual({ width: 640, height: 400 });
    pass.dispose();
  });

  it('shader : lit la cible pixel pour pixel, même conversion sRGB que la passe palette, sans palette', () => {
    const pass = new DirectPass();
    const m = material(pass);
    expect(m.uniforms['uScene'].value).toBe(pass.target.texture);
    expect(m.fragmentShader).toContain(LINEAR_TO_SRGB_GLSL);
    expect(material(new PalettePass()).fragmentShader).toContain(LINEAR_TO_SRGB_GLSL);
    expect(m.fragmentShader).toContain('texelFetch(uScene, texel, 0)');
    expect(m.fragmentShader).not.toContain('uPalette');
    // Écrit des valeurs sRGB exactes : ni test de profondeur, ni conversion ajoutée.
    expect(m.fragmentShader).not.toContain('colorspace_fragment');
    expect(m.depthTest).toBe(false);
    expect(m.depthWrite).toBe(false);
    pass.dispose();
  });

  it('quad plein écran jamais écarté par le frustum', () => {
    const pass = new DirectPass();
    const quad = pass.scene.children[0] as Mesh;
    expect(pass.scene.children).toHaveLength(1);
    expect(quad.frustumCulled).toBe(false);
    pass.dispose();
  });
});
