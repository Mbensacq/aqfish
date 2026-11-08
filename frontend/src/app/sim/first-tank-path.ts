import type { GuidePage } from './care-guide';
import type { WhyTopicId } from './beginner-help';
import type { EnvironmentId } from './environment';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import type { MaintenanceLogEntry, MaintenanceTask } from './maintenance';
import { COMPOUND_THRESHOLDS, levelOf } from './water-quality';
import type { WaterState } from './water';
import type { World } from './world';

/**
 * Parcours guidé « Mon premier aquarium » (issue #512, ADR 0119) : machine à états pure qui lit
 * un instantané du bac et marque les étapes dont l'état de la simulation montre qu'elles sont
 * faites. Sans hasard ni horloge ; elle ne modifie jamais le monde qu'on lui décrit.
 *
 * Une étape se valide dès que sa condition est vraie, même avant son tour (étape sautée), et
 * reste faite ensuite : retirer ses poissons ne défait pas ce qui a été appris. Seul un retour
 * en arrière du bac (temps ou compteur de granulés plus petits qu'au départ : ce n'est plus le
 * même bac) fait repartir le parcours de zéro.
 */

/** Étape du parcours. */
export type FirstTankStepId = 'cycle' | 'first-fish' | 'feed' | 'test-water' | 'change-water';

/** Renvoi d'une étape : page du wiki, ou explication du guide du débutant. */
export type FirstTankLink =
  | { readonly kind: 'wiki'; readonly page: GuidePage; readonly label: string }
  | { readonly kind: 'guide'; readonly topic: WhyTopicId; readonly label: string };

/** Texte d'une étape. */
export interface FirstTankStep {
  readonly id: FirstTankStepId;
  readonly title: string;
  /** Ce qu'il faut faire, et où. */
  readonly action: string;
  /** Pourquoi on le fait. */
  readonly why: string;
  readonly link: FirstTankLink;
}

/** Version du champ sauvegardé (`World.firstTankPath`). */
export const FIRST_TANK_PATH_VERSION = 1;

/**
 * Temps de marche du bac pour l'étape « cycler », en secondes simulées (un quart de journée) :
 * **approximation de jeu**, un vrai filtre met 6 à 8 semaines à mûrir (`docs/SOINS.md` § 2).
 */
export const CYCLE_SECONDS = DEFAULT_DAY_LENGTH_SECONDS / 4;

/** Efficacité minimale du filtre pour considérer le bac cyclé. */
export const CYCLE_MIN_FILTER = 0.5;

/** Les étapes, dans l'ordre du parcours. */
export const FIRST_TANK_STEPS: readonly FirstTankStep[] = [
  {
    id: 'cycle',
    title: 'Laisser le bac se cycler',
    action: 'Laissez tourner le bac : la vitesse ×4 raccourcit l’attente (Réglages, Vitesse).',
    why: 'Le filtre doit éliminer ammoniaque et nitrites. Dans un vrai bac, cela prend 6 à 8 semaines ; ici, quelques heures de jeu.',
    link: { kind: 'wiki', page: 'entretien', label: 'Wiki : entretien' },
  },
  {
    id: 'first-fish',
    title: 'Accueillir un premier poisson',
    action: 'Ajoutez un animal : Réglages, Population.',
    why: 'Peu d’animaux d’abord : le filtre doit suivre la quantité de déchets.',
    link: { kind: 'guide', topic: 'cohabitation', label: 'Guide : mélanger les espèces' },
  },
  {
    id: 'feed',
    title: 'Nourrir',
    action: 'Bouton « Nourrir » ou touche G, une petite quantité.',
    why: 'Ce qui n’est pas mangé pourrit et fait monter l’ammoniaque.',
    link: { kind: 'guide', topic: 'nourriture', label: 'Guide : la nourriture' },
  },
  {
    id: 'test-water',
    title: 'Tester l’eau',
    action: 'Lisez les jauges, puis « Entretien » en bas : « Fait » sur « Test de l’eau ».',
    why: 'L’eau trouble se voit tard : un test montre le problème avant les poissons.',
    link: { kind: 'wiki', page: 'entretien', label: 'Wiki : entretien' },
  },
  {
    id: 'change-water',
    title: 'Changer une partie de l’eau',
    action: 'Réglages, Eau : « Changer l’eau ».',
    why: 'Les nitrates s’accumulent ; un changement partiel les fait baisser sans brusquer les animaux.',
    link: { kind: 'wiki', page: 'entretien', label: 'Wiki : entretien' },
  },
];

