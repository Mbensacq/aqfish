/**
 * Palette du rendu : module unique d'où provient toute couleur affichée
 * (docs/DA.md, « Règles du pixel art »). Chaque couleur est nommée par son usage.
 *
 * Seules les couleurs utilisées par la scène sont déclarées ; la palette complète
 * (32 à 48 couleurs) sera étendue au fil des nuits, captures à l'appui.
 */
export const PALETTE = {
  /** Fond de la scène, autour du bac (reprend le fond de l'interface). */
  fondScene: '#141418',
  eauProfonde: '#0d3b3f',
  eauMoyenne: '#2e8b7a',
  eauClaire: '#5fbfa3',
  eauTresClaire: '#a8e6cf',
  sableClair: '#e3cf9e',
  sable: '#c9b38a',
  sableSombre: '#a8916a',
} as const;

export type PaletteColorName = keyof typeof PALETTE;
