import { createDefaultWorld } from './world';
import { lightAt } from './daylight';
import {
  DEFAULT_ROOM,
  roomBlocks,
  roomInterior,
  ROOM_VOXEL,
  type Room,
  type RoomBlock,
} from './room';
import {
  createWindowLight,
  isWindowClear,
  PATCH_DEPTH,
  PATCH_OFFSET,
  roomWindow,
  roomWindowBlocks,
  WINDOW_HEADER,
  WINDOW_MAX_HEIGHT,
  WINDOW_MIN_SILL,
  WINDOW_NIGHT_GLASS,
  WINDOW_NIGHT_PATCH,
  WINDOW_SIDE_MARGIN,
  WINDOW_SILL_DEPTH,
  WINDOW_TANK_GAP,
  WINDOW_WIDTH,
  windowLightInto,
} from './room-window';
import { parseSaveData, saveData } from './save';
import type { Box3, TankDimensions } from './tank';

const SHOWN: Room = { shown: true, cabinetHeight: 0.75 };
const DEFAULT_TANK: TankDimensions = { width: 1, height: 0.5, depth: 0.5 };
const SMALL_TANK: TankDimensions = { width: 0.6, height: 0.5, depth: 0.3 };
const LARGE_TANK: TankDimensions = { width: 2, height: 0.9, depth: 0.9 };
const ODD_TANK: TankDimensions = { width: 0.75, height: 0.55, depth: 0.35 };

function onGrid(value: number): boolean {
  return Math.abs(value / ROOM_VOXEL - Math.round(value / ROOM_VOXEL)) < 1e-6;
}

function boxOnGrid(b: Box3): boolean {
  return [b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ].every(onGrid);
}

function inside(inner: Box3, outer: Box3): boolean {
  const e = 1e-9;
  return (
    inner.minX >= outer.minX - e &&
    inner.maxX <= outer.maxX + e &&
    inner.minY >= outer.minY - e &&
    inner.maxY <= outer.maxY + e &&
    inner.minZ >= outer.minZ - e &&
    inner.maxZ <= outer.maxZ + e
  );
}

function area(blocks: readonly RoomBlock[]): number {
  return blocks.reduce((sum, b) => sum + (b.box.maxX - b.box.minX) * (b.box.maxZ - b.box.minZ), 0);
}

describe('roomWindow', () => {
  for (const [name, dims] of [
    ['petit bac (0,6 × 0,5 × 0,3 m)', SMALL_TANK],
    ['bac par défaut', DEFAULT_TANK],
    ['grand bac (2 × 0,9 × 0,9 m)', LARGE_TANK],
    ['bac aux demi-cotes impaires', ODD_TANK],
  ] as const) {
    it(`reste dans le mur du fond, sous les poutres, à gauche du bac : ${name}`, () => {
      const w = roomWindow(dims);
      const inner = roomInterior(dims);
      expect(w.wallZ).toBe(inner.minZ);
      expect(w.minX).toBeGreaterThanOrEqual(inner.minX + WINDOW_SIDE_MARGIN - 1e-9);
      expect(w.maxX).toBeLessThanOrEqual(-dims.width / 2 - WINDOW_TANK_GAP - dims.depth + 1e-9);
      expect(w.maxX - w.minX).toBeCloseTo(WINDOW_WIDTH, 9);
      expect(w.maxY).toBeCloseTo(inner.beamY - WINDOW_HEADER, 9);
      expect(w.maxY).toBeLessThan(inner.beamY);
      expect(w.minY).toBeGreaterThanOrEqual(WINDOW_MIN_SILL - 1e-9);
      expect(w.maxY - w.minY).toBeLessThanOrEqual(WINDOW_MAX_HEIGHT + 1e-9);
      expect(w.maxY - w.minY).toBeGreaterThan(0.5);
      expect([w.minX, w.maxX, w.minY, w.maxY, w.wallZ].every(onGrid)).toBe(true);
    });
  }

  it('garde la même hauteur au plus haut bac, appui relevé', () => {
    const w = roomWindow(LARGE_TANK);
    expect(w.maxY - w.minY).toBeCloseTo(WINDOW_MAX_HEIGHT, 9);
    expect(w.minY).toBeGreaterThan(WINDOW_MIN_SILL);
  });

  it('suit le bac : plus large et plus profond, la fenêtre s’écarte d’autant', () => {
    // 0,5 m de demi-longueur et 0,4 m de profondeur de plus.
    expect(roomWindow(LARGE_TANK).maxX - roomWindow(DEFAULT_TANK).maxX).toBeCloseTo(-0.9, 9);
  });

  it('bac hors réglages, très profond : la fenêtre reste dans le mur, contre le mur de gauche', () => {
    const dims = { width: 1, height: 0.5, depth: 5 };
    const w = roomWindow(dims);
    expect(w.minX).toBeCloseTo(roomInterior(dims).minX + WINDOW_SIDE_MARGIN, 9);
    expect(w.maxX - w.minX).toBeCloseTo(WINDOW_WIDTH, 9);
  });

  it('refuse des dimensions invalides', () => {
    expect(() => roomWindow({ width: 0, height: 0.5, depth: 0.5 })).toThrow(RangeError);
    expect(() => roomWindow({ width: 1, height: Number.NaN, depth: 0.5 })).toThrow(RangeError);
    expect(() => roomWindow({ width: 1, height: 0.5, depth: Infinity })).toThrow(RangeError);
  });
});