/** Identifiants des étapes, dans l'ordre. */
const STEP_IDS: readonly FirstTankStepId[] = FIRST_TANK_STEPS.map((step) => step.id);

/** Progression, enregistrée telle quelle dans la sauvegarde du bac. */
export interface FirstTankPathState {
  readonly version: typeof FIRST_TANK_PATH_VERSION;
  /** Temps simulé du début du parcours, en secondes. */
  readonly startedAt: number;
  /** Compteur de granulés (`World.nextFoodId`) au début du parcours. */
  readonly foodAtStart: number;
  /** Étapes faites, dans l'ordre du parcours. */
  readonly done: readonly FirstTankStepId[];
}

/** Instantané du bac lu par le parcours. */
export interface FirstTankFacts {
  /** Temps simulé, en secondes. */
  readonly time: number;
  /** Nombre d'animaux. */
  readonly animals: number;
  /** Compteur de granulés déposés depuis la création du bac. */
  readonly foodDropped: number;
  /** Ammoniaque et nitrites au niveau « bonne », filtre en marche. */
  readonly waterCycled: boolean;
  /** Journal d'entretien, le plus récent d'abord. */
  readonly log: readonly MaintenanceLogEntry[];
}

/** Modèle de vue : étape en cours (`null` : parcours terminé) et avancement. */
export interface FirstTankPathView {
  readonly current: FirstTankStep | null;
  /** Rang de l'étape en cours à partir de 1, 0 si le parcours est terminé. */
  readonly currentNumber: number;
  readonly doneCount: number;
  readonly total: number;
}

/** Vrai si le parcours est proposé dans cet environnement (récif et paludarium : plus tard). */
export function firstTankPathAvailable(environment: EnvironmentId): boolean {
  return environment !== 'recif' && environment !== 'paludarium';
}

/** Vrai si l'eau est assez saine et le filtre assez efficace pour accueillir des animaux. */
export function isWaterCycled(water: WaterState): boolean {
  return (
    levelOf(water.ammonia, COMPOUND_THRESHOLDS.ammonia) === 'bonne' &&
    levelOf(water.nitrite, COMPOUND_THRESHOLDS.nitrite) === 'bonne' &&
    Number.isFinite(water.filter) &&
    water.filter >= CYCLE_MIN_FILTER
  );
}

/** Instantané de `world`, sans le modifier. */
export function firstTankFacts(world: World): FirstTankFacts {
  return {
    time: world.time,
    animals: world.entities.length,
    foodDropped: world.nextFoodId,
    waterCycled: isWaterCycled(world.water),
    log: world.maintenance?.log ?? [],
  };
}

function usable(facts: FirstTankFacts): boolean {
  return (
    Number.isFinite(facts.time) &&
    facts.time >= 0 &&
    Number.isFinite(facts.animals) &&
    Number.isFinite(facts.foodDropped)
  );
}

/** Parcours neuf, qui commence à l'instantané `facts` (état non fini : à zéro). */
export function createFirstTankPath(facts: FirstTankFacts): FirstTankPathState {
  const valid = usable(facts);
  return {
    version: FIRST_TANK_PATH_VERSION,
    startedAt: valid ? facts.time : 0,
    foodAtStart: valid ? facts.foodDropped : 0,
    done: [],
  };
}

