import type { AlertId } from './dashboard-alerts';
import type { FieldStatus } from './species-sheet';
import type { DashboardGaugeId } from './water-dashboard';

/**
 * Aides pour débutant (issue #240, ADR 0072) : explications « Pourquoi ? » par sujet et
 * « Guide du débutant » en cinq étapes. Données pures et figées, sans hasard ni horloge.
 *
 * Règles de contenu :
 * - textes en français, sans jargon non expliqué ;
 * - chaque explication et chaque étape porte un statut : une **source** (`docs/SOINS.md`,
 *   qui cite UF/IFAS, Merck, VIN/WSAVA) ou la mention « simplification de jeu » quand le
 *   texte décrit le modèle de la simulation et non une règle d'aquariophilie ;
 * - identifiants uniques, aucun texte vide (vérifié par `sim/beginner-help.spec.ts`).
 *
 * Les seuils des alertes ne sont pas recopiés ici : ils restent dans `sim/dashboard-alerts.ts`.
 * Ce module ne fait que relier chaque alerte et chaque jauge à son explication.
 */

/** Sujet d'une explication « Pourquoi ? ». */
export type WhyTopicId =
  | 'azote'
  | 'temperature'
  | 'ph'
  | 'eau-trouble'
  | 'acclimatation'
  | 'nourriture'
  | 'sante'
  | 'cohabitation';

/** Explication « Pourquoi ? » : quelques lignes et leur statut. */
export interface WhyTopic {
  readonly id: WhyTopicId;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly status: FieldStatus;
}

/** Étape du « Guide du débutant ». */
export interface GuideStep {
  readonly id: string;
  readonly title: string;
  /** Ce qu'il faut savoir (réalité, ou modèle du jeu si `status` le dit). */
  readonly text: string;
  /** Où le faire dans le jeu. */
  readonly inGame: string;
  /** Explication liée, ouverte par « Pourquoi ? » (`null` : aucune). */
  readonly topic: WhyTopicId | null;
  readonly status: FieldStatus;
}

/** Mention des textes qui décrivent le modèle du jeu. */
export const GAME_SIMPLIFICATION = 'Simplification de jeu';

const SIMPLIFICATION: FieldStatus = Object.freeze({ kind: 'approximation' });

function source(reference: string): FieldStatus {
  return Object.freeze({ kind: 'source', reference });
}

/** Texte affiché du statut : « Source : … » ou « Simplification de jeu ». */
export function helpStatusText(status: FieldStatus): string {
  return status.kind === 'source' ? `Source : ${status.reference}` : GAME_SIMPLIFICATION;
}

const SOINS = 'docs/SOINS.md';

/** Ordre d'affichage des explications. */
export const WHY_TOPIC_ORDER: readonly WhyTopicId[] = [
  'azote',
  'temperature',
  'ph',
  'eau-trouble',
  'acclimatation',
  'nourriture',
  'sante',
  'cohabitation',
];

const TOPICS: Readonly<Record<WhyTopicId, WhyTopic>> = {
  azote: {
    id: 'azote',
    title: 'Le cycle de l’azote',
    paragraphs: [
      'Les déchets des animaux et la nourriture oubliée donnent de l’ammoniaque, toxique. Les bactéries du filtre la changent en nitrites, toxiques aussi, puis en nitrates, bien moins nocifs.',
      'Un filtre neuf n’a pas encore ces bactéries : il faut 6 à 8 semaines pour qu’il devienne efficace. Les nitrates, eux, ne partent qu’avec un changement d’eau partiel.',
      'En cas d’ammoniaque : nourrir moins et changer une partie de l’eau (25 à 50 %), jamais toute l’eau d’un coup.',
    ],
    status: source(`${SOINS} § 2 et § 14 (UF/IFAS FA16)`),
  },
  temperature: {
    id: 'temperature',
    title: 'La température de l’eau',
    paragraphs: [
      'Poissons et amphibiens ont la température de l’eau qui les entoure : trop chaude ou trop froide, leur corps fonctionne mal et ils tombent malades plus facilement.',
      'Un chauffage réglé (thermostat) garde l’eau stable. Une panne de thermostat peut être mortelle ; un changement brutal fait du tort, même vers une bonne valeur.',
    ],
    status: source(`${SOINS} § 1.5 et § 5.6 (Merck)`),
  },
  ph: {
    id: 'ph',
    title: 'Le pH',
    paragraphs: [
      'Le pH dit si l’eau est acide (sous 7) ou basique (au-dessus de 7). Chaque espèce a sa plage : la jauge colore en vert la plage idéale commune aux espèces du bac.',
      'Avec le temps, les bactéries du filtre acidifient l’eau ; un changement d’eau la ramène vers celle du robinet. Il vaut mieux des changements lents que de corriger brusquement.',
    ],
    status: source(`${SOINS} § 3 (Merck, UF/IFAS, VIN/WSAVA)`),
  },
  'eau-trouble': {
    id: 'eau-trouble',
    title: 'L’eau trouble',
    paragraphs: [
      'Dans le jeu, l’eau devient trouble et verdâtre quand sa qualité est mauvaise : trop d’ammoniaque, de nitrites ou de nitrates.',
      'Elle redevient claire quand ces valeurs baissent : changer une partie de l’eau et nourrir moins. Dans un vrai bac, une eau trouble a plusieurs causes possibles : la faire analyser.',
    ],
    status: SIMPLIFICATION,
  },
  acclimatation: {
    id: 'acclimatation',
    title: 'L’acclimatation',
    paragraphs: [
      'Un animal qui arrive passe d’une eau à une autre : température et pH différents. L’habitude est de l’y habituer peu à peu, en mélangeant lentement les deux eaux, plutôt que de le verser d’un coup.',
      'Dans le jeu, les nouveaux animaux arrivent sans délai ; ajoutez-les peu à peu, pour laisser le filtre suivre la quantité de déchets.',
    ],
    status: SIMPLIFICATION,
  },
  nourriture: {
    id: 'nourriture',
    title: 'La faim et la nourriture',
    paragraphs: [
      'Dans le jeu, la faim monte avec le temps ; un animal affamé longtemps perd de la santé.',
      'Trop nourrir n’aide pas : la nourriture oubliée pourrit et fait monter l’ammoniaque. Peu, et souvent, vaut mieux.',
    ],
    status: SIMPLIFICATION,
  },
  sante: {
    id: 'sante',
    title: 'La santé des animaux',
    paragraphs: [
      'Dans le jeu, la santé baisse quand quelque chose ne va pas (eau mauvaise, faim, pH hors plage) et remonte seule quand tout est corrigé.',
      'Un animal réellement malade justifie un vétérinaire : ce jeu n’est pas un avis vétérinaire.',
    ],
    status: SIMPLIFICATION,
  },
  cohabitation: {
    id: 'cohabitation',
    title: 'Mélanger les espèces',
    paragraphs: [
      'Certaines espèces ne vont pas ensemble : l’une mange l’autre, ou elles n’aiment pas la même eau. Le wiki des espèces indique, pour chacune, avec qui elle cohabite.',
    ],
    status: SIMPLIFICATION,
  },
};

