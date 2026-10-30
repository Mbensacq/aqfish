/**
 * Ciel couvert sous la pluie (issue #123, ADR 0082) : la scène est légèrement assombrie par
 * un facteur de luminosité **dédié**, multiplié aux intensités des lumières, aux couleurs de
 * l'eau et du sable (`AquariumScene.setOvercast`) et à la teinte du décor et des nénuphars
 * (`AquariumView.applyLight`). Les couleurs plates (poissons, bulles, gouttes, granulés,
 * feuilles de catappa) n'en reçoivent **pas** : vues à travers l'eau assombrie, elles gardent
 * leur clarté, sans quoi un koï ou une goutte changerait de couleur. L'intensité du jour
 * (`DayLight.intensity`) n'est pas touchée : elle choisit aussi les tons de nuit et du
 * crépuscule de la passe palette (`tonePenaltiesInto`) et la teinte chaude du décor
 * (`decorTintInto`), d'où les stries et les tons du soir à midi de l'essai du cycle 39
 * (`docs/PIEGES.md`).
 */

/**
 * Luminosité sous la pluie, dans ]0, 1[. Les tons du ciel couvert (`RAIN_TONES`) sont les
 * couleurs du bassin à cette luminosité : les changer ensemble.
 */
export const RAIN_OVERCAST_BRIGHTNESS = 0.85;

/**
 * Tons d'environnement du ciel couvert (`ENVIRONMENT_TONES`, ADR 0039), proposés à la passe
 * palette seulement sous la pluie : herbe, terre et margelle assombries gardent leur famille.
 */
export const RAIN_TONES: readonly string[] = [
  'vegetationClaireCouvert',
  'vegetationLumineuseCouvert',
  'rocheCouvert',
  'rocheSombreCouvert',
  'sableOmbreCouvert',
];

/** Facteur de ciel couvert : `RAIN_OVERCAST_BRIGHTNESS` sous la pluie, exactement 1 sinon. */
export function overcastBrightness(raining: boolean): number {
  return raining ? RAIN_OVERCAST_BRIGHTNESS : 1;
}

/**
 * Durée du fondu du ciel couvert (issue #338), en secondes de temps réel : temps pour passer
 * de 1 à `RAIN_OVERCAST_BRIGHTNESS`, ou l'inverse, quand la pluie bascule en cours de route.
 */
export const OVERCAST_FADE_SECONDS = 3;

/**
 * Facteur de ciel couvert `current` avancé de `dtSeconds` vers `target`, à vitesse constante
 * (l'écart entier `1 − RAIN_OVERCAST_BRIGHTNESS` en `OVERCAST_FADE_SECONDS`) : la cible est
 * atteinte **exactement** (1 hors pluie, jamais 0,999…). Pas nul, négatif ou non fini :
 * `current` inchangé ; `current` non fini : `target`.
 */
export function stepOvercast(current: number, target: number, dtSeconds: number): number {
  if (!Number.isFinite(current)) {
    return target;
  }
  const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
  const step = ((1 - RAIN_OVERCAST_BRIGHTNESS) / OVERCAST_FADE_SECONDS) * dt;
  const gap = target - current;
  if (Math.abs(gap) <= step) {
    return target;
  }
  return current + Math.sign(gap) * step;
}
