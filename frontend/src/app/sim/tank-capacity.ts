import type { CareMode } from './care-mode';
import type { SheetField, ValueRange } from './sheet-field';
import { SPECIES_LABELS } from './species-catalog';
import { DENSITY_LITERS_PER_CM, SPECIES_ECOLOGY } from './species-ecology';
import { frenchNumber, publicReference, speciesSheet } from './species-sheet';
import { SEMI_TERRESTRIAL_NEEDS } from './semi-terrestrial-needs';
import type { SpeciesId } from './species';
import type { PopulationEntry, World } from './world-types';

/**
 * Capacité du bac (issue #807, tranche 1 de #729, `docs/ECOSYSTEME.md` § 3.1, ADR 0171) :
 * combien d'animaux un bac peut accueillir, et pourquoi il en refuse un de plus. Module pur et
 * déterministe, **pas encore branché** sur les compteurs (tranche 2) : il expose le verdict,
 * l'appelant décide.
 *
 * Besoin d'une espèce pour `n` adultes :
 *
 * - si une source donne un volume par adulte supplémentaire (`extraLitersPerAdult`) : le volume
 *   minimal de la fiche pour le premier (au moins ce volume par adulte), puis ce volume par
 *   adulte en plus (poisson rouge, OATA : 100 L puis 50 L ; néritine : 40 L chacune) ;
 * - sinon : `n` × longueur adulte × litres par cm de sa classe (`DENSITY_LITERS_PER_CM`), borne
 *   basse pour le **plafond** (1,5 L/cm en tropical), borne haute pour le **conseillé** (2 L/cm).
 *
 * Amphibiens semi-terrestres (sonneur, triton : `sim/semi-terrestrial-needs.ts`, ADR 0177) :
 * besoin sourcé en volume du **milieu** (litres bruts, berge comprise), premier adulte puis
 * volume par adulte en plus. Un bac mêle alors deux références de volume : chaque espèce occupe
 * une fraction de la sienne (eau réelle ou milieu), et l'occupation du bac est la somme de ces
 * fractions (`populationLoad`).
 *
 * Tout animal compte comme un adulte (approximation de jeu : un alevin grandit). Les plafonds
 * techniques (`MAX_TOTAL_FISH`, `sim/constants.ts`) sont à part : ils bornent l'affichage, pas
 * le bien-être.
 */

/** Seuil lu : le plafond (au-delà, bac surpeuplé) ou le volume conseillé. */
export type CapacityLevel = 'plafond' | 'conseille';

/** Volume sur lequel le besoin d'une espèce se compte : eau réelle, ou milieu entier. */
export type CapacityReference = 'eau' | 'milieu';

/** Ce qui décide d'un verdict. */
export type CapacityLimit = 'aucune' | 'volume-minimal' | 'capacite' | 'mode-decor';

/** Données de capacité d'une espèce, lues dans sa fiche et ses données d'écologie. */
export interface CapacityProfile {
  readonly species: SpeciesId;
  /** Longueur adulte, en cm ; non finie ou nulle : aucun besoin par cm. */
  readonly adultSizeCm: SheetField<number>;
  /** Litres par cm de la classe de densité de l'espèce. */
  readonly litersPerCm: SheetField<ValueRange>;
  /** Volume minimal du bac, en litres. */
  readonly minLiters: SheetField<number>;
  /** Volume par adulte supplémentaire, en litres, ou `null`. */
  readonly extraLitersPerAdult: SheetField<number | null>;
  /**
   * Volume du premier adulte quand une source le donne à part, ou `null` : le plus grand du
   * volume minimal et du volume par adulte supplémentaire.
   */
  readonly firstAdultLiters: SheetField<number> | null;
  /** Volume sur lequel le besoin se compte. */
  readonly reference: CapacityReference;
}

/** Verdict d'ajout d'un animal. */
export interface CapacityVerdict {
  readonly ok: boolean;
  readonly limit: CapacityLimit;
  /** Raison lisible et chiffrée, avec sa source. */
  readonly reason: string;
  /**
   * Occupation du bac **avec** l'animal demandé, en fraction de sa capacité (1 : plein) ;
   * `Infinity` si le bac n'a pas d'eau et qu'un besoin existe.
   */
  readonly occupation: number;
  /** Désaccord entre sources sur la règle appliquée, tel que noté dans les données, ou `null`. */
  readonly disagreement: string | null;
}

