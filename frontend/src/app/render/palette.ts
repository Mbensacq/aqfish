/**
 * Palette du rendu : module unique d'où provient toute couleur affichée
 * (docs/DA.md, « Règles du pixel art »). Chaque couleur est nommée par son usage.
 *
 * La passe de post-traitement (`render/palette-pass.ts`) ramène chaque pixel affiché à la
 * couleur la plus proche de cette liste : ajouter une couleur ici l'ajoute à l'écran.
 * Toutes les valeurs sont en sRGB, au format `#rrggbb`, et doivent rester distinctes.
 */
export const PALETTE = {
  // Fond et interface
  /** Fond de la scène, autour du bac (reprend le fond de l'interface). */
  fondScene: '#141418',
  /** Texte de l'interface (l'accent de l'interface est `eauClaire`). */
  texteInterface: '#e8e6e3',

  // Eau, de la plus profonde à la plus claire
  /** Transition entre le fond de la scène et l'eau profonde (eau vue sur fond sombre). */
  eauNuit: '#12292d',
  eauProfonde: '#0d3b3f',
  eauSombre: '#1b5e5a',
  eauMoyenne: '#2e8b7a',
  eauClaire: '#5fbfa3',
  eauTresClaire: '#a8e6cf',
  /** Vitre vue sur le fond sombre (lame d'air entre la surface et le haut du bac). */
  verreSombre: '#2f4542',

  // Sable et roche
  sableClair: '#e3cf9e',
  sable: '#c9b38a',
  sableSombre: '#a8916a',
  /** Sable vu à travers l'eau ou dans l'ombre, entre le sable sombre et la roche. */
  sableOmbre: '#86765b',
  roche: '#6e6a63',
  rocheSombre: '#45423e',

  // Végétation, de l'ombre à la lumière
  vegetationOmbre: '#163d22',
  vegetationSombre: '#1f4d2b',
  vegetation: '#2f6b3a',
  vegetationClaire: '#4e9a4a',
  vegetationLumineuse: '#8fd16a',

  // Koïs
  koiRouge: '#d94a3a',
  koiBlanc: '#f2ead8',
  koiNoir: '#1c1c22',
  koiOrange: '#f08a2c',
  koiOr: '#f2c14e',

  // Petits poissons
  neonBleu: '#3fa9f5',
  neonRouge: '#e63946',
  poissonJaune: '#ffd166',
  poissonRose: '#f4978e',

  // Amphibiens
  axolotlRose: '#f7b2bd',
  grenouilleVert: '#7bc950',
  tritonOrange: '#e07a2f',

  // Fleurs
  nenupharRose: '#f06a9b',
  coeurFleur: '#ffb703',
} as const;

export type PaletteColorName = keyof typeof PALETTE;

/** Couleurs de la palette dans leur ordre de déclaration (ordre utilisé par la passe). */
export const PALETTE_COLORS: readonly string[] = Object.values(PALETTE);

/**
 * Tons de nuit (issue #73, ADR 0021) : couleurs ajoutées à la palette **seulement la nuit**.
 * La passe palette ne les propose qu'avec une pénalité qui dépend de l'heure
 * (`render/night-shade.ts`, `tonePenalties`) : infinie en plein jour, de sorte que les
 * captures de midi ne peuvent pas les utiliser ; nulle en pleine nuit.
 */
