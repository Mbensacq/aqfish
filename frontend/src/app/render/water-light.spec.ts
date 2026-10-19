import { Color, DoubleSide, FrontSide } from 'three';
import { DEFAULT_TANK, SAND_THICKNESS, WATER_LEVEL_RATIO } from '../sim/tank';
import { PALETTE, PALETTE_COLORS } from './palette';
import {
  CAUSTIC_CELL,
  CAUSTIC_COLOR,
  CAUSTIC_RENDER_ORDER,
  CAUSTIC_STAGES,
  causticColorFor,
  causticLit,
  LIGHT_TIME_PERIOD,
  lightTime,
  PATTERN_SPAN,
  NIGHT_SURFACE_RATIO,
  SURFACE_CELL,
  SURFACE_COLOR,
  SURFACE_OPACITY,
  SURFACE_RENDER_ORDER,
  surfaceGlint,
  WaterLightLayer,
} from './water-light';

/** Part des cases allumées sur le bac, et l'ensemble de ces cases. */
function sample(
  lit: (x: number, z: number, t: number) => boolean,
  cell: number,
  time: number,
): { ratio: number; cells: Set<string> } {
  const cells = new Set<string>();
  let total = 0;
  for (let x = -DEFAULT_TANK.width / 2; x < DEFAULT_TANK.width / 2; x += cell) {
    for (let z = -DEFAULT_TANK.depth / 2; z < DEFAULT_TANK.depth / 2; z += cell) {
      total++;
      if (lit(x + cell / 2, z + cell / 2, time)) {
        cells.add(`${Math.round(x / cell)},${Math.round(z / cell)}`);
      }
    }
  }
  return { ratio: cells.size / total, cells };
}

