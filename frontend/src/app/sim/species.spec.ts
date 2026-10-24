import {
  CORYDORA,
  GUPPY,
  MAX_FLOOR_ZONE,
  NEON,
  SPECIES,
  speciesVariantIndex,
  speciesVariants,
  validateSpecies,
  type SpeciesVariant,
  type SchoolingParams,
  type SpeciesDefinition,
} from './species';

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

describe('corydora (#31)', () => {
  it('définition enregistrée, valide, espèce de fond', () => {
    expect(CORYDORA.id).toBe('corydora');
    expect(CORYDORA.scientificName).toBe('Corydoras paleatus');
    expect(validateSpecies(CORYDORA)).toEqual([]);
    expect(SPECIES.corydora).toBe(CORYDORA);
    expect(CORYDORA.defaultPopulation).toBeGreaterThan(0);
    // Préférence dans la zone basse du bac (sous 25 % de la hauteur d'eau).
    expect(CORYDORA.depth!.maxHeightRatio).toBeGreaterThan(0);
    expect(CORYDORA.depth!.maxHeightRatio).toBeLessThan(0.25);
  });

  it('distinct du néon et du guppy : silhouette, taille, vitesse, couleurs', () => {
    for (const other of [NEON, GUPPY]) {
      expect(CORYDORA.silhouette).not.toBe(other.silhouette);
      expect(CORYDORA.bodyLength).not.toBe(other.bodyLength);
      expect(CORYDORA.colors).not.toEqual(other.colors);
      // Plus lent en croisière : il fouille le sable.
      expect(CORYDORA.cruiseSpeed).toBeLessThan(other.cruiseSpeed);
      expect(other.depth).toBeUndefined();
    }
    // Hors bleu et rouge néon (mesures de banc sur image).
    expect(Object.values(CORYDORA.colors)).not.toContain(NEON.colors.stripe);
    expect(Object.values(CORYDORA.colors)).not.toContain(NEON.colors.accent);
  });

  it('flanc plus clair que la roche : lisible devant un rocher (#76)', () => {
    // Couleurs de la roche (`roche`, `rocheSombre` de `render/palette.ts`).
    const rock = ['#6e6a63', '#45423e'];
    expect(rock).not.toContain(CORYDORA.colors.stripe);
    const luma = (hex: string) =>
      [1, 3, 5].reduce(
        (sum, i, n) => sum + parseInt(hex.slice(i, i + 2), 16) * [0.3, 0.59, 0.11][n],
        0,
      );
    expect(luma(CORYDORA.colors.stripe)).toBeGreaterThan(luma(rock[0]) + 60);
    // Le dos reste sombre (lu de dessus sur le sable) et les taches noires.
    expect(luma(CORYDORA.colors.back)).toBeLessThan(luma(rock[0]));
    expect(CORYDORA.colors.accent).toBe('#1c1c22');
  });
});

describe('validateSpecies : préférence de profondeur', () => {
  const depth = CORYDORA.depth!;
  const withDepth = (patch: Partial<typeof depth>): SpeciesDefinition => ({
    ...CORYDORA,
    depth: { ...depth, ...patch },
  });

  it.each([0, 1, -0.1, Number.NaN])('refuse maxHeightRatio = %s', (maxHeightRatio) => {
    expect(validateSpecies(withDepth({ maxHeightRatio })).join()).toContain('maxHeightRatio');
  });

  it.each([0, MAX_FLOOR_ZONE + 1e-6, Number.NaN])('refuse floorZone = %s', (floorZone) => {
    expect(validateSpecies(withDepth({ floorZone })).join()).toContain('floorZone');
  });

  // Hauteur minimale (espèce de mi-hauteur, #151) : dans [0, maxHeightRatio).
  it.each([-0.01, 0.12, 0.5, Number.NaN])(
    'refuse minHeightRatio = %s (maxHeightRatio = 0,12)',
    (minHeightRatio) => {
      expect(validateSpecies(withDepth({ minHeightRatio })).join()).toContain('minHeightRatio');
    },
  );

  it.each([0, 0.05, undefined])('accepte minHeightRatio = %s', (minHeightRatio) => {
    expect(validateSpecies(withDepth({ minHeightRatio }))).toEqual([]);
  });

  it('accepte floorZone = MAX_FLOOR_ZONE et ascentRate = 0', () => {
    expect(validateSpecies(withDepth({ floorZone: MAX_FLOOR_ZONE, ascentRate: 0 }))).toEqual([]);
  });

  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])('refuse ascentRate = %s', (ascentRate) => {
    expect(validateSpecies(withDepth({ ascentRate })).join()).toContain('ascentRate');
  });

  it.each([0, -1, Number.POSITIVE_INFINITY])('refuse ascentDuration = %s', (ascentDuration) => {
    expect(validateSpecies(withDepth({ ascentDuration })).join()).toContain('ascentDuration');
  });
});

