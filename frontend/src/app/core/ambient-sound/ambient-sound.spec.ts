import { describe, expect, it } from 'vitest';
import {
  AMBIENT_SOUND_SEED,
  AMBIENT_SOUND_STORAGE_KEY,
  ambientLevels,
  BUBBLER_SOUND,
  bubblePitch,
  clampVolume,
  createAmbientPrng,
  DEFAULT_AMBIENT_VOLUME,
  ENVIRONMENT_SOUNDS,
  fillNoise,
  IDLE_BUBBLE_DELAY,
  limitPeak,
  MAX_PEAK,
  MIN_BUBBLE_DELAY,
  nextBubbleDelay,
  NIGHT_FACTOR,
  peakLevel,
  phaseFactor,
  RAIN_LEVEL,
  readStoredAmbientSound,
  SILENT_LEVELS,
  WATER_LFO_DEPTH,
  writeStoredAmbientSound,
  type AmbientLevels,
  type AmbientScene,
  type AmbientSoundStorage,
} from './ambient-sound';
import { SAVE_STORAGE_KEY } from '../save-storage/save-storage';
import { REDUCED_MOTION_STORAGE_KEY } from '../reduced-motion/reduced-motion';
import { RENDER_FILTER_STORAGE_KEY } from '../render-filter/render-filter';
import { createPrng, type Prng } from '../random/prng';
// Source du module lue comme texte (attribut d'import du builder), pour vérifier qu'il
// n'importe rien de la simulation. TypeScript ne connaît pas ce chargeur pour un `.ts`.
// @ts-expect-error -- import d'un `.ts` comme texte, résolu par esbuild.
import source from './ambient-sound.ts' with { loader: 'text' };

function memoryStorage(): AmbientSoundStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const failing: AmbientSoundStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

const DAY: AmbientScene = {
  environment: 'tropical',
  phase: 'jour',
  rain: false,
  bubbler: false,
  silenced: false,
};

/** Générateur qui renvoie toujours `u`. */
function constant(u: number): Prng {
  return { next: () => u, nextUint32: () => Math.floor(u * 2 ** 32) } as Prng;
}

describe('ambient-sound : volume', () => {
  it('borné à [0, 1]', () => {
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(1)).toBe(1);
    expect(clampVolume(0.42)).toBe(0.42);
    expect(clampVolume(-0.5)).toBe(0);
    expect(clampVolume(7)).toBe(1);
  });

  it('NaN, infini ou non numérique : volume par défaut (30 %)', () => {
    expect(DEFAULT_AMBIENT_VOLUME).toBe(0.3);
    for (const value of [NaN, Infinity, -Infinity, '0.5', null, undefined, {}]) {
      expect(clampVolume(value), String(value)).toBe(DEFAULT_AMBIENT_VOLUME);
    }
  });
});

describe('ambient-sound : choix mémorisé', () => {
  it('clé distincte de la sauvegarde du monde et des autres préférences', () => {
    expect(AMBIENT_SOUND_STORAGE_KEY).toBe('aqfish.sons');
    for (const key of [SAVE_STORAGE_KEY, REDUCED_MOTION_STORAGE_KEY, RENDER_FILTER_STORAGE_KEY]) {
      expect(AMBIENT_SOUND_STORAGE_KEY).not.toBe(key);
    }
  });

  it('aller-retour : activé ou non, volume au pour cent', () => {
    const storage = memoryStorage();
    expect(writeStoredAmbientSound(storage, { enabled: true, volume: 0.3 })).toBe(true);
    expect(storage.data.get(AMBIENT_SOUND_STORAGE_KEY)).toBe('actif:30');
    expect(readStoredAmbientSound(storage)).toEqual({ enabled: true, volume: 0.3 });
    expect(writeStoredAmbientSound(storage, { enabled: false, volume: 1 })).toBe(true);
    expect(readStoredAmbientSound(storage)).toEqual({ enabled: false, volume: 1 });
    expect(writeStoredAmbientSound(storage, { enabled: true, volume: 0 })).toBe(true);
    expect(readStoredAmbientSound(storage)).toEqual({ enabled: true, volume: 0 });
    expect([...storage.data.keys()]).toEqual([AMBIENT_SOUND_STORAGE_KEY]);
  });

  it('écriture : volume borné et arrondi, NaN pris au défaut', () => {
    const storage = memoryStorage();
    writeStoredAmbientSound(storage, { enabled: true, volume: 0.456 });
    expect(storage.data.get(AMBIENT_SOUND_STORAGE_KEY)).toBe('actif:46');
    writeStoredAmbientSound(storage, { enabled: true, volume: 3 });
    expect(storage.data.get(AMBIENT_SOUND_STORAGE_KEY)).toBe('actif:100');
    writeStoredAmbientSound(storage, { enabled: false, volume: NaN });
    expect(storage.data.get(AMBIENT_SOUND_STORAGE_KEY)).toBe('muet:30');
  });

  it('pas de choix : absent, vide ou valeur inconnue', () => {
    const storage = memoryStorage();
    expect(readStoredAmbientSound(storage)).toBeNull();
    for (const value of [
      '',
      'actif',
      'true',
      'actif:',
      'actif:101',
      'actif:1000',
      'actif:-5',
      'actif:3.5',
      ' actif:30',
      'ACTIF:30',
      'oui:30',
      '{"enabled":true}',
    ]) {
      storage.data.set(AMBIENT_SOUND_STORAGE_KEY, value);
      expect(readStoredAmbientSound(storage), value).toBeNull();
    }
  });

  it('stockage absent ou qui lève : repli silencieux', () => {
    expect(readStoredAmbientSound(null)).toBeNull();
    expect(readStoredAmbientSound(failing)).toBeNull();
    expect(writeStoredAmbientSound(null, { enabled: true, volume: 0.3 })).toBe(false);
    expect(writeStoredAmbientSound(failing, { enabled: true, volume: 0.3 })).toBe(false);
  });
});

