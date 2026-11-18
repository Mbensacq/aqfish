import { ICH_AGGRAVATED_AT, ICH_VISIBLE_AT } from './disease';
import { DROPSY_ADVANCED_AT, DROPSY_VISIBLE_AT } from './dropsy';
import { FIN_ROT_ADVANCED_AT, FIN_ROT_VISIBLE_AT } from './fin-rot';
import { FUNGUS_ADVANCED_AT, FUNGUS_VISIBLE_AT } from './fungus';
import {
  EMPTY_HEALTH_SUMMARY,
  healthSummary,
  SICK_HEALTH,
  WEAK_HEALTH,
  type HealthSubject,
} from './health-summary';
import { HEALTH_FLOOR } from './health-scale';
import type { SpeciesId } from './species';
import { VELVET_ADVANCED_AT, VELVET_VISIBLE_AT } from './velvet';
import { STARVING_HUNGER } from './wellbeing';

/**
 * Caractérisation de `healthSummary` (`sim/health-summary.ts`), lot 4 du chantier #686 :
 * relevée **avant** le découpage de la fonction en table de règles. Chaque animal passe seul,
 * puis par groupes de tailles variées tirés d'une suite pseudo-aléatoire fixe ; les valeurs
 * couvrent toutes les branches : santé et faim non finies, hors bornes, aux seuils ; chaque
 * maladie absente, invalide, au début, visible, avancée ; espèces nourries aux granulés ou non.
 *
 * L'empreinte couvre la synthèse complète (ordre des clés compris) : elle ne doit changer que
 * pour un changement de comportement voulu, expliqué dans la PR.
 */

/** Hachage cyrb53 incrémental (53 bits), comme `non-regression.spec.ts`. */
class Hash {
  private h1 = 0xdeadbeef;
  private h2 = 0x41c6ce57;

  add(text: string): void {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      this.h1 = Math.imul(this.h1 ^ c, 2654435761);
      this.h2 = Math.imul(this.h2 ^ c, 1597334677);
    }
  }

  digest(): string {
    let h1 = this.h1;
    let h2 = this.h2;
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  }
}

/** Espèces : nageuses nourries aux granulés, marcheur (axolotl), amphibien (grenouille). */
const SPECIES_CHOICES: readonly SpeciesId[] = ['neon', 'koi', 'axolotl', 'grenouille', 'crevette'];

const HEALTHS = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  -1,
  0,
  HEALTH_FLOOR,
  WEAK_HEALTH,
  WEAK_HEALTH + 1e-9,
  0.6,
  SICK_HEALTH,
  SICK_HEALTH + 1e-9,
  1,
  2,
];

const HUNGERS = [Number.NaN, -1, 0, 0.3, 0.7, 0.999, STARVING_HUNGER, 2];

/** Valeurs d'une maladie : absente, invalide, début, seuil visible, seuil avancé, au-delà. */
function stages(visibleAt: number, advancedAt: number): readonly (number | undefined)[] {
  return [
    undefined,
    -1,
    Number.NaN,
    0,
    visibleAt - 1,
    visibleAt,
    advancedAt - 1,
    advancedAt,
    advancedAt * 3,
  ];
}

const ICH = stages(ICH_VISIBLE_AT, ICH_AGGRAVATED_AT);
const FIN_ROT = stages(FIN_ROT_VISIBLE_AT, FIN_ROT_ADVANCED_AT);
const VELVET = stages(VELVET_VISIBLE_AT, VELVET_ADVANCED_AT);
const FUNGUS = stages(FUNGUS_VISIBLE_AT, FUNGUS_ADVANCED_AT);
const DROPSY = stages(DROPSY_VISIBLE_AT, DROPSY_ADVANCED_AT);

/** Maladies et leurs valeurs, dans l'ordre des champs de `HealthSubject`. */
const DISEASES = [
  ['ich', ICH],
  ['finRot', FIN_ROT],
  ['velvet', VELVET],
  ['fungus', FUNGUS],
  ['dropsy', DROPSY],
] as const;

/** Suite pseudo-aléatoire fixe (LCG de Numerical Recipes). */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function pick<T>(next: () => number, values: readonly T[]): T {
  return values[next() % values.length];
}

/** Animal tiré : une maladie au plus la moitié du temps, toutes parfois. */
function animal(next: () => number): HealthSubject {
  const subject: {
    species: SpeciesId;
    hunger: number;
    health: number;
    ich?: number;
    finRot?: number;
    velvet?: number;
    fungus?: number;
    dropsy?: number;
  } = {
    species: pick(next, SPECIES_CHOICES),
    hunger: pick(next, HUNGERS),
    health: pick(next, HEALTHS),
  };
  for (const [key, values] of DISEASES) {
    if (next() % 2 === 0) {
      subject[key] = pick(next, values);
    }
  }
  return subject;
}

/** Empreinte attendue, relevée avant le découpage. */
const EXPECTED_SINGLE = '127f9f80e58471';
const EXPECTED_GROUPS = '01e720bbc2c92d';

describe('caractérisation de healthSummary (#686, lot 4)', () => {
  it('bac vide : la synthèse vide elle-même', () => {
    expect(healthSummary([])).toBe(EMPTY_HEALTH_SUMMARY);
  });

  it('chaque animal seul, toutes combinaisons de santé, faim, espèce et maladie', () => {
    const hash = new Hash();
    for (const s of SPECIES_CHOICES) {
      for (const health of HEALTHS) {
        for (const hunger of HUNGERS) {
          hash.add(JSON.stringify(healthSummary([{ species: s, health, hunger }])));
        }
      }
    }
    for (const [key, values] of DISEASES) {
      for (const value of values) {
        for (const health of [HEALTH_FLOOR, 0.6, 1]) {
          const subject = { species: 'neon' as const, health, hunger: 0, [key]: value };
          hash.add(JSON.stringify(healthSummary([subject])));
        }
      }
    }
    expect(hash.digest()).toBe(EXPECTED_SINGLE);
  });

  it('groupes tirés de 1 à 40 animaux (2 000 synthèses)', () => {
    const next = lcg(686);
    const hash = new Hash();
    for (let g = 0; g < 2000; g++) {
      const size = 1 + (next() % 40);
      const animals: HealthSubject[] = [];
      for (let i = 0; i < size; i++) {
        animals.push(animal(next));
      }
      hash.add(JSON.stringify(healthSummary(animals)));
    }
    expect(hash.digest()).toBe(EXPECTED_GROUPS);
  });
});
