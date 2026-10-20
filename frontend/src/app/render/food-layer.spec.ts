import {
  Color,
  ShaderLib,
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
  FOOD_OUTLINED_SIZE,
  FOOD_POINT_SIZE,
  FoodLayer,
  withDepthBias,
} from './food-layer';
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
    expect(layer.object.children).toEqual([layer.outline, layer.core]);
    expect(layer.outline.geometry).toBe(layer.geometry);
    expect(layer.core.geometry).toBe(layer.geometry);
    expect(layer.outline.renderOrder).toBe(BUBBLE_RENDER_ORDER);
    expect(layer.core.renderOrder).toBe(FOOD_CORE_RENDER_ORDER);
    expect(FOOD_CORE_RENDER_ORDER).toBeGreaterThan(BUBBLE_RENDER_ORDER);
    expect(layer.outline.frustumCulled).toBe(false);
    expect(layer.core.frustumCulled).toBe(false);
  });

  it('taille fixe en pixels de scène, mise à l’échelle sans filtre', () => {
    expect(layer.pointSize).toBe(FOOD_POINT_SIZE);
    // Liseré d'un pixel de scène de chaque côté du cœur.
    expect(layer.outlineSize).toBe(FOOD_POINT_SIZE + 2);
    expect(FOOD_OUTLINED_SIZE).toBe(FOOD_POINT_SIZE + 2);
    layer.setPointScale(6);
    expect(layer.pointSize).toBe(FOOD_POINT_SIZE * 6);
    expect(layer.outlineSize).toBe(FOOD_OUTLINED_SIZE * 6);
    layer.setPointScale(0);
    expect(layer.pointSize).toBe(FOOD_POINT_SIZE);
    expect(layer.outlineSize).toBe(FOOD_OUTLINED_SIZE);
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

  it('les deux matériaux appliquent le rapprochement à la compilation', () => {
    for (const points of [layer.core, layer.outline]) {
      const shader = {
        vertexShader: ShaderLib.points.vertexShader,
      } as WebGLProgramParametersWithUniforms;
      // Le moteur de rendu n'est pas utilisé par le correctif.
      points.material.onBeforeCompile(shader, null as unknown as WebGLRenderer);
      expect(shader.vertexShader).toBe(
        withDepthBias(ShaderLib.points.vertexShader, FOOD_DEPTH_BIAS),
      );
    }
  });
});
