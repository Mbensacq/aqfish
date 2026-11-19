import { DEFAULT_DAY_CLOCK } from '../../sim/daylight';
import type { EnvironmentId } from '../../sim/environment';
import { createWorld } from '../../sim/world';
import type { MutableWorld } from '../../sim/world-types';
import { TankRecordsController } from './tank-records-controller';
import { TankRoomController, type TankRoomPorts } from './tank-room-controller';

describe('TankRoomController (#696)', () => {
  let shown: MutableWorld | null;
  let capture: boolean;
  let calls: string[];
  let tanks: TankRoomController;
  const world = (place: EnvironmentId = 'tropical'): MutableWorld =>
    createWorld(42, [], [], [], place) as MutableWorld;

  beforeEach(() => {
    shown = world();
    capture = false;
    calls = [];
    const ports: TankRoomPorts = {
      world: () => shown,
      hasView: () => true,
      isCapture: () => capture,
      dayClock: () => DEFAULT_DAY_CLOCK,
      records: new TankRecordsController({ isCapture: () => capture }),
      layout: {
        refresh: () => calls.push('catalogue'),
        floor: () => ({ area: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }, obstacles: [] }),
        commit: (room) => tanks.setRoomState(room),
      },
      publishSelectedTank: (id) => calls.push(`sélection:${id}`),
      finishDrop: () => calls.push('chute'),
      showEnvironment: (id) => calls.push(`environnement:${id}`),
      refreshPopulation: () => calls.push('population'),
      refreshWater: () => calls.push('eau'),
      saveNow: () => calls.push('sauvegarde'),
      scheduleFrame: () => calls.push('image'),
    };
    tanks = new TankRoomController(ports);
  });

  it('avant toute sauvegarde : aucune pièce ; resynchronisée, un bac sélectionné et publié', () => {
    expect(tanks.roomState).toBeNull();
    const room = tanks.sync(shown!);
    expect(room.tanks.map((tank) => tank.world)).toEqual([shown]);
    expect(tanks.roomState).toBe(room);
    expect(tanks.selectedTankId).toBe(0);
    expect(calls).toEqual(['catalogue', 'sélection:0']);
    expect(tanks.tankList().map((entry) => [entry.id, entry.selected])).toEqual([[0, true]]);
  });

  it('rattrapage : les bacs rangés avancent d’autant de pas que le bac affiché', () => {
    const pond = world('bassin');
    tanks.stashOthers([pond], 'tropical');
    tanks.advanceBackground();
    expect(tanks.stash.get('bassin')).toBe(pond);
    shown!.tick += 10;
    tanks.advanceBackground();
    expect(tanks.stash.get('bassin')?.tick).toBe(10);
    expect(tanks.roomState?.tick).toBe(10);
    expect(pond.tick).toBe(0);
  });

  it('rattrapage en capture : rien n’avance', () => {
    capture = true;
    tanks.stashOthers([world('bassin')], 'tropical');
    tanks.advanceBackground();
    shown!.tick += 10;
    tanks.advanceBackground();
    expect(tanks.stash.get('bassin')?.tick).toBe(0);
    expect(tanks.roomState).toBeNull();
  });

  it('mondes rangés : remplacés, oubliés sans toucher l’ancienne table', () => {
    const pond = world('bassin');
    tanks.setStash(new Map([['bassin', pond]]));
    const before = tanks.stash;
    tanks.forgetStashed('bassin');
    expect(tanks.stash.size).toBe(0);
    expect(before.get('bassin')).toBe(pond);
  });

  it('renommage : refusé avec un message, accepté et enregistré', () => {
    tanks.rename(0, '   ');
    expect(tanks.notice()).toEqual({ kind: 'erreur', text: 'Nom refusé : de 1 à 40 caractères' });
    expect(calls).not.toContain('sauvegarde');
    tanks.rename(0, ' Bac  du salon ');
    expect(tanks.notice()).toBeNull();
    expect(tanks.tankList()[0]?.name).toBe('Bac du salon');
    expect(calls.at(-1)).toBe('sauvegarde');
  });

  it('sélection d’un bac rangé : suivis gardés, environnement affiché ; bac affiché ou inconnu : rien', () => {
    tanks.stashOthers([world('bassin')], 'tropical');
    const room = tanks.sync(shown!);
    const pond = room.tanks.find((tank) => tank.world.environment === 'bassin')!;
    calls = [];
    tanks.select(0);
    tanks.select(99);
    expect(calls.filter((call) => call.startsWith('environnement'))).toEqual([]);
    tanks.select(pond.id);
    expect(calls.at(-1)).toBe('environnement:bassin');
  });

  it('restauration : pièce et bac sélectionné repris tels quels', () => {
    const room = tanks.sync(shown!);
    tanks.restore(room, 3);
    expect(tanks.roomState).toBe(room);
    expect(tanks.selectedTankId).toBe(3);
    tanks.setRoomState(null);
    expect(tanks.roomState).toBeNull();
  });

  it('sans monde ou en capture : aucun geste ni liste', () => {
    shown = null;
    tanks.rename(0, 'Bac');
    tanks.transferAnimal('neon', 1);
    tanks.installQuarantine();
    tanks.refreshList();
    shown = world();
    capture = true;
    tanks.returnAnimal(1, 'neon');
    tanks.treatPlacedTank(1, 'medicament');
    tanks.doseStarterInPlacedTank(1);
    tanks.select(1);
    expect(calls).toEqual([]);
    expect(tanks.notice()).toBeNull();
    expect(tanks.tankList()).toEqual([]);
  });

  it('transfert d’une espèce absente : refus lisible', () => {
    tanks.transferAnimal('neon', 1);
    expect(tanks.notice()).toEqual({ kind: 'erreur', text: 'Aucun animal de cette espèce ici' });
  });
});
