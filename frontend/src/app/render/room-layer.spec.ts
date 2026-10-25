import { Color, Mesh } from 'three';

import { DEFAULT_ROOM, roomBlocks, type Room } from '../sim/room';
import { furnitureBlocks, ROOM_CATALOG } from '../sim/room-furniture';
import { DEFAULT_TANK } from '../sim/tank';
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
      'piece-mur',
      'piece-sol-meuble',
    ]);
    const [first] = layer.object.children as Mesh[];
    const dispose = vi.spyOn(first.geometry, 'dispose');
    layer.setRoom(DEFAULT_TANK, { ...SHOWN, cabinetHeight: 0.9 }, true);
    expect(dispose).toHaveBeenCalled();
    expect(layer.object.children.length).toBe(2);
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
    expect(layer.object.children.length).toBe(2);
    layer.setRoom(DEFAULT_TANK, { ...furnished, shown: false }, true);
    expect(layer.built).toBe(false);
    layer.dispose();
  });

  it('suit la caméra : rien sous le fond du bac, pas de mur vu de derrière', () => {
    const layer = new RoomLayer();
    layer.setViewpoint(1, 1); // sans pièce : sans effet
    expect(layer.object.visible).toBe(false);
    layer.setRoom(DEFAULT_TANK, SHOWN, true);
    layer.setViewpoint(1.2, 1.5);
    expect(layer.object.visible).toBe(true);
    expect(layer.wallVisible).toBe(true);
    layer.setViewpoint(-1, 1.5);
    expect(layer.object.visible).toBe(false);
    expect(layer.wallVisible).toBe(false);
    layer.setViewpoint(1.2, -2);
    expect(layer.object.visible).toBe(true);
    expect(layer.wallVisible).toBe(false);
    layer.setViewpoint(1.2, 2);
    expect(layer.wallVisible).toBe(true);
    layer.dispose();
    expect(layer.built).toBe(false);
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
});
