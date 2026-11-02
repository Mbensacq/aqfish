import { environmentById } from './environment';
import {
  MAX_TOTAL_FISH,
  populationCounts,
  populationLimits,
  setPopulationInPlace,
} from './population';
import {
  ROOM_ANIMAL_CAP,
  ROOM_ANIMAL_CAP_MESSAGE,
  ROOM_TANK_CAP,
  ROOM_TANK_CAP_MESSAGE,
  roomAnimalCapRefusal,
  roomAnimalCount,
  roomAnimalRoom,
  roomPopulationLimits,
  roomSimulationCost,
  roomTankCapRefusal,
} from './room-limits';
import { serializeRoom } from './room-save';
import {
  addTank,
  createRoom,
  MAX_ROOM_TANKS,
  type RoomState,
  type TankPlacement,
} from './room-state';
import { cloneWorld, type MutableWorld } from './world';

const TROPICAL = environmentById('tropical').species;

/** Pièce de `tanks` bacs tropicaux de `perTank` animaux chacun (première espèce, puis suivantes). */
function roomWith(tanks: number, perTank: number, seed = 7): RoomState {
  const room = createRoom(seed, Array<'tropical'>(tanks).fill('tropical'));
  for (const tank of room.tanks) {
    const world = tank.world as MutableWorld;
    for (const species of TROPICAL) {
      setPopulationInPlace(world, species, 0);
    }
    let left = perTank;
    for (const species of TROPICAL) {
      if (left === 0) {
        break;
      }
      setPopulationInPlace(world, species, left);
      left -= populationCounts(world)[species];
    }
    expect(left).toBe(0);
  }
  return room;
}

const floor = (x: number, z: number): TankPlacement => ({ supportId: null, x, z, quarter: 0 });

