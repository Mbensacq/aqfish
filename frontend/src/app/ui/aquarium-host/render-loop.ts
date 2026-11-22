import { frameDue, type FrameLimiter } from '../../core/wallpaper/wallpaper';
import { SIM_DT } from '../../sim/constants';
import { createFixedStepState, fixedStepInto, type FixedStepState } from '../../sim/fixed-step';
import { maxStepsForSpeed, scaledDt } from '../../sim/sim-speed';

/** Ce dont la boucle d'images a besoin de l'hôte (#696). */
export interface RenderLoopPorts {
  /** Fenêtre de la page (`requestAnimationFrame`), `null` hors navigateur. */
  window(): Window | null;
  /** Vrai si une vue est prête à être dessinée. */
  canRender(): boolean;
  /** Une image : l'hôte avance, dessine, et redemande une image s'il le faut. */
  frame(timestamp: number): void;
}

/**
 * Boucle d'images de l'hôte (#696) : demande des images (`requestAnimationFrame`), pause de la
 * vue fond d'écran (#279), cadence limitée du fond d'écran, et pas fixe de la simulation
 * (ADR 0002) au temps réel multiplié par la vitesse (#52). Aucune allocation par image : l'état du pas fixe et le limiteur sont réécrits en
 * place. Sortie de l'hôte au lot 10 de l'assainissement, sans changement de comportement.
 */
export class RenderLoop {
  /** État de la boucle à pas fixe, réécrit à chaque image (aucune allocation). */
  readonly clock: FixedStepState = createFixedStepState();
  private frameId: number | null = null;
  private lastTimestamp: number | null = null;
  /** Limiteur d'images de la vue fond d'écran, réécrit en place (aucune allocation). */
  private readonly limiter: FrameLimiter = { next: null };
  /** Page masquée en vue fond d'écran : aucune image demandée (#279). */
  private paused = false;
  private readonly onFrame: FrameRequestCallback = (timestamp) => {
    this.frameId = null;
    this.ports.frame(timestamp);
  };

  constructor(private readonly ports: RenderLoopPorts) {}

  /** Coefficient d'interpolation entre les deux derniers pas (0 à 1). */
  get alpha(): number {
    return this.clock.alpha;
  }

  /** Demande une image, sauf si une est déjà demandée, sans vue ou en pause. */
  schedule(): void {
    const win = this.ports.window();
    if (!win || !this.ports.canRender() || this.frameId !== null || this.paused) {
      return;
    }
    this.frameId = win.requestAnimationFrame(this.onFrame);
  }

  /** Annule l'image demandée, s'il y en a une. */
  cancel(): void {
    if (this.frameId !== null) {
      this.ports.window()?.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  /**
   * Page masquée ou de nouveau visible (vue fond d'écran, #279) : masquée, plus aucune image ;
   * visible, la boucle repart sans rattraper le temps passé masqué.
   */
  setHidden(hidden: boolean): void {
    this.paused = hidden;
    if (hidden) {
      this.cancel();
      return;
    }
    this.lastTimestamp = null;
    this.limiter.next = null;
    this.schedule();
  }

  /** Vrai si l'image de `timestamp` dépasse la cadence `fps` du fond d'écran (à sauter). */
  throttled(timestamp: number, fps: number): boolean {
    return !frameDue(this.limiter, timestamp, fps);
  }

  /**
   * Verse au pas fixe le temps réel écoulé depuis l'image précédente, multiplié par `speed`
   * (temps simulé = temps réel × vitesse, toujours par pas `SIM_DT`). Le nombre de pas à faire
   * est dans `clock.steps`. Renvoie le temps réel écoulé, en secondes (0 à la première image).
   */
  advance(timestamp: number, speed: number): number {
    // Première image : pas de durée de référence, aucun pas.
    const realDt = this.lastTimestamp === null ? 0 : (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    fixedStepInto(
      this.clock.accumulator,
      scaledDt(realDt, speed),
      this.clock,
      SIM_DT,
      maxStepsForSpeed(speed),
    );
    return realDt;
  }

  /** Oublie le temps accumulé (monde remplacé ou avancé d'un bloc). */
  resetClock(): void {
    this.clock.accumulator = 0;
    this.clock.alpha = 0;
  }
}
