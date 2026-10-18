/**
 * Définitions déclaratives des espèces (docs/DA.md, « Les espèces sont décrites de façon
 * déclarative »). Le rendu génère les modèles à partir de ces données ; la simulation en
 * tire les paramètres de nage.
 *
 * Règle (docs/ARCHITECTURE.md, « Données réelles ») : toute valeur présentée comme réelle
 * est sourcée ; sinon elle est marquée « approximation de jeu ».
 */

/** Identifiant d'espèce, stable (sérialisé dans l'état du monde). */
export type SpeciesId = 'neon' | 'guppy' | 'corydora';

/**
 * Silhouette voxel d'une apparence : le rendu associe à chaque identifiant un gabarit de
 * profil (`render/fish-model.ts`, `SILHOUETTES`).
 */
export const SILHOUETTE_IDS = ['fuseau', 'guppy-male', 'guppy-femelle', 'corydora'] as const;
export type SilhouetteId = (typeof SILHOUETTE_IDS)[number];

const SILHOUETTE_SET: ReadonlySet<string> = new Set(SILHOUETTE_IDS);

/** Couleurs d'une espèce, en sRGB `#rrggbb`, prises dans la palette de docs/DA.md. */
export interface SpeciesColors {
  /** Bande latérale principale. */
  readonly stripe: string;
  /** Bande secondaire (arrière du ventre pour le néon). */
  readonly accent: string;
  /** Dos. */
  readonly back: string;
  /** Ventre et avant du ventre. */
  readonly belly: string;
  /** Nageoires. */
  readonly fin: string;
  /** Œil. */
  readonly eye: string;
}

/**
 * Comportement de banc (règles de boids : séparation, alignement, cohésion ; `sim/flocking.ts`).
 * Seuls les congénères (même espèce) situés à moins de `neighborRadius` sont pris en compte.
 */
export interface SchoolingParams {
  /** Rayon de perception des voisins (alignement et cohésion), en mètres. */
  readonly neighborRadius: number;
  /** Rayon de séparation : en deçà, le poisson s'écarte de son voisin, en mètres. */
  readonly separationRadius: number;
  /** Poids de la séparation (sans dimension). */
  readonly separationWeight: number;
  /** Poids de l'alignement (sans dimension). */
  readonly alignmentWeight: number;
  /** Poids de la cohésion (sans dimension). */
  readonly cohesionWeight: number;
  /**
   * Vitesse de virage maximale due au banc, en rad/s. Lue dans la définition d'espèce par
   * `stepFish` (`sim/swimmer.ts`).
   */
  readonly turnRate: number;
  /**
   * Distance minimale entre les centres de deux congénères, en mètres : en deçà, ils sont
   * écartés de force (`enforceMinDistance`, `sim/flocking.ts`) pour ne jamais se recouvrir.
   */
  readonly minDistance: number;
}

/**
 * Préférence de profondeur d'une espèce de fond (`stepFish`, `sim/swimmer.ts`) : au-dessus de
 * `maxHeightRatio`, l'inclinaison visée est tirée vers le bas ; de temps en temps, une brève
 * remontée vers la surface.
 */
export interface DepthPreference {
  /**
   * Hauteur maximale préférée du centre au-dessus du sable, en fraction de la hauteur d'eau,
   * dans (0, 1).
   */
  readonly maxHeightRatio: number;
  /**
   * Portée de l'évitement du fond, en mètres, dans (0, 0,07] (0,07 m : portée commune des
   * autres parois) : plus courte, elle laisse le poisson nager au ras du sable.
   */
  readonly floorZone: number;
  /** Fréquence moyenne des remontées, par seconde (0 : jamais). */
  readonly ascentRate: number;
  /** Durée maximale d'une remontée, en secondes (strictement positive). */
  readonly ascentDuration: number;
}

/**
 * Apparence d'une partie des individus d'une espèce (mâle, femelle…), affichée dans une
 * couche de rendu à part. Les individus sont répartis entre les apparences par
 * `speciesVariantIndex`, sans état supplémentaire dans la simulation.
 */
