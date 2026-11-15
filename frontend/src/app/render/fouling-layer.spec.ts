import { Color, Mesh } from 'three';

import { environmentWater } from '../sim/environment';
import { NO_FOULING, sampleFouling, worldFouling } from '../sim/fouling';
import { initialMaintenance } from '../sim/maintenance';
import {
  FOULING_COLORS,
  FOULING_FLOOR_LIFT,
  FOULING_PIXEL,
  FoulingLayer,
  buildFoulingGeometry,
  cellHash,
  clumpNoise,
  foulingCells,
  foulingOrder,
  shownCells,
} from './fouling-layer';

const WATER = environmentWater({ environment: 'tropical' });

describe('cellHash et clumpNoise', () => {
  it('restent dans [0, 1[ et sont déterministes', () => {
    for (let i = -20; i < 20; i += 3) {
      for (let j = -5; j < 40; j += 4) {
        const h = cellHash(i, j, 3);
        const n = clumpNoise(i, j, 3);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(1);
        expect(cellHash(i, j, 3)).toBe(h);
      }
    }
  });

  it('le bruit varie peu d’une case à sa voisine : des touffes, pas du grain', () => {
    let jump = 0;
    for (let i = 0; i < 40; i++) {
      jump = Math.max(jump, Math.abs(clumpNoise(i + 1, 7, 1) - clumpNoise(i, 7, 1)));
    }
    expect(jump).toBeLessThan(0.4);
  });
});

describe('foulingOrder', () => {
  it('près des bords d’abord, à bruit égal', () => {
    expect(foulingOrder(3, 4, 1, 0)).toBeLessThan(foulingOrder(3, 4, 1, 0.1));
    expect(foulingOrder(3, 4, 1, 1)).toBe(foulingOrder(3, 4, 1, 5));
  });

  it('reste dans [0, 1[ même pour une distance négative', () => {
    expect(foulingOrder(0, 0, 1, -1)).toBeGreaterThanOrEqual(0);
    expect(foulingOrder(0, 0, 1, 99)).toBeLessThan(1);
  });
});

describe('foulingCells', () => {
  const cells = foulingCells(WATER, true);

  it('couvre les quatre vitres et le sol, triés par ordre d’apparition', () => {
    const surfaces = new Set(cells.glass.map((c) => c.surface));
    expect([...surfaces].sort()).toEqual(['devant', 'droite', 'fond', 'gauche']);
    expect(cells.floor.length).toBeGreaterThan(0);
    for (const list of [cells.glass, cells.floor]) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i].order).toBeGreaterThanOrEqual(list[i - 1].order);
      }
      expect(list.every((c) => c.order >= 0 && c.order < 1)).toBe(true);
    }
  });

  it('chaque case est dans le volume d’eau, contre sa vitre ou juste au-dessus du sable', () => {
    for (const c of [...cells.glass, ...cells.floor]) {
      expect(c.x).toBeGreaterThanOrEqual(WATER.minX);
      expect(c.x).toBeLessThanOrEqual(WATER.maxX);
      expect(c.y).toBeGreaterThanOrEqual(WATER.minY);
      expect(c.y).toBeLessThanOrEqual(WATER.maxY);
      expect(c.z).toBeGreaterThanOrEqual(WATER.minZ);
      expect(c.z).toBeLessThanOrEqual(WATER.maxZ);
    }
    expect(cells.floor.every((c) => c.y === WATER.minY + FOULING_FLOOR_LIFT)).toBe(true);
  });

  it('la vitre de devant se voile moins que le fond', () => {
    const front = cells.glass.filter((c) => c.surface === 'devant').length;
    const back = cells.glass.filter((c) => c.surface === 'fond').length;
    expect(front).toBeLessThan(back);
  });

  it('sans sol plat (terrain), aucune case au sol', () => {
    expect(foulingCells(WATER, false).floor).toEqual([]);
  });

  it('est déterministe', () => {
    expect(foulingCells(WATER, true)).toEqual(cells);
  });

  it('reste raisonnable pour le plus grand bac (budget de sommets)', () => {
    const big = { minX: -1, maxX: 1, minY: 0.02, maxY: 0.9, minZ: -0.45, maxZ: 0.45 };
    const many = foulingCells(big, true);
    expect((many.glass.length + many.floor.length) * 6).toBeLessThan(60_000);
  });
});

