import { describe, expect, it } from 'vitest';
import {
  FULL_MOTION,
  motionFactors,
  readStoredReducedMotion,
  REDUCED_MOTION,
  REDUCED_MOTION_QUERY,
  REDUCED_MOTION_STORAGE_KEY,
  resolveReducedMotion,
  systemPrefersReducedMotion,
  writeStoredReducedMotion,
  type MediaQuerySource,
  type ReducedMotionStorage,
} from './reduced-motion';
import { SAVE_STORAGE_KEY } from '../save-storage/save-storage';
import { RENDER_FILTER_STORAGE_KEY } from '../render-filter/render-filter';

function memoryStorage(): ReducedMotionStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const failing: ReducedMotionStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

/** Source de requêtes média qui répond `matches` et consigne les requêtes reçues. */
function media(matches: boolean): MediaQuerySource & { readonly queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    matchMedia: (query) => {
      queries.push(query);
      return { matches };
    },
  };
}

describe('reduced-motion : choix mémorisé', () => {
  it('clé distincte de la sauvegarde du monde et du filtre (schéma inchangé)', () => {
    expect(REDUCED_MOTION_STORAGE_KEY).toBe('aqfish.mouvements-reduits');
    expect(REDUCED_MOTION_STORAGE_KEY).not.toBe(SAVE_STORAGE_KEY);
    expect(REDUCED_MOTION_STORAGE_KEY).not.toBe(RENDER_FILTER_STORAGE_KEY);
  });

  it('aller-retour des deux choix', () => {
    const storage = memoryStorage();
    expect(writeStoredReducedMotion(storage, true)).toBe(true);
    expect(readStoredReducedMotion(storage)).toBe(true);
    expect(writeStoredReducedMotion(storage, false)).toBe(true);
    expect(readStoredReducedMotion(storage)).toBe(false);
    expect([...storage.data.keys()]).toEqual([REDUCED_MOTION_STORAGE_KEY]);
  });

  it('pas de choix : absent, valeur inconnue ou vide', () => {
    const storage = memoryStorage();
    expect(readStoredReducedMotion(storage)).toBeNull();
    for (const value of ['', 'true', 'oui', 'REDUITS', ' reduits']) {
      storage.data.set(REDUCED_MOTION_STORAGE_KEY, value);
      expect(readStoredReducedMotion(storage)).toBeNull();
    }
  });

  it('stockage absent ou qui lève : repli silencieux', () => {
    expect(readStoredReducedMotion(null)).toBeNull();
    expect(readStoredReducedMotion(failing)).toBeNull();
    expect(writeStoredReducedMotion(null, true)).toBe(false);
    expect(writeStoredReducedMotion(failing, true)).toBe(false);
  });
});

describe('reduced-motion : préférence système', () => {
  it('lit la requête prefers-reduced-motion: reduce', () => {
    const on = media(true);
    expect(systemPrefersReducedMotion(on)).toBe(true);
    expect(on.queries).toEqual([REDUCED_MOTION_QUERY]);
    expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
    expect(systemPrefersReducedMotion(media(false))).toBe(false);
  });

  it('faux sans source, sans matchMedia, si matchMedia lève ou renvoie rien', () => {
    expect(systemPrefersReducedMotion(null)).toBe(false);
    expect(systemPrefersReducedMotion({})).toBe(false);
    expect(
      systemPrefersReducedMotion({
        matchMedia: () => {
          throw new Error('non pris en charge');
        },
      }),
    ).toBe(false);
    expect(
      systemPrefersReducedMotion({
        matchMedia: () => null as unknown as { matches: boolean },
      }),
    ).toBe(false);
  });
});

describe('reduced-motion : priorité des sources', () => {
  it('sans choix mémorisé, la préférence système décide', () => {
    expect(resolveReducedMotion(null, true)).toBe(true);
    expect(resolveReducedMotion(null, false)).toBe(false);
  });

  it('le choix mémorisé l’emporte sur le système, dans les deux sens', () => {
    expect(resolveReducedMotion(false, true)).toBe(false);
    expect(resolveReducedMotion(true, false)).toBe(true);
    expect(resolveReducedMotion(true, true)).toBe(true);
    expect(resolveReducedMotion(false, false)).toBe(false);
  });
});

describe('reduced-motion : facteurs', () => {
  it('mouvements normaux : tous les facteurs valent exactement 1', () => {
    expect(motionFactors(false)).toBe(FULL_MOTION);
    for (const value of Object.values(FULL_MOTION)) {
      expect(value).toBe(1);
    }
  });

  it('mouvements réduits : caméra qui saute, parallaxe coupée, rayons de lumière fixes', () => {
    expect(motionFactors(true)).toBe(REDUCED_MOTION);
    expect(REDUCED_MOTION.cameraTransition).toBe(0);
    expect(REDUCED_MOTION.parallax).toBe(0);
    expect(REDUCED_MOTION.lightRays).toBe(0);
  });

  it('mouvements réduits : eau, plantes et pluie fortement atténuées, pas supprimées', () => {
    for (const key of ['waterWave', 'plantSway', 'rainSpeed'] as const) {
      expect(REDUCED_MOTION[key], key).toBeGreaterThan(0);
      expect(REDUCED_MOTION[key], key).toBeLessThanOrEqual(0.5);
    }
  });

  it('mêmes clés dans les deux jeux, tables figées', () => {
    expect(Object.keys(REDUCED_MOTION).sort()).toEqual(Object.keys(FULL_MOTION).sort());
    expect(Object.isFrozen(FULL_MOTION)).toBe(true);
    expect(Object.isFrozen(REDUCED_MOTION)).toBe(true);
  });
});
