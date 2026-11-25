import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import type { DecorItem } from './decor';
import type { PlantForm } from './plant';
import { isGrowingPlant, plantLimits, type PlantGrowth } from './plant-growth';
import { assertTimeStep } from './time-step';
import { AMMONIA_PER_LOAD_LITER } from './water';
import { MAX_PH, PH_DROP_PER_LOAD_LITER } from './water-ph';

/**
 * Plantes actives (issue #821, tranche 1 de #731, ADR 0175, `docs/ECOSYSTEME.md` § 3.3) : les
 * plantes du bac absorbent l'azote dissous, **l'ammonium d'abord, le nitrate ensuite**, selon
 * leur masse, leur type et la lumière ; leur pousse ralentit quand l'azote manque. Fonctions
 * pures et déterministes, sans allocation par pas.
 *
 * Modèle :
 * - **masse** d'une plante, en m² de couverture : son emprise (`PLANT_FOOTPRINT_M2`, selon sa
 *   forme, × échelle²) × sa hauteur totale rapportée à sa hauteur d'origine ; la pousse
 *   l'augmente, la taille la retire ;
 * - **capacité** : masse × absorption de son type (`PLANT_UPTAKE_MG_N_PER_M2_DAY`, Reddy et De
 *   Busk 1985) × facteur de lumière (`plantLightFactor` : nul sans lumière) ; c'est le
 *   plafond de ce que les plantes retirent, quelle que soit l'eau ;
 * - **saturation** : la capacité est d'abord dépensée sur l'ammonium, au prorata de
 *   N / (K + N) (Michaelis-Menten, demi-saturation `UPTAKE_HALF_SATURATION_MG_N_PER_L`) ; ce
 *   qui reste va au nitrate, de même. Jamais plus que ce qui est dissous.
 *
 * Le cycle de l'azote est calé sur le jour de jeu (ADR 0170) : un jour de jeu vaut un jour
 * réel pour l'azote, donc les taux journaliers des sources s'appliquent tels quels sur
 * `DEFAULT_DAY_LENGTH_SECONDS`.
 */

/** Type de plante, pour l'absorption (`docs/ECOSYSTEME.md` § 3.3). */
export type PlantKind = 'flottante' | 'rapide' | 'lente';

/**
 * Absorption d'azote d'une couverture pleine, en mg d'azote par m² et par jour :
 * - flottante : _Salvinia_, 406 (Reddy et De Busk 1985, bacs extérieurs en été, cité par
 *   The Krib) ; _Lemna_ 292 et _Pistia_ 985 encadrent cette valeur ;
 * - rapide : _Egeria densa_, 125 (même source) ;
 * - lente : **approximation de jeu**, le quart d'_Egeria_ (aucune source chiffrée retenue
 *   pour les plantes lentes ; la source dit seulement qu'elles retirent bien moins).
 */
export const PLANT_UPTAKE_MG_N_PER_M2_DAY: Readonly<Record<PlantKind, number>> = {
  flottante: 406,
  rapide: 125,
  lente: 31.25,
};

/**
 * Type de chaque forme de plante du décor : les plantes à tige (`tall`) poussent vite, les
 * touffes (`tuft`) lentement (**approximation de jeu**) ; le radeau de salvinia (`floating`,
 * issue #824) est une plante flottante.
 */
export const PLANT_FORM_KIND: Readonly<Record<PlantForm, PlantKind>> = {
  tall: 'rapide',
  tuft: 'lente',
  floating: 'flottante',
};

/**
 * Emprise d'une plante d'échelle 1 à sa hauteur d'origine, en m² (**approximation de jeu**) :
 * une plante à tige couvre environ 10 × 10 cm, une touffe la moitié. Une plante flottante
 * couvre la surface de son radeau, un disque d'environ 8 cm de rayon (π · 0,08² ≈ 0,02 m²,
 * `FLOATING_RAFT_RADIUS` plus la demi-fronde, en voxels de 8 mm) : à masse égale, elle
 * absorbe plus qu'une plante à tige (406 contre 125 mg N/m²/j).
 */
export const PLANT_FOOTPRINT_M2: Readonly<Record<PlantForm, number>> = {
  tall: 0.02,
  tuft: 0.01,
  floating: 0.02,
};

/**
 * Demi-saturation de l'absorption, en mg d'azote par litre : à cette concentration, les plantes
 * absorbent la moitié de leur capacité. **Approximation de jeu** (ordre de grandeur des
 * constantes de Michaelis des plantes aquatiques, non vérifié dans une source primaire).
 */
export const UPTAKE_HALF_SATURATION_MG_N_PER_L = 0.05;

/** mg d'ammoniaque (NH₃) par mg d'azote : 17 / 14 (masses molaires). */
export const AMMONIA_MG_PER_MG_N = 17 / 14;
/** mg de nitrate (NO₃⁻) par mg d'azote : 62 / 14 (masses molaires). */
export const NITRATE_MG_PER_MG_N = 62 / 14;

/**
 * Part de sa pousse qu'une plante garde sans azote disponible (**approximation de jeu**) : elle
 * vit sur ses réserves, plus lentement.
 */
export const PLANT_MIN_NITROGEN_GROWTH = 0.25;