function doneSinceStart(
  state: FirstTankPathState,
  facts: FirstTankFacts,
  task: MaintenanceTask,
): boolean {
  return facts.log.some((entry) => entry.task === task && entry.time >= state.startedAt);
}

function isFulfilled(
  id: FirstTankStepId,
  state: FirstTankPathState,
  facts: FirstTankFacts,
): boolean {
  switch (id) {
    case 'cycle':
      return facts.waterCycled && facts.time - state.startedAt >= CYCLE_SECONDS;
    case 'first-fish':
      return facts.animals > 0;
    case 'feed':
      return facts.animals > 0 && facts.foodDropped > state.foodAtStart;
    case 'test-water':
      return doneSinceStart(state, facts, 'waterTest');
    case 'change-water':
      return doneSinceStart(state, facts, 'waterChange');
  }
}

/**
 * Parcours après lecture de `facts` : le même objet si rien ne change (aucune allocation à
 * chaque relevé), un état neuf si une étape vient d'être faite. Un instantané non fini laisse
 * le parcours inchangé ; un bac revenu en arrière le fait repartir de zéro.
 */
export function advanceFirstTankPath(
  state: FirstTankPathState,
  facts: FirstTankFacts,
): FirstTankPathState {
  if (!usable(facts)) {
    return state;
  }
  if (facts.time < state.startedAt || facts.foodDropped < state.foodAtStart) {
    return createFirstTankPath(facts);
  }
  const done = STEP_IDS.filter((id) => state.done.includes(id) || isFulfilled(id, state, facts));
  return done.length === state.done.length ? state : { ...state, done };
}

/** Modèle de vue de `state` : première étape non faite. */
export function firstTankPathView(state: FirstTankPathState): FirstTankPathView {
  const index = FIRST_TANK_STEPS.findIndex((step) => !state.done.includes(step.id));
  return {
    current: FIRST_TANK_STEPS[index] ?? null,
    currentNumber: index + 1,
    doneCount: state.done.length,
    total: FIRST_TANK_STEPS.length,
  };
}

/** Copie sans partage (sauvegarde). */
export function copyFirstTankPath(state: FirstTankPathState): FirstTankPathState {
  return { ...state, done: [...state.done] };
}

function isStepId(value: unknown): value is FirstTankStepId {
  return typeof value === 'string' && (STEP_IDS as readonly string[]).includes(value);
}

/**
 * Relit le champ `firstTankPath` d'une sauvegarde. Une version inconnue ou un contenu invalide
 * sont signalés dans `problems` (`null`). Étapes remises dans l'ordre du parcours.
 */
export function readFirstTankPath(value: unknown, problems: string[]): FirstTankPathState | null {
  const record = value as Partial<Record<keyof FirstTankPathState, unknown>> | null;
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    problems.push('firstTankPath doit être un objet');
    return null;
  }
  const { version, startedAt, foodAtStart, done } = record;
  if (version !== FIRST_TANK_PATH_VERSION) {
    problems.push(`firstTankPath.version doit valoir ${FIRST_TANK_PATH_VERSION}`);
    return null;
  }
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt < 0) {
    problems.push('firstTankPath.startedAt doit être un temps positif ou nul');
    return null;
  }
  if (!Number.isSafeInteger(foodAtStart) || (foodAtStart as number) < 0) {
    problems.push('firstTankPath.foodAtStart doit être un entier positif ou nul');
    return null;
  }
  if (!Array.isArray(done) || !done.every(isStepId) || new Set(done).size !== done.length) {
    problems.push('firstTankPath.done doit lister des étapes connues, une seule fois');
    return null;
  }
  return {
    version: FIRST_TANK_PATH_VERSION,
    startedAt,
    foodAtStart: foodAtStart as number,
    done: STEP_IDS.filter((id) => done.includes(id)),
  };
}
