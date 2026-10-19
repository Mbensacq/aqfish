import { Mesh, ShaderMaterial, Vector2 } from 'three';

import { DEFAULT_DECOR, rockBaseY, rockModel } from '../sim/decor';
import {
  DECOR_RENDER_ORDER,
  DecorLayer,
  OUTLINE_COLOR,
  createOutlineMaterial,
} from './decor-layer';
import { FISH_RENDER_ORDER } from './fish-layer';
import { PALETTE_COLORS } from './palette';

describe('DecorLayer', () => {
  it('un groupe par élément, placé et tourné selon ses données', () => {
    const layer = new DecorLayer();
    layer.setDecor(DEFAULT_DECOR);
    expect(layer.count).toBe(DEFAULT_DECOR.length);
    layer.object.children.forEach((group, i) => {
      const item = DEFAULT_DECOR[i];
      expect(group.position.x).toBe(item.x);
      expect(group.position.z).toBe(item.z);
      expect(group.position.y).toBe(rockBaseY(rockModel(item.seed, item.scale).voxelSize));
      expect(group.rotation.y).toBe(item.rotation);
      expect(group.children.map((c) => c.name)).toEqual([
        `rocher-${i}-contour`,
        `rocher-${i}-voxels`,
      ]);
    });
    layer.dispose();
  });

  it('remplacer le décor retire l’ancien', () => {
    const layer = new DecorLayer();
    layer.setDecor(DEFAULT_DECOR);
    layer.setDecor(DEFAULT_DECOR.slice(0, 1));
    expect(layer.count).toBe(1);
    layer.setDecor([]);
    expect(layer.count).toBe(0);
    layer.dispose();
  });

  it('dessiné après l’eau et le verre, avant les poissons', () => {
    const layer = new DecorLayer();
    layer.setDecor(DEFAULT_DECOR.slice(0, 1));
    layer.object.traverse((o) => {
      if (o instanceof Mesh) {
        expect(o.renderOrder).toBe(DECOR_RENDER_ORDER);
      }
    });
    expect(DECOR_RENDER_ORDER).toBeLessThan(FISH_RENDER_ORDER);
    expect(DECOR_RENDER_ORDER).toBeGreaterThan(2); // verre
    layer.dispose();
  });

  it('contour : couleur sombre de la palette, résolution tenue à jour', () => {
    expect(PALETTE_COLORS).toContain(OUTLINE_COLOR);
    const layer = new DecorLayer();
    layer.setDecor(DEFAULT_DECOR.slice(0, 1));
    layer.setResolution(320, 0);
    const hull = layer.object.getObjectByName('rocher-0-contour') as Mesh;
    const material = hull.material as ShaderMaterial;
    expect(material.uniforms['uResolution'].value as Vector2).toEqual(new Vector2(320, 1));
    layer.dispose();
  });

  it('matériau du contour : faces arrière seulement', () => {
    const material = createOutlineMaterial();
    expect(material.side).toBe(1); // BackSide
    material.dispose();
  });
});
