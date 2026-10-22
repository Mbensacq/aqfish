/**
 * Définitions déclaratives des espèces (docs/DA.md, « Les espèces sont décrites de façon
 * déclarative »). Le rendu génère les modèles à partir de ces données ; la simulation en
 * tire les paramètres de nage.
 *
 * Règle (docs/ARCHITECTURE.md, « Données réelles ») : toute valeur présentée comme réelle
 * est sourcée ; sinon elle est marquée « approximation de jeu ».
 */

/** Identifiant d'espèce, stable (sérialisé dans l'état du monde). */
export type SpeciesId = 'neon' | 'guppy' | 'corydora' | 'koi' | 'axolotl' | 'grenouille';

/**
 * Silhouette voxel d'une apparence : le rendu associe à chaque identifiant un gabarit de
 * profil (`render/fish-model.ts`, `SILHOUETTES`).
 */
export const SILHOUETTE_IDS = [
  'fuseau',
  'guppy-male',
  'guppy-femelle',
  'corydora',
  'koi',
  'axolotl',
  'grenouille',
] as const;
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
 * Alimentation d'une espèce (`sim/feeding.ts`, issue #68) : faim qui monte avec le temps,
 * perception des granulés et tranche d'eau où l'espèce mange.
 */
export interface FeedingParams {
  /** Montée de la faim, par seconde : de 0 à 1 en `1 / hungerRate` secondes. */
  readonly hungerRate: number;
  /** Distance maximale à laquelle un poisson affamé remarque un granulé, en mètres. */
  readonly perceptionRadius: number;
  /** Vitesse de virage maximale vers un granulé, en rad/s. */
  readonly turnRate: number;
  /**
   * Tranche d'eau où l'espèce mange : un granulé n'est remarqué (et mangé) que si sa hauteur
   * au-dessus du sable, en fraction de la hauteur d'eau, est dans [minHeightRatio,
   * maxHeightRatio] ⊂ [0, 1].
   */
  readonly minHeightRatio: number;
  readonly maxHeightRatio: number;
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

/**
 * Déplacement d'une espèce qui vit sur le fond et ne nage que par moments (axolotl, issue
 * #130, `sim/axolotl.ts`) : à la place de la nage des poissons (`stepFish`), une machine à
 * trois états (marche sur le fond, nage, remontée à la surface) fonction du temps et de la
 * graine, bornée par le sol (`sim/terrain.ts`) et la surface.
 */
export interface BottomWalkerParams {
  /** Hauteur du centre au-dessus du sol en marche (pattes posées), en mètres (> 0). */
  readonly clearance: number;
  /** Distance minimale du centre sous la surface (branchies dans l'eau), en mètres (> 0). */
  readonly surfaceMargin: number;
  /** Vitesse de marche, en m/s, dans [minSpeed, maxSpeed]. */
  readonly walkSpeed: number;
  /** Durée d'un créneau de comportement, en secondes (> 0). */
  readonly slotDuration: number;
  /** Poids relatifs des trois états, positifs ou nuls, de somme strictement positive. */
  readonly weights: {
    readonly marche: number;
    readonly nage: number;
    readonly remontee: number;
  };
  /** Période des à-coups de la nage, en secondes (> 0). */
  readonly burstPeriod: number;
  /** Vitesse verticale maximale de la remontée, en m/s (> 0). */
  readonly climbSpeed: number;
}

/**
 * Déplacement d'une espèce qui vit entre terre et eau en sautant (grenouille, issue #131,
 * `sim/frog.ts`) : posée sur la berge, petits sauts en parabole, entrée dans l'eau, nage
 * près de la surface, sortie en remontant la pente. Le milieu voulu (terre ou eau) suit un
 * cycle fonction du temps et de la graine ; les sauts partent au début de créneaux.
 */
export interface AmphibianParams {
  /** Hauteur du centre au-dessus du sol, posée, en mètres (> 0). */
  readonly clearance: number;
  /** Profondeur du centre sous la surface à la nage, en mètres (> 0). */
  readonly floatDepth: number;
  /**
   * Hauteur maximale du centre au-dessus de la surface de l'eau, en mètres (> 0) : borne
   * haute de la zone de vie (berge et sauts compris).
   */
  readonly maxRise: number;
  /** Durée d'un saut, en secondes (> 0). */
  readonly hopDuration: number;
  /** Portée minimale d'un saut, en mètres (> 0). */
  readonly hopMinRange: number;
  /** Portée maximale d'un saut, en mètres (≥ hopMinRange ; hopMaxRange / hopDuration ≤ maxSpeed). */
  readonly hopMaxRange: number;
  /** Hauteur de l'arc au-dessus de la corde du saut, en mètres (> 0). */
  readonly hopHeight: number;
  /** Durée d'un créneau à terre, en secondes (> 0) : un saut possible au début de chacun. */
  readonly hopSlot: number;
  /** Probabilité de sauter au début d'un créneau quand la grenouille reste à terre, dans [0, 1]. */
  readonly hopChance: number;
  /** Période du cycle terre puis eau, en secondes (> 0). */
  readonly cycleDuration: number;
  /** Part du cycle où la grenouille veut être dans l'eau, dans ]0, 1[. */
  readonly waterShare: number;
  /** Vitesse de nage, en m/s, dans [minSpeed, maxSpeed]. */
  readonly swimSpeed: number;
}

/** Mode de répartition des individus entre les apparences (`speciesVariantIndex`). */
export type VariantDraw = 'alternance' | 'graine';

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
  /**
   * Population maximale réglable dans le panneau (`sim/population.ts`, issue #69), entier au
   * moins égal à `defaultPopulation`. Le total de toutes les espèces est en plus borné par
   * `MAX_TOTAL_FISH`.
   */
  readonly maxPopulation: number;
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
  /**
   * Répartition des individus entre les `variants` (`speciesVariantIndex`) : `'alternance'`
   * (par défaut) selon l'identifiant seul ; `'graine'` selon la graine du monde et
   * l'identifiant (robes des koïs, issue #88).
   */
  readonly variantDraw?: VariantDraw;
  /** Préférence de profondeur (espèce de fond), ou absent pour toute la hauteur d'eau. */
  readonly depth?: DepthPreference;
  /** Faim et alimentation (`sim/feeding.ts`). */
  readonly feeding: FeedingParams;
  /**
   * Espèce qui marche sur le fond (`sim/axolotl.ts`), ou absent pour une espèce qui nage
   * (`sim/swimmer.ts`).
   */
  readonly walker?: BottomWalkerParams;
  /**
   * Présent pour une espèce qui vit entre terre et eau en sautant (grenouille, issue #131) :
   * déplacement propre (`sim/frog.ts`), exclusif de `walker` et de `depth`.
   */
  readonly amphibian?: AmphibianParams;
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
  maxPopulation: 40,
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
  // Mange en surface et en pleine eau (au-dessus de 35 % de la hauteur d'eau) : faim pleine en
  // 3 min, perception 30 cm (5 longueurs de corps) : approximations de jeu.
  feeding: {
    hungerRate: 1 / 180,
    perceptionRadius: 0.3,
    turnRate: 2.5,
    minHeightRatio: 0.35,
    maxHeightRatio: 1,
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
  maxPopulation: 20,
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
  // Mange en surface et en pleine eau, un peu plus bas que le néon (au-dessus de 20 %),
  // plus vorace : approximations de jeu.
  feeding: {
    hungerRate: 1 / 150,
    perceptionRadius: 0.3,
    turnRate: 2.2,
    minHeightRatio: 0.2,
    maxHeightRatio: 1,
  },
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
  maxPopulation: 16,
  schooling: {
    neighborRadius: 0.2,
    // Banc lâche (#57) : à ~1 longueur de corps d'écart, les corydoras se fondaient en un
    // amas gris à l'écran. Séparation sur ~3 longueurs, cohésion faible, et jamais moins de
    // 1,5 longueur entre deux centres : chaque individu reste lisible sur les captures.
    separationRadius: 0.15,
    separationWeight: 1.5,
    alignmentWeight: 0.5,
    cohesionWeight: 0.3,
    turnRate: 1.2,
    minDistance: 0.08,
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
  // Mange au fond seulement : un granulé n'est remarqué qu'arrivé sous 10 % de la hauteur
  // d'eau (posé sur le sable ou presque) ; faim pleine en 4 min : approximations de jeu.
  feeding: {
    hungerRate: 1 / 240,
    perceptionRadius: 0.4,
    turnRate: 2.5,
    minHeightRatio: 0,
    maxHeightRatio: 0.1,
  },
};

/**
 * Koï (Cyprinus rubrofuscus, carpe koï), bassin extérieur (docs/DA.md, issue #88).
 *
 * - Robes : trois motifs classiques, générés par le code (`render/fish-model.ts`, gabarit
 *   `koi`) : « Kohaku » (blanc taché de rouge), « Orenji » (orange, nageoires et ventre or) et « Sanke » (blanc
 *   taché de rouge et de noir). Couleurs : palette « Koïs » de docs/DA.md. Chaque individu
 *   reçoit sa robe selon la graine du monde et son identifiant (`variantDraw: 'graine'`).
 * - `bodyLength` (14 cm) : **approximation de jeu**, volontairement *plus petite* qu'un koï
 *   adulte réel (plusieurs dizaines de centimètres ; référence à consulter : FishBase,
 *   Cyprinus rubrofuscus ; non vérifiée ici) : la marge aux parois (`wallMargin`, au moins la
 *   demi-longueur) vaut aussi en hauteur, et le bassin n'a que 30 cm d'eau.
 * - Nage lente et calme, en groupe lâche (séparation sur ~2 longueurs, cohésion faible),
 *   presque à l'horizontale ; vitesses, virages, banc, alimentation : **approximations de
 *   jeu**.
 */
const KOI_KOHAKU: SpeciesColors = {
  stripe: '#d94a3a',
  accent: '#d94a3a',
  back: '#f2ead8',
  belly: '#f2ead8',
  fin: '#f2ead8',
  eye: '#1c1c22',
};

export const KOI: SpeciesDefinition = {
  id: 'koi',
  name: 'Koï',
  scientificName: 'Cyprinus rubrofuscus',
  bodyLength: 0.14,
  cruiseSpeed: 0.05,
  minSpeed: 0.025,
  maxSpeed: 0.1,
  wanderTurnRate: 0.5,
  avoidTurnRate: 2,
  maxPitch: 0.2,
  wallMargin: 0.07,
  tailBeatFrequency: 1.2,
  defaultPopulation: 7,
  maxPopulation: 14,
  schooling: {
    neighborRadius: 0.6,
    separationRadius: 0.3,
    separationWeight: 1.2,
    alignmentWeight: 0.6,
    cohesionWeight: 0.3,
    turnRate: 0.8,
    minDistance: 0.16,
  },
  silhouette: 'koi',
  colors: KOI_KOHAKU,
  variants: [
    { id: 'kohaku', name: 'Koï kohaku', silhouette: 'koi', scale: 1, colors: KOI_KOHAKU },
    {
      id: 'orenji',
      name: 'Koï orenji',
      silhouette: 'koi',
      scale: 1,
      colors: {
        stripe: '#f08a2c',
        accent: '#f08a2c',
        back: '#f08a2c',
        belly: '#f2c14e',
        fin: '#f2c14e',
        eye: '#1c1c22',
      },
    },
    {
      id: 'sanke',
      name: 'Koï sanke',
      silhouette: 'koi',
      scale: 1,
      colors: {
        stripe: '#1c1c22',
        accent: '#d94a3a',
        back: '#f2ead8',
        belly: '#f2ead8',
        fin: '#f2ead8',
        eye: '#1c1c22',
      },
    },
  ],
  variantDraw: 'graine',
  // Mange dans toute la hauteur d'eau, faim pleine en 5 min : approximations de jeu.
  feeding: {
    hungerRate: 1 / 300,
    perceptionRadius: 0.5,
    turnRate: 1.5,
    minHeightRatio: 0,
    maxHeightRatio: 1,
  },
};

/**
 * Axolotl (Ambystoma mexicanum), paludarium (docs/DA.md, issue #130) : amphibien qui garde
 * toute sa vie ses branchies externes (trois de chaque côté de la tête) et vit dans l'eau.
 *
 * - Couleurs : rose `#f7b2bd` de la palette « Amphibiens » de docs/DA.md (corps), branchies
 *   en rose nénuphar `#f06a9b` (plus soutenu, pour se détacher du corps), crête et pattes
 *   en rose `#f4978e`, ventre `#f2ead8`, œil `#1c1c22` : couleurs existantes de la palette.
 * - Marche lentement sur le fond, nage par à-coups en ondulant la queue et remonte parfois
 *   vers la surface (comportement décrit par l'issue #130, qualitativement) : durées,
 *   poids des états, vitesses : **approximations de jeu**.
 * - `bodyLength` (9 cm sans la queue, 13 cm en tout) : **approximation de jeu**, plus petit
 *   qu'un axolotl adulte réel (référence à consulter : AmphibiaWeb, Ambystoma mexicanum ;
 *   non vérifiée ici), pour tenir dans les 21 cm d'eau du paludarium.
 * - Solitaire (pas de banc). Alimentation générique (hors périmètre de #130) : mange un
 *   granulé qui passe à sa portée près du fond, sans le chercher.
 */
export const AXOLOTL: SpeciesDefinition = {
  id: 'axolotl',
  name: 'Axolotl',
  scientificName: 'Ambystoma mexicanum',
  bodyLength: 0.09,
  cruiseSpeed: 0.03,
  minSpeed: 0.008,
  maxSpeed: 0.09,
  wanderTurnRate: 0.6,
  avoidTurnRate: 2,
  maxPitch: 1.1,
  wallMargin: 0.07,
  tailBeatFrequency: 1.2,
  defaultPopulation: 2,
  maxPopulation: 4,
  schooling: null,
  silhouette: 'axolotl',
  colors: {
    stripe: '#f7b2bd',
    accent: '#f06a9b',
    back: '#f7b2bd',
    belly: '#f2ead8',
    fin: '#f4978e',
    eye: '#1c1c22',
  },
  feeding: {
    hungerRate: 1 / 300,
    perceptionRadius: 0.2,
    turnRate: 1,
    minHeightRatio: 0,
    maxHeightRatio: 0.3,
  },
  walker: {
    clearance: 0.016,
    surfaceMargin: 0.016,
    walkSpeed: 0.012,
    slotDuration: 12,
    weights: { marche: 0.5, nage: 0.35, remontee: 0.15 },
    burstPeriod: 2.4,
    climbSpeed: 0.06,
  },
};

/**
 * Grenouille, paludarium (docs/DA.md « Amphibiens », issue #131) : vit sur la berge, saute,
 * entre dans l'eau pour nager quelques secondes, puis revient sur la berge.
 *
 * - Couleurs : vert grenouille `#7bc950` de la palette « Amphibiens » de docs/DA.md (dos et
 *   flancs), taches et pattes en vert sombre `#4e9a4a`, ventre `#f2ead8`, œil `#1c1c22` :
 *   couleurs existantes de la palette.
 * - Durées, portées et hauteur des sauts, vitesse de nage, part du temps dans l'eau :
 *   **approximations de jeu**, pour des sauts lisibles à l'échelle du bac.
 * - `bodyLength` (5 cm) : **approximation de jeu**, ordre de grandeur d'une petite grenouille
 *   arboricole (référence à consulter : AmphibiaWeb ; non vérifiée ici), agrandi pour rester
 *   lisible en pixel art.
 * - Solitaire (pas de banc). Ne cherche pas la nourriture (nourrissage hors périmètre de #131).
 */
export const GRENOUILLE: SpeciesDefinition = {
  id: 'grenouille',
  name: 'Grenouille',
  scientificName: 'Anura',
  bodyLength: 0.05,
  cruiseSpeed: 0.05,
  minSpeed: 0.01,
  maxSpeed: 0.2,
  wanderTurnRate: 1.2,
  avoidTurnRate: 3,
  maxPitch: 0.9,
  wallMargin: 0.05,
  tailBeatFrequency: 2,
  defaultPopulation: 3,
  maxPopulation: 4,
  schooling: null,
  silhouette: 'grenouille',
  colors: {
    stripe: '#7bc950',
    accent: '#4e9a4a',
    back: '#7bc950',
    belly: '#f2ead8',
    fin: '#4e9a4a',
    eye: '#1c1c22',
  },
  feeding: {
    hungerRate: 1 / 300,
    perceptionRadius: 0.1,
    turnRate: 1,
    minHeightRatio: 0.7,
    maxHeightRatio: 1,
  },
  amphibian: {
    clearance: 0.012,
    floatDepth: 0.008,
    maxRise: 0.26,
    hopDuration: 0.5,
    hopMinRange: 0.04,
    hopMaxRange: 0.09,
    hopHeight: 0.04,
    hopSlot: 1.6,
    hopChance: 0.45,
    cycleDuration: 40,
    waterShare: 0.35,
    swimSpeed: 0.05,
  },
};

/** Toutes les espèces connues, par identifiant (ordre de déclaration = ordre de peuplement). */
export const SPECIES: Readonly<Record<SpeciesId, SpeciesDefinition>> = {
  neon: NEON,
  guppy: GUPPY,
  corydora: CORYDORA,
  koi: KOI,
  axolotl: AXOLOTL,
  grenouille: GRENOUILLE,
};

/** Apparences d'une espèce : ses `variants`, ou son apparence par défaut seule. */
export function speciesVariants(def: SpeciesDefinition): readonly SpeciesVariant[] {
  if (def.variants && def.variants.length > 0) {
    return def.variants;
  }
  return [{ id: def.id, name: def.name, silhouette: def.silhouette, scale: 1, colors: def.colors }];
}

/**
 * Indice de l'apparence d'un individu dans `speciesVariants(def)`, déterministe, sans état ni
 * tirage du générateur des entités, donc sans effet sur la simulation :
 *
 * - `variantDraw` absent ou `'alternance'` : `id` modulo le nombre d'apparences (les
 *   identifiants étant consécutifs, les apparences alternent ; `seed` est ignorée) ;
 * - `'graine'` : les identifiants sont groupés par blocs de autant d'individus que
 *   d'apparences, et chaque bloc reçoit une permutation des apparences tirée de la graine et
 *   du numéro de bloc. Même graine, mêmes robes ; et toutes les apparences sont présentes
 *   dès qu'il y a au moins autant d'individus que d'apparences.
 * @throws RangeError si `id` n'est pas un entier positif ou nul, ou si `seed` n'est pas un
 * entier 32 bits non signé.
 */
export function speciesVariantIndex(def: SpeciesDefinition, id: number, seed = 0): number {
  if (!Number.isInteger(id) || id < 0) {
    throw new RangeError(`identifiant invalide : ${id}`);
  }
  // Sans passer par `speciesVariants` : aucune allocation (appelé à chaque image par le rendu).
  const count = def.variants && def.variants.length > 0 ? def.variants.length : 1;
  if (def.variantDraw !== 'graine' || count === 1) {
    return id % count;
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(`graine invalide : ${seed}`);
  }
  return blockPermutationAt(seed, Math.floor(id / count), id % count, count);
}

/** Tableau de travail des permutations (aucune allocation par appel). */
const PERMUTATION: number[] = [];

/**
 * Élément `position` de la permutation de `[0, count)` du bloc `block` : mélange de
 * Fisher-Yates piloté par un hachage entier (variante de « lowbias32 ») de la graine, du bloc
 * et du rang, indépendant du générateur des entités.
 */
function blockPermutationAt(seed: number, block: number, position: number, count: number): number {
  for (let i = 0; i < count; i++) {
    PERMUTATION[i] = i;
  }
  let h = hash32(seed ^ hash32(block + 0x9e3779b9));
  for (let i = count - 1; i > 0; i--) {
    h = hash32(h + i);
    const j = h % (i + 1);
    const tmp = PERMUTATION[i];
    PERMUTATION[i] = PERMUTATION[j];
    PERMUTATION[j] = tmp;
  }
  return PERMUTATION[position];
}

/** Hachage entier 32 bits non signé (mélange de bits, sans état). */
function hash32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
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
  if (!Number.isInteger(def.maxPopulation) || !(def.maxPopulation >= def.defaultPopulation)) {
    problems.push('maxPopulation doit être un entier au moins égal à defaultPopulation');
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
  if (def.variantDraw !== undefined && !['alternance', 'graine'].includes(def.variantDraw)) {
    problems.push(`variantDraw inconnu : ${String(def.variantDraw)}`);
  }
  if (def.depth !== undefined) {
    problems.push(...validateDepth(def.depth));
  }
  problems.push(...validateFeeding(def.feeding));
  if (def.walker !== undefined) {
    problems.push(...validateWalker(def.walker, def));
  }
  if (def.amphibian !== undefined) {
    problems.push(...validateAmphibian(def.amphibian, def));
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

function validateFeeding(feeding: FeedingParams): string[] {
  const problems: string[] = [];
  for (const key of ['hungerRate', 'perceptionRadius', 'turnRate'] as const) {
    const value = feeding[key];
    if (!(value > 0) || !Number.isFinite(value)) {
      problems.push(`feeding.${key} doit être un réel strictement positif (reçu : ${value})`);
    }
  }
  const { minHeightRatio: lo, maxHeightRatio: hi } = feeding;
  if (!(lo >= 0 && lo < hi && hi <= 1)) {
    problems.push(
      `feeding : il faut 0 ≤ minHeightRatio < maxHeightRatio ≤ 1 (reçu : ${lo}, ${hi})`,
    );
  }
  return problems;
}

function validateWalker(walker: BottomWalkerParams, def: SpeciesDefinition): string[] {
  const problems: string[] = [];
  for (const key of [
    'clearance',
    'surfaceMargin',
    'walkSpeed',
    'slotDuration',
    'burstPeriod',
    'climbSpeed',
  ] as const) {
    const value = walker[key];
    if (!(value > 0) || !Number.isFinite(value)) {
      problems.push(`walker.${key} doit être un réel strictement positif (reçu : ${value})`);
    }
  }
  if (!(walker.walkSpeed >= def.minSpeed && walker.walkSpeed <= def.maxSpeed)) {
    problems.push('walker.walkSpeed doit être dans [minSpeed, maxSpeed]');
  }
  const weights = Object.values(walker.weights);
  if (weights.some((w) => !(w >= 0) || !Number.isFinite(w))) {
    problems.push('walker.weights : poids positifs ou nuls attendus');
  } else if (!(weights.reduce((a, b) => a + b, 0) > 0)) {
    problems.push('walker.weights : la somme des poids doit être strictement positive');
  }
  if (def.schooling !== null) {
    problems.push('une espèce qui marche sur le fond est solitaire (schooling: null)');
  }
  if (def.depth !== undefined) {
    problems.push('walker et depth sont exclusifs');
  }
  return problems;
}

function validateAmphibian(params: AmphibianParams, def: SpeciesDefinition): string[] {
  const problems: string[] = [];
  for (const key of [
    'clearance',
    'floatDepth',
    'maxRise',
    'hopDuration',
    'hopMinRange',
    'hopMaxRange',
    'hopHeight',
    'hopSlot',
    'cycleDuration',
    'swimSpeed',
  ] as const) {
    const value = params[key];
    if (!(value > 0) || !Number.isFinite(value)) {
      problems.push(`amphibian.${key} doit être un réel strictement positif (reçu : ${value})`);
    }
  }
  if (!(params.hopChance >= 0 && params.hopChance <= 1)) {
    problems.push(`amphibian.hopChance doit être dans [0, 1] (reçu : ${params.hopChance})`);
  }
  if (!(params.waterShare > 0 && params.waterShare < 1)) {
    problems.push(`amphibian.waterShare doit être dans ]0, 1[ (reçu : ${params.waterShare})`);
  }
  if (!(params.hopMaxRange >= params.hopMinRange)) {
    problems.push('amphibian.hopMaxRange doit être au moins hopMinRange');
  }
  const hopSpeeds = [params.hopMinRange, params.hopMaxRange].map((r) => r / params.hopDuration);
  if (hopSpeeds.some((v) => !(v >= def.minSpeed && v <= def.maxSpeed))) {
    problems.push(
      'amphibian : la vitesse des sauts (portée / durée) doit être dans [minSpeed, maxSpeed]',
    );
  }
  if (!(params.swimSpeed >= def.minSpeed && params.swimSpeed <= def.maxSpeed)) {
    problems.push('amphibian.swimSpeed doit être dans [minSpeed, maxSpeed]');
  }
  if (def.schooling !== null) {
    problems.push('une espèce amphibie est solitaire (schooling: null)');
  }
  if (def.walker !== undefined || def.depth !== undefined) {
    problems.push('amphibian est exclusif de walker et de depth');
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
