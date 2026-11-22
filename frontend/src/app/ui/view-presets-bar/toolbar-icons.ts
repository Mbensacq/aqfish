import { iconPixels, type IconPixel } from '../pixel-icon/pixel-masks';

/** Côté des icônes de la barre du bas (charte : grille de 12, `docs/INTERFACE.md`). */
export const TOOLBAR_ICON_GRID = 12;

/** Outils de la barre du bas qui portent une icône. */
export type ToolbarIcon = 'nourrir' | 'raclette' | 'secateur' | 'photo';

/**
 * Masques des icônes, dessinés pour le projet (#724) : boîte de granulés et granulés qui tombent,
 * raclette (lame et manche), sécateur ouvert, appareil photo.
 */
export const TOOLBAR_ICON_MASKS: Readonly<Record<ToolbarIcon, readonly string[]>> = {
  nourrir: [
    '.##########.',
    '.##########.',
    '.#........#.',
    '.#.#..#.#.#.',
    '.#........#.',
    '.#..#.#..##.',
    '.##########.',
    '............',
    '...#....#...',
    '......#.....',
    '..#......#..',
    '.....#......',
  ],
  raclette: [
    '............',
    '.##########.',
    '.##########.',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '....####....',
    '............',
  ],
  secateur: [
    '.#........#.',
    '..#......#..',
    '...#....#...',
    '....#..#....',
    '.....##.....',
    '.....##.....',
    '....#..#....',
    '...#....#...',
    '.###....###.',
    '#..#....#..#',
    '#..#....#..#',
    '.##......##.',
  ],
  photo: [
    '............',
    '....####....',
    '.##########.',
    '#..........#',
    '#...####...#',
    '#..#....#..#',
    '#..#....#..#',
    '#..#....#..#',
    '#...####...#',
    '#..........#',
    '.##########.',
    '............',
  ],
};

/** Pixels pleins de chaque icône de la barre du bas. */
export const TOOLBAR_ICON_PIXELS: Readonly<Record<ToolbarIcon, readonly IconPixel[]>> = {
  nourrir: iconPixels(TOOLBAR_ICON_MASKS.nourrir, TOOLBAR_ICON_GRID),
  raclette: iconPixels(TOOLBAR_ICON_MASKS.raclette, TOOLBAR_ICON_GRID),
  secateur: iconPixels(TOOLBAR_ICON_MASKS.secateur, TOOLBAR_ICON_GRID),
  photo: iconPixels(TOOLBAR_ICON_MASKS.photo, TOOLBAR_ICON_GRID),
};
