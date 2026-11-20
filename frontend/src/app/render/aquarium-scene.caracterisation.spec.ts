import {
  HemisphereLight,
  Light,
  LineSegments,
  Mesh,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';

import { lightAt } from '../sim/daylight';
import { ENVIRONMENTS, POND, type Environment } from '../sim/environment';
import { createAquariumScene } from './aquarium-scene';

/**
 * Tests de caractérisation de `createAquariumScene` (#698, tranche 2) : figent la scène
 * construite (ordre des objets, matériaux et leur ordre de création, géométries, couleurs) et
 * l'effet des réglages, avant le découpage de la fonction. Une empreinte qui change signale un
 * changement de rendu.
 */

/** Empreinte FNV-1a 32 bits d'un texte. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function geometrySignature(geometry: BufferGeometry): string {
  const position = geometry.getAttribute('position');
  let sum = 0;
  for (let i = 0; i < position.array.length; i++) {
    sum = (sum * 31 + Math.round(position.array[i] * 1e6)) % 2147483647;
  }
  return `${position.count}:${sum}`;
}

function materialSignature(material: Material, firstId: number): string {
  const color = (material as Material & { color?: { getHexString(): string } }).color;
  return `${material.type}#${material.id - firstId}/${color?.getHexString() ?? '-'}/${material.opacity}`;
}

/** Description de la scène : un élément par objet, dans l'ordre du parcours. */
function sceneSignature(root: Object3D): string {
  const materials: Material[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh || object instanceof LineSegments) {
      const material = object.material as Material | Material[];
      materials.push(...(Array.isArray(material) ? material : [material]));
    }
  });
  const firstId = Math.min(...materials.map((m) => m.id));
  const parts: string[] = [];
  root.traverse((object) => {
    let part = `${object.name}:${object.type}:${object.visible}:${object.renderOrder}:${object.position.toArray().join(',')}`;
    if (object instanceof Mesh || object instanceof LineSegments) {
      const material = object.material as Material | Material[];
      const list = Array.isArray(material) ? material : [material];
      part += `|${geometrySignature(object.geometry)}|${list.map((m) => materialSignature(m, firstId)).join(';')}`;
    }
    if (object instanceof Light) {
      part += `|${object.color.getHexString()}|${object.intensity}`;
    }
    if (object instanceof HemisphereLight) {
      part += `|${object.groundColor.getHexString()}`;
    }
    parts.push(part);
  });
  return parts.join('\n');
}

const CASES: readonly (readonly [string, Environment])[] = [
  ...Object.entries(ENVIRONMENTS),
  ['bassin-ovale', { ...POND, shape: 'ovale' }],
  ['bassin-haricot', { ...POND, shape: 'haricot' }],
];

/** Empreintes relevées avant le découpage (cycle 260). */
const BUILT: Readonly<Record<string, number>> = {
  tropical: 1017082239,
  bassin: 4187999269,
  paludarium: 2405263728,
  recif: 3453396816,
  eaufroide: 1072011087,
  'bassin-ovale': 2218759715,
  'bassin-haricot': 1421194623,
};
const ADJUSTED: Readonly<Record<string, number>> = {
  tropical: 4280690122,
  bassin: 2020461876,
  paludarium: 2714409125,
  recif: 2374940627,
  eaufroide: 2868529292,
  'bassin-ovale': 776372448,
  'bassin-haricot': 2568878948,
};

describe('createAquariumScene (caractérisation, #698)', () => {
  it.each(CASES)('construit la même scène : %s', (name, environment) => {
    const world = createAquariumScene(environment);
    const signature = fnv1a(sceneSignature(world.scene));
    world.dispose();
    expect(signature).toBe(BUILT[name]);
  });

  it.each(CASES)('applique les mêmes réglages : %s', (name, environment) => {
    const world = createAquariumScene(environment);
    world.setDaylight(lightAt(21));
    world.setOvercast(0.6);
    world.setTurbidity(0.5);
    world.setTea(1);
    world.setViewpoint(0, -0.5, 3);
    const signature = fnv1a(sceneSignature(world.scene));
    world.dispose();
    expect(signature).toBe(ADJUSTED[name]);
  });
});
