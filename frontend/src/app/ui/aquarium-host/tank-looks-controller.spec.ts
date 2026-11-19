import type { AquariumView } from '../../render/aquarium-view';
import { DEFAULT_LIGHTING_HOURS } from '../../sim/algae';
import { setCareModeInPlace } from '../../sim/care-mode';
import { createWorld, setWorldFeederInPlace, setWorldLightingInPlace } from '../../sim/world';
import type { MutableWorld } from '../../sim/world-types';
import {
  ALGAE_ATTRIBUTE,
  FEEDER_ATTRIBUTE,
  FOULING_ATTRIBUTE,
  PLANTS_ATTRIBUTE,
} from './aquarium-attributes';
import { AquariumProbe } from './aquarium-probe';
import { TankLooksController } from './tank-looks-controller';

/** Double de la vue : compte ce que l'aspect du bac lui demande. */
class FakeView {
  feederShown: boolean | null = null;
  algae = 0;
  fouling = 0;
  plantShade = -1;
  plants = 0;
  readonly foulingCounts = { glass: 0, floor: 0 };
  setFeeder(shown: boolean): void {
    this.feederShown = shown;
  }
  setAlgae(): void {
    this.algae++;
  }
  setFouling(): void {
    this.fouling++;
  }
  setPlantGrowth(): void {
    this.plants++;
  }
  setPlantShade(shade: number): void {
    this.plantShade = shade;
  }
}

describe('TankLooksController (#696)', () => {
  let element: HTMLElement;
  let view: FakeView | null;
  let capture: boolean;
  let captureFouling: number;
  let world: MutableWorld;
  let looks: TankLooksController;

  beforeEach(() => {
    element = document.createElement('div');
    view = new FakeView();
    capture = false;
    captureFouling = 0;
    world = createWorld(5, [{ species: 'neon', count: 2 }], [], [], 'tropical') as MutableWorld;
    looks = new TankLooksController({
      probe: new AquariumProbe(element),
      view: () => view as unknown as AquariumView | null,
      isCapture: () => capture,
      captureFouling: () => captureFouling,
      maintenanceStartOf: () => 0,
    });
  });

  it('relève algues, éclairage, distributeur, plantes et voile du bac', () => {
    expect(looks.lighting()).toBe(DEFAULT_LIGHTING_HOURS);
    setWorldLightingInPlace(world, 10);
    looks.refresh(world);
    expect(looks.lighting()).toBe(10);
    expect(element.getAttribute(ALGAE_ATTRIBUTE)).toBe(`${looks.visibleAlgae()};0;10`);
    expect(element.getAttribute(FEEDER_ATTRIBUTE)).toBe('aucun');
    expect(looks.feeder()).toBeNull();
    expect(element.getAttribute(PLANTS_ATTRIBUTE)).not.toBeNull();
    expect(element.getAttribute(FOULING_ATTRIBUTE)).not.toBeNull();
    expect(view!.algae).toBe(1);
    expect(view!.fouling).toBe(1);
    expect(view!.feederShown).toBe(false);
  });

  it('le distributeur posé apparaît dans la vue et le signal', () => {
    expect(setWorldFeederInPlace(world, [8, 20])).toBe(true);
    looks.refresh(world);
    expect(view!.feederShown).toBe(true);
    expect(looks.feeder()).not.toBeNull();
    expect(element.getAttribute(FEEDER_ATTRIBUTE)).toContain('8,20');
  });

  it('en capture, le voile est celui de `encrassement=`, et aucun en mode décor', () => {
    capture = true;
    captureFouling = 1;
    looks.refresh(world);
    const sampled = element.getAttribute(FOULING_ATTRIBUTE);
    expect(sampled).not.toBe('0;0');
    setCareModeInPlace(world, 'decor');
    looks.refresh(world);
    expect(element.getAttribute(FOULING_ATTRIBUTE)).toBe('0;0');
  });

  it('sans vue, relève encore signaux et attributs', () => {
    view = null;
    looks.refresh(world);
    expect(element.getAttribute(ALGAE_ATTRIBUTE)).not.toBeNull();
    expect(element.getAttribute(FOULING_ATTRIBUTE)).not.toBeNull();
  });
});