describe('plafonds de la pièce (#392, ADR 0096)', () => {
  it('les plafonds d’ajout restent sous les bornes de validation', () => {
    expect(ROOM_TANK_CAP).toBeGreaterThan(1);
    expect(ROOM_TANK_CAP).toBeLessThanOrEqual(MAX_ROOM_TANKS);
    expect(ROOM_ANIMAL_CAP).toBeGreaterThanOrEqual(MAX_TOTAL_FISH);
    expect(ROOM_ANIMAL_CAP).toBeLessThanOrEqual(MAX_ROOM_TANKS * MAX_TOTAL_FISH);
    expect(ROOM_TANK_CAP_MESSAGE).toContain(String(ROOM_TANK_CAP));
    expect(ROOM_ANIMAL_CAP_MESSAGE).toContain(String(ROOM_ANIMAL_CAP));
  });

  describe('roomAnimalCount et roomSimulationCost', () => {
    it('pièce sans animal : zéro', () => {
      const room = roomWith(3, 0);
      expect(roomAnimalCount(room)).toBe(0);
      expect(roomSimulationCost(room)).toBe(0);
    });

    it('somme des animaux, et somme des carrés par bac (banc en O(n²))', () => {
      const room = roomWith(4, 10);
      expect(roomAnimalCount(room)).toBe(40);
      expect(roomSimulationCost(room)).toBe(4 * 100);
      const uneven = roomWith(2, 0);
      setPopulationInPlace(uneven.tanks[0].world as MutableWorld, TROPICAL[0], 20);
      expect(roomSimulationCost(uneven)).toBe(400);
    });

    it('le coût croît comme le carré : 1 bac de 40 coûte 4 fois 4 bacs de 10', () => {
      expect(roomSimulationCost(roomWith(1, 40))).toBe(4 * roomSimulationCost(roomWith(4, 10)));
    });
  });

  describe('plafond de bacs', () => {
    function fill(count: number): RoomState {
      let room = createRoom(3);
      for (let i = 1; i < count; i++) {
        const x = Math.round((-3.6 + ((i - 1) % 8) * 0.65) * 100) / 100;
        const z = Math.round((-2.6 + Math.floor((i - 1) / 8) * 0.5) * 100) / 100;
        const result = addTank(room, {
          environment: 'tropical',
          size: 'petit',
          placement: floor(x, z),
        });
        if (!result.ok) {
          throw new Error(`refusé : ${result.reason}`);
        }
        room = result.room;
      }
      return room;
    }

    it('sous le plafond : ajout permis', () => {
      expect(roomTankCapRefusal(createRoom(3))).toBeNull();
      expect(roomTankCapRefusal(fill(ROOM_TANK_CAP - 1))).toBeNull();
    });

    it('au plafond : refus avec message, et addTank refuse sans rien changer', () => {
      const room = fill(ROOM_TANK_CAP);
      const before = serializeRoom(room, 0);
      expect(room.tanks).toHaveLength(ROOM_TANK_CAP);
      expect(roomTankCapRefusal(room)).toBe(ROOM_TANK_CAP_MESSAGE);
      const result = addTank(room, {
        environment: 'tropical',
        size: 'petit',
        placement: floor(3, 2.6),
      });
      expect(result).toEqual({ ok: false, reason: 'piece-pleine' });
      expect(serializeRoom(room, 0)).toBe(before);
      expect(room.nextTankId).toBe(ROOM_TANK_CAP);
    });

    it('au-delà (ancienne sauvegarde, jusqu’à MAX_ROOM_TANKS) : toujours refusé, pièce gardée', () => {
      const big = createRoom(5, Array<'tropical'>(MAX_ROOM_TANKS).fill('tropical'));
      expect(roomTankCapRefusal(big)).toBe(ROOM_TANK_CAP_MESSAGE);
      expect(big.tanks).toHaveLength(MAX_ROOM_TANKS);
    });
  });

  describe('plafond d’animaux', () => {
    /** Pièce exactement au plafond : bacs pleins à `MAX_TOTAL_FISH`, reste dans le dernier. */
    function atCap(): RoomState {
      const full = Math.floor(ROOM_ANIMAL_CAP / MAX_TOTAL_FISH);
      const rest = ROOM_ANIMAL_CAP - full * MAX_TOTAL_FISH;
      const room = roomWith(full + 1, 0);
      room.tanks.forEach((tank, i) => {
        const world = tank.world as MutableWorld;
        let left = i < full ? MAX_TOTAL_FISH : rest;
        for (const species of TROPICAL) {
          setPopulationInPlace(world, species, left);
          left -= populationCounts(world)[species];
        }
      });
      expect(roomAnimalCount(room)).toBe(ROOM_ANIMAL_CAP);
      return room;
    }

    it('place restante : plafond moins les animaux de toute la pièce, jamais négative', () => {
      const room = roomWith(2, 10);
      expect(roomAnimalRoom(room, 0)).toBe(ROOM_ANIMAL_CAP - 20);
      expect(roomAnimalRoom(room, 1)).toBe(ROOM_ANIMAL_CAP - 20);
      expect(roomAnimalRoom(atCap(), 0)).toBe(0);
    });

    it('monde affiché plus récent que la pièce : ses animaux comptent à sa place', () => {
      const room = roomWith(2, 10);
      const shown = cloneWorld(room.tanks[0].world);
      setPopulationInPlace(shown, TROPICAL[0], 0);
      const remaining = populationCounts(shown);
      const own = Object.values(remaining).reduce((a, b) => a + b, 0);
      expect(roomAnimalRoom(room, 0, shown)).toBe(ROOM_ANIMAL_CAP - 10 - own);
    });

    it('sous le plafond : ajout permis ; retirer ou garder toujours permis', () => {
      const room = roomWith(2, 10);
      expect(roomAnimalCapRefusal(room, 0)).toBeNull();
      expect(roomAnimalCapRefusal(room, 0, ROOM_ANIMAL_CAP - 20)).toBeNull();
      expect(roomAnimalCapRefusal(room, 0, ROOM_ANIMAL_CAP - 19)).toBe(ROOM_ANIMAL_CAP_MESSAGE);
      expect(roomAnimalCapRefusal(atCap(), 0, 0)).toBeNull();
      expect(roomAnimalCapRefusal(atCap(), 0, -3)).toBeNull();
    });

    it('au plafond : l’ajout d’un animal est refusé avec un message, sans effet de bord', () => {
      const room = atCap();
      const before = serializeRoom(room, 0);
      for (const tank of room.tanks) {
        expect(roomAnimalCapRefusal(room, tank.id)).toBe(ROOM_ANIMAL_CAP_MESSAGE);
        const limits = roomPopulationLimits(room, tank.id);
        expect(limits).toEqual(populationCounts(tank.world));
      }
      expect(serializeRoom(room, 0)).toBe(before);
    });

    it('limites par espèce : celles du bac, ramenées à la place restante', () => {
      const room = roomWith(1, 0);
      expect(roomPopulationLimits(room, 0)).toEqual(populationLimits(room.tanks[0].world));
      const crowded = atCap();
      // Un bac vide de plus à côté d'une pièce au plafond : rien ne s'y ajoute.
      const extra = addTank(crowded, {
        environment: 'tropical',
        size: 'petit',
        placement: floor(3, 2.6),
      });
      if (!extra.ok) {
        throw new Error(extra.reason);
      }
      const zero = roomPopulationLimits(extra.room, extra.id);
      expect(Object.values(zero).every((n) => n === 0)).toBe(true);
    });

    it('au-delà du plafond (ancienne sauvegarde) : les animaux sont gardés, aucun ajout', () => {
      const room = roomWith(MAX_ROOM_TANKS, 10);
      expect(roomAnimalCount(room)).toBeGreaterThan(ROOM_ANIMAL_CAP);
      expect(roomAnimalRoom(room, 3)).toBe(0);
      expect(roomPopulationLimits(room, 3)).toEqual(populationCounts(room.tanks[3].world));
    });

    it('bac inconnu : RangeError', () => {
      const room = roomWith(1, 0);
      expect(() => roomAnimalRoom(room, 99)).toThrow(RangeError);
      expect(() => roomAnimalCapRefusal(room, 99)).toThrow(RangeError);
      expect(() => roomPopulationLimits(room, 99)).toThrow(RangeError);
    });
  });
});
