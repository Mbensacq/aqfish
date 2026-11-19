import { signal, type WritableSignal } from '@angular/core';

import type { CameraPreset } from '../../core/capture/capture-params';
import { freeMoveAxesInto, freeMoveFor, type FreeMoveId } from '../../core/commands/commands';
import {
  readStoredFreeCamera,
  writeStoredFreeCamera,
  type FreeCameraPrefStorage,
} from '../../core/free-camera-pref/free-camera-pref';
import { isTypingContext } from '../../core/keyboard/keyboard';
import type { AquariumView } from '../../render/aquarium-view';

/** Ce dont la caméra libre a besoin de l'hôte (#696). */
export interface FreeCameraPorts {
  /** Vue courante, `null` avant le démarrage. */
  view(): AquariumView | null;
  /** Mode capture : la caméra libre passe par `libre=`, jamais par la bascule. */
  isCapture(): boolean;
  /** Vue fond d'écran (#279) : caméra automatique, jamais libre. */
  isWallpaper(): boolean;
  /** Stockage de la préférence d'affichage (#344), `null` s'il est inaccessible. */
  prefStorage(): FreeCameraPrefStorage | null;
  /** Préréglage suivi par la caméra, affiché par la barre des vues. */
  readonly activePreset: WritableSignal<CameraPreset | null>;
  /** Publie l'état de la caméra libre (`data-aqfish-*`). */
  publishFreeCamera(active: boolean): void;
  /** Publie la pose de la caméra. */
  publishCamera(): void;
  /** Demande une image. */
  scheduleFrame(): void;
}

/**
 * Caméra libre dans la pièce (#343, ADR 0084) : bascule avec l'orbite, préréglage d'avant
 * rendu au retour, touches et boutons de déplacement tenus (#344), préférence d'affichage
 * mémorisée hors capture et hors fond d'écran. Sortie de l'hôte au lot 10 de l'assainissement
 * (#696), sans changement de comportement.
 */
export class FreeCameraController {
  /** Caméra libre dans la pièce en cours (#343) ; la barre des vues l'affiche. */
  readonly active = signal(false);

  /** Déplacements de la caméra libre enfoncés au clavier ou aux boutons (#343, #344). */
  private readonly moves = new Set<FreeMoveId>();
  /** Consigne de la caméra libre, tampon réutilisé à chaque image (#352). */
  private readonly axes = { forward: 0, strafe: 0, vertical: 0 };
  /** Préréglage suivi avant la caméra libre, rendu à la barre en revenant à l'orbite. */
  private presetBefore: CameraPreset | null = null;

  constructor(private readonly ports: FreeCameraPorts) {}

  /**
   * Entre en caméra libre dans la pièce ou revient à l'orbite, pose d'avant rendue. Sans effet
   * sans pièce affichée, en mode capture, en fond d'écran ou avant le démarrage.
   */
  toggle(): void {
    const view = this.ports.view();
    if (!view || this.ports.isCapture() || this.ports.isWallpaper()) {
      return;
    }
    if (view.freeCameraActive) {
      view.exitFreeCamera();
      this.ports.activePreset.set(this.presetBefore);
      this.sync(false);
    } else if (view.enterFreeCamera()) {
      this.presetBefore = this.ports.activePreset();
      this.ports.activePreset.set(null);
      this.sync(true);
    } else {
      return;
    }
    // Préférence d'affichage (#344) : le mode choisi est repris au prochain chargement.
    this.remember(this.active());
    this.ports.publishCamera();
    this.ports.scheduleFrame();
  }

  /** Caméra libre mémorisée (#344), reprise au démarrage hors capture et hors fond d'écran. */
  resumeStored(): void {
    if (
      !this.ports.isCapture() &&
      !this.ports.isWallpaper() &&
      readStoredFreeCamera(this.ports.prefStorage())
    ) {
      this.toggle();
    }
  }

  /**
   * Un préréglage est choisi : la vue part de la pose libre vers lui, et ce choix vaut retour à
   * l'orbite pour la préférence d'affichage (#344).
   */
  leaveForPreset(): void {
    if (this.active()) {
      this.remember(false);
    }
    this.sync(false);
  }

  /** Pièce masquée : si la vue est revenue à l'orbite, préréglage d'avant rendu (#343). */
  roomShownChanged(): void {
    if (this.active() && !this.ports.view()?.freeCameraActive) {
      this.ports.activePreset.set(this.presetBefore);
      this.sync(false);
      this.ports.publishCamera();
    }
  }

  /** Vue neuve : en orbite (#343). */
  reset(): void {
    this.sync(false);
  }

  /**
   * Déplacement tenu ou relâché par un bouton à l'écran (#344, « Avancer » et « Reculer ») :
   * même effet qu'une touche tenue. Sans effet hors caméra libre.
   */
  setMoveHeld(move: FreeMoveId, held: boolean): void {
    if (!held) {
      this.moves.delete(move);
      return;
    }
    if (!this.active()) {
      return;
    }
    this.moves.add(move);
    this.ports.scheduleFrame();
  }

  /**
   * Touches de déplacement (#343) : tenues enfoncées, lues à chaque image. Hors caméra libre,
   * dans un champ de saisie ou avec Ctrl, Alt, Meta : laissées au reste.
   */
  onKey(event: KeyboardEvent, down: boolean): void {
    const move = freeMoveFor(event.key);
    if (move === null) {
      return;
    }
    if (!down) {
      this.moves.delete(move);
      return;
    }
    if (!this.active() || event.defaultPrevented || isTypingContext(event)) {
      return;
    }
    event.preventDefault();
    this.moves.add(move);
    this.ports.scheduleFrame();
  }

  /** Tout relâché (fenêtre sans focus : le relâchement n'arriverait jamais). */
  releaseAll(): void {
    this.moves.clear();
  }

  /** Avance la caméra libre de `realDt` secondes ; vrai si sa pose a changé. */
  step(view: AquariumView, realDt: number): boolean {
    return (
      view.freeCameraActive && view.stepFreeCamera(freeMoveAxesInto(this.moves, this.axes), realDt)
    );
  }

  /** Mémorise le mode de caméra choisi (#344), hors capture et fond d'écran. */
  private remember(free: boolean): void {
    if (!this.ports.isCapture() && !this.ports.isWallpaper()) {
      writeStoredFreeCamera(this.ports.prefStorage(), free);
    }
  }

  /** Aligne l'état exposé de la caméra libre sur `active` ; touches relâchées en sortant. */
  private sync(active: boolean): void {
    if (!active) {
      this.moves.clear();
    }
    this.active.set(active);
    this.ports.publishFreeCamera(active);
  }
}
