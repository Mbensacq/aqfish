import {
  medicationDaysLeft,
  medicationProtects,
  ichCureSeconds,
  saltProtects,
  tenthText,
  TREATMENT_DAY_SECONDS,
  TREATMENT_KINDS,
  treatmentGroup,
  TREATMENTS,
  type TreatmentEvidence,
  type TreatmentGroup,
  type TreatmentKind,
} from './treatment';
import { SPECIES_LABELS } from './species-catalog';
import type { SpeciesId } from './species';
import type { WaterProducts, WaterState } from './water';

/**
 * Relevés et textes d'affichage des traitements des points blancs (issue #374, découpés de
 * `sim/treatment.ts`, ADR 0091) : ce que le tableau de bord et le panneau « Soins » montrent.
 * Le modèle (protection, cure, pas) et les gestes (refus, messages) restent dans
 * `sim/treatment.ts`. Pur : aucun hasard, aucune horloge.
 */

/** Libellés des niveaux de preuve. */
export const EVIDENCE_LABELS: Readonly<Record<TreatmentEvidence, string>> = {
  efficace: 'efficace',
  soutien: 'soutien, ne guérit pas seul',
};

/** Traitement en cours, pour le tableau de bord et le panneau. Objet de données pur. */
export interface TreatmentReadout {
  /** Produits qui agissent (« sel 5,0 g/L », « médicament 0,8 dose »), séparés par « et ». */
  readonly products: string;
  /** Jours simulés restants à la température actuelle, au dixième. */
  readonly remainingDays: number;
  /**
   * Jours avant que le médicament cesse d'agir, au dixième (redoser avant) ; `null` si le
   * traitement ne repose pas sur le médicament.
   */
  readonly medicationDays: number | null;
}

/** Traitement en cours dans `water` (cure commencée), ou `null`. */
export function treatmentReadout(water: WaterState): TreatmentReadout | null {
  if (water.ichCure === undefined) {
    return null;
  }
  const products: string[] = [];
  if (saltProtects(water)) {
    products.push(`sel ${tenthText(water.salt ?? 0)} g/L`);
  }
  const medicated = medicationProtects(water);
  if (medicated) {
    products.push(`médicament ${tenthText(water.medication ?? 0)} dose`);
  }
  const remaining =
    ((1 - water.ichCure) * ichCureSeconds(water.temperature)) / TREATMENT_DAY_SECONDS;
  return {
    products: products.join(' et '),
    remainingDays: Math.round(remaining * 10) / 10,
    medicationDays: medicated
      ? Math.round(medicationDaysLeft(water.medication ?? 0) * 10) / 10
      : null,
  };
}

/** Vrai si deux relevés de traitement affichent la même chose (`null` compris). */
export function sameTreatment(a: TreatmentReadout | null, b: TreatmentReadout | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.products === b.products &&
    a.remainingDays === b.remainingDays &&
    a.medicationDays === b.medicationDays
  );
}

/**
 * Suite « ; redoser le médicament avant N j » d'un relevé dont le traitement repose sur le
 * médicament, ou chaîne vide : commune à la ligne d'état du panneau (`treatmentStatusText`) et
 * à l'alerte du tableau de bord (`treatmentAlert`).
 */
export function redoseText(readout: TreatmentReadout): string {
  return readout.medicationDays === null
    ? ''
    : ` ; redoser le médicament avant ${tenthText(readout.medicationDays)} j`;
}

/** Ligne d'état du traitement (« En cours : sel 5,0 g/L, encore 3,5 j »). */
export function treatmentStatusText(readout: TreatmentReadout | null): string {
  if (readout === null) {
    return 'Aucun traitement en cours.';
  }
  return `En cours : ${readout.products}, encore ${tenthText(readout.remainingDays)} j${redoseText(readout)}.`;
}

/** Source complète et niveau de preuve d'un traitement (infobulle du bouton). */
export function treatmentSourceText(kind: TreatmentKind): string {
  const info = TREATMENTS[kind];
  return `Source : ${info.source} ; niveau de preuve : ${EVIDENCE_LABELS[info.evidence]}.`;
}

/**
 * Ligne des sources du panneau « Soins » : chaque traitement, sa source en quelques mots et
 * son niveau de preuve, écrit une fois par groupe consécutif de même niveau (« Sources :
 * chaleur, approximation de jeu (soutien) ; sel, Merck ; médicament, notice Sera
 * (efficaces). »).
 */
export function treatmentSourcesLine(): string {
  const groups: string[] = [];
  let run: string[] = [];
  TREATMENT_KINDS.forEach((kind, i) => {
    const info = TREATMENTS[kind];
    run.push(`${info.button.toLowerCase()}, ${info.shortSource}`);
    const next = TREATMENT_KINDS[i + 1];
    if (next === undefined || TREATMENTS[next].evidence !== info.evidence) {
      // Niveau de preuve écrit une fois par groupe de traitements consécutifs de même niveau.
      const level = run.length > 1 ? `${info.evidence}s` : info.evidence;
      groups.push(`${run.join(' ; ')} (${level})`);
      run = [];
    }
  });
  return `Sources : ${groups.join(' ; ')}.`;
}

/** Message du dernier geste de soin, pour le panneau : accepté ou non, mise en garde. */
export interface TreatmentNotice {
  readonly ok: boolean;
  readonly text: string;
  readonly warning: string | null;
}

/**
 * Avertissement à l'ajout d'un animal de l'espèce `species` dans une eau qui contient déjà un
 * produit de traitement (`products`, issue #374), ou `null` : sel et médicament sont toxiques
 * pour les amphibiens et les invertébrés (`treatmentHazard`, qui refuse le geste quand ils sont
 * déjà dans le bac), qu'ils arrivent avant ou après le produit. Un poisson, ou une eau sans
 * produit : `null`. `groupOf` donne le groupe de l'espèce (`treatmentGroup` par défaut).
 */
export function treatedWaterWarning(
  species: SpeciesId,
  products: WaterProducts,
  groupOf: (species: SpeciesId) => TreatmentGroup = treatmentGroup,
): string | null {
  const group = groupOf(species);
  if (group === 'poisson' || (!products.salted && !products.medicated)) {
    return null;
  }
  const what = [products.salted ? 'au sel' : '', products.medicated ? 'au médicament' : '']
    .filter((text) => text !== '')
    .join(' et ');
  const why = group === 'amphibien' ? ' (peau qui absorbe les produits)' : '';
  return `Eau traitée ${what} : toxique pour les ${SPECIES_LABELS[species].plural}${why}. Changer l'eau pour diluer le produit ; voir la page « Produits et traitements » du wiki`;
}