describe('validateSpecies : alimentation', () => {
  const withFeeding = (patch: Partial<SpeciesDefinition['feeding']>): SpeciesDefinition => ({
    ...NEON,
    feeding: { ...NEON.feeding, ...patch },
  });

  it.each(['hungerRate', 'perceptionRadius', 'turnRate'] as const)(
    'refuse %s nul, négatif ou non fini',
    (key) => {
      for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(validateSpecies(withFeeding({ [key]: value })).join()).toContain(key);
      }
    },
  );

  it.each([
    [-0.1, 1],
    [0.5, 0.5],
    [0.6, 0.4],
    [0, 1.1],
    [Number.NaN, 1],
  ])('refuse la tranche [%s, %s]', (minHeightRatio, maxHeightRatio) => {
    expect(validateSpecies(withFeeding({ minHeightRatio, maxHeightRatio })).join()).toContain(
      'minHeightRatio',
    );
  });

  it('accepte toute la hauteur d’eau ; chaque espèce connue a une alimentation valide', () => {
    expect(validateSpecies(withFeeding({ minHeightRatio: 0, maxHeightRatio: 1 }))).toEqual([]);
    for (const def of Object.values(SPECIES)) {
      expect(validateSpecies(def)).toEqual([]);
    }
  });
});

describe('guppy', () => {
  it('est décrit par le même schéma que le néon, et valide', () => {
    expect(GUPPY.id).toBe('guppy');
    expect(GUPPY.scientificName).toBe('Poecilia reticulata');
    expect(validateSpecies(GUPPY)).toEqual([]);
    expect(SPECIES.guppy).toBe(GUPPY);
  });

  it('a deux apparences, mâle puis femelle, le mâle plus petit', () => {
    const [male, female] = speciesVariants(GUPPY);
    expect(speciesVariants(GUPPY).map((v) => v.id)).toEqual(['male', 'femelle']);
    expect(male.scale).toBeLessThan(female.scale);
    expect(male.silhouette).not.toBe(female.silhouette);
  });

  it('le mâle a une caudale colorée, la femelle des couleurs sobres distinctes', () => {
    const [male, female] = speciesVariants(GUPPY);
    expect(male.colors.fin).not.toBe(female.colors.fin);
    expect(male.colors).not.toEqual(female.colors);
  });

  it('n’emprunte ni le bleu ni le rouge du néon (mesures de banc sur image)', () => {
    for (const v of speciesVariants(GUPPY)) {
      expect(Object.values(v.colors)).not.toContain(NEON.colors.stripe);
      expect(Object.values(v.colors)).not.toContain(NEON.colors.accent);
    }
  });

  it('vitesse et taille distinctes du néon', () => {
    expect(GUPPY.bodyLength).not.toBe(NEON.bodyLength);
    expect(GUPPY.cruiseSpeed).not.toBe(NEON.cruiseSpeed);
    expect(GUPPY.maxSpeed).not.toBe(NEON.maxSpeed);
    // Le guppy nage plus lentement que le néon ; la femelle est plus grande que le néon.
    expect(GUPPY.cruiseSpeed).toBeLessThan(NEON.cruiseSpeed);
    expect(GUPPY.bodyLength).toBeGreaterThan(NEON.bodyLength);
  });
});

