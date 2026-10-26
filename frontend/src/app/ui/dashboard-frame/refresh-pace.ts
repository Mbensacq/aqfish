/**
 * Rythme de rafraîchissement du tableau de bord (issue #256, docs/ARCHITECTURE.md,
 * « Interface ») : la boucle d'images ne relève l'eau qu'au plus 4 fois par seconde de temps
 * réel, quelle que soit la vitesse de la simulation. Fonction pure, sans horloge : l'instant
 * est celui que `requestAnimationFrame` donne à la boucle.
 */

/** Intervalle minimal entre deux relevés de la boucle, en millisecondes (4 par seconde). */
export const DASHBOARD_REFRESH_MS = 250;

/**
 * Vrai si un relevé est dû à l'instant `now` (ms), le précédent ayant eu lieu à `last` (ms,
 * `null` : aucun). Dû au premier appel, quand l'intervalle est écoulé (borne comprise), ou si
 * l'horloge a reculé (nouvelle origine des temps) ; jamais pour un instant non fini.
 */
export function refreshDue(
  now: number,
  last: number | null,
  interval: number = DASHBOARD_REFRESH_MS,
): boolean {
  if (!Number.isFinite(now)) {
    return false;
  }
  if (last === null || !Number.isFinite(last) || now < last) {
    return true;
  }
  return now - last >= interval;
}
