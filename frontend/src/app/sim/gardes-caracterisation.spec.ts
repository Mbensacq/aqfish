import { CARE_SESSION_STEPS, MAX_CARE_CUTS, readCareSession } from './care-session';
import { validateDecorItem } from './decor';
import type { Egg } from './eggs';
import {
  JOURNAL_ALERT_LABELS,
  JOURNAL_ALERT_REPEAT_SECONDS,
  JOURNAL_KINDS,
  observeJournal,
  readJournal,
  watchJournal,
  type JournalAlert,
  type JournalSubject,
} from './journal';
import { ROOM_ITEM_KINDS, type Room, type RoomItem } from './room';
import { dropRoomItem, type Footprint } from './room-furniture';
import {
  addSupport,
  createRoom,
  SUPPORT_KINDS,
  tankDimensionsOf,
  tankPlacementRefusal,
  type RoomState,
  type TankPlacement,
} from './room-state';
import { MAX_SIPHON_SHARE } from './siphon';
import type { SpeciesId } from './species';
import type { Fish } from './swimmer';
import { DEFAULT_TANK, MAX_TANK, type TankDimensions } from './tank';
import { createDefaultWorld } from './world';

/**
 * Caractérisation des gardes complexes de `sim/` (lot 6 du chantier #686) : relevée **avant**
 * le découpage de `observeJournal` et `isEntry` (`journal.ts`), `tankPlacementRefusal`
 * (`room-state.ts`), `readCareSession` (`care-session.ts`), `validateDecorItem` (`decor.ts`)
 * et `dropRoomItem` (`room-furniture.ts`). Chaque fonction reçoit une suite d'entrées tirée
 * d'un générateur pseudo-aléatoire fixe, complétée de cas aux bornes ; l'empreinte couvre la
 * sortie complète (texte JSON, ordre des clés et des messages compris). Chaque test vérifie en
 * plus que toutes les issues de la fonction (refus, raisons, sortes d'entrées) sont atteintes.
 *
 * Les empreintes ne changent que pour un changement de comportement voulu, expliqué dans la PR.
 */

/** Hachage cyrb53 incrémental (53 bits), comme `non-regression.spec.ts`. */
class Hash {
  private h1 = 0xdeadbeef;
  private h2 = 0x41c6ce57;

  add(text: string): void {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      this.h1 = Math.imul(this.h1 ^ c, 2654435761);
      this.h2 = Math.imul(this.h2 ^ c, 1597334677);
    }
    this.h1 = Math.imul(this.h1 ^ 10, 2654435761);
  }

  digest(): string {
    let h1 = this.h1;
    let h2 = this.h2;
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  }
}

/** Suite pseudo-aléatoire fixe (mulberry32), propre au test. */
function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(next: () => number, choices: readonly T[]): T {
  return choices[Math.floor(next() * choices.length)]!;
}

/** Texte d'une valeur qui garde `undefined`, `NaN` et les infinis (absents de JSON). */
function show(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? `#${String(v)}` : v,
  );
}

describe('caractérisation : observeJournal (#686, lot 6)', () => {
  const SPECIES: readonly SpeciesId[] = ['neon', 'corydora', 'guppy', 'platy', 'axolotl'];
  const FIELDS = ['ich', 'finRot', 'velvet', 'fungus', 'dropsy'] as const;
  const ALERT_IDS = [...Object.keys(JOURNAL_ALERT_LABELS), 'oxygen'] as JournalAlert['id'][];
  const base = createDefaultWorld(42).entities[0]!;

  function fishOf(next: () => number, id: number): Fish {
    const fish: Record<string, unknown> = { ...base, id, species: pick(next, SPECIES) };
    delete fish['growth'];
    for (const field of FIELDS) {
      delete fish[field];
      if (next() < 0.25) {
        fish[field] = 1;
      }
    }
    if (next() < 0.3) {
      fish['growth'] = 1;
    }
    return fish as unknown as Fish;
  }

  function subjectOf(next: () => number, time: number): JournalSubject {
    const entities: Fish[] = [];
    for (let id = 0; id < 8; id++) {
      if (next() < 0.7) {
        entities.push(fishOf(next, id));
      }
    }
    const eggs: Egg[] = [];
    const eggCount = Math.floor(next() * 5);
    for (let i = 0; i < eggCount; i++) {
      eggs.push({ species: pick(next, SPECIES), x: 0, y: 0, z: 0, age: 0, surface: 'vitre' });
    }
    const alerts: JournalAlert[] = [];
    for (const id of ALERT_IDS) {
      if (next() < 0.3) {
        alerts.push({ id, severity: next() < 0.5 ? 'attention' : 'critique' });
      }
    }
    return {
      time,
      entities,
      ...(next() < 0.1 ? {} : { eggs }),
      ...(next() < 0.1 ? {} : { alerts }),
    };
  }

  it('empreinte des événements et de la veille sur des suites tirées', () => {
    const hash = new Hash();
    const kinds = new Set<string>();
    for (const seed of [1, 2, 3, 4]) {
      const next = sequence(seed);
      const watch = watchJournal(subjectOf(next, 0));
      let time = 0;
      for (let step = 0; step < 250; step++) {
        const roll = next();
        time =
          roll < 0.05
            ? Math.max(0, time - 500)
            : time + (roll < 0.5 ? 60 : JOURNAL_ALERT_REPEAT_SECONDS / 3);
        const events = observeJournal(watch, subjectOf(next, time));
        for (const event of events) {
          kinds.add(event.kind);
        }
        hash.add(show(events));
        hash.add(show([...watch.diseases]));
        hash.add(show([...watch.eggs]));
        hash.add(show([...watch.alerts]));
        hash.add(show([...watch.alertNoted]));
      }
    }
    expect([...kinds].sort()).toEqual(
      ['alerte', 'eclosion', 'guerison', 'maladie', 'naissance', 'ponte'].sort(),
    );
    expect(hash.digest()).toBe('1d5dae0194ab89');
  });
});