export interface SpeciesVariant {
  /** Identifiant stable, unique dans l'espèce. */
  readonly id: string;
  /** Nom affiché, en français. */
  readonly name: string;
  readonly silhouette: SilhouetteId;
  /**
   * Échelle du modèle par rapport à `bodyLength`, dans (0, 1] : la simulation (marges,
   * distances) raisonne toujours sur la plus grande taille, `bodyLength`.
   */
  readonly scale: number;
  readonly colors: SpeciesColors;
}

export interface SpeciesDefinition {
  readonly id: SpeciesId;
  /** Nom affiché, en français. */
  readonly name: string;
  /** Nom scientifique. */
  readonly scientificName: string;
  /** Longueur du corps du modèle, museau à pédoncule (hors nageoire caudale), en mètres. */
  readonly bodyLength: number;
  /** Vitesse de croisière, en m/s. */
  readonly cruiseSpeed: number;
  /** Vitesse minimale de nage, en m/s (strictement positive : le poisson avance toujours). */
  readonly minSpeed: number;
  /** Vitesse maximale, en m/s. */
  readonly maxSpeed: number;
  /** Vitesse de virage maximale en errance, en rad/s. */
  readonly wanderTurnRate: number;
  /** Vitesse de virage maximale à l'approche d'une paroi, en rad/s. */
  readonly avoidTurnRate: number;
  /** Inclinaison maximale (montée ou descente), en radians. */
  readonly maxPitch: number;
  /** Distance minimale entre le centre du poisson et une paroi, en mètres. */
  readonly wallMargin: number;
  /** Fréquence de battement de la queue à la vitesse de croisière, en Hz. */
  readonly tailBeatFrequency: number;
  /** Population par défaut d'un bac. */
  readonly defaultPopulation: number;
  /** Comportement de banc, ou `null` pour une espèce solitaire. */
  readonly schooling: SchoolingParams | null;
  /** Silhouette de l'apparence par défaut (espèce sans `variants`). */
  readonly silhouette: SilhouetteId;
  /** Couleurs de l'apparence par défaut (espèce sans `variants`). */
  readonly colors: SpeciesColors;
  /**
   * Apparences distinctes (dimorphisme), ou absent pour une apparence unique (`silhouette`,
   * `colors`, échelle 1). Si présent, remplace l'apparence par défaut pour l'affichage.
   */
  readonly variants?: readonly SpeciesVariant[];
  /** Préférence de profondeur (espèce de fond), ou absent pour toute la hauteur d'eau. */
  readonly depth?: DepthPreference;
}

/**
 * Néon (Paracheirodon innesi).
 *
 * - Couleurs : bleu `#3fa9f5` et rouge `#e63946` de docs/DA.md (« Petits poissons ») ; dos et
 *   ventre : couleurs existantes de la palette, choisies pour le contraste (approximation de
 *   jeu).
 * - `bodyLength` : **approximation de jeu**. Le modèle est volontairement plus grand qu'un
 *   néon adulte réel (environ × 1,5 par rapport à l'ordre de grandeur courant), pour rester
 *   lisible à la résolution du pixel art (un pixel de scène ≈ 7 mm dans les vues par
 *   défaut). Valeur de référence à consulter : FishBase, fiche 10691
 *   (https://fishbase.se/summary/10691) ; non vérifiée ici.
 * - Vitesses, virages, battement de queue, population : **approximations de jeu** (nage
 *   calme, sans prétention de réalisme quantitatif).
 * - Banc : le néon est une espèce grégaire qui nage en banc ; rayons (5 longueurs de corps
 *   pour la perception, ≈ 1 pour la séparation), poids, et distance minimale (≈ hauteur du
 *   corps du modèle, 18 mm) : **approximations de jeu**, réglés pour un banc lâche et mobile
 *   dans le bac par défaut.
 */
export const NEON: SpeciesDefinition = {
  id: 'neon',
  name: 'Néon',
  scientificName: 'Paracheirodon innesi',
  bodyLength: 0.06,
  cruiseSpeed: 0.06,
  minSpeed: 0.03,
  maxSpeed: 0.12,
  wanderTurnRate: 0.8,
  avoidTurnRate: 2.5,
  maxPitch: 0.35,
  wallMargin: 0.04,
  tailBeatFrequency: 2.5,
  defaultPopulation: 12,
  schooling: {
    neighborRadius: 0.3,
    separationRadius: 0.05,
    separationWeight: 1,
    alignmentWeight: 1,
    cohesionWeight: 1,
    turnRate: 1.5,
    minDistance: 0.02,
  },
  silhouette: 'fuseau',
  colors: {
    stripe: '#3fa9f5',
    accent: '#e63946',
    back: '#45423e',
    belly: '#f2ead8',
    fin: '#a8e6cf',
    eye: '#1c1c22',
  },
};