describe('lumière de l’eau : motifs', () => {
  it('lightTime ramène le temps dans [0, période), sans NaN', () => {
    expect(lightTime(0)).toBe(0);
    expect(lightTime(LIGHT_TIME_PERIOD + 1.5)).toBeCloseTo(1.5, 12);
    expect(lightTime(-1)).toBeCloseTo(LIGHT_TIME_PERIOD - 1, 12);
    expect(lightTime(Number.NaN)).toBe(0);
    expect(lightTime(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('caustiques par cases : toute la case a le même état (calcul à basse résolution)', () => {
    for (let i = 0; i < 200; i++) {
      const x = -0.5 + i * 0.0051;
      const z = -0.2 + i * 0.0017;
      const cx = (Math.floor(x / CAUSTIC_CELL) + 0.5) * CAUSTIC_CELL;
      const cz = (Math.floor(z / CAUSTIC_CELL) + 0.5) * CAUSTIC_CELL;
      expect(causticLit(x, z, 7)).toBe(causticLit(cx, cz, 7));
    }
  });

  it('motifs répétables dans l’espace et dans le temps', () => {
    for (let i = 0; i < 100; i++) {
      const x = (i % 10) * CAUSTIC_CELL * 3 + CAUSTIC_CELL / 2;
      const z = Math.floor(i / 10) * CAUSTIC_CELL * 2 + CAUSTIC_CELL / 2;
      expect(causticLit(x + PATTERN_SPAN, z, 3)).toBe(causticLit(x, z, 3));
      expect(causticLit(x, z, 3 + LIGHT_TIME_PERIOD)).toBe(causticLit(x, z, 3));
      const sx = (i % 10) * SURFACE_CELL * 3 + SURFACE_CELL / 2;
      const sz = Math.floor(i / 10) * SURFACE_CELL * 2 + SURFACE_CELL / 2;
      expect(surfaceGlint(sx, sz + PATTERN_SPAN, 3)).toBe(surfaceGlint(sx, sz, 3));
      expect(surfaceGlint(sx, sz, 3 + LIGHT_TIME_PERIOD)).toBe(surfaceGlint(sx, sz, 3));
    }
  });

  it('discrets : une minorité de cases allumées, jamais aucune', () => {
    for (const t of [0, 5, 17.3, 42]) {
      const caustics = sample(causticLit, CAUSTIC_CELL, t).ratio;
      const glints = sample(surfaceGlint, SURFACE_CELL, t).ratio;
      expect(caustics).toBeGreaterThan(0.03);
      expect(caustics).toBeLessThan(0.25);
      expect(glints).toBeGreaterThan(0.01);
      expect(glints).toBeLessThan(0.2);
    }
  });

  it('animés lentement : changent en 2 s, très peu d’un pas de simulation à l’autre', () => {
    const base = sample(causticLit, CAUSTIC_CELL, 10).cells;
    const changed = (other: Set<string>): number => {
      let n = 0;
      for (const c of base) n += other.has(c) ? 0 : 1;
      for (const c of other) n += base.has(c) ? 0 : 1;
      return n / base.size;
    };
    expect(changed(sample(causticLit, CAUSTIC_CELL, 12).cells)).toBeGreaterThan(0.3);
    expect(changed(sample(causticLit, CAUSTIC_CELL, 10 + 1 / 60).cells)).toBeLessThan(0.1);
  });
});

describe('WaterLightLayer', () => {
  it('caustiques sur le sable, reflet à la surface visible des deux côtés', () => {
    const layer = new WaterLightLayer();
    expect(layer.caustics.position.y).toBeGreaterThan(SAND_THICKNESS);
    expect(layer.caustics.position.y).toBeLessThan(SAND_THICKNESS + 0.002);
    expect(layer.caustics.material.side).toBe(FrontSide);
    expect(layer.surface.position.y).toBeCloseTo(DEFAULT_TANK.height * WATER_LEVEL_RATIO, 12);
    expect(layer.surface.material.side).toBe(DoubleSide);
    expect(layer.caustics.material.depthWrite).toBe(false);
    expect(layer.surface.material.depthWrite).toBe(false);
    // Reflet entre l'eau (1) et le verre (2) ; caustiques après le verre, en couleur exacte.
    expect(SURFACE_RENDER_ORDER).toBeGreaterThan(1);
    expect(SURFACE_RENDER_ORDER).toBeLessThan(2);
    expect(CAUSTIC_RENDER_ORDER).toBeGreaterThan(2);
    expect(layer.caustics.material.uniforms['uOpacity'].value).toBe(1);
    layer.dispose();
  });

  it('couleurs de la palette, temps ramené dans la période à chaque mise à jour', () => {
    expect(PALETTE_COLORS).toContain(CAUSTIC_COLOR);
    expect(PALETTE_COLORS).toContain(SURFACE_COLOR);
    const layer = new WaterLightLayer();
    layer.update(LIGHT_TIME_PERIOD * 1000 + 2.5);
    expect(layer.caustics.material.uniforms['uTime'].value).toBeCloseTo(2.5, 6);
    expect(layer.surface.material.uniforms['uTime'].value).toBeCloseTo(2.5, 6);
    layer.dispose();
  });

  it('le shader reprend les constantes de la référence TypeScript', () => {
    const layer = new WaterLightLayer();
    expect(layer.caustics.material.fragmentShader).toContain(`${CAUSTIC_CELL}`);
    expect(layer.surface.material.fragmentShader).toContain(`${SURFACE_CELL}`);
    expect(layer.caustics.material.fragmentShader).toContain('discard');
    layer.dispose();
  });

  it('suit l’intensité du jour : couleurs d’origine à midi, caustiques plus sombres puis éteintes', () => {
    const layer = new WaterLightLayer();
    const color = () =>
      `#${(layer.caustics.material.uniforms['uColor'].value as Color).getHexString()}`;
    const opacity = () => layer.caustics.material.uniforms['uOpacity'].value as number;
    const glint = () => layer.surface.material.uniforms['uOpacity'].value as number;
    const before = (layer.caustics.material.uniforms['uColor'].value as Color).toArray();
    layer.setDaylight(0.5);
    layer.setDaylight(1);
    // Midi : exactement les valeurs d'origine (captures par défaut inchangées).
    expect((layer.caustics.material.uniforms['uColor'].value as Color).toArray()).toEqual(before);
    expect(color()).toBe(CAUSTIC_COLOR);
    expect(opacity()).toBe(1);
    expect(glint()).toBe(SURFACE_OPACITY);
    expect(layer.caustics.visible).toBe(true);
    // Transition : couleur pleine plus sombre de la palette, toujours opaque.
    layer.setDaylight(0.5);
    expect(color()).toBe(PALETTE.sable);
    expect(opacity()).toBe(1);
    expect(glint()).toBeCloseTo(
      SURFACE_OPACITY * (NIGHT_SURFACE_RATIO + (1 - NIGHT_SURFACE_RATIO) / 2),
      12,
    );
    // Nuit : caustiques éteintes, reflet atténué sans disparaître.
    layer.setDaylight(0);
    expect(layer.caustics.visible).toBe(false);
    expect(glint()).toBeCloseTo(SURFACE_OPACITY * NIGHT_SURFACE_RATIO, 12);
    expect(glint()).toBeGreaterThan(0);
    // Hors bornes ou non finie : bornée (non finie ⇒ plein jour).
    layer.setDaylight(-1);
    expect(layer.caustics.visible).toBe(false);
    layer.setDaylight(Number.NaN);
    expect(layer.caustics.visible).toBe(true);
    expect(color()).toBe(CAUSTIC_COLOR);
    layer.dispose();
  });

  it('causticColorFor : paliers de la palette, du plus clair au plus sombre', () => {
    expect(causticColorFor(1)).toBe(CAUSTIC_COLOR);
    expect(causticColorFor(0.75)).toBe(CAUSTIC_COLOR);
    expect(causticColorFor(0.74)).toBe(PALETTE.sable);
    expect(causticColorFor(0.4)).toBe(PALETTE.sable);
    expect(causticColorFor(0.39)).toBeNull();
    expect(causticColorFor(0)).toBeNull();
    for (const stage of CAUSTIC_STAGES) {
      expect(PALETTE_COLORS).toContain(stage.color);
    }
  });
});
