import type { AlertId, AlertSeverity } from './dashboard-alerts';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { DISEASES, type DiseaseField } from './diseases';
import { laysEggs, type Egg } from './eggs';
import { hasFry, isFry } from './fry';
import { SPECIES, type SpeciesId } from './species';
import type { Fish } from './swimmer';
import { TREATMENT_KINDS, TREATMENTS, type TreatmentKind } from './treatment';

/**
 * Journal du bac (issue #581) : événements datés en temps simulé (maladie déclarée, guérison,
 * traitement, ponte, éclosion, changement d'eau, alerte franchie — #592), gardés dans l'ordre
 * chronologique et plafonnés à `JOURNAL_CAPACITY` entrées (les plus anciennes partent).
 * Fonctions pures de ce qu'on leur donne, sans hasard ni horloge réelle.
 *
 * Reproduction (ponte, éclosion, naissance) et entretien (séance, taille, eau neuve, #655) y
 * entrent aussi, et l'interface les filtre par famille (`JOURNAL_FILTERS`).
 *
 * Comme l'historique de l'eau (ADR 0118), le journal vit hors du monde pendant la partie
 * (aucun pas n'y touche, la simulation reste identique au bit près) ; sa forme de données
 * (`SavedJournal`) va dans la sauvegarde.
 */

/** Nombre maximal d'entrées gardées. */
export const JOURNAL_CAPACITY = 200;

/**
 * Délai, en secondes simulées, avant qu'une alerte revenue soit notée de nouveau avec la même
 * gravité (#599) : un jour simulé. Une alerte qui oscille (faim entre deux repas, température
 * au bord d'une bande) écrit ainsi au plus une entrée par gravité et par jour, et ne chasse
 * pas du journal les événements marquants.
 */
export const JOURNAL_ALERT_REPEAT_SECONDS = DEFAULT_DAY_LENGTH_SECONDS;

/** Version du champ `journal` de la sauvegarde. */
export const JOURNAL_VERSION = 1;

/** Sortes d'événements, dans l'ordre de leurs libellés. */
export const JOURNAL_KINDS = [
  'maladie',
  'guerison',
  'traitement',
  'ponte',
  'eclosion',
  'changementEau',
  'alerte',
  'naissance',
  'seance',
  'taille',
  'eauNeuve',
] as const;

export type JournalKind = (typeof JOURNAL_KINDS)[number];

/**
 * Familles du filtre du journal (#655), dans l'ordre des boutons : `tout` ne masque rien, les
 * autres ne gardent que leurs sortes (`JOURNAL_KIND_GROUPS`).
 */
export const JOURNAL_FILTERS = ['tout', 'sante', 'reproduction', 'entretien', 'alertes'] as const;

export type JournalFilter = (typeof JOURNAL_FILTERS)[number];

/** Famille d'une sorte d'événement (hors `tout`). */
export type JournalGroup = Exclude<JournalFilter, 'tout'>;

/** Libellé court de chaque bouton du filtre. */
export const JOURNAL_FILTER_LABELS: Readonly<Record<JournalFilter, string>> = {
  tout: 'Tout',
  sante: 'Santé',
  reproduction: 'Reproduction',
  entretien: 'Entretien',
  alertes: 'Alertes',
};

/** Famille de chaque sorte : elle choisit aussi l'icône de la ligne. */
export const JOURNAL_KIND_GROUPS: Readonly<Record<JournalKind, JournalGroup>> = {
  maladie: 'sante',
  guerison: 'sante',
  traitement: 'sante',
  ponte: 'reproduction',
  eclosion: 'reproduction',
  naissance: 'reproduction',
  changementEau: 'entretien',
  seance: 'entretien',
  taille: 'entretien',
  eauNeuve: 'entretien',
  alerte: 'alertes',
};

/** Texte d'un journal sans ligne, ou sans ligne du type choisi (#655). */
export const JOURNAL_EMPTY_TEXT = 'Rien à signaler.';

/** Effectif maximal relu d'une entrée sauvegardée. */
const MAX_COUNT = 10_000;