/**
 * Guppy (Poecilia reticulata), bac tropical (docs/DA.md).
 *
 * - Dimorphisme : mâle plus petit, corps gris à taches, grande nageoire caudale orange
 *   tachée de rose ; femelle plus grande, corps sable, nageoires claires (sobre). Couleurs
 *   prises dans la palette existante (docs/DA.md), hors bleu et rouge néon pour que les
 *   mesures de banc des néons sur image (`e2e/banc.spec.ts`) ne comptent pas les guppys.
 *   Répartition : un individu sur deux de chaque sexe (`speciesVariantIndex`).
 * - `bodyLength` (femelle, 7 cm) et échelle du mâle (0,7) : **approximations de jeu**,
 *   agrandies comme le néon pour la lisibilité ; ordre de grandeur réel : femelle nettement
 *   plus grande que le mâle (référence à consulter : FishBase, Poecilia reticulata ; non
 *   vérifiée ici).
 * - Nage plus lente et plus erratique que le néon, banc lâche (le guppy est grégaire sans
 *   former de banc serré) : vitesses, virages, poids et rayons sont des **approximations de
 *   jeu**.
 */
const GUPPY_FEMALE_COLORS: SpeciesColors = {
  stripe: '#c9b38a',
  accent: '#45423e',
  back: '#a8916a',
  belly: '#f2ead8',
  fin: '#e3cf9e',
  eye: '#1c1c22',
};

export const GUPPY: SpeciesDefinition = {
  id: 'guppy',
  name: 'Guppy',
  scientificName: 'Poecilia reticulata',
  bodyLength: 0.07,
  cruiseSpeed: 0.045,
  minSpeed: 0.02,
  maxSpeed: 0.09,
  wanderTurnRate: 1.1,
  avoidTurnRate: 2.5,
  maxPitch: 0.3,
  wallMargin: 0.04,
  tailBeatFrequency: 2,
  defaultPopulation: 6,
  schooling: {
    neighborRadius: 0.25,
    separationRadius: 0.07,
    separationWeight: 1,
    alignmentWeight: 0.4,
    cohesionWeight: 0.5,
    turnRate: 1.2,
    minDistance: 0.025,
  },
  silhouette: 'guppy-femelle',
  colors: GUPPY_FEMALE_COLORS,
  variants: [
    {
      id: 'male',
      name: 'Guppy mâle',
      silhouette: 'guppy-male',
      scale: 0.7,
      colors: {
        stripe: '#6e6a63',
        accent: '#f06a9b',
        back: '#45423e',
        belly: '#f2ead8',
        fin: '#f08a2c',
        eye: '#1c1c22',
      },
    },
    {
      id: 'femelle',
      name: 'Guppy femelle',
      silhouette: 'guppy-femelle',
      scale: 1,
      colors: GUPPY_FEMALE_COLORS,
    },
  ],
};

/**
 * Corydora poivré (Corydoras paleatus), poisson de fond du bac tropical (docs/DA.md).
 *
 * - Silhouette trapue (corps court et haut, ventre plat, haute dorsale), flanc gris
 *   « poivré » de taches noires, dos sombre, ventre clair : couleurs de la palette « Sable et
 *   roche » et noir de docs/DA.md, choisies pour trancher sur le sable (un flanc sable s'y
 *   confondait sur les captures), hors bleu et rouge néon (`e2e/banc.spec.ts`).
 * - `bodyLength` (5,5 cm) : **approximation de jeu**, agrandie comme le néon pour la
 *   lisibilité (référence à consulter : FishBase, Corydoras paleatus ; non vérifiée ici).
 * - Fouille le sable en petits groupes et remonte parfois brièvement respirer à la surface
 *   (comportement connu du genre, décrit qualitativement) : préférence de profondeur
 *   (12 % de la hauteur d'eau), portée de l'évitement du fond (1,5 cm), fréquence (une
 *   remontée toutes les 150 s en moyenne) et durée (6 s au plus) des remontées, vitesses,
 *   virages, banc : **approximations de jeu**.
 */
