import { isFilterRinseWater, type FilterRinseWater } from './filter-rinse';
import type { MaintenanceTask } from './maintenance';
import { MAX_SIPHON_SHARE } from './siphon';

/**
 * Séance d'entretien guidée (issue #604, ADR 0138) : une suite d'étapes à faire à la main
 * (vitres, siphon, filtre, eau neuve, taille) puis un bilan. Chaque étape se termine ou se
 * saute ; une séance interrompue se reprend à l'étape où elle s'était arrêtée, y compris après
 * un rechargement (`readCareSession`). Fonctions pures, sans hasard ni horloge.
 *
 * Lot 1 : l'étape « vitres » a son geste (la raclette). Lot 2 (#605) : le siphon compte l'eau
 * retirée (`siphoned`), l'eau neuve l'eau versée (`poured`, `sim/siphon.ts`). Lot 3 (#606) :
 * le filtre retient l'eau de rinçage choisie (`rinse`, `sim/filter-rinse.ts`). Lot 5 (#623) :
 * la taille compte les coupes (`cuts`) ; elle est sautée d'office dans un bac sans plante à
 * tailler (`skipAbsentCareSteps`) et n'a alors pas de ligne au bilan. Lot 6 (#624) : le bilan
 * compare l'avant et l'après (`careSessionCompared`) ; les images restent hors de la séance
 * enregistrée.
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
    why: 'Couper les feuilles abîmées et les tiges trop hautes limite les déchets qui chargent l’eau en nitrates.',
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
  /** Part de l'eau retirée au siphon (0 à `MAX_SIPHON_SHARE`, #605) ; absente : 0. */
  readonly siphoned?: number;
  /** Part de l'eau neuve versée (0 à `siphoned`, #605) ; absente : 0. */
  readonly poured?: number;
  /** Eau de rinçage choisie pour l'éponge du filtre (#606) ; absente : pas encore choisie. */
  readonly rinse?: FilterRinseWater;
  /** Coupes faites à l'étape « taille » (#623), entier dans [0, `MAX_CARE_CUTS`] ; absent : 0. */
  readonly cuts?: number;
}

/** Coupes admises à la lecture d'une séance enregistrée. */
export const MAX_CARE_CUTS = 1000;

/** Séance neuve, à la première étape. */
export function startCareSession(): CareSession {
  return { step: 'vitres', outcomes: {} };
}

/** Séance `session` avec la part retirée au siphon `share` (#605), ramenée dans ses bornes. */
export function withSiphoned(session: CareSession, share: number): CareSession {
  const siphoned = isShare(share, MAX_SIPHON_SHARE) ? share : (session.siphoned ?? 0);
  return { ...session, siphoned };
}

/** Séance `session` avec la part versée `share` (#605), jamais plus que l'eau retirée. */
export function withPoured(session: CareSession, share: number): CareSession {
  const limit = session.siphoned ?? 0;
  return { ...session, poured: isShare(share, limit) ? share : (session.poured ?? 0) };
}

/** Séance `session` avec l'eau de rinçage `rinse` choisie pour l'éponge du filtre (#606). */
export function withRinse(session: CareSession, rinse: FilterRinseWater): CareSession {
  return isFilterRinseWater(rinse) ? { ...session, rinse } : session;
}

/** Séance `session` avec une coupe de plus (#623) ; sans effet hors de l'étape « taille ». */
export function withCut(session: CareSession): CareSession {
  if (session.step !== 'taille') {
    return session;
  }
  return { ...session, cuts: Math.min(MAX_CARE_CUTS, (session.cuts ?? 0) + 1) };
}

const isCuts = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_CARE_CUTS;

/**
 * Saute d'office l'étape « taille » d'un bac sans plante à tailler (`prunable` faux, #623) :
 * rien n'est coupé ni enregistré. Toute autre étape est rendue telle quelle.
 */
export function skipAbsentCareSteps(session: CareSession, prunable: boolean): CareSession {
  return session.step === 'taille' && !prunable ? skipCareStep(session) : session;
}

const isShare = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;

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
  return {
    ...session,
    step: nextCareStep(step),
    outcomes: { ...session.outcomes, [step]: outcome },
  };
}

/** Termine l'étape affichée et passe à la suivante ; sans effet au bilan. */
export function completeCareStep(session: CareSession): CareSession {
  return leaveStep(session, 'fait');
}

/** Saute l'étape affichée et passe à la suivante ; sans effet au bilan. */
export function skipCareStep(session: CareSession): CareSession {
  return leaveStep(session, 'saute');
}

/** Tâche enregistrée par chaque étape qui a déjà son geste (lots 1 à 3). */
const STEP_TASKS: Readonly<Partial<Record<CareSessionStep, MaintenanceTask>>> = {
  vitres: 'glass',
  siphon: 'siphon',
  filtre: 'filter',
  eau: 'waterChange',
};

