import {
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  type Material,
} from 'three';

import { lightAt } from '../sim/daylight';
import {
  environmentWater,
  ENVIRONMENTS,
  PALUDARIUM,
  POND,
  REEF,
  TROPICAL_TANK,
} from '../sim/environment';
import {
  createAquariumScene,
  DAY_AMBIENT_INTENSITY,
  DAY_SUN_INTENSITY,
  DEFAULT_TANK,
  NIGHT_AMBIENT_INTENSITY,
  NIGHT_GROUND,
  NIGHT_SAND_BOTTOM,
  NIGHT_WATER_BODY,
  NIGHT_WATER_SURFACE,
  paletteColor,
  SAND_THICKNESS,
  TERRAIN_WATER_INSET,
  TURBID_BODY_MIX,
  TURBID_SURFACE_MIX,
  TURBID_WATER_BODY,
  WATER_LEVEL_RATIO,
} from './aquarium-scene';
import { ENVIRONMENT_TONES, isEnvironmentToneName, PALETTE } from './palette';
import { RAIN_TONES } from './overcast';

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
    const world = createAquariumScene({
      ...TROPICAL_TANK,
      dimensions: { width: 0.4, height: 0.3, depth: 0.25 },
    });
    const glass = new Box3().setFromObject(world.scene.getObjectByName('verre') as Mesh);
    expect(glass.max.x - glass.min.x).toBeCloseTo(0.408);
    expect(world.dimensions.height).toBe(0.3);
  });
});

