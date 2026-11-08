import { algaeLevel } from './algae';
import type { GuidePage } from './care-guide';
import type { MixWarning } from './compatibility';
import { HUNGRY_AVERAGE, type HealthSummary } from './health-summary';
import { MIX_REASON_TEXT, SPECIES_LABELS } from './species-catalog';
import { tenthText } from './treatment';
import { redoseText, type TreatmentReadout } from './treatment-text';
import { WATER_CHANGE_SHARE, WATER_TEMPERATURES } from './water';
import {
  compoundLevel,
  temperatureLevel,
  type GaugeLevel,
  type WaterSample,
} from './water-dashboard';
import { phZone, type PhBands } from './water-ph';
import type { WaterCompound } from './water-quality';

/**
 * Alertes du tableau de bord (issue #260, addendum de l'ADR 0059) : à partir du relevé de
 * l'eau et de la synthèse de santé, une liste d'alertes ordonnée par gravité, chacune avec un
 * message court, une cause probable et une action conseillée. Fonctions pures, sans hasard
 * ni horloge ; rien ici n'écrit dans le monde.
 *
 * Règles :
 * - **une alerte par sujet** (identifiant unique) : un composé, la température, le pH, la
 *   faim, la santé ou le mélange d'espèces déconseillé (issue #271) ; jamais de doublon ;
 * - **seuils** : ceux des jauges (`levelOf` et seuils de `sim/water-quality.ts`, zones du pH
 *   de `sim/water-ph.ts`, seuils de `sim/health-summary.ts`) : une jauge orange donne une
 *   alerte « attention », une jauge rouge une alerte « critique », une jauge verte aucune ;
 * - **ordre** : critiques d'abord, puis à gravité égale l'ordre fixe `ALERT_ORDER` (causes
 *   dans l'eau, puis faim, puis santé, conséquence des autres) : stable d'un relevé à l'autre ;
 * - une valeur non finie donne une alerte critique « mesure invalide » (jamais rassurante) ;
 * - **points blancs** (issue #366, ADR 0089) : une alerte dès qu'un animal en montre les
 *   signes (`HealthSummary.ich`), critique au stade aggravé, avec un lien vers la page
 *   « Maladies » du wiki (`wiki`) ; ces animaux ne sont plus comptés dans l'alerte de santé,
 *   qui ne parle que des autres malades ;
 * - **pourriture des nageoires** (issue #485, ADR 0114) : de même, une alerte dès qu'un animal
 *   a les nageoires effilochées (`HealthSummary.finRot`), critique au stade avancé, avec sa
 *   cause (eau trop chargée) et l'action (changer l'eau), et le lien « Maladies » ;
 * - **traitement en cours** (issue #361, ADR 0091) : une alerte « attention » tant que la cure
 *   avance, avec les jours restants et, pour le médicament, le délai avant de redoser.
 *
 * Les causes et actions sont des **textes de jeu** : elles décrivent le modèle de la
 * simulation (`sim/water.ts`, `sim/wellbeing.ts`), simplifié, pas une règle d'aquariophilie.
 */

/** Gravité d'une alerte, de la plus forte à la plus faible. */
export type AlertSeverity = 'critique' | 'attention';

/** Libellé affiché de chaque gravité. */
export const ALERT_SEVERITY_LABELS: Readonly<Record<AlertSeverity, string>> = {
  critique: 'Critique',
  attention: 'Attention',
};

/** Sujet d'une alerte (identifiant unique). */
export type AlertId =
  | WaterCompound
  | 'temperature'
  | 'ph'
  | 'ich'
  | 'finRot'
  | 'treatment'
  | 'hunger'
  | 'health'
  | 'mix'
  | 'algae';

/** Ordre des alertes de même gravité. */
export const ALERT_ORDER: readonly AlertId[] = [
  'ammonia',
  'nitrite',
  'temperature',
  'ph',
  'ich',
  'finRot',
  'treatment',
  'hunger',
  'nitrate',
  'algae',
  'mix',
  'health',
];