/** Bac vu par le calcul : son volume d'eau réel (`sim/tank-water-volume.ts`) et sa population. */
export interface CapacityTank {
  /** Volume d'eau réel, en litres ; non fini ou négatif : 0. */
  readonly liters: number;
  readonly population: readonly PopulationEntry[];
  /** Volume du milieu (litres bruts, berge comprise) ; absent : `liters`. */
  readonly milieuLiters?: number;
  /** Mode du bac ; absent : soins. */
  readonly mode?: CareMode;
}

/** État de capacité d'un bac, pour signaler une sauvegarde au-delà de la capacité. */
export interface CapacityStatus {
  /** Besoin des espèces comptées sur l'eau réelle, en litres. */
  readonly needLiters: number;
  /** Besoin des espèces comptées sur le milieu (amphibiens semi-terrestres), en litres. */
  readonly milieuNeedLiters: number;
  readonly occupation: number;
  /** Vrai si le besoin dépasse le volume d'eau réel. */
  readonly over: boolean;
}

/** Données de capacité de l'espèce `species`. */
export function capacityProfile(species: SpeciesId): CapacityProfile {
  const sheet = speciesSheet(species);
  const ecology = SPECIES_ECOLOGY[species];
  const base = {
    species,
    adultSizeCm: sheet.adultSize,
    litersPerCm: DENSITY_LITERS_PER_CM[ecology.densityClass.value],
  };
  const milieu = SEMI_TERRESTRIAL_NEEDS[species];
  if (milieu !== undefined) {
    return { ...base, ...milieu, reference: 'milieu' };
  }
  return {
    ...base,
    minLiters: sheet.minLiters,
    extraLitersPerAdult: ecology.extraLitersPerAdult,
    firstAdultLiters: null,
    reference: 'eau',
  };
}

/** Réel fini positif ou nul, sinon 0. */
function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Litres par cm du seuil `level`. */
function litersPerCmAt(profile: CapacityProfile, level: CapacityLevel): number {
  const { min, max } = profile.litersPerCm.value;
  return level === 'plafond' ? min : max;
}

/** Volume demandé par le premier adulte d'une espèce à volume par adulte (`extra`). */
function firstAdultLiters(profile: CapacityProfile, extra: number): number {
  const first = profile.firstAdultLiters;
  return first === null
    ? Math.max(nonNegative(profile.minLiters.value), extra)
    : nonNegative(first.value);
}

/**
 * Besoin, en litres, de `count` adultes de l'espèce de `profile` (voir l'en-tête). Un effectif
 * non fini ou négatif compte 0 ; une fraction est arrondie à l'entier inférieur.
 */
export function speciesNeedLiters(
  profile: CapacityProfile,
  count: number,
  level: CapacityLevel = 'plafond',
): number {
  const n = Math.floor(nonNegative(count));
  if (n === 0) {
    return 0;
  }
  const extra = profile.extraLitersPerAdult.value;
  if (extra !== null) {
    const each = nonNegative(extra);
    return firstAdultLiters(profile, each) + (n - 1) * each;
  }
  return n * nonNegative(profile.adultSizeCm.value) * litersPerCmAt(profile, level);
}

/**
 * Besoin, en litres, de la population `population` (espèces mélangées) ; avec `reference`,
 * seulement celui des espèces comptées sur ce volume.
 */
export function populationNeedLiters(
  population: readonly PopulationEntry[],
  level: CapacityLevel = 'plafond',
  reference?: CapacityReference,
): number {
  let need = 0;
  for (const entry of population) {
    const profile = capacityProfile(entry.species);
    if (reference === undefined || profile.reference === reference) {
      need += speciesNeedLiters(profile, entry.count, level);
    }
  }
  return need;
}

/** Volume de `tank` sur lequel se comptent les espèces de référence `reference`. */
export function referenceLiters(tank: CapacityTank, reference: CapacityReference): number {
  const liters = reference === 'milieu' ? (tank.milieuLiters ?? tank.liters) : tank.liters;
  return nonNegative(liters);
}

/**
 * Occupation de `tank` par `population`, en fraction de sa capacité : somme de l'occupation de
 * l'eau réelle par les espèces comptées sur l'eau et de celle du milieu par les autres.
 */
