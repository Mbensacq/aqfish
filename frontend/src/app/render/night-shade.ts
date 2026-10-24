import { clampIntensity, mix, twilightWeight } from '../sim/daylight';

export { twilightWeight };

/**
 * Luminosité des objets en couleurs plates (poissons, bulles, diffuseur : ADR 0009, 0017)
 * la nuit, en facteur multiplicatif linéaire de leur couleur (issue #64, ADR 0019).
 *
 * Ces matériaux ne sont pas éclairés : sans ce facteur, ils restent au niveau de midi à
 * minuit. Valeur choisie pour la passe palette : à 0,6, le bleu néon reste `neonBleu`
 * (poissons lisibles), le rouge néon passe à `koiRouge`, le blanc à `sable`, les nageoires
 * et les bulles `eauTresClaire` à `eauClaire`, le noir à `fondScene` ; en dessous de 0,55,
 * le bleu néon tombe sur une couleur d'eau et les poissons se fondent dans le bac.
 */
export const NIGHT_FLAT_BRIGHTNESS = 0.6;

/**
 * Facteur de luminosité des couleurs plates pour une intensité du jour `intensity`
 * (`DayLight.intensity`, dans [0, 1]) : exactement 1 en plein jour (captures de midi
 * inchangées), `NIGHT_FLAT_BRIGHTNESS` en pleine nuit, linéaire entre les deux.
 * Une intensité hors de [0, 1] est ramenée dans l'intervalle ; une valeur non finie compte
 * comme le plein jour.
 */
export function flatBrightness(intensity: number): number {
  return mix(NIGHT_FLAT_BRIGHTNESS, 1, clampIntensity(intensity));
}

/** Couleur RVB modifiable, composantes linéaires (facteurs multiplicatifs). */
export type MutableTint = [number, number, number];

/**
 * Facteur multiplicatif (linéaire, par canal) des couleurs du décor (plantes, rochers : en
 * couleurs plates, ADR 0015) en pleine nuit : clair de lune, vert-bleu sombre pour les
 * plantes, gris bleuté pour les rochers (issue #73, ADR 0021).
 */
export const DECOR_NIGHT_TINT: readonly [number, number, number] = [0.4, 0.5, 1.2];
/** Facteur du décor à mi-transition (aube, crépuscule) : lumière rasante, chaude. */
export const DECOR_TWILIGHT_TINT: readonly [number, number, number] = [1, 0.55, 0.8];
/** Part maximale de la teinte de crépuscule du décor (atteinte à mi-transition). */
export const DECOR_TWILIGHT_STRENGTH = 0.75;

/**
 * Teinte du décor pour une intensité du jour, écrite dans `out` (aucune allocation) :
 * exactement blanc (1, 1, 1) en plein jour (captures de midi inchangées),
 * `DECOR_NIGHT_TINT` en pleine nuit, teinte chaude à mi-transition.
 */
export function decorTintInto(intensity: number, out: MutableTint): MutableTint {
  const i = clampIntensity(intensity);
  const twilight = DECOR_TWILIGHT_STRENGTH * twilightWeight(i);
  for (let k = 0; k < 3; k++) {
    out[k] = mix(mix(DECOR_NIGHT_TINT[k], 1, i), DECOR_TWILIGHT_TINT[k], twilight);
  }
  return out;
}

/**
 * Pénalité qui écarte un groupe de tons de la passe palette : plus grande que la distance
 * au carré maximale entre deux couleurs sRGB (3). Le groupe ne peut alors jamais l'emporter
 * sur les couleurs de jour.
 */
export const TONE_PENALTY_OFF = 1000;
/**
 * Échelle des pénalités : à poids 1/2, un ton est préféré à une couleur de jour plus
 * proche de lui de moins de √0,02 ≈ 0,14 (≈ 36 niveaux sur 255).
 */
export const TONE_PENALTY_SCALE = 0.02;

/** Pénalités de la passe palette pour les tons de nuit et de crépuscule. */
export interface TonePenalties {
  night: number;
  twilight: number;
}

/** Pénalité d'un groupe de tons de poids `weight` dans [0, 1] : 0 à 1, infinie à 0. */
export function tonePenalty(weight: number): number {
  if (!(weight > 0)) {
    return TONE_PENALTY_OFF;
  }
  const w = Math.min(1, weight);
  return Math.min(TONE_PENALTY_OFF, (TONE_PENALTY_SCALE * (1 - w)) / w);
}

/**
 * Pénalités des tons ajoutés à la palette (ADR 0021) pour une intensité du jour, écrites
 * dans `out` : tons de nuit de poids `1 − i` (écartés en plein jour, libres en pleine nuit),
 * tons du crépuscule de poids `twilightWeight(i)` (écartés en plein jour et en pleine nuit).
 * En plein jour, les deux groupes sont écartés : l'image est celle de la palette de jour.
 */
export function tonePenaltiesInto(intensity: number, out: TonePenalties): TonePenalties {
  const i = clampIntensity(intensity);
  out.night = tonePenalty(1 - i);
  out.twilight = tonePenalty(twilightWeight(i));
  return out;
}
