import { stashedList, stashFromList, switchEnvironment } from './environment-worlds';
import { setPopulation } from './population';
import { serializeWorld } from './save';
import { advance, createDefaultWorld, feed, type World } from './world';
import type { EnvironmentId } from './environment';

/** Bac tropical modifié : population réglée, nourri, avancé. */
function tropicalPlayed(seed = 42): World {
  return advance(feed(setPopulation(advance(createDefaultWorld(seed), 90), 'neon', 3), 0.1, 0), 40);
}

describe('switchEnvironment : état gardé par environnement (#277)', () => {
  it('aller-retour : le bac quitté est rendu tel quel, bit pour bit et figé', () => {
    const tropical = tropicalPlayed();
    const snapshot = serializeWorld(tropical);
    const tick = tropical.tick;
    const toPond = switchEnvironment(tropical, new Map(), 'bassin');
    expect(toPond.resumed).toBe(false);
    expect(toPond.world).toEqual(createDefaultWorld(42, 'bassin'));
    expect([...toPond.stash.keys()]).toEqual(['tropical']);
    // Le bassin vit sa vie pendant ce temps.
    const pond = advance(toPond.world, 300);
    const back = switchEnvironment(pond, toPond.stash, 'tropical');
    expect(back.resumed).toBe(true);
    expect(back.world).toBe(tropical);
    expect(serializeWorld(back.world)).toBe(snapshot);
    // Temps figé : le tick est celui du moment où on l'a quitté.
    expect(back.world.tick).toBe(tick);
    expect([...back.stash.keys()]).toEqual(['bassin']);
    expect(back.stash.get('bassin')).toBe(pond);
  });

  it('trois environnements : chacun retrouve son état, quel que soit l’ordre', () => {
    let world: World = tropicalPlayed(7);
    let stash = new Map() as ReadonlyMap<EnvironmentId, World>;
    const left = new Map<EnvironmentId, World>();
    for (const target of ['recif', 'paludarium', 'bassin', 'tropical', 'recif'] as const) {
      left.set(world.environment, world);
      const next = switchEnvironment(world, stash, target);
      const expected = left.get(target);
      expect(next.world).toBe(expected ?? next.world);
      expect(next.resumed).toBe(expected !== undefined);
      if (expected === undefined) {
        // Jamais visité : population par défaut, même graine.
        expect(next.world).toEqual(createDefaultWorld(7, target));
      }
      expect(next.stash.has(target)).toBe(false);
      world = advance(next.world, 20);
      stash = next.stash;
    }
    expect([...stash.keys()].sort()).toEqual(['bassin', 'paludarium', 'tropical']);
  });

  it('pure : la table reçue n’est pas modifiée', () => {
    const stash = new Map<EnvironmentId, World>([['bassin', createDefaultWorld(1, 'bassin')]]);
    const copy = new Map(stash);
    switchEnvironment(createDefaultWorld(1), stash, 'bassin');
    expect(stash).toEqual(copy);
  });

  it('refuse l’environnement déjà affiché et une table incohérente', () => {
    expect(() => switchEnvironment(createDefaultWorld(1), new Map(), 'tropical')).toThrow(
      RangeError,
    );
    const wrong = new Map<EnvironmentId, World>([['recif', createDefaultWorld(1, 'bassin')]]);
    expect(() => switchEnvironment(createDefaultWorld(1), wrong, 'bassin')).toThrow(RangeError);
  });
});

describe('stashedList / stashFromList', () => {
  it('liste dans l’ordre des environnements, sans celui affiché', () => {
    const stash = new Map<EnvironmentId, World>([
      ['recif', createDefaultWorld(2, 'recif')],
      ['tropical', createDefaultWorld(2)],
      ['bassin', createDefaultWorld(2, 'bassin')],
    ]);
    expect(stashedList(stash, 'paludarium').map((w) => w.environment)).toEqual([
      'tropical',
      'bassin',
      'recif',
    ]);
    expect(stashedList(stash, 'bassin').map((w) => w.environment)).toEqual(['tropical', 'recif']);
    expect(stashedList(new Map(), 'tropical')).toEqual([]);
  });

  it('table relue : aller-retour avec la liste', () => {
    const worlds = [createDefaultWorld(3, 'bassin'), createDefaultWorld(3, 'recif')];
    const stash = stashFromList(worlds, 'tropical');
    expect(stash.get('bassin')).toBe(worlds[0]);
    expect(stashedList(stash, 'tropical')).toEqual(worlds);
    expect(stashFromList([], 'tropical').size).toBe(0);
  });

  it('refuse un environnement en double ou celui affiché', () => {
    const pond = createDefaultWorld(3, 'bassin');
    expect(() => stashFromList([pond, pond], 'tropical')).toThrow(RangeError);
    expect(() => stashFromList([pond], 'bassin')).toThrow(RangeError);
  });
});
