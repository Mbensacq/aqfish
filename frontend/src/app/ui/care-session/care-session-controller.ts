import { signal, type WritableSignal } from '@angular/core';

import { careStepSound, type CareSoundKind } from '../../core/care-sound/care-sound';
import type { SaveStorage } from '../../core/save-storage/save-storage';
import {
  comparisonFileName,
  photoScale,
  sideBySidePhotos,
  upscalePhoto,
  type PhotoImage,
  type PhotoPixels,
} from '../../render/photo-capture';
import type { StrokePoint } from '../../render/aquarium-view';
import type { ScraperRay } from '../../sim/algae';
import { isDecorMode } from '../../sim/care-mode';
import {
  careSessionCompared,
  careSessionFinished,
  careSessionPruned,
  careStepTask,
  completeCareStep,
  readCareSession,
  serializeCareSession,
  skipAbsentCareSteps,
  skipCareStep,
  startCareSession,
  withCut,
  withPoured,
  withRinse,
  withSiphoned,
  type CareSession,
  type CareSessionStep,
} from '../../sim/care-session';
import { environmentWater } from '../../sim/environment';
import type { FilterRinseWater } from '../../sim/filter-rinse';
import {
  addJournalEntry,
  addPruneEntry,
  careSessionEntry,
  freshWaterEntry,
  type Journal,
} from '../../sim/journal';
import type { MaintenanceTask } from '../../sim/maintenance';
import { hasWaterToSiphon, pouredShare, siphonedShare } from '../../sim/siphon';
import { waterLiters } from '../../sim/water';
import { markWaterChange, type WaterHistory } from '../../sim/water-history';
import {
  cutWorldPlantInPlace,
  refillWorldWaterInPlace,
  rinseWorldFilterInPlace,
  scrapeWorldAlgaeAlongInPlace,
  siphonWorldInPlace,
  worldHasCuttablePlants,
  worldHasPrunablePlants,
} from '../../sim/world';
import type { MutableWorld, World } from '../../sim/world-types';
import { parseHex, type Rgb } from '../dashboard-frame/contrast';
import { DASHBOARD_COLORS } from '../dashboard-frame/dashboard-frame';

/** Avant / après du bilan d'une séance (#624) : images PNG en URL `data:`. */
export interface CareComparison {
  readonly before: string;
  readonly after: string;
}

/** Écart entre l'avant et l'après de la photo enregistrée (#624), en pixels de scène. */
const COMPARISON_GAP = 2;

/**
 * Fond de cet écart (#624) : celui de l'interface, lu dans `DASHBOARD_COLORS.background` pour
 * suivre un changement de palette (#646).
 */
export const COMPARISON_BACKGROUND: Rgb = parseHex(DASHBOARD_COLORS.background);

/** Clé de la séance d'entretien interrompue (#604), distincte de la sauvegarde du monde. */
export const CARE_SESSION_STORAGE_KEY = 'aqfish.seance-entretien';

/** Ce que la séance demande à la vue 3D : relevé de l'image, rayons, passage du geste. */
export interface CareSessionView {
  /** Relevé du bac à la résolution de la scène ; `null` si la vue ne sait pas le relire. */
  takePhoto(): PhotoPixels | null;
  /** Rayon de la caméra sous un point du client (pixels CSS), `null` hors du canvas. */
  pickRay(clientX: number, clientY: number): ScraperRay | null;
  /** Autorise le geste glissé de la séance (#604) au lieu de la rotation de la caméra. */
  setStrokeEnabled(enabled: boolean): void;
}

/** Outils en main de l'hôte, partagés avec l'entretien hors séance (#476, #477). */
export interface CareSessionTools {
  scraping(): boolean;
  toggleScraper(): void;
  pruning(): boolean;
  togglePruner(): void;
}

/** Photo de l'hôte (#479, #503) : encodage, téléchargement et message d'échec. */
export interface CareSessionPhoto {
  /** Image PNG (URL `data:`) d'un relevé à la résolution de la scène, `null` en cas d'échec. */
  dataUrl(pixels: PhotoPixels): string | null;
  /** Télécharge `image` en PNG sous `name` ; `false` si elle ne peut pas être produite. */
  download(image: PhotoImage, name: string): boolean;
  /** Affiche le message bref d'échec de la photo. */
  failed(): void;
  /** Efface le message bref de la photo. */
  clearNotice(): void;
}

