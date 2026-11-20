/** Écart maximal entre deux points transmis d'un passage de raclette, en pixels CSS (#604). */
export const STROKE_STEP_PX = 6;

/** Point d'un passage de raclette (#604), en pixels CSS du client. */
export interface StrokePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Points de `from` (exclu) à `to` (inclus), espacés de `step` pixels au plus : un geste rapide
 * ne saute pas une plaque entre deux événements du pointeur. Aucun point si rien n'a bougé
 * ou si une coordonnée n'est pas finie.
 */
export function strokePoints(
  from: StrokePoint,
  to: StrokePoint,
  step: number,
): { x: number; y: number }[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length === 0 || !(step > 0)) {
    return [];
  }
  const count = Math.ceil(length / step);
  return Array.from({ length: count }, (_, i) => ({
    x: from.x + (dx * (i + 1)) / count,
    y: from.y + (dy * (i + 1)) / count,
  }));
}