export function populationLoad(
  tank: CapacityTank,
  population: readonly PopulationEntry[],
  level: CapacityLevel = 'plafond',
): number {
  let load = 0;
  for (const reference of ['eau', 'milieu'] as const) {
    const need = populationNeedLiters(population, level, reference);
    load += occupation(referenceLiters(tank, reference), need);
  }
  return load;
}

/**
 * Occupation d'un bac de `liters` litres par un besoin de `needLiters` litres, en fraction de
 * sa capacité : 0 sans besoin, `Infinity` pour un besoin dans un bac sans eau.
 */
export function occupation(liters: number, needLiters: number): number {
  const need = nonNegative(needLiters);
  if (need === 0) {
    return 0;
  }
  const volume = nonNegative(liters);
  return volume === 0 ? Number.POSITIVE_INFINITY : need / volume;
}

/** Population de `world` : effectif de chaque espèce présente, dans l'ordre d'apparition. */
export function populationOf(world: Pick<World, 'entities'>): PopulationEntry[] {
  const counts = new Map<SpeciesId, number>();
  for (const entity of world.entities) {
    counts.set(entity.species, (counts.get(entity.species) ?? 0) + 1);
  }
  return [...counts].map(([species, count]) => ({ species, count }));
}

/**
 * État de capacité de `tank`, au plafond : une sauvegarde au-delà de la capacité est
 * **signalée** (`over`), jamais corrigée ; rien n'est modifié.
 */
export function capacityStatus(tank: CapacityTank): CapacityStatus {
  const needLiters = populationNeedLiters(tank.population, 'plafond', 'eau');
  const milieuNeedLiters = populationNeedLiters(tank.population, 'plafond', 'milieu');
  const ratio = populationLoad(tank, tank.population);
  return { needLiters, milieuNeedLiters, occupation: ratio, over: ratio > 1 };
}

/** Nom court d'une source, d'après sa référence. */
const SOURCE_NAMES: readonly (readonly [string, string])[] = [
  ['ornamentalfish.org', 'OATA'],
  ['rspca.org.uk', 'RSPCA'],
  ['seriouslyfish.com', 'Seriously Fish'],
  ['fishbase.', 'FishBase'],
  ['aquariumbreeder.com', 'Aquarium Breeder'],
  ['fishkeeper.co.uk', 'FishKeeper'],
  ['practicalfishkeeping.co.uk', 'Practical Fishkeeping'],
  ['garnelio.de', 'Garnelio'],
  ['wikipedia.org', 'Wikipédia'],
  ['reeflex.net', 'Reeflex'],
  ['petmd.com', 'PetMD'],
  ['reptilesmagazine.com', 'Reptiles Magazine'],
];

/**
 * Source d'un champ telle qu'écrite dans une raison : le nom court de la première source
 * reconnue de sa référence (« OATA »), la référence publique sinon, ou « approximation de jeu ».
 */
export function sourceLabel(field: SheetField<unknown>): string {
  if (field.status.kind === 'approximation') {
    return 'approximation de jeu';
  }
  const reference = field.status.reference;
  let first: [number, string] | null = null;
  for (const [host, name] of SOURCE_NAMES) {
    const at = reference.indexOf(host);
    if (at >= 0 && (first === null || at < first[0])) {
      first = [at, name];
    }
  }
  return first === null ? publicReference(reference) : first[1];
}

/** Désaccord noté dans la référence d'un champ (« désaccord : … »), ou `null`. */
function disagreementOf(field: SheetField<unknown>): string | null {
  if (field.status.kind !== 'source') {
    return null;
  }
  const at = field.status.reference.indexOf('désaccord');
  return at < 0 ? null : publicReference(field.status.reference.slice(at));
}

/** Litres arrondis, écrits à la française. */
function litersText(liters: number): string {
  return `${frenchNumber(Math.round(liters * 10) / 10)} L`;
}

/** « un néon », « une loche kuhli ». */
function oneOf(species: SpeciesId): string {
  const { singular, feminine } = SPECIES_LABELS[species];
  return `${feminine ? 'une' : 'un'} ${singular}`;
}

