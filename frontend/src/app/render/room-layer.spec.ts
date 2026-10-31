import { Color, Mesh } from 'three';

import { DEFAULT_ROOM, roomBlocks, roomInterior, type Room } from '../sim/room';
import { lightAt } from '../sim/daylight';
import { furnitureBlocks, ROOM_CATALOG } from '../sim/room-furniture';
import { createWindowLight, roomWindowBlocks, windowLightInto } from '../sim/room-window';
import { DEFAULT_TANK, MAX_TANK } from '../sim/tank';
import type { CameraPreset } from '../core/capture/capture-params';
import { cameraPresetPose } from './camera-presets';
import { PALETTE_COLORS } from './palette';
import { buildRoomHull, buildRoomMesh, ROOM_COLORS, RoomLayer } from './room-layer';

const SHOWN: Room = { shown: true, cabinetHeight: 0.75 };

describe('RoomLayer (#187)', () => {
  it('toutes les couleurs de la pièce sont dans la palette', () => {
    for (const [part, colors] of Object.entries(ROOM_COLORS)) {
      for (const color of colors) {
        expect(PALETTE_COLORS, part).toContain(color);
      }
    }
  });

  it('maillage : six faces de deux triangles par bloc, couleur de sa partie', () => {
    const blocks = roomBlocks(DEFAULT_TANK, SHOWN);
    const data = buildRoomMesh(blocks);
    expect(data.positions.length).toBe(blocks.length * 36 * 3);
    expect(data.normals.length).toBe(data.positions.length);
    expect(data.colors.length).toBe(data.positions.length);
    const first = new Color(ROOM_COLORS[blocks[0].part][blocks[0].shade]);
    expect([...data.colors.slice(0, 3)]).toEqual([first.r, first.g, first.b].map(Math.fround));
    // Les sommets restent dans la boîte de leur bloc.
    const b = blocks[0].box;
    for (let i = 0; i < 36 * 3; i += 3) {
      expect(data.positions[i]).toBeGreaterThanOrEqual(Math.fround(b.minX) - 1e-6);
      expect(data.positions[i]).toBeLessThanOrEqual(Math.fround(b.maxX) + 1e-6);
      expect(data.positions[i + 1]).toBeGreaterThanOrEqual(Math.fround(b.minY) - 1e-6);
      expect(data.positions[i + 1]).toBeLessThanOrEqual(Math.fround(b.maxY) + 1e-6);
    }
    expect(buildRoomMesh([]).positions.length).toBe(0);
  });

  it('masquée par défaut : aucun maillage, racine invisible', () => {
    const layer = new RoomLayer();
    expect(layer.object.visible).toBe(false);
    expect(layer.object.children.length).toBe(0);
    layer.setRoom(DEFAULT_TANK, DEFAULT_ROOM, true);
    expect(layer.built).toBe(false);
    expect(layer.object.visible).toBe(false);
    expect(layer.object.children.length).toBe(0);
    layer.dispose();
  });

  it('environnement sans pièce : rien n’est construit, même pièce affichée', () => {
    const layer = new RoomLayer();
    layer.setRoom(DEFAULT_TANK, SHOWN, false);
    expect(layer.built).toBe(false);
    expect(layer.object.children.length).toBe(0);
    layer.dispose();
  });

  it('affichée : mur et reste en deux maillages, remplacés à chaque réglage', () => {
    const layer = new RoomLayer();
    layer.setRoom(DEFAULT_TANK, SHOWN, true);
    expect(layer.built).toBe(true);
    expect(layer.count).toBe(roomBlocks(DEFAULT_TANK, SHOWN).length);
    expect(layer.object.visible).toBe(true);
    expect(layer.object.children.map((c) => c.name).sort()).toEqual([
      'piece-fenetre-bois',
      'piece-fenetre-lumiere',
      'piece-fenetre-vitre',
      'piece-mur',
      'piece-mur-avant',
      'piece-mur-droit',
      'piece-mur-gauche',
      'piece-plafond',
      'piece-sol-meuble',
    ]);
    const [first] = layer.object.children as Mesh[];
    const dispose = vi.spyOn(first.geometry, 'dispose');
    layer.setRoom(DEFAULT_TANK, { ...SHOWN, cabinetHeight: 0.9 }, true);
    expect(dispose).toHaveBeenCalled();
    expect(layer.object.children.length).toBe(9);
    layer.setRoom(DEFAULT_TANK, DEFAULT_ROOM, true);
    expect(layer.object.children.length).toBe(0);
    expect(layer.object.visible).toBe(false);
    layer.dispose();
  });

  it('dessine les meubles de la pièce avec le sol et le meuble du bac (#188)', () => {
    const layer = new RoomLayer();
    const furnished = {
      ...SHOWN,
      items: [{ kind: 'etagere', x: -1.25, z: -0.17, quarter: 0 }] as const,
    };
    layer.setRoom(DEFAULT_TANK, furnished, true);
    expect(layer.count).toBe(
      roomBlocks(DEFAULT_TANK, SHOWN).length + ROOM_CATALOG.etagere.blocks.length,
    );
    expect(layer.object.children.length).toBe(9);
    layer.setRoom(DEFAULT_TANK, { ...furnished, shown: false }, true);
    expect(layer.built).toBe(false);
    layer.dispose();
  });

  it('suit la caméra : rien sous le fond du bac, pas de mur vu de derrière', () => {
    const layer = new RoomLayer();
    layer.setViewpoint(0, 1, 1); // sans pièce : sans effet
    expect(layer.object.visible).toBe(false);
    layer.setRoom(DEFAULT_TANK, SHOWN, true);
    layer.setViewpoint(0, 1.2, 1.5);
    expect(layer.object.visible).toBe(true);
    expect(layer.wallVisible).toBe(true);
    layer.setViewpoint(0, -1, 1.5);
    expect(layer.object.visible).toBe(false);
    expect(layer.wallVisible).toBe(false);
    layer.setViewpoint(0, 1.2, -2);
    expect(layer.object.visible).toBe(true);
    expect(layer.wallVisible).toBe(false);
    layer.setViewpoint(0, 1.2, 2);
    expect(layer.wallVisible).toBe(true);
    layer.dispose();
    expect(layer.built).toBe(false);
  });

  it('enveloppe (#324) : chaque paroi masquée seule quand la caméra la franchit', () => {
    const layer = new RoomLayer();
    layer.setRoom(DEFAULT_TANK, SHOWN, true);
    const inner = roomInterior(DEFAULT_TANK);
    const shells = ['fond', 'gauche', 'droite', 'avant', 'plafond'] as const;
    const visible = () => shells.filter((s) => layer.shellVisible(s));
    // Vue trois-quarts par défaut, dans la pièce : tout est affiché.
    layer.setViewpoint(1.15, 1.14, 1.53);
    expect(visible()).toEqual(shells);
    // Zoom arrière par l'angle avant droit, au-dessus des poutres : droite, avant et plafond
    // masqués ; le fond et le mur de gauche restent derrière le bac.
    layer.setViewpoint(inner.maxX + 0.5, inner.beamY + 0.5, inner.maxZ + 0.5);
    expect(visible()).toEqual(['fond', 'gauche']);
    layer.setViewpoint(inner.minX - 0.5, 1, 0);
    expect(visible()).toEqual(['fond', 'droite', 'avant', 'plafond']);
    layer.setViewpoint(0, -0.5, 0);
    expect(visible()).toEqual([]);
    layer.dispose();
  });

  it('enveloppe en couleurs plates, comme le mur du fond (teinte de l’eau, ADR 0048)', () => {
    const layer = new RoomLayer();
    layer.setRoom(DEFAULT_TANK, SHOWN, true);
    const byName = new Map(layer.object.children.map((c) => [c.name, c as Mesh]));
    const flat = byName.get('piece-mur')!.material;
    for (const name of [
      'piece-mur-gauche',
      'piece-mur-droit',
      'piece-mur-avant',
      'piece-plafond',
    ]) {
      expect(byName.get(name)!.material, name).toBe(flat);
    }
    expect(byName.get('piece-sol-meuble')!.material).not.toBe(flat);
    layer.dispose();
  });

  it('contour de sélection d’un meuble : coque gonflée vers l’extérieur, gardée à la reconstruction', () => {
    const room: Room = {
      ...SHOWN,
      items: [
        { kind: 'etagere', x: -1.25, z: -0.17, quarter: 0 },
        { kind: 'plante-pot', x: -1.4, z: -0.17, quarter: 0, elevation: 0.8 },
      ],
    };
    const blocks = furnitureBlocks(room, 0);
    const hull = buildRoomHull(blocks);
    const box = blocks[0].box;
    for (let i = 0; i < 36 * 3; i += 3) {
      const center = [
        (box.minX + box.maxX) / 2,
        (box.minY + box.maxY) / 2,
        (box.minZ + box.maxZ) / 2,
      ];
      for (let a = 0; a < 3; a++) {
        expect(Math.sign(hull.normals[i + a])).toBe(Math.sign(hull.positions[i + a] - center[a]));
      }
      expect(Math.hypot(hull.normals[i], hull.normals[i + 1], hull.normals[i + 2])).toBeCloseTo(
        1,
        6,
      );
    }
    const layer = new RoomLayer();
    layer.setRoom(DEFAULT_TANK, room, true);
    expect(layer.selectedIndex).toBeNull();
    layer.setSelected(1);
    expect(layer.selectedIndex).toBe(1);
    const selection = () => layer.object.getObjectByName('piece-selection') as Mesh;
    expect(selection().geometry.getAttribute('position').count).toBe(
      ROOM_CATALOG['plante-pot'].blocks.length * 36,
    );
    layer.setRoom(DEFAULT_TANK, { ...room, items: room.items?.slice(0, 1) }, true);
    expect(layer.selectedIndex).toBeNull();
    layer.setRoom(DEFAULT_TANK, room, true);
    expect(layer.selectedIndex).toBe(1);
    layer.setSelected(null);
    expect(selection()).toBeUndefined();
    layer.setRoom(DEFAULT_TANK, room, false);
    expect(layer.selectedIndex).toBeNull();
    layer.setResolution(0, 0);
    layer.dispose();
  });

  it('même indice sélectionné : coque gardée, reconstruite seulement avec la pièce (#202)', () => {
    const room: Room = {
      ...SHOWN,
      items: [
        { kind: 'etagere', x: -1.25, z: -0.17, quarter: 0 },
        { kind: 'plante-pot', x: -1.4, z: -0.17, quarter: 0, elevation: 0.8 },
      ],
    };
    const layer = new RoomLayer();
    layer.setRoom(DEFAULT_TANK, room, true);
    const selection = () => layer.object.getObjectByName('piece-selection') as Mesh | undefined;
    layer.setSelected(1);
    const first = selection();
    expect(first).toBeDefined();
    const dispose = vi.spyOn(first!.geometry, 'dispose');
    layer.setSelected(1);
    expect(selection()).toBe(first);
    expect(dispose).not.toHaveBeenCalled();
    // Pièce reconstruite (aperçu d'un glissement) : nouvelle coque, à jour.
    layer.setRoom(DEFAULT_TANK, room, true);
    const rebuilt = selection();
    expect(rebuilt).toBeDefined();
    expect(rebuilt).not.toBe(first);
    expect(dispose).toHaveBeenCalledTimes(1);
    layer.setSelected(1);
    expect(selection()).toBe(rebuilt);
    // Un autre indice reconstruit la coque.
    layer.setSelected(0);
    expect(selection()).not.toBe(rebuilt);
    expect(layer.selectedIndex).toBe(0);
    layer.dispose();
  });

  it('fenêtre (#342) : bois avec le mur du fond, vitre masquée avec lui, tache au sol', () => {
    const layer = new RoomLayer();
    layer.setRoom(DEFAULT_TANK, SHOWN, true);
    const byName = new Map(layer.object.children.map((c) => [c.name, c as Mesh]));
    const window = roomWindowBlocks(DEFAULT_TANK, SHOWN);
    const count = (part: string) => window.filter((b) => b.part === part).length * 36 * 3;
    const wallBlocks = roomBlocks(DEFAULT_TANK, SHOWN).filter((b) => b.shell === 'fond');
    expect(byName.get('piece-mur')!.geometry.getAttribute('position').array.length).toBe(
      wallBlocks.length * 36 * 3,
    );
    expect(byName.get('piece-fenetre-bois')!.geometry.getAttribute('position').array.length).toBe(
      count('fenetre'),
    );
    expect(byName.get('piece-fenetre-bois')!.material).toBe(byName.get('piece-mur')!.material);
    expect(byName.get('piece-fenetre-vitre')!.geometry.getAttribute('position').array.length).toBe(
      count('vitre'),
    );
    expect(
      byName.get('piece-fenetre-lumiere')!.geometry.getAttribute('position').array.length,
    ).toBe(count('lumiere'));
    // Le nombre de blocs de la pièce (choix à la souris) ne compte pas la fenêtre.
    expect(layer.count).toBe(roomBlocks(DEFAULT_TANK, SHOWN).length);
    expect(layer.patchBuilt).toBe(true);
    const inner = roomInterior(DEFAULT_TANK);
    layer.setViewpoint(2, 1, 2);
    expect(layer.windowVisible).toBe(true);
    layer.setViewpoint(0, 1, inner.minZ - 0.5);
    expect(layer.windowVisible).toBe(false);
    expect(layer.shellVisible('fond')).toBe(false);
    layer.setViewpoint(2, -1, 2);
    expect(layer.windowVisible).toBe(false);
    // Vue de côté : le mur du fond reste affiché, la fenêtre (derrière l'eau) non.
    layer.setViewpoint(2, 0.25, 0);
    expect(layer.shellVisible('fond')).toBe(true);
    expect(layer.windowVisible).toBe(false);
    expect(byName.get('piece-fenetre-bois')!.visible).toBe(false);
    layer.setViewpoint(1.5, 1.5, 2.5);
    expect(byName.get('piece-fenetre-bois')!.visible).toBe(true);
    layer.dispose();
  });

  it('fenêtre (#342) : vitre et tache teintées par la lumière du jour, gardées à la reconstruction', () => {
    const layer = new RoomLayer();
    layer.setRoom(DEFAULT_TANK, SHOWN, true);
    expect(layer.windowColors.glass).toEqual([1, 1, 1]);
    const night = lightAt(0);
    layer.setDaylight(night, 0.8);
    const expected = windowLightInto(night, 0.8, createWindowLight());
    for (let k = 0; k < 3; k++) {
      expect(layer.windowColors.glass[k]).toBeCloseTo(expected.glass[k], 12);
      expect(layer.windowColors.patch[k]).toBeCloseTo(expected.patch[k], 12);
    }
    layer.setRoom(DEFAULT_TANK, { ...SHOWN, cabinetHeight: 0.9 }, true);
    expect(layer.windowColors.glass[2]).toBeCloseTo(expected.glass[2], 12);
    layer.setDaylight(lightAt(12));
    expect(layer.windowColors.glass).toEqual([1, 1, 1]);
    expect(layer.windowColors.patch).toEqual([1, 1, 1]);
    layer.dispose();
  });

  it('fenêtre (#342) : rien pour une pièce masquée ou un environnement sans pièce', () => {
    const layer = new RoomLayer();
    layer.setRoom(DEFAULT_TANK, SHOWN, false);
    expect(layer.patchBuilt).toBe(false);
    expect(layer.windowVisible).toBe(false);
    layer.setRoom(DEFAULT_TANK, DEFAULT_ROOM, true);
    expect(layer.patchBuilt).toBe(false);
    expect(layer.object.children.length).toBe(0);
    layer.dispose();
  });

  it('fenêtre (#342) : affichée dans les vues trois-quarts et de face, cachée de côté', () => {
    for (const dims of [DEFAULT_TANK, { width: 0.6, height: 0.5, depth: 0.3 }, MAX_TANK]) {
      const layer = new RoomLayer();
      layer.setRoom(dims, SHOWN, true);
      const seen = (preset: CameraPreset): boolean => {
        const [x, y, z] = cameraPresetPose(preset, dims, 16 / 9).position;
        layer.setViewpoint(x, y, z);
        return layer.windowVisible;
      };
      expect(seen('three-quarter'), JSON.stringify(dims)).toBe(true);
      expect(seen('front'), JSON.stringify(dims)).toBe(true);
      expect(seen('side'), JSON.stringify(dims)).toBe(false);
      expect(seen('bottom'), JSON.stringify(dims)).toBe(false);
      layer.dispose();
    }
  });
});