describe('speciesVariants et speciesVariantIndex', () => {
  it('une espèce sans variantes a une apparence unique, celle par défaut', () => {
    expect(speciesVariants(NEON)).toEqual([
      { id: 'neon', name: 'Néon', silhouette: 'fuseau', scale: 1, colors: NEON.colors },
    ]);
    expect(speciesVariants({ ...NEON, variants: [] })).toHaveLength(1);
  });

  it('les apparences alternent selon l’identifiant', () => {
    expect([0, 1, 2, 3, 12, 13].map((id) => speciesVariantIndex(GUPPY, id))).toEqual([
      0, 1, 0, 1, 0, 1,
    ]);
    expect(speciesVariantIndex(NEON, 4294967295)).toBe(0);
    expect(speciesVariantIndex({ ...NEON, variants: [] }, 7)).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN])('refuse l’identifiant %s', (id) => {
    expect(() => speciesVariantIndex(GUPPY, id)).toThrow(RangeError);
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
    ['maximum sous la population par défaut', { maxPopulation: 3 }],
    ['maximum fractionnaire', { maxPopulation: 20.5 }],
    ['maximum NaN', { maxPopulation: Number.NaN }],
    ['nom vide', { name: ' ' }],
  ])('signale : %s', (_label, patch) => {
    expect(validateSpecies(variant(patch as Partial<SpeciesDefinition>)).length).toBeGreaterThan(0);
  });

  it('signale une couleur mal formée', () => {
    const def = variant({ colors: { ...NEON.colors, stripe: '#3FA9F5' } });
    expect(validateSpecies(def)).toEqual([expect.stringContaining('stripe')]);
  });

  const male = (GUPPY.variants as readonly SpeciesVariant[])[0];
  const withVariants = (...variants: SpeciesVariant[]): SpeciesDefinition => variant({ variants });

  it.each([
    ['liste vide', withVariants(), 'au moins une'],
    ['échelle nulle', withVariants({ ...male, scale: 0 }), 'scale'],
    ['échelle au-delà de 1', withVariants({ ...male, scale: 1.2 }), 'scale'],
    ['échelle NaN', withVariants({ ...male, scale: Number.NaN }), 'scale'],
    ['identifiant en double', withVariants(male, male), 'double'],
    ['nom vide', withVariants({ ...male, name: '' }), 'obligatoires'],
    [
      'couleur mal formée',
      withVariants({ ...male, colors: { ...male.colors, fin: 'orange' } }),
      'fin',
    ],
    [
      'silhouette inconnue',
      withVariants({ ...male, silhouette: 'requin' as SpeciesVariant['silhouette'] }),
      'silhouette',
    ],
  ])('variantes : signale %s', (_label, def, key) => {
    expect(validateSpecies(def)).toEqual(expect.arrayContaining([expect.stringContaining(key)]));
  });

  it('signale une silhouette par défaut inconnue', () => {
    const def = variant({ silhouette: 'requin' as SpeciesDefinition['silhouette'] });
    expect(validateSpecies(def)).toEqual([expect.stringContaining('silhouette')]);
  });

  it('population nulle acceptée', () => {
    expect(validateSpecies(variant({ defaultPopulation: 0 }))).toEqual([]);
  });

  const school = (patch: Partial<SchoolingParams>): SpeciesDefinition =>
    variant({ schooling: { ...(NEON.schooling as SchoolingParams), ...patch } });

  it.each([
    ['rayon de perception nul', { neighborRadius: 0 }, 'neighborRadius'],
    ['rayon de séparation négatif', { separationRadius: -0.01 }, 'separationRadius'],
    ['virage non fini', { turnRate: Number.POSITIVE_INFINITY }, 'turnRate'],
    ['distance minimale NaN', { minDistance: Number.NaN }, 'minDistance'],
    ['poids négatif', { cohesionWeight: -1 }, 'cohesionWeight'],
    ['poids NaN', { alignmentWeight: Number.NaN }, 'alignmentWeight'],
    ['séparation au-delà de la perception', { separationRadius: 0.5 }, 'separationRadius doit'],
    ['distance minimale au-delà de la séparation', { minDistance: 0.06 }, 'minDistance doit'],
  ])('banc : signale %s', (_label, patch, key) => {
    expect(validateSpecies(school(patch))).toEqual(
      expect.arrayContaining([expect.stringContaining(key)]),
    );
  });

  it('banc : poids nuls acceptés, espèce solitaire acceptée', () => {
    expect(
      validateSpecies(school({ separationWeight: 0, alignmentWeight: 0, cohesionWeight: 0 })),
    ).toEqual([]);
    expect(validateSpecies(variant({ schooling: null }))).toEqual([]);
  });

  it('le néon nage en banc, avec des rayons cohérents avec sa taille', () => {
    const params = NEON.schooling as SchoolingParams;
    expect(params.minDistance).toBeGreaterThan(0);
    expect(params.separationRadius).toBeLessThan(params.neighborRadius);
    expect(params.neighborRadius).toBeGreaterThan(NEON.bodyLength);
  });
});