/**
 * Ports de la séance (#694, ADR 0154) : ce que l'hôte lui prête, sans que le contrôleur
 * connaisse l'hôte. Les fonctions sont relues à chaque appel (monde et vue changent).
 */
export interface CareSessionPorts {
  /** Monde affiché, `null` avant le démarrage. */
  world(): MutableWorld | null;
  /** Vue 3D, `null` avant le démarrage. */
  view(): CareSessionView | null;
  /** Vrai en mode capture : aucune séance. */
  isCapture(): boolean;
  /** Stockage de la séance interrompue, `null` sans stockage. */
  storage(): SaveStorage | null;
  /** Réglage du monde par l'utilisateur, suivi du relevé de l'eau et de l'enregistrement. */
  applyWaterSetting(apply: (world: MutableWorld) => void): void;
  /** Tâche faite au calendrier d'entretien (#513). */
  recordMaintenance(world: MutableWorld, task: MaintenanceTask): void;
  /** Journal du bac (#581, #655). */
  journalOf(world: World): Journal;
  /** Historique de l'eau du bac (#511). */
  waterHistoryOf(world: World): WaterHistory;
  /** Bruitage de la séance (#625). */
  playSound(kind: CareSoundKind): void;
  /** Étape publiée pour les tests et les captures (`data-aqfish-care-session`). */
  publishStep(step: CareSessionStep | null): void;
  /** Granulés publiés après un passage du siphon. */
  publishFood(world: World | null): void;
  /** Relevé de l'eau après une raclette. */
  refreshWater(): void;
  /** Enregistrement immédiat du monde. */
  saveNow(): void;
  /** Image suivante demandée. */
  scheduleFrame(): void;
  readonly tools: CareSessionTools;
  readonly photo: CareSessionPhoto;
}

/** Vrai à une étape de séance qui se fait d'un geste glissé (vitres, siphon). */
function strokeStep(session: CareSession | null): boolean {
  return session?.step === 'vitres' || session?.step === 'siphon';
}

/**
 * Séance d'entretien guidée (#604, ADR 0138) et ses étapes : raclette (#604), siphon et eau
 * neuve (#605), rinçage du filtre (#606), taille (#623), avant / après (#624), bruitages
 * (#625), journal (#655). Extrait de l'hôte de l'aquarium (#694, ADR 0154) : il tient l'état
 * affiché de la séance et passe par ses ports pour tout le reste.
 */
export class CareSessionController {
  /** Séance affichée (#604), `null` hors séance. */
  readonly session = signal<CareSession | null>(null);
  /** Conditionneur versé dans le seau à l'étape « eau neuve » (#605). */
  readonly conditioner = signal(true);
  /** Écart de température du seau avec le bac à l'étape « eau neuve », en °C (#605). */
  readonly bucketGap = signal(0);
  /** Efficacité du filtre du bac (0 à 1), pour la consigne de l'étape « filtre » (#606). */
  readonly filter = signal(1);
  /** Le bac a une plante à tailler (#623) : étape « taille » et sa ligne au bilan. */
  readonly prunable = signal(true);
  /** Une plante du bac a une pousse à couper (#644, `worldHasCuttablePlants`). */
  readonly cuttable = signal(true);
  /**
   * Avant / après du bilan (#624) : images PNG (URL `data:`) du bac au début de la séance et au
   * bilan, à la résolution de la scène ; `null` sans comparaison. Jamais enregistrées.
   */
  readonly comparison: WritableSignal<CareComparison | null> = signal(null);
  /** Relevé du bac au début de la séance (#624), gardé jusqu'au bilan ou à l'abandon. */
  private before: PhotoPixels | null = null;
  /** Relevé du bac au bilan (#624), pour la photo avant / après enregistrée. */
  private after: PhotoPixels | null = null;

  constructor(private readonly ports: CareSessionPorts) {}

