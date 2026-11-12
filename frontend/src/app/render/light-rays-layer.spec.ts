import { Color } from 'three';
import { DEFAULT_TANK, SAND_THICKNESS, WATER_LEVEL_RATIO } from '../sim/tank';
import { PALETTE_COLORS } from './palette';
import {
  bayer4,
  LightRaysLayer,
  MIN_RAY_STRENGTH,
  RAY_ATTRIBUTE,
  RAY_CELL,
  RAY_COLOR,
  RAY_LAYOUT,
  RAY_GAP,
  RAY_MAX_LENGTH,
  RAY_TAIL,
  RAY_RENDER_ORDER,
  RAY_TIME_PERIOD,
  rayCellLit,
  columnSeed,
  rayLength,
  rayGeometry,
  rayTime,
  viewFade,
} from './light-rays-layer';

const SURFACE = DEFAULT_TANK.height * WATER_LEVEL_RATIO;
const SPAN = SURFACE - SAND_THICKNESS;

/** Part des cases allumées d'un rayon de demi-largeur `hw`, entre les profondeurs d0 et d1. */
function litRatio(hw: number, d0: number, d1: number, strength: number, time = 0, viewUp = 0) {
  let lit = 0;
  let total = 0;
  for (let a = -hw; a < hw; a += RAY_CELL) {
    for (let d = d0; d < d1; d += RAY_CELL) {
      total++;
      if (rayCellLit(a + RAY_CELL / 2, d + RAY_CELL / 2, hw, SPAN, 0, time, strength, viewUp)) {
        lit++;
      }
    }
  }
  return lit / total;
}

describe('rayons de lumière : motif (#567)', () => {
  it('Bayer 4 × 4 : 16 seuils distincts dans [0, 1), périodique de 4', () => {
    const values = new Set<number>();
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        const v = bayer4(x, y);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
        values.add(v);
        expect(bayer4(x + 4, y - 8)).toBe(v);
      }
    }
    expect(values.size).toBe(16);
  });

  it('rayTime ramène le temps à la période, sans NaN', () => {
    expect(rayTime(0)).toBe(0);
    expect(rayTime(RAY_TIME_PERIOD + 2)).toBeCloseTo(2, 12);
    expect(rayTime(-1)).toBeCloseTo(RAY_TIME_PERIOD - 1, 12);
    expect(rayTime(Number.NaN)).toBe(0);
  });

  it('par cases : toute la case a le même état', () => {
    const hw = 0.03;
    for (let i = 0; i < 100; i++) {
      const a = -hw + i * 0.00061;
      const d = i * 0.0023;
      const ca = (Math.floor(a / RAY_CELL) + 0.5) * RAY_CELL;
      const cd = (Math.floor(d / RAY_CELL) + 0.5) * RAY_CELL;
      expect(rayCellLit(a, d, hw, SPAN, 1, 5, 1)).toBe(rayCellLit(ca, cd, hw, SPAN, 1, 5, 1));
    }
  });

  it('longueur bornée, nulle sans force, plus longue au cœur que sur les bords', () => {
    expect(rayLength(0, 0.05, 0, 0, 0)).toBe(0);
    for (let a = -0.05; a < 0.05; a += 0.003) {
      const len = rayLength(a, 0.05, 0, 3, 1);
      expect(len).toBeGreaterThanOrEqual(0);
      expect(len).toBeLessThanOrEqual(RAY_MAX_LENGTH);
    }
    // Moyenne des colonnes du cœur contre celle des bords.
    const mean = (cols: number[]) =>
      cols.reduce((sum, c) => sum + rayLength((c + 0.5) * RAY_CELL, 0.05, 0, 0, 1), 0) /
      cols.length;
    expect(mean([-1, 0])).toBeGreaterThan(mean([-5, 4]));
  });

  it('une colonne sur trois environ sans trait (graine sous RAY_GAP)', () => {
    let empty = 0;
    for (let c = -50; c < 50; c++) {
      const seed = columnSeed(c, 1.3);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(1);
      if (seed < RAY_GAP) {
        empty++;
        expect(rayLength((c + 0.5) * RAY_CELL, 10, 1.3, 0, 1)).toBe(0);
      }
    }
    expect(empty).toBeGreaterThan(20);
    expect(empty).toBeLessThan(40);
  });

  it('trait continu depuis la surface, sans case au-delà de son bout effiloché', () => {
    const hw = 0.05;
    for (let c = -5; c < 5; c++) {
      const across = (c + 0.5) * RAY_CELL;
      const len = rayLength(across, hw, 0, 0, 1) * SPAN;
      for (let d = RAY_CELL / 2; d < SPAN; d += RAY_CELL) {
        const lit = rayCellLit(across, d, hw, SPAN, 0, 0, 1);
        if (d < len) {
          expect(lit).toBe(true);
        } else if (d >= len * (1 + RAY_TAIL)) {
          expect(lit).toBe(false);
        }
      }
    }
  });

  it('plus de cases sous la surface qu’au fond, aucune au sable', () => {
    const hw = 0.05;
    const top = litRatio(hw, 0, SPAN / 4, 1);
    const bottom = litRatio(hw, (3 * SPAN) / 4, SPAN, 1);
    expect(top).toBeGreaterThan(0.3);
    expect(bottom).toBeLessThan(top / 3);
    expect(litRatio(hw, SPAN - RAY_CELL, SPAN, 1)).toBe(0);
  });

  it('suit la force : moins de cases au crépuscule, aucune la nuit', () => {
    const full = litRatio(0.05, 0, SPAN / 2, 1);
    const dusk = litRatio(0.05, 0, SPAN / 2, 0.3);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(full);
    expect(litRatio(0.05, 0, SPAN, 0)).toBe(0);
  });

  it('effacés vus de dessus, entiers de côté', () => {
    expect(viewFade(0)).toBe(1);
    expect(viewFade(0.5)).toBe(1);
    expect(viewFade(0.9)).toBe(0);
    expect(viewFade(-1)).toBe(0);
    expect(litRatio(0.05, 0, SPAN, 1, 0, 1)).toBe(0);
  });

  it('scintillent avec le temps, motif identique au même temps (déterminisme)', () => {
    const at = (t: number) => {
      const cells: boolean[] = [];
      for (let d = 0; d < SPAN; d += RAY_CELL) {
        for (let a = -0.05; a < 0.05; a += RAY_CELL) {
          cells.push(rayCellLit(a + RAY_CELL / 2, d + RAY_CELL / 2, 0.05, SPAN, 0, t, 1));
        }
      }
      return cells;
    };
    expect(at(7)).toEqual(at(7));
    expect(at(7)).toEqual(at(7 + RAY_TIME_PERIOD));
    expect(at(7)).not.toEqual(at(17));
  });
});

