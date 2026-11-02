import {
  DAY_PHASE_MIN_INTENSITY,
  lightAt,
  NIGHT_PHASE_MAX_INTENSITY,
  type MutableRgb,
} from './daylight';
import {
  BASEBOARD_HEIGHT,
  DEFAULT_ROOM,
  roomBlocks,
  roomInterior,
  ROOM_LIMITS,
  ROOM_VOXEL,
  type Room,
  type RoomBlock,
} from './room';
import {
  DOOR_CASING,
  DOOR_CASING_DEPTH,
  DOOR_CLEARANCE,
  DOOR_FRONT_GAP,
  DOOR_HEADROOM,
  DOOR_HEIGHT,
  DOOR_WIDTH,
  doorClearance,
  isDoorClear,
  LAMP_FULL_BELOW,
  LAMP_OFF_ABOVE,
  LAMP_OFF_SHADE,
  LAMP_ON_SHADE,
  lampColorsInto,
  lampIntensity,
  MOLDING_HEIGHT,
  PLINTH_DEPTH,
  roomDoor,
  roomDoorBlocks,
  roomLamp,
  roomLampBlocks,
  roomTrimBlocks,
} from './room-details';
import { dropRoomItem, roomArea, ROOM_CATALOG } from './room-furniture';
import { roomWindowBlocks } from './room-window';
import { MAX_TANK, TANK_LIMITS, type Box3, type TankDimensions } from './tank';

const SHOWN: Room = { shown: true, cabinetHeight: 0.75 };
const LOW: Room = { shown: true, cabinetHeight: ROOM_LIMITS.cabinetHeight.min };
const HIGH: Room = { shown: true, cabinetHeight: ROOM_LIMITS.cabinetHeight.max };
const DEFAULT_TANK: TankDimensions = { width: 1, height: 0.5, depth: 0.5 };
const MIN_TANK: TankDimensions = {
  width: TANK_LIMITS.width.min,
  height: TANK_LIMITS.height.min,
  depth: TANK_LIMITS.depth.min,
};
const ODD_TANK: TankDimensions = { width: 0.75, height: 0.55, depth: 0.35 };
const TANKS = [DEFAULT_TANK, MIN_TANK, MAX_TANK, ODD_TANK];
const ROOMS = [SHOWN, LOW, HIGH];

function onGrid(value: number): boolean {
  return Math.abs(value / ROOM_VOXEL - Math.round(value / ROOM_VOXEL)) < 1e-6;
}

function allBlocks(dims: TankDimensions, room: Room): RoomBlock[] {
  return [
    ...roomTrimBlocks(dims, room),
    ...roomDoorBlocks(dims, room),
    ...roomLampBlocks(dims, room),
  ];
}

function intersects(a: Box3, b: Box3): boolean {
  const e = 1e-6;
  return (
    a.minX < b.maxX - e &&
    a.maxX > b.minX + e &&
    a.minY < b.maxY - e &&
    a.maxY > b.minY + e &&
    a.minZ < b.maxZ - e &&
    a.maxZ > b.minZ + e
  );
}

