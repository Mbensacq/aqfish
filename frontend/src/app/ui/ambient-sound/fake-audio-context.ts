import type {
  AudioContextLike,
  BufferLike,
  BufferSourceLike,
  FilterLike,
  GainLike,
  NodeLike,
  OscillatorLike,
  ParamLike,
  TimerLike,
} from './ambient-sound-engine';

/**
 * Double d'`AudioContext` pour les tests (#411) : consigne les nœuds créés, les connexions,
 * les démarrages et arrêts, et les valeurs visées des paramètres. N'émet aucun son.
 */

export class FakeParam implements ParamLike {
  value = 0;
  /** Dernière valeur visée par `setTargetAtTime`. */
  target: number | null = null;
  readonly events: string[] = [];
  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push(`set ${value}@${time}`);
  }
  setTargetAtTime(target: number, time: number, constant: number): void {
    this.target = target;
    this.events.push(`target ${target}@${time}/${constant}`);
  }
  exponentialRampToValueAtTime(value: number, time: number): void {
    this.events.push(`exp ${value}@${time}`);
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.events.push(`lin ${value}@${time}`);
  }
}

export class FakeNode implements NodeLike {
  readonly outputs: (NodeLike | ParamLike)[] = [];
  disconnected = false;
  constructor(readonly kind: string) {}
  connect(destination: NodeLike | ParamLike): void {
    this.outputs.push(destination);
  }
  disconnect(): void {
    this.disconnected = true;
    this.outputs.length = 0;
  }
}

export class FakeGain extends FakeNode implements GainLike {
  readonly gain = new FakeParam();
  constructor() {
    super('gain');
  }
}

export class FakeFilter extends FakeNode implements FilterLike {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
  constructor() {
    super('filter');
  }
}

class FakeSource extends FakeNode {
  started: number | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;
  start(when = 0): void {
    this.started = when;
  }
  stop(when = 0): void {
    if (this.started === null) {
      throw new Error('InvalidStateError');
    }
    this.stopped = when;
  }
}

export class FakeBufferSource extends FakeSource implements BufferSourceLike {
  buffer: unknown = null;
  loop = false;
  offset = 0;
  constructor() {
    super('buffer-source');
  }
  override start(when = 0, offset = 0): void {
    super.start(when);
    this.offset = offset;
  }
}

export class FakeOscillator extends FakeSource implements OscillatorLike {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam();
  constructor() {
    super('oscillator');
  }
}

export class FakeBuffer implements BufferLike {
  readonly data: Float32Array;
  constructor(length: number) {
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

export class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  readonly sampleRate = 8000;
  readonly destination = new FakeNode('destination');
  state = 'suspended';
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  readonly bufferSources: FakeBufferSource[] = [];
  readonly oscillators: FakeOscillator[] = [];
  resumed = 0;
  closed = 0;
  createGain(): FakeGain {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }
  createBiquadFilter(): FakeFilter {
    const node = new FakeFilter();
    this.filters.push(node);
    return node;
  }
  createBufferSource(): FakeBufferSource {
    const node = new FakeBufferSource();
    this.bufferSources.push(node);
    return node;
  }
  createOscillator(): FakeOscillator {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }
  createBuffer(_channels: number, length: number): FakeBuffer {
    return new FakeBuffer(length);
  }
  resume(): Promise<void> {
    this.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed++;
    this.state = 'closed';
    return Promise.resolve();
  }
}

/** Minuterie manuelle : `run()` exécute les rappels en attente. */
export class FakeTimer implements TimerLike {
  private next = 1;
  readonly pending = new Map<number, { callback: () => void; ms: number }>();
  setTimeout(callback: () => void, ms: number): number {
    const id = this.next++;
    this.pending.set(id, { callback, ms });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  /** Exécute les rappels en attente à cet instant (pas ceux qu'ils planifient). */
  run(): void {
    const due = [...this.pending.entries()];
    this.pending.clear();
    for (const [, { callback }] of due) {
      callback();
    }
  }
}
