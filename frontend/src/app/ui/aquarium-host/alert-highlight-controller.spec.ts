import type { AquariumView } from '../../render/aquarium-view';
import { populationCounts } from '../../sim/population';
import { createWorld } from '../../sim/world';
import type { MutableWorld, World } from '../../sim/world-types';
import { ALERT_HIGHLIGHT_MS, AlertHighlightController } from './alert-highlight-controller';
import type { AquariumProbe } from './aquarium-probe';

/** Double de la vue : retient la dernière mise en évidence. */
class FakeView {
  highlighted: readonly number[] = [];
  setAlertHighlight(ids: readonly number[]): void {
    this.highlighted = ids;
  }
}

/** Double de la sonde : retient les publications. */
class FakeProbe {
  readonly published: number[] = [];
  publishAlertHighlight(count: number): void {
    this.published.push(count);
  }
}

describe('AlertHighlightController (#696)', () => {
  let view: FakeView;
  let probe: FakeProbe;
  let world: MutableWorld | null;
  let capture: boolean;
  let alerts: AlertHighlightController;

  const tank = (seed: number): MutableWorld =>
    createWorld(seed, [{ species: 'neon', count: 3 }], [], [], 'tropical') as MutableWorld;

  beforeEach(() => {
    vi.useFakeTimers();
    view = new FakeView();
    probe = new FakeProbe();
    world = tank(11);
    capture = false;
    alerts = new AlertHighlightController({
      probe: probe as unknown as AquariumProbe,
      view: () => view as unknown as AquariumView,
      world: () => world,
      isCapture: () => capture,
    });
  });

  afterEach(() => vi.useRealTimers());

  it('met en évidence les animaux puis cesse après ALERT_HIGHLIGHT_MS', () => {
    alerts.highlight([1, 2]);
    expect(view.highlighted).toEqual([1, 2]);
    expect(alerts.highlightedAnimals()).toBe(2);
    vi.advanceTimersByTime(ALERT_HIGHLIGHT_MS - 1);
    expect(alerts.highlightedAnimals()).toBe(2);
    vi.advanceTimersByTime(1);
    expect(view.highlighted).toEqual([]);
    expect(alerts.highlightedAnimals()).toBe(0);
    expect(probe.published).toEqual([0, 2, 0]);
  });

  it('ne met rien en évidence sans monde, en capture ou sans animal', () => {
    alerts.highlight([]);
    capture = true;
    alerts.highlight([1]);
    capture = false;
    world = null;
    alerts.highlight([1]);
    expect(probe.published).toEqual([]);
    expect(alerts.highlightedAnimals()).toBe(0);
  });

  it('une nouvelle mise en évidence remplace la précédente et sa minuterie', () => {
    alerts.highlight([1]);
    vi.advanceTimersByTime(ALERT_HIGHLIGHT_MS / 2);
    alerts.highlight([2, 3]);
    vi.advanceTimersByTime(ALERT_HIGHLIGHT_MS / 2);
    expect(alerts.highlightedAnimals()).toBe(2);
    vi.advanceTimersByTime(ALERT_HIGHLIGHT_MS / 2);
    expect(alerts.highlightedAnimals()).toBe(0);
  });

  it('le relevé du même bac garde la mise en évidence ; un autre bac la fait cesser', () => {
    const shown = world as World;
    alerts.highlight([1]);
    alerts.refresh(shown, populationCounts(shown));
    expect(alerts.highlightedAnimals()).toBe(1);
    const other = tank(12);
    alerts.refresh(other, populationCounts(other));
    expect(alerts.highlightedAnimals()).toBe(0);
    expect(view.highlighted).toEqual([]);
  });

  it('relève les animaux désignés par les alertes du bac', () => {
    const shown = world as MutableWorld;
    alerts.refresh(shown, populationCounts(shown));
    const calm = alerts.alertAnimals();
    (shown.water as { temperature: number }).temperature = 40;
    alerts.refresh(shown, populationCounts(shown));
    expect(alerts.alertAnimals()).not.toEqual(calm);
  });
});