describe('ambient-sound : niveaux des couches', () => {
  it('bac tropical de jour, sans bulleur ni pluie : eau et rares bulles', () => {
    const levels = ambientLevels(DAY, 1);
    expect(levels.water).toBe(ENVIRONMENT_SOUNDS['tropical'].water);
    expect(levels.bubbles).toBe(ENVIRONMENT_SOUNDS['tropical'].bubbles);
    expect(levels.bubbleRate).toBe(ENVIRONMENT_SOUNDS['tropical'].bubbleRate);
    expect(levels.rain).toBe(0);
  });

  it('chaque environnement connu a ses niveaux, tous dans ]0, 1[', () => {
    for (const id of ['tropical', 'bassin', 'paludarium', 'recif', 'eaufroide']) {
      const sound = ENVIRONMENT_SOUNDS[id];
      expect(sound, id).toBeDefined();
      const levels = ambientLevels({ ...DAY, environment: id }, 1);
      for (const value of [levels.water, levels.bubbles]) {
        expect(value, id).toBeGreaterThan(0);
        expect(value, id).toBeLessThan(1);
      }
    }
    expect(ambientLevels({ ...DAY, environment: 'bassin' }, 1).water).toBeLessThan(
      ambientLevels(DAY, 1).water,
    );
  });

  it('environnement inconnu, vide ou nom de propriété héritée : niveaux par défaut', () => {
    const reference = ambientLevels(DAY, 1);
    for (const environment of ['inconnu', '', 'toString', '__proto__', 'constructor']) {
      expect(ambientLevels({ ...DAY, environment }, 1), environment).toEqual(reference);
    }
  });

  it('bulleur : bulles plus nombreuses et plus fortes', () => {
    const without = ambientLevels(DAY, 1);
    const withBubbler = ambientLevels({ ...DAY, bubbler: true }, 1);
    expect(withBubbler.bubbleRate).toBe(BUBBLER_SOUND.bubbleRate);
    expect(withBubbler.bubbleRate).toBeGreaterThan(5 * without.bubbleRate);
    expect(withBubbler.bubbles).toBeGreaterThan(without.bubbles);
    expect(withBubbler.water).toBe(without.water);
  });

  it('pluie : couche de pluie au niveau de jeu, le reste inchangé', () => {
    const dry = ambientLevels({ ...DAY, environment: 'bassin' }, 1);
    const wet = ambientLevels({ ...DAY, environment: 'bassin', rain: true }, 1);
    expect(wet.rain).toBe(RAIN_LEVEL);
    expect({ ...wet, rain: 0 }).toEqual(dry);
  });

  it('nuit : niveau général réduit de moitié, rythme des bulles inchangé', () => {
    expect(NIGHT_FACTOR).toBe(0.5);
    const day = ambientLevels({ ...DAY, rain: true, bubbler: true }, 0.8);
    const night = ambientLevels({ ...DAY, rain: true, bubbler: true, phase: 'nuit' }, 0.8);
    expect(night.water).toBeCloseTo(day.water / 2, 12);
    expect(night.bubbles).toBeCloseTo(day.bubbles / 2, 12);
    expect(night.rain).toBeCloseTo(day.rain / 2, 12);
    expect(night.bubbleRate).toBe(day.bubbleRate);
  });

  it('aube, crépuscule et moment inconnu : comme le jour', () => {
    for (const phase of ['jour', 'aube', 'crepuscule', 'inconnu', '']) {
      expect(phaseFactor(phase), phase).toBe(1);
    }
    expect(phaseFactor('nuit')).toBe(NIGHT_FACTOR);
  });

  it('proportionnel au volume ; volume borné ; NaN pris au défaut', () => {
    const full = ambientLevels({ ...DAY, rain: true }, 1);
    const half = ambientLevels({ ...DAY, rain: true }, 0.5);
    expect(half.water).toBeCloseTo(full.water / 2, 12);
    expect(half.rain).toBeCloseTo(full.rain / 2, 12);
    expect(ambientLevels(DAY, 5)).toEqual(ambientLevels(DAY, 1));
    expect(ambientLevels(DAY, NaN)).toEqual(ambientLevels(DAY, DEFAULT_AMBIENT_VOLUME));
    expect(ambientLevels(DAY, undefined)).toEqual(ambientLevels(DAY, DEFAULT_AMBIENT_VOLUME));
  });

  it('silence : son coupé, volume nul ou négatif', () => {
    const loud = { ...DAY, rain: true, bubbler: true };
    expect(ambientLevels({ ...loud, silenced: true }, 1)).toBe(SILENT_LEVELS);
    expect(ambientLevels(loud, 0)).toBe(SILENT_LEVELS);
    expect(ambientLevels(loud, -1)).toBe(SILENT_LEVELS);
    expect(Object.values(SILENT_LEVELS).every((value) => value === 0)).toBe(true);
  });

  it('aucun niveau ne dépasse 1, quel que soit le contexte', () => {
    for (const environment of Object.keys(ENVIRONMENT_SOUNDS)) {
      for (const rain of [false, true]) {
        for (const bubbler of [false, true]) {
          const levels = ambientLevels({ ...DAY, environment, rain, bubbler }, 1);
          for (const key of ['water', 'bubbles', 'rain'] as const) {
            expect(levels[key]).toBeGreaterThanOrEqual(0);
            expect(levels[key]).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('tables figées', () => {
    expect(Object.isFrozen(ENVIRONMENT_SOUNDS)).toBe(true);
    expect(Object.isFrozen(SILENT_LEVELS)).toBe(true);
    expect(Object.isFrozen(BUBBLER_SOUND)).toBe(true);
  });
});

describe('ambient-sound : marge de niveau (#413)', () => {
  const PHASES = ['jour', 'aube', 'crepuscule', 'nuit'];
  const VOLUMES = [0, 0.05, 0.3, 0.5, 0.75, 0.9, 1];

  /** Toutes les scènes possibles : environnements connus et inconnu, pluie, bulleur, moment. */
  function* scenes(): Generator<AmbientScene> {
    for (const environment of [...Object.keys(ENVIRONMENT_SOUNDS), 'inconnu']) {
      for (const phase of PHASES) {
        for (const rain of [false, true]) {
          for (const bubbler of [false, true]) {
            yield { environment, phase, rain, bubbler, silenced: false };
          }
        }
      }
    }
  }

  it('crête : eau au sommet du LFO + un blop + pluie', () => {
    expect(WATER_LFO_DEPTH).toBe(0.35);
    expect(peakLevel({ water: 0.4, bubbles: 0.2, bubbleRate: 3, rain: 0.1 })).toBeCloseTo(
      0.4 * 1.35 + 0.2 + 0.1,
      12,
    );
    expect(peakLevel(SILENT_LEVELS)).toBe(0);
  });

  it('sans limite, la somme dépasse la pleine échelle : pluie et bulleur à volume 100 %', () => {
    // Raison d'être de `limitPeak` : récif sous la pluie avec bulleur, 0,45 × 1,35 + 0,4 + 0,6.
    const loud = ambientLevels({ ...DAY, environment: 'recif', rain: true, bubbler: true }, 1);
    expect(peakLevel(loud)).toBeCloseTo(1.6075, 12);
    expect(peakLevel(loud)).toBeGreaterThan(MAX_PEAK);
  });

  it('somme des niveaux maximaux bornée à MAX_PEAK pour toute scène et tout volume', () => {
    expect(MAX_PEAK).toBe(1);
    let worst = 0;
    for (const scene of scenes()) {
      for (const volume of VOLUMES) {
        const limited = limitPeak(ambientLevels(scene, volume));
        const peak = peakLevel(limited);
        expect(peak, `${JSON.stringify(scene)} @ ${volume}`).toBeLessThanOrEqual(MAX_PEAK + 1e-12);
        worst = Math.max(worst, peak);
      }
    }
    // La borne est atteinte (pas de marge gaspillée) au pire cas.
    expect(worst).toBeCloseTo(MAX_PEAK, 12);
  });

  it('sous la borne : niveaux inchangés (même objet), réglage par défaut compris', () => {
    for (const scene of scenes()) {
      const levels = ambientLevels(scene, DEFAULT_AMBIENT_VOLUME);
      expect(peakLevel(levels)).toBeLessThanOrEqual(MAX_PEAK);
      expect(limitPeak(levels)).toBe(levels);
    }
    expect(limitPeak(SILENT_LEVELS)).toBe(SILENT_LEVELS);
  });

  it('au-dessus : toutes les couches réduites dans la même proportion, rythme intact', () => {
    const loud: AmbientLevels = { water: 0.6, bubbles: 0.5, bubbleRate: 2.5, rain: 0.9 };
    const limited = limitPeak(loud);
    expect(peakLevel(limited)).toBeCloseTo(MAX_PEAK, 12);
    const scale = limited.water / loud.water;
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThan(1);
    expect(limited.bubbles / loud.bubbles).toBeCloseTo(scale, 12);
    expect(limited.rain / loud.rain).toBeCloseTo(scale, 12);
    expect(limited.bubbleRate).toBe(loud.bubbleRate);
    expect(loud.water).toBe(0.6);
  });

  it('niveaux non finis : rendus tels quels, sans lever', () => {
    const odd: AmbientLevels = { water: NaN, bubbles: 0, bubbleRate: 0, rain: 0 };
    expect(limitPeak(odd)).toBe(odd);
  });
});

describe('ambient-sound : rythme des bulles', () => {
  it('moyenne proche de 1 / rythme, jamais sous le délai minimal', () => {
    const prng = createAmbientPrng();
    const rate = 2.5;
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const delay = nextBubbleDelay(prng, rate);
      expect(delay).toBeGreaterThanOrEqual(MIN_BUBBLE_DELAY);
      sum += delay;
    }
    expect(sum / n).toBeGreaterThan(0.85 / rate);
    expect(sum / n).toBeLessThan(1.25 / rate);
  });

  it('extrêmes du tirage : 0 donne le délai minimal, presque 1 reste fini', () => {
    expect(nextBubbleDelay(constant(0), 2.5)).toBe(MIN_BUBBLE_DELAY);
    const late = nextBubbleDelay(constant(1 - 2 ** -32), 2.5);
    expect(Number.isFinite(late)).toBe(true);
    expect(late).toBeGreaterThan(5);
  });

  it('rythme nul, négatif ou non fini : attente sans bulle', () => {
    for (const rate of [0, -1, NaN, Infinity]) {
      expect(nextBubbleDelay(createAmbientPrng(), rate), String(rate)).toBe(IDLE_BUBBLE_DELAY);
    }
  });

  it('hauteur des « blop » dans [320, 720)', () => {
    expect(bubblePitch(constant(0))).toBe(320);
    expect(bubblePitch(constant(0.999999))).toBeLessThan(720);
    const prng = createAmbientPrng();
    for (let i = 0; i < 200; i++) {
      const pitch = bubblePitch(prng);
      expect(pitch).toBeGreaterThanOrEqual(320);
      expect(pitch).toBeLessThan(720);
    }
  });
});

describe('ambient-sound : hasard propre au son', () => {
  it('graine fixe : même suite à chaque session', () => {
    const a = createAmbientPrng();
    const b = createPrng(AMBIENT_SOUND_SEED);
    for (let i = 0; i < 16; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('bruit blanc reproductible, dans [-1, 1), centré', () => {
    const first = new Float32Array(4096);
    const second = new Float32Array(4096);
    fillNoise(first, createAmbientPrng());
    fillNoise(second, createAmbientPrng());
    expect(second).toEqual(first);
    let sum = 0;
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThan(1);
      sum += value;
    }
    expect(Math.abs(sum / first.length)).toBeLessThan(0.05);
    expect(new Set(first).size).toBeGreaterThan(4000);
  });

  it('tampon vide : rien à remplir, aucune erreur', () => {
    expect(() => fillNoise(new Float32Array(0), createAmbientPrng())).not.toThrow();
  });

  it('le module n’importe rien de la simulation (ni du rendu, ni d’Angular)', () => {
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const path of imports) {
      expect(path, path).not.toMatch(/(^|\/)(sim|render|ui)(\/|$)|^@angular|^three/);
    }
  });
});
