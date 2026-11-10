import { setCareModeInPlace } from './care-mode';
import { ICH_AGGRAVATED_AT, ICH_VISIBLE_AT, ichStress, stepIchInPlace } from './disease';
import { setPopulation } from './population';
import {
  EMPTY_QUARANTINE,
  QUARANTINE_DURATION_TEXT,
  QUARANTINE_TANK_SIZE,
  quarantineEnvironment,
  quarantineTanks,
  quarantineView,
  sameQuarantine,
  sickCount,
  treatTank,
} from './quarantine';
import { addTank, createRoom, findTank, type RoomState, type RoomTank } from './room-state';
import { serializeWorld } from './save';
import { transferFish } from './tank-transfer';
import { advance, cloneWorld, type Entity, type World } from './world';

function worldOf(room: RoomState, id: number): World {
  return (findTank(room, id) as { world: World }).world;
}

function withWorld(room: RoomState, id: number, world: World): RoomState {
  return { ...room, tanks: room.tanks.map((t) => (t.id === id ? { ...t, world } : t)) };
}

/** Les `n` premiers néons du bac `id` reçoivent les points blancs à l'âge `age`. */
function infectNeons(room: RoomState, id: number, n: number, age: number): RoomState {
  const world = cloneWorld(worldOf(room, id));
  let left = n;
  world.entities = world.entities.map((e): Entity => {
    if (left > 0 && e.species === 'neon') {
      left -= 1;
      return { ...e, ich: age };
    }
    return e;
  });
  return withWorld(room, id, world);
}

/**
 * Pièce de test : bac 0 tropical peuplé (bac principal), bac 1 petit bac tropical posé au sol,
 * vide (la quarantaine).
 */
function roomWithQuarantine(): RoomState {
  const room = createRoom(42, ['tropical']);
  const added = addTank(room, {
    environment: 'tropical',
    size: QUARANTINE_TANK_SIZE,
    placement: { supportId: null, x: 2.5, z: 2, quarter: 0 },
    name: 'Quarantaine',
  });
  if (!added.ok) {
    throw new Error(`pose refusée : ${added.reason}`);
  }
  return added.room;
}

/** Néons malades du bac `id`, dans l'ordre. */
function sickNeons(room: RoomState, id: number): Entity[] {
  return worldOf(room, id).entities.filter((e) => e.species === 'neon' && e.ich !== undefined);
}

/** Contagion seule du bac `world` sur `dt` secondes : nouveaux infectés (copie, aucun effet). */
function newInfections(world: World, dt: number): number {
  const animals = world.entities.map((e) => ({ id: e.id, species: e.species, ich: e.ich }));
  const before = animals.filter((a) => a.ich !== undefined).length;
  stepIchInPlace(
    animals,
    dt,
    ichStress(world.water, world.environment),
    world.environment,
    world.seed,
    world.tick,
  );
  return animals.filter((a) => a.ich !== undefined).length - before;
}

