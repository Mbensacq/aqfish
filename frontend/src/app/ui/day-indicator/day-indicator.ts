import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { PALETTE } from '../../render/palette';
import type { DayPhase } from '../../sim/daylight';

/** Côté de la grille des icônes, en pixels d'icône. */
export const DAY_ICON_GRID = 9;
/** Pixels CSS par pixel d'icône (même grain que la scène : `PIXEL_SIZE`). */
export const DAY_ICON_PIXEL = 3;

/** Libellé lisible de chaque moment de la journée (nom accessible de l'indicateur). */
export const DAY_PHASE_LABELS: Readonly<Record<DayPhase, string>> = {
  jour: 'jour',
  aube: 'aube',
  crepuscule: 'crépuscule',
  nuit: 'nuit',
};

/** Un pixel de l'icône : position dans la grille et couleur de la palette. */
export interface IconPixel {
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

/**
 * Icônes en pixel art, une ligne de texte par rangée : `#` astre, `=` horizon, `.` vide.
 * Soleil pour le jour, soleil à demi levé sur l'horizon pour l'aube et le crépuscule,
 * croissant de lune pour la nuit.
 */
const ICON_MASKS: Readonly<Record<'soleil' | 'horizon' | 'lune', readonly string[]>> = {
  soleil: [
    '....#....',
    '.#.....#.',
    '...###...',
    '..#####..',
    '#.#####.#',
    '..#####..',
    '...###...',
    '.#.....#.',
    '....#....',
  ],
  horizon: [
    '.........',
    '.........',
    '....#....',
    '.#.....#.',
    '...###...',
    '..#####..',
    '=========',
    '.........',
    '.........',
  ],
  lune: [
    '..####...',
    '.###.....',
    '###......',
    '###......',
    '###......',
    '###......',
    '###......',
    '.###.....',
    '..####...',
  ],
};

/** Icône et couleurs de chaque moment de la journée (couleurs de la palette, ADR 0007). */
const PHASE_ICONS: Readonly<
  Record<DayPhase, { mask: keyof typeof ICON_MASKS; star: string; horizon: string }>
> = {
  jour: { mask: 'soleil', star: PALETTE.poissonJaune, horizon: PALETTE.eauClaire },
  aube: { mask: 'horizon', star: PALETTE.koiOr, horizon: PALETTE.eauClaire },
  crepuscule: { mask: 'horizon', star: PALETTE.koiOrange, horizon: PALETTE.eauClaire },
  nuit: { mask: 'lune', star: PALETTE.texteInterface, horizon: PALETTE.eauClaire },
};

/**
 * Pixels de l'icône d'un moment de la journée (fonction pure, testée en unitaire).
 * @throws Error si le masque n'est pas une grille `DAY_ICON_GRID` × `DAY_ICON_GRID`.
 */
export function dayIconPixels(phase: DayPhase): readonly IconPixel[] {
  const icon = PHASE_ICONS[phase];
  const mask = ICON_MASKS[icon.mask];
  if (mask.length !== DAY_ICON_GRID || mask.some((row) => row.length !== DAY_ICON_GRID)) {
    throw new Error(`Icône « ${icon.mask} » : grille ${DAY_ICON_GRID} × ${DAY_ICON_GRID} attendue`);
  }
  const pixels: IconPixel[] = [];
  mask.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === '#') {
        pixels.push({ x, y, color: icon.star });
      } else if (cell === '=') {
        pixels.push({ x, y, color: icon.horizon });
      }
    });
  });
  return pixels;
}

/**
 * Indicateur discret du moment de la journée (issue #73) : petite icône pixel art en haut à
 * gauche (soleil, soleil sur l'horizon à l'aube et au crépuscule, lune la nuit), dont le nom
 * accessible dit le moment (« Moment de la journée : nuit »). Purement informatif : l'heure
 * se règle dans le panneau de contrôle (#52), juste à côté. Absent en mode capture
 * (c'est l'application qui ne l'affiche pas).
 */
@Component({
  selector: 'app-day-indicator',
  template: `<svg
    class="day-indicator"
    role="img"
    [attr.aria-label]="label()"
    [attr.data-phase]="phase()"
    [attr.viewBox]="'0 0 ' + grid + ' ' + grid"
    [attr.width]="size"
    [attr.height]="size"
    shape-rendering="crispEdges"
  >
    <title>{{ label() }}</title>
    @for (pixel of pixels(); track $index) {
      <rect [attr.x]="pixel.x" [attr.y]="pixel.y" width="1" height="1" [attr.fill]="pixel.color" />
    }
  </svg>`,
  styleUrl: './day-indicator.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayIndicator {
  /** Moment de la journée affiché. */
  readonly phase = input.required<DayPhase>();

  protected readonly grid = DAY_ICON_GRID;
  protected readonly size = DAY_ICON_GRID * DAY_ICON_PIXEL;
  protected readonly pixels = computed(() => dayIconPixels(this.phase()));
  protected readonly label = computed(
    () => `Moment de la journée : ${DAY_PHASE_LABELS[this.phase()]}`,
  );
}
