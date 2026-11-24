import { describe, expect, it } from 'vitest';

import { ENVIRONMENT_IDS, environmentById } from './environment';
import { approx, gh, kh, range, sourced, APPROXIMATION } from './sheet-field';
import { SPECIES, type SpeciesId } from './species';
import { PREDATION_SIZE_FRACTION, SLOW_SWIMMERS } from './verdict-data';
import {
  combinedStatus,
  overlaps,
  profileVerdict,
  verdict,
  verdictProfile,
  type VerdictProfile,
  type WaterRanges,
} from './verdict';

const IDS = Object.keys(SPECIES) as SpeciesId[];

function ranges(preferred: [number, number], tolerated: [number, number]): WaterRanges {
  return { preferred: approx(range(...preferred)), tolerated: approx(range(...tolerated)) };
}

/** Profil neutre : eau douce tropicale, plages larges, aucun comportement particulier. */
function profile(species: SpeciesId, overrides: Partial<VerdictProfile> = {}): VerdictProfile {
  return {
    species,
    salinity: 'douce',
    thermal: 'tropicale',
    temperature: ranges([22, 26], [20, 28]),
    ph: ranges([6.5, 7.5], [6, 8]),
    hardness: { preferred: approx(gh(5, 15)), tolerated: approx(gh(3, 20)) },
    adultSize: 5,
    diet: 'omnivore',
    predator: false,
    prey: approx([]),
    amphibian: false,
    territorial: approx(false),
    finNipper: approx(false),
    longFins: approx(false),
    fastSwimmer: approx(false),
    slowSwimmer: approx(false),
    livesWithoutFish: approx(false),
    ...overrides,
  };
}

function causes(a: VerdictProfile, b: VerdictProfile): string[] {
  return profileVerdict(a, b).reasons.map((r) => `${r.cause}:${r.level}`);
}

describe('verdict par paire : eau (#816)', () => {
  it('eau douce et eau de mer : incompatibles par la salinité, sans comparer les plages', () => {
    const v = verdict('neon', 'clown');
    expect(v.level).toBe('incompatible');
    expect(v.reasons.filter((r) => r.axis === 'eau').map((r) => r.cause)).toEqual(['salinite']);
  });

  it('néon et poisson rouge : incompatibles par la température (eau froide et tropicale)', () => {
    const v = verdict('neon', 'rouge');
    expect(v.level).toBe('incompatible');
    expect(v.reasons.map((r) => r.cause)).toEqual(['classe-thermique']);
  });

  it('eau tempérée et eau froide : pas de classe différente, les plages décident', () => {
    const a = profile('triton', { thermal: 'temperee' });
    const b = profile('rouge', { thermal: 'froide' });
    expect(profileVerdict(a, b).level).toBe('compatible');
  });

  it('plages préférées qui se recouvrent : compatible, sans raison', () => {
    expect(profileVerdict(profile('neon'), profile('guppy'))).toEqual({
      level: 'compatible',
      reasons: [],
    });
  });

  it('plages préférées aux bornes égales : elles se recouvrent', () => {
    const a = profile('neon', { temperature: ranges([20, 22], [18, 26]) });
    const b = profile('guppy', { temperature: ranges([22, 26], [18, 28]) });
    expect(profileVerdict(a, b).level).toBe('compatible');
  });

  it('seules les plages tolérées se recouvrent : précautions', () => {
    const a = profile('neon', { temperature: ranges([20, 21], [18, 24]) });
    const b = profile('guppy', { temperature: ranges([23, 26], [22, 28]) });
    expect(causes(a, b)).toEqual(['temperature:precautions']);
  });

  it('plages tolérées aux bornes égales seulement : précautions', () => {
    const a = profile('neon', { ph: ranges([5, 5.5], [4.5, 6.5]) });
    const b = profile('guppy', { ph: ranges([7, 8], [6.5, 8.5]) });
    expect(causes(a, b)).toEqual(['ph:precautions']);
  });

  it('aucun recouvrement : incompatible', () => {
    const a = profile('neon', {
      hardness: { preferred: approx(gh(1, 3)), tolerated: approx(gh(0, 4)) },
    });
    const b = profile('guppy', {
      hardness: { preferred: approx(gh(15, 25)), tolerated: approx(gh(10, 30)) },
    });
    expect(causes(a, b)).toEqual(['durete:incompatible']);
  });

  it('espèce sans dureté : la dureté n’est pas comparée', () => {
    const a = profile('neon', { hardness: null });
    const b = profile('guppy', {
      hardness: { preferred: approx(gh(40, 50)), tolerated: approx(gh(40, 50)) },
    });
    expect(profileVerdict(a, b).level).toBe('compatible');
    expect(profileVerdict(b, a).level).toBe('compatible');
  });

  it('duretés de natures différentes (GH et KH) : non comparées', () => {
    const a = profile('neon', {
      hardness: { preferred: approx(gh(1, 2)), tolerated: approx(gh(1, 2)) },
    });
    const b = profile('guppy', {
      hardness: { preferred: approx(kh(8, 9)), tolerated: approx(kh(8, 9)) },
    });
    expect(profileVerdict(a, b).level).toBe('compatible');
  });

  it('incompatibilité de plages : source des plages tolérées, si toutes deux sourcées', () => {
    const a = profile('neon', {
      temperature: { preferred: approx(range(20, 21)), tolerated: sourced(range(18, 21), 'A') },
    });
    const b = profile('guppy', {
      temperature: { preferred: approx(range(25, 26)), tolerated: sourced(range(24, 28), 'B') },
    });
    expect(profileVerdict(a, b).reasons[0].status).toEqual({ kind: 'source', reference: 'A ; B' });
  });
});