/** Nombre d'alertes affichées au plus ; les autres sont comptées (« +N »). */
export const MAX_SHOWN_ALERTS = 3;

/** Une alerte. Objet de données pur. */
export interface DashboardAlert {
  readonly id: AlertId;
  readonly severity: AlertSeverity;
  /** Message court (« Nitrites trop hauts »). */
  readonly message: string;
  /** Cause probable (« filtre jeune ou trop de poissons »). */
  readonly cause: string;
  /** Action conseillée (« Changer l'eau »). */
  readonly action: string;
  /** Page du wiki à ouvrir depuis l'alerte (`sim/care-guide.ts`) ; absente : aucune. */
  readonly wiki?: GuidePage;
}

/** Ce que les alertes lisent : eau exacte, zones du pH, santé, mélanges déconseillés. */
export interface AlertInput {
  readonly sample: WaterSample;
  readonly phBands: PhBands;
  readonly health: HealthSummary;
  /**
   * Mélanges déconseillés de la population affichée (`mixWarnings`, `sim/compatibility.ts`),
   * absent ou vide : aucun (issue #271).
   */
  readonly mixes?: readonly MixWarning[];
  /** Traitement des points blancs en cours (`treatmentReadout`, issue #361) ; absent : aucun. */
  readonly treatment?: TreatmentReadout | null;
}

const SEVERITY_OF: Readonly<Record<GaugeLevel, AlertSeverity | null>> = {
  vert: null,
  orange: 'attention',
  rouge: 'critique',
};

const INVALID_CAUSE = 'mesure invalide (état de l’eau abîmé)';
const CHANGE_WATER = `Changer l’eau (${Math.round(WATER_CHANGE_SHARE * 100)} % renouvelés)`;

/** Textes de chaque composé : message, cause probable, action. */
const COMPOUND_TEXTS: Readonly<
  Record<
    WaterCompound,
    { readonly message: string; readonly cause: string; readonly action: string }
  >
> = {
  ammonia: {
    message: 'Ammoniaque trop haute',
    cause: 'déchets des animaux et restes de nourriture, filtre encore jeune',
    action: `${CHANGE_WATER} et nourrir moins`,
  },
  nitrite: {
    message: 'Nitrites trop hauts',
    cause: 'filtre jeune ou trop de poissons',
    action: `${CHANGE_WATER}, ne pas ajouter d’animaux`,
  },
  nitrate: {
    message: 'Nitrates trop hauts',
    cause: 'eau pas changée depuis longtemps',
    action: CHANGE_WATER,
  },
};

function compoundAlert(compound: WaterCompound, value: number): DashboardAlert | null {
  const severity = SEVERITY_OF[compoundLevel(compound, value)];
  if (severity === null) {
    return null;
  }
  const texts = COMPOUND_TEXTS[compound];
  return {
    id: compound,
    severity,
    message: texts.message,
    cause: Number.isFinite(value) ? texts.cause : INVALID_CAUSE,
    action: texts.action,
  };
}

function temperatureAlert(sample: WaterSample): DashboardAlert | null {
  const severity = SEVERITY_OF[temperatureLevel(sample.temperature, sample.environment)];
  if (severity === null) {
    return null;
  }
  const reference = WATER_TEMPERATURES[sample.environment];
  const action = `Régler le chauffage sur ${reference} °C`;
  if (!Number.isFinite(sample.temperature)) {
    return {
      id: 'temperature',
      severity,
      message: 'Température anormale',
      cause: INVALID_CAUSE,
      action,
    };
  }
  const hot = sample.temperature > reference;
  return {
    id: 'temperature',
    severity,
    message: hot ? 'Eau trop chaude' : 'Eau trop froide',
    cause: hot ? 'chauffage réglé trop haut' : 'chauffage réglé trop bas',
    action,
  };
}