export const CORYDORA: SpeciesDefinition = {
  id: 'corydora',
  name: 'Corydora',
  scientificName: 'Corydoras paleatus',
  bodyLength: 0.055,
  cruiseSpeed: 0.035,
  minSpeed: 0.015,
  maxSpeed: 0.11,
  wanderTurnRate: 1,
  avoidTurnRate: 2.5,
  maxPitch: 0.75,
  wallMargin: 0.03,
  tailBeatFrequency: 2.2,
  defaultPopulation: 6,
  schooling: {
    neighborRadius: 0.2,
    separationRadius: 0.06,
    separationWeight: 1,
    alignmentWeight: 0.5,
    cohesionWeight: 0.8,
    turnRate: 1.2,
    minDistance: 0.03,
  },
  silhouette: 'corydora',
  colors: {
    stripe: '#6e6a63',
    accent: '#1c1c22',
    back: '#45423e',
    belly: '#f2ead8',
    fin: '#a8916a',
    eye: '#1c1c22',
  },
  depth: {
    maxHeightRatio: 0.12,
    floorZone: 0.015,
    ascentRate: 1 / 150,
    ascentDuration: 6,
  },
};

/** Toutes les espèces connues, par identifiant (ordre de déclaration = ordre de peuplement). */
export const SPECIES: Readonly<Record<SpeciesId, SpeciesDefinition>> = {
  neon: NEON,
  guppy: GUPPY,
  corydora: CORYDORA,
};

/** Apparences d'une espèce : ses `variants`, ou son apparence par défaut seule. */
export function speciesVariants(def: SpeciesDefinition): readonly SpeciesVariant[] {
  if (def.variants && def.variants.length > 0) {
    return def.variants;
  }
  return [{ id: def.id, name: def.name, silhouette: def.silhouette, scale: 1, colors: def.colors }];
}

/**
 * Indice de l'apparence d'un individu dans `speciesVariants(def)`, tiré de son identifiant
 * (`id` modulo le nombre d'apparences) : déterministe, sans état ni tirage aléatoire, donc
 * sans effet sur la simulation. Les identifiants étant consécutifs, les apparences
 * alternent.
 * @throws RangeError si `id` n'est pas un entier positif ou nul.
 */
