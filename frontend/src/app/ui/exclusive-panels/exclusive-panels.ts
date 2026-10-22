import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/**
 * Largeur d'écran (px) jusqu'à laquelle « Réglages » et « Commandes » ne s'ouvrent jamais
 * ensemble (#136). Au-delà, ils tiennent côte à côte : « Réglages » finit à 59 + 260 =
 * 319 px du bord gauche, « Commandes » (300 px) commence à 12 + 300 = 312 px du bord droit ;
 * ils se recouvrent donc sous 631 px de large. Seuil arrondi à 640 px (exclu).
 */
export const EXCLUSIVE_PANELS_MAX_WIDTH = 639;

/** Requête média des écrans où les deux panneaux sont exclusifs. */
export function exclusivePanelsQuery(maxWidth = EXCLUSIVE_PANELS_MAX_WIDTH): string {
  return `(max-width: ${maxWidth}px)`;
}

/** Vrai si `matchMedia` existe et que la fenêtre correspond à la requête (sinon faux). */
export function matchesQuery(
  win: Pick<Window, 'matchMedia'> | null | undefined,
  query: string,
): boolean {
  return typeof win?.matchMedia === 'function' && win.matchMedia(query).matches;
}

/**
 * Indique, à l'instant de l'appel, si « Réglages » et « Commandes » sont exclusifs (écran
 * étroit, ≤ `EXCLUSIVE_PANELS_MAX_WIDTH` px) : ouvrir l'un replie alors l'autre, pour que
 * leurs textes ne se mélangent jamais (#136). Évalué à chaque ouverture, pas au démarrage :
 * la largeur change quand on tourne le téléphone. Sans `matchMedia` : jamais exclusifs.
 */
export const EXCLUSIVE_PANELS = new InjectionToken<() => boolean>('EXCLUSIVE_PANELS', {
  providedIn: 'root',
  factory: () => {
    const win = inject(DOCUMENT).defaultView;
    const query = exclusivePanelsQuery();
    return () => matchesQuery(win, query);
  },
});