/** Une entrée : objet de données pur, sérialisable en JSON. */
export interface JournalEntry {
  /** Temps simulé de l'événement, en secondes (≥ 0). */
  readonly time: number;
  readonly kind: JournalKind;
  /**
   * Précision selon la sorte : maladie (`DiseaseField`) pour `maladie` et `guerison`, sorte de
   * traitement (`TreatmentKind`) pour `traitement`, espèce (`SpeciesId`) pour `ponte` et
   * `eclosion` et `naissance`, alerte (`JournalAlertId`) pour `alerte` ; absente pour
   * `changementEau`, `seance`, `taille` et `eauNeuve`.
   */
  readonly detail?: string;
  /** Gravité atteinte, pour `alerte` seulement (#592). */
  readonly severity?: AlertSeverity;
  /**
   * Nombre d'animaux, d'œufs ou de coupes (`taille`) concernés (≥ 1) ; absent : sans objet.
   */
  readonly count?: number;
}

/** Journal d'un bac. Modifié en place par `addJournalEntry`. */
export interface Journal {
  /** Entrées, de la plus ancienne à la plus récente (temps croissants). */
  readonly entries: JournalEntry[];
  /** Incrémenté à chaque changement : l'interface ne relit le journal que s'il a bougé. */
  version: number;
}

/** Forme du journal dans la sauvegarde. */
export interface SavedJournal {
  readonly version: typeof JOURNAL_VERSION;
  readonly entries: readonly JournalEntry[];
}

/** Ligne du journal lue par l'interface. */
export interface JournalLine {
  readonly kind: JournalKind;
  /** Famille de la sorte (filtre et icône, #655). */
  readonly group: JournalGroup;
  /** Jour simulé (1 : le premier). */
  readonly day: number;
  readonly text: string;
}

/** Nom de chaque maladie dans le journal. */
export const JOURNAL_DISEASE_LABELS: Readonly<Record<DiseaseField, string>> = {
  ich: 'points blancs',
  finRot: 'pourriture des nageoires',
  velvet: 'velours',
  fungus: 'champignons',
  dropsy: 'hydropisie',
};

/**
 * Alertes du tableau de bord écrites au journal quand elles apparaissent ou s'aggravent
 * (#592). Les alertes de maladie, de traitement et de santé générale n'y sont pas : le journal
 * note déjà la maladie déclarée et le geste de soin.
 */
export const JOURNAL_ALERT_LABELS = {
  chlorine: 'chlore dans l’eau',
  ammonia: 'ammoniaque',
  nitrite: 'nitrites',
  nitrate: 'nitrates',
  temperature: 'température',
  ph: 'pH',
  carbon: 'charbon actif pendant un traitement',
  hunger: 'faim',
  feeder: 'distributeur vide',
  mix: 'mélange déconseillé',
  algae: 'algues',
} as const satisfies Partial<Record<AlertId, string>>;

export type JournalAlertId = keyof typeof JOURNAL_ALERT_LABELS;

/** Ce que le journal lit d'une alerte du tableau de bord. */
export interface JournalAlert {
  readonly id: AlertId;
  readonly severity: AlertSeverity;
}

/** Journal vide. */
export function createJournal(): Journal {
  return { entries: [], version: 0 };
}

/**
 * Ajoute `entry` à sa place chronologique, après les entrées de même temps (l'ordre d'ajout
 * départage), puis retire les plus anciennes au-delà de `JOURNAL_CAPACITY`. Une entrée
 * invalide (temps négatif ou non fini, sorte inconnue) est ignorée : renvoie `false`.
 */
export function addJournalEntry(journal: Journal, entry: JournalEntry): boolean {
  if (!isEntry(entry)) {
    return false;
  }
  const { entries } = journal;
  let at = entries.length;
  while (at > 0 && entries[at - 1]!.time > entry.time) {
    at--;
  }
  entries.splice(at, 0, { ...entry });
  if (entries.length > JOURNAL_CAPACITY) {
    entries.splice(0, entries.length - JOURNAL_CAPACITY);
  }
  journal.version++;
  return true;
}

