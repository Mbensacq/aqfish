import { Mesh, ShaderMaterial, Vector2, type MeshBasicMaterial } from 'three';

import { environmentWater, POND } from '../sim/environment';
import { MAX_SEED } from '../core/random/prng';
import { LILY_PAD_EDGE_MARGIN, lilyPadLayout, lilyPadPose } from '../sim/lily-pads';
import { SAND_THICKNESS, WATER_LEVEL_RATIO } from '../sim/tank';
import { DECOR_RENDER_ORDER, OUTLINE_COLOR, OUTLINE_WIDTH_PX } from './decor-layer';
import { FISH_RENDER_ORDER } from './fish-layer';
import {
  createLilyPadOutlineMaterial,
  FLOWER_OUTLINE_RENDER_ORDER,
  FLOWER_RENDER_ORDER,
  LILY_PAD_LIFT,
  LILY_PAD_SHADOW_COLOR,
  LILY_PAD_SHADOW_OFFSET,
  LILY_PAD_SHADOW_RENDER_ORDER,
  LilyPadLayer,
} from './lily-pad-layer';
import {
  FLOWER_OFFSET_RATIO,
  flowerSpread,
  LILY_FLOWER_COLORS,
  LOTUS_FLOWER_SCALE,
  LOTUS_STALK_HEIGHT,
  PETAL_RINGS,
} from './lily-flower-model';
import { LILY_PAD_THICKNESS } from './lily-pad-model';
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

