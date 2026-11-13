import type { MaintenanceTask } from './maintenance';

/**
 * Séance d'entretien guidée (issue #604, ADR 0138) : une suite d'étapes à faire à la main
 * (vitres, siphon, filtre, eau neuve, taille) puis un bilan. Chaque étape se termine ou se
 * saute ; une séance interrompue se reprend à l'étape où elle s'était arrêtée, y compris après
 * un rechargement (`readCareSession`). Fonctions pures, sans hasard ni horloge.
 *
 * Lot 1 : seule l'étape « vitres » a un geste (la raclette) ; les autres se sautent ou se
 * marquent faites en attendant leurs lots.
 */

/** Étape d'une séance, dans l'ordre. */
export type CareSessionStep = 'vitres' | 'siphon' | 'filtre' | 'eau' | 'taille' | 'bilan';

/** Étape où l'on agit (toutes sauf le bilan). */
export type CareSessionTaskStep = Exclude<CareSessionStep, 'bilan'>;

/** Étapes, dans l'ordre de la séance. */
export const CARE_SESSION_STEPS: readonly CareSessionStep[] = [
  'vitres',
  'siphon',
  'filtre',
  'eau',
  'taille',
  'bilan',
];

/** Titre court et phrase « pourquoi » de chaque étape. */
export const CARE_SESSION_TEXT: Readonly<
  Record<CareSessionStep, { readonly title: string; readonly why: string }>
> = {
  vitres: {
    title: 'Les vitres',
    why: 'Des vitres propres laissent passer la lumière et montrent mieux les poissons.',
  },
  siphon: {
    title: 'Le siphon',
    why: 'Aspirer les restes sur le sol évite qu’ils pourrissent et salissent l’eau.',
  },
  filtre: {
    title: 'Le filtre',
    why: 'Un filtre rincé dans l’eau du bac garde ses bonnes bactéries et filtre mieux.',
  },
  eau: {
    title: 'L’eau neuve',
    why: 'Remplacer un peu d’eau fait baisser les nitrates qui s’accumulent.',
  },
  taille: {
    title: 'La taille',
    why: 'Couper les tiges trop hautes rend la lumière aux plantes du bas.',
  },
  bilan: {
    title: 'Le bilan',
    why: 'Voici ce qui a été fait pendant cette séance.',
  },
};

/** Issue d'une étape. */
export type CareStepOutcome = 'fait' | 'saute';

/** Séance en cours. */
export interface CareSession {
  /** Étape affichée. */
  readonly step: CareSessionStep;
  /** Issue des étapes déjà passées. */
  readonly outcomes: Readonly<Partial<Record<CareSessionTaskStep, CareStepOutcome>>>;
}

/** Séance neuve, à la première étape. */
export function startCareSession(): CareSession {
  return { step: 'vitres', outcomes: {} };
}

/** Vrai quand la séance est au bilan (plus rien à faire). */
export function careSessionFinished(session: CareSession): boolean {
  return session.step === 'bilan';
}

/** Étape suivante de `step` (le bilan reste le bilan). */
export function nextCareStep(step: CareSessionStep): CareSessionStep {
  const index = CARE_SESSION_STEPS.indexOf(step);
  return CARE_SESSION_STEPS[Math.min(index + 1, CARE_SESSION_STEPS.length - 1)]!;
}

function leaveStep(session: CareSession, outcome: CareStepOutcome): CareSession {
  if (careSessionFinished(session)) {
    return session;
  }
  const step = session.step as CareSessionTaskStep;
  return { step: nextCareStep(step), outcomes: { ...session.outcomes, [step]: outcome } };
}

/** Termine l'étape affichée et passe à la suivante ; sans effet au bilan. */
export function completeCareStep(session: CareSession): CareSession {
  return leaveStep(session, 'fait');
}

/** Saute l'étape affichée et passe à la suivante ; sans effet au bilan. */
export function skipCareStep(session: CareSession): CareSession {
  return leaveStep(session, 'saute');
}

/**
 * Tâche du calendrier d'entretien (`sim/maintenance.ts`) enregistrée quand l'étape `step` est
 * terminée, `null` si aucune. Lot 1 : seules les vitres ont leur geste ; les autres étapes
 * enregistreront leur tâche avec le leur (lots 2 à 4).
 */
export function careStepTask(step: CareSessionStep): MaintenanceTask | null {
  return step === 'vitres' ? 'glass' : null;
}

/** Ligne du bilan : étape et issue (`null` si elle n'a pas été passée). */
export interface CareSessionSummaryLine {
  readonly step: CareSessionTaskStep;
  readonly title: string;
  readonly outcome: CareStepOutcome | null;
}

/** Bilan de la séance : une ligne par étape où l'on agit, dans l'ordre. */
export function careSessionSummary(session: CareSession): CareSessionSummaryLine[] {
  return CARE_SESSION_STEPS.filter((s): s is CareSessionTaskStep => s !== 'bilan').map((step) => ({
    step,
    title: CARE_SESSION_TEXT[step].title,
    outcome: session.outcomes[step] ?? null,
  }));
}

/**
 * Consigne de l'étape « vitres » selon le nombre de plaques visibles `remaining` : rien à
 * racler (bac sans algues), ou combien il en reste.
 */
export function glassStepHint(remaining: number): string {
  if (!(remaining > 0)) {
    return 'Les vitres sont propres : rien à racler.';
  }
  return remaining === 1
    ? 'Passez la raclette sur la tache verte qui reste.'
    : `Passez la raclette sur les vitres : ${remaining} taches vertes.`;
}

/** Texte enregistré d'une séance (reprise après rechargement). */
export function serializeCareSession(session: CareSession): string {
  return JSON.stringify({ step: session.step, outcomes: session.outcomes });
}

const isStep = (value: unknown): value is CareSessionStep =>
  typeof value === 'string' && (CARE_SESSION_STEPS as readonly string[]).includes(value);

/**
 * Relit une séance enregistrée (`serializeCareSession`) : `null` si le texte est absent ou
 * invalide (étape inconnue, issue inconnue, étape à venir déjà passée). Ne lève jamais.
 */
export function readCareSession(text: string | null): CareSession | null {
  if (text === null) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const record = value as { step?: unknown; outcomes?: unknown } | null;
  if (typeof record !== 'object' || record === null || !isStep(record.step)) {
    return null;
  }
  const outcomes = record.outcomes;
  if (typeof outcomes !== 'object' || outcomes === null || Array.isArray(outcomes)) {
    return null;
  }
  const current = CARE_SESSION_STEPS.indexOf(record.step);
  const read: Partial<Record<CareSessionTaskStep, CareStepOutcome>> = {};
  for (const [step, outcome] of Object.entries(outcomes as Record<string, unknown>)) {
    if (
      !isStep(step) ||
      step === 'bilan' ||
      CARE_SESSION_STEPS.indexOf(step) >= current ||
      (outcome !== 'fait' && outcome !== 'saute')
    ) {
      return null;
    }
    read[step] = outcome;
  }
  return { step: record.step, outcomes: read };
}