describe('caractérisation : readJournal et isEntry (#686, lot 6)', () => {
  const DETAILS = [
    undefined,
    'ich',
    'dropsy',
    'sel',
    'neon',
    'guppy',
    'chlorine',
    'algae',
    'inconnu',
    3,
  ];
  const COUNTS = [undefined, 0, 1, 2, 1.5, 10_000, 10_001, Number.NaN, '2'];
  const SEVERITIES = [undefined, 'attention', 'critique', 'grave'];
  const TIMES = [0, 12.5, -1, Number.NaN, Number.POSITIVE_INFINITY, '3'];

  it('empreinte de la validation de chaque entrée', () => {
    const hash = new Hash();
    let valid = 0;
    let invalid = 0;
    for (const kind of [...JOURNAL_KINDS, 'autre', undefined]) {
      for (const detail of DETAILS) {
        for (const count of COUNTS) {
          for (const severity of SEVERITIES) {
            for (const time of TIMES) {
              const entry = { time, kind, detail, count, severity };
              const problems: string[] = [];
              const read = readJournal({ version: 1, entries: [entry] }, problems);
              if (read === null) {
                invalid++;
              } else {
                valid++;
              }
              hash.add(show([read, problems]));
            }
          }
        }
      }
    }
    for (const value of [null, [], 'x', 3, { time: 0 }, { time: 0, kind: 'seance', extra: 1 }]) {
      const problems: string[] = [];
      hash.add(show([readJournal({ version: 1, entries: [value] }, problems), problems]));
    }
    expect(valid).toBeGreaterThan(50);
    expect(invalid).toBeGreaterThan(valid);
    expect(hash.digest()).toBe('17e9614ac42c92');
  });
});

describe('caractérisation : tankPlacementRefusal (#686, lot 6)', () => {
  function furnished(): RoomState {
    let room = createRoom(42, ['tropical', 'bassin', 'recif', 'tropical']);
    const supports: [(typeof SUPPORT_KINDS)[number], number, number, 0 | 1 | 2 | 3][] = [
      ['commode', -2, -2, 0],
      ['etagere-animalerie', 2.2, -2, 0],
      ['etagere-bacs', 0, 1.6, 1],
    ];
    for (const [kind, x, z, quarter] of supports) {
      const result = addSupport(room, kind, x, z, quarter);
      if (result.ok) {
        room = result.room;
      }
    }
    return room;
  }

  it('empreinte des refus sur une grille de positions', () => {
    const room = furnished();
    expect(room.furniture.length).toBeGreaterThanOrEqual(2);
    const hash = new Hash();
    const reasons = new Set<string>();
    const next = sequence(7);
    const xs = [-3.2, -2, -0.5, 0, 0.6, 1.234, 2.2, 3.5, Number.NaN];
    const zs = [-2.4, -2, -0.3, 0, 1.6, 2.5];
    const levels = [undefined, 0, 1, 2, 3, -1, 1.5];
    const tanks = room.tanks.flatMap((tank) =>
      [0.7, 1.5, 2.5].map((height) => ({
        ...tank,
        world: { ...tank.world, dimensions: { ...tankDimensionsOf(tank), height } },
      })),
    );
    for (const tank of [...room.tanks, ...tanks]) {
      for (const supportId of [null, ...room.furniture.map((s) => s.id), 99]) {
        for (const x of xs) {
          for (const z of zs) {
            for (const level of levels) {
              const quarter = pick(next, [0, 1, 2, 3, 4, 0.5]) as TankPlacement['quarter'];
              const placement: TankPlacement =
                level === undefined
                  ? { supportId, x, z, quarter }
                  : { supportId, x, z, quarter, level };
              const refusal = tankPlacementRefusal(room, tank, placement);
              reasons.add(String(refusal));
              hash.add(show([tank.id, tank.world.dimensions?.height, placement, refusal]));
            }
          }
        }
      }
    }
    expect([...reasons].sort()).toEqual(
      [
        'chevauchement',
        'hors-piece',
        'hors-support',
        'jardin',
        'meuble-inconnu',
        'null',
        'position-invalide',
        'trop-haut',
      ].sort(),
    );
    expect(hash.digest()).toBe('026ba78475a698');
  });
});

