import { Color, Mesh } from 'three';

import { DEFAULT_ROOM, roomBlocks, type Room } from '../sim/room';
import { DEFAULT_TANK } from '../sim/tank';
import { PALETTE_COLORS } from './palette';
import { buildRoomMesh, ROOM_COLORS, RoomLayer } from './room-layer';

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
});
