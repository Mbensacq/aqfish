import {
  Color,
  CustomBlending,
  FrontSide,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  OneFactor,
  PointsMaterial,
  Quaternion,
  SRGBColorSpace,
  ShaderLib,
  Vector3,
  ZeroFactor,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three';

import { createWorld, feed } from '../sim/world';
import { FOOD_SHADE_COUNT, FOOD_SHAPES, MAX_FOOD, foodLook, type FoodPellet } from '../sim/food';
import { BUBBLE_RENDER_ORDER } from './bubble-layer';
import {
  FOOD_COLOR,
  FOOD_ALPHA_MARKER,
  FOOD_CORE_RENDER_ORDER,
  FOOD_DEPTH_BIAS,
  FOOD_FACE_SHADING,
  FOOD_OUTLINE_COLOR,
  FOOD_SHADE_COLORS,
  FoodLayer,
  shadedVoxelGeometry,
  withDepthBias,
} from './food-layer';
import { foodVoxelDimensions, foodVoxelSide } from './food-size';
import { NIGHT_FLAT_BRIGHTNESS } from './night-shade';
import { EXTENDED_PALETTE_COLORS, FOOD_TONE_COLORS, PALETTE, PALETTE_COLORS } from './palette';
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

/**
 * Couleur affichée d'une teinte `hex` multipliée par `factor` en espace linéaire (ombrage de
 * face, luminosité de nuit), ramenée par la passe à la palette `colors`.
 */
function shown(
  hex: string,
  factor: number,
  palette: readonly ReturnType<typeof hexToRgb>[],
  colors: readonly string[],
): string {
  const shaded = hexToRgb(`#${new Color(hex).multiplyScalar(factor).getHexString()}`);
  return colors[nearestPaletteIndex(shaded, palette)];
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

  it('nuances de la palette, tons de nourriture mats (#226)', () => {
    expect(FOOD_SHADE_COLORS).toHaveLength(FOOD_SHADE_COUNT);
    expect(new Set(FOOD_SHADE_COLORS).size).toBe(FOOD_SHADE_COUNT);
    for (const hex of [...FOOD_SHADE_COLORS, FOOD_OUTLINE_COLOR]) {
      expect([...PALETTE_COLORS, ...FOOD_TONE_COLORS]).toContain(hex);
    }
    // Plus le jaune saturé d'avant, ni les orangés des plantes et des guppys (#83).
    for (const hex of FOOD_SHADE_COLORS) {
      expect([PALETTE.poissonJaune, PALETTE.tritonOrange, PALETTE.koiOrange]).not.toContain(hex);
      const { s } = new Color(hex).getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace);
      expect(s).toBeLessThan(0.6);
    }
    expect(FOOD_COLOR).toBe(FOOD_SHADE_COLORS[0]);
  });

  it('ombrage par face : dessus plein, flancs et dessous plus sombres, deux flancs distincts', () => {
    expect(FOOD_FACE_SHADING).toHaveLength(6);
    const [px, nx, py, ny, pz, nz] = FOOD_FACE_SHADING;
    expect(py).toBe(1);
    for (const side of [px, nx, pz, nz, ny]) {
      expect(side).toBeGreaterThan(0);
      expect(side).toBeLessThan(1);
    }
    expect(px).not.toBe(pz);
    expect(ny).toBeLessThanOrEqual(Math.min(px, pz));
    const geometry = shadedVoxelGeometry();
    const colors = geometry.getAttribute('color');
    expect(colors.count).toBe(24);
    for (let v = 0; v < 24; v++) {
      expect(colors.getX(v)).toBeCloseTo(FOOD_FACE_SHADING[Math.floor(v / 4)], 6);
    }
    geometry.dispose();
  });

  it('chaque face ramenée par la passe à une couleur distincte du dessus, de jour et de nuit', () => {
    // Sur un pixel de granulé, la passe propose aussi les tons de la nourriture (ADR 0056).
    const dayColors = [...PALETTE_COLORS, ...FOOD_TONE_COLORS];
    const nightColors = [...EXTENDED_PALETTE_COLORS, ...FOOD_TONE_COLORS];
    const day = dayColors.map(hexToRgb);
    const night = nightColors.map(hexToRgb);
    for (const hex of FOOD_SHADE_COLORS) {
      const top = shown(hex, 1, day, dayColors);
      expect(top).toBe(hex);
      // Flancs : d'autres tons que le dessus (volume lisible).
      expect(shown(hex, FOOD_FACE_SHADING[4], day, dayColors)).not.toBe(top);
      expect(shown(hex, FOOD_FACE_SHADING[0], day, dayColors)).not.toBe(top);
      // La nuit, le dessus reste distinct du noir et de l'orangé des guppys (#83).
      const topNight = shown(hex, NIGHT_FLAT_BRIGHTNESS, night, nightColors);
      expect(topNight).not.toBe(PALETTE.koiNoir);
      expect(topNight).not.toBe(atNight(PALETTE.koiOrange));
    }
  });

  it('marqueur d’opacité : couleur et opacité écrites telles quelles (ADR 0056)', () => {
    const materials = [layer.core.material, layer.outline.material, layer.voxels[0].material];
    for (const material of materials as Material[]) {
      expect(material).toMatchObject({
        transparent: true,
        opacity: FOOD_ALPHA_MARKER,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: ZeroFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: ZeroFactor,
      });
    }
    expect(FOOD_ALPHA_MARKER).toBeGreaterThan(0);
    expect(FOOD_ALPHA_MARKER).toBeLessThan(1);
  });

  it('assombris la nuit comme les couleurs plates', () => {
    const white = new Color('#ffffff').getHex();
    expect(layer.colorHex).toBe(white);
    expect(layer.voxelColorHex).toBe(white);
    expect(layer.outlineColorHex).toBe(new Color(FOOD_OUTLINE_COLOR).getHex());
    layer.setBrightness(NIGHT_FLAT_BRIGHTNESS);
    expect(layer.brightness).toBe(NIGHT_FLAT_BRIGHTNESS);
    const dimmed = new Color('#ffffff').multiplyScalar(NIGHT_FLAT_BRIGHTNESS).getHex();
    expect(layer.colorHex).toBe(dimmed);
    expect(layer.voxelColorHex).toBe(dimmed);
    expect(layer.outlineColorHex).toBe(
      new Color(FOOD_OUTLINE_COLOR).multiplyScalar(NIGHT_FLAT_BRIGHTNESS).getHex(),
    );
    layer.setBrightness(Number.NaN);
    layer.setBrightness(-1);
    expect(layer.brightness).toBe(NIGHT_FLAT_BRIGHTNESS);
    layer.setBrightness(1);
    expect(layer.colorHex).toBe(white);
    expect(layer.voxelColorHex).toBe(white);
  });

  it('points : cœur de la nuance de chaque granulé', () => {
    const food = feed(createWorld(42), 0.1, 0.05).food;
    layer.update(food);
    const colors = layer.geometry.getAttribute('color');
    food.forEach((pellet, i) => {
      const tint = new Color(FOOD_SHADE_COLORS[foodLook(pellet.id).shade]);
      expect([colors.getX(i), colors.getY(i), colors.getZ(i)]).toEqual(
        [tint.r, tint.g, tint.b].map(Math.fround),
      );
    });
    expect((layer.core.material as PointsMaterial).vertexColors).toBe(true);
    expect((layer.outline.material as PointsMaterial).vertexColors).toBe(false);
  });

  it('liseré des points dessiné avant le cœur, sur la même géométrie ; un maillage par forme', () => {
    expect(layer.object.children).toEqual([layer.outline, layer.core, ...layer.voxels]);
    expect(layer.voxels.map((mesh) => mesh.name)).toEqual(
      FOOD_SHAPES.map((shape) => `nourriture-${shape}`),
    );
    expect(layer.outline.geometry).toBe(layer.geometry);
    expect(layer.core.geometry).toBe(layer.geometry);
    expect(layer.outline.renderOrder).toBe(BUBBLE_RENDER_ORDER);
    expect(layer.core.renderOrder).toBe(FOOD_CORE_RENDER_ORDER);
    expect(FOOD_CORE_RENDER_ORDER).toBeGreaterThan(BUBBLE_RENDER_ORDER);
    expect(layer.outline.frustumCulled).toBe(false);
    expect(layer.core.frustumCulled).toBe(false);
    for (const mesh of layer.voxels) {
      expect(mesh.geometry).toBe(layer.voxels[0].geometry);
      expect(mesh.material).toBe(layer.voxels[0].material);
      expect(mesh.renderOrder).toBe(FOOD_CORE_RENDER_ORDER);
      expect(mesh.frustumCulled).toBe(false);
      expect(mesh.instanceColor).not.toBeNull();
    }
    // Sans liseré : aucune face arrière dessinée.
    expect((layer.voxels[0].material as MeshBasicMaterial).side).toBe(FrontSide);
    expect((layer.voxels[0].material as MeshBasicMaterial).vertexColors).toBe(true);
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

  it('voxels par défaut (#226), points au choix : un seul rendu visible', () => {
    expect(layer.style).toBe('voxels');
    expect([layer.core.visible, layer.outline.visible]).toEqual([false, false]);
    expect(layer.voxels.every((mesh) => mesh.visible)).toBe(true);
    layer.setStyle('points');
    expect(layer.style).toBe('points');
    expect([layer.core.visible, layer.outline.visible]).toEqual([true, true]);
    expect(layer.voxels.some((mesh) => mesh.visible)).toBe(false);
    layer.setStyle('voxels');
    expect(layer.core.visible).toBe(false);
  });

  it('voxels : chaque granulé dans le maillage de sa forme, posé, tourné, teinté (#226)', () => {
    const world = feed(feed(feed(createWorld(42), 0.1, 0.05), -0.1, 0.05), 0, -0.05);
    const food = world.food;
    layer.setStyle('points');
    layer.setPixelsPerMeter(600);
    layer.update(food);
    // Rendu en points : les voxels ne sont pas recalculés.
    expect(layer.voxelCounts).toEqual([0, 0, 0]);
    layer.setStyle('voxels');
    const expected = FOOD_SHAPES.map((shape) => food.filter((p) => foodLook(p.id).shape === shape));
    expect(layer.voxelCounts).toEqual(expected.map((list) => list.length));
    expect(expected.filter((list) => list.length > 0).length).toBeGreaterThan(1);
    const matrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const color = new Color();
    FOOD_SHAPES.forEach((shape, s) => {
      expected[s].forEach((pellet, slot) => {
        const look = foodLook(pellet.id);
        const [sx, sy, sz] = foodVoxelDimensions(shape, look.size, 600);
        layer.voxels[s].getMatrixAt(slot, matrix);
        matrix.decompose(position, rotation, scale);
        expect(position.x).toBeCloseTo(pellet.x, 6);
        expect(position.y).toBeCloseTo(pellet.y + sy / 2, 6);
        expect(position.z).toBeCloseTo(pellet.z, 6);
        expect(scale.x).toBeCloseTo(sx, 7);
        expect(scale.y).toBeCloseTo(sy, 7);
        expect(scale.z).toBeCloseTo(sz, 7);
        const angle = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), look.turn);
        expect(rotation.angleTo(angle)).toBeCloseTo(0, 5);
        layer.voxels[s].getColorAt(slot, color);
        expect(color.getHex()).toBe(new Color(FOOD_SHADE_COLORS[look.shade]).getHex());
      });
    });
    // Dézoomé : plancher d'un pixel de scène sur chaque dimension.
    layer.setPixelsPerMeter(40);
    const grains = FOOD_SHAPES.indexOf('paillette');
    const index = layer.voxelCounts[grains] > 0 ? grains : 0;
    layer.voxels[index].getMatrixAt(0, matrix);
    scale.setFromMatrixScale(matrix);
    expect(Math.min(scale.x, scale.y, scale.z) * 40).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(layer.voxelSide).toBe(foodVoxelSide(40));
    layer.update([]);
    expect(layer.voxelCounts).toEqual([0, 0, 0]);
  });

  it('aspect stable : un granulé garde sa forme et sa nuance quand les autres disparaissent', () => {
    const food = feed(feed(createWorld(7), 0.1, 0.05), -0.1, 0.05).food;
    layer.update(food);
    const last = food[food.length - 1];
    const shape = FOOD_SHAPES.indexOf(foodLook(last.id).shape);
    layer.update([last]);
    expect(layer.voxelCounts[shape]).toBe(1);
    const color = new Color();
    layer.voxels[shape].getColorAt(0, color);
    expect(color.getHex()).toBe(new Color(FOOD_SHADE_COLORS[foodLook(last.id).shade]).getHex());
    const colors = layer.geometry.getAttribute('color');
    expect(colors.getX(0)).toBe(
      Math.fround(new Color(FOOD_SHADE_COLORS[foodLook(last.id).shade]).r),
    );
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

  it('les trois matériaux appliquent le rapprochement à la compilation', () => {
    const cases = [
      [layer.core.material, ShaderLib.points.vertexShader],
      [layer.outline.material, ShaderLib.points.vertexShader],
      [layer.voxels[0].material, ShaderLib.basic.vertexShader],
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
