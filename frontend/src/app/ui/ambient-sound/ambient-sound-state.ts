import {
  DOCUMENT,
  DestroyRef,
  Injectable,
  InjectionToken,
  computed,
  inject,
  signal,
} from '@angular/core';

import {
  ambientLevels,
  clampVolume,
  limitPeak,
  DEFAULT_AMBIENT_VOLUME,
  readStoredAmbientSound,
  SILENT_LEVELS,
  writeStoredAmbientSound,
  type AmbientLevels,
  type AmbientScene,
  type AmbientSoundStorage,
} from '../../core/ambient-sound/ambient-sound';
import { AmbientSoundEngine, type AudioContextLike, type TimerLike } from './ambient-sound-engine';

/** Fabrique d'`AudioContext`, `null` si le navigateur n'a pas Web Audio. */
export type AudioContextFactory = () => AudioContextLike;

type AudioContextConstructor = new () => AudioContextLike;

/** Constructeur `AudioContext` de la fenêtre (ou son ancien nom préfixé), s'il existe. */
function audioContextConstructor(win: Window | null): AudioContextConstructor | null {
  try {
    const source = win as unknown as {
      AudioContext?: unknown;
      webkitAudioContext?: unknown;
    } | null;
    const ctor = source?.AudioContext ?? source?.webkitAudioContext;
    return typeof ctor === 'function' ? (ctor as AudioContextConstructor) : null;
  } catch {
    return null;
  }
}

/**
 * Fabrique du contexte audio (remplacée par un double dans les tests). Appeler la fabrique
 * crée le contexte : le service ne le fait qu'au geste de l'utilisateur.
 */
export const AUDIO_CONTEXT_FACTORY = new InjectionToken<AudioContextFactory | null>(
  'AUDIO_CONTEXT_FACTORY',
  {
    providedIn: 'root',
    factory: () => {
      const ctor = audioContextConstructor(inject(DOCUMENT).defaultView);
      return ctor ? () => new ctor() : null;
    },
  },
);

/** Minuterie des bulles (remplacée par un double dans les tests). */
export const AMBIENT_SOUND_TIMER = new InjectionToken<TimerLike>('AMBIENT_SOUND_TIMER', {
  providedIn: 'root',
  factory: () => {
    const win = inject(DOCUMENT).defaultView;
    return {
      setTimeout: (callback, ms) => win?.setTimeout(callback, ms) ?? null,
      clearTimeout: (handle) => win?.clearTimeout(handle as number),
    };
  },
});

