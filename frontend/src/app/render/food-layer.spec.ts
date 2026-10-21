import {
  BackSide,
  Color,
  Matrix4,
  Quaternion,
  ShaderLib,
  Vector3,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three';

import { createWorld, feed } from '../sim/world';
import { MAX_FOOD, type FoodPellet } from '../sim/food';
import { BUBBLE_RENDER_ORDER } from './bubble-layer';
import {
  FOOD_COLOR,
  FOOD_CORE_RENDER_ORDER,
  FOOD_DEPTH_BIAS,
  FOOD_OUTLINE_COLOR,
  FoodLayer,
  withDepthBias,
} from './food-layer';
import { foodVoxelOutlineSide, foodVoxelSide } from './food-size';
import { NIGHT_FLAT_BRIGHTNESS } from './night-shade';
import { EXTENDED_PALETTE_COLORS, PALETTE, PALETTE_COLORS } from './palette';
import { hexToRgb, nearestPaletteIndex } from './pixel-art';

/** Couleur plate assombrie la nuit, ramenée à la palette étendue (pleine nuit, sans pénalité). */
function atNight(hex: string): string {
  const darkened = hexToRgb(
    `#${new Color(hex).multiplyScalar(NIGHT_FLAT_BRIGHTNESS).getHexString()}`,
  );
  return EXTENDED_PALETTE_COLORS[
    nearestPaletteIndex(darkened, EXTENDED_PALETTE_COLORS.map(hexToRgb))
  ];
}

describe('render/food-layer', () => {
  let layer: FoodLayer;
  beforeEach(() => (layer = new FoodLayer()));
  afterEach(() => layer.dispose());

  it('sans granulé : rien n’est dessiné', () => {
    expect(layer.count).toBe(0);
    expect(layer.geometry.drawRange.count).toBe(0);
    layer.update([]);
    expect(layer.geometry.drawRange.count).toBe(0);
  });

  it('pose chaque granulé à sa position, plage de dessin ajustée', () => {
    const food = feed(createWorld(42), 0.1, 0.05).food;
    layer.update(food);
    expect(layer.count).toBe(food.length);
    expect(layer.geometry.drawRange.count).toBe(food.length);
    const positions = layer.geometry.getAttribute('position');
    expect(positions.getX(2)).toBeCloseTo(food[2].x, 6);
    expect(positions.getY(2)).toBeCloseTo(food[2].y, 6);
    expect(positions.getZ(2)).toBeCloseTo(food[2].z, 6);
    layer.update([]);
    expect(layer.count).toBe(0);
  });

  it('borné par MAX_FOOD, sans réallocation', () => {
    const pellet = feed(createWorld(1), 0, 0).food[0];
    const many: FoodPellet[] = Array.from({ length: MAX_FOOD + 5 }, (_, id) => ({ ...pellet, id }));
    const array = layer.geometry.getAttribute('position').array;
    layer.update(many);
    expect(layer.count).toBe(MAX_FOOD);
    expect(layer.geometry.getAttribute('position').array).toBe(array);
  });

  it('couleurs de la palette, assombries la nuit comme les couleurs plates', () => {
    expect(PALETTE_COLORS).toContain(FOOD_COLOR);
    expect(PALETTE_COLORS).toContain(FOOD_OUTLINE_COLOR);
    expect(layer.colorHex).toBe(new Color(FOOD_COLOR).getHex());
    expect(layer.outlineColorHex).toBe(new Color(FOOD_OUTLINE_COLOR).getHex());
    layer.setBrightness(NIGHT_FLAT_BRIGHTNESS);
    expect(layer.brightness).toBe(NIGHT_FLAT_BRIGHTNESS);
    expect(layer.colorHex).toBe(
      new Color(FOOD_COLOR).multiplyScalar(NIGHT_FLAT_BRIGHTNESS).getHex(),
    );
    expect(layer.outlineColorHex).toBe(
      new Color(FOOD_OUTLINE_COLOR).multiplyScalar(NIGHT_FLAT_BRIGHTNESS).getHex(),
    );
    layer.setBrightness(Number.NaN);
    layer.setBrightness(-1);
    expect(layer.brightness).toBe(NIGHT_FLAT_BRIGHTNESS);
    layer.setBrightness(1);
    expect(layer.colorHex).toBe(new Color(FOOD_COLOR).getHex());
    expect(layer.outlineColorHex).toBe(new Color(FOOD_OUTLINE_COLOR).getHex());
  });

  it('lisible (#83) : ni orangé de jour, ni confondu avec la queue des guppys la nuit', () => {
    // De jour, le cœur n'est pas un des orangés des plantes et des guppys.
    expect([PALETTE.tritonOrange, PALETTE.koiOrange]).not.toContain(FOOD_COLOR);
    // La nuit, l'orangé des guppys assombri tombe sur `tritonOrange` (l'ancienne couleur des
    // granulés) : le cœur assombri doit tomber ailleurs, et rester distinct du liseré.
    expect(atNight(PALETTE.koiOrange)).toBe(PALETTE.tritonOrange);
    expect(atNight(FOOD_COLOR)).not.toBe(PALETTE.tritonOrange);
    expect(atNight(FOOD_COLOR)).not.toBe(atNight(FOOD_OUTLINE_COLOR));
  });

  it('liseré dessiné avant le cœur, sur la même géométrie', () => {
    expect(layer.object.children).toEqual([
      layer.outline,
      layer.core,
      layer.voxelOutline,
      layer.voxels,
    ]);
    expect(layer.outline.geometry).toBe(layer.geometry);
    expect(layer.core.geometry).toBe(layer.geometry);
    expect(layer.outline.renderOrder).toBe(BUBBLE_RENDER_ORDER);
    expect(layer.core.renderOrder).toBe(FOOD_CORE_RENDER_ORDER);
    expect(FOOD_CORE_RENDER_ORDER).toBeGreaterThan(BUBBLE_RENDER_ORDER);
    expect(layer.outline.frustumCulled).toBe(false);
    expect(layer.core.frustumCulled).toBe(false);
  });

  it('taille qui suit le zoom, plancher d’un pixel, mise à l’échelle sans filtre (#117)', () => {
    // Sans échelle connue : plancher d'un pixel, liseré réduit (2 pixels en tout).
    expect(layer.pointSize).toBe(1);
    expect(layer.outlineSize).toBe(2);
    // Zoom proche (500 px/m) : cœur de 6 pixels, liseré d'un pixel de chaque côté.
    layer.setPixelsPerMeter(500);
    expect(layer.pointSize).toBe(6);
    expect(layer.outlineSize).toBe(8);
    // Vue par défaut sur bureau 1280 × 720 (~148 px/m) : comme avant #117.
    layer.setPixelsPerMeter(148);
    expect(layer.pointSize).toBe(2);
    expect(layer.outlineSize).toBe(4);
    // Dézoomé (téléphone, ~85 px/m) : un pixel, liseré réduit.
    layer.setPixelsPerMeter(85);
    expect(layer.pointSize).toBe(1);
    expect(layer.outlineSize).toBe(2);
    // Sans filtre : multiplié par la taille d'un pixel de scène à l'écran.
    layer.setPointScale(6);
    expect(layer.pointSize).toBe(6);
    expect(layer.outlineSize).toBe(12);
    layer.setPointScale(0);
    layer.setPixelsPerMeter(Number.NaN);
    expect(layer.pointSize).toBe(1);
    expect(layer.outlineSize).toBe(2);
  });

  it('points par défaut, voxels au choix : un seul rendu visible', () => {
    expect(layer.style).toBe('points');
    expect([layer.core.visible, layer.outline.visible]).toEqual([true, true]);
    expect([layer.voxels.visible, layer.voxelOutline.visible]).toEqual([false, false]);
    layer.setStyle('voxels');
    expect(layer.style).toBe('voxels');
    expect([layer.core.visible, layer.outline.visible]).toEqual([false, false]);
    expect([layer.voxels.visible, layer.voxelOutline.visible]).toEqual([true, true]);
    layer.setStyle('points');
    expect(layer.voxels.visible).toBe(false);
  });

  it('voxels : un cube par granulé, posé sur son point, coque plus grande (#117)', () => {
    const food = feed(createWorld(42), 0.1, 0.05).food;
    layer.setPixelsPerMeter(600);
    layer.update(food);
    // Rendu en points : les voxels ne sont pas recalculés.
    expect(layer.voxels.count).toBe(0);
    layer.setStyle('voxels');
    expect(layer.voxels.count).toBe(food.length);
    expect(layer.voxelOutline.count).toBe(food.length);
    const [side, outlineSide] = layer.voxelSides;
    expect(side).toBe(foodVoxelSide(600));
    expect(outlineSide).toBe(foodVoxelOutlineSide(600));
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    layer.voxels.getMatrixAt(1, matrix);
    matrix.decompose(position, new Quaternion(), scale);
    expect(position.x).toBeCloseTo(food[1].x, 6);
    expect(position.y).toBeCloseTo(food[1].y + side / 2, 6);
    expect(position.z).toBeCloseTo(food[1].z, 6);
    expect(scale.x).toBeCloseTo(side, 9);
    layer.voxelOutline.getMatrixAt(1, matrix);
    expect(new Vector3().setFromMatrixScale(matrix).y).toBeCloseTo(outlineSide, 9);
    // Dézoomé : plancher d'un pixel de scène.
    layer.setPixelsPerMeter(40);
    layer.voxels.getMatrixAt(0, matrix);
    expect(new Vector3().setFromMatrixScale(matrix).x * 40).toBeCloseTo(1, 6);
    layer.update([]);
    expect(layer.voxels.count).toBe(0);
    expect(layer.voxelOutline.count).toBe(0);
  });

  it('voxels : couleur des points, coque sombre vue de l’intérieur', () => {
    expect(layer.voxelColors.hex).toBe(new Color(FOOD_COLOR).getHex());
    expect(layer.voxelOutline.material).toMatchObject({ side: BackSide });
    expect(layer.voxels.geometry).toBe(layer.voxelOutline.geometry);
    expect(layer.voxelOutline.renderOrder).toBe(BUBBLE_RENDER_ORDER);
    expect(layer.voxels.renderOrder).toBe(FOOD_CORE_RENDER_ORDER);
    expect(layer.voxels.frustumCulled).toBe(false);
  });

  it('voxels assombris la nuit comme les points', () => {
    expect(layer.voxelColors).toEqual({
      hex: new Color(FOOD_COLOR).getHex(),
      outlineHex: new Color(FOOD_OUTLINE_COLOR).getHex(),
    });
    layer.setBrightness(NIGHT_FLAT_BRIGHTNESS);
    // Mêmes couleurs que les points la nuit : lisibilité de #83 conservée.
    expect(layer.voxelColors).toEqual({
      hex: layer.colorHex,
      outlineHex: layer.outlineColorHex,
    });
    layer.setBrightness(1);
    expect(layer.voxelColors.hex).toBe(new Color(FOOD_COLOR).getHex());
  });

  it('rapproche les granulés de la caméra pour la profondeur seulement (#83)', () => {
    const source = ShaderLib.points.vertexShader;
    const biased = withDepthBias(source, FOOD_DEPTH_BIAS);
    const after = biased.slice(biased.indexOf('#include <project_vertex>'));
    // Le point avance le long du rayon de vue (même position et même taille à l'écran),
    // puis est reprojeté, avant le calcul de la taille du point.
    expect(after).toMatch(
      /#include <project_vertex>\s+mvPosition\.xyz \+= normalize\( - mvPosition\.xyz \) \* 0\.0250;\s+gl_Position = projectionMatrix \* mvPosition;\s+gl_PointSize = size;/,
    );
    expect(FOOD_DEPTH_BIAS).toBeGreaterThan(0);
    expect(FOOD_DEPTH_BIAS).toBeLessThanOrEqual(0.03);
    expect(() => withDepthBias('void main() {}', FOOD_DEPTH_BIAS)).toThrow(/project_vertex/);
  });

  it('les quatre matériaux appliquent le rapprochement à la compilation', () => {
    const cases = [
      [layer.core.material, ShaderLib.points.vertexShader],
      [layer.outline.material, ShaderLib.points.vertexShader],
      [layer.voxels.material, ShaderLib.basic.vertexShader],
      [layer.voxelOutline.material, ShaderLib.basic.vertexShader],
    ] as const;
    for (const [material, source] of cases) {
      const shader = { vertexShader: source } as WebGLProgramParametersWithUniforms;
      // Le moteur de rendu n'est pas utilisé par le correctif.
      (Array.isArray(material) ? material[0] : material).onBeforeCompile(
        shader,
        null as unknown as WebGLRenderer,
      );
      expect(shader.vertexShader).toBe(withDepthBias(source, FOOD_DEPTH_BIAS));
    }
  });
});
