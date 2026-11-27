import { signal } from '@angular/core';

import {
  DEFAULT_FOOD_STYLE,
  isFoodStyle,
  toggleFoodStyle as otherFoodStyle,
  type FoodStyle,
} from '../../core/food-style/food-style';
import {
  toggleRenderFilter,
  writeStoredRenderFilter,
  type FilterStorage,
  type RenderFilter,
} from '../../core/render-filter/render-filter';
import type { AquariumView } from '../../render/aquarium-view';
import { lunarPhase, moonGlow, REDUCED_MOON_AMPLITUDE } from '../../sim/moon';
import { clampRoom, DEFAULT_ROOM, type Room } from '../../sim/room';
import { roomLayoutBlocks } from '../../sim/room-layout';
import type { RoomState } from '../../sim/room-state';
import type { AquariumProbe } from './aquarium-probe';

/** Ce dont l'affichage du bac a besoin de l'hôte (#696). */
export interface DisplayPorts {
  /** Attributs `data-aqfish-*` de l'hôte. */
  readonly probe: AquariumProbe;
  /** Vue courante, `null` avant le démarrage. */
  view(): AquariumView | null;
  isCapture(): boolean;
  /** Stockage du filtre choisi (`aqfish.filtre`), `null` s'il est inaccessible. */
  filterStorage(): FilterStorage | null;
  /** Option « Réduire les mouvements » (#406) et préférence système. */
  readonly motion: {
    system(): boolean;
    reduced(): boolean;
  };
  /** Option « Lune » des réglages (#856). */
  readonly moon: { enabled(): boolean };
  /** Pièce de N bacs (#305), `null` avant sa première synchronisation. */
  roomState(): RoomState | null;
  /** Ceux qui suivent la pièce dessinée : caméra libre (#343), éditeurs (#188). */
  roomShown(room: Room, shown: boolean): void;
  saveNow(): void;
  scheduleFrame(): void;
}

/**
 * Réglages d'affichage du bac, sans effet sur la simulation : filtre de rendu (#33), décor
 * visible (#52), pièce autour du bac (#187, #305), pluie (#106), rendu des granulés (#117) et
 * mouvements réduits (#406). Sorti de l'hôte au lot 10 de l'assainissement (#696), sans
 * changement de comportement.
 */
export class DisplayController {
  /**
   * Filtre de rendu courant (issue #33). Pixel art par défaut ; `filtre=` dans l'URL prime
   * sur le choix mémorisé (`aqfish.filtre`). Mis à jour à la bascule seulement.
   */
  readonly filter = signal<RenderFilter>('pixel');
  /** Décor (rochers et plantes) affiché (#52). Il reste un obstacle pour les poissons. */
  readonly decorVisible = signal(true);
  /**
   * Pluie (#106) : touche `R`, case du panneau, `pluie=1`. Possible dans le bassin seulement ;
   * jamais sauvegardée.
   */
  readonly rain = signal(false);
  /**
   * Rendu des granulés (#117) : points par défaut, voxels au choix (bouton du panneau),
   * enregistré avec les réglages de la sauvegarde ; `granules=` en capture.
   */
  readonly foodStyle = signal<FoodStyle>(DEFAULT_FOOD_STYLE);
  /**
   * Pièce autour du bac (#187) : case « Afficher la pièce » du panneau, enregistrée avec les
   * réglages de la sauvegarde ; `piece=1` en capture. Affichée dans le bac tropical seulement.
   */
  readonly room = signal<Room>(DEFAULT_ROOM);

  /** Phase de lune imposée par `lune=` en capture (#856), `null` : celle du jour de jeu. */
  private captureMoonPhase: number | null = null;

  constructor(private readonly ports: DisplayPorts) {}

  /** Phase de lune de `lune=` (#856), lue au démarrage ; ignorée hors capture. */
  setCaptureMoonPhase(phase: number | null): void {
    this.captureMoonPhase = this.ports.isCapture() ? phase : null;
  }

  /**
   * Clarté de la nuit au jour de jeu `gameDay` (`sim/moon.ts`, #856) : variation entière avec
   * l'option « Lune », au minimum avec « Réduire les mouvements », aucune sans l'option. En
   * capture, l'option mémorisée est ignorée (images reproductibles) et `lune=` fixe la phase.
   */
  moonGlowAt(gameDay: number): number {
    if (!this.ports.isCapture() && !this.ports.moon.enabled()) {
      return 1;
    }
    const amplitude = this.reducedMotion() ? REDUCED_MOON_AMPLITUDE : 1;
    return moonGlow(this.captureMoonPhase ?? lunarPhase(gameDay), amplitude);
  }

