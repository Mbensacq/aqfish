import type { EnvironmentId } from './environment';
import type { SpeciesId } from './species';

/**
 * pH de l'eau (issue #236, ADR 0057) : valeur de départ de chaque environnement, dérive lente
 * avec la charge organique, retour vers l'eau neuve au changement d'eau, plages tolérée et
 * idéale de chaque espèce, et zone de la jauge du panneau. Fonctions pures, sans hasard ni
 * allocation par pas.
 *
 * Modèle de jeu, pas de chimie : la nitrification et la décomposition acidifient l'eau d'un
 * bac peuplé ; on le résume par une baisse proportionnelle à la charge par litre
 * (`PH_DROP_PER_LOAD_LITER`), sans tampon carbonaté (dureté hors périmètre). Un changement
 * d'eau mêle `WATER_CHANGE_SHARE` d'eau neuve (`sim/water.ts`) : le pH se rapproche d'autant
 * de celui de l'eau neuve (moyenne linéaire, approximation : le pH est logarithmique).
 */

/** pH le plus bas atteint par le modèle. */
export const MIN_PH = 4;
/** pH le plus haut atteint par le modèle. */
export const MAX_PH = 9.5;

/**
 * pH de l'eau neuve de chaque environnement. **Approximations de jeu** (ADR 0057) : eau
 * douce un peu acide à neutre pour le bac tropical, légèrement basique pour le bassin, neutre
 * pour le paludarium, eau de mer pour le récif, eau dure légèrement basique pour le bac d'eau
 * froide (axolotl : idéal 7,4–7,6, `docs/ESPECES.md`). Le type impose une entrée pour tout
 * nouvel environnement.
 */
export const FRESH_PH: Readonly<Record<EnvironmentId, number>> = {
  tropical: 7,
  bassin: 7.5,
  paludarium: 7.2,
  recif: 8.2,
  eaufroide: 7.5,
};

/**
 * Baisse du pH par seconde, par unité de charge (`waterLoad`) et par litre. **Valeur de
 * jeu** : la population par défaut du bac tropical (charge ≈ 45 dans 288 L) perd environ
 * 0,25 de pH par heure simulée (trois journées de 20 min) sans changement d'eau ; un bac sans
 * habitant ne dérive pas.
 */
export const PH_DROP_PER_LOAD_LITER = 4.5e-4;

/** Plage de pH, bornes comprises. */
export interface PhRange {
  readonly min: number;
  readonly max: number;
}

/** Plages de pH d'une espèce : idéale, comprise dans la plage tolérée. */
export interface SpeciesPh {
  /** Hors de cette plage, la santé baisse (`sim/wellbeing.ts`). */
  readonly tolerated: PhRange;
  /** Plage conseillée : la jauge y est verte. */
  readonly ideal: PhRange;
}

/**
 * Plages de pH de chaque espèce. **Toutes des approximations de jeu** (ADR 0057) : ordres de
 * grandeur de l'aquariophilie, non recoupés avec une source consultable pendant le cycle 78
 * (réseau limité aux registres de paquets). Seule contrainte vérifiée par les tests : le pH
 * de l'eau neuve de chaque environnement est dans la plage tolérée de chaque espèce qui y
 * vit, pour qu'un bac neuf n'use la santé de personne. Le type impose une entrée pour toute
 * nouvelle espèce.
 */
export const SPECIES_PH: Readonly<Record<SpeciesId, SpeciesPh>> = {
  // approximation de jeu : eau douce acide à neutre.
  neon: { tolerated: { min: 5, max: 7.8 }, ideal: { min: 6, max: 7.2 } },
  // approximation de jeu : eau neutre à basique.
  guppy: { tolerated: { min: 6.5, max: 8.5 }, ideal: { min: 6.8, max: 8 } },
  // approximation de jeu.
  corydora: { tolerated: { min: 5.8, max: 8 }, ideal: { min: 6.5, max: 7.5 } },
  // approximation de jeu : bassin extérieur, large tolérance.
  koi: { tolerated: { min: 6.5, max: 9 }, ideal: { min: 7, max: 8 } },
  // approximation de jeu.
  axolotl: { tolerated: { min: 6.5, max: 8 }, ideal: { min: 7, max: 7.6 } },
  // approximation de jeu.
  grenouille: { tolerated: { min: 6, max: 8 }, ideal: { min: 6.5, max: 7.5 } },
  // approximation de jeu.
  triton: { tolerated: { min: 6, max: 8 }, ideal: { min: 6.5, max: 7.5 } },
  // approximation de jeu : eau de mer, plage étroite.
  clown: { tolerated: { min: 7.8, max: 8.6 }, ideal: { min: 8, max: 8.4 } },
  // approximation de jeu : eau de mer, plage étroite.
  chirurgien: { tolerated: { min: 7.8, max: 8.6 }, ideal: { min: 8.1, max: 8.4 } },
};

