import { MAX_TOTAL_FISH, populationCounts, setPopulation } from './population';
import { createRoom, findTank, type RoomState } from './room-state';
import { serializeWorld } from './save';
import { speciesSheet } from './species-sheet';
import { transferFish, transferMessage, transferRefusal } from './tank-transfer';
import { advance, type World } from './world';

/** Remplace le monde du bac `id`. */
function withWorld(room: RoomState, id: number, world: World): RoomState {
  return { ...room, tanks: room.tanks.map((t) => (t.id === id ? { ...t, world } : t)) };
}

function worldOf(room: RoomState, id: number): World {
  return (findTank(room, id) as { world: World }).world;
}

function firstOf(world: World, species: string) {
  const fish = world.entities.find((entity) => entity.species === species);
  if (fish === undefined) {
    throw new Error(`aucun ${species}`);
  }
  return fish;
}

describe('transferFish : transfert d’un animal entre deux bacs (#306)', () => {
  // Bac 0 tropical, bac 1 récif, bac 2 tropical (vide de néons).
  const base = (): RoomState => {
    const room = createRoom(42, ['tropical', 'recif', 'tropical']);
    return withWorld(room, 2, setPopulation(worldOf(room, 2), 'neon', 0));
  };

  it('transfert accepté : l’animal quitte le départ et arrive avec un nouvel identifiant', () => {
    const room = base();
    const neon = firstOf(worldOf(room, 0), 'neon');
    const before0 = populationCounts(worldOf(room, 0)).neon;
    const arrivalNext = worldOf(room, 2).nextFishId;
    const result = transferFish(room, 0, 2, neon.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.id).toBe(arrivalNext);
    const from = worldOf(result.room, 0);
    const to = worldOf(result.room, 2);
    expect(populationCounts(from).neon).toBe(before0 - 1);
    expect(from.entities.some((e) => e.id === neon.id)).toBe(false);
    expect(populationCounts(to).neon).toBe(1);
    expect(to.nextFishId).toBe(arrivalNext + 1);
    const arrived = to.entities.find((e) => e.id === arrivalNext);
    expect(arrived?.species).toBe('neon');
    // Un néon seul : avertissement de groupe, non bloquant.
    expect(result.warnings.map((w) => w.kind)).toContain('groupe');
  });

  it('pure : la pièce d’origine et le bac non concerné sont inchangés', () => {
    const room = base();
    const texts = room.tanks.map((t) => serializeWorld(t.world));
    const result = transferFish(room, 0, 2, firstOf(worldOf(room, 0), 'neon').id);
    expect(room.tanks.map((t) => serializeWorld(t.world))).toEqual(texts);
    if (!result.ok) throw new Error('refusé');
    expect(worldOf(result.room, 1)).toBe(worldOf(room, 1));
    expect(result.room.seed).toBe(room.seed);
    expect(result.room.tick).toBe(room.tick);
    expect(result.room.nextTankId).toBe(room.nextTankId);
  });

  it('déterministe : deux transferts identiques donnent le même état, et la suite aussi', () => {
    const room = base();
    const id = firstOf(worldOf(room, 0), 'neon').id;
    const a = transferFish(room, 0, 2, id);
    const b = transferFish(room, 0, 2, id);
    if (!a.ok || !b.ok) throw new Error('refusé');
    expect(serializeWorld(advance(worldOf(a.room, 2), 120))).toBe(
      serializeWorld(advance(worldOf(b.room, 2), 120)),
    );
  });

  it('un animal malade et affamé garde sa santé et sa faim', () => {
    const room0 = base();
    const sick = { ...firstOf(worldOf(room0, 0), 'neon'), health: 0.25, hunger: 0.9 };
    const w0 = worldOf(room0, 0);
    const room = withWorld(room0, 0, {
      ...w0,
      entities: w0.entities.map((e) => (e.id === sick.id ? sick : e)),
    });
    const result = transferFish(room, 0, 2, sick.id);
    if (!result.ok) throw new Error('refusé');
    const arrived = worldOf(result.room, 2).entities.find((e) => e.id === result.id);
    expect(arrived?.health).toBe(0.25);
    expect(arrived?.hunger).toBe(0.9);
  });

  it('refuse l’eau douce vers l’eau de mer, et l’eau de mer vers l’eau douce', () => {
    const room = base();
    const neon = firstOf(worldOf(room, 0), 'neon');
    const clown = firstOf(worldOf(room, 1), 'clown');
    expect(transferRefusal(room, 0, 1, neon.id)).toBe('milieu');
    const back = transferFish(room, 1, 0, clown.id);
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.reason).toBe('milieu');
    expect(back.message).toContain('poissons-clowns');
    expect(back.message).toContain('Bac tropical');
  });

  it('refuse un bac plein (plafond de l’espèce, puis plafond total)', () => {
    const room0 = base();
    const max = setPopulation(worldOf(room0, 2), 'neon', 1000);
    const full = withWorld(room0, 2, max);
    const neon = firstOf(worldOf(full, 0), 'neon');
    expect(transferRefusal(full, 0, 2, neon.id)).toBe('bac-plein');
    const result = transferFish(full, 0, 2, neon.id);
    expect(result.ok ? null : result.message).toContain('plein');
    // Plafond total : guppys et corydoras au maximum, puis néons jusqu'à MAX_TOTAL_FISH.
    let crowded = setPopulation(worldOf(room0, 2), 'guppy', 1000);
    crowded = setPopulation(crowded, 'corydora', 1000);
    crowded = setPopulation(crowded, 'neon', 1000);
    expect(crowded.entities.length).toBe(MAX_TOTAL_FISH);
    expect(populationCounts(crowded).neon).toBeLessThan(40);
    expect(transferRefusal(withWorld(room0, 2, crowded), 0, 2, neon.id)).toBe('bac-plein');
  });

  it('refuse une eau hors de la plage tolérée de l’espèce', () => {
    const room0 = base();
    const w2 = worldOf(room0, 2);
    const hot = withWorld(room0, 2, { ...w2, water: { ...w2.water, temperature: 35 } });
    const neon = firstOf(worldOf(hot, 0), 'neon');
    const result = transferFish(hot, 0, 2, neon.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('temperature');
    const { min, max } = speciesSheet('neon').temperatureTolerated.value;
    expect(result.message).toContain(`${min} à ${max} °C`);
    expect(result.message).toContain('35 °C');
    // Bornes incluses.
    const edge = withWorld(room0, 2, { ...w2, water: { ...w2.water, temperature: max } });
    expect(transferRefusal(edge, 0, 2, neon.id)).toBeNull();
  });

  it('refuse un bac inconnu, le même bac et un animal absent', () => {
    const room = base();
    const neon = firstOf(worldOf(room, 0), 'neon');
    expect(transferRefusal(room, 0, 9, neon.id)).toBe('bac-inconnu');
    expect(transferRefusal(room, 9, 0, neon.id)).toBe('bac-inconnu');
    expect(transferRefusal(room, 0, 0, neon.id)).toBe('meme-bac');
    expect(transferRefusal(room, 0, 2, 999_999)).toBe('animal-inconnu');
    const result = transferFish(room, 0, 9, neon.id);
    expect(result.ok ? null : result.message).toBe('Bac introuvable');
  });

  it('le dernier animal d’un bac peut partir : le bac de départ devient vide', () => {
    const room0 = base();
    const w2 = setPopulation(worldOf(room0, 2), 'guppy', 0);
    const one = setPopulation(setPopulation(w2, 'corydora', 0), 'neon', 1);
    const room = withWorld(room0, 2, one);
    expect(worldOf(room, 2).entities.length).toBe(1);
    const result = transferFish(room, 2, 0, worldOf(room, 2).entities[0].id);
    if (!result.ok) throw new Error('refusé');
    expect(worldOf(result.room, 2).entities).toEqual([]);
  });

  it('messages : chaque refus a un texte', () => {
    for (const reason of [
      'bac-inconnu',
      'meme-bac',
      'animal-inconnu',
      'milieu',
      'temperature',
      'bac-plein',
    ] as const) {
      expect(transferMessage(reason, undefined, undefined).length).toBeGreaterThan(0);
    }
  });
});
