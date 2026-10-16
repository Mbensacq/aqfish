import { Box3, Color, Mesh, MeshBasicMaterial, type Material } from 'three';

import {
  createAquariumScene,
  DEFAULT_TANK,
  SAND_THICKNESS,
  WATER_LEVEL_RATIO,
} from './aquarium-scene';
import { PALETTE } from './palette';

function mesh(name: string): Mesh {
  const object = createAquariumScene().scene.getObjectByName(name);
  expect(object).toBeInstanceOf(Mesh);
  return object as Mesh;
}

function materials(m: Mesh): Material[] {
  return Array.isArray(m.material) ? m.material : [m.material];
}

function hex(material: Material): string {
  return `#${(material as MeshBasicMaterial).color.getHexString()}`;
}

describe('createAquariumScene', () => {
  it('contient le sable, l’eau, le verre et ses arêtes', () => {
    const { scene } = createAquariumScene();
    for (const name of ['sable', 'eau', 'verre', 'aretes', 'lumieres']) {
      expect(scene.getObjectByName(name)).toBeDefined();
    }
  });

  it('pose le sable sur le fond (y = 0) et l’eau au-dessus jusqu’au niveau voulu', () => {
    const sand = new Box3().setFromObject(mesh('sable'));
    const water = new Box3().setFromObject(mesh('eau'));
    expect(sand.min.y).toBeCloseTo(0);
    expect(sand.max.y).toBeCloseTo(SAND_THICKNESS);
    expect(water.min.y).toBeCloseTo(SAND_THICKNESS);
    expect(water.max.y).toBeCloseTo(DEFAULT_TANK.height * WATER_LEVEL_RATIO);
  });

  it('centre le bac sur l’origine en X et Z et le vitrage englobe l’eau', () => {
    const glass = new Box3().setFromObject(mesh('verre'));
    const water = new Box3().setFromObject(mesh('eau'));
    expect(glass.getCenter(water.min.clone()).x).toBeCloseTo(0);
    expect(glass.getCenter(water.min.clone()).z).toBeCloseTo(0);
    expect(glass.containsBox(water)).toBe(true);
  });

  it('n’utilise que des couleurs de la palette pour les surfaces', () => {
    const allowed = new Set(Object.values(PALETTE).map((c) => `#${new Color(c).getHexString()}`));
    for (const name of ['sable', 'eau', 'verre']) {
      for (const material of materials(mesh(name))) {
        expect(allowed).toContain(hex(material));
      }
    }
  });

  it('utilise les couleurs d’eau et de sable de la palette de départ', () => {
    const water = materials(mesh('eau')).map(hex);
    const sand = materials(mesh('sable')).map(hex);
    expect(water).toContain(PALETTE.eauMoyenne);
    expect(water).toContain(PALETTE.eauClaire);
    expect(sand).toContain(PALETTE.sableClair);
    expect(sand).toContain(PALETTE.sable);
  });

  it('rend l’eau et le verre translucides sans écriture de profondeur', () => {
    for (const name of ['eau', 'verre']) {
      for (const material of materials(mesh(name))) {
        expect(material.transparent).toBe(true);
        expect(material.opacity).toBeLessThan(1);
        expect(material.depthWrite).toBe(false);
      }
    }
  });

  it('libère chaque géométrie et chaque matériau exactement une fois', () => {
    const world = createAquariumScene();
    const resources = new Set<{ addEventListener: Mesh['addEventListener'] }>();
    world.scene.traverse((object) => {
      if ('geometry' in object && 'material' in object) {
        const target = object as Mesh;
        resources.add(target.geometry);
        materials(target).forEach((m) => resources.add(m));
      }
    });
    const counts = new Map<object, number>();
    resources.forEach((r) =>
      r.addEventListener('dispose', () => counts.set(r, (counts.get(r) ?? 0) + 1)),
    );
    world.dispose();
    // 4 géométries (sable, eau, verre, arêtes) + 7 matériaux (3 sable, 2 eau, verre, arêtes).
    expect(resources.size).toBe(11);
    expect([...resources].every((r) => counts.get(r) === 1)).toBe(true);
  });

  it('accepte des dimensions personnalisées', () => {
    const world = createAquariumScene({ width: 0.4, height: 0.3, depth: 0.25 });
    const glass = new Box3().setFromObject(world.scene.getObjectByName('verre') as Mesh);
    expect(glass.max.x - glass.min.x).toBeCloseTo(0.408);
    expect(world.dimensions.height).toBe(0.3);
  });
});
