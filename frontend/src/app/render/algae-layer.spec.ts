import { Color, type Mesh } from 'three';

import {
  ALGAE_COLORS,
  ALGAE_INSET,
  AlgaeLayer,
  algaeMask,
  buildAlgaePatch,
  isFilament,
} from './algae-layer';
import { ALGAE_PATCH_COUNT, ALGAE_VISIBLE_COVERAGE, algaePatches } from '../sim/algae';
import { waterVolume } from '../sim/tank';
import { PALETTE, PALETTE_COLORS } from './palette';

const WATER = waterVolume();
const PATCHES = algaePatches(42, WATER);

describe('AlgaeLayer (#476)', () => {
  it('sans algue : couche masquée, aucune plaque', () => {
    const layer = new AlgaeLayer();
    layer.setAlgae(PATCHES, undefined);
    expect(layer.object.visible).toBe(false);
    expect(layer.count).toBe(0);
    expect(layer.object.children).toHaveLength(ALGAE_PATCH_COUNT);
    expect(layer.object.children.every((m) => !m.visible)).toBe(true);
    layer.dispose();
  });

  it('montre les plaques visibles seulement, à la taille de leur couverture', () => {
    const layer = new AlgaeLayer();
    const algae = [1, 0.25, ALGAE_VISIBLE_COVERAGE / 2, 0, 0, 0, 0, 0];
    layer.setAlgae(PATCHES, algae);
    expect(layer.object.visible).toBe(true);
    expect(layer.count).toBe(2);
    const [full, quarter, faint] = layer.object.children as Mesh[];
    expect(full.visible && quarter.visible).toBe(true);
    expect(faint.visible).toBe(false);
    expect(full.scale.x).toBeCloseTo(1, 12);
    expect(quarter.scale.x).toBeCloseTo(0.5, 12);
    layer.setAlgae(PATCHES, undefined);
    expect(layer.object.visible).toBe(false);
    layer.dispose();
  });

  it('chaque plaque devant sa vitre, retirée vers l’intérieur du bac', () => {
    const layer = new AlgaeLayer();
    layer.setAlgae(PATCHES, new Array(ALGAE_PATCH_COUNT).fill(1));
    PATCHES.forEach((patch, i) => {
      const mesh = layer.object.children[i];
      expect(mesh.position.y).toBe(patch.y);
      expect(mesh.position.x).toBeGreaterThanOrEqual(WATER.minX + ALGAE_INSET - 1e-12);
      expect(mesh.position.x).toBeLessThanOrEqual(WATER.maxX - ALGAE_INSET + 1e-12);
      expect(mesh.position.z).toBeGreaterThanOrEqual(WATER.minZ + ALGAE_INSET - 1e-12);
      expect(mesh.position.z).toBeLessThanOrEqual(WATER.maxZ - ALGAE_INSET + 1e-12);
    });
    layer.dispose();
  });

  it('autres plaques (autre bac) : maillages recréés', () => {
    const layer = new AlgaeLayer();
    layer.setAlgae(PATCHES, [1]);
    const before = layer.object.children[0];
    const other = algaePatches(7, WATER);
    layer.setAlgae(other, [1]);
    expect(layer.object.children[0]).not.toBe(before);
    expect(layer.object.children).toHaveLength(ALGAE_PATCH_COUNT);
    expect(layer.count).toBe(1);
    layer.dispose();
  });

  it('luminosité : appliquée au matériau, valeurs invalides ignorées', () => {
    const layer = new AlgaeLayer();
    layer.setBrightness(0.5);
    expect(layer.brightness).toBe(0.5);
    layer.setBrightness(Number.NaN);
    layer.setBrightness(-1);
    expect(layer.brightness).toBe(0.5);
    layer.dispose();
  });
});

describe('plaque d’algues en pixels (#476)', () => {
  it('forme pleine au centre, vide aux coins, déterministe', () => {
    const mask = algaeMask(6, 3);
    expect(mask).toHaveLength(12);
    expect(mask[6][6]).toBe(true);
    expect(mask[0][0]).toBe(false);
    expect(algaeMask(6, 3)).toEqual(mask);
    expect(algaeMask(6, 4)).not.toEqual(mask);
    expect(algaeMask(0, 0)).toHaveLength(2);
  });

  it('voile et filaments aux couleurs de la palette, sans le vert clair des plantes (#488)', () => {
    for (const color of Object.values(ALGAE_COLORS)) {
      expect(PALETTE_COLORS).toContain(color);
    }
    // Ni le vert clair ni le vert lumineux des feuilles : les plaques ne ressemblent pas aux
    // plantes en vue trois-quarts (réserve QA du cycle 162).
    expect(Object.values(ALGAE_COLORS)).not.toContain(PALETTE.vegetationClaire);
    expect(Object.values(ALGAE_COLORS)).not.toContain(PALETTE.vegetationLumineuse);
    const data = buildAlgaePatch(5, 1);
    expect(data.positions.length % 18).toBe(0);
    expect(data.colors.length).toBe(data.positions.length);
    const filament = new Color(ALGAE_COLORS.filament);
    const voile = new Color(ALGAE_COLORS.voile);
    let threads = 0;
    let film = 0;
    for (let k = 0; k < data.colors.length; k += 3) {
      const g = data.colors[k + 1];
      if (data.colors[k] === Math.fround(filament.r) && g === Math.fround(filament.g)) {
        threads++;
      } else if (data.colors[k] === Math.fround(voile.r) && g === Math.fround(voile.g)) {
        film++;
      }
    }
    expect(threads).toBeGreaterThan(0);
    expect(film).toBeGreaterThan(0);
    expect(threads + film).toBe(data.colors.length / 3);
  });

  it('filaments : une colonne sur deux, coupés par endroits, déterministes', () => {
    const column = Array.from({ length: 20 }, (_, r) => isFilament(r, 0, 0));
    expect(column.filter(Boolean).length).toBeGreaterThan(10);
    expect(column.some((v) => !v)).toBe(true);
    for (let r = 0; r < 20; r++) {
      expect(isFilament(r, 1, 0)).toBe(false);
      expect(isFilament(r, 0, 1)).toBe(false);
    }
  });

  it('bord tramé : une case de bord sur deux, le centre plein', () => {
    const cells = 6;
    const mask = algaeMask(cells, 2);
    const full = mask.flat().filter(Boolean).length;
    const drawn = buildAlgaePatch(cells, 2).positions.length / 18;
    expect(drawn).toBeLessThan(full);
    expect(drawn).toBeGreaterThan(full / 2);
  });
});