export function speciesVariantIndex(def: SpeciesDefinition, id: number): number {
  if (!Number.isInteger(id) || id < 0) {
    throw new RangeError(`identifiant invalide : ${id}`);
  }
  // Sans passer par `speciesVariants` : aucune allocation (appelé à chaque image par le rendu).
  const count = def.variants && def.variants.length > 0 ? def.variants.length : 1;
  return id % count;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/;

/**
 * Vérifie la cohérence d'une définition d'espèce et renvoie la liste des problèmes
 * (vide si la définition est valide).
 */
export function validateSpecies(def: SpeciesDefinition): string[] {
  const problems: string[] = [];
  const positive: (keyof SpeciesDefinition)[] = [
    'bodyLength',
    'cruiseSpeed',
    'minSpeed',
    'maxSpeed',
    'wanderTurnRate',
    'avoidTurnRate',
    'maxPitch',
    'wallMargin',
    'tailBeatFrequency',
  ];
  for (const key of positive) {
    const value = def[key] as number;
    if (!(value > 0) || !Number.isFinite(value)) {
      problems.push(`${key} doit être un réel strictement positif (reçu : ${value})`);
    }
  }
  if (!(def.minSpeed <= def.cruiseSpeed && def.cruiseSpeed <= def.maxSpeed)) {
    problems.push('il faut minSpeed ≤ cruiseSpeed ≤ maxSpeed');
  }
  if (!(def.maxPitch < Math.PI / 2)) {
    problems.push('maxPitch doit rester sous π/2 (pas de nage à la verticale)');
  }
  if (!(def.wallMargin >= def.bodyLength / 2)) {
    problems.push('wallMargin doit couvrir au moins la demi-longueur du corps');
  }
  if (!Number.isInteger(def.defaultPopulation) || def.defaultPopulation < 0) {
    problems.push('defaultPopulation doit être un entier positif ou nul');
  }
  if (def.schooling !== null) {
    problems.push(...validateSchooling(def.schooling));
  }
  if (!SILHOUETTE_SET.has(def.silhouette)) {
    problems.push(`silhouette inconnue : ${String(def.silhouette)}`);
  }
  problems.push(...validateColors(def.colors, ''));
  if (def.variants !== undefined) {
    problems.push(...validateVariants(def.variants));
  }
  if (def.depth !== undefined) {
    problems.push(...validateDepth(def.depth));
  }
  if (def.name.trim() === '' || def.scientificName.trim() === '') {
    problems.push('nom et nom scientifique obligatoires');
  }
  return problems;
}

function validateColors(colors: SpeciesColors, prefix: string): string[] {
  const problems: string[] = [];
  for (const [name, color] of Object.entries(colors)) {
    if (!HEX_COLOR.test(color)) {
      problems.push(`${prefix}couleur ${name} invalide (attendu #rrggbb en minuscules) : ${color}`);
    }
  }
  return problems;
}

function validateVariants(variants: readonly SpeciesVariant[]): string[] {
  const problems: string[] = [];
  if (variants.length === 0) {
    problems.push('variants, si présent, doit contenir au moins une apparence');
  }
  const ids = new Set<string>();
  for (const variant of variants) {
    const prefix = `variante ${variant.id} : `;
    if (variant.id.trim() === '' || variant.name.trim() === '') {
      problems.push('identifiant et nom de variante obligatoires');
    }
    if (ids.has(variant.id)) {
      problems.push(`identifiant de variante en double : ${variant.id}`);
    }
    ids.add(variant.id);
    if (!(variant.scale > 0 && variant.scale <= 1)) {
      problems.push(`${prefix}scale doit être dans (0, 1] (reçu : ${variant.scale})`);
    }
    if (!SILHOUETTE_SET.has(variant.silhouette)) {
      problems.push(`${prefix}silhouette inconnue : ${String(variant.silhouette)}`);
    }
    problems.push(...validateColors(variant.colors, prefix));
  }
  return problems;
}

/** Portée maximale de l'évitement du fond : celle des autres parois (`sim/swimmer.ts`). */
export const MAX_FLOOR_ZONE = 0.07;

function validateDepth(depth: DepthPreference): string[] {
  const problems: string[] = [];
  if (!(depth.maxHeightRatio > 0 && depth.maxHeightRatio < 1)) {
    problems.push(`depth.maxHeightRatio doit être dans (0, 1) (reçu : ${depth.maxHeightRatio})`);
  }
  if (!(depth.floorZone > 0 && depth.floorZone <= MAX_FLOOR_ZONE)) {
    problems.push(
      `depth.floorZone doit être dans (0, ${MAX_FLOOR_ZONE}] (reçu : ${depth.floorZone})`,
    );
  }
  if (!(depth.ascentRate >= 0) || !Number.isFinite(depth.ascentRate)) {
    problems.push(`depth.ascentRate doit être un réel positif ou nul (reçu : ${depth.ascentRate})`);
  }
  if (!(depth.ascentDuration > 0) || !Number.isFinite(depth.ascentDuration)) {
    problems.push(
      `depth.ascentDuration doit être un réel strictement positif (reçu : ${depth.ascentDuration})`,
    );
  }
  return problems;
}

function validateSchooling(params: SchoolingParams): string[] {
  const problems: string[] = [];
  for (const key of ['neighborRadius', 'separationRadius', 'turnRate', 'minDistance'] as const) {
    const value = params[key];
    if (!(value > 0) || !Number.isFinite(value)) {
      problems.push(`schooling.${key} doit être un réel strictement positif (reçu : ${value})`);
    }
  }
  for (const key of ['separationWeight', 'alignmentWeight', 'cohesionWeight'] as const) {
    const value = params[key];
    if (!(value >= 0) || !Number.isFinite(value)) {
      problems.push(`schooling.${key} doit être un réel positif ou nul (reçu : ${value})`);
    }
  }
  if (!(params.separationRadius <= params.neighborRadius)) {
    problems.push('schooling.separationRadius doit être ≤ schooling.neighborRadius');
  }
  if (!(params.minDistance <= params.separationRadius)) {
    problems.push('schooling.minDistance doit être ≤ schooling.separationRadius');
  }
  return problems;
}
