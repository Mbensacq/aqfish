/**
 * Accès au stockage du navigateur pour la sauvegarde automatique (issue #70, ADR 0028).
 *
 * Le module ne connaît pas le format (texte opaque, écrit et relu par `sim/save.ts`) : il
 * isole seulement les échecs du stockage, derrière une interface remplaçable par un double
 * dans les tests. `localStorage` peut être absent, refuser l'accès (navigation privée,
 * cookies bloqués) ou être plein : aucune de ces situations ne lève, l'appelant reçoit un
 * statut et continue sans sauvegarde.
 */

/** Clé de la sauvegarde automatique dans le stockage. */
export const SAVE_STORAGE_KEY = 'aqfish.sauvegarde';

/**
 * Copie de la sauvegarde au schéma 1 (#264, ADR 0061 et 0069), faite une seule fois avant la
 * première écriture par-dessus : une version antérieure de l'application, qui refuse le
 * schéma 2, repartirait sinon d'un monde neuf et écraserait la sauvegarde.
 */
export const LEGACY_SAVE_STORAGE_KEY = 'aqfish.sauvegarde.schema1';

/** Sous-ensemble de `Storage` utilisé ici (remplaçable par un double dans les tests). */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * État de la sauvegarde automatique : `active` (dernière écriture réussie, ou aucune
 * encore tentée), `indisponible` (pas de stockage, ou accès refusé), `plein` (quota
 * dépassé).
 */
export type SaveStatus = 'active' | 'indisponible' | 'plein';

/**
 * Message de la section « Sauvegarde » du panneau : erreur (import refusé, sauvegarde
 * illisible) ou information (import réussi). Émis par l'hôte, affiché par le panneau.
 */
export interface SaveMessage {
  readonly kind: 'erreur' | 'info';
  readonly text: string;
}

/**
 * Texte de la sauvegarde mémorisée, ou `null` s'il n'y en a pas ou si le stockage est
 * indisponible (absent ou levant une exception).
 */
export function readStoredSave(storage: SaveStorage | null): string | null {
  if (!storage) {
    return null;
  }
  try {
    const value = storage.getItem(SAVE_STORAGE_KEY);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Mémorise `text`. Renvoie `active` si l'écriture a réussi, `plein` si le quota est
 * dépassé, `indisponible` pour tout autre échec (ou sans stockage).
 */
export function writeStoredSave(storage: SaveStorage | null, text: string): SaveStatus {
  if (!storage) {
    return 'indisponible';
  }
  try {
    keepLegacySave(storage);
    storage.setItem(SAVE_STORAGE_KEY, text);
    return 'active';
  } catch (error) {
    return isQuotaError(error) ? 'plein' : 'indisponible';
  }
}

/**
 * Vrai pour une erreur de quota : `QuotaExceededError` (navigateurs actuels),
 * `NS_ERROR_DOM_QUOTA_REACHED` (anciens Firefox), ou les codes historiques 22 et 1014.
 */
export function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { name, code } = error as { name?: unknown; code?: unknown };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

/** En-tête d'une sauvegarde au schéma 1 telle que l'application l'écrivait (`JSON.stringify`). */
const LEGACY_SAVE_HEADER = '{"format":"aqfish","schema":1,';

/**
 * Copie la sauvegarde mémorisée sous `LEGACY_SAVE_STORAGE_KEY` si elle est au schéma 1 et
 * qu'aucune copie n'existe encore. Le schéma est reconnu à l'en-tête écrit par l'application
 * (`LEGACY_SAVE_HEADER`), sans décoder le texte : coût constant à chaque sauvegarde
 * automatique. Peut lever (stockage refusé ou plein) : l'appelant traite l'erreur comme celle
 * de l'écriture.
 */
function keepLegacySave(storage: SaveStorage): void {
  const current = storage.getItem(SAVE_STORAGE_KEY);
  if (
    typeof current === 'string' &&
    current.startsWith(LEGACY_SAVE_HEADER) &&
    storage.getItem(LEGACY_SAVE_STORAGE_KEY) === null
  ) {
    storage.setItem(LEGACY_SAVE_STORAGE_KEY, current);
  }
}