/**
 * Tâche du calendrier d'entretien (`sim/maintenance.ts`) enregistrée quand l'étape `step` est
 * terminée, `null` si aucune : vitres, siphon, filtre et eau neuve (lots 1 à 3). La taille
 * (#623) n'en a pas d'office : la tâche `prune` n'est enregistrée que si une coupe a été faite
 * (`careSessionPruned`).
 */
export function careStepTask(step: CareSessionStep): MaintenanceTask | null {
  return STEP_TASKS[step] ?? null;
}

/** Vrai si la séance doit enregistrer la taille au calendrier : au moins une coupe (#623). */
export function careSessionPruned(session: CareSession): boolean {
  return (session.cuts ?? 0) > 0;
}

/** Ligne du bilan : étape et issue (`null` si elle n'a pas été passée). */
export interface CareSessionSummaryLine {
  readonly step: CareSessionTaskStep;
  readonly title: string;
  readonly outcome: CareStepOutcome | null;
}

/**
 * Bilan de la séance : une ligne par étape où l'on agit, dans l'ordre ; sans ligne « taille »
 * dans un bac sans plante à tailler (`prunable` faux, #623).
 */
export function careSessionSummary(
  session: CareSession,
  prunable = true,
): CareSessionSummaryLine[] {
  return CARE_SESSION_STEPS.filter(
    (s): s is CareSessionTaskStep => s !== 'bilan' && (prunable || s !== 'taille'),
  ).map((step) => ({
    step,
    title: CARE_SESSION_TEXT[step].title,
    outcome: session.outcomes[step] ?? null,
  }));
}

/**
 * Vrai si le bilan doit montrer l'avant et l'après de la séance (#624) : séance au bilan avec
 * au moins une étape faite. Une séance sautée entièrement n'a rien à comparer.
 */
export function careSessionCompared(session: CareSession): boolean {
  return careSessionFinished(session) && Object.values(session.outcomes).includes('fait');
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

/**
 * Consigne de l'étape « taille » selon le nombre de coupes `cuts` (#623) ; `cuttable` faux :
 * aucune plante n'a de pousse à couper (toutes à leur hauteur d'origine), rien à tailler tant
 * qu'aucune coupe n'a été faite (#644).
 */
export function pruneStepHint(cuts: number, cuttable = true): string {
  if (!(cuts > 0)) {
    return cuttable
      ? 'Cliquez ou touchez une tige trop haute pour la couper.'
      : 'Aucune tige ne dépasse : rien à tailler pour l’instant, passez l’étape.';
  }
  return cuts === 1
    ? 'Une coupe : la partie coupée tombe et se décompose. Coupez-en une autre ou terminez.'
    : `${cuts} coupes : chaque partie coupée tombe et se décompose. Coupez-en une autre ou terminez.`;
}

/** Texte enregistré d'une séance (reprise après rechargement). */
export function serializeCareSession(session: CareSession): string {
  return JSON.stringify({
    step: session.step,
    outcomes: session.outcomes,
    ...(session.siphoned === undefined ? {} : { siphoned: session.siphoned }),
    ...(session.poured === undefined ? {} : { poured: session.poured }),
    ...(session.rinse === undefined ? {} : { rinse: session.rinse }),
    ...(session.cuts === undefined ? {} : { cuts: session.cuts }),
  });
}

const isStep = (value: unknown): value is CareSessionStep =>
  typeof value === 'string' && (CARE_SESSION_STEPS as readonly string[]).includes(value);

/**
 * Relit une séance enregistrée (`serializeCareSession`) : `null` si le texte est absent ou
 * invalide (étape inconnue, issue inconnue, étape à venir déjà passée, part retirée ou versée
 * hors bornes, eau de rinçage inconnue, coupes hors bornes). Sans `cuts` (séance enregistrée
 * avant #623) : aucune coupe. Ne lève jamais.
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
  const record = value as {
    step?: unknown;
    outcomes?: unknown;
    siphoned?: unknown;
    poured?: unknown;
    rinse?: unknown;
    cuts?: unknown;
  } | null;
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
  const { siphoned, poured, rinse, cuts } = record;
  if (cuts !== undefined && !isCuts(cuts)) {
    return null;
  }
  if (rinse !== undefined && !isFilterRinseWater(rinse)) {
    return null;
  }
  if (siphoned !== undefined && !isShare(siphoned, MAX_SIPHON_SHARE)) {
    return null;
  }
  if (poured !== undefined && !isShare(poured, typeof siphoned === 'number' ? siphoned : 0)) {
    return null;
  }
  return {
    step: record.step,
    outcomes: read,
    ...(siphoned === undefined ? {} : { siphoned }),
    ...(poured === undefined ? {} : { poured }),
    ...(rinse === undefined ? {} : { rinse }),
    ...(cuts === undefined ? {} : { cuts }),
  };
}