  /**
   * Change le filtre de rendu à chaud (bouton « Pixel art », touche `P`) : la simulation, la
   * caméra et la vue ne sont pas réinitialisées. Le choix est mémorisé s'il est possible de
   * l'écrire, sinon il reste en mémoire pour la session (repli silencieux).
   */
  setFilter(filter: RenderFilter): void {
    const { ports } = this;
    const view = ports.view();
    if (!view) {
      return;
    }
    if (view.setFilter(filter)) {
      this.filter.set(filter);
      ports.probe.publishFilter(this.filter());
      ports.scheduleFrame();
    }
    if (!ports.isCapture()) {
      writeStoredRenderFilter(ports.filterStorage(), filter);
    }
  }

  /** Bascule entre pixel art et rendu sans filtre. */
  toggleFilter(): void {
    this.setFilter(toggleRenderFilter(this.filter()));
  }

  /**
   * Affiche ou masque le décor (#52) sans le détruire. La simulation n'est pas touchée :
   * rochers et plantes restent des obstacles (ADR 0024). Sans effet en mode capture ou
   * avant le démarrage.
   */
  setDecorVisible(visible: boolean): void {
    const view = this.ports.view();
    if (!view || this.ports.isCapture()) {
      return;
    }
    view.setDecorVisible(visible);
    this.decorVisible.set(visible);
    this.ports.probe.publishDecorVisible(visible);
    this.ports.scheduleFrame();
  }

  /**
   * Affiche ou masque la pièce autour du bac (#187), sans effet sur la simulation ; enregistré
   * avec la sauvegarde. Sans effet en mode capture (`piece=`) ou avant le démarrage.
   */
  setRoomShown(shown: boolean): void {
    if (!this.ports.view() || this.ports.isCapture() || shown === this.room().shown) {
      return;
    }
    this.applyRoom({ ...this.room(), shown });
    this.ports.saveNow();
    this.ports.scheduleFrame();
  }

  /**
   * Fait pleuvoir ou arrête la pluie (#106), ciel couvert en fondu (#338). Sans effet hors du
   * bassin, en mode capture (`pluie=`) ou avant le démarrage. Rien n'est sauvegardé.
   */
  setRain(enabled: boolean): void {
    if (!this.ports.view() || this.ports.isCapture()) {
      return;
    }
    this.applyRain(enabled, true);
    this.ports.scheduleFrame();
  }

  /**
   * Change le rendu des granulés (#117) à chaud, sans toucher au monde ni à la caméra ; le
   * choix est enregistré avec la sauvegarde. Sans effet en mode capture (`granules=`) ou
   * avant le démarrage.
   */
  setFoodStyle(style: FoodStyle): void {
    if (!this.ports.view() || this.ports.isCapture() || !isFoodStyle(style)) {
      return;
    }
    this.applyFoodStyle(style);
    this.ports.saveNow();
    this.ports.scheduleFrame();
  }

  /** Alterne entre granulés en points et en voxels (bouton du panneau, #117). */
  toggleFoodStyle(): void {
    this.setFoodStyle(otherFoodStyle(this.foodStyle()));
  }

  /** Applique la pièce à la vue courante et l'expose (`ROOM_ATTRIBUTE`). */
  applyRoom(room: Room): void {
    const { ports } = this;
    this.room.set(room);
    const view = ports.view();
    const state = ports.roomState();
    // Meubles supports et bacs posés (#305) : dessinés avec la pièce, au parquet du meuble.
    view?.setRoomLayout(
      state === null ? [] : roomLayoutBlocks(state, clampRoom(room).cabinetHeight),
    );
    view?.setRoom(room);
    const shown = view?.roomShown ?? false;
    ports.probe.publishRoomShown(shown);
    ports.roomShown(room, shown);
  }

  /** Applique le rendu des granulés à la vue courante et l'expose. */
  applyFoodStyle(style: FoodStyle): void {
    this.foodStyle.set(style);
    this.ports.view()?.setFoodStyle(style);
    this.ports.probe.publishFoodStyle(style);
  }

  /**
   * Applique la pluie à la vue courante et expose l'état obtenu (`data-aqfish-rain`).
   * `fade` : ciel couvert en fondu (bascule en cours de route), sinon d'un coup (démarrage).
   */
  applyRain(enabled: boolean, fade = false): void {
    const raining = this.ports.view()?.setRain(enabled, fade) ?? false;
    this.rain.set(raining);
    this.ports.probe.publishRain(raining);
  }

  /**
   * Mouvements réduits (#406) : l'option des réglages, ou la préférence système. En capture,
   * le choix mémorisé est ignoré (images reproductibles) : seule la préférence système compte,
   * que Playwright peut émuler (`reducedMotion: 'reduce'`) pour une capture avec l'option.
   */
  reducedMotion(): boolean {
    const { motion } = this.ports;
    return this.ports.isCapture() ? motion.system() : motion.reduced();
  }

  /** Pose l'état des mouvements sur la vue et l'expose aux tests de bout en bout. */
  applyReducedMotion(): void {
    const reduced = this.reducedMotion();
    this.ports.probe.publishReducedMotion(reduced);
    const view = this.ports.view();
    if (view) {
      view.setReducedMotion(reduced);
      this.ports.scheduleFrame();
    }
  }
}