describe('verdict par paire : prédation (#816)', () => {
  it('crevette cerise et poisson rouge : prédation des adultes, sourcée (Practical Fishkeeping)', () => {
    const predation = verdict('cerise', 'rouge').reasons.find((r) => r.axis === 'predation');
    expect(predation).toMatchObject({
      cause: 'mange-adultes',
      level: 'incompatible',
      actor: 'rouge',
    });
    expect(predation?.status).toMatchObject({ kind: 'source' });
    expect(predation?.status.kind === 'source' && predation.status.reference).toContain(
      'practicalfishkeeping',
    );
  });

  it('guppy et crevette cerise : mange les jeunes, précautions', () => {
    const v = verdict('guppy', 'cerise');
    expect(v.level).toBe('precautions');
    expect(v.reasons).toEqual([
      expect.objectContaining({ cause: 'mange-jeunes', level: 'precautions', actor: 'guppy' }),
    ]);
  });

  it('règle de taille : un prédateur du jeu mange la proie plus petite que la fraction', () => {
    const v = verdict('koi', 'grenouille');
    expect(v.reasons).toContainEqual(
      expect.objectContaining({ cause: 'taille', actor: 'koi', status: APPROXIMATION }),
    );
  });

  it('règle de taille : proie exactement à la fraction, épargnée', () => {
    const eater = profile('koi', { predator: true, adultSize: 30 });
    const prey = profile('neon', { adultSize: 30 * PREDATION_SIZE_FRACTION });
    expect(profileVerdict(eater, prey).level).toBe('compatible');
  });

  it('règle de taille : ni pour un non-prédateur, ni pour un herbivore', () => {
    const prey = profile('neon', { adultSize: 1 });
    expect(profileVerdict(profile('koi', { adultSize: 60 }), prey).level).toBe('compatible');
    const herbivore = profile('koi', { adultSize: 60, predator: true, diet: 'herbivore' });
    expect(profileVerdict(herbivore, prey).level).toBe('compatible');
  });

  it('la liste nominative prime sur la règle de taille', () => {
    const eater = profile('koi', {
      predator: true,
      adultSize: 60,
      prey: sourced([{ species: 'neon', stage: 'young' }], 'S'),
    });
    const v = profileVerdict(eater, profile('neon', { adultSize: 1 }));
    expect(v.reasons).toEqual([
      expect.objectContaining({ cause: 'mange-jeunes', level: 'precautions' }),
    ]);
  });

  it('koï et poisson rouge : la koï n’en fait pas une proie', () => {
    expect(verdict('koi', 'rouge').reasons.filter((r) => r.axis === 'predation')).toEqual([]);
  });
});