describe('shownCells', () => {
  const cells = foulingCells(WATER, true).glass;

  it('aucune case à niveau nul, négatif ou non fini ; toutes à niveau plein', () => {
    expect(shownCells(cells, 0)).toBe(0);
    expect(shownCells(cells, -1)).toBe(0);
    expect(shownCells(cells, Number.NaN)).toBe(0);
    expect(shownCells(cells, 1)).toBe(cells.length);
    expect(shownCells([], 0.5)).toBe(0);
  });

  it('croît avec le niveau et compte exactement les cases d’ordre inférieur', () => {
    let previous = 0;
    for (const level of [0.1, 0.3, 0.5, 0.8]) {
      const n = shownCells(cells, level);
      expect(n).toBeGreaterThanOrEqual(previous);
      expect(n).toBe(cells.filter((c) => c.order < level).length);
      previous = n;
    }
  });
});

describe('buildFoulingGeometry', () => {
  it('6 sommets par case, aux couleurs de la palette, rien de dessiné au départ', () => {
    const cells = foulingCells(WATER, true).floor.slice(0, 10);
    const geometry = buildFoulingGeometry(cells);
    expect(geometry.getAttribute('position').count).toBe(60);
    expect(geometry.drawRange.count).toBe(0);
    const colors = geometry.getAttribute('color');
    const allowed = Object.values(FOULING_COLORS).map((hex) => new Color(hex));
    for (let i = 0; i < colors.count; i++) {
      const near = (a: Color) =>
        Math.abs(a.r - colors.getX(i)) < 1e-6 &&
        Math.abs(a.g - colors.getY(i)) < 1e-6 &&
        Math.abs(a.b - colors.getZ(i)) < 1e-6;
      expect(allowed.some(near)).toBe(true);
    }
    // Case du sol à plat, de côté `FOULING_PIXEL`.
    const pos = geometry.getAttribute('position');
    expect(pos.getY(0)).toBe(pos.getY(2));
    expect(Math.abs(pos.getX(1) - pos.getX(0))).toBeCloseTo(FOULING_PIXEL);
  });
});

describe('FoulingLayer', () => {
  it('bac propre : couche masquée, rien de construit', () => {
    const layer = new FoulingLayer();
    layer.setFouling(WATER, NO_FOULING, true);
    expect(layer.object.visible).toBe(false);
    expect(layer.object.children.length).toBe(0);
    expect(layer.counts).toEqual({ glass: 0, floor: 0 });
  });

  it('suit le niveau puis se masque une fois nettoyé', () => {
    const layer = new FoulingLayer();
    layer.setFouling(WATER, sampleFouling(0.5), true);
    const half = layer.counts;
    expect(layer.object.visible).toBe(true);
    expect(half.glass).toBeGreaterThan(0);
    expect(half.floor).toBeGreaterThan(0);
    layer.setFouling(WATER, sampleFouling(1), true);
    expect(layer.counts.glass).toBeGreaterThan(half.glass);
    const mesh = layer.object.children[0] as Mesh;
    expect(mesh.geometry.drawRange.count).toBe(layer.counts.glass * 6);
    layer.setFouling(WATER, { glass: 0, floor: 0.5 }, true);
    expect(layer.counts.glass).toBe(0);
    expect(mesh.visible).toBe(false);
    layer.setFouling(WATER, NO_FOULING, true);
    expect(layer.object.visible).toBe(false);
    layer.dispose();
  });

  it('sans sol plat, seul le voile des vitres', () => {
    const layer = new FoulingLayer();
    layer.setFouling(WATER, sampleFouling(1), false);
    expect(layer.counts.floor).toBe(0);
    expect(layer.object.children.length).toBe(1);
  });

  it('aucun voile en mode décor, même très sale', () => {
    const layer = new FoulingLayer();
    const world = {
      environment: 'tropical' as const,
      careMode: 'decor' as const,
      time: 1e9,
      water: { nitrate: 60 },
      maintenance: initialMaintenance(0),
    };
    layer.setFouling(WATER, worldFouling(world, 0), true);
    expect(layer.object.visible).toBe(false);
  });

  it('luminosité de nuit : appliquée à la matière, valeurs invalides ignorées', () => {
    const layer = new FoulingLayer();
    layer.setBrightness(0.5);
    expect(layer.brightness).toBe(0.5);
    layer.setBrightness(Number.NaN);
    layer.setBrightness(-1);
    expect(layer.brightness).toBe(0.5);
  });
});
