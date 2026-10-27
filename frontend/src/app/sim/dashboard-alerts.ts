import { HUNGRY_AVERAGE, type HealthSummary } from './health-summary';
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
 *   faim ou la santé ; jamais de doublon ;
 * - **seuils** : ceux des jauges (`levelOf` et seuils de `sim/water-quality.ts`, zones du pH
 *   de `sim/water-ph.ts`, seuils de `sim/health-summary.ts`) : une jauge orange donne une
 *   alerte « attention », une jauge rouge une alerte « critique », une jauge verte aucune ;
 * - **ordre** : critiques d'abord, puis à gravité égale l'ordre fixe `ALERT_ORDER` (causes
 *   dans l'eau, puis faim, puis santé, conséquence des autres) : stable d'un relevé à l'autre ;
 * - une valeur non finie donne une alerte critique « mesure invalide » (jamais rassurante).
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
export type AlertId = WaterCompound | 'temperature' | 'ph' | 'hunger' | 'health';

/** Ordre des alertes de même gravité. */
export const ALERT_ORDER: readonly AlertId[] = [
  'ammonia',
  'nitrite',
  'temperature',
  'ph',
  'hunger',
  'nitrate',
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
}

/** Ce que les alertes lisent : eau exacte, zones du pH, santé. */
export interface AlertInput {
  readonly sample: WaterSample;
  readonly phBands: PhBands;
  readonly health: HealthSummary;
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

function healthAlert(health: HealthSummary, causes: readonly string[]): DashboardAlert | null {
  if (health.sick === 0) {
    return null;
  }
  const weak = health.weak > 0;
  return {
    id: 'health',
    severity: weak ? 'critique' : 'attention',
    message: weak ? 'Animaux en détresse' : 'Animaux malades',
    cause:
      causes.length > 0
        ? `santé usée par : ${causes.join(', ')} ; animaux touchés : ${health.sick}`
        : `gêne passée, santé encore basse ; animaux touchés : ${health.sick}`,
    action:
      causes.length > 0
        ? 'Corriger les autres alertes : la santé remonte seule ensuite'
        : 'Rien à faire : la santé remonte seule',
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
  const { sample, phBands, health } = input;
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
  push(hungerAlert(health));
  push(compoundAlert('nitrate', sample.nitrate));
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