describe('détails de la pièce (#363)', () => {
  describe('porte', () => {
    it('est dans le mur de droite, à DOOR_FRONT_GAP du mur d’en face, de DOOR_WIDTH de large', () => {
      const inner = roomInterior(DEFAULT_TANK);
      const door = roomDoor(DEFAULT_TANK, SHOWN);
      expect(door.wallX).toBeCloseTo(inner.maxX, 9);
      expect(door.maxZ).toBeCloseTo(inner.maxZ - DOOR_FRONT_GAP, 9);
      expect(door.maxZ - door.minZ).toBeCloseTo(DOOR_WIDTH, 9);
      expect(door.minY).toBeCloseTo(-SHOWN.cabinetHeight, 9);
      expect(door.maxY - door.minY).toBeCloseTo(DOOR_HEIGHT, 9);
    });

    it('tient dans la pièce, sous la moulure, pour les bacs et meubles extrêmes', () => {
      for (const dims of TANKS) {
        for (const room of ROOMS) {
          const inner = roomInterior(dims);
          const door = roomDoor(dims, room);
          expect(door.minZ - DOOR_CASING).toBeGreaterThan(inner.minZ + 1);
          expect(door.maxZ + DOOR_CASING).toBeLessThan(inner.maxZ);
          const top = door.maxY + DOOR_CASING;
          expect(top).toBeLessThanOrEqual(inner.ceilingY - MOLDING_HEIGHT - DOOR_HEADROOM + 1e-9);
          expect(door.maxY - door.minY).toBeGreaterThan(1.9);
          expect(door.maxY - door.minY).toBeLessThanOrEqual(DOOR_HEIGHT + 1e-9);
          for (const v of [door.minZ, door.maxZ, door.minY, door.maxY, door.wallX]) {
            expect(onGrid(v)).toBe(true);
          }
        }
      }
    });

    it('ne dépend pas de la hauteur du meuble en Z, la suit en Y', () => {
      const low = roomDoor(DEFAULT_TANK, LOW);
      const high = roomDoor(DEFAULT_TANK, HIGH);
      expect(low.minZ).toBe(high.minZ);
      expect(low.maxZ).toBe(high.maxZ);
      expect(high.minY).toBeLessThan(low.minY);
    });

    it('chambranle en saillie d’un voxel de plus que la plinthe', () => {
      expect(DOOR_CASING_DEPTH).toBeCloseTo(PLINTH_DEPTH + ROOM_VOXEL, 9);
      const door = roomDoor(DEFAULT_TANK, SHOWN);
      const casing = roomDoorBlocks(DEFAULT_TANK, SHOWN).filter((b) => b.part === 'chambranle');
      expect(casing).toHaveLength(3);
      for (const b of casing) {
        expect(door.wallX - b.box.minX).toBeCloseTo(DOOR_CASING_DEPTH, 9);
      }
    });

    it('lève une RangeError pour des dimensions invalides', () => {
      expect(() => roomDoor({ width: 0, height: 0.5, depth: 0.5 }, SHOWN)).toThrow(RangeError);
      expect(() => roomDoor({ width: 1, height: NaN, depth: 0.5 }, SHOWN)).toThrow(RangeError);
      expect(() => roomTrimBlocks({ width: 1, height: 0.5, depth: -1 }, SHOWN)).toThrow(RangeError);
    });
  });

  describe('blocs', () => {
    it('aucun bloc pièce masquée', () => {
      expect(allBlocks(DEFAULT_TANK, DEFAULT_ROOM)).toEqual([]);
    });

    it('cotes au voxel, dans la pièce, hors du bac, chaque bloc dans une paroi', () => {
      for (const dims of TANKS) {
        for (const room of ROOMS) {
          const inner = roomInterior(dims);
          const floorY = -room.cabinetHeight;
          for (const { box: b, shell } of allBlocks(dims, room)) {
            expect(shell).toBeDefined();
            for (const v of Object.values(b)) {
              expect(onGrid(v)).toBe(true);
            }
            expect(b.minX).toBeGreaterThanOrEqual(inner.minX - 1e-9);
            expect(b.maxX).toBeLessThanOrEqual(inner.maxX + 1e-9);
            expect(b.minZ).toBeGreaterThanOrEqual(inner.minZ - 1e-9);
            expect(b.maxZ).toBeLessThanOrEqual(inner.maxZ + 1e-9);
            expect(b.minY).toBeGreaterThanOrEqual(floorY - 1e-9);
            expect(b.maxY).toBeLessThanOrEqual(inner.ceilingY + 1e-9);
            const tank: Box3 = {
              minX: -dims.width / 2,
              maxX: dims.width / 2,
              minY: 0,
              maxY: dims.height,
              minZ: -dims.depth / 2,
              maxZ: dims.depth / 2,
            };
            expect(intersects(b, tank)).toBe(false);
          }
        }
      }
    });

    it('plinthes au pied des trois autres murs, sans recouvrement ni passage de porte', () => {
      const door = roomDoor(DEFAULT_TANK, SHOWN);
      const plinths = roomTrimBlocks(DEFAULT_TANK, SHOWN).filter((b) => b.part === 'plinthe');
      expect(new Set(plinths.map((b) => b.shell))).toEqual(new Set(['gauche', 'droite', 'avant']));
      const back = roomBlocks(DEFAULT_TANK, SHOWN).filter((b) => b.part === 'plinthe');
      expect(back).toHaveLength(1);
      for (const p of plinths) {
        expect(p.box.minY).toBeCloseTo(-SHOWN.cabinetHeight, 9);
        expect(p.box.maxY - p.box.minY).toBeCloseTo(BASEBOARD_HEIGHT, 9);
        for (const other of [...plinths, ...back]) {
          if (other !== p) {
            expect(intersects(p.box, other.box)).toBe(false);
          }
        }
        // La plinthe s'arrête au chambranle : rien dans le passage de la porte.
        if (p.shell === 'droite') {
          expect(
            p.box.maxZ <= door.minZ - DOOR_CASING + 1e-9 ||
              p.box.minZ >= door.maxZ + DOOR_CASING - 1e-9,
          ).toBe(true);
        }
      }
    });

    it('moulure sous le plafond des quatre murs', () => {
      const inner = roomInterior(DEFAULT_TANK);
      const moldings = roomTrimBlocks(DEFAULT_TANK, SHOWN).filter((b) => b.part === 'moulure');
      expect(moldings.map((b) => b.shell).sort()).toEqual(['avant', 'droite', 'fond', 'gauche']);
      for (const m of moldings) {
        expect(m.box.maxY).toBeCloseTo(inner.ceilingY, 9);
        expect(m.box.maxY - m.box.minY).toBeCloseTo(MOLDING_HEIGHT, 9);
      }
    });

    it('applique entre la fenêtre et la porte, sans toucher le chambranle', () => {
      for (const dims of TANKS) {
        for (const room of ROOMS) {
          const lamp = roomLamp(dims, room);
          const door = roomDoor(dims, room);
          const inner = roomInterior(dims);
          expect(lamp.halo.maxZ).toBeLessThan(door.minZ - DOOR_CASING);
          expect(lamp.halo.minZ).toBeGreaterThan(inner.minZ);
          expect(lamp.halo.minY).toBeGreaterThan(door.minY + BASEBOARD_HEIGHT);
          expect(lamp.halo.maxY).toBeLessThan(inner.ceilingY - MOLDING_HEIGHT);
          const parts = roomLampBlocks(dims, room).map((b) => b.part);
          expect(parts).toEqual([
            'halo',
            'halo',
            'halo',
            'halo',
            'applique',
            'applique',
            'abat-jour',
          ]);
          for (const b of roomLampBlocks(dims, room).filter((l) => l.part === 'halo')) {
            expect(b.box.minY).toBeGreaterThanOrEqual(lamp.halo.minY - 1e-9);
            expect(b.box.maxY).toBeLessThanOrEqual(lamp.halo.maxY + 1e-9);
            expect(b.box.minZ).toBeGreaterThanOrEqual(lamp.halo.minZ - 1e-9);
            expect(b.box.maxZ).toBeLessThanOrEqual(lamp.halo.maxZ + 1e-9);
          }
          // L'applique et sa fenêtre ne se rencontrent pas (fenêtre au mur du fond).
          for (const w of roomWindowBlocks(dims, room)) {
            for (const b of roomLampBlocks(dims, room)) {
              expect(intersects(w.box, b.box)).toBe(false);
            }
          }
        }
      }
    });

    it('mêmes entrées, mêmes blocs', () => {
      expect(allBlocks(ODD_TANK, SHOWN)).toEqual(allBlocks(ODD_TANK, SHOWN));
    });
  });

  describe('pose des meubles', () => {
    it('un meuble posé contre un mur reste devant ses plinthes', () => {
      const area = roomArea(DEFAULT_TANK);
      const inner = roomInterior(DEFAULT_TANK);
      expect(area.minX).toBeCloseTo(inner.minX + PLINTH_DEPTH, 9);
      expect(area.maxX).toBeCloseTo(inner.maxX - PLINTH_DEPTH, 9);
      expect(area.maxZ).toBeCloseTo(inner.maxZ - PLINTH_DEPTH, 9);
      const half = ROOM_CATALOG.etagere.depth / 200;
      // Étagère tournée dos au mur de gauche, plaquée contre sa plinthe : acceptée.
      const flush = dropRoomItem(SHOWN, DEFAULT_TANK, {
        kind: 'etagere',
        x: area.minX + half,
        z: 0.8,
        quarter: 1,
      });
      expect(flush.ok).toBe(true);
      // Un centimètre plus loin, elle entrerait dans la plinthe : refusée.
      const into = dropRoomItem(SHOWN, DEFAULT_TANK, {
        kind: 'etagere',
        x: area.minX + half - 0.01,
        z: 0.8,
        quarter: 1,
      });
      expect(into).toEqual({ ok: false, reason: 'hors-piece' });
      const front = dropRoomItem(SHOWN, DEFAULT_TANK, {
        kind: 'etagere',
        x: -1.5,
        z: area.maxZ - half + 0.01,
        quarter: 2,
      });
      expect(front).toEqual({ ok: false, reason: 'hors-piece' });
    });

    it('rien ne se pose devant la porte, à côté si', () => {
      for (const dims of [DEFAULT_TANK, MIN_TANK, MAX_TANK]) {
        const door = roomDoor(dims, SHOWN);
        const clearance = doorClearance(dims);
        expect(clearance.maxX - clearance.minX).toBeCloseTo(DOOR_CLEARANCE, 9);
        const area = roomArea(dims);
        expect(area.door.minZ).toBeCloseTo(door.minZ - DOOR_CASING, 9);
        const mid = (door.minZ + door.maxZ) / 2;
        const half = ROOM_CATALOG['plante-pot'].width / 200;
        const blocked = dropRoomItem(SHOWN, dims, {
          kind: 'plante-pot',
          x: area.maxX - half,
          z: mid,
          quarter: 0,
        });
        expect(blocked).toEqual({ ok: false, reason: 'porte' });
        const beside = dropRoomItem(SHOWN, dims, {
          kind: 'plante-pot',
          x: area.maxX - half,
          z: clearance.minZ - half,
          quarter: 0,
        });
        expect(beside.ok).toBe(true);
        const ahead = dropRoomItem(SHOWN, dims, {
          kind: 'plante-pot',
          x: clearance.minX - half,
          z: mid,
          quarter: 0,
        });
        expect(ahead.ok).toBe(true);
      }
    });
  });

  describe('intensité de l’applique', () => {
    it('nulle de jour, pleine la nuit, croissante au crépuscule', () => {
      expect(lampIntensity(1)).toBe(0);
      expect(lampIntensity(LAMP_OFF_ABOVE)).toBe(0);
      expect(lampIntensity(LAMP_FULL_BELOW)).toBe(1);
      expect(lampIntensity(0)).toBe(1);
      expect(LAMP_OFF_ABOVE).toBe(DAY_PHASE_MIN_INTENSITY);
      expect(LAMP_FULL_BELOW).toBe(NIGHT_PHASE_MAX_INTENSITY);
      let previous = -1;
      for (let i = LAMP_OFF_ABOVE; i >= LAMP_FULL_BELOW - 1e-9; i -= 0.05) {
        const v = lampIntensity(i);
        expect(v).toBeGreaterThanOrEqual(previous);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        previous = v;
      }
      expect(lampIntensity((LAMP_OFF_ABOVE + LAMP_FULL_BELOW) / 2)).toBeCloseTo(0.5, 9);
    });

    it('suit les heures : éteinte à midi, allumée à minuit, partielle à la nuit tombante', () => {
      expect(lampIntensity(lightAt(12).intensity)).toBe(0);
      expect(lampIntensity(lightAt(0).intensity)).toBe(1);
      const dusk = [17, 17.5, 18, 18.5, 19, 19.5, 20, 21].map((h) =>
        lampIntensity(lightAt(h).intensity),
      );
      for (let i = 1; i < dusk.length; i++) {
        expect(dusk[i]).toBeGreaterThanOrEqual(dusk[i - 1]);
      }
      expect(dusk.some((v) => v > 0 && v < 1)).toBe(true);
    });

    it('valeurs non finies ramenées à zéro, hors bornes bornées', () => {
      expect(lampIntensity(NaN)).toBe(0);
      expect(lampIntensity(Infinity)).toBe(0);
      expect(lampIntensity(-Infinity)).toBe(0);
      expect(lampIntensity(-3)).toBe(1);
      expect(lampIntensity(7)).toBe(0);
    });

    it('teintes de l’abat-jour et du halo, sans allocation', () => {
      const shade: MutableRgb = [0, 0, 0];
      const halo: MutableRgb = [0, 0, 0];
      lampColorsInto(0, shade, halo);
      expect(shade).toEqual([LAMP_OFF_SHADE, LAMP_OFF_SHADE, LAMP_OFF_SHADE]);
      expect(halo).toEqual([0, 0, 0]);
      lampColorsInto(1, shade, halo);
      expect(shade).toEqual([...LAMP_ON_SHADE]);
      expect(halo).toEqual([1, 1, 1]);
      lampColorsInto(NaN, shade, halo);
      expect(halo).toEqual([0, 0, 0]);
      lampColorsInto(5, shade, halo);
      expect(halo).toEqual([1, 1, 1]);
    });
  });

  describe('porte cachée par le bac', () => {
    const dims = DEFAULT_TANK;
    const door = roomDoor(dims, SHOWN);

    it('se voit de face, de trois-quarts et de l’intérieur côté droit', () => {
      expect(isDoorClear(dims, door, 0, 0.3, 3)).toBe(true);
      expect(isDoorClear(dims, door, 2, 1, 2.5)).toBe(true);
      expect(isDoorClear(dims, door, 1.5, 0.5, 0)).toBe(true);
    });

    it('cachée quand la ligne de visée traverse le bac', () => {
      const z = (door.minZ + door.maxZ) / 2;
      const y = (door.minY + door.maxY) / 2;
      // Caméra de l'autre côté du bac, alignée sur le centre de la porte et celui du bac.
      const k = 0.5;
      const c = [-k * door.wallX, 0.25 - k * (y - 0.25), -k * z];
      expect(isDoorClear(dims, door, c[0], c[1], c[2])).toBe(false);
    });
  });
});