describe('quarantaine : isolement des traitements (#547)', () => {
  it('un traitement dans le bac B ne modifie ni l’eau ni les animaux du bac A', () => {
    let room = roomWithQuarantine();
    room = infectNeons(room, 0, 1, ICH_VISIBLE_AT);
    const sick = sickNeons(room, 0)[0];
    const moved = transferFish(room, 0, 1, sick.id);
    if (!moved.ok) throw new Error(moved.message);
    room = moved.room;
    const mainText = serializeWorld(worldOf(room, 0));
    const mainWorld = worldOf(room, 0);

    for (const kind of ['medicament', 'sel', 'chaleur'] as const) {
      const result = treatTank(room, 1, kind);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      room = result.room;
    }
    // Bac principal : même objet, même texte de sauvegarde ; eau sans produit.
    expect(worldOf(room, 0)).toBe(mainWorld);
    expect(serializeWorld(worldOf(room, 0))).toBe(mainText);
    expect(worldOf(room, 0).water.medication).toBeUndefined();
    expect(worldOf(room, 0).water.salt).toBeUndefined();
    // Quarantaine : médicament et sel dans l'eau.
    expect(worldOf(room, 1).water.medication ?? 0).toBeGreaterThan(0);
    expect(worldOf(room, 1).water.salt ?? 0).toBeGreaterThan(0);
  });

  it('le bac traité avance seul : le bac principal évolue comme sans quarantaine traitée', () => {
    let room = roomWithQuarantine();
    room = infectNeons(room, 0, 1, ICH_VISIBLE_AT);
    const moved = transferFish(room, 0, 1, sickNeons(room, 0)[0].id);
    if (!moved.ok) throw new Error(moved.message);
    const untreated = moved.room;
    const treated = treatTank(untreated, 1, 'medicament');
    if (!treated.ok) throw new Error(treated.message);
    const a = advance(worldOf(untreated, 0), 120);
    const b = advance(worldOf(treated.room, 0), 120);
    expect(serializeWorld(b)).toBe(serializeWorld(a));
  });

  it('pure : la pièce d’origine n’est pas modifiée', () => {
    let room = infectNeons(roomWithQuarantine(), 1, 0, 0);
    room = infectNeons(room, 0, 2, ICH_VISIBLE_AT);
    const texts = room.tanks.map((t) => serializeWorld(t.world));
    const result = treatTank(room, 0, 'medicament');
    expect(result.ok).toBe(true);
    expect(room.tanks.map((t) => serializeWorld(t.world))).toEqual(texts);
  });

  it('refus sans changement : bac inconnu, aucun malade, mode décor, traitement inconnu', () => {
    const room = roomWithQuarantine();
    const unknown = treatTank(room, 99, 'sel');
    expect(unknown).toEqual({ ok: false, room, message: 'Bac introuvable' });
    // La quarantaine est vide : aucun malade à soigner.
    const empty = treatTank(room, 1, 'medicament');
    expect(empty.ok).toBe(false);
    expect(empty.room).toBe(room);
    const decor = cloneWorld(worldOf(room, 1));
    setCareModeInPlace(decor, 'decor');
    const inDecor = treatTank(withWorld(room, 1, decor), 1, 'sel');
    expect(inDecor.ok).toBe(false);
    if (!inDecor.ok) expect(inDecor.message).toContain('mode décor');
    const bogus = treatTank(room, 1, 'vinaigre' as never);
    expect(bogus.ok).toBe(false);
  });
});

describe('quarantaine : la maladie suit l’animal (#547)', () => {
  it('un animal transféré malade garde sa maladie et son avancement', () => {
    let room = roomWithQuarantine();
    const world = cloneWorld(worldOf(room, 0));
    const neon = world.entities.find((e) => e.species === 'neon') as Entity;
    world.entities = world.entities.map((e) =>
      e.id === neon.id ? { ...e, ich: 400, velvet: 250, finRot: 300, health: 0.6 } : e,
    );
    room = withWorld(room, 0, world);
    const moved = transferFish(room, 0, 1, neon.id);
    if (!moved.ok) throw new Error(moved.message);
    const arrived = worldOf(moved.room, 1).entities.find((e) => e.id === moved.id) as Entity;
    expect(arrived.ich).toBe(400);
    expect(arrived.velvet).toBe(250);
    expect(arrived.finRot).toBe(300);
    expect(arrived.health).toBe(0.6);
    expect(sickCount(findTank(moved.room, 1) as never)).toBe(1);
    expect(sickCount(findTank(moved.room, 0) as never)).toBe(0);
  });

  it('un animal sain arrive sain : aucun champ de maladie ajouté', () => {
    const room = roomWithQuarantine();
    const neon = worldOf(room, 0).entities.find((e) => e.species === 'neon') as Entity;
    const moved = transferFish(room, 0, 1, neon.id);
    if (!moved.ok) throw new Error(moved.message);
    const arrived = worldOf(moved.room, 1).entities.find((e) => e.id === moved.id) as Entity;
    expect('ich' in arrived).toBe(false);
    expect('velvet' in arrived).toBe(false);
    expect('finRot' in arrived).toBe(false);
  });

  it('la contagion du bac d’origine cesse après le départ des malades', () => {
    let room = roomWithQuarantine();
    room = infectNeons(room, 0, 3, ICH_AGGRAVATED_AT);
    // Avant : trois contagieux, sur 10 minutes, d'autres poissons sont infectés.
    expect(ichStress(worldOf(room, 0).water, 'tropical')).toBe(0);
    expect(newInfections(worldOf(room, 0), 600)).toBeGreaterThan(0);
    for (const sick of sickNeons(room, 0)) {
      const moved = transferFish(room, 0, 1, sick.id);
      if (!moved.ok) throw new Error(moved.message);
      room = moved.room;
    }
    expect(sickNeons(room, 0)).toEqual([]);
    // Après : plus aucun contagieux, aucune nouvelle infection, même sur une heure.
    expect(newInfections(worldOf(room, 0), 3600)).toBe(0);
    // Le bac principal, avancé pas à pas, reste sain ; les malades le restent en quarantaine.
    const main = advance(worldOf(room, 0), 600);
    expect(main.entities.some((e) => e.ich !== undefined)).toBe(false);
    const quarantine = advance(worldOf(room, 1), 600);
    expect(quarantine.entities.filter((e) => e.ich !== undefined)).toHaveLength(3);
  });

  it('retour : l’animal soigné revient au bac principal par le même transfert', () => {
    let room = roomWithQuarantine();
    room = infectNeons(room, 0, 1, ICH_VISIBLE_AT);
    const out = transferFish(room, 0, 1, sickNeons(room, 0)[0].id);
    if (!out.ok) throw new Error(out.message);
    const back = transferFish(out.room, 1, 0, out.id);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(worldOf(back.room, 1).entities).toEqual([]);
    expect(sickNeons(back.room, 0)).toHaveLength(1);
  });

  it('graines différentes : l’isolement ne dépend pas de la graine', () => {
    for (const seed of [1, 7, 123456]) {
      let room = createRoom(seed, ['tropical']);
      const added = addTank(room, {
        environment: 'tropical',
        size: 'petit',
        placement: { supportId: null, x: -2.5, z: 2, quarter: 0 },
      });
      if (!added.ok) throw new Error(added.reason);
      room = infectNeons(added.room, 0, 1, ICH_VISIBLE_AT);
      const out = transferFish(room, 0, 1, sickNeons(room, 0)[0].id);
      if (!out.ok) throw new Error(out.message);
      const main = worldOf(out.room, 0);
      const treated = treatTank(out.room, 1, 'medicament');
      expect(treated.ok).toBe(true);
      if (treated.ok) expect(worldOf(treated.room, 0)).toBe(main);
    }
  });
});

