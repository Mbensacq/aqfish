import {
  CATAPPA_COLORS,
  CATAPPA_LIFT,
  CATAPPA_MASK,
  CATAPPA_SPOTS,
  CatappaLayer,
  buildCatappaLeaf,
} from './catappa-layer';
import { MAX_CATAPPA_LEAVES } from '../sim/catappa';
import { waterVolume } from '../sim/tank';
import { FOOD_ALPHA_MARKER } from './food-layer';

describe('CatappaLayer (#239)', () => {
  it('une feuille par emplacement, posée sur le fond de l’eau, dans le bac', () => {
    const water = waterVolume();
    const layer = new CatappaLayer(water);
    expect(CATAPPA_SPOTS.length).toBe(MAX_CATAPPA_LEAVES);
    expect(layer.object.children.length).toBe(MAX_CATAPPA_LEAVES);
    for (const mesh of layer.object.children) {
      expect(mesh.position.y).toBeCloseTo(water.minY + CATAPPA_LIFT, 12);
      expect(mesh.position.x).toBeGreaterThan(water.minX);
      expect(mesh.position.x).toBeLessThan(water.maxX);
      expect(mesh.position.z).toBeGreaterThan(water.minZ);
      expect(mesh.position.z).toBeLessThan(water.maxZ);
    }
    layer.dispose();
  });

  it('sans feuille : couche masquée ; feuilles épuisées comptées à part', () => {
    const layer = new CatappaLayer(waterVolume());
    expect(layer.object.visible).toBe(false);
    expect(layer.count).toBe(0);
    layer.setLeaves([1, 0.4, 0]);
    expect(layer.object.visible).toBe(true);
    expect(layer.count).toBe(3);
    expect(layer.spentCount).toBe(1);
    expect(layer.object.children.filter((m) => m.visible).length).toBe(3);
    layer.setLeaves([1, 1, 1, 1, 1, 1, 1]);
    expect(layer.count).toBe(MAX_CATAPPA_LEAVES);
    layer.setLeaves(undefined);
    expect(layer.object.visible).toBe(false);
    expect(layer.count).toBe(0);
    layer.dispose();
  });

  it('marqueur des granulés : bruns de la nourriture proposés à ses seuls pixels', () => {
    const layer = new CatappaLayer(waterVolume());
    layer.setLeaves([1]);
    const mesh = layer.object.children[0] as unknown as { material: { opacity: number } };
    expect(mesh.material.opacity).toBe(FOOD_ALPHA_MARKER);
    layer.dispose();
  });

  it('luminosité : 1 par défaut, valeurs invalides ignorées', () => {
    const layer = new CatappaLayer(waterVolume());
    expect(layer.brightness).toBe(1);
    layer.setBrightness(0.5);
    expect(layer.brightness).toBe(0.5);
    layer.setBrightness(Number.NaN);
    layer.setBrightness(-1);
    expect(layer.brightness).toBe(0.5);
    layer.dispose();
  });

  it('maillage : dessus de chaque voxel plein, flancs vers les cases vides seulement', () => {
    const filled = CATAPPA_MASK.join('')
      .split('')
      .filter((c) => c === '#').length;
    const data = buildCatappaLeaf(CATAPPA_COLORS.fresh);
    // 6 sommets par face, 3 composantes par sommet.
    const faces = data.positions.length / 18;
    expect(faces).toBeGreaterThan(filled);
    expect(faces).toBeLessThan(filled * 3);
    expect(data.colors.length).toBe(data.positions.length);
    for (let i = 1; i < data.positions.length; i += 3) {
      expect(data.positions[i]).toBeGreaterThanOrEqual(0);
    }
    // Feuille épuisée plus sombre que la neuve.
    const fresh = buildCatappaLeaf(CATAPPA_COLORS.fresh).colors;
    const spent = buildCatappaLeaf(CATAPPA_COLORS.spent).colors;
    const sum = (a: Float32Array) => a.reduce((t, v) => t + v, 0);
    expect(sum(spent)).toBeLessThan(sum(fresh));
  });
});