describe('verdict par paire : comportement (#816)', () => {
  it('deux espèces territoriales différentes : précautions (gourami nain et xipho)', () => {
    expect(verdict('gourami', 'xipho').reasons).toEqual([
      expect.objectContaining({ cause: 'territoriaux', level: 'precautions', actor: null }),
    ]);
  });

  it('mangeur de nageoires et espèce à longues nageoires : incompatible', () => {
    const nipper = profile('tetra', { finNipper: approx(true) });
    expect(profileVerdict(nipper, verdictProfile('guppy')).reasons).toEqual([
      expect.objectContaining({ cause: 'nageoires', level: 'incompatible', actor: 'tetra' }),
    ]);
  });

  it('nageur rapide et nageur lent : précautions', () => {
    const slow = profile('rouge', { slowSwimmer: approx(true) });
    const fast = profile('danio', { fastSwimmer: approx(true) });
    expect(causes(slow, fast)).toEqual(['vitesse:precautions']);
  });

  it('comète et poisson rouge fantaisie : absents du jeu, aucun nageur lent', () => {
    expect(Object.keys(SLOW_SWIMMERS)).toEqual([]);
  });

  it('axolotl et poisson rouge : l’axolotl vit sans poissons', () => {
    expect(verdict('axolotl', 'rouge').reasons).toContainEqual(
      expect.objectContaining({ cause: 'sans-poissons', level: 'incompatible', actor: 'axolotl' }),
    );
  });

  it('axolotl et triton : amphibiens, la règle « sans poissons » ne s’applique pas', () => {
    expect(verdict('axolotl', 'triton').reasons.map((r) => r.cause)).not.toContain('sans-poissons');
  });

  it('même espèce : compatible, sans raison', () => {
    expect(verdict('clown', 'clown')).toEqual({ level: 'compatible', reasons: [] });
  });
});

describe('verdict par paire : propriétés (#816)', () => {
  it('niveau symétrique pour toutes les paires', () => {
    for (const a of IDS) {
      for (const b of IDS) {
        expect(verdict(a, b).level, `${a} et ${b}`).toBe(verdict(b, a).level);
      }
    }
  });

  it('le niveau est le pire de ses raisons', () => {
    for (const a of IDS) {
      for (const b of IDS) {
        const v = verdict(a, b);
        expect(v.reasons.some((r) => r.level === v.level) || v.level === 'compatible').toBe(true);
      }
    }
  });

  it.each(ENVIRONMENT_IDS)(
    '%s : aucune paire incompatible dans la population par défaut',
    (env) => {
      const species = environmentById(env).population.map((p) => p.species);
      for (const a of species) {
        for (const b of species) {
          expect(verdict(a, b).level, `${env} : ${a} et ${b}`).not.toBe('incompatible');
        }
      }
    },
  );

  it('espèce inconnue : RangeError', () => {
    expect(() => verdict('neon', 'requin' as SpeciesId)).toThrow(RangeError);
    expect(() => verdict('toString' as SpeciesId, 'neon')).toThrow(RangeError);
  });

  it('chevauchement de plages : bornes comprises', () => {
    expect(overlaps(range(1, 2), range(2, 3))).toBe(true);
    expect(overlaps(range(1, 2), range(2.01, 3))).toBe(false);
  });

  it('statut combiné : sourcé seulement si tous le sont, références sans doublon', () => {
    const a = sourced(1, 'A').status;
    expect(combinedStatus(a, a)).toEqual({ kind: 'source', reference: 'A' });
    expect(combinedStatus(a, APPROXIMATION)).toBe(APPROXIMATION);
    expect(combinedStatus()).toBe(APPROXIMATION);
  });
});
