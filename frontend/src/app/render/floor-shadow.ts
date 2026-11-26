import { Color } from 'three';

import { NIGHT_TONES, PALETTE } from './palette';

/**
 * Couleur des ombres posées sur le fond sous la surface (nénuphars #115, plantes flottantes
 * #832) : l'eau profonde le jour, un bleu nuit la nuit. Partagée pour que toutes ces ombres
 * suivent la même lumière.
 */

/** Couleur de l'ombre : l'eau, plus sombre au-dessus de l'ombre. */
export const FLOOR_SHADOW_COLOR = PALETTE.eauProfonde;
/**
 * Couleur de l'ombre en pleine nuit (#115) : un bleu nuit des tons de nuit (`NIGHT_TONES`), plus sombre que l'eau
 * sous la lune (`eauLune`). L'eau profonde multipliée par la teinte de nuit du décor virait
 * au vert sombre sur l'eau bleue.
 */
export const FLOOR_NIGHT_SHADOW_COLOR = NIGHT_TONES.rocheLuneSombre;

const SHADOW_DAY = new Color(FLOOR_SHADOW_COLOR);
const SHADOW_NIGHT = new Color(FLOOR_NIGHT_SHADOW_COLOR);

/**
 * Couleur de l'ombre (composantes linéaires) sous la teinte du décor `tint` et l'intensité du
 * jour `intensity` (ramenée dans [0, 1], non finie : plein jour) : l'eau profonde multipliée
 * par la teinte en plein jour (exactement `FLOOR_SHADOW_COLOR` sous une teinte blanche),
 * `FLOOR_NIGHT_SHADOW_COLOR` multipliée par le ciel couvert `overcast` en pleine nuit,
 * linéaire entre les deux. Écrit dans `out` et le renvoie, sans allocation.
 */
export function floorShadowInto(
  tint: readonly [number, number, number],
  intensity: number,
  overcast: number,
  out: Color,
): Color {
  const i = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 1;
  const sky = Number.isFinite(overcast) ? Math.min(1, Math.max(0, overcast)) : 1;
  out.setRGB(
    SHADOW_NIGHT.r * sky + (SHADOW_DAY.r * tint[0] - SHADOW_NIGHT.r * sky) * i,
    SHADOW_NIGHT.g * sky + (SHADOW_DAY.g * tint[1] - SHADOW_NIGHT.g * sky) * i,
    SHADOW_NIGHT.b * sky + (SHADOW_DAY.b * tint[2] - SHADOW_NIGHT.b * sky) * i,
  );
  return out;
}