/** Entrée « changement d'eau » au temps `time`. */
export function waterChangeEntry(time: number): JournalEntry {
  return { time, kind: 'changementEau' };
}

/** Entrée « traitement » : un geste de soin `kind` accepté au temps `time`. */
export function treatmentEntry(time: number, kind: TreatmentKind): JournalEntry {
  return { time, kind: 'traitement', detail: kind };
}

/** Entrée « séance d'entretien terminée » (#655) au temps `time`. */
export function careSessionEntry(time: number): JournalEntry {
  return { time, kind: 'seance' };
}

/** Entrée « eau neuve versée » pendant une séance (#655) au temps `time`. */
export function freshWaterEntry(time: number): JournalEntry {
  return { time, kind: 'eauNeuve' };
}

/**
 * Note une coupe de plante (#655) au temps `time` : si la dernière entrée du journal est
 * déjà une taille du même jour simulé, elle compte une coupe de plus (au plus `MAX_COUNT`) au
 * lieu d'ajouter une ligne, pour qu'une séance de vingt coups de sécateur ne chasse pas les
 * autres événements. Renvoie `false` pour un temps invalide.
 */
export function addPruneEntry(journal: Journal, time: number): boolean {
  const { entries } = journal;
  const last = entries[entries.length - 1];
  if (
    last !== undefined &&
    last.kind === 'taille' &&
    Number.isFinite(time) &&
    time >= last.time &&
    journalDay(time) === journalDay(last.time)
  ) {
    entries[entries.length - 1] = {
      ...last,
      count: Math.min(MAX_COUNT, (last.count ?? 1) + 1),
    };
    journal.version++;
    return true;
  }
  return addJournalEntry(journal, { time, kind: 'taille', count: 1 });
}

/**
 * Ce que le journal sait du bac à la dernière observation : maladies portées par animal
 * (masque de bits dans l'ordre de `DISEASES`), animaux connus et œufs présents par espèce.
 */
export interface JournalWatch {
  readonly diseases: Map<number, number>;
  eggs: Map<SpeciesId, number>;
  /** Alertes suivies présentes, avec leur gravité (#592). */
  alerts: Map<JournalAlertId, AlertSeverity>;
  /**
   * Temps de la dernière entrée écrite pour chaque alerte et gravité (#599), clé
   * `alerte:gravité` : retient les retours trop rapprochés (`JOURNAL_ALERT_REPEAT_SECONDS`).
   */
  readonly alertNoted: Map<string, number>;
}

/** Ce qu'`observeJournal` lit du monde. */
export interface JournalSubject {
  readonly time: number;
  readonly entities: readonly Fish[];
  readonly eggs?: readonly Egg[];
  /** Alertes du tableau de bord du bac (#592) ; absentes : aucune. */
  readonly alerts?: readonly JournalAlert[];
}

/**
 * Premier regard sur un bac (chargement, changement de bac) : retient son état sans rien
 * écrire, pour que seul ce qui change ensuite entre au journal.
 */
export function watchJournal(world: JournalSubject): JournalWatch {
  const diseases = new Map<number, number>();
  for (const fish of world.entities) {
    diseases.set(fish.id, diseaseMask(fish));
  }
  return {
    diseases,
    eggs: eggCounts(world.eggs),
    alerts: alertLevels(world.alerts),
    alertNoted: new Map(),
  };
}

/**
 * Compare le bac à la dernière observation et renvoie les événements survenus, au temps
 * courant du monde (`watch` mis à jour) : maladie déclarée ou guérie (animal toujours présent),
 * ponte (œufs d'une espèce en hausse), éclosion (alevins nouveaux d'une espèce qui pond) ou
 * naissance (alevins nouveaux d'une espèce vivipare, sans œuf, #655). Un animal apparu adulte
 * (ajout au panneau, transfert) est retenu sans événement, sauf s'il arrive malade. Une
 * alerte suivie (`JOURNAL_ALERT_LABELS`) qui apparaît, ou passe d'« attention » à
 * « critique », est notée avec sa gravité (#592) ; une alerte qui s'apaise ou disparaît
 * n'écrit rien, et une alerte revenue moins de `JOURNAL_ALERT_REPEAT_SECONDS` après sa dernière
 * entrée de même gravité n'est pas renotée (#599). Ordre stable : maladies dans l'ordre de
 * `DISEASES`, puis pontes, puis éclosions et naissances, puis alertes dans l'ordre de `JOURNAL_ALERT_LABELS`.
 */
