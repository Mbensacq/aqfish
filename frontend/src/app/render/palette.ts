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
