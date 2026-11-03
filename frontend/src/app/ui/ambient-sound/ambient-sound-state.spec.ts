import { TestBed } from '@angular/core/testing';

import {
  AMBIENT_SOUND_STORAGE_KEY,
  ambientLevels,
  DEFAULT_AMBIENT_VOLUME,
  MAX_PEAK,
  peakLevel,
  SILENT_LEVELS,
  type AmbientScene,
} from '../../core/ambient-sound/ambient-sound';
import {
  AMBIENT_SOUND_TIMER,
  AmbientSoundState,
  AUDIO_CONTEXT_FACTORY,
  type AudioContextFactory,
} from './ambient-sound-state';
import { FakeAudioContext, FakeTimer } from './fake-audio-context';

const SCENE: AmbientScene = {
  environment: 'bassin',
  phase: 'jour',
  rain: true,
  bubbler: false,
  silenced: false,
};

describe('AmbientSoundState (#411)', () => {
  let contexts: FakeAudioContext[];
  let timer: FakeTimer;

  function setup(factory: AudioContextFactory | null | 'default' = 'default'): AmbientSoundState {
    contexts = [];
    timer = new FakeTimer();
    const fabrique: AudioContextFactory | null =
      factory === 'default'
        ? () => {
            const ctx = new FakeAudioContext();
            contexts.push(ctx);
            return ctx;
          }
        : factory;
    TestBed.configureTestingModule({
      providers: [
        { provide: AUDIO_CONTEXT_FACTORY, useValue: fabrique },
        { provide: AMBIENT_SOUND_TIMER, useValue: timer },
      ],
    });
    return TestBed.inject(AmbientSoundState);
  }

  /** Gains visés des couches eau, pluie et bulles du contexte `ctx`. */
  function layerTargets(ctx: FakeAudioContext): (number | null)[] {
    return ctx.gains.slice(1, 4).map((gain) => gain.gain.target);
  }

  function setHidden(hidden: boolean): void {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    delete (document as { hidden?: boolean }).hidden;
  });

  it('désactivé par défaut, volume 30 %, aucun contexte audio créé', () => {
    const state = setup();
    state.setScene(SCENE);
    expect(state.available()).toBe(true);
    expect(state.enabled()).toBe(false);
    expect(state.volume()).toBe(DEFAULT_AMBIENT_VOLUME);
    expect(state.levels()).toBe(SILENT_LEVELS);
    expect(contexts).toHaveLength(0);
    document.dispatchEvent(new Event('pointerdown'));
    expect(contexts).toHaveLength(0);
  });

  it('case cochée : un seul contexte, repris s’il est suspendu, niveaux de la scène', () => {
    const state = setup();
    state.setScene(SCENE);
    state.setEnabled(true);
    state.setEnabled(true);
    expect(contexts).toHaveLength(1);
    expect(state.playing()).toBe(true);
    expect(contexts[0].resumed).toBe(1);
    const expected = ambientLevels(SCENE, DEFAULT_AMBIENT_VOLUME);
    expect(state.levels()).toEqual(expected);
    expect(layerTargets(contexts[0])).toEqual([expected.water, expected.rain, expected.bubbles]);
    expect(localStorage.getItem(AMBIENT_SOUND_STORAGE_KEY)).toBe('actif:30');
  });

  it('case décochée : contexte fermé, choix mémorisé ; recochée : nouveau contexte', () => {
    const state = setup();
    state.setEnabled(true);
    state.setEnabled(false);
    expect(contexts[0].closed).toBe(1);
    expect(state.playing()).toBe(false);
    expect(localStorage.getItem(AMBIENT_SOUND_STORAGE_KEY)).toBe('muet:30');
    state.setEnabled(true);
    expect(contexts).toHaveLength(2);
    expect(contexts[1].closed).toBe(0);
  });

  it('volume : borné, appliqué en direct, mémorisé ; NaN au défaut', () => {
    const state = setup();
    state.setScene(SCENE);
    state.setEnabled(true);
    state.setVolume(0.8);
    expect(state.volume()).toBe(0.8);
    expect(layerTargets(contexts[0])[1]).toBeCloseTo(ambientLevels(SCENE, 0.8).rain, 12);
    expect(localStorage.getItem(AMBIENT_SOUND_STORAGE_KEY)).toBe('actif:80');
    state.setVolume(4);
    expect(state.volume()).toBe(1);
    state.setVolume(-1);
    expect(state.volume()).toBe(0);
    expect(layerTargets(contexts[0])).toEqual([0, 0, 0]);
    state.setVolume(NaN);
    expect(state.volume()).toBe(DEFAULT_AMBIENT_VOLUME);
  });

  it('volume réglé case décochée : mémorisé, aucun contexte créé', () => {
    const state = setup();
    state.setVolume(0.55);
    expect(contexts).toHaveLength(0);
    expect(localStorage.getItem(AMBIENT_SOUND_STORAGE_KEY)).toBe('muet:55');
  });

  it('onglet masqué : couches à zéro par fondu, reprise au retour', () => {
    const state = setup();
    state.setScene(SCENE);
    state.setEnabled(true);
    setHidden(true);
    expect(state.levels()).toBe(SILENT_LEVELS);
    expect(layerTargets(contexts[0])).toEqual([0, 0, 0]);
    setHidden(false);
    expect(state.levels()).toEqual(ambientLevels(SCENE, DEFAULT_AMBIENT_VOLUME));
    expect(contexts).toHaveLength(1);
  });

  it('simulation en pause ou scène absente : silence, contexte conservé', () => {
    const state = setup();
    state.setScene(SCENE);
    state.setEnabled(true);
    state.setScene({ ...SCENE, silenced: true });
    expect(layerTargets(contexts[0])).toEqual([0, 0, 0]);
    state.setScene(SCENE);
    expect(layerTargets(contexts[0])[1]).toBeGreaterThan(0);
    state.setScene(null);
    expect(state.levels()).toBe(SILENT_LEVELS);
    expect(contexts[0].closed).toBe(0);
  });

  it('choix « actif » mémorisé : case cochée, contexte créé au premier geste seulement', () => {
    localStorage.setItem(AMBIENT_SOUND_STORAGE_KEY, 'actif:40');
    const state = setup();
    state.setScene(SCENE);
    expect(state.enabled()).toBe(true);
    expect(state.volume()).toBe(0.4);
    expect(contexts).toHaveLength(0);
    document.dispatchEvent(new Event('keydown'));
    expect(contexts).toHaveLength(1);
    document.dispatchEvent(new Event('pointerdown'));
    expect(contexts).toHaveLength(1);
    expect(state.levels()).toEqual(ambientLevels(SCENE, 0.4));
  });

  it('choix mémorisé décoché avant tout geste : le geste suivant ne démarre rien', () => {
    localStorage.setItem(AMBIENT_SOUND_STORAGE_KEY, 'actif:40');
    const state = setup();
    state.setEnabled(false);
    document.dispatchEvent(new Event('pointerdown'));
    expect(contexts).toHaveLength(0);
  });

  it('choix inconnu ou stockage qui lève : pas de choix, défauts', () => {
    localStorage.setItem(AMBIENT_SOUND_STORAGE_KEY, 'actif:500');
    const state = setup();
    expect(state.enabled()).toBe(false);
    expect(state.volume()).toBe(DEFAULT_AMBIENT_VOLUME);
  });

  it('écriture refusée par le stockage : le choix vaut pour la session', () => {
    const state = setup();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      state.setEnabled(true);
      state.setVolume(0.6);
      expect(state.enabled()).toBe(true);
      expect(state.volume()).toBe(0.6);
    } finally {
      spy.mockRestore();
    }
  });

  it('navigateur sans Web Audio : indisponible, case inerte, aucune erreur', () => {
    localStorage.setItem(AMBIENT_SOUND_STORAGE_KEY, 'actif:40');
    const state = setup(null);
    expect(state.available()).toBe(false);
    expect(state.enabled()).toBe(false);
    expect(() => state.setEnabled(true)).not.toThrow();
    expect(state.enabled()).toBe(false);
    expect(state.refused()).toBe(false);
    expect(() => document.dispatchEvent(new Event('pointerdown'))).not.toThrow();
  });

  it('création du contexte refusée : indisponible, case décochée, aucune erreur', () => {
    const state = setup(() => {
      throw new Error('NotAllowedError');
    });
    expect(() => state.setEnabled(true)).not.toThrow();
    expect(state.available()).toBe(false);
    expect(state.refused()).toBe(true);
    expect(state.enabled()).toBe(false);
    expect(state.playing()).toBe(false);
  });

  it('marge de niveau (#413) : volume 100 %, pluie et bulleur, crête ramenée à MAX_PEAK', () => {
    const state = setup();
    expect(state.refused()).toBe(false);
    const loud: AmbientScene = { ...SCENE, environment: 'recif', bubbler: true };
    state.setScene(loud);
    state.setEnabled(true);
    state.setVolume(1);
    expect(peakLevel(ambientLevels(loud, 1))).toBeGreaterThan(MAX_PEAK);
    expect(peakLevel(state.levels())).toBeCloseTo(MAX_PEAK, 12);
    const [water, rain, bubbles] = layerTargets(contexts[0]);
    expect(water).toBeCloseTo(state.levels().water, 12);
    expect(rain).toBeCloseTo(state.levels().rain, 12);
    expect(bubbles).toBeCloseTo(state.levels().bubbles, 12);
  });

  it('contexte créé mais moteur impossible à monter : contexte refermé', () => {
    const broken = new FakeAudioContext();
    broken.createGain = () => {
      throw new Error('NotSupportedError');
    };
    const state = setup(() => broken);
    state.setEnabled(true);
    expect(broken.closed).toBe(1);
    expect(state.available()).toBe(false);
  });

  it('destruction de l’injecteur : contexte fermé, écouteurs retirés', () => {
    localStorage.setItem(AMBIENT_SOUND_STORAGE_KEY, 'actif:30');
    const state = setup();
    state.setEnabled(false);
    state.setEnabled(true);
    TestBed.resetTestingModule();
    expect(contexts[0].closed).toBe(1);
    document.dispatchEvent(new Event('pointerdown'));
    expect(contexts).toHaveLength(1);
  });

  it('mode capture : aucun contexte, ni au geste ni case cochée ; moteur en marche arrêté', () => {
    localStorage.setItem(AMBIENT_SOUND_STORAGE_KEY, 'actif:30');
    const state = setup();
    state.forbid();
    document.dispatchEvent(new Event('pointerdown'));
    state.setEnabled(true);
    expect(contexts).toHaveLength(0);
    TestBed.resetTestingModule();
    const running = setup();
    running.setEnabled(true);
    running.forbid();
    expect(contexts[0].closed).toBe(1);
    expect(running.playing()).toBe(false);
  });

  it('fabrique par défaut : présente si la fenêtre a AudioContext, sinon null', () => {
    const win = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
    const saved = win.AudioContext;
    try {
      win.AudioContext = FakeAudioContext;
      const factory = TestBed.inject(AUDIO_CONTEXT_FACTORY);
      expect(typeof factory).toBe('function');
      expect(factory?.()).toBeInstanceOf(FakeAudioContext);
      TestBed.resetTestingModule();
      delete win.AudioContext;
      expect(TestBed.inject(AUDIO_CONTEXT_FACTORY)).toBeNull();
    } finally {
      if (saved === undefined) {
        delete win.AudioContext;
      } else {
        win.AudioContext = saved;
      }
    }
  });
});