/** `localStorage` de la fenêtre, `null` s'il est inaccessible (l'accès lui-même peut lever). */
function windowStorage(win: Window | null): AmbientSoundStorage | null {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Gestes qui autorisent un contexte audio (politique d'autoplay des navigateurs). */
const GESTURES = ['pointerdown', 'keydown'] as const;

/**
 * État et moteur des sons d'ambiance (#411, ADR 0100), réglés dans « Réglages » (section
 * « Son ») et nourris par l'hôte de l'aquarium (environnement, moment de la journée, pluie,
 * pause).
 *
 * - Désactivés par défaut. Aucun `AudioContext` n'est créé avant un geste : cocher la case
 *   (le `change` d'un clic ou d'une touche en est un), ou, si le choix mémorisé est « actif »,
 *   le premier appui ou clic sur la page.
 * - Décocher ferme le contexte (`close`) ; il sera recréé au prochain geste.
 * - Onglet masqué, simulation en pause ou scène absente (capture, aucun aquarium) : couches
 *   ramenées à zéro par fondu court, reprise au retour.
 * - Navigateur sans Web Audio, ou création du contexte refusée : `available` faux, la case est
 *   désactivée et une explication s'affiche ; rien ne lève.
 */
@Injectable({ providedIn: 'root' })
export class AmbientSoundState {
  private readonly document = inject(DOCUMENT);
  private readonly win = this.document.defaultView;
  private readonly storage = windowStorage(this.win);
  private readonly factory = inject(AUDIO_CONTEXT_FACTORY);
  private readonly timer = inject(AMBIENT_SOUND_TIMER);
  private engine: AmbientSoundEngine | null = null;
  private readonly stored = readStoredAmbientSound(this.storage);
  private gestureCleanup: (() => void) | null = null;
  private forbidden = false;

  /** Web Audio utilisable (faux sans `AudioContext` ou si sa création a échoué). */
  readonly available = signal(this.factory !== null);
  /**
   * Création du contexte audio refusée par le navigateur (#413) : `available` est alors faux
   * alors que Web Audio existe ; le panneau l'explique autrement que l'absence de Web Audio.
   */
  readonly refused = signal(false);
  /** Case « Sons d'ambiance » cochée. */
  readonly enabled = signal(this.stored?.enabled === true && this.factory !== null);
  /** Volume général dans [0, 1]. */
  readonly volume = signal(this.stored?.volume ?? DEFAULT_AMBIENT_VOLUME);
  /** Scène courante, posée par l'hôte ; `null` : aucune (capture, avant le démarrage). */
  readonly scene = signal<AmbientScene | null>(null);
  /** Onglet masqué. */
  readonly hidden = signal(this.document.hidden === true);
  /** Moteur en marche (contexte audio créé). */
  readonly playing = signal(false);

  /** Niveaux visés de chaque couche, crête de leur somme bornée (`limitPeak`, #413). */
  readonly levels = computed<AmbientLevels>(() => {
    const scene = this.scene();
    if (!scene || !this.enabled()) {
      return SILENT_LEVELS;
    }
    return limitPeak(
      ambientLevels({ ...scene, silenced: scene.silenced || this.hidden() }, this.volume()),
    );
  });

  constructor() {
    const onVisibility = (): void => {
      this.hidden.set(this.document.hidden === true);
      this.apply();
    };
    this.document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', onVisibility);
      this.stopListeningForGesture();
      this.stop();
    });
    if (this.enabled()) {
      this.listenForGesture();
    }
  }

  /**
   * Case cochée ou décochée (à appeler depuis le `change` de la case, donc dans un geste) :
   * démarre ou arrête le son et mémorise le choix. Sans effet si Web Audio est indisponible.
   */
  setEnabled(enabled: boolean): void {
    if (!this.available()) {
      return;
    }
    this.enabled.set(enabled);
    this.remember();
    this.stopListeningForGesture();
    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  /** Volume (borné à [0, 1], NaN au défaut), appliqué par fondu et mémorisé. */
  setVolume(volume: number): void {
    this.volume.set(clampVolume(volume));
    this.remember();
    this.apply();
  }

  /** Scène lue par le fond sonore (`null` : aucune, silence). */
  setScene(scene: AmbientScene | null): void {
    this.scene.set(scene);
    this.apply();
  }

  /**
   * Mode capture (contrat de capture) : le son est interdit pour la session. Aucun contexte
   * ne sera créé, même au geste ou case cochée ; un moteur déjà en marche est arrêté. Le choix
   * mémorisé n'est pas modifié.
   */
  forbid(): void {
    this.forbidden = true;
    this.stopListeningForGesture();
    this.stop();
  }

  /** Crée le contexte audio et le moteur, s'ils n'existent pas encore. */
  private start(): void {
    if (this.engine || !this.factory || this.forbidden) {
      return;
    }
    let context: AudioContextLike | null = null;
    try {
      context = this.factory();
      this.engine = new AmbientSoundEngine(context, this.timer);
    } catch {
      // Création refusée (trop de contextes, politique du navigateur) : son indisponible ; un
      // contexte créé malgré tout est refermé.
      try {
        context?.close().catch(() => undefined);
      } catch {
        // Fermeture impossible : il n'émet rien, aucun nœud n'y est branché.
      }
      this.engine = null;
      this.available.set(false);
      this.refused.set(true);
      this.enabled.set(false);
      return;
    }
    this.playing.set(true);
    if (context.state === 'suspended') {
      context.resume().catch(() => undefined);
    }
    this.apply();
  }

  /** Ferme le moteur et le contexte audio. */
  private stop(): void {
    const engine = this.engine;
    this.engine = null;
    this.playing.set(false);
    void engine?.close();
  }

  private apply(): void {
    this.engine?.setLevels(this.levels());
  }

  private remember(): void {
    writeStoredAmbientSound(this.storage, { enabled: this.enabled(), volume: this.volume() });
  }

  /** Choix mémorisé « actif » : le son démarre au premier geste sur la page. */
  private listenForGesture(): void {
    const onGesture = (): void => {
      this.stopListeningForGesture();
      if (this.enabled()) {
        this.start();
      }
    };
    for (const type of GESTURES) {
      this.document.addEventListener(type, onGesture, { capture: true });
    }
    this.gestureCleanup = () => {
      for (const type of GESTURES) {
        this.document.removeEventListener(type, onGesture, { capture: true });
      }
    };
  }

  private stopListeningForGesture(): void {
    this.gestureCleanup?.();
    this.gestureCleanup = null;
  }
}