describe('roomWindowBlocks', () => {
  it('ne construit rien pour une pièce masquée', () => {
    expect(roomWindowBlocks(DEFAULT_TANK, { shown: false, cabinetHeight: 0.75 })).toEqual([]);
  });

  it('refuse des dimensions invalides, même pièce masquée', () => {
    expect(() =>
      roomWindowBlocks({ width: -1, height: 0.5, depth: 0.5 }, { ...SHOWN, shown: false }),
    ).toThrow(RangeError);
  });

  for (const dims of [SMALL_TANK, DEFAULT_TANK, LARGE_TANK, ODD_TANK]) {
    it(`pose bois et vitre dans l’ouverture, contre le mur : ${JSON.stringify(dims)}`, () => {
      const blocks = roomWindowBlocks(dims, SHOWN);
      const w = roomWindow(dims);
      const opening: Box3 = {
        minX: w.minX - 0.04,
        maxX: w.maxX + 0.04,
        minY: w.minY - 0.03,
        maxY: w.maxY,
        minZ: w.wallZ,
        maxZ: w.wallZ + WINDOW_SILL_DEPTH,
      };
      const onWall = blocks.filter((b) => b.part !== 'lumiere');
      // La vitre passe devant la cimaise du mur du fond (aucune face confondue).
      const rail = roomBlocks(dims, SHOWN).find((b) => b.part === 'cimaise' && b.shell === 'fond');
      const glass = onWall.find((b) => b.part === 'vitre');
      expect(glass!.box.maxZ).toBeGreaterThan(rail!.box.maxZ);
      expect(onWall.filter((b) => b.part === 'vitre').length).toBe(1);
      expect(onWall.filter((b) => b.part === 'fenetre').length).toBe(8);
      for (const b of onWall) {
        expect(b.shell).toBe('fond');
        expect(inside(b.box, opening)).toBe(true);
        expect(b.box.maxX).toBeGreaterThan(b.box.minX);
        expect(b.box.maxY).toBeGreaterThan(b.box.minY);
        expect(b.box.maxZ).toBeGreaterThan(b.box.minZ);
        expect(boxOnGrid(b.box)).toBe(true);
        // Jamais dans le volume du bac.
        expect(b.box.maxX).toBeLessThanOrEqual(-dims.width / 2);
      }
    });

    it(`pose la tache sur les lames, devant la fenêtre : ${JSON.stringify(dims)}`, () => {
      const patch = roomWindowBlocks(dims, SHOWN).filter((b) => b.part === 'lumiere');
      const planks = roomBlocks(dims, SHOWN).filter((b) => b.part === 'parquet');
      const w = roomWindow(dims);
      expect(patch.length).toBeGreaterThan(0);
      for (const b of patch) {
        expect(b.shell).toBeUndefined();
        expect(boxOnGrid(b.box)).toBe(true);
        expect(b.box.minX).toBeGreaterThanOrEqual(w.minX);
        expect(b.box.maxX).toBeLessThanOrEqual(w.maxX);
        expect(b.box.minZ).toBeGreaterThanOrEqual(w.wallZ + PATCH_OFFSET - 1e-9);
        expect(b.box.maxZ).toBeLessThanOrEqual(w.wallZ + PATCH_OFFSET + PATCH_DEPTH + 1e-9);
        // Dans une lame, à sa teinte.
        const plank = planks.find((p) => inside(b.box, p.box));
        expect(plank).toBeDefined();
        expect(b.shade).toBe(plank?.shade);
      }
      // Quatre carreaux moins les ombres du meneau et du croisillon : moins que le rectangle.
      const full = (w.maxX - w.minX) * PATCH_DEPTH;
      expect(area(patch)).toBeGreaterThan(0.6 * full);
      expect(area(patch)).toBeLessThan(full);
    });
  }

  it('suit la hauteur du meuble : la tache reste sur le parquet', () => {
    for (const cabinetHeight of [0.6, 1]) {
      const room = { shown: true, cabinetHeight };
      const patch = roomWindowBlocks(DEFAULT_TANK, room).filter((b) => b.part === 'lumiere');
      expect(patch.every((b) => b.box.maxY === -cabinetHeight)).toBe(true);
    }
  });

  it('est pure : mêmes entrées, mêmes blocs', () => {
    expect(roomWindowBlocks(DEFAULT_TANK, SHOWN)).toEqual(roomWindowBlocks(DEFAULT_TANK, SHOWN));
  });
});

