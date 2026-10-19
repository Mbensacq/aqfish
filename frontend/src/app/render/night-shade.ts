import { mix } from '../sim/daylight';

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
  const day = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 1;
  return mix(NIGHT_FLAT_BRIGHTNESS, 1, day);
}