/** Explication `id`. */
export function whyTopic(id: WhyTopicId): WhyTopic {
  return TOPICS[id];
}

/** Toutes les explications, dans l'ordre d'affichage. */
export function whyTopics(): readonly WhyTopic[] {
  return WHY_TOPIC_ORDER.map((id) => TOPICS[id]);
}

/** Explication liée à chaque alerte du tableau de bord (`sim/dashboard-alerts.ts`). */
export const ALERT_TOPICS: Readonly<Record<AlertId, WhyTopicId>> = {
  ammonia: 'azote',
  nitrite: 'azote',
  nitrate: 'azote',
  temperature: 'temperature',
  ph: 'ph',
  hunger: 'nourriture',
  health: 'sante',
  mix: 'cohabitation',
};

/** Explication liée à chaque jauge de l'eau (`sim/water-dashboard.ts`). */
export const GAUGE_TOPICS: Readonly<Record<DashboardGaugeId, WhyTopicId>> = {
  temperature: 'temperature',
  ammonia: 'azote',
  nitrite: 'azote',
  nitrate: 'azote',
  ph: 'ph',
};

/** Les cinq étapes du guide, dans l'ordre. */
export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: 'installer',
    title: 'Installer le bac',
    text: 'Choisir un milieu (bac tropical, bassin, paludarium, récif) et régler le chauffage à la température de ce milieu.',
    inGame: 'Réglages : Environnement, puis Eau pour le chauffage.',
    topic: 'temperature',
    status: SIMPLIFICATION,
  },
  {
    id: 'murir',
    title: 'Faire mûrir l’eau',
    text: 'Un filtre neuf met 6 à 8 semaines à abriter assez de bactéries pour éliminer l’ammoniaque et les nitrites. Dans un vrai bac, on attend ce délai avant d’ajouter des poissons.',
    inGame: 'Tableau de bord Eau : surveiller ammoniaque et nitrites.',
    topic: 'azote',
    status: source(`${SOINS} § 2 et § 14 (UF/IFAS FA16)`),
  },
  {
    id: 'especes',
    title: 'Choisir les espèces',
    text: 'Prendre des espèces qui partagent la même eau et ne se mangent pas, puis les ajouter peu à peu.',
    inGame: 'Wiki : fiche de chaque espèce, avec sa cohabitation ; Réglages : Population.',
    topic: 'cohabitation',
    status: SIMPLIFICATION,
  },
  {
    id: 'nourrir',
    title: 'Nourrir',
    text: 'Peu et régulièrement : ce qui n’est pas mangé salit l’eau.',
    inGame: 'Bouton « Nourrir » ou touche G.',
    topic: 'nourriture',
    status: SIMPLIFICATION,
  },
  {
    id: 'entretenir',
    title: 'Entretenir',
    text: 'Changer une partie de l’eau quand les nitrates montent, jamais toute l’eau d’un coup, et lire les alertes : chacune dit quoi faire.',
    inGame: 'Réglages : Eau, « Changer l’eau » ; alertes au-dessus de la barre des vues.',
    topic: 'azote',
    status: source(`${SOINS} § 14 (UF/IFAS)`),
  },
];
