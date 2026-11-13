import { describe, expect, it } from 'vitest';

import {
  CARE_SESSION_STEPS,
  CARE_SESSION_TEXT,
  careSessionFinished,
  careSessionSummary,
  careStepTask,
  completeCareStep,
  glassStepHint,
  nextCareStep,
  readCareSession,
  serializeCareSession,
  skipCareStep,
  startCareSession,
} from './care-session';
import {
  initialMaintenance,
  MAINTENANCE_DAY_SECONDS as DAY,
  maintenanceDone,
  maintenanceReadout,
  readMaintenance,
} from './maintenance';

describe('séance d’entretien guidée (#604)', () => {
  it('suit les étapes dans l’ordre jusqu’au bilan', () => {
    expect(CARE_SESSION_STEPS).toEqual(['vitres', 'siphon', 'filtre', 'eau', 'taille', 'bilan']);
    let session = startCareSession();
    const seen = [session.step];
    while (!careSessionFinished(session)) {
      session = completeCareStep(session);
      seen.push(session.step);
    }
    expect(seen).toEqual(CARE_SESSION_STEPS);
    expect(Object.values(session.outcomes)).toEqual(['fait', 'fait', 'fait', 'fait', 'fait']);
  });

  it('chaque étape a un titre court et une phrase « pourquoi »', () => {
    for (const step of CARE_SESSION_STEPS) {
      const { title, why } = CARE_SESSION_TEXT[step];
      expect(title.length).toBeGreaterThan(0);
      expect(title.length).toBeLessThanOrEqual(20);
      expect(why).toMatch(/\.$/);
    }
  });

  it('une étape sautée est notée comme telle au bilan', () => {
    const session = completeCareStep(skipCareStep(startCareSession()));
    expect(session.step).toBe('filtre');
    expect(careSessionSummary(session).map((line) => [line.step, line.outcome])).toEqual([
      ['vitres', 'saute'],
      ['siphon', 'fait'],
      ['filtre', null],
      ['eau', null],
      ['taille', null],
    ]);
  });

  it('tout sauter mène au bilan sans rien marquer fait', () => {
    let session = startCareSession();
    for (let i = 0; i < 5; i++) {
      session = skipCareStep(session);
    }
    expect(careSessionFinished(session)).toBe(true);
    expect(careSessionSummary(session).every((line) => line.outcome === 'saute')).toBe(true);
  });

  it('au bilan, terminer ou sauter ne change plus rien', () => {
    let session = startCareSession();
    while (!careSessionFinished(session)) {
      session = skipCareStep(session);
    }
    expect(completeCareStep(session)).toBe(session);
    expect(skipCareStep(session)).toBe(session);
    expect(nextCareStep('bilan')).toBe('bilan');
  });

  it('séance interrompue : reprise à la même étape après sauvegarde', () => {
    const session = completeCareStep(skipCareStep(startCareSession()));
    const back = readCareSession(serializeCareSession(session));
    expect(back).toEqual(session);
    expect(back && completeCareStep(back).step).toBe('eau');
  });

  it('séance relue au bilan ou neuve : aller-retour exact', () => {
    const fresh = startCareSession();
    expect(readCareSession(serializeCareSession(fresh))).toEqual(fresh);
    let done = fresh;
    while (!careSessionFinished(done)) {
      done = completeCareStep(done);
    }
    expect(readCareSession(serializeCareSession(done))).toEqual(done);
  });

  it('refuse un texte absent, illisible ou incohérent sans lever', () => {
    for (const text of [
      null,
      '',
      'pas du json',
      'null',
      '[]',
      '{"step":"aquarium","outcomes":{}}',
      '{"step":"vitres"}',
      '{"step":"vitres","outcomes":[]}',
      '{"step":"siphon","outcomes":{"vitres":"peut-être"}}',
      '{"step":"siphon","outcomes":{"filtre":"fait"}}',
      '{"step":"bilan","outcomes":{"bilan":"fait"}}',
      '{"step":"siphon","outcomes":{"inconnue":"fait"}}',
    ]) {
      expect(readCareSession(text)).toBeNull();
    }
  });

  it('terminer les vitres enregistre leur nettoyage au calendrier', () => {
    expect(careStepTask('vitres')).toBe('glass');
    for (const step of ['siphon', 'filtre', 'eau', 'taille', 'bilan'] as const) {
      expect(careStepTask(step)).toBeNull();
    }
    const before = initialMaintenance(0);
    expect(maintenanceReadout(before, 3 * DAY).items.map((i) => i.task)).not.toContain('glass');
    const task = careStepTask('vitres');
    const after = task ? maintenanceDone(before, task, 3 * DAY) : before;
    expect(after.lastDone.glass).toBe(3 * DAY);
    expect(after.log[0]).toEqual({ task: 'glass', time: 3 * DAY });
    const readout = maintenanceReadout(after, 3 * DAY);
    expect(readout.items.at(-1)).toMatchObject({ task: 'glass', text: 'Dans 14 j' });
    expect(readout.log[0]).toMatchObject({ label: 'Nettoyage des vitres', day: 4 });
    // Les autres tâches gardent leur échéance.
    expect(after.lastDone.waterChange).toBe(0);
    // Le calendrier se relit avec ses vitres.
    const problems: string[] = [];
    expect(readMaintenance(JSON.parse(JSON.stringify(after)), problems)).toEqual(after);
    expect(problems).toEqual([]);
  });

  it('consigne des vitres : bac sans algues, une ou plusieurs taches', () => {
    expect(glassStepHint(0)).toBe('Les vitres sont propres : rien à racler.');
    expect(glassStepHint(Number.NaN)).toBe('Les vitres sont propres : rien à racler.');
    expect(glassStepHint(1)).toContain('la tache verte qui reste');
    expect(glassStepHint(8)).toContain('8 taches vertes');
  });
});
