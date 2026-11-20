import type { CareMode } from '../../sim/care-mode';
import { ENVIRONMENTS, type EnvironmentId } from '../../sim/environment';
import type { QuarantineView } from '../../sim/quarantine';
import { sideEffectWarning } from '../../sim/side-effects';
import { decorCatalog, speciesCatalog, type CatalogEntry } from '../../sim/species-catalog';
import type { TreatmentKind } from '../../sim/treatment';
import { treatmentSourceText } from '../../sim/treatment-text';

/**
 * Vues partagées par le panneau « Réglages » et ses sections (#697) : fonctions pures, pour
 * que deux sections qui affichent la même chose ne la calculent pas chacune à sa façon.
 */

/** Nom d'un environnement, tel que l'affichent les listes du panneau. */
export function environmentName(id: EnvironmentId): string {
  return ENVIRONMENTS[id].name;
}

/**
 * Catalogue des espèces de l'environnement affiché (#88, #189), dans l'ordre de
 * `Environment.species` ; en mode décor (#278), le catalogue complet.
 */
export function panelCatalog(
  environment: EnvironmentId,
  careMode: CareMode,
): readonly CatalogEntry[] {
  return careMode === 'decor' ? decorCatalog(environment) : speciesCatalog(environment);
}

/** Groupe « Quarantaine » de la liste des bacs (#547) : dès qu'un bac posé existe. */
export function isQuarantineShown(careMode: CareMode, quarantine: QuarantineView): boolean {
  return careMode !== 'decor' && quarantine.tanks.length > 0;
}

/**
 * Infobulle d'un geste de soin, description accessible du bouton (lue au focus, avant le
 * geste) : sa source, puis les effets secondaires du produit (#549).
 */
export function treatmentTitle(kind: TreatmentKind): string {
  const warning = kind === 'chaleur' ? null : sideEffectWarning(kind);
  const source = treatmentSourceText(kind);
  return warning === null ? source : `${source} ${warning}`;
}

/**
 * Nombre lu dans une valeur de formulaire (curseur, champ) ; une chaîne vide ou blanche donne
 * `NaN` (et non 0, comme le ferait `Number('')`).
 */
export function formNumber(value: string | number): number {
  return typeof value === 'string' && value.trim() === '' ? Number.NaN : Number(value);
}