describe('createAquariumScene : lumière du jour', () => {
  function parts(scene = createAquariumScene()) {
    const ambient = scene.scene.getObjectByName('lumiere-ambiante') as HemisphereLight;
    const sun = scene.scene.getObjectByName('soleil') as DirectionalLight;
    const water = scene.scene.getObjectByName('eau') as Mesh;
    const [body, , surface] = water.material as MeshBasicMaterial[];
    const sand = scene.scene.getObjectByName('sable') as Mesh;
    const sandBottom = (sand.material as MeshBasicMaterial[])[3];
    return { scene, ambient, sun, body, surface, sandBottom };
  }

  /** Empreinte exacte (bits des flottants) de l'éclairage et de l'eau. */
  function fingerprint(p: ReturnType<typeof parts>): number[] {
    return [
      p.ambient.intensity,
      ...p.ambient.color.toArray(),
      ...p.ambient.groundColor.toArray(),
      p.sun.intensity,
      ...p.sun.color.toArray(),
      ...p.body.color.toArray(),
      ...p.surface.color.toArray(),
      ...p.sandBottom.color.toArray(),
    ];
  }

  it('à midi, la scène est exactement celle d’avant le cycle jour/nuit', () => {
    const p = parts();
    const before = fingerprint(p);
    expect(p.ambient.intensity).toBe(DAY_AMBIENT_INTENSITY);
    expect(p.sun.intensity).toBe(DAY_SUN_INTENSITY);
    expect(hex(p.body)).toBe(PALETTE.eauMoyenne);
    // Après une nuit puis un retour à midi : valeurs identiques au bit près.
    p.scene.setDaylight(lightAt(0));
    p.scene.setDaylight(lightAt(12));
    expect(fingerprint(p)).toEqual(before);
    expect(p.ambient.color.getHexString()).toBe('ffffff');
    expect(p.sun.color.getHexString()).toBe('ffffff');
  });

  it('la nuit : lumières plus faibles et bleutées, eau plus profonde, ambiance non nulle', () => {
    const p = parts();
    p.scene.setDaylight(lightAt(0));
    expect(p.ambient.intensity).toBe(NIGHT_AMBIENT_INTENSITY);
    expect(p.ambient.intensity).toBeGreaterThan(0);
    expect(p.sun.intensity).toBeLessThan(DAY_SUN_INTENSITY);
    expect(p.sun.intensity).toBeGreaterThan(0);
    expect(p.sun.color.b).toBeGreaterThan(p.sun.color.r);
    // Eau de nuit bleue et saturée (#73, ADR 0021), ramenée aux tons de nuit par la passe.
    expect(hex(p.body)).toBe(NIGHT_WATER_BODY);
    expect(hex(p.surface)).toBe(NIGHT_WATER_SURFACE);
    expect(p.body.color.b).toBeGreaterThan(p.body.color.g);
    expect(`#${p.ambient.groundColor.getHexString()}`).toBe(NIGHT_GROUND);
    expect(hex(p.sandBottom)).toBe(NIGHT_SAND_BOTTOM);
  });

  it('trouble de l’eau (#207) : teinte verdâtre de jour, rien d’autre ne change', () => {
    const p = parts();
    const before = fingerprint(p);
    expect(p.scene.turbidity).toBe(0);
    p.scene.setTurbidity(1);
    expect(p.scene.turbidity).toBe(1);
    const expected = new Color(PALETTE.eauMoyenne).lerpColors(
      new Color(PALETTE.eauMoyenne),
      new Color(TURBID_WATER_BODY),
      TURBID_BODY_MIX,
    );
    expect(p.body.color.equals(expected)).toBe(true);
    expect(TURBID_SURFACE_MIX).toBeGreaterThan(0);
    expect(hex(p.surface)).not.toBe(PALETTE.eauClaire);
    // Plus vert que bleu : verdâtre.
    expect(p.body.color.g).toBeGreaterThan(p.body.color.b);
    // La nuit, le trouble suit sous la teinte de nuit ; retour à 0 : scène d'origine au bit près.
    p.scene.setDaylight(lightAt(0));
    p.scene.setDaylight(lightAt(12));
    p.scene.setTurbidity(0);
    expect(fingerprint(p)).toEqual(before);
  });

  it('eau brun-thé des feuilles de catappa (#239) : teinte seulement, retour au bit près', () => {
    const p = parts();
    const before = fingerprint(p);
    expect(p.scene.tea).toBe(0);
    p.scene.setTea(1);
    expect(p.scene.tea).toBe(1);
    // Plus rouge que bleu : brun-thé.
    expect(p.body.color.r).toBeGreaterThan(p.body.color.b);
    expect(p.surface.color.r).toBeGreaterThan(p.surface.color.b);
    // Le trouble passe par-dessus la teinte.
    p.scene.setTurbidity(1);
    expect(p.body.color.g).toBeGreaterThan(p.body.color.b);
    p.scene.setTurbidity(0);
    p.scene.setTea(0);
    expect(fingerprint(p)).toEqual(before);
    for (const value of [-0.1, 1.1, Number.NaN]) {
      expect(() => p.scene.setTea(value)).toThrow(RangeError);
    }
  });

  it('trouble de l’eau : refuse une valeur hors de [0, 1]', () => {
    const p = parts();
    for (const value of [-0.1, 1.1, Number.NaN]) {
      expect(() => p.scene.setTurbidity(value)).toThrow(RangeError);
    }
    expect(p.scene.turbidity).toBe(0);
  });

  it('ciel couvert (#123) : lumières et eau plus sombres, teintes intactes, retour au bit près', () => {
    const p = parts();
    const before = fingerprint(p);
    expect(p.scene.overcast).toBe(1);
    p.scene.setOvercast(0.85);
    expect(p.scene.overcast).toBe(0.85);
    expect(p.ambient.intensity).toBeCloseTo(DAY_AMBIENT_INTENSITY * 0.85, 12);
    expect(p.sun.intensity).toBeCloseTo(DAY_SUN_INTENSITY * 0.85, 12);
    // Teintes des lumières inchangées : aucun ton chaud ni bleuté à midi.
    expect(p.ambient.color.getHexString()).toBe('ffffff');
    expect(p.sun.color.getHexString()).toBe('ffffff');
    const day = new Color(PALETTE.eauMoyenne);
    expect(p.body.color.r).toBeCloseTo(day.r * 0.85, 12);
    expect(p.body.color.g).toBeCloseTo(day.g * 0.85, 12);
    expect(p.body.color.b).toBeCloseTo(day.b * 0.85, 12);
    // Suit la lumière du jour : la nuit sous la pluie, plus sombre que la nuit seule.
    p.scene.setDaylight(lightAt(0));
    expect(p.ambient.intensity).toBeCloseTo(NIGHT_AMBIENT_INTENSITY * 0.85, 12);
    // Le trouble et la teinte brun-thé se recalculent sous le ciel couvert.
    p.scene.setTurbidity(0.5);
    p.scene.setTurbidity(0);
    p.scene.setDaylight(lightAt(12));
    p.scene.setOvercast(1);
    expect(fingerprint(p)).toEqual(before);
  });

  it('ciel couvert : refuse une valeur hors de ]0, 1]', () => {
    const p = parts();
    for (const value of [0, -0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => p.scene.setOvercast(value)).toThrow(RangeError);
    }
    expect(p.scene.overcast).toBe(1);
  });

  it('au crépuscule : lumière orangée, intensités entre la nuit et le jour', () => {
    const p = parts();
    p.scene.setDaylight(lightAt(18));
    expect(p.sun.color.r).toBeGreaterThan(p.sun.color.b);
    expect(p.ambient.intensity).toBeGreaterThan(NIGHT_AMBIENT_INTENSITY);
    expect(p.ambient.intensity).toBeLessThan(DAY_AMBIENT_INTENSITY);
  });
});