describe('caractérisation : readCareSession (#686, lot 6)', () => {
  const STEPS = [...CARE_SESSION_STEPS, 'autre', 3];
  const OUTCOMES = [
    {},
    { vitres: 'fait' },
    { vitres: 'saute', siphon: 'fait' },
    { vitres: 'fait', siphon: 'fait', filtre: 'saute', eau: 'fait', taille: 'saute' },
    { bilan: 'fait' },
    { vitres: 'rate' },
    { inconnue: 'fait' },
    [],
    null,
    'fait',
  ];
  const SHARES = [undefined, 0, 0.3, MAX_SIPHON_SHARE, MAX_SIPHON_SHARE + 0.01, -0.1, '0.2'];
  const RINSES = [undefined, 'bac', 'robinet', 'puits'];
  const CUTS = [undefined, 0, 4, MAX_CARE_CUTS, MAX_CARE_CUTS + 1, 1.5, -1];

  it('empreinte de la relecture de séances enregistrées', () => {
    const hash = new Hash();
    let read = 0;
    for (const text of [null, '', 'pas du json', 'null', '[]', '3', '{}', '"vitres"']) {
      hash.add(show(readCareSession(text)));
    }
    for (const step of STEPS) {
      for (const outcomes of OUTCOMES) {
        for (const siphoned of SHARES) {
          for (const poured of SHARES) {
            for (const rinse of RINSES) {
              for (const cuts of CUTS) {
                const text = JSON.stringify({ step, outcomes, siphoned, poured, rinse, cuts });
                const session = readCareSession(text);
                read += session === null ? 0 : 1;
                hash.add(show(session));
              }
            }
          }
        }
      }
    }
    expect(read).toBeGreaterThan(100);
    expect(hash.digest()).toBe('01bab7525928f8');
  });
});

describe('caractérisation : validateDecorItem (#686, lot 6)', () => {
  const KINDS = ['rock', 'plant', 'wood', 'coral', undefined];
  const FORMS = [undefined, 'tall', 'tuft', 'mousse', 3];
  const NUMBERS = [0, 0.4, -0.7, 2, 0.1, 5, Number.NaN, Number.POSITIVE_INFINITY, '1', undefined];
  const SEEDS = [0, 7, 0xffffffff, 2 ** 32, -1, 1.5];
  const ELEVATIONS = [undefined, 0, 0.1, 10, -0.1, Number.NaN, 'haut'];

  it('empreinte des problèmes relevés', () => {
    const hash = new Hash();
    const next = sequence(11);
    for (const value of [null, [], 'roche', 3]) {
      hash.add(show(validateDecorItem(value)));
    }
    let clean = 0;
    for (let i = 0; i < 4000; i++) {
      const item: Record<string, unknown> = {
        kind: pick(next, KINDS),
        x: next() < 0.7 ? pick(next, [0, 0.1, -0.2]) : pick(next, NUMBERS),
        z: next() < 0.7 ? pick(next, [0, 0.1, -0.1]) : pick(next, NUMBERS),
        rotation: next() < 0.9 ? 1 : pick(next, NUMBERS),
        scale: pick(next, [1, 0.25, 3, 0.2, 3.1, ...NUMBERS]),
        seed: pick(next, SEEDS),
      };
      const form = pick(next, FORMS);
      if (form !== undefined || next() < 0.1) {
        item['form'] = form;
      }
      const elevation = pick(next, ELEVATIONS);
      if (elevation !== undefined || next() < 0.1) {
        item['elevation'] = elevation;
      }
      if (next() < 0.1) {
        item['couleur'] = 'rouge';
      }
      const dims: TankDimensions = next() < 0.5 ? DEFAULT_TANK : MAX_TANK;
      const problems = validateDecorItem(item, dims);
      clean += problems.length === 0 ? 1 : 0;
      hash.add(show([item, problems]));
    }
    expect(clean).toBeGreaterThan(20);
    expect(hash.digest()).toBe('10c4ef9decfa99');
  });
});