describe('LightRaysLayer (#567)', () => {
  it('un seul maillage : 4 sommets et 2 triangles par rayon (un appel de dessin)', () => {
    const geometry = rayGeometry(DEFAULT_TANK, SAND_THICKNESS, SURFACE);
    expect(geometry.getAttribute('position').count).toBe(RAY_LAYOUT.length * 4);
    expect(geometry.getAttribute(RAY_ATTRIBUTE).itemSize).toBe(4);
    expect(geometry.getIndex()?.count).toBe(RAY_LAYOUT.length * 6);
    // Deux attributs seulement : position et aRay.
    expect(Object.keys(geometry.attributes).sort()).toEqual([RAY_ATTRIBUTE, 'position'].sort());
    geometry.dispose();
  });

  it('rayons entre la surface et le sable, dans le bac', () => {
    const geometry = rayGeometry(DEFAULT_TANK, SAND_THICKNESS, SURFACE);
    const pos = geometry.getAttribute('position');
    const ray = geometry.getAttribute(RAY_ATTRIBUTE);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      expect(y).toBeGreaterThanOrEqual(SAND_THICKNESS - 1e-6);
      expect(y).toBeLessThanOrEqual(SURFACE + 1e-6);
      expect(y).toBeCloseTo(SURFACE - ray.getY(i), 6);
      const hw = ray.getZ(i);
      expect(Math.abs(pos.getX(i)) + hw).toBeLessThan(DEFAULT_TANK.width / 2);
      expect(Math.abs(pos.getZ(i)) + hw).toBeLessThan(DEFAULT_TANK.depth / 2);
    }
    geometry.dispose();
  });

  it('couleur de la palette, opacité fixe, ordre de rendu après l’eau', () => {
    const layer = new LightRaysLayer();
    expect(PALETTE_COLORS).toContain(RAY_COLOR);
    const color = layer.object.material.uniforms['uColor'].value as Color;
    expect(color.equals(new Color(RAY_COLOR))).toBe(true);
    expect(layer.object.renderOrder).toBe(RAY_RENDER_ORDER);
    expect(layer.object.material.depthWrite).toBe(false);
    layer.dispose();
  });

  it('setRays : masqués la nuit, pente = tan(inclinaison), valeurs non finies tolérées', () => {
    const layer = new LightRaysLayer();
    layer.setRays(1, 0.3);
    expect(layer.object.visible).toBe(true);
    expect(layer.slope).toBeCloseTo(Math.tan(0.3), 12);
    layer.setRays(MIN_RAY_STRENGTH / 2, 0);
    expect(layer.object.visible).toBe(false);
    layer.setRays(Number.NaN, Number.NaN);
    expect(layer.raysStrength).toBe(1);
    expect(layer.slope).toBe(0);
    layer.setRays(5, 0);
    expect(layer.raysStrength).toBe(1);
    layer.dispose();
  });

  it('environnement sans rayons : jamais affichés', () => {
    const layer = new LightRaysLayer(DEFAULT_TANK, false);
    layer.setRays(1, 0);
    expect(layer.object.visible).toBe(false);
    layer.dispose();
  });

  it('update : temps ramené à la période', () => {
    const layer = new LightRaysLayer();
    layer.update(RAY_TIME_PERIOD + 4);
    expect(layer.time).toBeCloseTo(4, 10);
    layer.dispose();
  });
});
