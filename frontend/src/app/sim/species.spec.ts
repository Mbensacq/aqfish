import { NEON, SPECIES, validateSpecies, type SpeciesDefinition } from './species';

describe('définitions d’espèces', () => {
  it.each(Object.values(SPECIES))('$name est une définition valide', (def) => {
    expect(validateSpecies(def)).toEqual([]);
  });

  it('chaque espèce est rangée sous son identifiant', () => {
    for (const [id, def] of Object.entries(SPECIES)) {
      expect(def.id).toBe(id);
    }
  });

  it('le néon reprend le bleu et le rouge de docs/DA.md', () => {
    expect(NEON.colors.stripe).toBe('#3fa9f5');
    expect(NEON.colors.accent).toBe('#e63946');
    expect(NEON.scientificName).toBe('Paracheirodon innesi');
    expect(NEON.defaultPopulation).toBeGreaterThan(0);
  });
});

describe('validateSpecies', () => {
  const variant = (patch: Partial<SpeciesDefinition>): SpeciesDefinition => ({ ...NEON, ...patch });

  it.each([
    ['longueur nulle', { bodyLength: 0 }],
    ['vitesse négative', { cruiseSpeed: -1 }],
    ['vitesse non finie', { maxSpeed: Number.POSITIVE_INFINITY }],
    ['NaN', { wanderTurnRate: Number.NaN }],
    ['croisière au-dessus du maximum', { cruiseSpeed: 1 }],
    ['minimum au-dessus de la croisière', { minSpeed: 0.07 }],
    ['inclinaison verticale', { maxPitch: Math.PI / 2 }],
    ['marge plus petite que la demi-longueur', { wallMargin: 0.01 }],
    ['population fractionnaire', { defaultPopulation: 1.5 }],
    ['population négative', { defaultPopulation: -1 }],
    ['nom vide', { name: ' ' }],
  ])('signale : %s', (_label, patch) => {
    expect(validateSpecies(variant(patch as Partial<SpeciesDefinition>)).length).toBeGreaterThan(0);
  });

  it('signale une couleur mal formée', () => {
    const def = variant({ colors: { ...NEON.colors, stripe: '#3FA9F5' } });
    expect(validateSpecies(def)).toEqual([expect.stringContaining('stripe')]);
  });

  it('population nulle acceptée', () => {
    expect(validateSpecies(variant({ defaultPopulation: 0 }))).toEqual([]);
  });
});
