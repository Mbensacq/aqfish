/**
 * Projection décentrée du mode immersif (#345, ADR 0086) : l'écran est une fenêtre fixe et
 * l'œil se trouve devant elle, pas forcément en face de son centre. Le tronc de vue passe
 * exactement par les quatre bords de l'écran : un point posé sur le plan de l'écran (la
 * vitre du bac) s'affiche là où il se trouve physiquement.
 *
 * Repère : écran centré à l'origine dans le plan z = 0, x vers la droite, y vers le haut, œil
 * en z > 0 regardant vers −z, sans rotation (la caméra reste parallèle à l'écran). Toutes les
 * longueurs dans la même unité. Module pur (ni Three.js, ni DOM).
 */

/** Distance de l'œil à l'écran, en millimètres : bornes et défauts (ADR 0086). */
export const EYE_DISTANCE_MM = {
  min: 150,
  max: 1500,
  /** Téléphone (diagonale < 200 mm) : tenu à la main. */
  phone: 350,
  /** Tablette (diagonale < 330 mm). */
  tablet: 450,
  /** Ordinateur : écran posé. */
  desktop: 600,
} as const;

/** Distance d'œil par défaut pour un écran de `widthMm` × `heightMm` (ADR 0086). */
export function defaultEyeDistanceMm(widthMm: number, heightMm: number): number {
  const diagonal = Math.hypot(widthMm, heightMm);
  if (!Number.isFinite(diagonal) || diagonal <= 0) {
    return EYE_DISTANCE_MM.desktop;
  }
  if (diagonal < 200) {
    return EYE_DISTANCE_MM.phone;
  }
  return diagonal < 330 ? EYE_DISTANCE_MM.tablet : EYE_DISTANCE_MM.desktop;
}

/** Distance d'œil `mm` ramenée à `EYE_DISTANCE_MM` ; une valeur non finie donne `fallback`. */
export function clampEyeDistanceMm(mm: number, fallback: number = EYE_DISTANCE_MM.desktop): number {
  const value = Number.isFinite(mm) ? mm : fallback;
  return Math.min(EYE_DISTANCE_MM.max, Math.max(EYE_DISTANCE_MM.min, value));
}

/** Paramètres de la projection décentrée. */
export interface OffAxisInput {
  /** Largeur et hauteur de l'écran (la fenêtre). */
  readonly screenWidth: number;
  readonly screenHeight: number;
  /** Position de l'œil relativement au centre de l'écran (`z` > 0 : devant l'écran). */
  readonly eye: { readonly x: number; readonly y: number; readonly z: number };
  /** Plans proche et lointain, mesurés depuis l'œil le long de −z (0 < near < far). */
  readonly near: number;
  readonly far: number;
}

/** Tronc de vue sur le plan proche (comme `glFrustum`). */
export interface Frustum {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
  readonly near: number;
  readonly far: number;
}

/**
 * Tronc de vue décentré dont les bords passent par ceux de l'écran.
 * @throws RangeError si une valeur n'est pas finie, si l'écran est vide, si l'œil n'est pas
 * devant l'écran, ou si `near` / `far` ne vérifient pas 0 < near < far.
 */
export function offAxisFrustum(input: OffAxisInput): Frustum {
  const { screenWidth: w, screenHeight: h, eye, near, far } = input;
  for (const [value, name] of [
    [w, 'screenWidth'],
    [h, 'screenHeight'],
    [eye.x, 'eye.x'],
    [eye.y, 'eye.y'],
    [eye.z, 'eye.z'],
    [near, 'near'],
    [far, 'far'],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${name} doit être un nombre fini (reçu : ${value})`);
    }
  }
  if (w <= 0 || h <= 0) {
    throw new RangeError(`écran vide : ${w} × ${h}`);
  }
  if (eye.z <= 0) {
    throw new RangeError(`l’œil doit être devant l’écran (eye.z = ${eye.z})`);
  }
  if (near <= 0 || far <= near) {
    throw new RangeError(`plans invalides : near = ${near}, far = ${far}`);
  }
  // Théorème de Thalès : le bord de l'écran, à la distance eye.z, ramené au plan proche.
  const k = near / eye.z;
  return {
    left: (-w / 2 - eye.x) * k,
    right: (w / 2 - eye.x) * k,
    bottom: (-h / 2 - eye.y) * k,
    top: (h / 2 - eye.y) * k,
    near,
    far,
  };
}

/**
 * Matrice de projection en perspective du tronc `f`, en ordre colonne (celui de WebGL et de
 * `Matrix4.fromArray` de Three.js) : profondeur ramenée à [−1, 1] entre `near` et `far`.
 */
export function frustumMatrix(f: Frustum): number[] {
  const { left: l, right: r, bottom: b, top: t, near: n, far: fa } = f;
  const x = (2 * n) / (r - l);
  const y = (2 * n) / (t - b);
  const a = (r + l) / (r - l);
  const c = (t + b) / (t - b);
  const d = -(fa + n) / (fa - n);
  const e = (-2 * fa * n) / (fa - n);
  // prettier-ignore
  return [
    x, 0, 0, 0,
    0, y, 0, 0,
    a, c, d, -1,
    0, 0, e, 0,
  ];
}

/**
 * Coordonnées normalisées (NDC, [−1, 1] dans le tronc) du point `p` exprimé dans le repère de
 * l'œil, par la matrice `m` en ordre colonne. Sert aux tests et au contrôle des coins.
 */
export function projectToNdc(
  m: readonly number[],
  p: readonly [number, number, number],
): [number, number, number] {
  const [x, y, z] = p;
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cz = m[2] * x + m[6] * y + m[10] * z + m[14];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [cx / cw, cy / cw, cz / cw];
}
