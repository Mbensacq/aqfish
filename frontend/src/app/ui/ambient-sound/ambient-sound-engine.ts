import {
  bubblePitch,
  createAmbientPrng,
  fillNoise,
  nextBubbleDelay,
  SILENT_LEVELS,
  type AmbientLevels,
} from '../../core/ambient-sound/ambient-sound';
import type { Prng } from '../../core/random/prng';

/**
 * Moteur du fond sonore (#411, ADR 0100) : graphe Web Audio synthétisé, sans fichier audio.
 *
 * - **Sous l'eau** : bruit blanc en boucle, passe-bas grave, gain lentement modulé (LFO).
 * - **Pluie** : le même bruit, passe-haut, gain réglé par la pluie.
 * - **Bulles** : « blop » sinusoïdaux (fréquence qui monte, enveloppe courte), planifiés à
 *   intervalles irréguliers tirés du générateur propre au son.
 *
 * Tous les niveaux changent par fondu court (`setTargetAtTime`). Le contexte audio est fourni
 * déjà créé : c'est le service qui décide quand (au geste de l'utilisateur).
 */

/** Durée du tampon de bruit en boucle (s). */
const NOISE_SECONDS = 2;
/** Constante de temps des fondus de niveau (s) : ~0,5 s pour atteindre 95 %. */
export const FADE_SECONDS = 0.15;
/** Fréquence de coupure du bruit « sous l'eau » (Hz). */
const WATER_CUTOFF = 380;
/** Fréquence et profondeur du lent va-et-vient de la filtration. */
const WATER_LFO_HZ = 0.13;
const WATER_LFO_DEPTH = 0.35;
/** Fréquence de coupure basse du bruit de pluie (Hz). */
const RAIN_CUTOFF = 1400;
/** Durée d'un « blop » (s) et montée de sa fréquence (facteur). */
const BUBBLE_SECONDS = 0.09;
const BUBBLE_GLIDE = 1.8;

/** Sous-ensemble de `AudioParam` utilisé. */
export interface ParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, time: number, constant: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
}

/** Sous-ensemble de `AudioNode` utilisé. */
export interface NodeLike {
  connect(destination: NodeLike | ParamLike): unknown;
  disconnect(): void;
}

export interface GainLike extends NodeLike {
  readonly gain: ParamLike;
}

export interface FilterLike extends NodeLike {
  type: BiquadFilterType;
  readonly frequency: ParamLike;
  readonly Q: ParamLike;
}

export interface SourceLike extends NodeLike {
  start(when?: number): void;
  stop(when?: number): void;
  onended: (() => void) | null;
}

export interface BufferSourceLike extends SourceLike {
  buffer: unknown;
  loop: boolean;
  start(when?: number, offset?: number): void;
}

export interface OscillatorLike extends SourceLike {
  type: OscillatorType;
  readonly frequency: ParamLike;
}

export interface BufferLike {
  getChannelData(channel: number): Float32Array;
}

/** Sous-ensemble d'`AudioContext` utilisé (remplaçable par un double dans les tests). */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: NodeLike;
  readonly state: string;
  createGain(): GainLike;
  createBiquadFilter(): FilterLike;
  createBufferSource(): BufferSourceLike;
  createOscillator(): OscillatorLike;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}

/** Minuterie injectable (en pratique `setTimeout` de la fenêtre). */
export interface TimerLike {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export class AmbientSoundEngine {
  private readonly prng: Prng = createAmbientPrng();
  private readonly master: GainLike;
  private readonly water: GainLike;
  private readonly rain: GainLike;
  private readonly bubbles: GainLike;
  private readonly lfoDepth: GainLike;
  private readonly sources: SourceLike[] = [];
  private levels: AmbientLevels = SILENT_LEVELS;
  private bubbleTimer: unknown = null;
  private closed = false;

  constructor(
    private readonly context: AudioContextLike,
    private readonly timer: TimerLike,
  ) {
    const ctx = context;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    const noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
    fillNoise(noise.getChannelData(0), this.prng);

    this.water = this.layer(noise, 'lowpass', WATER_CUTOFF, 0);
    this.rain = this.layer(noise, 'highpass', RAIN_CUTOFF, NOISE_SECONDS / 2);
    this.bubbles = ctx.createGain();
    this.bubbles.gain.value = 0;
    this.bubbles.connect(this.master);

    // Lent va-et-vient de la filtration : un LFO ajouté au gain de la couche « eau ».
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = WATER_LFO_HZ;
    const depth = ctx.createGain();
    depth.gain.value = 0;
    lfo.connect(depth);
    depth.connect(this.water.gain);
    lfo.start();
    this.sources.push(lfo);
    this.lfoDepth = depth;

    this.master.gain.setTargetAtTime(1, ctx.currentTime, FADE_SECONDS);
    this.scheduleBubble();
  }

  /** Niveaux courants (les derniers demandés). */
  get current(): AmbientLevels {
    return this.levels;
  }

  /** Vrai une fois `close` appelé. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** Règle chaque couche par fondu court. Sans effet une fois fermé. */
  setLevels(levels: AmbientLevels): void {
    if (this.closed) {
      return;
    }
    this.levels = levels;
    const now = this.context.currentTime;
    this.water.gain.setTargetAtTime(levels.water, now, FADE_SECONDS);
    this.lfoDepth.gain.setTargetAtTime(levels.water * WATER_LFO_DEPTH, now, FADE_SECONDS);
    this.rain.gain.setTargetAtTime(levels.rain, now, FADE_SECONDS);
    this.bubbles.gain.setTargetAtTime(levels.bubbles, now, FADE_SECONDS);
  }

  /** Arrête tout, débranche le graphe et ferme le contexte audio. Idempotent. */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.bubbleTimer !== null) {
      this.timer.clearTimeout(this.bubbleTimer);
      this.bubbleTimer = null;
    }
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Déjà arrêtée : rien à faire.
      }
    }
    this.sources.length = 0;
    this.master.disconnect();
    try {
      await this.context.close();
    } catch {
      // Contexte déjà fermé ou refus du navigateur : il n'émet plus rien de toute façon.
    }
  }

  /** Couche de bruit filtré en boucle, branchée sur le gain général. */
  private layer(
    buffer: BufferLike,
    type: BiquadFilterType,
    frequency: number,
    offset: number,
  ): GainLike {
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    // Décalage de lecture : eau et pluie ne lisent pas le même passage du bruit.
    source.start(0, offset);
    this.sources.push(source);
    return gain;
  }

  /** Planifie la prochaine bulle selon le rythme courant (relu à chaque bulle). */
  private scheduleBubble(): void {
    const delay = nextBubbleDelay(this.prng, this.levels.bubbleRate);
    this.bubbleTimer = this.timer.setTimeout(() => {
      this.bubbleTimer = null;
      if (this.closed) {
        return;
      }
      if (this.levels.bubbleRate > 0 && this.levels.bubbles > 0) {
        this.blop();
      }
      this.scheduleBubble();
    }, delay * 1000);
  }

  /** Un « blop » : sinusoïde dont la fréquence monte, enveloppe d'attaque et de chute brèves. */
  private blop(): void {
    const ctx = this.context;
    const now = ctx.currentTime;
    const pitch = bubblePitch(this.prng);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * BUBBLE_GLIDE, now + BUBBLE_SECONDS);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(1, now + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + BUBBLE_SECONDS);
    osc.connect(envelope);
    envelope.connect(this.bubbles);
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
    };
    osc.start(now);
    osc.stop(now + BUBBLE_SECONDS + 0.02);
  }
}