/** pH de l'eau neuve de l'environnement `environment`. */
export function freshPh(environment: EnvironmentId): number {
  return FRESH_PH[environment];
}

/**
 * pH après `dt` secondes avec la charge `load` dans `liters` litres : baisse de
 * `PH_DROP_PER_LOAD_LITER · load / liters · dt`, bornée à [`MIN_PH`, `MAX_PH`] (`NaN`, état
 * corrompu, devient `MIN_PH`). Les arguments `dt`, `load` et `liters` sont supposés validés
 * par l'appelant (`stepWaterInPlace`).
 */
export function stepPh(ph: number, dt: number, load: number, liters: number): number {
  return clampPh(ph - ((PH_DROP_PER_LOAD_LITER * load) / liters) * dt);
}

/**
 * pH après un changement d'eau qui remplace la part `share` (dans [0, 1]) par de l'eau neuve
 * de pH `fresh` : `ph + share · (fresh − ph)`, borné.
 */
export function phAfterWaterChange(ph: number, fresh: number, share: number): number {
  return clampPh(ph + share * (fresh - ph));
}

/** Vrai si `ph` est dans `range`, bornes comprises (faux pour une valeur non finie). */
export function inPhRange(ph: number, range: PhRange): boolean {
  return ph >= range.min && ph <= range.max;
}

/** Vrai si `ph` est hors de la plage tolérée de l'espèce `species` (santé usée). */
export function phOutOfTolerance(ph: number, species: SpeciesId): boolean {
  return !inPhRange(ph, SPECIES_PH[species].tolerated);
}

/** Zone de la jauge pH : verte, orange, rouge. */
export type PhZone = 'ideal' | 'tolere' | 'hors-plage';

/** Libellé affiché de chaque zone (le texte porte l'information, pas seulement la couleur). */
export const PH_ZONE_LABELS: Readonly<Record<PhZone, string>> = {
  ideal: 'idéal',
  tolere: 'toléré',
  'hors-plage': 'hors plage',
};

/**
 * Plages communes aux espèces présentes : intersection des plages tolérées et des plages
 * idéales. `null` pour une plage vide (espèces aux besoins incompatibles) ; sans espèce,
 * toute l'échelle [`MIN_PH`, `MAX_PH`] est idéale.
 */
export interface PhBands {
  readonly tolerated: PhRange | null;
  readonly ideal: PhRange | null;
}

/** Plages communes des espèces `species` (doublons permis, ordre indifférent). */
export function phBands(species: Iterable<SpeciesId>): PhBands {
  let tolerated: PhRange | null = { min: MIN_PH, max: MAX_PH };
  let ideal: PhRange | null = { min: MIN_PH, max: MAX_PH };
  for (const id of species) {
    tolerated = intersect(tolerated, SPECIES_PH[id].tolerated);
    ideal = intersect(ideal, SPECIES_PH[id].ideal);
  }
  return { tolerated, ideal };
}

/**
 * Zone de `ph` pour les plages communes `bands` : « idéal » dans la plage idéale commune,
 * « toléré » dans la plage tolérée commune, « hors plage » sinon (au moins une espèce
 * souffre). Une valeur non finie est « hors plage ».
 */
export function phZone(ph: number, bands: PhBands): PhZone {
  if (bands.ideal !== null && inPhRange(ph, bands.ideal)) {
    return 'ideal';
  }
  return bands.tolerated !== null && inPhRange(ph, bands.tolerated) ? 'tolere' : 'hors-plage';
}

/** Vrai si deux jeux de plages sont égaux. */
export function sameBands(a: PhBands, b: PhBands): boolean {
  return sameRange(a.tolerated, b.tolerated) && sameRange(a.ideal, b.ideal);
}

function sameRange(a: PhRange | null, b: PhRange | null): boolean {
  return a === b || (a !== null && b !== null && a.min === b.min && a.max === b.max);
}

function intersect(a: PhRange | null, b: PhRange): PhRange | null {
  if (a === null) {
    return null;
  }
  const min = Math.max(a.min, b.min);
  const max = Math.min(a.max, b.max);
  return min <= max ? { min, max } : null;
}

/** pH ramené dans [`MIN_PH`, `MAX_PH`] ; `NaN` devient `MIN_PH`. */
function clampPh(ph: number): number {
  return ph >= MIN_PH ? (ph <= MAX_PH ? ph : MAX_PH) : MIN_PH;
}