function phAlert(ph: number, bands: PhBands): DashboardAlert | null {
  const zone = phZone(ph, bands);
  if (zone === 'ideal') {
    return null;
  }
  if (bands.tolerated === null) {
    return {
      id: 'ph',
      severity: 'critique',
      message: 'pH impossible à tenir',
      cause: 'les espèces présentes n’ont aucun pH en commun',
      action: 'Retirer l’une des espèces',
    };
  }
  if (!Number.isFinite(ph)) {
    return {
      id: 'ph',
      severity: 'critique',
      message: 'pH anormal',
      cause: INVALID_CAUSE,
      action: CHANGE_WATER,
    };
  }
  if (zone === 'tolere' && bands.ideal === null) {
    // Zone tolérée sans plage idéale commune : rien à corriger dans l'eau, à surveiller.
    return {
      id: 'ph',
      severity: 'attention',
      message: 'pH sans idéal commun',
      cause: 'les espèces présentes n’ont pas de pH idéal commun',
      action: 'Surveiller les espèces les plus sensibles',
    };
  }
  const acid = ph < (bands.ideal ?? bands.tolerated).min;
  if (zone === 'tolere') {
    return {
      id: 'ph',
      severity: 'attention',
      message: acid ? 'pH un peu acide' : 'pH un peu basique',
      cause: acid
        ? 'les déchets acidifient l’eau peu à peu'
        : 'eau neuve plus basique que l’idéal de ces espèces',
      action: acid ? 'Prévoir un changement d’eau' : 'Surveiller les espèces les plus sensibles',
    };
  }
  return {
    id: 'ph',
    severity: 'critique',
    message: acid ? 'pH trop acide' : 'pH trop basique',
    cause: acid
      ? 'eau vieillie : les déchets l’acidifient'
      : 'eau trop basique pour les espèces présentes',
    action: acid ? CHANGE_WATER : 'Vérifier le choix des espèces',
  };
}

/** « 1 animal », « 3 animaux ». */
export function animalCount(count: number): string {
  return `${count} ${count > 1 ? 'animaux' : 'animal'}`;
}

function hungerAlert(health: HealthSummary): DashboardAlert | null {
  if (health.starving > 0) {
    return {
      id: 'hunger',
      severity: 'critique',
      message: 'Animaux affamés',
      cause: `${animalCount(health.starving)} sans repas depuis longtemps`,
      action: 'Nourrir : bouton « Nourrir » ou touche G',
    };
  }
  if (health.averageHunger !== null && health.averageHunger >= HUNGRY_AVERAGE) {
    return {
      id: 'hunger',
      severity: 'attention',
      message: 'Animaux qui ont faim',
      cause: 'dernier repas lointain',
      action: 'Nourrir bientôt : bouton « Nourrir » ou touche G',
    };
  }
  return null;
}

/**
 * Points blancs (issue #366) : animaux qui en montrent les signes, critique dès qu'un est au
 * stade aggravé. Renvoie à la page « Maladies » du wiki ; l'action renvoie aux soins (#361).
 */
export function ichAlert(health: HealthSummary): DashboardAlert | null {
  if (health.ich <= 0) {
    return null;
  }
  const aggravated = health.ichAggravated > 0;
  return {
    id: 'ich',
    severity: aggravated ? 'critique' : 'attention',
    message: 'Points blancs',
    cause:
      `parasite (Ichthyophthirius) favorisé par une eau instable ; ${animalCount(health.ich)} touché${health.ich > 1 ? 's' : ''}` +
      (aggravated ? `, dont ${health.ichAggravated} au stade aggravé` : ''),
    action:
      'Traiter plusieurs jours : Réglages, Soins ; garder l’eau stable (température, ammoniaque, nitrites)',
    wiki: 'maladies',
  };
}

/**
 * Pourriture des nageoires (issue #485) : animaux aux nageoires effilochées, critique dès qu'un
 * est au stade avancé. Cause : l'eau ; action : la corriger (changer l'eau), la guérison suit
 * seule. Renvoie à la page « Maladies » du wiki.
 */
