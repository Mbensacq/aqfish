import { Mesh, ShaderMaterial, Vector2, type MeshBasicMaterial } from 'three';

import { environmentWater, POND } from '../sim/environment';
import { LILY_PAD_EDGE_MARGIN, lilyPadLayout, lilyPadPose } from '../sim/lily-pads';
import { SAND_THICKNESS, WATER_LEVEL_RATIO } from '../sim/tank';
import { DECOR_RENDER_ORDER, OUTLINE_COLOR, OUTLINE_WIDTH_PX } from './decor-layer';
import {
  createLilyPadOutlineMaterial,
  LILY_PAD_LIFT,
  LILY_PAD_SHADOW_COLOR,
  LILY_PAD_SHADOW_OFFSET,
  LILY_PAD_SHADOW_RENDER_ORDER,
  LilyPadLayer,
} from './lily-pad-layer';
import { PALETTE_COLORS } from './palette';
import { SURFACE_RENDER_ORDER } from './water-light';

const PADS = lilyPadLayout(42, environmentWater('bassin'), POND.lilyPads);

describe('LilyPadLayer', () => {
  let layer: LilyPadLayer;

  beforeEach(() => {
    layer = new LilyPadLayer(POND.dimensions);
    layer.setPads(PADS);
  });

  afterEach(() => layer.dispose());

  it('une feuille (contour puis feuille) et une ombre par nénuphar', () => {
    expect(PADS.length).toBeGreaterThan(0);
    expect(layer.count).toBe(PADS.length);
    expect(layer.object.children.map((c) => c.name)).toEqual(
      PADS.flatMap((_, n) => [`nenuphar-${n}`, `nenuphar-${n}-ombre`]),
    );
    const leaf = layer.object.getObjectByName('nenuphar-0')!;
    expect(leaf.children.map((c) => c.name)).toEqual(['nenuphar-0-contour', 'nenuphar-0-feuille']);
    for (const mesh of leaf.children) {
      expect(mesh.renderOrder).toBe(DECOR_RENDER_ORDER);
    }
  });

  it('feuilles juste au-dessus de la surface, ombres sur le fond', () => {
    const surface = POND.dimensions.height * WATER_LEVEL_RATIO;
    PADS.forEach((_, n) => {
      expect(layer.object.getObjectByName(`nenuphar-${n}`)!.position.y).toBeCloseTo(
        surface + LILY_PAD_LIFT,
        12,
      );
      const shadow = layer.object.getObjectByName(`nenuphar-${n}-ombre`)!;
      expect(shadow.position.y).toBeGreaterThan(SAND_THICKNESS);
      expect(shadow.position.y).toBeLessThan(SAND_THICKNESS + 0.01);
    });
  });

  it('update pose feuilles et ombres d’après lilyPadPose au temps simulé', () => {
    for (const time of [0, 17.25, 600]) {
      layer.update(time);
      PADS.forEach((pad, n) => {
        const pose = lilyPadPose(pad, time, { x: 0, z: 0, rotation: 0 });
        const leaf = layer.object.getObjectByName(`nenuphar-${n}`)!;
        const shadow = layer.object.getObjectByName(`nenuphar-${n}-ombre`)!;
        expect(leaf.position.x).toBe(pose.x);
        expect(leaf.position.z).toBe(pose.z);
        expect(leaf.rotation.y).toBe(pose.rotation);
        expect(shadow.position.x).toBe(pose.x + LILY_PAD_SHADOW_OFFSET.x);
        expect(shadow.position.z).toBe(pose.z + LILY_PAD_SHADOW_OFFSET.z);
        expect(shadow.rotation.y).toBe(pose.rotation);
      });
    }
  });

  it('l’ombre ne passe jamais sous la margelle : décalage plus court que la marge', () => {
    expect(Math.hypot(LILY_PAD_SHADOW_OFFSET.x, LILY_PAD_SHADOW_OFFSET.z)).toBeLessThan(
      LILY_PAD_EDGE_MARGIN,
    );
  });

  it('ombre : couleur de la palette, après l’eau et avant les rides de la surface', () => {
    expect(PALETTE_COLORS).toContain(LILY_PAD_SHADOW_COLOR);
    const shadow = layer.object.getObjectByName('nenuphar-0-ombre') as Mesh;
    expect(shadow.renderOrder).toBe(LILY_PAD_SHADOW_RENDER_ORDER);
    expect(LILY_PAD_SHADOW_RENDER_ORDER).toBeGreaterThan(1);
    expect(LILY_PAD_SHADOW_RENDER_ORDER).toBeLessThan(SURFACE_RENDER_ORDER);
    const material = shadow.material as MeshBasicMaterial;
    expect(`#${material.color.getHexString()}`).toBe(LILY_PAD_SHADOW_COLOR);
  });

  it('teinte : blanc en plein jour (couleurs d’origine), multipliée la nuit', () => {
    layer.setTint([1, 1, 1]);
    expect(layer.tint).toEqual([1, 1, 1]);
    const shadow = layer.object.getObjectByName('nenuphar-0-ombre') as Mesh;
    const shadowMaterial = shadow.material as MeshBasicMaterial;
    expect(`#${shadowMaterial.color.getHexString()}`).toBe(LILY_PAD_SHADOW_COLOR);
    layer.setTint([0.5, 0.25, 1]);
    expect(layer.tint).toEqual([0.5, 0.25, 1]);
    expect(shadowMaterial.color.getHexString()).not.toBe(LILY_PAD_SHADOW_COLOR.slice(1));
    layer.setTint([1, 1, 1]);
    expect(`#${shadowMaterial.color.getHexString()}`).toBe(LILY_PAD_SHADOW_COLOR);
  });

  it('setPads remplace les feuilles ; une liste vide les retire toutes', () => {
    layer.setPads(PADS.slice(0, 1));
    expect(layer.count).toBe(1);
    expect(layer.object.children).toHaveLength(2);
    layer.setPads([]);
    expect(layer.count).toBe(0);
    expect(layer.object.children).toHaveLength(0);
  });

  it('résolution du contour : bornée à 1 pixel au moins', () => {
    const outline = layer.object.getObjectByName('nenuphar-0-contour') as Mesh;
    const uniform = (outline.material as ShaderMaterial).uniforms['uResolution'].value as Vector2;
    layer.setResolution(427, 241);
    expect(uniform.toArray()).toEqual([427, 241]);
    layer.setResolution(0, -5);
    expect(uniform.toArray()).toEqual([1, 1]);
  });
});

describe('createLilyPadOutlineMaterial', () => {
  it('couleur et épaisseur du contour du décor, faces arrière', () => {
    const material = createLilyPadOutlineMaterial();
    expect(
      `#${(material.uniforms['uColor'].value as { getHexString(): string }).getHexString()}`,
    ).toBe(OUTLINE_COLOR);
    expect(material.uniforms['uWidth'].value).toBe(OUTLINE_WIDTH_PX);
    expect(material.side).toBe(1); // BackSide
    expect(material.vertexShader).toContain('attribute vec3 offset');
    material.dispose();
  });
});