export function observeJournal(watch: JournalWatch, world: JournalSubject): JournalEntry[] {
  const time = world.time;
  const changes = observeDiseases(watch, world.entities);
  const events: JournalEntry[] = [];
  pushDiseaseEvents(events, time, changes);
  pushLayingEvents(events, time, watch, world.eggs);
  pushHatchingEvents(events, time, changes.hatched);
  pushAlertEvents(events, time, watch, world.alerts);
  return events;
}

/** Maladies déclarées et guéries (par rang de `DISEASES`), alevins nouveaux par espèce. */
interface DiseaseChanges {
  readonly caught: number[];
  readonly cured: number[];
  readonly hatched: Map<SpeciesId, number>;
}

/** Compte les changements de santé et les alevins nouveaux ; met à jour `watch.diseases`. */
function observeDiseases(watch: JournalWatch, entities: readonly Fish[]): DiseaseChanges {
  const changes: DiseaseChanges = {
    caught: new Array<number>(DISEASES.length).fill(0),
    cured: new Array<number>(DISEASES.length).fill(0),
    hatched: new Map<SpeciesId, number>(),
  };
  const present = new Set<number>();
  for (const fish of entities) {
    present.add(fish.id);
    const mask = diseaseMask(fish);
    const before = watch.diseases.get(fish.id);
    if (before === undefined && isFry(fish)) {
      changes.hatched.set(fish.species, (changes.hatched.get(fish.species) ?? 0) + 1);
    }
    countDiseaseChanges(changes, mask, before);
    watch.diseases.set(fish.id, mask);
  }
  for (const id of [...watch.diseases.keys()]) {
    if (!present.has(id)) {
      watch.diseases.delete(id);
    }
  }
  return changes;
}

/**
 * Ajoute à `changes` les maladies déclarées (bit présent, absent avant ou animal nouveau) et
 * guéries (bit absent, présent avant ; jamais pour un animal nouveau) d'un animal.
 */
function countDiseaseChanges(
  changes: DiseaseChanges,
  mask: number,
  before: number | undefined,
): void {
  const known = before ?? 0;
  for (let d = 0; d < DISEASES.length; d++) {
    const bit = 1 << d;
    if ((mask & bit) !== 0 && (known & bit) === 0) {
      changes.caught[d]!++;
    } else if (before !== undefined && (mask & bit) === 0 && (known & bit) !== 0) {
      changes.cured[d]!++;
    }
  }
}

function pushDiseaseEvents(events: JournalEntry[], time: number, changes: DiseaseChanges): void {
  const { caught, cured } = changes;
  for (let d = 0; d < DISEASES.length; d++) {
    const detail = DISEASES[d]!.field;
    if (caught[d]! > 0) {
      events.push({ time, kind: 'maladie', detail, count: caught[d]! });
    }
    if (cured[d]! > 0) {
      events.push({ time, kind: 'guerison', detail, count: cured[d]! });
    }
  }
}

/** Pontes : œufs d'une espèce en hausse ; met à jour `watch.eggs`. */
function pushLayingEvents(
  events: JournalEntry[],
  time: number,
  watch: JournalWatch,
  worldEggs: readonly Egg[] | undefined,
): void {
  const eggs = eggCounts(worldEggs);
  for (const [species, count] of eggs) {
    const laid = count - (watch.eggs.get(species) ?? 0);
    if (laid > 0) {
      events.push({ time, kind: 'ponte', detail: species, count: laid });
    }
  }
  watch.eggs = eggs;
}

/** Éclosions (espèce qui pond) et naissances (espèce vivipare), par espèce. */
function pushHatchingEvents(
  events: JournalEntry[],
  time: number,
  hatched: ReadonlyMap<SpeciesId, number>,
): void {
  for (const [species, count] of hatched) {
    const kind = hasFry(species) && !laysEggs(species) ? 'naissance' : 'eclosion';
    events.push({ time, kind, detail: species, count });
  }
}

