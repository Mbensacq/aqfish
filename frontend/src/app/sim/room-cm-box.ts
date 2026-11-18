/**
 * Boîtes de la pose des bacs et des meubles supports (`room-state.ts`, ADR 0073), comptées en
 * centimètres entiers (en demi-centimètres pour les cotes horizontales et verticales des
 * emprises) : comparaisons exactes, sans arrondi flottant. Séparées de `room-state.ts` au
 * lot 6 du chantier #686.
 */

/**
 * Sol de la pièce, en mètres, origine au centre : une emprise (meuble ou bac posé au sol) doit
 * y tenir entièrement. 8 × 6 m, de quoi aligner plusieurs meubles d'aquarium.
 */
export const ROOM_FLOOR = { halfWidth: 4, halfDepth: 3 } as const;

/** Boîte alignée sur les axes, en centimètres entiers, base comptée depuis le parquet. */
export interface CmBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Vrai si `value` est un multiple du centimètre, fini (`-1.4` oui, `0.123` non). */
export function isCentimetric(value: number): boolean {
  return Number.isFinite(value) && Math.round(value * 100) / 100 === value;
}

/** Longueur `value` (mètres) en centimètres entiers. */
export function cm(value: number): number {
  return Math.round(value * 100);
}

/** Vrai si les deux boîtes se chevauchent (se toucher n'est pas chevaucher). */
export function cmBoxesOverlap(a: CmBox, b: CmBox): boolean {
  return (
    a.minX < b.maxX &&
    b.minX < a.maxX &&
    a.minY < b.maxY &&
    b.minY < a.maxY &&
    a.minZ < b.maxZ &&
    b.minZ < a.maxZ
  );
}

/** Vrai si l'emprise de `box` (demi-centimètres) tient entièrement sur le sol de la pièce. */
export function insideRoomFloor(box: CmBox): boolean {
  const hw = ROOM_FLOOR.halfWidth * 200;
  const hd = ROOM_FLOOR.halfDepth * 200;
  return box.minX >= -hw && box.maxX <= hw && box.minZ >= -hd && box.maxZ <= hd;
}
