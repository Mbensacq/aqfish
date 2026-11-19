import type { AquariumView } from '../../render/aquarium-view';
import { setCareModeInPlace } from '../../sim/care-mode';
import { deadBody } from '../../sim/mortality';
import { createWorld } from '../../sim/world';
import type { MutableWorld } from '../../sim/world-types';
import {
  CARE_MODE_ATTRIBUTE,
  CURRENT_ATTRIBUTE,
  ENVIRONMENT_ATTRIBUTE,
  POPULATION_ATTRIBUTE,
  TANK_ATTRIBUTE,
  WATER_ATTRIBUTE,
} from './aquarium-attributes';
import { AquariumProbe } from './aquarium-probe';
import { formatPopulation, TankReadoutsController } from './tank-readouts-controller';

/** Double de la vue : compte ce que les relevés lui demandent. */
class FakeView {
  turbidity = 0;
  currents = 0;
  setWaterTurbidity(): void {
    this.turbidity++;
  }
  setWaterTea(): void {}
  setCatappa(): void {}
  setWaterCurrent(): void {
    this.currents++;
  }
}

describe('TankReadoutsController (#696)', () => {
  let element: HTMLElement;
  let view: FakeView;
  let world: MutableWorld | null;
  let calls: string[];
  let careOpen: boolean;
  let readouts: TankReadoutsController;

  beforeEach(() => {
    element = document.createElement('div');
    view = new FakeView();
    world = createWorld(5, [{ species: 'neon', count: 3 }], [], [], 'tropical') as MutableWorld;
    calls = [];
    careOpen = false;
    readouts = new TankReadoutsController({
      probe: new AquariumProbe(element),
      world: () => world,
      view: () => view as unknown as AquariumView,
      roomState: () => null,
      refreshTankList: () => calls.push('liste'),
      care: {
        refreshReadouts: () => calls.push('séance'),
        isOpen: () => careOpen,
        close: () => calls.push('fermer'),
      },
      refreshAlerts: () => calls.push('alertes'),
      refreshRecords: () => calls.push('suivi'),
      refreshWaterCare: () => {
        calls.push('soins');
        return null;
      },
      refreshLooks: () => calls.push('aspect'),
      environmentChanged: (environment) => calls.push(`environnement:${environment}`),
    });
  });

  it('formatPopulation : espèces dans l’ordre donné', () => {
    expect(formatPopulation({ ...readouts.population(), neon: 2, koi: 1 }, ['koi', 'neon'])).toBe(
      'koi:1,neon:2',
    );
  });

  it('effectifs : signaux, attributs, mode et courant publiés', () => {
    readouts.refreshPopulation();
    expect(readouts.population().neon).toBe(3);
    expect(readouts.populationMax().neon).toBeGreaterThanOrEqual(3);
    expect(readouts.populationNotice()).toBeNull();
    expect(readouts.health().animals).toBe(3);
    expect(element.getAttribute(POPULATION_ATTRIBUTE)).toContain('neon:3');
    expect(element.getAttribute(CARE_MODE_ATTRIBUTE)).toBe('soins');
    expect(element.getAttribute(CURRENT_ATTRIBUTE)).toBe('coupe');
    expect(view.currents).toBe(1);
    expect(calls).toEqual(['alertes']);
  });

  it('mode décor : la séance ouverte est fermée', () => {
    setCareModeInPlace(world!, 'decor');
    careOpen = true;
    readouts.refreshPopulation();
    expect(readouts.careMode()).toBe('decor');
    expect(calls).toEqual(['alertes', 'fermer']);
  });

  it('relevé de l’eau : suivis relevés dans l’ordre, attribut et vue mis à jour', () => {
    readouts.refreshPopulation();
    calls = [];
    readouts.refreshWater();
    expect(calls).toEqual(['liste', 'séance', 'alertes', 'suivi', 'soins', 'aspect']);
    expect(element.getAttribute(WATER_ATTRIBUTE)).not.toBeNull();
    expect(readouts.waterSample().tick).toBe(world!.tick);
    expect(view.turbidity).toBe(1);
  });

  it('relevé de l’eau : un décès depuis le relevé précédent relève les effectifs', () => {
    readouts.refreshPopulation();
    world!.dead = [deadBody(world!.entities[0])];
    calls = [];
    readouts.refreshWater();
    expect(calls).toEqual(['liste', 'séance', 'alertes', 'alertes', 'suivi', 'soins', 'aspect']);
  });

  it('relevé dû : seulement après `ticks` pas depuis le dernier relevé', () => {
    expect(readouts.waterReadDue(world!, 30)).toBe(true);
    readouts.refreshWater();
    expect(readouts.waterReadDue(world!, 30)).toBe(false);
    world!.tick += 30;
    expect(readouts.waterReadDue(world!, 30)).toBe(true);
  });

  it('environnement : signal, attributs, dimensions et éditeur prévenu', () => {
    readouts.refreshEnvironment();
    expect(readouts.environment()).toBe('tropical');
    expect(element.getAttribute(ENVIRONMENT_ATTRIBUTE)).toBe('tropical');
    expect(element.getAttribute(TANK_ATTRIBUTE)).not.toBeNull();
    expect(readouts.tankDimensions()).not.toBeNull();
    expect(readouts.tankLiters()).toBeGreaterThan(0);
    expect(calls).toEqual(['environnement:tropical']);
  });

  it('sans monde : aucun relevé, aucun port appelé', () => {
    world = null;
    readouts.refreshPopulation();
    readouts.refreshWater();
    readouts.refreshEnvironment();
    readouts.refreshTankDimensions();
    expect(calls).toEqual([]);
    expect(element.getAttribute(POPULATION_ATTRIBUTE)).toBeNull();
    expect(readouts.tankLiters()).toBeNull();
  });
});