/** Alertes apparues ou aggravées, hors retours trop rapprochés ; met à jour `watch.alerts`. */
function pushAlertEvents(
  events: JournalEntry[],
  time: number,
  watch: JournalWatch,
  worldAlerts: readonly JournalAlert[] | undefined,
): void {
  const alerts = alertLevels(worldAlerts);
  for (const [id, severity] of alerts) {
    const before = watch.alerts.get(id);
    if (before === undefined || (before === 'attention' && severity === 'critique')) {
      const key = `${id}:${severity}`;
      if (alertDue(watch.alertNoted.get(key), time)) {
        events.push({ time, kind: 'alerte', detail: id, severity });
        watch.alertNoted.set(key, time);
      }
    }
  }
  watch.alerts = alerts;
}

/**
 * Vrai si une alerte notée pour la dernière fois à `noted` peut l'être de nouveau à `time` :
 * jamais notée, temps revenu en arrière (bac rechargé) ou délai de répétition écoulé.
 */
function alertDue(noted: number | undefined, time: number): boolean {
  return noted === undefined || time < noted || time - noted >= JOURNAL_ALERT_REPEAT_SECONDS;
}

/**
 * Reporte la dernière observation d'un bac sur le nouvel objet monde de ce bac (#592) : un
 * bac rangé avance hors de l'écran par copie (`stepRoom`, transfert). Sans ce report, le
 * retour sur le bac repartirait d'un premier regard muet et ce qui s'y est passé entre-temps
 * ne serait jamais noté ; avec lui, la première observation au retour l'écrit (au temps du
 * retour). Un bac jamais observé (premier affichage) reste sans observation. `pairs` donne,
 * pour chaque bac, son ancien et son nouveau monde.
 */
export function carryJournalWatches<T extends object>(
  watches: WeakMap<T, JournalWatch>,
  pairs: Iterable<readonly [T, T]>,
): void {
  for (const [before, after] of pairs) {
    const watch = watches.get(before);
    if (watch !== undefined && before !== after) {
      watches.set(after, watch);
      watches.delete(before);
    }
  }
}

/**
 * Paires (ancien monde, nouveau monde) pour `carryJournalWatches`, appariées par identifiant
 * de bac (#599) et non par rang : un bac absent de l'une des listes n'a pas de paire (sa
 * veille n'est pas reportée, le bac repart d'un premier regard muet).
 */
export function tankWorldPairs<T>(
  before: readonly { readonly id: number; readonly world: T }[],
  after: readonly { readonly id: number; readonly world: T }[],
): (readonly [T, T])[] {
  const next = new Map(after.map((tank) => [tank.id, tank.world] as const));
  const pairs: (readonly [T, T])[] = [];
  for (const tank of before) {
    if (next.has(tank.id)) {
      pairs.push([tank.world, next.get(tank.id)!] as const);
    }
  }
  return pairs;
}

/** Lignes de l'interface, de la plus récente à la plus ancienne. */
export function journalLines(journal: Journal): JournalLine[] {
  const lines: JournalLine[] = [];
  for (let i = journal.entries.length - 1; i >= 0; i--) {
    const entry = journal.entries[i]!;
    lines.push({
      kind: entry.kind,
      group: JOURNAL_KIND_GROUPS[entry.kind],
      day: journalDay(entry.time),
      text: journalText(entry),
    });
  }
  return lines;
}

/**
 * Lignes gardées par le filtre `filter` (#655), dans leur ordre : toutes pour `tout`, sinon
 * celles de la famille choisie (liste vide si aucune ne correspond). Un filtre inconnu ne
 * masque rien.
 */
export function filterJournalLines(
  lines: readonly JournalLine[],
  filter: JournalFilter,
): readonly JournalLine[] {
  if (filter === 'tout' || !(JOURNAL_FILTERS as readonly string[]).includes(filter)) {
    return lines;
  }
  return lines.filter((line) => line.group === filter);
}

