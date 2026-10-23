import { BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, Vector2 } from 'three';

import { anemoneBaseY, anemoneLayout, anemoneModel } from '../sim/anemones';
import { coralBaseY, coralLayout, coralModel } from '../sim/corals';
import { DEFAULT_DECOR, decorBaseY, type DecorItem } from '../sim/decor';
import { REEF } from '../sim/environment';
import { plantModel } from '../sim/plant';
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
      expect(group.position.y).toBe(decorBaseY(item));
      expect(group.rotation.y).toBe(item.rotation);
      const name = item.kind === 'plant' ? `plante-${i}` : `rocher-${i}`;
      expect(group.name).toBe(name);
      expect(group.children.map((c) => c.name)).toEqual([`${name}-contour`, `${name}-voxels`]);
    });
    expect(layer.plantCount).toBe(DEFAULT_DECOR.filter((d) => d.kind === 'plant').length);
    layer.dispose();
  });

  describe('plantes qui ondulent', () => {
    const PLANT: DecorItem = {
      kind: 'plant',
      form: 'tall',
      x: 0,
      z: 0,
      rotation: 0.9,
      scale: 1,
      seed: 7,
    };

    function positions(layer: DecorLayer, name: string): Float32Array {
      const mesh = layer.object.getObjectByName(name) as Mesh;
      return (mesh.geometry as BufferGeometry).getAttribute('position').array as Float32Array;
    }

    it('update réécrit les positions en place, partagées par le maillage et sa coque', () => {
      const layer = new DecorLayer();
      layer.setDecor([PLANT]);
      const voxels = layer.object.getObjectByName('plante-0-voxels') as Mesh;
      const hull = layer.object.getObjectByName('plante-0-contour') as Mesh;
      const attribute = (voxels.geometry as BufferGeometry).getAttribute(
        'position',
      ) as BufferAttribute;
      expect((hull.geometry as BufferGeometry).getAttribute('position')).toBe(attribute);
      const array = attribute.array;
      const before = attribute.version;
      layer.update(1.3);
      const a = Float32Array.from(positions(layer, 'plante-0-voxels'));
      layer.update(2.1);
      expect(positions(layer, 'plante-0-voxels')).toBe(array); // aucune réallocation
      expect(attribute.version).toBeGreaterThan(before);
      expect(positions(layer, 'plante-0-voxels')).not.toEqual(a);
      layer.update(1.3);
      expect(positions(layer, 'plante-0-voxels')).toEqual(a); // même temps, même pose
      expect(voxels.frustumCulled).toBe(false);
      layer.dispose();
    });

    it('le déplacement reste dans la borne de l’ondulation, nul à la racine', () => {
      const layer = new DecorLayer();
      layer.setDecor([PLANT]);
      const model = plantModel(PLANT.seed, PLANT.scale, 'tall');
      const rest = Float32Array.from(positions(layer, 'plante-0-voxels'));
      layer.update(0);
      const top = model.height * model.voxelSize;
      for (const time of [0.4, 3.7, 12.25]) {
        layer.update(time);
        const now = positions(layer, 'plante-0-voxels');
        for (let n = 0; n < now.length; n += 3) {
          const h = Math.min(1, now[n + 1] / top);
          const moved = Math.hypot(now[n] - rest[n], now[n + 2] - rest[n + 2]);
          expect(now[n + 1]).toBe(rest[n + 1]);
          expect(moved).toBeLessThanOrEqual(model.amplitude * h * h + 1e-6);
        }
      }
      layer.dispose();
    });

    it('les rochers ne bougent pas, un décor sans plante ne fait rien à update', () => {
      const layer = new DecorLayer();
      const rock = DEFAULT_DECOR.find((d) => d.kind === 'rock') as DecorItem;
      layer.setDecor([rock]);
      const before = Float32Array.from(positions(layer, 'rocher-0-voxels'));
      layer.update(5);
      expect(positions(layer, 'rocher-0-voxels')).toEqual(before);
      expect(layer.plantCount).toBe(0);
      layer.dispose();
    });
  });

  it('coraux (#149) : un groupe par colonie après le décor, posé et tourné d’un quart de tour', () => {
    const layer = new DecorLayer();
    const colonies = coralLayout(42, REEF.dimensions, REEF.corals, REEF.decor);
    layer.setDecor(REEF.decor, colonies);
    expect(layer.coralCount).toBe(colonies.length);
    expect(layer.count).toBe(REEF.decor.length + colonies.length);
    colonies.forEach((colony, n) => {
      const group = layer.object.children[REEF.decor.length + n];
      const v = coralModel(colony.form, colony.seed, colony.scale).voxelSize;
      expect(group.name).toBe(`corail-${n}`);
      expect(group.position.toArray()).toEqual([colony.x, coralBaseY(v), colony.z]);
      expect(group.rotation.y).toBe((colony.quarterTurns * Math.PI) / 2);
      expect(group.children.map((c) => c.name)).toEqual([
        `corail-${n}-contour`,
        `corail-${n}-voxels`,
      ]);
      for (const mesh of group.children as Mesh[]) {
        expect(mesh.renderOrder).toBe(DECOR_RENDER_ORDER);
      }
    });
    // Sans corail (par défaut) : aucun.
    layer.setDecor(REEF.decor);
    expect(layer.coralCount).toBe(0);
    expect(layer.count).toBe(REEF.decor.length);
    layer.dispose();
    expect(layer.coralCount).toBe(0);
  });

  it('anémones (#150) : après les coraux, posées sur le sable, tentacules qui ondulent, pied fixe', () => {
    const layer = new DecorLayer();
    const anemones = anemoneLayout(42, REEF.dimensions, REEF.anemones, REEF.decor);
    expect(anemones.length).toBeGreaterThanOrEqual(2);
    layer.setDecor(REEF.decor, [], anemones);
    expect(layer.anemoneCount).toBe(anemones.length);
    expect(layer.count).toBe(REEF.decor.length + anemones.length);
    // Ondulent comme des plantes : réécrites par `update`.
    expect(layer.plantCount).toBe(anemones.length);
    const group = layer.object.children[REEF.decor.length];
    const model = anemoneModel(anemones[0].seed, anemones[0].scale);
    expect(group.name).toBe('anemone-0');
    expect(group.position.toArray()).toEqual([
      anemones[0].x,
      anemoneBaseY(model.voxelSize),
      anemones[0].z,
    ]);
    const mesh = group.children[1] as Mesh;
    const hull = group.children[0] as Mesh;
    expect(mesh.geometry.getAttribute('position')).toBe(hull.geometry.getAttribute('position'));
    const read = () => Array.from(mesh.geometry.getAttribute('position').array as Float32Array);
    layer.update(0);
    const t0 = read();
    layer.update(1.7);
    const t1 = read();
    const columnTop = 3 * model.voxelSize + 1e-6;
    let moved = 0;
    for (let n = 0; n < t0.length; n += 3) {
      expect(t1[n + 1]).toBe(t0[n + 1]);
      if (t0[n + 1] <= columnTop - 2e-6 || (t0[n + 1] < 1e-9 && t1[n + 1] < 1e-9)) {
        // Sous le haut du pied : immobile.
        expect([t1[n], t1[n + 2]]).toEqual([t0[n], t0[n + 2]]);
      } else if (t1[n] !== t0[n] || t1[n + 2] !== t0[n + 2]) {
        moved += 1;
      }
    }
    expect(moved).toBeGreaterThan(100);
    layer.setDecor(REEF.decor);
    expect(layer.anemoneCount).toBe(0);
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
