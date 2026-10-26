import {
  addRivalSteering,
  compatibility,
  enforceRivalDistance,
  hasRivals,
  incompatible,
  isSwimmer,
  mixWarnings,
  RIVAL_AVOID_RADIUS,
  RIVAL_MIN_DISTANCE,
  TEMPERAMENTS,
} from './compatibility';
import { ENVIRONMENT_IDS, environmentById } from './environment';
import { mixWarningText } from './species-catalog';
import { SPECIES, type SpeciesId } from './species';
import type { Fish, SwimBounds } from './swimmer';
import { createDefaultWorld, createWorld, step, type World } from './world';

const IDS = Object.keys(SPECIES) as SpeciesId[];

type MutableFish = { -readonly [K in keyof Fish]: Fish[K] };

function fishAt(id: number, species: SpeciesId, x: number, y = 0, z = 0): MutableFish {
  const base = createWorld(1, [{ species, count: 1 }]).entities[0];
  return { ...base, id, species, x, y, z };
}

/** Bornes réduites à `hard`, seule partie lue par `enforceRivalDistance`. */
function boxBounds(hard: SwimBounds['hard']): SwimBounds {
  return { hard } as unknown as SwimBounds;
}

const OPEN = boxBounds({ minX: -10, maxX: 10, minY: -10, maxY: 10, minZ: -10, maxZ: 10 });