/** Jour simulé d'un temps (1 : le premier jour). */
export function journalDay(time: number): number {
  return Math.floor(time / DEFAULT_DAY_LENGTH_SECONDS) + 1;
}

/** Texte d'une entrée, en français. */
export function journalText(entry: JournalEntry): string {
  const count = entry.count ?? 1;
  const animals = `${count} ${count > 1 ? 'animaux' : 'animal'}`;
  switch (entry.kind) {
    case 'maladie':
      return `Maladie déclarée : ${diseaseLabel(entry.detail)} (${animals})`;
    case 'guerison':
      return `Guérison : ${diseaseLabel(entry.detail)} (${animals})`;
    case 'traitement':
      return `Traitement : ${treatmentLabel(entry.detail)}`;
    case 'ponte':
      return `Ponte : ${count} œuf${count > 1 ? 's' : ''} (${speciesLabel(entry.detail)})`;
    case 'eclosion':
      return `Éclosion : ${count} alevin${count > 1 ? 's' : ''} (${speciesLabel(entry.detail)})`;
    case 'naissance':
      return `Naissance : ${count} alevin${count > 1 ? 's' : ''} (${speciesLabel(entry.detail)})`;
    case 'seance':
      return 'Séance d’entretien terminée';
    case 'taille':
      return `Taille des plantes (${count} coupe${count > 1 ? 's' : ''})`;
    case 'eauNeuve':
      return 'Eau neuve versée';
    case 'changementEau':
      return 'Changement d’eau';
    case 'alerte':
      return `Alerte ${entry.severity === 'critique' ? 'critique' : 'attention'} : ${alertLabel(entry.detail)}`;
  }
}

/** Forme sauvegardée du journal (copie). */
export function savedJournal(journal: Journal): SavedJournal {
  return { version: JOURNAL_VERSION, entries: journal.entries.map((entry) => ({ ...entry })) };
}

/** Journal rempli à partir d'une forme sauvegardée (déjà validée par `readJournal`). */
export function restoreJournal(saved: SavedJournal): Journal {
  return { entries: saved.entries.map((entry) => ({ ...entry })), version: 0 };
}

/** Copie d'une forme sauvegardée (le monde et sa sauvegarde ne partagent rien). */
export function copySavedJournal(saved: SavedJournal): SavedJournal {
  return { version: saved.version, entries: saved.entries.map((entry) => ({ ...entry })) };
}

/** Valide le champ `journal` d'une sauvegarde ; invalide : `null` et un problème noté. */
export function readJournal(value: unknown, problems: string[]): SavedJournal | null {
  const record = value as Partial<Record<keyof SavedJournal, unknown>> | null;
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    problems.push('journal doit être un objet');
    return null;
  }
  if (record.version !== JOURNAL_VERSION) {
    problems.push(`journal.version doit valoir ${JOURNAL_VERSION}`);
    return null;
  }
  const { entries } = record;
  if (!Array.isArray(entries) || entries.length > JOURNAL_CAPACITY) {
    problems.push(`journal.entries doit être une liste d'au plus ${JOURNAL_CAPACITY} entrées`);
    return null;
  }
  const read: JournalEntry[] = [];
  for (const entry of entries) {
    const clean = readEntry(entry);
    if (clean === null || (read.length > 0 && read[read.length - 1]!.time > clean.time)) {
      problems.push('journal.entries doit lister des entrées valides, dans l’ordre chronologique');
      return null;
    }
    read.push(clean);
  }
  return { version: JOURNAL_VERSION, entries: read };
}

function readEntry(value: unknown): JournalEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const { time, kind, detail, count, severity } = value as Record<string, unknown>;
  const entry: JournalEntry = {
    time: time as number,
    kind: kind as JournalKind,
    ...(detail === undefined ? {} : { detail: detail as string }),
    ...(count === undefined ? {} : { count: count as number }),
    ...(severity === undefined ? {} : { severity: severity as AlertSeverity }),
  };
  return isEntry(entry) ? entry : null;
}

