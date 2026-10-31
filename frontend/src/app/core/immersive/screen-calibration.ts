/**
 * Étalonnage de l'écran du mode immersif (#345, ADR 0086) : conversion entre pixels CSS et
 * millimètres réels, pour que la vitre virtuelle ait la taille physique de l'écran.
 *
 * L'utilisateur pose une carte au format ID-1 (carte bancaire, ISO/IEC 7810 : 85,60 ×
 * 53,98 mm) contre l'écran et ajuste un rectangle à sa largeur : `calibrationFromCard`. Sans
 * étalonnage, on suppose le pixel CSS de référence (96 px par pouce, soit 25,4 mm) : valeur
 * **estimée**, souvent fausse sur téléphone et à signaler comme telle.
 *
 * Module pur (ni Angular, ni Three.js, ni DOM).
 */

/** Largeur d'une carte ID-1 (ISO/IEC 7810), en millimètres. */
export const CARD_WIDTH_MM = 85.6;

/** Hauteur d'une carte ID-1 (ISO/IEC 7810), en millimètres. */
export const CARD_HEIGHT_MM = 53.98;

/** Pixels CSS par millimètre du pixel de référence CSS (96 px par pouce de 25,4 mm). */
export const CSS_PX_PER_MM = 96 / 25.4;

/**
 * Bornes acceptées pour les pixels CSS par millimètre : en deçà de 1 (écran de plus de 2,5 m
 * de large à 1 000 px) ou au-delà de 20 (une carte de plus de 1 700 px CSS), la mesure est
 * certainement une erreur de manipulation.
 */
export const PX_PER_MM_LIMITS = { min: 1, max: 20 } as const;

/** Étalonnage d'un écran : pixels CSS par millimètre, et `estimated` si non mesuré. */
export interface ScreenCalibration {
  readonly pxPerMm: number;
  readonly estimated: boolean;
}

/** Étalonnage par défaut, estimé (pixel CSS de référence). */
export const DEFAULT_CALIBRATION: ScreenCalibration = { pxPerMm: CSS_PX_PER_MM, estimated: true };

/** Vrai si `value` est un nombre de pixels CSS par millimètre acceptable. */
export function isValidPxPerMm(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= PX_PER_MM_LIMITS.min &&
    value <= PX_PER_MM_LIMITS.max
  );
}

/**
 * Étalonnage mesuré d'après la largeur à l'écran, en pixels CSS, d'une carte ID-1.
 * @throws RangeError si la largeur n'est pas un réel strictement positif, ou si l'étalonnage
 * obtenu sort de `PX_PER_MM_LIMITS`.
 */
export function calibrationFromCard(cardWidthPx: number): ScreenCalibration {
  if (!Number.isFinite(cardWidthPx) || cardWidthPx <= 0) {
    throw new RangeError(
      `largeur de carte invalide : ${cardWidthPx} (réel strictement positif attendu)`,
    );
  }
  const pxPerMm = cardWidthPx / CARD_WIDTH_MM;
  if (!isValidPxPerMm(pxPerMm)) {
    throw new RangeError(
      `étalonnage hors bornes : ${pxPerMm} px/mm (attendu entre ${PX_PER_MM_LIMITS.min} et ${PX_PER_MM_LIMITS.max})`,
    );
  }
  return { pxPerMm, estimated: false };
}

/** Largeur de la carte ID-1 à l'écran, en pixels CSS, pour l'étalonnage `calibration`. */
export function cardWidthPx(calibration: ScreenCalibration): number {
  return mmToPx(CARD_WIDTH_MM, calibration);
}

/**
 * Longueur `px` (pixels CSS) en millimètres.
 * @throws RangeError si `px` n'est pas fini ou si l'étalonnage est invalide.
 */
export function pxToMm(px: number, calibration: ScreenCalibration): number {
  assertFinite(px, 'px');
  assertCalibration(calibration);
  return px / calibration.pxPerMm;
}

/**
 * Longueur `mm` (millimètres) en pixels CSS.
 * @throws RangeError si `mm` n'est pas fini ou si l'étalonnage est invalide.
 */
export function mmToPx(mm: number, calibration: ScreenCalibration): number {
  assertFinite(mm, 'mm');
  assertCalibration(calibration);
  return mm * calibration.pxPerMm;
}

/** Dimensions physiques d'une zone de `widthPx` × `heightPx` pixels CSS, en millimètres. */
export interface ScreenSizeMm {
  readonly width: number;
  readonly height: number;
}

/**
 * Taille physique de l'écran (ou de la fenêtre) en millimètres.
 * @throws RangeError si une dimension n'est pas un réel strictement positif.
 */
export function screenSizeMm(
  widthPx: number,
  heightPx: number,
  calibration: ScreenCalibration,
): ScreenSizeMm {
  for (const [value, name] of [
    [widthPx, 'largeur'],
    [heightPx, 'hauteur'],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} d’écran invalide : ${value}`);
    }
  }
  return { width: pxToMm(widthPx, calibration), height: pxToMm(heightPx, calibration) };
}

/** Texte enregistré d'un étalonnage mesuré (le défaut estimé n'est jamais enregistré). */
export function serializeCalibration(calibration: ScreenCalibration): string {
  assertCalibration(calibration);
  return JSON.stringify({ pxPerMm: calibration.pxPerMm });
}

/** Étalonnage relu depuis `text`, ou `null` si le texte est absent ou invalide. Ne lève jamais. */
export function parseCalibration(text: string | null): ScreenCalibration | null {
  if (text === null) {
    return null;
  }
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null) {
      return null;
    }
    const pxPerMm = (data as { pxPerMm?: unknown }).pxPerMm;
    return isValidPxPerMm(pxPerMm) ? { pxPerMm, estimated: false } : null;
  } catch {
    return null;
  }
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} doit être un nombre fini (reçu : ${value})`);
  }
}

function assertCalibration(calibration: ScreenCalibration): void {
  if (!isValidPxPerMm(calibration.pxPerMm)) {
    throw new RangeError(`étalonnage invalide : ${calibration.pxPerMm} px/mm`);
  }
}