function minRivalDistance(world: World): number {
  let min = Infinity;
  const fishes = world.entities;
  for (let i = 0; i < fishes.length; i++) {
    for (let j = i + 1; j < fishes.length; j++) {
      const a = fishes[i];
      const b = fishes[j];
      if (!incompatible(a.species, b.species) || !isSwimmer(a) || !isSwimmer(b)) {
        continue;
      }
      min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
  }
  return min;
}

describe('compatibility (issue #209)', () => {
  it('est symétrique pour tous les couples d’espèces', () => {
    for (const a of IDS) {
      for (const b of IDS) {
        expect(compatibility(a, b)).toBe(compatibility(b, a));
      }
    }
  });

  it('même espèce : toujours compatible, prédateurs et territoriaux compris', () => {
    for (const id of IDS) {
      expect(compatibility(id, id)).toBe('compatible');
    }
    expect(compatibility('koi', 'koi')).toBe('compatible');
    expect(compatibility('clown', 'clown')).toBe('compatible');
  });

  it('espèce inconnue ou clé du prototype : compatible, sans erreur', () => {
    expect(compatibility('requin', 'neon')).toBe('compatible');
    expect(compatibility('neon', 'requin')).toBe('compatible');
    expect(compatibility('requin', 'requin')).toBe('compatible');
    expect(compatibility('constructor', 'koi')).toBe('compatible');
    expect(compatibility('', 'toString')).toBe('compatible');
  });

  it('prédateur et espèce plus petite : déconseillé ; plus grande ou égale : compatible', () => {
    expect(SPECIES.neon.bodyLength).toBeLessThan(SPECIES.koi.bodyLength);
    expect(compatibility('koi', 'neon')).toBe('predateur');
    expect(compatibility('axolotl', 'triton')).toBe('predateur');
    expect(compatibility('axolotl', 'grenouille')).toBe('predateur');
    // Le koï (14 cm) est plus grand que l'axolotl (9 cm) : c'est lui le prédateur.
    expect(compatibility('axolotl', 'koi')).toBe('predateur');
    // Le chirurgien bleu (11 cm) est plus grand que l'axolotl : compatible.
    expect(compatibility('axolotl', 'chirurgien')).toBe('compatible');
  });

  it('deux espèces paisibles sont compatibles', () => {
    expect(compatibility('neon', 'guppy')).toBe('compatible');
    expect(compatibility('guppy', 'corydora')).toBe('compatible');
    expect(compatibility('clown', 'chirurgien')).toBe('compatible');
  });

  it('chaque espèce a un tempérament', () => {
    expect(Object.keys(TEMPERAMENTS).sort()).toEqual([...IDS].sort());
  });

  it('bac tropical, bassin et récif par défaut : aucun mélange déconseillé', () => {
    for (const env of ['tropical', 'bassin', 'recif'] as const) {
      const environment = environmentById(env);
      const counts = Object.fromEntries(environment.population.map((p) => [p.species, p.count]));
      expect(mixWarnings(environment.species, counts)).toEqual([]);
    }
  });

  it('paludarium par défaut : l’axolotl est déconseillé avec grenouilles et tritons', () => {
    const environment = environmentById('paludarium');
    const counts = Object.fromEntries(environment.population.map((p) => [p.species, p.count]));
    expect(mixWarnings(environment.species, counts)).toEqual([
      { first: 'axolotl', second: 'grenouille', reason: 'predateur' },
      { first: 'axolotl', second: 'triton', reason: 'predateur' },
    ]);
  });

  it('mixWarnings ignore les effectifs nuls, non finis, les inconnues et les doublons', () => {
    const order = ['axolotl', 'triton', 'grenouille', 'requin', 'axolotl'];
    expect(mixWarnings(order, { axolotl: 2, triton: 0, grenouille: NaN, requin: 3 })).toEqual([]);
    expect(mixWarnings(order, { axolotl: Infinity, triton: 1 })).toEqual([]);
    expect(mixWarnings(order, { axolotl: 1, triton: 1 })).toEqual([
      { first: 'axolotl', second: 'triton', reason: 'predateur' },
    ]);
    expect(mixWarnings(['triton', 'axolotl'], { axolotl: 1, triton: 1 })).toEqual([
      { first: 'triton', second: 'axolotl', reason: 'predateur' },
    ]);
    expect(mixWarnings([], {})).toEqual([]);
  });

  it('libellé du mélange déconseillé', () => {
    expect(mixWarningText({ first: 'axolotl', second: 'triton', reason: 'predateur' })).toBe(
      'Mélange déconseillé : axolotls et tritons (prédateur)',
    );
    expect(mixWarningText({ first: 'clown', second: 'koi', reason: 'territorial' })).toBe(
      'Mélange déconseillé : poissons-clowns et koïs (deux espèces territoriales)',
    );
  });
});

describe('évitement entre espèces incompatibles (issue #209)', () => {
  it('hasRivals : seulement des nageurs d’espèces incompatibles', () => {
    expect(hasRivals([fishAt(0, 'koi', 0), fishAt(1, 'neon', 1)])).toBe(true);
    expect(hasRivals([fishAt(0, 'koi', 0), fishAt(1, 'koi', 1)])).toBe(false);
    expect(hasRivals([fishAt(0, 'neon', 0), fishAt(1, 'guppy', 1)])).toBe(false);
    // Axolotl (marcheur) et triton (amphibie) : pas des nageurs.
    expect(hasRivals([fishAt(0, 'axolotl', 0), fishAt(1, 'triton', 1)])).toBe(false);
    expect(hasRivals([])).toBe(false);
  });

  it('aucun monde par défaut n’a de rivaux nageurs', () => {
    for (const env of ENVIRONMENT_IDS) {
      expect(hasRivals(createDefaultWorld(42, env).entities)).toBe(false);
    }
  });

  it('addRivalSteering : s’éloigne du rival proche, ignore congénères et rivaux lointains', () => {
    const fishes = [
      fishAt(0, 'koi', 0),
      fishAt(1, 'neon', 0.1),
      fishAt(2, 'neon', 0.1 + RIVAL_AVOID_RADIUS + 0.5),
    ];
    const out = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    addRivalSteering(fishes, out);
    expect(out[0]).toBeLessThan(1); // le koï s'écarte vers −X
    expect(out[3]).toBeGreaterThan(4); // le néon proche vers +X
    expect([out[1], out[2], out[4], out[5]]).toEqual([2, 3, 5, 6]);
    expect([...out.slice(6)]).toEqual([7, 8, 9]); // néon lointain : rien
  });

  it('addRivalSteering : sans rival, le pilotage est intact', () => {
    const fishes = [fishAt(0, 'neon', 0), fishAt(1, 'guppy', 0.01)];
    const out = new Float64Array([1, 2, 3, 4, 5, 6]);
    addRivalSteering(fishes, out);
    expect([...out]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('addRivalSteering : centres confondus, écart selon X par identifiant', () => {
    const out = new Float64Array(6);
    addRivalSteering([fishAt(0, 'koi', 0), fishAt(1, 'neon', 0)], out);
    expect(out[0]).toBeLessThan(0);
    expect(out[3]).toBeGreaterThan(0);
  });

  it('enforceRivalDistance : écarte les rivaux à la distance minimale, pas les autres', () => {
    const koi = fishAt(0, 'koi', 0);
    const neon = fishAt(1, 'neon', 0.05);
    const guppy = fishAt(2, 'guppy', 0.06);
    enforceRivalDistance([koi, neon, guppy], () => OPEN);
    expect(Math.abs(neon.x - koi.x)).toBeGreaterThanOrEqual(RIVAL_MIN_DISTANCE);
    // Le guppy n'est pas un rival du néon : seul le koï l'écarte.
    expect(Math.abs(guppy.x - koi.x)).toBeGreaterThanOrEqual(RIVAL_MIN_DISTANCE);
  });

  it('enforceRivalDistance : centres confondus et bornes respectées', () => {
    const koi = fishAt(5, 'koi', 0.2);
    const neon = fishAt(1, 'neon', 0.2);
    const box = boxBounds({ minX: 0, maxX: 0.25, minY: -1, maxY: 1, minZ: -1, maxZ: 1 });
    enforceRivalDistance([koi, neon], () => box);
    expect(koi.x).toBeLessThanOrEqual(box.hard.maxX);
    expect(neon.x).toBeGreaterThanOrEqual(box.hard.minX);
    // Plus petit identifiant (le néon) vers −X.
    expect(neon.x).toBeLessThan(koi.x);
  });

  it('graine 42, 600 pas : distance minimale toujours respectée entre koïs et néons', () => {
    let world = createWorld(
      42,
      [
        { species: 'koi', count: 4 },
        { species: 'neon', count: 10 },
      ],
      [],
      [],
      'bassin',
    );
    let min = Infinity;
    for (let i = 0; i < 600; i++) {
      world = step(world);
      min = Math.min(min, minRivalDistance(world));
    }
    expect(min).toBeGreaterThanOrEqual(RIVAL_MIN_DISTANCE - 1e-9);
    expect(min).toBeLessThan(Infinity);
  }, 15_000);
});
