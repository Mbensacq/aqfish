import { signal } from '@angular/core';

import {
  readStoredSave,
  type SaveMessage,
  type SaveStatus,
  type SaveStorage,
  writeStoredSave,
} from '../../core/save-storage/save-storage';
import { environmentById } from '../../sim/environment';
import { parseSaveWorlds } from '../../sim/room-save';
import type { RoomState } from '../../sim/room-state';
import type { SaveSettings } from '../../sim/save';
import {
  createShare,
  hasShareFragment,
  readShare,
  sharedAnimalCount,
  type ParseShareResult,
} from '../../sim/share-link';
import type { World } from '../../sim/world-types';

/** Intervalle de la sauvegarde automatique, en millisecondes (#70). */
export const AUTOSAVE_INTERVAL_MS = 10_000;

/** Nom proposé pour le fichier exporté (#70). */
export const SAVE_FILE_NAME = 'aqfish-sauvegarde.json';

/** Sauvegarde relue au démarrage (#70) ou choisie par le fond d'écran (#279). */
export interface RestoredSave {
  readonly room: RoomState;
  readonly selectedTankId: number;
  readonly world: World;
  readonly settings: SaveSettings;
  readonly others: readonly World[];
}

/** Sauvegarde relue et validée (import, lien partagé), prête à remplacer la pièce. */
export type ImportedSave = Extract<ParseShareResult, { ok: true }>;

/** Aquarium reçu par un lien partagé (#426) : proposition d'import, ou refus lisible. */
export type ShareOffer =
  | {
      readonly kind: 'offre';
      /** Nom de l'environnement du bac reçu. */
      readonly environment: string;
      /** Nombre d'animaux du bac reçu. */
      readonly animals: number;
      /** Nombre de bacs de la pièce actuelle, remplacée si l'import est accepté. */
      readonly tanks: number;
    }
  | { readonly kind: 'erreur'; readonly text: string };

/** Délai au-delà duquel la copie dans le presse-papiers est tenue pour refusée (#426). */
const CLIPBOARD_TIMEOUT_MS = 1500;

