/**
 * Parallaxe du mode immersif (#346, ADR 0087) : l'inclinaison de l'appareil déplace l'œil
 * devant la vitre, comme si l'on regardait à travers une vraie fenêtre tenue à la main.
 *
 * Modèle : la tête reste fixe, l'appareil tourne. Tourner l'écran d'un angle θ revient, dans
 * le repère de l'écran, à tourner l'œil de −θ autour du centre de l'écran : à la distance d,
 * l'œil se décale de d · sin θ. Seuls `beta` (avant-arrière, autour de l'axe x de l'appareil)
 * et `gamma` (gauche-droite, autour de l'axe y) servent ; `alpha` (boussole) est ignoré.
 *
 * - **Pose neutre** : la première lecture valide sert de référence (l'appareil tel qu'on le
 *   tient), puis la référence suit lentement la pose courante (recentrage, constante
 *   `recenterSeconds`) : une inclinaison maintenue finit par redevenir « en face ».
 * - **Amortissement** : l'œil rejoint sa cible par un filtre exponentiel (`smoothingSeconds`),
 *   indépendant de la cadence des images.
 * - **Bornes** : écart d'angle borné à `maxTiltDeg`, décalage borné à `maxOffsetRatio` de la
 *   demi-largeur et de la demi-hauteur de l'écran.
 * - **Entrées invalides** (lecture absente, angle non fini, pas de temps négatif ou non fini) :
 *   ignorées ; sans lecture, l'œil revient doucement au centre.
 *
 * Module pur (ni DOM, ni Three.js), sans allocation par appel : l'état est modifié en place.
 */

/** Réglages de la parallaxe (ADR 0087 : valeurs de jeu, non mesurées). */
export const PARALLAX = {
  /** Écart d'angle maximal pris en compte, en degrés. */
  maxTiltDeg: 30,
  /** Décalage maximal de l'œil, en fraction de la demi-taille de l'écran. */
  maxOffsetRatio: 0.8,
  /** Constante de temps de l'amortissement de l'œil, en secondes. */
  smoothingSeconds: 0.12,
  /** Constante de temps du recentrage de la pose neutre, en secondes. */
  recenterSeconds: 4,
  /** Pas de temps maximal d'un appel (au-delà, image sautée : pas d'à-coup). */
  maxStepSeconds: 0.25,
} as const;

/** Lecture d'orientation de l'appareil, en degrés (comme `DeviceOrientationEvent`). */
export interface OrientationReading {
  beta: number;
  gamma: number;
}

/** État de la parallaxe, modifié en place par `parallaxStep`. */
export interface ParallaxState {
  /** Décalage courant de l'œil par rapport au centre de l'écran (repère de l'écran, mm). */
  eyeX: number;
  eyeY: number;
  /** Pose neutre (degrés) ; `hasReference` faux tant qu'aucune lecture valide n'est venue. */
  refBeta: number;
  refGamma: number;
  hasReference: boolean;
}

/** État initial : œil centré, pas de pose neutre. */
export function createParallaxState(): ParallaxState {
  return { eyeX: 0, eyeY: 0, refBeta: 0, refGamma: 0, hasReference: false };
}

/** Oublie la pose neutre (la prochaine lecture redevient la référence) et recentre l'œil. */
export function resetParallax(state: ParallaxState): void {
  state.eyeX = 0;
  state.eyeY = 0;
  state.refBeta = 0;
  state.refGamma = 0;
  state.hasReference = false;
}

/** Paramètres d'un pas de parallaxe. */
export interface ParallaxFrame {
  /** Distance de l'œil à l'écran et taille de l'écran, dans la même unité (mm). */
  readonly eyeDistance: number;
  readonly screenWidth: number;
  readonly screenHeight: number;
  /** Angle d'affichage de l'écran (`screen.orientation.angle`) : 0, 90, 180 ou 270. */
  readonly screenAngleDeg: number;
}

const DEG = Math.PI / 180;

/** Écart `a − b` ramené à [−180 ; 180[ degrés (passage de ±180 sans saut). */
export function angleDelta(a: number, b: number): number {
  const d = (((a - b) % 360) + 540) % 360;
  return d - 180;
}

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

/** Facteur d'un filtre exponentiel de constante `tau` sur `dt` (0 : immobile, 1 : atteint). */
function follow(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
}

/**
 * Avance la parallaxe de `dt` secondes avec la lecture `reading` (`null` : aucune lecture).
 * Les valeurs invalides de `frame` laissent l'œil au centre.
 */
export function parallaxStep(
  state: ParallaxState,
  reading: OrientationReading | null,
  dt: number,
  frame: ParallaxFrame,
): void {
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, PARALLAX.maxStepSeconds) : 0;
  const { eyeDistance: d, screenWidth: w, screenHeight: h } = frame;
  if (!(
    Number.isFinite(d) &&
    d > 0 &&
    Number.isFinite(w) &&
    w > 0 &&
    Number.isFinite(h) &&
    h > 0
  )) {
    state.eyeX = 0;
    state.eyeY = 0;
    return;
  }
  let targetX = 0;
  let targetY = 0;
  const valid = reading !== null && Number.isFinite(reading.beta) && Number.isFinite(reading.gamma);
  if (valid) {
    if (!state.hasReference) {
      state.refBeta = reading.beta;
      state.refGamma = reading.gamma;
      state.hasReference = true;
    } else {
      const k = follow(step, PARALLAX.recenterSeconds);
      state.refBeta += angleDelta(reading.beta, state.refBeta) * k;
      state.refGamma += angleDelta(reading.gamma, state.refGamma) * k;
    }
    const maxTilt = PARALLAX.maxTiltDeg;
    const tiltX = clamp(angleDelta(reading.gamma, state.refGamma), maxTilt) * DEG;
    const tiltY = clamp(angleDelta(reading.beta, state.refBeta), maxTilt) * DEG;
    // Repère de l'appareil : gamma > 0 (bord droit qui s'éloigne) → œil vers la gauche ;
    // beta > 0 (haut qui se rapproche) → œil vers le haut.
    const devX = -d * Math.sin(tiltX);
    const devY = d * Math.sin(tiltY);
    // Repère de l'écran : l'affichage est tourné de `screenAngleDeg` par rapport à l'appareil.
    const angle = Number.isFinite(frame.screenAngleDeg) ? frame.screenAngleDeg * DEG : 0;
    const cos = Math.round(Math.cos(angle) * 1e9) / 1e9;
    const sin = Math.round(Math.sin(angle) * 1e9) / 1e9;
    targetX = devX * cos - devY * sin;
    targetY = devX * sin + devY * cos;
  }
  const limit = PARALLAX.maxOffsetRatio;
  targetX = clamp(targetX, (w / 2) * limit);
  targetY = clamp(targetY, (h / 2) * limit);
  const k = follow(step, PARALLAX.smoothingSeconds);
  state.eyeX += (targetX - state.eyeX) * k;
  state.eyeY += (targetY - state.eyeY) * k;
}