describe('caractérisation : dropRoomItem (#686, lot 6)', () => {
  const OBSTACLE: Footprint = { minX: 1, maxX: 1.6, minZ: -0.4, maxZ: 0.4 };

  it('empreinte des poses, déplacements et refus enchaînés', () => {
    const hash = new Hash();
    const reasons = new Set<string>();
    for (const seed of [3, 5, 8]) {
      const next = sequence(seed);
      let room: Room = { shown: true, cabinetHeight: pick(next, [0.75, 1.2]) };
      for (let step = 0; step < 400; step++) {
        const items = room.items ?? [];
        const replace =
          next() < 0.6
            ? undefined
            : pick(next, [0, items.length - 1, Math.floor(next() * items.length), -1, 1.5, 99]);
        const request = {
          kind: pick(next, ROOM_ITEM_KINDS),
          x: next() < 0.02 ? Number.NaN : Math.round((next() * 7 - 3.5) * 1000) / 1000,
          z:
            next() < 0.02 ? Number.POSITIVE_INFINITY : Math.round((next() * 5 - 2.5) * 1000) / 1000,
          quarter: pick(next, [0, 1, 2, 3] as const),
        };
        const dims = next() < 0.8 ? DEFAULT_TANK : MAX_TANK;
        const obstacles = next() < 0.3 ? [OBSTACLE] : [];
        const result = dropRoomItem(room, dims, request, replace, obstacles);
        reasons.add(result.ok ? 'ok' : result.reason);
        hash.add(show([request, replace, result]));
        if (result.ok) {
          room = { ...room, items: result.items };
        }
      }
    }
    const full: Room = {
      shown: true,
      cabinetHeight: 0.75,
      items: Array.from({ length: 24 }, (): RoomItem => ({
        kind: 'etagere',
        x: 0,
        z: 0,
        quarter: 0,
      })),
    };
    // Piles de l'issue #200 : chaque élément balayé sur une grille (déplacements, rotations).
    let stack: Room = { shown: true, cabinetHeight: 0.75 };
    for (const [kind, x, z] of [
      ['etagere', -1.6, -0.17],
      ['plante-pot', -1.03, -0.17],
      ['table-basse', -1.3, -0.08],
      ['plante-pot', -1.75, -0.17],
      ['table-basse', -0.7, -0.17],
      ['etagere', -0.4, 0.5],
      ['plante-pot', -0.4, 0.5],
    ] as const) {
      const result = dropRoomItem(stack, DEFAULT_TANK, { kind, x, z, quarter: 0 });
      if (result.ok) {
        stack = { ...stack, items: result.items };
      }
    }
    for (let index = 0; index < (stack.items ?? []).length; index++) {
      const kind = stack.items![index]!.kind;
      for (let x = -2.4; x <= -0.4; x += 0.1) {
        for (let z = -0.6; z <= 0.6; z += 0.15) {
          for (const quarter of [0, 1] as const) {
            const result = dropRoomItem(stack, DEFAULT_TANK, { kind, x, z, quarter }, index);
            reasons.add(result.ok ? 'ok' : result.reason);
            hash.add(show([index, x, z, quarter, result]));
          }
        }
      }
    }
    const fullResult = dropRoomItem(full, DEFAULT_TANK, {
      kind: 'etagere',
      x: 0,
      z: 0,
      quarter: 0,
    });
    reasons.add(fullResult.ok ? 'ok' : fullResult.reason);
    hash.add(show(fullResult));
    expect([...reasons].sort()).toEqual(
      [
        'chevauche',
        'en-l-air',
        'hors-piece',
        'introuvable',
        'meuble-bac',
        'meuble-support',
        'ok',
        'plein',
        'porte',
        'sur-plante',
        'trop-haut',
      ].sort(),
    );
    expect(hash.digest()).toBe('07cb3d4e0cb047');
  });
});