export const NIGHT_TONES = {
  /** Sable sous la lune, vu de dessus (et de dessous, à travers l'eau). */
  sableLune: '#526a88',
  /** Côtés du sable sous la lune. */
  sableLuneOmbre: '#405458',
  /** Eau de nuit vue de côté. */
  eauLune: '#385471',
  /** Haut de l'eau la nuit, sous la surface. */
  eauLuneClaire: '#41688a',
  /** Surface de l'eau vue de dessus la nuit. */
  eauLuneSurface: '#4d7196',
  /** Rides de la surface la nuit. */
  refletLune: '#72a2a6',
  /** Végétation de nuit, de l'ombre à la lumière : vert-bleu sombre. */
  vegetationLuneSombre: '#0f3a2e',
  vegetationLune: '#1c4d40',
  vegetationLuneClaire: '#317051',
  vegetationLuneLumineuse: '#5d9973',
  /**
   * Bleu des néons la nuit (bleu néon assombri, `render/night-shade.ts`) : sans lui, il
   * tomberait sur `eauLuneSurface` et les néons se fondraient dans l'eau.
   */
  neonBleuNuit: '#3086c3',
  /** Roche sous la lune : gris bleuté. */
  rocheLune: '#474c6c',
  rocheLuneSombre: '#2b2e44',
} as const;

/**
 * Tons de l'aube et du crépuscule (issue #73, ADR 0021) : comme `NIGHT_TONES`, proposés à
 * la passe palette seulement pendant les transitions (pénalité infinie en plein jour et en
 * pleine nuit).
 */
export const TWILIGHT_TONES = {
  /** Sable sous la lumière rasante : beige rosé. */
  sableCrepuscule: '#9c837a',
  /** Sable à la fin du crépuscule : mauve (plus saturé depuis l'issue #81). */
  sableCrepusculeMauve: '#786884',
  /** Côtés du sable à la fin du crépuscule : brun rosé. */
  sableCrepusculeOmbre: '#6c5850',
  /** Eau du crépuscule : bleu-vert profond. */
  eauCrepuscule: '#395f68',
  /** Haut de l'eau au crépuscule. */
  eauCrepusculeClaire: '#4b8186',
  /** Roche sous la lumière rasante de fin de crépuscule : mauve rosé. */
  rocheCrepuscule: '#6e5266',
  /** Faces de roche à l'ombre au crépuscule : prune sombre. */
  rocheCrepusculeSombre: '#44323d',
} as const;

/**
 * Tons d'environnement (issue #148, ADR 0039) : couleurs proposées à la passe palette
 * **seulement** dans les environnements qui les déclarent (`Environment.tones`,
 * `sim/environment.ts`). Ailleurs, leur pénalité est `TONE_PENALTY_OFF` : elles ne peuvent
 * jamais l'emporter, et les images des autres environnements ne changent pas d'un octet.
 */
export const ENVIRONMENT_TONES = {
  /**
   * Eau du récif vue de côté : bleu franc. La teinte d'entrée de l'eau du récif est
   * `neonBleu`, saturé, que l'opacité du volume (30 %) ramène sur ce ton.
   */
  eauRecif: '#3f7597',
  /** Eau du récif sous la surface (opacité 50 %) : bleu plus clair. */
  eauRecifClaire: '#4796cb',
  /** Corail violet (issue #149) : flancs. Aucun violet dans la palette commune. */
  corailViolet: '#7d4fb8',
  /** Corail violet : dessus et bouts des branches. */
  corailVioletClair: '#b58be6',
  /**
   * Poisson-clown (issue #150) : orange vif, plus rouge et plus saturé que les oranges des
   * coraux (`koiOrange`, `tritonOrange`), dont il doit se distinguer.
   */
  clownOrange: '#ff6d00',
  /**
   * Chirurgien bleu (issue #151) : bleu roi, plus sombre et plus saturé que l'eau du récif
   * (`eauRecif`, `eauRecifClaire`) et que `neonBleu`, dont il doit se distinguer.
   */
  chirurgienBleu: '#1d3fbf',
} as const;

/**
 * Tons de la nourriture (issue #226, ADR 0056) : bruns de granulé, proposés à la passe palette
 * **seulement** sur les pixels où un granulé a été dessiné (marqueur d'opacité
 * `FOOD_ALPHA_MARKER`, `render/food-layer.ts`). Partout ailleurs ils ne peuvent jamais
 * l'emporter : la palette commune n'a aucun brun, et des bruns communs changeaient les images
 * du bassin, de la pièce et des meubles (bois, roche sombre).
 */