/** Copie `text` dans le presse-papiers ; `false` si refusé, absent ou sans réponse. Ne lève jamais. */
async function copyText(win: Window, text: string): Promise<boolean> {
  const clipboard = win.navigator.clipboard as Clipboard | undefined;
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    return false;
  }
  let timer = 0;
  const timeout = new Promise<boolean>((resolve) => {
    timer = win.setTimeout(() => resolve(false), CLIPBOARD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([clipboard.writeText(text).then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    win.clearTimeout(timer);
  }
}

/** Adresse de la page sans requête ni fragment : base d'un lien partagé (#426). */
export function shareBase(href: string): string {
  return href.split('#')[0]!.split('?')[0]!;
}

/** Ce dont la sauvegarde et le partage ont besoin de l'hôte (#696). */
export interface SaveSharePorts {
  /** Document de la page : fenêtre, lien de téléchargement, visibilité. */
  readonly document: Document;
  /** Stockage de la sauvegarde automatique, `null` s'il est inaccessible. */
  readonly storage: SaveStorage | null;
  /** Monde affiché, `null` avant le démarrage. */
  world(): World | null;
  /** Vrai si la vue est créée (import possible). */
  hasView(): boolean;
  /** Mode capture : ni lecture ni écriture du stockage, aucun partage. */
  isCapture(): boolean;
  /** Vrai après la destruction de l'hôte : un lien relu tard n'est plus proposé. */
  isStopped(): boolean;
  /** Réglages enregistrés avec le monde (vitesse, horloge, granulés, pièce). */
  settings(): SaveSettings;
  /**
   * Texte de la sauvegarde au schéma 2 (pièce resynchronisée avec le monde affiché).
   * @throws RangeError comme `serializeRoom`.
   */
  saveText(world: World): string;
  /** Range dans le monde ce que l'hôte garde à part, avant un export. */
  beforeExport(world: World): void;
  /** Range dans le monde ce que l'hôte garde à part, avant une sauvegarde automatique. */
  beforeAutosave(): void;
  /** Remplace la pièce par une sauvegarde relue et validée, et recrée la vue. */
  load(result: ImportedSave): void;
  /** Nombre de bacs de la pièce actuelle (proposition d'un lien reçu). */
  tankCount(): number;
  /** Expose l'état de la sauvegarde (`data-aqfish-save`). */
  publishSave(status: SaveStatus | null): void;
  /** Ajoute un désabonnement à faire à la destruction de l'hôte. */
  onCleanup(cleanup: () => void): void;
}

/**
 * Sauvegarde automatique, export, import et partage par lien de l'aquarium (#70, #426,
 * ADR 0105). Sorti de l'hôte au lot 10 de l'assainissement (#696), sans changement de
 * comportement : l'hôte garde la pièce et le monde, ce contrôleur les écrit et les relit.
 */
export class SaveShareController {
  /**
   * État de la sauvegarde automatique (#70) : `null` en mode capture (jamais de lecture ni
   * d'écriture du stockage) et avant le démarrage.
   */
  readonly status = signal<SaveStatus | null>(null);
  /** Dernier message de la section « Sauvegarde » (import refusé, import réussi…). */
  readonly message = signal<SaveMessage | null>(null);
  /** Dernier lien de partage produit par « Partager » (#426), `null` sinon. */
  readonly shareLink = signal<string | null>(null);
  /** Aquarium reçu par un lien (#426) : proposition d'import ou refus lisible, `null` sinon. */
  readonly shareOffer = signal<ShareOffer | null>(null);
  /** Aquarium relu du lien, en attente de confirmation (jamais appliqué sans elle). */
  private pendingShare: ImportedSave | null = null;

  constructor(private readonly ports: SaveSharePorts) {}

  /**
   * Sauvegarde automatique à restaurer au démarrage (#70) : monde et réglages, ou `null` s'il
   * n'y en a pas. Une sauvegarde illisible est ignorée (`null`) : le bac neuf sera créé, et
   * un message le signale.
   */
  readStored(): RestoredSave | null {
    const text = readStoredSave(this.ports.storage);
    if (text === null) {
      return null;
    }
    const result = parseSaveWorlds(text);
    if (!result.ok) {
      this.message.set({
        kind: 'erreur',
        text: `Sauvegarde précédente illisible, aquarium neuf (${result.error}).`,
      });
      return null;
    }
    return result;
  }

  /**
   * Démarre la sauvegarde automatique et l'écoute des liens partagés (hors capture et hors
   * fond d'écran, décidé par l'hôte).
   */
  activate(win: Window): void {
    this.status.set('active');
    this.startAutosave(win);
    this.startShareListener(win);
  }

  /**
   * Enregistre le monde et les réglages dans le stockage (sauvegarde automatique, #70) et
   * renvoie l'état obtenu. Sans effet en mode capture ou avant le démarrage (`null`). Ne lève
   * jamais : un stockage indisponible ou plein est signalé par `status`.
   */
  saveNow(): SaveStatus | null {
    const world = this.ports.world();
    if (!world || this.ports.isCapture()) {
      return null;
    }
    let status: SaveStatus;
    try {
      status = writeStoredSave(this.ports.storage, this.ports.saveText(world));
    } catch {
      status = 'indisponible';
    }
    this.publishStatus(status);
    return status;
  }

  /** Expose l'état de la sauvegarde (`data-aqfish-save` et signal `status`). */
  publishStatus(status: SaveStatus | null): void {
    this.status.set(status);
    this.ports.publishSave(status);
  }

  /**
   * Télécharge la sauvegarde du monde courant (bouton « Exporter », #70) dans un fichier
   * JSON. Sans effet en mode capture ou avant le démarrage.
   */
  exportSave(): void {
    const world = this.ports.world();
    const doc = this.ports.document;
    const win = doc.defaultView;
    if (!world || !win || this.ports.isCapture()) {
      return;
    }
    try {
      this.ports.beforeExport(world);
      const text = this.ports.saveText(world);
      const url = win.URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = doc.createElement('a');
      link.href = url;
      link.download = SAVE_FILE_NAME;
      link.click();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 0);
      this.message.set({ kind: 'info', text: 'Aquarium exporté.' });
    } catch {
      this.message.set({ kind: 'erreur', text: 'Export impossible dans ce navigateur.' });
    }
  }

  /**
   * Remplace le monde et les réglages par ceux d'une sauvegarde importée (bouton
   * « Importer », #70). Une sauvegarde refusée (`parseWorld`) laisse le bac en cours intact
   * et affiche la raison. Renvoie `true` si l'import a réussi. Sans effet en mode capture ou
   * avant le démarrage.
   */
  importSave(text: string): boolean {
    if (!this.canImport()) {
      return false;
    }
    const result = parseSaveWorlds(text);
    if (!result.ok) {
      this.message.set({ kind: 'erreur', text: `Import refusé : ${result.error}.` });
      return false;
    }
    this.applyImported(result, 'Aquarium importé.');
    return true;
  }

  /** Fichier refusé avant lecture (taille, lecture impossible) : la raison est affichée. */
  rejectImport(text: string): void {
    this.message.set({ kind: 'erreur', text: `Import refusé : ${text}.` });
  }

  /**
   * Bouton « Partager » (#426, ADR 0105) : lien dont le fragment contient le bac affiché
   * (seul), compressé ; copié dans le presse-papiers si le navigateur l'accepte, et exposé
   * dans `shareLink`. Au-delà de `MAX_SHARE_LINK_LENGTH`, aucun lien : le message propose le
   * fichier (« Exporter »). Sans effet en mode capture ou avant le démarrage ; ne lève jamais.
   */
  async shareTank(): Promise<void> {
    const world = this.ports.world();
    const win = this.ports.document.defaultView;
    if (!world || !win || this.ports.isCapture()) {
      return;
    }
    let outcome: Awaited<ReturnType<typeof createShare>>;
    try {
      // Texte écrit avant le premier `await` : l'état partagé est celui du clic.
      outcome = await createShare(shareBase(win.location.href), world, this.ports.settings());
    } catch {
      this.shareLink.set(null);
      this.message.set({ kind: 'erreur', text: 'Partage impossible pour ce bac.' });
      return;
    }
    if (outcome.kind === 'fichier') {
      this.shareLink.set(null);
      this.message.set({
        kind: 'info',
        text: `Aquarium trop riche pour un lien (${outcome.reason}) : partagez plutôt le fichier avec « Exporter ».`,
      });
      return;
    }
    this.shareLink.set(outcome.url);
    // Presse-papiers refusé, absent ou sans réponse (demande d'autorisation laissée en
    // suspens) : le lien reste affiché, à copier à la main.
    const copied = await copyText(win, outcome.url);
    this.message.set({
      kind: 'info',
      text: copied
        ? 'Lien de partage copié dans le presse-papiers.'
        : 'Lien de partage prêt : copiez-le ci-dessous.',
    });
  }

  /** « Importer cet aquarium » (#426) : remplace la pièce par le bac reçu, puis enregistre. */
  acceptShare(): void {
    const result = this.pendingShare;
    if (!result || !this.canImport()) {
      return;
    }
    this.pendingShare = null;
    this.shareOffer.set(null);
    this.clearShareFragment();
    this.applyImported(result, 'Aquarium partagé importé.');
  }

  /** « Ignorer » ou « Fermer » (#426) : la sauvegarde en cours reste intacte. */
  dismissShare(): void {
    this.pendingShare = null;
    this.shareOffer.set(null);
    this.clearShareFragment();
  }

  private canImport(): boolean {
    return this.ports.world() !== null && this.ports.hasView() && !this.ports.isCapture();
  }

  /** Remplace la pièce par une sauvegarde relue et validée (import, lien partagé), puis enregistre. */
  private applyImported(result: ImportedSave, message: string): void {
    this.ports.load(result);
    this.message.set({ kind: 'info', text: message });
    this.saveNow();
  }

  /**
   * Lit le lien partagé du fragment de l'adresse (#426) : propose l'import (rien n'est
   * remplacé avant `acceptShare`) ou affiche la raison du refus. Ne lève jamais.
   */
  private async offerShare(win: Window): Promise<void> {
    const hash = win.location.hash;
    if (!hasShareFragment(hash)) {
      return;
    }
    const result = await readShare(hash);
    if (this.ports.isStopped() || win.location.hash !== hash) {
      return;
    }
    if (!result.ok) {
      this.pendingShare = null;
      this.shareOffer.set({ kind: 'erreur', text: `Lien de partage refusé : ${result.error}.` });
      return;
    }
    this.pendingShare = result;
    this.shareOffer.set({
      kind: 'offre',
      environment: environmentById(result.world.environment).name,
      animals: sharedAnimalCount(result),
      tanks: this.ports.tankCount(),
    });
  }

  /** Retire `#partage=…` de l'adresse, sans recharger ni ajouter d'entrée d'historique. */
  private clearShareFragment(): void {
    const win = this.ports.document.defaultView;
    if (!win || !hasShareFragment(win.location.hash)) {
      return;
    }
    try {
      win.history.replaceState(win.history.state, '', win.location.href.split('#')[0]);
    } catch {
      // Historique indisponible (bac à sable) : le fragment reste, sans effet.
    }
  }

  /**
   * Liens partagés (#426) : celui de l'adresse au démarrage, puis tout lien collé dans le même
   * onglet (`hashchange`, sans rechargement).
   */
  private startShareListener(win: Window): void {
    const onHash = () => void this.offerShare(win);
    win.addEventListener('hashchange', onHash);
    this.ports.onCleanup(() => win.removeEventListener('hashchange', onHash));
    void this.offerShare(win);
  }

  /**
   * Sauvegarde automatique (#70) : toutes les `AUTOSAVE_INTERVAL_MS`, quand l'onglet est
   * masqué et quand la page est quittée (`pagehide`, plus fiable que `beforeunload` sur
   * mobile).
   */
  private startAutosave(win: Window): void {
    const doc = this.ports.document;
    const save = () => {
      this.ports.beforeAutosave();
      this.saveNow();
    };
    const onVisibility = () => {
      if (doc.visibilityState === 'hidden') {
        save();
      }
    };
    const timer = win.setInterval(save, AUTOSAVE_INTERVAL_MS);
    win.addEventListener('pagehide', save);
    doc.addEventListener('visibilitychange', onVisibility);
    this.ports.onCleanup(() => {
      win.clearInterval(timer);
      win.removeEventListener('pagehide', save);
      doc.removeEventListener('visibilitychange', onVisibility);
    });
  }
}
