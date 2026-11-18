import {
  cm,
  cmBoxesOverlap,
  insideRoomFloor,
  isCentimetric,
  ROOM_FLOOR,
  type CmBox,
} from './room-cm-box';

const box = (minX: number, maxX: number, minZ: number, maxZ: number): CmBox => ({
  minX,
  maxX,
  minY: 0,
  maxY: 10,
  minZ,
  maxZ,
});

describe('boîtes au centimètre de la pose (#686, lot 6)', () => {
  it('reconnaît les multiples finis du centimètre', () => {
    expect([0, -1.4, 2.25, 4].map(isCentimetric)).toEqual([true, true, true, true]);
    expect([0.123, Number.NaN, Number.POSITIVE_INFINITY].map(isCentimetric)).toEqual([
      false,
      false,
      false,
    ]);
    expect(cm(1.234)).toBe(123);
  });

  it('deux boîtes qui se touchent ne se chevauchent pas', () => {
    expect(cmBoxesOverlap(box(0, 10, 0, 10), box(10, 20, 0, 10))).toBe(false);
    expect(cmBoxesOverlap(box(0, 10, 0, 10), box(9, 20, 9, 20))).toBe(true);
    expect(cmBoxesOverlap(box(0, 10, 0, 10), { ...box(0, 10, 0, 10), minY: 10, maxY: 20 })).toBe(
      false,
    );
  });

  it('une emprise tient sur le sol jusqu’à ses bords compris (demi-centimètres)', () => {
    const hw = ROOM_FLOOR.halfWidth * 200;
    const hd = ROOM_FLOOR.halfDepth * 200;
    expect(insideRoomFloor(box(-hw, hw, -hd, hd))).toBe(true);
    expect(insideRoomFloor(box(-hw - 1, 0, 0, 10))).toBe(false);
    expect(insideRoomFloor(box(0, 10, 0, hd + 1))).toBe(false);
  });
});