describe('LilyPadLayer : fleurs (issue #104)', () => {
  let layer: LilyPadLayer;

  beforeEach(() => {
    layer = new LilyPadLayer(POND.dimensions);
    layer.setPads(PADS);
  });

  afterEach(() => layer.dispose());

  const petalsPerFlower = PETAL_RINGS.reduce((sum, ring) => sum + ring.count, 0);

  it('une fleur sur chaque nénuphar fleuri et chaque lotus, aucune sur une feuille nue', () => {
    const blooming = PADS.filter((pad) => pad.kind !== 'feuille');
    expect(blooming.length).toBeGreaterThan(0);
    expect(layer.flowerCount).toBe(blooming.length);
    PADS.forEach((pad, n) => {
      const flower = layer.object.getObjectByName(`nenuphar-${n}-fleur`);
      expect(flower !== undefined).toBe(pad.kind !== 'feuille');
      if (!flower) {
        return;
      }
      // Attachée à la feuille : elle suit sa pose (dérive et balancement).
      expect(flower.parent!.name).toBe(`nenuphar-${n}`);
      const names: string[] = [];
      flower.traverse((o) => names.push(o.name));
      expect(names.filter((name) => name === `nenuphar-${n}-petale`)).toHaveLength(petalsPerFlower);
      expect(names.filter((name) => name === `nenuphar-${n}-petale-contour`)).toHaveLength(
        petalsPerFlower,
      );
      expect(names).toContain(`nenuphar-${n}-coeur`);
      expect(names.includes(`nenuphar-${n}-tige`)).toBe(pad.kind === 'lotus');
      // Posée sur la feuille, du côté opposé à l'encoche (−X local).
      expect(flower.position.x).toBeCloseTo(-FLOWER_OFFSET_RATIO * pad.radius, 12);
      expect(flower.position.y).toBe(LILY_PAD_THICKNESS);
      flower.traverse((o) => {
        if (o instanceof Mesh) {
          const outline = o.name.endsWith('-contour');
          expect(o.renderOrder).toBe(outline ? FLOWER_OUTLINE_RENDER_ORDER : FLOWER_RENDER_ORDER);
          expect((o.material as MeshBasicMaterial).depthWrite).toBe(!outline);
        }
      });
    });
  });

  it('ordre : feuilles, puis contours des fleurs, puis fleurs, puis poissons', () => {
    expect(FLOWER_OUTLINE_RENDER_ORDER).toBeGreaterThan(DECOR_RENDER_ORDER);
    expect(FLOWER_RENDER_ORDER).toBeGreaterThan(FLOWER_OUTLINE_RENDER_ORDER);
    expect(FLOWER_RENDER_ORDER).toBeLessThan(FISH_RENDER_ORDER);
  });

  it('lotus : fleur plus grande, au bout de sa tige ; nénuphar : fleur sur la feuille', () => {
    PADS.forEach((pad, n) => {
      const flower = layer.object.getObjectByName(`nenuphar-${n}-fleur`);
      if (!flower) {
        return;
      }
      const head = flower.children.find((c) => c.name === '')!;
      const lotus = pad.kind === 'lotus';
      expect(head.position.y).toBe(lotus ? LOTUS_STALK_HEIGHT : 0);
      expect(head.scale.x).toBe(lotus ? LOTUS_FLOWER_SCALE : 1);
      expect(head.rotation.y).toBe(pad.flowerTwist);
    });
    expect(PADS.some((pad) => pad.kind === 'lotus')).toBe(true);
  });

  it.each([0, 1, 7, 42, 1234, MAX_SEED])(
    'vue de dessus, une fleur grande ouverte tient dans sa feuille (graine %s)',
    (seed) => {
      for (const pad of lilyPadLayout(seed, environmentWater('bassin'), POND.lilyPads)) {
        const scale = pad.kind === 'lotus' ? LOTUS_FLOWER_SCALE : 1;
        expect(FLOWER_OFFSET_RATIO * pad.radius + scale * flowerSpread(1)).toBeLessThan(pad.radius);
      }
    },
  );

  it('ouverture : pétales penchés selon petalTilt ; conservée par setPads', () => {
    const tilts = () => {
      const values: number[] = [];
      layer.object.traverse((o) => {
        if (o.name.endsWith('-petale')) {
          values.push(-o.parent!.rotation.z);
        }
      });
      return values;
    };
    const expected = (openness: number) =>
      PADS.filter((pad) => pad.kind !== 'feuille').flatMap(() =>
        PETAL_RINGS.flatMap((ring) =>
          Array.from(
            { length: ring.count },
            () => ring.closedTilt + (ring.openTilt - ring.closedTilt) * openness,
          ),
        ),
      );
    expect(layer.flowerOpenness).toBe(1);
    expect(tilts()).toEqual(expected(1));
    layer.setOpenness(0);
    expect(tilts()).toEqual(expected(0));
    layer.setOpenness(0.5);
    tilts().forEach((t, i) => expect(t).toBeCloseTo(expected(0.5)[i], 12));
    layer.setPads(PADS);
    expect(layer.flowerOpenness).toBe(0.5);
    tilts().forEach((t, i) => expect(t).toBeCloseTo(expected(0.5)[i], 12));
  });

  it('refuse une ouverture hors de [0, 1] sans rien changer', () => {
    layer.setOpenness(0.25);
    expect(() => layer.setOpenness(1.5)).toThrow(RangeError);
    expect(layer.flowerOpenness).toBe(0.25);
  });

  it('teinte : couleurs de la palette en plein jour, multipliées la nuit', () => {
    layer.setTint([1, 1, 1]);
    expect(`#${layer.petalColor.getHexString()}`).toBe(LILY_FLOWER_COLORS.petal);
    layer.setTint([0.5, 0.25, 1]);
    const base = new Mesh().material as MeshBasicMaterial;
    base.color.set(LILY_FLOWER_COLORS.petal);
    expect(layer.petalColor.r).toBeCloseTo(base.color.r * 0.5, 12);
    expect(layer.petalColor.g).toBeCloseTo(base.color.g * 0.25, 12);
    expect(layer.petalColor.b).toBeCloseTo(base.color.b, 12);
    base.dispose();
  });

  it('setPads([]) retire toutes les fleurs', () => {
    layer.setPads([]);
    expect(layer.flowerCount).toBe(0);
    layer.setOpenness(0.3);
    expect(layer.flowerOpenness).toBe(0.3);
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
