import { careModeOf } from '../../sim/care-mode';
import { populationCounts } from '../../sim/population';
import { syncRoom, type RoomState } from '../../sim/room-state';
import { createWorld } from '../../sim/world';
import type { MutableWorld, World } from '../../sim/world-types';
import { FOOD_ATTRIBUTE } from './aquarium-attributes';
import { AquariumProbe } from './aquarium-probe';
import { PopulationController } from './population-controller';

describe('PopulationController (#696)', () => {
  let world: MutableWorld | null;
  let capture: boolean;
  let room: RoomState | null;
  let calls: string[];
  let element: HTMLElement;
  let animals: PopulationController;

  beforeEach(() => {
    world = createWorld(5, [{ species: 'neon', count: 2 }], [], [], 'tropical') as MutableWorld;
    capture = false;
    room = null;
    calls = [];
    element = document.createElement('div');
    animals = new PopulationController({
      probe: new AquariumProbe(element),
      world: () => world,
      isCapture: () => capture,
      tanks: () => ({
        sync: (shown: World) => {
          room = syncRoom(room, shown, []).room;
          return room;
        },
        get selectedTankId() {
          return room?.tanks[0]?.id ?? 0;
        },
      }),
      records: () => ({ refreshFirstTankPath: () => calls.push('parcours') }),
      refreshPopulation: () => calls.push('effectifs'),
      refreshWater: () => calls.push('eau'),
      saveNow: () => calls.push('sauvegarde'),
      scheduleFrame: () => calls.push('image'),
    });
  });

  it('règle un effectif, puis relève les effectifs et demande une image', () => {
    animals.setPopulation('neon', 5);
    expect(populationCounts(world!).neon).toBe(5);
    expect(calls).toEqual(['effectifs', 'image']);
    animals.setPopulation('neon', 0);
    expect(populationCounts(world!).neon).toBe(0);
  });

  it('refuse un effectif invalide, une espèce inconnue ou absente, la capture et l’avant-démarrage', () => {
    for (const count of [-1, 1.5, Number.NaN]) {
      animals.setPopulation('neon', count);
    }
    animals.setPopulation('inconnue' as never, 3);
    animals.setPopulation('koi', 3);
    capture = true;
    animals.setPopulation('neon', 4);
    capture = false;
    world = null;
    animals.setPopulation('neon', 4);
    expect(calls).toEqual([]);
  });

  it('ramène un ajout à la place restante sous le plafond de la pièce (#392)', () => {
    animals.setPopulation('neon', 10_000);
    const count = populationCounts(world!).neon;
    expect(count).toBeGreaterThan(2);
    expect(count).toBeLessThan(10_000);
  });

  it('nourrit au point visé : nourriture exposée, parcours relevé, nouvelle image', () => {
    animals.feed(0, 0);
    expect(world!.food.length).toBeGreaterThan(0);
    expect(element.getAttribute(FOOD_ATTRIBUTE)).toBe(String(world!.food.length));
    expect(calls).toEqual(['parcours', 'image']);
  });

  it('ne nourrit pas hors des réels finis, en capture ou avant le démarrage', () => {
    animals.feed(Number.NaN, 0);
    animals.feed(0, Number.POSITIVE_INFINITY);
    capture = true;
    animals.feed(0, 0);
    capture = false;
    world = null;
    animals.feed(0, 0);
    expect(calls).toEqual([]);
  });

  it('passe en mode décor puis revient en soins, avec relevés, sauvegarde et image', () => {
    animals.setCareMode('decor');
    expect(careModeOf(world!)).toBe('decor');
    expect(calls).toEqual(['effectifs', 'eau', 'sauvegarde', 'image']);
    calls = [];
    animals.setCareMode('decor');
    animals.setCareMode('inconnu' as never);
    expect(calls).toEqual([]);
  });

  it('« Tout retirer » : seulement depuis le mode décor, retire les espèces listées', () => {
    animals.returnToCare(['neon']);
    expect(calls).toEqual([]);
    animals.setCareMode('decor');
    calls = [];
    animals.returnToCare(['neon']);
    expect(careModeOf(world!)).toBe('soins');
    expect(populationCounts(world!).neon).toBe(0);
    expect(calls).toEqual(['effectifs', 'eau', 'sauvegarde', 'image']);
  });

  it('ne change pas de mode en capture', () => {
    capture = true;
    animals.setCareMode('decor');
    expect(careModeOf(world!)).toBe('soins');
    expect(calls).toEqual([]);
  });
});