describe('windowLightInto', () => {
  const at = (hour: number, overcast = 1) =>
    windowLightInto(lightAt(hour), overcast, createWindowLight());

  it('est neutre à midi, ciel dégagé', () => {
    const { glass, patch } = at(12);
    expect(glass).toEqual([1, 1, 1]);
    expect(patch).toEqual([1, 1, 1]);
  });

  it('est sombre et bleutée à minuit', () => {
    const { glass, patch } = at(0);
    expect(glass).toEqual([...WINDOW_NIGHT_GLASS]);
    expect(Math.max(...patch)).toBeLessThanOrEqual(WINDOW_NIGHT_PATCH);
    expect(glass[2]).toBeGreaterThan(glass[0]);
    expect(patch[2]).toBeGreaterThan(patch[0]);
    expect(glass[0]).toBeGreaterThan(0);
  });

  it('est chaude et intermédiaire à l’aube', () => {
    const { glass, patch } = at(6);
    const noon = at(12);
    const night = at(0);
    expect(patch[0]).toBeGreaterThan(patch[2]);
    expect(glass[0]).toBeGreaterThan(glass[2]);
    expect(patch[0]).toBeLessThan(noon.patch[0]);
    expect(patch[0]).toBeGreaterThan(night.patch[0]);
  });

  it('assombrit sous un ciel couvert, sans changer la teinte', () => {
    const clear = at(12);
    const overcast = at(12, 0.6);
    for (let k = 0; k < 3; k++) {
      expect(overcast.glass[k]).toBeCloseTo(0.6 * clear.glass[k], 12);
      expect(overcast.patch[k]).toBeCloseTo(0.6 * clear.patch[k], 12);
    }
  });

  it('borne intensité et ciel couvert ; une valeur non finie compte comme 1', () => {
    expect(at(12, Number.NaN).glass).toEqual([1, 1, 1]);
    expect(at(12, 3).glass).toEqual([1, 1, 1]);
    expect(at(12, -1).glass).toEqual([0, 0, 0]);
    const out = windowLightInto(
      { intensity: Number.POSITIVE_INFINITY, tint: [1, 1, 1], sky: [1, 1, 1] },
      1,
      createWindowLight(),
    );
    expect(out.glass).toEqual([1, 1, 1]);
  });

  it('écrit dans le tampon donné, sans allocation', () => {
    const out = createWindowLight();
    const glass = out.glass;
    expect(windowLightInto(lightAt(0), 1, out)).toBe(out);
    expect(out.glass).toBe(glass);
  });
});

describe('isWindowClear', () => {
  for (const dims of [SMALL_TANK, DEFAULT_TANK, LARGE_TANK]) {
    const w = roomWindow(dims);
    it(`vue de face et de trois-quarts : fenêtre dégagée (${JSON.stringify(dims)})`, () => {
      expect(isWindowClear(dims, w, 0, dims.height / 2, 2.5)).toBe(true);
      expect(isWindowClear(dims, w, 1.5, 1.5, 2.5)).toBe(true);
      // Caméra au-dessus de la fenêtre, devant elle.
      expect(isWindowClear(dims, w, (w.minX + w.maxX) / 2, 1, 1)).toBe(true);
    });

    it(`vue de côté (enfilade derrière l’eau) : fenêtre cachée (${JSON.stringify(dims)})`, () => {
      expect(isWindowClear(dims, w, 2, dims.height / 2, 0)).toBe(false);
      expect(isWindowClear(dims, w, 1.2, dims.height / 2, 0)).toBe(false);
    });
  }

  it('caméra derrière le bac, dans l’axe de la fenêtre : cachée dès qu’un point l’est', () => {
    const w = roomWindow(DEFAULT_TANK);
    // Caméra à droite du bac, à la hauteur de l'appui : le segment vers le coin bas gauche
    // traverse le bac.
    expect(isWindowClear(DEFAULT_TANK, w, 1.5, w.minY, -0.2)).toBe(false);
  });

  it('caméra dans l’alignement exact d’une face (segment parallèle à un axe)', () => {
    const w = roomWindow(DEFAULT_TANK);
    // Même z que la vitre, hors du bac : aucun segment ne le traverse.
    expect(isWindowClear(DEFAULT_TANK, w, 3, 1, w.wallZ + 0.03)).toBe(true);
    // Même hauteur que le haut du bac, segment horizontal au ras du couvercle.
    expect(isWindowClear(DEFAULT_TANK, w, w.minX, DEFAULT_TANK.height + 0.5, 3)).toBe(true);
  });
});

describe('fenêtre et sauvegarde', () => {
  it('ouvre une ancienne sauvegarde (pièce sans meubles) sans erreur ni champ ajouté', () => {
    const data = structuredClone(saveData(createDefaultWorld(3))) as unknown as {
      settings: Record<string, unknown>;
    };
    data.settings['room'] = { shown: true, cabinetHeight: 0.8 };
    const result = parseSaveData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const room = result.settings.room ?? DEFAULT_ROOM;
    expect(result.settings.room).toEqual({ shown: true, cabinetHeight: 0.8 });
    expect(roomWindowBlocks(DEFAULT_TANK, room).length).toBeGreaterThan(0);
    expect(Object.keys(saveData(result.world, result.settings).settings.room ?? {})).toEqual([
      'shown',
      'cabinetHeight',
    ]);
  });
});
