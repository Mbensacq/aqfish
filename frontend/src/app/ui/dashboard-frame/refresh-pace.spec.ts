import { DASHBOARD_REFRESH_MS, refreshDue } from './refresh-pace';

/** Instants des relevés faits par une boucle à `fps` images par seconde pendant `seconds` s. */
function readings(fps: number, seconds: number, start = 0): number[] {
  const done: number[] = [];
  let last: number | null = null;
  for (let frame = 0; frame <= fps * seconds; frame++) {
    const now = start + (frame * 1000) / fps;
    if (refreshDue(now, last)) {
      last = now;
      done.push(now);
    }
  }
  return done;
}

describe('refreshDue (#256)', () => {
  it('au plus 4 relevés par seconde, à 30, 60, 144 et 240 images par seconde', () => {
    expect(DASHBOARD_REFRESH_MS).toBe(250);
    for (const fps of [30, 60, 144, 240]) {
      const times = readings(fps, 10, 12_345.6);
      // Toute fenêtre d'une seconde contient au plus 4 relevés…
      for (const t of times) {
        expect(times.filter((u) => u >= t && u < t + 1000).length).toBeLessThanOrEqual(4);
      }
      // … et le rythme ne tombe pas sous ~3 par seconde (l'affichage suit).
      expect(times.length).toBeGreaterThanOrEqual(30);
    }
  });

  it('premier relevé dû ; borne de l’intervalle comprise', () => {
    expect(refreshDue(0, null)).toBe(true);
    expect(refreshDue(1000, 750)).toBe(true);
    expect(refreshDue(999.9, 750)).toBe(false);
    expect(refreshDue(1000, 1000)).toBe(false);
    expect(refreshDue(100, 0, 100)).toBe(true);
  });

  it('horloge qui recule ou précédent invalide : dû ; instant non fini : jamais', () => {
    expect(refreshDue(10, 5000)).toBe(true);
    expect(refreshDue(10, Number.NaN)).toBe(true);
    expect(refreshDue(Number.NaN, 0)).toBe(false);
    expect(refreshDue(Number.POSITIVE_INFINITY, 0)).toBe(false);
    expect(refreshDue(Number.NEGATIVE_INFINITY, null)).toBe(false);
  });
});
