import { compatibility, type Compatibility } from './compatibility';
import { SEMI_TERRESTRIAL_NEEDS } from './semi-terrestrial-needs';
import { MIX_REASON_TEXT, SPECIES_LABELS, type SpeciesLabels } from './species-catalog';
import { speciesSheet } from './species-sheet';
import { SPECIES, type SpeciesId } from './species';

/**
 * Avertissements à l'ajout d'une espèce dans un bac (issue #237, ADR 0058) : volume, groupe et
 * voisins incompatibles, lus dans les fiches (`sim/species-sheet.ts`). Séparés des fiches au
 * cycle 313 (#846) pour que celles-ci restent sous leur limite de taille.
 */

/** Avertissement à l'ajout d'une espèce dans le bac courant. */
export type AddWarning =
  | {
      readonly kind: 'volume';
      readonly species: SpeciesId;
      readonly liters: number;
      readonly minLiters: number;
    }
  | {
      readonly kind: 'groupe';
      readonly species: SpeciesId;
      readonly count: number;
      readonly minGroup: number;
    }
  | {
      readonly kind: 'incompatible';
      readonly species: SpeciesId;
      readonly other: SpeciesId;
      readonly reason: Exclude<Compatibility, 'compatible'>;
    };

function known(id: string): id is SpeciesId {
  return Object.hasOwn(SPECIES, id);
}

/** Avertissement `volume` de `species` dans `liters` litres d'eau (voir `addWarnings`). */
function volumeWarning(species: SpeciesId, liters: number): AddWarning[] {
  const minLiters = speciesSheet(species).minLiters.value;
  const onWater = SEMI_TERRESTRIAL_NEEDS[species] === undefined;
  return onWater && liters > 0 && Number.isFinite(liters) && liters < minLiters
    ? [{ kind: 'volume', species, liters, minLiters }]
    : [];
}

/**
 * Avertissements à l'ajout de l'espèce `species`, dont l'effectif devient `count`, dans un bac
 * de `liters` litres peuplé de `counts` (effectifs après l'ajout, espèce ajoutée comprise) :
 *
 * - `volume` si `liters` est strictement inférieur au volume conseillé (volume exact : rien) ;
 *   rien si `liters` n'est pas un réel strictement positif (volume inconnu), ni pour un
 *   amphibien semi-terrestre, dont le volume conseillé est celui du milieu et non de l'eau
 *   (`sim/semi-terrestrial-needs.ts`, ADR 0177 : le verdict de capacité le contrôle, #846) ;
 * - `groupe` si `count` est strictement inférieur au groupe minimal ;
 * - `incompatible` pour chaque autre espèce présente (effectif fini strictement positif), dans
 *   l'ordre de `order` (doublons et espèces inconnues ignorés), déconseillée avec `species`.
 *
 * Aucun avertissement si `count` n'est pas un nombre fini strictement positif (rien d'ajouté).
 */
export function addWarnings(
  species: SpeciesId,
  count: number,
  liters: number,
  counts: Readonly<Partial<Record<string, number>>>,
  order: readonly string[],
): AddWarning[] {
  if (!(count > 0) || !Number.isFinite(count)) {
    return [];
  }
  const sheet = speciesSheet(species);
  const warnings: AddWarning[] = volumeWarning(species, liters);
  const minGroup = sheet.minGroup.value;
  if (count < minGroup) {
    warnings.push({ kind: 'groupe', species, count, minGroup });
  }
  const seen = new Set<string>();
  for (const other of order) {
    if (other === species || seen.has(other) || !known(other)) {
      continue;
    }
    seen.add(other);
    const n = Object.hasOwn(counts, other) ? counts[other] : undefined;
    if (n === undefined || !(n > 0) || !Number.isFinite(n)) {
      continue;
    }
    const verdict = compatibility(species, other);
    if (verdict !== 'compatible') {
      warnings.push({ kind: 'incompatible', species, other, reason: verdict });
    }
  }
  return warnings;
}

/** Texte affiché d'un avertissement d'ajout (libellés du catalogue, `SPECIES_LABELS`). */
export function addWarningText(warning: AddWarning): string {
  return addWarningTextWith(warning, SPECIES_LABELS);
}

/**
 * `addWarningText` avec des libellés donnés : les tests y exercent les accords sur des libellés
 * de leur choix (#284 ; la loche kuhli, #238, porte le féminin au catalogue).
 */
export function addWarningTextWith(
  warning: AddWarning,
  labels: Readonly<Record<SpeciesId, SpeciesLabels>>,
): string {
  const { singular, plural, feminine } = labels[warning.species];
  switch (warning.kind) {
    case 'volume':
      return `Bac trop petit pour des ${plural} : ${Math.round(warning.liters)} L, ${warning.minLiters} L conseillés`;
    case 'groupe':
      return `Groupe trop petit : ${warning.count} ${warning.count === 1 ? singular : plural}, ${warning.minGroup} au moins conseillé${feminine ? 'e' : ''}s`;
    case 'incompatible':
      return `${capitalize(plural)} déconseillé${feminine ? 'e' : ''}s avec les ${labels[warning.other].plural} (${
        MIX_REASON_TEXT[warning.reason]
      })`;
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