/** Vrai pour une entrée valide : temps, sorte, précision attendue et effectif borné. */
function isEntry(entry: JournalEntry): boolean {
  const { time, kind, count } = entry;
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
    return false;
  }
  if (!(JOURNAL_KINDS as readonly string[]).includes(kind)) {
    return false;
  }
  if (count !== undefined && (!Number.isSafeInteger(count) || count < 1 || count > MAX_COUNT)) {
    return false;
  }
  return ENTRY_RULES[kind](entry);
}

const isDiseaseDetail = (detail: unknown): boolean =>
  typeof detail === 'string' && Object.hasOwn(JOURNAL_DISEASE_LABELS, detail);

const isTreatmentDetail = (detail: unknown): boolean =>
  typeof detail === 'string' && (TREATMENT_KINDS as readonly string[]).includes(detail);

const isSpeciesDetail = (detail: unknown): boolean =>
  typeof detail === 'string' && Object.hasOwn(SPECIES, detail);

/** Règle propre à une sorte, sans gravité : la gravité est réservée aux alertes. */
const withoutSeverity =
  (rule: (entry: JournalEntry) => boolean) =>
  (entry: JournalEntry): boolean =>
    entry.severity === undefined && rule(entry);

/**
 * Précision et effectif attendus pour chaque sorte (temps, sorte et bornes de l'effectif déjà
 * vérifiés par `isEntry`).
 */
const ENTRY_RULES: Readonly<Record<JournalKind, (entry: JournalEntry) => boolean>> = {
  alerte: ({ count, detail, severity }) =>
    count === undefined &&
    typeof detail === 'string' &&
    Object.hasOwn(JOURNAL_ALERT_LABELS, detail) &&
    (severity === 'attention' || severity === 'critique'),
  maladie: withoutSeverity(({ detail }) => isDiseaseDetail(detail)),
  guerison: withoutSeverity(({ detail }) => isDiseaseDetail(detail)),
  traitement: withoutSeverity(({ detail }) => isTreatmentDetail(detail)),
  ponte: withoutSeverity(({ detail }) => isSpeciesDetail(detail)),
  eclosion: withoutSeverity(({ detail }) => isSpeciesDetail(detail)),
  naissance: withoutSeverity(({ detail }) => isSpeciesDetail(detail)),
  changementEau: withoutSeverity(({ detail }) => detail === undefined),
  taille: withoutSeverity(({ detail }) => detail === undefined),
  seance: withoutSeverity(({ detail, count }) => detail === undefined && count === undefined),
  eauNeuve: withoutSeverity(({ detail, count }) => detail === undefined && count === undefined),
};

function alertLevels(
  alerts: readonly JournalAlert[] | undefined,
): Map<JournalAlertId, AlertSeverity> {
  const levels = new Map<JournalAlertId, AlertSeverity>();
  for (const id of Object.keys(JOURNAL_ALERT_LABELS) as JournalAlertId[]) {
    const alert = alerts?.find((a) => a.id === id);
    if (alert !== undefined) {
      levels.set(id, alert.severity);
    }
  }
  return levels;
}

function alertLabel(detail: string | undefined): string {
  return JOURNAL_ALERT_LABELS[detail as JournalAlertId] ?? 'alerte';
}

function diseaseMask(fish: Fish): number {
  let mask = 0;
  for (let d = 0; d < DISEASES.length; d++) {
    if (fish[DISEASES[d]!.field] !== undefined) {
      mask |= 1 << d;
    }
  }
  return mask;
}

function eggCounts(eggs: readonly Egg[] | undefined): Map<SpeciesId, number> {
  const counts = new Map<SpeciesId, number>();
  for (const egg of eggs ?? []) {
    counts.set(egg.species, (counts.get(egg.species) ?? 0) + 1);
  }
  return counts;
}

function diseaseLabel(detail: string | undefined): string {
  return JOURNAL_DISEASE_LABELS[detail as DiseaseField] ?? 'maladie';
}

function treatmentLabel(detail: string | undefined): string {
  return TREATMENTS[detail as TreatmentKind]?.label ?? 'soin';
}

function speciesLabel(detail: string | undefined): string {
  return SPECIES[detail as SpeciesId]?.name ?? 'espèce inconnue';
}