export function finRotAlert(health: HealthSummary): DashboardAlert | null {
  if (health.finRot <= 0) {
    return null;
  }
  const advanced = health.finRotAdvanced > 0;
  return {
    id: 'finRot',
    severity: advanced ? 'critique' : 'attention',
    message: 'Nageoires effilochées',
    cause:
      `eau trop chargée (ammoniaque ou nitrites) : bactéries de la pourriture des nageoires ; ${animalCount(health.finRot)} touché${health.finRot > 1 ? 's' : ''}` +
      (advanced ? `, dont ${health.finRotAdvanced} au stade avancé` : ''),
    action: `${CHANGE_WATER} et nourrir moins : les nageoires repoussent une fois l’eau propre`,
    wiki: 'maladies',
  };
}

/**
 * Traitement des points blancs en cours (issue #361) : jours restants à la température
 * actuelle et, pour le médicament, le délai avant de redoser. Renvoie à la page « Produits et
 * traitements » du wiki.
 */
export function treatmentAlert(treatment: TreatmentReadout | null): DashboardAlert | null {
  if (treatment === null) {
    return null;
  }
  return {
    id: 'treatment',
    severity: 'attention',
    message: 'Traitement en cours',
    cause: `${treatment.products} ; points blancs en recul`,
    action: `Continuer encore ${tenthText(treatment.remainingDays)} j${redoseText(treatment)} ; un changement d’eau retire une part du produit`,
    wiki: 'produits',
  };
}

function healthAlert(health: HealthSummary, causes: readonly string[]): DashboardAlert | null {
  // Les animaux aux points blancs ou aux nageoires effilochées ont leurs propres alertes
  // (`ichAlert`, `finRotAlert`) : seuls les autres malades comptent ici, effectif comme
  // gravité (issues #370, #485).
  const others = health.sick - health.diseased;
  if (others <= 0) {
    return null;
  }
  const weak = health.weakWithoutDisease > 0;
  return {
    id: 'health',
    severity: weak ? 'critique' : 'attention',
    message: weak ? 'Animaux en détresse' : 'Animaux malades',
    cause:
      causes.length > 0
        ? `santé usée par : ${causes.join(', ')} ; animaux touchés : ${others}`
        : `gêne passée, santé encore basse ; animaux touchés : ${others}`,
    action:
      causes.length > 0
        ? 'Corriger les autres alertes : la santé remonte seule ensuite'
        : 'Rien à faire : la santé remonte seule',
  };
}

/**
 * Mélange déconseillé (issue #271) : une alerte « attention » qui nomme chaque couple présent
 * et sa raison (« axolotls et sonneurs orientaux (prédateur) »). Le modèle de santé ne s'en
 * sert pas : c'est un conseil de maintenance, pas une cause de souffrance simulée.
 */
export function mixAlert(mixes: readonly MixWarning[]): DashboardAlert | null {
  if (mixes.length === 0) {
    return null;
  }
  const pairs = mixes.map(
    (m) =>
      `${SPECIES_LABELS[m.first].plural} et ${SPECIES_LABELS[m.second].plural} (${MIX_REASON_TEXT[m.reason]})`,
  );
  return {
    id: 'mix',
    severity: 'attention',
    message: 'Mélange déconseillé',
    cause: pairs.join(' ; '),
    action: 'Retirer l’une des espèces : Réglages, Population',
  };
}

/**
 * Prolifération d'algues (issue #476) : « attention » dès que la couverture moyenne atteint
 * `ALGAE_WATCH_COVERAGE`, « critique » à `ALGAE_BAD_COVERAGE` ; une couverture non finie est
 * critique. Renvoie à la page « Entretien » du wiki. Les algues ne font pas souffrir les
 * animaux dans le jeu : elles signalent un éclairage trop long ou des nitrates élevés.
 */
