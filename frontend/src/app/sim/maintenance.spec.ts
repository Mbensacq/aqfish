import { describe, expect, it } from 'vitest';

import {
  initialMaintenance,
  MAINTENANCE_DAY_SECONDS as DAY,
  MAINTENANCE_LOG_SIZE,
  MAINTENANCE_PERIOD_DAYS,
  maintenanceDone,
  maintenanceItem,
  maintenanceReadout,
  maintenanceSummary,
  readMaintenance,
  sameMaintenanceReadout,
  type MaintenanceReadout,
} from './maintenance';

describe('calendrier d’entretien (#513)', () => {
  const state = initialMaintenance(0);

  it('annonce l’échéance puis le retard, sans cumuler les périodes', () => {
    const period = MAINTENANCE_PERIOD_DAYS.waterChange;
    expect(maintenanceItem(state, 'waterChange', 0)).toMatchObject({
      overdue: false,
      days: period,
      text: `Dans ${period} j`,
    });
    expect(maintenanceItem(state, 'waterChange', period * DAY - 1).overdue).toBe(false);
    expect(maintenanceItem(state, 'waterChange', period * DAY)).toMatchObject({
      overdue: true,
      days: 0,
      text: 'À faire',
    });
    expect(maintenanceItem(state, 'waterChange', (period + 2.5) * DAY).text).toBe(
      'En retard de 2 j',
    );
  });

  it('remet la tâche faite à zéro sans toucher aux autres', () => {
    const late = MAINTENANCE_PERIOD_DAYS.filter * DAY;
    const next = maintenanceDone(state, 'waterChange', late);
    expect(maintenanceItem(next, 'waterChange', late).overdue).toBe(false);
    expect(maintenanceItem(next, 'filter', late).overdue).toBe(true);
    expect(state.log).toEqual([]);
  });

  it('ne dépend que du temps simulé, quel que soit le pas (temps accéléré)', () => {
    const time = 9.25 * DAY;
    let steps = 0;
    for (let t = 0; t < time; t += DAY / 4) {
      steps += 1;
    }
    expect(steps).toBe(37);
    expect(maintenanceReadout(state, (steps * DAY) / 4)).toEqual(maintenanceReadout(state, time));
  });

  it('ignore les valeurs non finies', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(maintenanceDone(state, 'filter', bad)).toBe(state);
      expect(maintenanceItem(state, 'filter', bad).overdue).toBe(false);
      expect(initialMaintenance(bad).lastDone.filter).toBe(0);
    }
    expect(maintenanceDone(state, 'filter', -1)).toBe(state);
    // Horloge antérieure à la dernière action (sauvegarde retouchée) : pas de retard.
    expect(maintenanceItem(initialMaintenance(DAY), 'filter', 0).overdue).toBe(false);
  });

  it('garde les dix dernières actions, la plus récente d’abord', () => {
    let next = state;
    for (let i = 0; i < MAINTENANCE_LOG_SIZE + 3; i++) {
      next = maintenanceDone(next, 'waterTest', i * DAY);
    }
    const { log } = maintenanceReadout(next, 20 * DAY);
    expect(log).toHaveLength(MAINTENANCE_LOG_SIZE);
    expect(log[0]).toEqual({ task: 'waterTest', label: 'Test de l’eau', day: 13 });
    expect(log.at(-1)?.day).toBe(4);
  });

  it('résume les tâches échues et limite le relevé aux tâches du bac', () => {
    expect(maintenanceSummary(maintenanceReadout(state, 0))).toBe('à jour');
    const week = MAINTENANCE_PERIOD_DAYS.waterTest * DAY;
    const one = maintenanceReadout(state, week, ['waterChange']);
    expect(one.items).toHaveLength(1);
    expect(maintenanceSummary(one)).toBe('changement d’eau');
    expect(maintenanceSummary(maintenanceReadout(state, week))).toBe('2 tâches à faire');
  });

  it('compare les relevés par contenu', () => {
    expect(sameMaintenanceReadout(null, null)).toBe(true);
    expect(sameMaintenanceReadout(null, maintenanceReadout(state, 0))).toBe(false);
    expect(sameMaintenanceReadout(maintenanceReadout(state, 0), maintenanceReadout(state, 0))).toBe(
      true,
    );
    expect(
      sameMaintenanceReadout(maintenanceReadout(state, 0), maintenanceReadout(state, DAY)),
    ).toBe(false);
  });

  it('compare chaque champ du relevé (#520)', () => {
    const base = maintenanceReadout(state, 0);
    const item = base.items[0]!;
    const line = { task: item.task, label: item.label, day: 1 };
    const withLog = { ...base, log: [line] };
    const changes: MaintenanceReadout[] = [
      { ...base, items: [{ ...item, label: 'x' }, ...base.items.slice(1)] },
      { ...base, items: [{ ...item, overdue: !item.overdue }, ...base.items.slice(1)] },
      { ...base, items: [{ ...item, days: item.days + 1 }, ...base.items.slice(1)] },
      { ...base, items: [{ ...item, text: 'x' }, ...base.items.slice(1)] },
      { ...base, items: base.items.slice(1) },
      { ...base, due: [item.task] },
    ];
    for (const change of changes) {
      expect(sameMaintenanceReadout(base, change)).toBe(false);
    }
    expect(sameMaintenanceReadout(withLog, { ...base, log: [{ ...line, day: 2 }] })).toBe(false);
    expect(sameMaintenanceReadout(withLog, { ...base, log: [{ ...line, label: 'x' }] })).toBe(
      false,
    );
    expect(sameMaintenanceReadout(withLog, { ...base, log: [{ ...line }] })).toBe(true);
  });

  it('compare aussi la tâche des éléments et du journal, et la liste des tâches dues (#520)', () => {
    const base = maintenanceReadout(state, 0);
    const [first, second] = base.items;
    const line = { task: first!.task, label: first!.label, day: 1 };
    const withLog = { ...base, log: [line] };
    expect(sameMaintenanceReadout(base, null)).toBe(false);
    expect(
      sameMaintenanceReadout(base, {
        ...base,
        items: [{ ...first!, task: second!.task }, ...base.items.slice(1)],
      }),
    ).toBe(false);
    expect(
      sameMaintenanceReadout(withLog, { ...base, log: [{ ...line, task: second!.task }] }),
    ).toBe(false);
    const dueA = { ...base, due: [first!.task] };
    expect(sameMaintenanceReadout(dueA, { ...base, due: [second!.task] })).toBe(false);
    expect(sameMaintenanceReadout(dueA, { ...base, due: [first!.task] })).toBe(true);
  });

  it('relit un calendrier valide et refuse le reste', () => {
    const saved = JSON.parse(JSON.stringify(maintenanceDone(state, 'prune', 5)));
    expect(readMaintenance(saved, [])).toEqual(saved);
    const bad: unknown[] = [
      null,
      [],
      'x',
      {},
      { lastDone: null, log: [] },
      { lastDone: { ...saved.lastDone, filter: -1 }, log: [] },
      { lastDone: { ...saved.lastDone, filter: null }, log: [] },
      { lastDone: saved.lastDone, log: {} },
      { lastDone: saved.lastDone, log: [null] },
      { lastDone: saved.lastDone, log: [{ task: 'autre', time: 1 }] },
      { lastDone: saved.lastDone, log: [{ task: 'prune', time: 'a' }] },
      {
        lastDone: saved.lastDone,
        log: Array.from({ length: MAINTENANCE_LOG_SIZE + 1 }, () => ({ task: 'prune', time: 1 })),
      },
    ];
    for (const value of bad) {
      const problems: string[] = [];
      expect(readMaintenance(value, problems)).toBeNull();
      expect(problems).toHaveLength(1);
    }
  });
});
