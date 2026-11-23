import { describe, expect, it } from 'vitest';
import type { SpeciesId } from './species';
import { DENSITY_LITERS_PER_CM, SPECIES_ECOLOGY, type SpeciesEcology } from './species-ecology';
import { speciesSheet } from './species-sheet';

/**
 * Lot de dette du c282 (#788, #790) : données d'écologie entièrement figées, statuts des
 * prédateurs sans mélange sourcé / approximation, règle de volume du poisson rouge.
 */

/** Tranches #784 (eau douce tropicale) et #785 (mer, eau froide). */
const TOUTES: readonly SpeciesId[] = [
  'neon',
  'guppy',
  'corydora',
  'rasbora',
  'tetra',
  'kuhli',
  'gourami',
  'platy',
  'danio',
  'ancistrus',
  'otocinclus',
  'braise',
  'molly',
  'miel',
  'xipho',
  'cerise',
  'crevette',
  'neritine',
  'clown',
  'chirurgien',
  'chromis',
  'gobie',
  'gramma',
  'blennie',
  'koi',
  'rouge',
];

/** Chemins des objets non figés sous `value` (vide : tout est figé, en profondeur). */
function unfrozenPaths(value: unknown, path: string): string[] {
  if (value === null || typeof value !== 'object') {
    return [];
  }
  const own = Object.isFrozen(value) ? [] : [path];
  return own.concat(
    Object.entries(value).flatMap(([key, child]) => unfrozenPaths(child, `${path}.${key}`)),
  );
}

function ecologyOf(id: SpeciesId): SpeciesEcology {
  const ecology = SPECIES_ECOLOGY[id];
  if (!ecology) {
    throw new Error(`${id} : données d’écologie absentes`);
  }
  return ecology;
}

/** Volume minimal de `adults` poissons rouges selon l'OATA (règle gardée par le jeu). */
function oataLiters(adults: number): number {
  const rouge = ecologyOf('rouge').extraLitersPerAdult.value ?? 0;
  return speciesSheet('rouge').minLiters.value + rouge * (adults - 1);
}

/** Volume minimal selon la RSPCA : au moins 60 L par poisson rouge (désaccord, point 15). */
function rspcaLiters(adults: number): number {
  return 60 * adults;
}

describe('données d’écologie : figées et statuts cohérents (#788, #790)', () => {
  it('les 26 espèces des deux tranches, la table et les classes de densité sont figées en profondeur', () => {
    expect(new Set(TOUTES).size).toBe(26);
    expect(Object.keys(SPECIES_ECOLOGY).sort()).toEqual([...TOUTES].sort());
    for (const id of TOUTES) {
      expect(unfrozenPaths(ecologyOf(id), id)).toEqual([]);
    }
    expect(Object.isFrozen(SPECIES_ECOLOGY)).toBe(true);
    expect(unfrozenPaths(DENSITY_LITERS_PER_CM, 'densite')).toEqual([]);
  });

  it('une liste de prédateurs sourcée ne contient que des prédateurs dont la proie est sourcée', () => {
    for (const id of TOUTES) {
      const predators = ecologyOf(id).predators;
      if (predators.status.kind !== 'source') {
        continue;
      }
      for (const predator of predators.value) {
        expect(SPECIES_ECOLOGY[predator]?.prey.status.kind, `${predator} mange ${id}`).toBe(
          'source',
        );
      }
    }
  });

  it('crevette cerise : liste mixte, donc approximation ; chaque prédateur sourcé garde sa source', () => {
    const cerise = ecologyOf('cerise').predators;
    expect(cerise.status.kind).toBe('approximation');
    const sourcedPredators = cerise.value.filter(
      (predator) => ecologyOf(predator).prey.status.kind === 'source',
    );
    expect(sourcedPredators).toEqual([
      'guppy',
      'corydora',
      'rasbora',
      'kuhli',
      'danio',
      'xipho',
      'rouge',
    ]);
    for (const approximated of ['tetra', 'gourami', 'platy', 'molly'] as const) {
      expect(ecologyOf(approximated).prey.status.kind, approximated).toBe('approximation');
    }
  });

  it('le poisson rouge déclare la crevette cerise en proie adulte, qui le compte parmi ses prédateurs', () => {
    expect(ecologyOf('rouge').prey.value).toEqual([{ species: 'cerise', stage: 'adult' }]);
    expect(ecologyOf('cerise').predators.value).toContain('rouge');
  });

  it('poisson rouge : l’OATA n’est plus stricte que jusqu’à 4 adultes, égalité à 5, RSPCA au-delà', () => {
    expect(oataLiters(1)).toBe(100);
    for (const adults of [1, 2, 3, 4]) {
      expect(oataLiters(adults), `${adults}`).toBeGreaterThan(rspcaLiters(adults));
    }
    expect(oataLiters(4)).toBe(250);
    expect(rspcaLiters(4)).toBe(240);
    expect(oataLiters(5)).toBe(300);
    expect(rspcaLiters(5)).toBe(300);
    expect(oataLiters(6)).toBe(350);
    expect(rspcaLiters(6)).toBe(360);
    // Le jeu garde l'OATA, et sa référence dit exactement jusqu'où elle est la plus stricte.
    const status = ecologyOf('rouge').extraLitersPerAdult.status;
    expect(status.kind).toBe('source');
    if (status.kind === 'source') {
      expect(status.reference).toContain('plus stricte jusqu’à 4 adultes seulement');
      expect(status.reference).toContain('égalité à 5');
    }
  });

  it('guppy : la référence de dureté écrit le désaccord, la valeur ne change pas', () => {
    const hardness = speciesSheet('guppy').hardness;
    expect(hardness.value).toEqual({ kind: 'gh', min: 8, max: 30 });
    expect(hardness.status.kind).toBe('source');
    if (hardness.status.kind === 'source') {
      expect(hardness.status.reference).toContain('désaccord');
    }
  });
});