describe('quarantaine : bacs et textes (#547)', () => {
  it('environnement : celui du bac de la pièce, aucun au jardin', () => {
    expect(quarantineEnvironment('tropical')).toBe('tropical');
    expect(quarantineEnvironment('eaufroide')).toBe('eaufroide');
    expect(quarantineEnvironment('recif')).toBe('recif');
    expect(quarantineEnvironment('bassin')).toBeNull();
  });

  it('bacs de quarantaine possibles : les bacs posés, hors bac sélectionné', () => {
    const room = roomWithQuarantine();
    expect(quarantineTanks(room, 0).map((t) => t.id)).toEqual([1]);
    expect(quarantineTanks(createRoom(3, ['tropical', 'recif']), 0)).toEqual([]);
  });

  it('la durée affichée est sourcée et marquée approximation de jeu', () => {
    expect(QUARANTINE_DURATION_TEXT).toContain('UC Davis');
    expect(QUARANTINE_DURATION_TEXT).toContain('approximation de jeu');
  });

  it('bac vide : aucun malade', () => {
    const room = setPopulation(worldOf(roomWithQuarantine(), 0), 'neon', 0);
    expect(sickCount({ world: room })).toBe(0);
  });
});

describe('quarantaine : vue de la liste des bacs (#547)', () => {
  it('liste les bacs posés, leurs espèces et leurs malades', () => {
    let room = roomWithQuarantine();
    room = infectNeons(room, 0, 2, ICH_VISIBLE_AT);
    const moved = transferFish(room, 0, 1, sickNeons(room, 0)[0].id);
    if (!moved.ok) throw new Error(moved.message);
    const main = findTank(moved.room, 0) as RoomTank;
    const view = quarantineView(moved.room, 0, main);
    expect(view).toEqual({
      tanks: [{ id: 1, name: 'Quarantaine', species: ['neon'], sick: 1 }],
      sickHere: 1,
    });
    expect(sameQuarantine(view, quarantineView(moved.room, 0, main))).toBe(true);
    expect(sameQuarantine(view, { ...view, tanks: [{ ...view.tanks[0], sick: 0 }] })).toBe(false);
    expect(sameQuarantine(view, EMPTY_QUARANTINE)).toBe(false);
    expect(sameQuarantine(view, { ...view, sickHere: 0 })).toBe(false);
    expect(sameQuarantine(view, { ...view, tanks: [{ ...view.tanks[0], species: [] }] })).toBe(
      false,
    );
    expect(
      sameQuarantine(view, { ...view, tanks: [{ ...view.tanks[0], species: ['guppy'] }] }),
    ).toBe(false);
    expect(sameQuarantine(view, { ...view, tanks: [{ ...view.tanks[0], name: 'X' }] })).toBe(false);
  });
});