export const FOOD_TONES = {
  /** Granulé ocre : dessus. */
  granuleOcre: '#a0703a',
  /** Granulé brun-rouge : dessus ; flanc éclairé du granulé ocre. */
  granuleBrunRouge: '#8c4630',
  /** Brun sombre : flancs à l'ombre des granulés. */
  granuleBrun: '#6b4428',
} as const;

export type FoodToneName = keyof typeof FOOD_TONES;

/** Tons de la nourriture, dans leur ordre de déclaration (placés en fin de passe). */
export const FOOD_TONE_COLORS: readonly string[] = Object.values(FOOD_TONES);

/**
 * Tons d'entrée (issue #81) : couleurs données aux matériaux, **pas** proposées à la passe
 * palette. Elles ne s'affichent pas telles quelles : la passe les ramène à la couleur la plus
 * proche de la palette étendue. Seul le mode sans filtre les montre ; elles sont regroupées
 * ici pour que toute couleur du rendu vienne de ce module (docs/DA.md).
 *
 * Teintes d'entrée de l'eau et du sol de l'ambiance la nuit (issue #73, ADR 0021) : bleues
 * et saturées, car l'eau est translucide (30 % d'opacité) ; l'image affichée est ramenée aux
 * tons de nuit (`NIGHT_TONES`) par la passe.
 */
export const INPUT_TONES = {
  /** Volume de l'eau la nuit. */
  eauNuitEntree: '#2050a8',
  /** Surface de l'eau la nuit. */
  surfaceNuitEntree: '#3a6eb0',
  /** Sol de la lumière ambiante la nuit (faces tournées vers le bas, côtés du sable). */
  solNuitEntree: '#3c5a8c',
  /** Dessous du sable la nuit (non éclairé : vue de dessous, ADR 0006). */
  dessousSableNuitEntree: '#3c5272',
  /** Lumière blanche (ciel de l'ambiance, soleil) : teinte neutre des lumières. */
  lumiereBlanche: '#ffffff',
  /** Volume d'une eau mauvaise, trouble et verdâtre (issue #207, ADR 0053). */
  eauTroubleEntree: '#1a3a08',
  /** Surface d'une eau mauvaise (issue #207). */
  surfaceTroubleEntree: '#306818',
} as const;

export type NightToneName = keyof typeof NIGHT_TONES;
export type EnvironmentToneName = keyof typeof ENVIRONMENT_TONES;
export type TwilightToneName = keyof typeof TWILIGHT_TONES;

/** Tons de nuit, dans leur ordre de déclaration. */
export const NIGHT_TONE_COLORS: readonly string[] = Object.values(NIGHT_TONES);
/** Tons de l'aube et du crépuscule, dans leur ordre de déclaration. */
export const TWILIGHT_TONE_COLORS: readonly string[] = Object.values(TWILIGHT_TONES);
/** Noms des tons d'environnement, dans leur ordre de déclaration. */
export const ENVIRONMENT_TONE_NAMES = Object.keys(
  ENVIRONMENT_TONES,
) as readonly EnvironmentToneName[];
/** Tons d'environnement, dans le même ordre (placés après la palette étendue dans la passe). */
export const ENVIRONMENT_TONE_COLORS: readonly string[] = Object.values(ENVIRONMENT_TONES);

/** Vrai si `name` est le nom d'un ton d'environnement (clés héritées refusées). */
export function isEnvironmentToneName(name: string): name is EnvironmentToneName {
  return Object.hasOwn(ENVIRONMENT_TONES, name);
}

/**
 * Palette étendue de la passe : `PALETTE_COLORS`, puis les tons de nuit, puis ceux du
 * crépuscule. Les couleurs de jour viennent en premier : à égalité de distance, elles
 * l'emportent toujours.
 */
export const EXTENDED_PALETTE_COLORS: readonly string[] = [
  ...PALETTE_COLORS,
  ...NIGHT_TONE_COLORS,
  ...TWILIGHT_TONE_COLORS,
];