  /**
   * Ouvre la séance, ou reprend celle qui avait été interrompue, à son étape. Sans effet en
   * capture, en mode décor ou avant le démarrage.
   */
  open(): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture() || isDecorMode(world)) {
      return;
    }
    const shown = this.session();
    if (shown) {
      // Déjà ouverte : rien ne change, l'image « avant » est gardée (#624).
      this.show(shown);
      return;
    }
    const resumed = readCareSession(this.readStored());
    // Avant / après (#624) : l'image « avant » n'est prise qu'au début d'une séance neuve ; une
    // séance reprise a perdu la sienne à l'interruption et n'aura pas de comparaison.
    this.releaseImages();
    if (!resumed) {
      this.before = this.readImage();
    }
    this.show(resumed ?? startCareSession());
  }

  /** Vrai tant que l'image « avant » de la séance est gardée en mémoire (#624). */
  hasBefore(): boolean {
    return this.before !== null;
  }

  /** Vrai pendant l'étape « siphon » (#605) : un clic ne nourrit pas. */
  isSiphoning(): boolean {
    return this.session()?.step === 'siphon';
  }

  /** Vrai pendant l'étape « taille » (#623) : un clic sur une plante la coupe. */
  isCutting(): boolean {
    return this.session()?.step === 'taille';
  }

  /** Vrai si l'étape affichée se fait d'un geste glissé (vitres, siphon). */
  strokeEnabled(): boolean {
    return strokeStep(this.session());
  }

  /** Relevés du bac pour les consignes (#606, #623, #644), à chaque relevé de l'eau. */
  refreshReadouts(world: World): void {
    this.filter.set(world.water.filter);
    this.prunable.set(worldHasPrunablePlants(world));
    this.cuttable.set(worldHasCuttablePlants(world));
  }

  /**
   * Enregistre la photo avant / après du bilan (#624) : les deux images côte à côte, agrandies
   * par un entier sans lissage comme la photo. Renvoie `true` si elle a été produite.
   */
  saveComparison(): boolean {
    const before = this.before;
    const after = this.after;
    if (!before || !after || !this.comparison()) {
      return false;
    }
    this.ports.photo.clearNotice();
    try {
      const pair = sideBySidePhotos(before, after, COMPARISON_GAP, COMPARISON_BACKGROUND);
      const image = upscalePhoto(pair, photoScale(pair.width, pair.height));
      return this.ports.photo.download(image, comparisonFileName(new Date()));
    } catch {
      this.ports.photo.failed();
      return false;
    }
  }

  /** Termine l'étape affichée : sa tâche entre au calendrier d'entretien (#604). */
  completeStep(): void {
    const session = this.session();
    if (!session) {
      return;
    }
    if (session.step === 'filtre' && session.rinse === undefined) {
      return;
    }
    this.applyStep(session);
    // Clic de fin d'étape (#625) : seulement pour une étape vraiment terminée (pas au bilan).
    const click = careStepSound(session.step, 'fait', !careSessionFinished(session));
    if (click) {
      this.ports.playSound(click);
    }
    this.show(completeCareStep(session));
  }

  /**
   * Coupe de l'étape « taille » (#623) : taille la plante d'indice `index` du décor, la partie
   * coupée charge un peu l'eau (`cutWorldPlantInPlace`) ; compte la coupe dans la séance. Le
   * calendrier n'est mis à jour qu'à « Étape terminée ». Renvoie vrai si une partie a été coupée.
   */
  cutPlant(index: number): boolean {
    const session = this.session();
    if (session?.step !== 'taille') {
      return false;
    }
    let cut = false;
    this.ports.applyWaterSetting((world) => {
      cut = cutWorldPlantInPlace(world, index);
      if (cut) {
        // Journal (#655) : une ligne de taille par jour, qui compte les coupes.
        addPruneEntry(this.ports.journalOf(world), world.time);
      }
    });
    if (cut) {
      this.show(withCut(session));
    }
    return cut;
  }

  /** Choix de l'eau de rinçage de l'éponge (#606) : appliqué quand l'étape est terminée. */
  chooseRinse(rinse: FilterRinseWater): void {
    const session = this.session();
    if (session?.step === 'filtre') {
      this.show(withRinse(session, rinse));
    }
  }

  /** Un seau d'eau neuve de plus (#605), jusqu'à remplacer l'eau retirée au siphon. */
  pourBucket(): void {
    const session = this.session();
    if (session?.step === 'eau') {
      const poured = withPoured(session, pouredShare(session.poured ?? 0, session.siphoned ?? 0));
      if ((poured.poured ?? 0) > (session.poured ?? 0)) {
        this.ports.playSound('seau');
      }
      this.show(poured);
    }
  }

  /** Saute l'étape affichée (#604) : rien n'est enregistré au calendrier. */
  skipStep(): void {
    const session = this.session();
    if (session) {
      this.show(skipCareStep(session));
    }
  }

  /**
   * Ferme la séance (#604) : interrompue, elle reprendra à la même étape ; finie (bilan),
   * elle est oubliée.
   */
  close(): void {
    const session = this.session();
    if (session && careSessionFinished(session)) {
      this.writeStored(null);
    }
    // Avant / après (#624) : libérées à la fin comme à l'abandon.
    this.releaseImages();
    this.session.set(null);
    this.applyTool(null);
  }

  /** Geste de la séance (#604, #605) : raclette aux vitres, tuyau au siphon. */
  stroke(points: readonly StrokePoint[]): void {
    if (this.session()?.step === 'siphon') {
      this.siphonStroke(points);
    } else if (this.scrapeStroke(points)) {
      // Raclette sur la vitre (#625) : seulement quand une plaque a été retirée.
      this.ports.playSound('raclette');
    }
  }

  /** Effet sur le monde de l'étape terminée `session.step` (calendrier, eau, filtre). */
  private applyStep(session: CareSession): void {
    if (session.step === 'eau') {
      this.refill(session.poured ?? 0);
    } else if (session.step === 'filtre') {
      if (session.rinse !== undefined) {
        this.rinse(session.rinse);
      }
    } else if (session.step === 'taille') {
      // Taille (#623) : au calendrier seulement si une coupe a été faite.
      if (careSessionPruned(session)) {
        this.ports.applyWaterSetting((world) => this.ports.recordMaintenance(world, 'prune'));
      }
    } else {
      const task = careStepTask(session.step);
      if (task) {
        this.ports.applyWaterSetting((world) => this.ports.recordMaintenance(world, task));
      }
    }
  }

  /** Relevé du bac pour l'avant / après (#624), `null` si la vue ne sait pas le relire. */
  private readImage(): PhotoPixels | null {
    try {
      return this.ports.view()?.takePhoto() ?? null;
    } catch {
      return null;
    }
  }

  /** Oublie les images de l'avant / après (#624). */
  private releaseImages(): void {
    this.before = null;
    this.after = null;
    this.comparison.set(null);
  }

  /**
   * Bilan atteint (#624) : relève l'image « après » et prépare la comparaison s'il y a eu au
   * moins une étape faite et une image « avant » ; sinon, libère l'image « avant ».
   */
  private compare(session: CareSession): void {
    const before = this.before;
    if (!before || !careSessionCompared(session)) {
      this.releaseImages();
      return;
    }
    const after = this.readImage();
    const urls = after ? [this.ports.photo.dataUrl(before), this.ports.photo.dataUrl(after)] : [];
    if (!after || urls.some((url) => url === null)) {
      this.releaseImages();
      return;
    }
    this.after = after;
    this.comparison.set({ before: urls[0]!, after: urls[1]! });
  }

  /**
   * Éponge rincée (#606) : dans l'eau du bac rien ne change, au robinet le chlore tue une part
   * des bactéries ; nettoyage du filtre au calendrier dans les deux cas.
   */
  private rinse(rinse: FilterRinseWater): void {
    this.ports.applyWaterSetting((world) => {
      rinseWorldFilterInPlace(world, rinse);
      this.ports.recordMaintenance(world, 'filter');
    });
  }

  /**
   * Eau neuve versée (#605) : la part `share` est remplacée par l'eau du seau (conditionneur,
   * écart de température choisis), puis calendrier et historique comme le bouton « Changer
   * l'eau » ; au journal, une ligne « eau neuve » (#655). Rien n'est versé : rien n'est
   * enregistré.
   */
  private refill(share: number): void {
    if (!(share > 0)) {
      return;
    }
    const conditioner = this.conditioner();
    const gap = this.bucketGap();
    this.ports.applyWaterSetting((world) => {
      refillWorldWaterInPlace(world, share, conditioner, world.water.temperature + gap);
      this.ports.recordMaintenance(world, 'waterChange');
      markWaterChange(this.ports.waterHistoryOf(world), world.water, world.tick);
      addJournalEntry(this.ports.journalOf(world), freshWaterEntry(world.time));
    });
  }

  private show(shown: CareSession): void {
    // Bac sans plante à tailler (#623) : l'étape « taille » est sautée d'office.
    const world = this.ports.world();
    const prunable = world ? worldHasPrunablePlants(world) : true;
    this.prunable.set(prunable);
    this.cuttable.set(world ? worldHasCuttablePlants(world) : true);
    const session = skipAbsentCareSteps(shown, prunable);
    if (careSessionFinished(session) && !this.comparison()) {
      this.compare(session);
    }
    if (this.reachesReview(session)) {
      // Séance menée jusqu'au bilan avec au moins une étape faite (#655) : une ligne au
      // journal, une seule fois.
      this.ports.applyWaterSetting((target) =>
        addJournalEntry(this.ports.journalOf(target), careSessionEntry(target.time)),
      );
    }
    this.session.set(session);
    this.writeStored(careSessionFinished(session) ? null : session);
    this.applyTool(session);
  }

  /** Vrai si `session` arrive au bilan maintenant, avec au moins une étape faite (#655). */
  private reachesReview(session: CareSession): boolean {
    const before = this.session();
    return (
      careSessionFinished(session) &&
      before !== null &&
      !careSessionFinished(before) &&
      Object.values(session.outcomes).includes('fait')
    );
  }

  /**
   * Raclette en main à l'étape « vitres », sécateur à l'étape « taille » (#623), passage
   * autorisé aux vitres et au siphon.
   */
  private applyTool(session: CareSession | null): void {
    const { tools } = this.ports;
    const glass = session?.step === 'vitres';
    if (glass !== tools.scraping()) {
      tools.toggleScraper();
    }
    const prune = session?.step === 'taille';
    if (prune !== tools.pruning()) {
      tools.togglePruner();
    }
    this.ports.view()?.setStrokeEnabled(strokeStep(session));
    if (session?.step === 'eau' && session.poured === undefined) {
      // Seau neuf : conditionneur versé, eau à la température du bac.
      this.conditioner.set(true);
      this.bucketGap.set(0);
    }
    this.ports.publishStep(session?.step ?? null);
  }

  /** Rayons de la caméra sous les points d'un événement du geste. */
  private raysUnder(view: CareSessionView, points: readonly StrokePoint[]): ScraperRay[] {
    const rays: ScraperRay[] = [];
    for (const point of points) {
      const ray = view.pickRay(point.x, point.y);
      if (ray) {
        rays.push(ray);
      }
    }
    return rays;
  }

  /**
   * Passage de raclette (#604) : retire les plaques sous les points d'un événement du geste
   * (un seul appel à `scrapeWorldAlgaeAlongInPlace`, #617), enregistre s'il y en a.
   */
  private scrapeStroke(points: readonly StrokePoint[]): boolean {
    const world = this.ports.world();
    const view = this.ports.view();
    if (!world || !view || this.ports.isCapture()) {
      return false;
    }
    const rays = this.raysUnder(view, points);
    if (rays.length > 0 && scrapeWorldAlgaeAlongInPlace(world, rays).length > 0) {
      this.ports.refreshWater();
      this.ports.saveNow();
      this.ports.scheduleFrame();
      return true;
    }
    return false;
  }

  /**
   * Passage du siphon (#605) : aspire les granulés posés sous les points et compte l'eau
   * retirée dans la séance (jauge), sans toucher à l'eau du bac avant l'eau neuve.
   */
  private siphonStroke(points: readonly StrokePoint[]): void {
    const world = this.ports.world();
    const view = this.ports.view();
    const session = this.session();
    if (!world || !view || this.ports.isCapture() || session?.step !== 'siphon') {
      return;
    }
    const pass = siphonWorldInPlace(world, this.raysUnder(view, points));
    if (pass.points === 0) {
      return;
    }
    // Eau qui coule dans le siphon (#625).
    this.ports.playSound('siphon');
    const hasWater = hasWaterToSiphon(waterLiters(environmentWater(world)));
    this.show(withSiphoned(session, siphonedShare(session.siphoned ?? 0, pass.points, hasWater)));
    if (pass.food > 0) {
      this.ports.publishFood(this.ports.world());
      this.ports.saveNow();
      this.ports.scheduleFrame();
    }
  }

  private readStored(): string | null {
    try {
      return this.ports.storage()?.getItem(CARE_SESSION_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private writeStored(session: CareSession | null): void {
    try {
      // Séance finie : texte vide, relu comme « aucune séance » (`readCareSession`).
      this.ports
        .storage()
        ?.setItem(CARE_SESSION_STORAGE_KEY, session ? serializeCareSession(session) : '');
    } catch {
      // Stockage plein ou refusé : la séance reste affichée, sans reprise.
    }
  }
}
