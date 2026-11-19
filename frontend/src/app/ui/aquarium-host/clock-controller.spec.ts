import { createDayClock, DEFAULT_DAY_LENGTH_SECONDS } from '../../sim/daylight';
import { HOUR_FROZEN_ATTRIBUTE, SPEED_ATTRIBUTE } from './aquarium-attributes';
import { AquariumProbe } from './aquarium-probe';
import { ClockController } from './clock-controller';

describe('ClockController (#696)', () => {
  let element: HTMLElement;
  let hasWorld: boolean;
  let capture: boolean;
  let time: number;
  let calls: string[];
  let clock: ClockController;

  beforeEach(() => {
    element = document.createElement('div');
    hasWorld = true;
    capture = false;
    time = 0;
    calls = [];
    clock = new ClockController({
      probe: new AquariumProbe(element),
      hasWorld: () => hasWorld,
      isCapture: () => capture,
      renderTime: () => time,
      relight: () => calls.push('éclairage'),
      scheduleFrame: () => calls.push('image'),
    });
    clock.dayClock = createDayClock(12, DEFAULT_DAY_LENGTH_SECONDS, false);
  });

  it('heure : celle de l’horloge au temps affiché ; `null` avant le démarrage', () => {
    expect(clock.hour()).toBeCloseTo(12);
    hasWorld = false;
    expect(clock.hour()).toBeNull();
  });

  it('bascule : figée sans saut d’heure, puis exposée', () => {
    time = DEFAULT_DAY_LENGTH_SECONDS / 4;
    const before = clock.hour();
    clock.toggle();
    expect(clock.dayClock.frozen).toBe(true);
    expect(clock.hour()).toBeCloseTo(before!);
    expect(clock.clockFrozen()).toBe(true);
    expect(element.getAttribute(HOUR_FROZEN_ATTRIBUTE)).toBe('true');
    expect(calls).toEqual(['éclairage', 'image']);
  });

  it('marche demandée alors qu’elle tourne : rien', () => {
    clock.setRunning(true);
    expect(calls).toEqual([]);
    clock.setRunning(false);
    expect(clock.dayClock.frozen).toBe(true);
  });

  it('heure fixée : figée à cette heure ; heure non finie ignorée', () => {
    clock.freezeAt(22);
    expect(clock.hour()).toBeCloseTo(22);
    clock.freezeAt(Number.NaN);
    expect(clock.hour()).toBeCloseTo(22);
    expect(calls).toEqual(['éclairage', 'image']);
  });

  it('report : même heure au temps du nouveau monde', () => {
    time = 100;
    const before = clock.hour();
    // Nouveau monde affiché à son propre temps, puis l'heure reportée.
    time = 7;
    clock.carryFrom(100);
    expect(clock.hour()).toBeCloseTo(before!);
  });

  it('vitesse : posée et exposée ; refusée hors des vitesses proposées', () => {
    clock.setSpeed(2);
    expect(clock.speed()).toBe(2);
    expect(element.getAttribute(SPEED_ATTRIBUTE)).toBe('2');
    clock.setSpeed(3);
    expect(clock.speed()).toBe(2);
  });

  it('en capture ou avant le démarrage : horloge et vitesse inchangées', () => {
    capture = true;
    clock.toggle();
    clock.freezeAt(6);
    clock.setSpeed(4);
    hasWorld = false;
    capture = false;
    clock.toggle();
    clock.setSpeed(4);
    expect(clock.dayClock.frozen).toBe(false);
    expect(clock.speed()).toBe(1);
    expect(calls).toEqual([]);
  });
});