describe('createAquariumScene : environnements (#87)', () => {
  it('chaque teinte de chaque environnement est une couleur de la palette', () => {
    for (const env of Object.values(ENVIRONMENTS)) {
      const names = [...Object.values(env.water), ...Object.values(env.ground)];
      for (const name of names) {
        expect(Object.keys(PALETTE)).toContain(name);
      }
      // Tons d'environnement (#148, ADR 0039) : déclarés dans `ENVIRONMENT_TONES`.
      for (const tone of env.tones) {
        expect(isEnvironmentToneName(tone)).toBe(true);
      }
    }
  });

  it('le récif (#148) : vitres, sol sans berge, eau teintée de bleu saturé', () => {
    const { scene, environment, dimensions } = createAquariumScene(REEF);
    expect(environment).toBe(REEF);
    expect(dimensions).toBe(REEF.dimensions);
    expect(scene.getObjectByName('verre')).toBeDefined();
    expect(scene.getObjectByName('margelle')).toBeUndefined();
    expect(scene.getObjectByName('sol-paludarium')).toBeUndefined();
    const sand = scene.getObjectByName('sable') as Mesh;
    expect(hex(materials(sand)[2])).toBe(PALETTE.koiBlanc);
    const water = scene.getObjectByName('eau') as Mesh;
    // Teinte d'entrée bleu néon : l'image retombe sur les tons du récif (ADR 0039).
    expect(hex(materials(water)[0])).toBe(PALETTE.neonBleu);
    expect(hex(materials(water)[2])).toBe(PALETTE.neonBleu);
    // Tous les tons d'environnement sont ceux du récif, sauf l'eau brun-thé (#239), proposée
    // dans tous les environnements quand l'eau est teintée, et le ciel couvert de la pluie (#123).
    expect(Object.keys(ENVIRONMENT_TONES)).toEqual([
      ...REEF.tones,
      'eauThe',
      'eauTheClaire',
      ...RAIN_TONES,
    ]);
  });

  it('paletteColor refuse un nom inconnu ou hérité du prototype', () => {
    expect(paletteColor('eauMoyenne')).toBe(PALETTE.eauMoyenne);
    expect(() => paletteColor('bleuInconnu')).toThrow(RangeError);
    expect(() => paletteColor('constructor')).toThrow(RangeError);
  });

  it('refuse un environnement dont une teinte est hors palette', () => {
    expect(() =>
      createAquariumScene({ ...POND, water: { body: '#123456', surface: 'eauClaire' } }),
    ).toThrow(RangeError);
  });

  it('le bac tropical garde ses vitres, ses arêtes et ses couleurs d’avant', () => {
    const { scene, environment } = createAquariumScene(TROPICAL_TANK);
    expect(environment).toBe(TROPICAL_TANK);
    expect(scene.getObjectByName('verre')).toBeDefined();
    expect(scene.getObjectByName('margelle')).toBeUndefined();
    expect(scene.getObjectByName('berge')).toBeUndefined();
    const sand = scene.getObjectByName('sable') as Mesh;
    expect(materials(sand).map(hex)).toEqual([
      PALETTE.sable,
      PALETTE.sable,
      PALETTE.sableClair,
      PALETTE.sableSombre,
      PALETTE.sable,
      PALETTE.sable,
    ]);
    const water = scene.getObjectByName('eau') as Mesh;
    expect(hex(materials(water)[0])).toBe(PALETTE.eauMoyenne);
    expect(hex(materials(water)[2])).toBe(PALETTE.eauClaire);
  });

  it('le bassin a une margelle de pierre, pas de vitres, et ses propres teintes', () => {
    const { scene, dimensions } = createAquariumScene(POND);
    expect(dimensions).toBe(POND.dimensions);
    expect(scene.getObjectByName('verre')).toBeUndefined();
    expect(scene.getObjectByName('aretes')).toBeUndefined();
    expect(scene.getObjectByName('berge')).toBeUndefined();
    const border = scene.getObjectByName('margelle');
    expect(border?.children.length).toBeGreaterThan(8);
    const water = scene.getObjectByName('eau') as Mesh;
    expect(hex(materials(water)[0])).toBe(paletteColor(POND.water.body));
    expect(hex(materials(water)[2])).toBe(paletteColor(POND.water.surface));
    const sand = scene.getObjectByName('sable') as Mesh;
    expect(hex(materials(sand)[2])).toBe(paletteColor(POND.ground.top));
    const box = new Box3().setFromObject(water);
    expect(box.max.x - box.min.x).toBeCloseTo(POND.dimensions.width);
    expect(box.max.z - box.min.z).toBeCloseTo(POND.dimensions.depth);
  });

  it('le paludarium (#129) : vitres, sol en berge à la place du sable, eau à son niveau', () => {
    const { scene, dimensions } = createAquariumScene(PALUDARIUM);
    expect(dimensions).toBe(PALUDARIUM.dimensions);
    expect(scene.getObjectByName('verre')).toBeDefined();
    expect(scene.getObjectByName('aretes')).toBeDefined();
    expect(scene.getObjectByName('margelle')).toBeUndefined();
    expect(scene.getObjectByName('sable')).toBeUndefined();
    const ground = scene.getObjectByName('sol-paludarium') as Mesh;
    expect(ground).toBeInstanceOf(Mesh);
    // Mousses et racines de la berge (#132).
    expect(scene.getObjectByName('mousses')).toBeInstanceOf(Mesh);
    expect(scene.getObjectByName('racines')).toBeInstanceOf(Mesh);
    const water = scene.getObjectByName('eau') as Mesh;
    const box = new Box3().setFromObject(water);
    const expected = environmentWater('paludarium');
    expect(box.max.y).toBeCloseTo(expected.maxY, 6);
    expect(box.min.y).toBeCloseTo(expected.minY, 6);
    // Eau en retrait des vitres : les flancs du sol passent devant.
    expect(box.max.x).toBeCloseTo(expected.maxX - TERRAIN_WATER_INSET, 6);
    expect(box.min.z).toBeCloseTo(expected.minZ + TERRAIN_WATER_INSET, 6);
    // La berge émerge : le sol dépasse la surface de l'eau.
    expect(new Box3().setFromObject(ground).max.y).toBeGreaterThan(expected.maxY);
  });

  it('le dessous du sol du paludarium s’assombrit la nuit, comme le sable du bac', () => {
    const world = createAquariumScene(PALUDARIUM);
    const ground = world.scene.getObjectByName('sol-paludarium') as Mesh;
    const bottom = materials(ground).at(-1) as MeshBasicMaterial;
    world.setDaylight(lightAt(12));
    expect(hex(bottom)).toBe(paletteColor(PALUDARIUM.ground.bottom));
    world.setDaylight(lightAt(0));
    expect(hex(bottom)).not.toBe(paletteColor(PALUDARIUM.ground.bottom));
    world.setViewpoint(0, -1, 0);
    expect(ground.visible).toBe(true);
  });

  it('le bassin est enterré : un sol l’entoure, absent du bac tropical (#105)', () => {
    expect(createAquariumScene(POND).scene.getObjectByName('sol-bassin')).toBeDefined();
    expect(createAquariumScene(TROPICAL_TANK).scene.getObjectByName('sol-bassin')).toBeUndefined();
  });

  it('coupe le sol et la margelle du côté d’une caméra passée sous le sol (#105)', () => {
    const world = createAquariumScene(POND);
    const hiddenNames = () => {
      const names: string[] = [];
      world.scene.traverse((o) => {
        if (!o.visible) {
          names.push(o.name);
        }
      });
      return names;
    };
    // Vue de côté (+X, à mi-hauteur) : le côté +X est retiré.
    world.setViewpoint(3.4, 0.2, 0);
    const hidden = hiddenNames();
    expect(hidden.some((n) => n.startsWith('pierre-'))).toBe(true);
    expect(hidden.some((n) => n.startsWith('sol-'))).toBe(true);
    expect(world.scene.getObjectByName('eau')?.visible).toBe(true);
    // Vue de trois-quarts (au-dessus du sol) : tout est rendu.
    world.setViewpoint(1.8, 1.6, 2.4);
    expect(hiddenNames()).toEqual([]);
  });

  it('le point de vue ne change rien au bac tropical', () => {
    const world = createAquariumScene(TROPICAL_TANK);
    world.setViewpoint(3, 0.1, 0);
    let hidden = 0;
    world.scene.traverse((o) => {
      hidden += o.visible ? 0 : 1;
    });
    expect(hidden).toBe(0);
  });

  it('la margelle ne luit pas à midi et luit la nuit', () => {
    const world = createAquariumScene(POND);
    const stone = world.scene.getObjectByName('pierre-0') as Mesh;
    const emissive = () =>
      (materials(stone)[0] as unknown as { emissive: Color }).emissive.getHexString();
    world.setDaylight(lightAt(12));
    expect(emissive()).toBe('000000');
    world.setDaylight(lightAt(0));
    expect(emissive()).not.toBe('000000');
  });
});
