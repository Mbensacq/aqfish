import { DecorClock } from './decor-clock';

describe('DecorClock (#409)', () => {
  it('vitesse 1 sans bascule : rend exactement le temps simulé', () => {
    const clock = new DecorClock();
    for (const time of [0, 0.1, 12, 37.3, 1e6, -4]) {
      expect(clock.at(time)).toBe(time);
    }
  });

  it('vitesse fixée dès le départ : temps simulé multiplié', () => {
    const clock = new DecorClock(0.4);
    expect(clock.at(10)).toBe(10 * 0.4);
    expect(clock.at(0)).toBe(0);
  });

  it('sans bascule : exactement `time · rate` en flottant, quelle que soit la vitesse (#455)', () => {
    for (const rate of [1, 0.4, 0.1, 1 / 3, 2.5]) {
      const clock = new DecorClock(rate);
      for (const time of [0, 0.1, 12, 37.3, 1e6, -4, 1 / 7]) {
        expect(clock.at(time)).toBe(time * rate);
      }
    }
  });

  it('bascule sans saut : même valeur à l’instant de la bascule, puis nouvelle vitesse', () => {
    const clock = new DecorClock();
    clock.setRate(0.5, 20);
    expect(clock.at(20)).toBe(20);
    expect(clock.at(24)).toBe(22);
    clock.setRate(1, 24);
    expect(clock.at(24)).toBe(22);
    expect(clock.at(30)).toBe(28);
    expect(clock.speed).toBe(1);
  });

  it('même vitesse : bascule sans effet (aucun décalage introduit)', () => {
    const clock = new DecorClock();
    clock.setRate(1, 50);
    expect(clock.at(7)).toBe(7);
  });

  it('bascule au temps zéro : équivalente à une vitesse initiale', () => {
    const clock = new DecorClock();
    clock.setRate(0.25, 0);
    expect(clock.at(8)).toBe(2);
  });

  it('temps qui recule (capture à une autre heure) : reste continu et monotone', () => {
    const clock = new DecorClock();
    clock.setRate(0.5, 10);
    expect(clock.at(6)).toBe(8);
    expect(clock.at(6)).toBeLessThan(clock.at(7));
  });
});