/**
 * Remontée du pH par mg/L d'azote absorbé par les plantes (**approximation de jeu**). La dérive
 * du pH du jeu (`PH_DROP_PER_LOAD_LITER`) représente l'acidité des déchets azotés d'habitants
 * nourris (`AMMONIA_PER_LOAD_LITER`) ; l'azote que les plantes prennent sous forme d'ammonium
 * n'est jamais nitrifié, et celui qu'elles prennent sous forme de nitrate rend de l'alcalinité :
 * il n'acidifie donc plus l'eau. La remontée vaut exactement la baisse que cet azote aurait
 * causée, d'où un pH stable dans un bac où les plantes prennent tout l'azote produit (méthode
 * Walstad).
 */
export const PH_RISE_PER_MG_N_PER_L =
  (PH_DROP_PER_LOAD_LITER / AMMONIA_PER_LOAD_LITER) * AMMONIA_MG_PER_MG_N;

/**
 * pH après absorption de `absorbed` mg/L d'azote par les plantes : relevé de
 * `absorbed × PH_RISE_PER_MG_N_PER_L`, sans jamais dépasser `fresh` (pH de l'eau neuve du bac) ;
 * un pH déjà au-dessus de `fresh` ne bouge pas.
 */
export function phAfterUptake(ph: number, absorbed: number, fresh: number): number {
  if (!(absorbed > 0) || !(ph < fresh)) {
    return ph;
  }
  return Math.min(fresh, MAX_PH, ph + absorbed * PH_RISE_PER_MG_N_PER_L);
}

/** Eau lue et modifiée par l'absorption (mg/L). */
export interface NitrogenWater {
  ammonia: number;
  nitrate: number;
}

/**
 * Masse d'une plante `item`, en m² de couverture : 0 pour un autre élément. Une plante à tige
 * compte sa pousse `growth` (la taille la retire) ; la surface de l'eau est à `surface`.
 */
export function plantMass(
  item: DecorItem,
  growth: PlantGrowth | undefined,
  surface: number,
): number {
  if (item.kind !== 'plant' || item.form === undefined) {
    return 0;
  }
  const base = PLANT_FOOTPRINT_M2[item.form] * item.scale * item.scale;
  if (!isGrowingPlant(item) || growth === undefined) {
    return base;
  }
  const { height, key } = plantLimits(item, surface);
  return (base * (height + (growth[key] ?? 0))) / height;
}

/**
 * Capacité d'absorption des plantes de `decor`, en mg d'azote par seconde simulée, à la
 * lumière `light` (dans [0, 1], `plantLightFactor`) : somme des masses × absorption de leur
 * type. Nulle sans plante ou sans lumière. Aucune allocation.
 */
export function plantUptakeCapacity(
  decor: readonly DecorItem[],
  growth: PlantGrowth | undefined,
  surface: number,
  light: number,
): number {
  if (!(light > 0)) {
    return 0;
  }
  let perDay = 0;
  for (const item of decor) {
    if (item.kind === 'plant' && item.form !== undefined) {
      perDay +=
        plantMass(item, growth, surface) * PLANT_UPTAKE_MG_N_PER_M2_DAY[PLANT_FORM_KIND[item.form]];
    }
  }
  return (perDay * Math.min(1, light)) / DEFAULT_DAY_LENGTH_SECONDS;
}

/**
 * Absorbe l'azote de `water` pendant `dt` secondes, **en la modifiant** : capacité
 * `capacity` (mg d'azote par seconde) dans `liters` litres, dépensée d'abord sur l'ammonium puis
 * sur le nitrate, chacun au prorata de N / (K + N), jamais plus que ce qui est dissous.
 * Renvoie l'azote retiré, en mg/L. Une capacité nulle ne change rien.
 * @throws RangeError si `dt` n'est pas un pas valide ou `liters` pas un réel strictement positif.
 */
export function absorbNitrogenInPlace(
  water: NitrogenWater,
  capacity: number,
  liters: number,
  dt: number,
): number {
  assertTimeStep(dt);
  if (!(liters > 0) || !Number.isFinite(liters)) {
    throw new RangeError(`liters doit être un réel strictement positif (reçu : ${liters})`);
  }
  if (!(capacity > 0)) {
    return 0;
  }
  let budget = (capacity * dt) / liters;
  const ammoniumN = water.ammonia / AMMONIA_MG_PER_MG_N;
  const fromAmmonium = Math.min(ammoniumN, budget * saturation(ammoniumN));
  budget -= fromAmmonium;
  const nitrateN = water.nitrate / NITRATE_MG_PER_MG_N;
  const fromNitrate = Math.min(nitrateN, budget * saturation(nitrateN));
  water.ammonia = Math.max(0, water.ammonia - fromAmmonium * AMMONIA_MG_PER_MG_N);
  water.nitrate = Math.max(0, water.nitrate - fromNitrate * NITRATE_MG_PER_MG_N);
  return fromAmmonium + fromNitrate;
}

/**
 * Facteur de pousse des plantes selon l'azote disponible de `water`, dans
 * [`PLANT_MIN_NITROGEN_GROWTH`, 1[ : au plancher sans azote, presque 1 dès que l'azote dépasse
 * nettement la demi-saturation.
 */
export function nitrogenGrowthFactor(water: Readonly<NitrogenWater>): number {
  const n = water.ammonia / AMMONIA_MG_PER_MG_N + water.nitrate / NITRATE_MG_PER_MG_N;
  return PLANT_MIN_NITROGEN_GROWTH + (1 - PLANT_MIN_NITROGEN_GROWTH) * saturation(n);
}

/** N / (K + N), dans [0, 1[ ; 0 pour une valeur non positive ou non finie. */
function saturation(n: number): number {
  return n > 0 && Number.isFinite(n) ? n / (UPTAKE_HALF_SATURATION_MG_N_PER_L + n) : 0;
}