/** Règle de besoin de l'espèce, en clair, et le champ qui la source. */
function needRule(
  profile: CapacityProfile,
  level: CapacityLevel,
): { readonly text: string; readonly field: SheetField<unknown> } {
  const name = SPECIES_LABELS[profile.species].singular;
  const extra = profile.extraLitersPerAdult.value;
  if (extra !== null) {
    return {
      text: `${oneOf(profile.species)} adulte demande ${litersText(firstAdultLiters(profile, nonNegative(extra)))}, puis ${litersText(extra)} par ${name} en plus`,
      field: profile.extraLitersPerAdult,
    };
  }
  const size = nonNegative(profile.adultSizeCm.value);
  const perCm = litersPerCmAt(profile, level);
  return {
    text: `${oneOf(profile.species)} adulte de ${frenchNumber(size)} cm demande ${litersText(size * perCm)} (${frenchNumber(perCm)} L par cm)`,
    field: profile.litersPerCm,
  };
}

/** Effectif actuel de `species` dans `population`. */
function countOf(population: readonly PopulationEntry[], species: SpeciesId): number {
  let n = 0;
  for (const entry of population) {
    if (entry.species === species) {
      n += Math.floor(nonNegative(entry.count));
    }
  }
  return n;
}

/**
 * Verdict d'ajout d'un animal de l'espèce `species` dans `tank`, au seuil `level` (plafond par
 * défaut), dans l'ordre :
 *
 * 1. mode décor : accepté sans contrainte (`mode-decor`) ;
 * 2. bac (ou milieu, pour une espèce comptée sur le milieu) sous le volume minimal de
 *    l'espèce : refusé (`volume-minimal`) ;
 * 3. occupation de la population, animal compris (`populationLoad`), au-delà de 1 : refusé
 *    (`capacite`) ;
 * 4. sinon accepté (`aucune`).
 *
 * L'occupation est toujours celle du bac avec l'animal demandé.
 */
export function canAdd(
  tank: CapacityTank,
  species: SpeciesId,
  level: CapacityLevel = 'plafond',
): CapacityVerdict {
  const profile = capacityProfile(species);
  const liters = referenceLiters(tank, profile.reference);
  const withOne = [
    ...tank.population.filter((entry) => entry.species !== species),
    { species, count: countOf(tank.population, species) + 1 },
  ];
  const ratio = populationLoad(tank, withOne, level);
  const percent = `${Math.round(ratio * 100)} % de la capacité`;
  if (tank.mode === 'decor') {
    return verdict(true, 'mode-decor', 'Mode décor : aucune contrainte de capacité', ratio, null);
  }
  const volume = volumeText(liters, profile.reference);
  const minimum = nonNegative(profile.minLiters.value);
  if (liters < minimum) {
    const reason = `${volume} : ${oneOf(species)} demande ${profile.reference === 'milieu' ? 'un milieu' : 'un bac'} d’au moins ${litersText(minimum)} (${sourceLabel(profile.minLiters)})`;
    return verdict(false, 'volume-minimal', reason, ratio, disagreementOf(profile.minLiters));
  }
  const rule = needRule(profile, level);
  const disagreement = disagreementOf(rule.field);
  if (ratio > 1) {
    // Besoin équivalent sur la référence de l'espèce (le besoin lui-même si le bac n'en a qu'une).
    const need = Number.isFinite(ratio) ? ratio * liters : populationNeedLiters(withOne, level);
    const reason = `${volume} : ${rule.text} (${sourceLabel(rule.field)}) ; il faudrait ${litersText(need)}`;
    return verdict(false, 'capacite', reason, ratio, disagreement);
  }
  const reason = `${volume} : place pour ${oneOf(species)} de plus (${percent}) ; ${rule.text} (${sourceLabel(rule.field)})`;
  return verdict(true, 'aucune', reason, ratio, disagreement);
}

/** « 45,7 L », ou « 105 L de milieu » pour une espèce comptée sur le milieu. */
function volumeText(liters: number, reference: CapacityReference): string {
  return reference === 'milieu' ? `${litersText(liters)} de milieu` : litersText(liters);
}

function verdict(
  ok: boolean,
  limit: CapacityLimit,
  reason: string,
  ratio: number,
  disagreement: string | null,
): CapacityVerdict {
  return { ok, limit, reason, occupation: ratio, disagreement };
}
