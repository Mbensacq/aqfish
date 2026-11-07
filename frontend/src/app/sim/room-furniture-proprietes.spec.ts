import { createPrng, type Prng } from '../core/random/prng';
import { ROOM_ITEM_KINDS, type RoomItem, type RoomQuarter } from './room';
import {
  boxesOverlap,
  floatingRoomItems,
  roomItemBox,
  settleRoomItems,
  tidyRoomItems,
} from './room-furniture';

/**
 * Propriétés de la gravité des meubles de la pièce (#446, #200 pt 1), sur des pièces tirées
 * au hasard à graine fixe : éléments qui se chevauchent, posés en l'air, sur une plante ou
 * au-dessus d'un parquet occupé. Les cas construits sont dans `room-furniture.spec.ts`.
 */

const SEEDS = 300;
const ELEVATIONS = [0, 0, 0.4, 0.5, 0.8, 1.2, 1.6] as const;

function pick<T>(prng: Prng, values: readonly T[]): T {
  return values[Math.floor(prng.next() * values.length)];
}

/** Coordonnée au centimètre dans [min, max]. */
function cm(prng: Prng, min: number, max: number): number {
  return Math.round((min + prng.next() * (max - min)) * 100) / 100;
}

/** Pièce de 1 à 8 éléments serrés sur 1,6 m × 1 m, pour provoquer piles et collisions. */
function randomItems(seed: number): RoomItem[] {
  const prng = createPrng(seed);
  const count = 1 + Math.floor(prng.next() * 8);
  const items: RoomItem[] = [];
  for (let i = 0; i < count; i++) {
    const elevation = pick(prng, ELEVATIONS);
    items.push({
      kind: pick(prng, ROOM_ITEM_KINDS),
      x: cm(prng, -2.4, -0.8),
      z: cm(prng, 0, 1),
      quarter: Math.floor(prng.next() * 4) as RoomQuarter,
      ...(elevation > 0 ? { elevation } : {}),
    });
  }
  return items;
}

function overlapping(items: readonly RoomItem[]): number {
  let pairs = 0;
  items.forEach((a, i) => {
    items.forEach((b, j) => {
      pairs += i < j && boxesOverlap(roomItemBox(a), roomItemBox(b)) ? 1 : 0;
    });
  });
  return pairs;
}

/** Même élément, à l'élévation près. */
function samePlace(a: RoomItem, b: RoomItem): boolean {
  return a.kind === b.kind && a.x === b.x && a.z === b.z && a.quarter === b.quarter;
}

describe('pièce : propriétés de la gravité sur des pièces tirées au hasard (#446)', () => {
  it('settleRoomItems ne fait que descendre, garde ordre et emprises, et se stabilise', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const items = randomItems(seed);
      const settled = settleRoomItems(items);
      expect(settled.length).toBe(items.length);
      settled.forEach((item, i) => {
        expect(samePlace(item, items[i])).toBe(true);
        const elevation = item.elevation ?? 0;
        expect(elevation).toBeGreaterThanOrEqual(0);
        expect(elevation).toBeLessThanOrEqual((items[i].elevation ?? 0) + 1e-9);
      });
      expect(settleRoomItems(settled)).toEqual(settled);
    }
  });

  it('tidyRoomItems rend une pièce posée, sans chevauchement, et ne bouge plus ensuite', () => {
    let reposed = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const items = randomItems(seed);
      const tidy = tidyRoomItems(items);
      expect(overlapping(tidy)).toBe(0);
      expect(floatingRoomItems(tidy)).toEqual([]);
      expect(tidyRoomItems(tidy)).toEqual(tidy);
      // Sous-suite de la liste relue : rien d'inventé, l'ordre est gardé.
      let from = 0;
      for (const item of tidy) {
        const at = items.findIndex((other, k) => k >= from && samePlace(other, item));
        expect(at).toBeGreaterThanOrEqual(from);
        from = at + 1;
      }
      reposed += tidy.some((item) => (item.elevation ?? 0) > 0) ? 1 : 0;
    }
    // Le tirage produit bien des piles (sinon la propriété ne prouverait rien).
    expect(reposed).toBeGreaterThan(SEEDS / 10);
  });

  it('un élément bloqué au-dessus d’une plante se pose sur un support tombé après lui', () => {
    // Graine 213 du tirage : table et étagère lâchées à la même hauteur ; la table, traitée
    // d'abord, tomberait sur la plante et le parquet sous elle est pris. L'étagère tombe
    // ensuite au parquet : la table doit alors se poser sur elle, pas rester en l'air.
    const table: RoomItem = { kind: 'table-basse', x: -1.38, z: 0, quarter: 1, elevation: 1.2 };
    const plant: RoomItem = { kind: 'plante-pot', x: -1.65, z: 0.16, quarter: 0 };
    const shelf: RoomItem = { kind: 'etagere', x: -1.25, z: 0.31, quarter: 3, elevation: 1.2 };
    const settled = settleRoomItems([table, plant, shelf]);
    expect(settled).toEqual([
      { ...table, elevation: 0.8 },
      plant,
      { kind: 'etagere', x: -1.25, z: 0.31, quarter: 3 },
    ]);
    expect(floatingRoomItems(settled)).toEqual([]);
  });

  it('une pièce déjà cohérente est rendue à l’identique', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const tidy = tidyRoomItems(randomItems(seed));
      expect(settleRoomItems(tidy)).toEqual(tidy);
    }
  });
});