export function algaeAlert(coverage: number | undefined): DashboardAlert | null {
  if (coverage === undefined) {
    return null;
  }
  const level = algaeLevel(coverage);
  if (level === 'aucune') {
    return null;
  }
  const percent = Number.isFinite(coverage) ? `${Math.round(coverage * 100)} %` : '';
  return {
    id: 'algae',
    severity: level === 'grave' ? 'critique' : 'attention',
    message: level === 'grave' ? 'Algues envahissantes' : 'Algues en prolifération',
    cause: Number.isFinite(coverage)
      ? `éclairage trop long ou nitrates élevés ; vitres couvertes à ${percent}`
      : INVALID_CAUSE,
    action: 'Passer la raclette (Réglages, Eau), réduire l’éclairage et changer l’eau',
    wiki: 'entretien',
  };
}

/** Causes de souffrance actives, d'après les autres alertes (`sim/wellbeing.ts`). */
function activeCauses(alerts: readonly DashboardAlert[]): string[] {
  const causes: string[] = [];
  const has = (id: AlertId, severity?: AlertSeverity) =>
    alerts.some((a) => a.id === id && (severity === undefined || a.severity === severity));
  // Eau « mauvaise » (`waterQuality`) : un composé ou la température au rouge.
  if (
    (['ammonia', 'nitrite', 'nitrate', 'temperature'] as const).some((id) => has(id, 'critique'))
  ) {
    causes.push('eau mauvaise');
  }
  if (has('hunger', 'critique')) {
    causes.push('faim');
  }
  if (has('ph', 'critique')) {
    causes.push('pH hors plage');
  }
  return causes;
}

/** Rang de tri : gravité, puis ordre fixe. */
function rank(alert: DashboardAlert): number {
  return (alert.severity === 'critique' ? 0 : ALERT_ORDER.length) + ALERT_ORDER.indexOf(alert.id);
}

/**
 * Alertes du bac, ordonnées par gravité puis selon `ALERT_ORDER`. Eau saine et animaux en
 * bonne santé : aucune alerte.
 */
export function dashboardAlerts(input: AlertInput): readonly DashboardAlert[] {
  const { sample, phBands, health, mixes = [], treatment = null } = input;
  const found: DashboardAlert[] = [];
  const push = (alert: DashboardAlert | null) => {
    if (alert !== null && !found.some((a) => a.id === alert.id)) {
      found.push(alert);
    }
  };
  push(compoundAlert('ammonia', sample.ammonia));
  push(compoundAlert('nitrite', sample.nitrite));
  push(temperatureAlert(sample));
  push(phAlert(sample.ph, phBands));
  push(ichAlert(health));
  push(finRotAlert(health));
  push(treatmentAlert(treatment));
  push(hungerAlert(health));
  push(compoundAlert('nitrate', sample.nitrate));
  push(algaeAlert(sample.algae));
  push(mixAlert(mixes));
  push(healthAlert(health, activeCauses(found)));
  return found.sort((a, b) => rank(a) - rank(b));
}

/** Alertes affichées (au plus `max`) et nombre d'alertes masquées (« +N »). */
export function shownAlerts(
  alerts: readonly DashboardAlert[],
  max: number = MAX_SHOWN_ALERTS,
): { readonly shown: readonly DashboardAlert[]; readonly hidden: number } {
  const limit = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : MAX_SHOWN_ALERTS;
  return { shown: alerts.slice(0, limit), hidden: Math.max(0, alerts.length - limit) };
}

/**
 * Texte annoncé aux lecteurs d'écran (région `role="status"`) : sujets et gravités de toutes
 * les alertes, sans valeur ni effectif, pour qu'il ne change (et ne soit relu) que lorsqu'une
 * alerte apparaît, disparaît ou change de gravité.
 */
export function alertsAnnouncement(alerts: readonly DashboardAlert[]): string {
  if (alerts.length === 0) {
    return 'Aucune alerte.';
  }
  const list = alerts
    .map((a) => `${a.message} (${ALERT_SEVERITY_LABELS[a.severity].toLowerCase()})`)
    .join(', ');
  return `${alerts.length} ${alerts.length > 1 ? 'alertes' : 'alerte'} : ${list}.`;
}
