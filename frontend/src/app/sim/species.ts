/**
 * Définitions déclaratives des espèces (docs/DA.md, « Les espèces sont décrites de façon
 * déclarative »). Le rendu génère les modèles à partir de ces données ; la simulation en
 * tire les paramètres de nage.
 *
 * Règle (docs/ARCHITECTURE.md, « Données réelles ») : toute valeur présentée comme réelle
 * est sourcée ; sinon elle est marquée « approximation de jeu ».
 */

/** Identifiant d'espèce, stable (sérialisé dans l'état du monde). */
export type SpeciesId = 'neon';

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
  readonly colors: SpeciesColors;
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
  wallMargin: 0.05,
  tailBeatFrequency: 2.5,
  defaultPopulation: 8,
  colors: {
    stripe: '#3fa9f5',
    accent: '#e63946',
    back: '#45423e',
    belly: '#f2ead8',
    fin: '#a8e6cf',
    eye: '#1c1c22',
  },
};

/** Toutes les espèces connues, par identifiant. */
export const SPECIES: Readonly<Record<SpeciesId, SpeciesDefinition>> = { neon: NEON };

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
  for (const [name, color] of Object.entries(def.colors)) {
    if (!HEX_COLOR.test(color)) {
      problems.push(`couleur ${name} invalide (attendu #rrggbb en minuscules) : ${color}`);
    }
  }
  if (def.name.trim() === '' || def.scientificName.trim() === '') {
    problems.push('nom et nom scientifique obligatoires');
  }
  return problems;
}
