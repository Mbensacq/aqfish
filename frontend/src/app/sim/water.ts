import {
  BACTERIA_STARTER_TRACE,
  MAX_BACTERIA_STARTER,
  stepBacteriaStarterInPlace,
} from './bacteria-starter';
import { stepFilterMaturationInPlace } from './filter-maturation';
import { MAX_LIGHTING_HOURS, MIN_LIGHTING_HOURS, readAlgae } from './algae';
import { isLampOnHour } from './lamp';
import { readPlantGrowth, type PlantGrowth } from './plant-growth';
import { catappaPh, catappaStrength, readCatappa, stepCatappaInPlace } from './catappa';
import type { EnvironmentId } from './environment';
import { SPECIES, type SpeciesId } from './species';
import type { Box3 } from './tank';
import { assertTimeStep } from './time-step';
import {
  AMMONIA_BINDER_SECONDS,
  chlorineAfterWaterChangeInPlace,
  MAX_CHLORINE,
  stepAmmoniaBinderInPlace,
} from './water-conditioner';
import { PH_REGULATOR_WAIT_SECONDS, stepPhRegulatorInPlace } from './ph-regulator';
import { freshPh, MAX_PH, MIN_PH, phAfterWaterChange, stepPh } from './water-ph';
import {
  MAX_CONCENTRATIONS,
  NITRATE_PER_NITRITE,
  NITRITE_PER_AMMONIA,
  NITROGEN_DAY_SCALE,
  type NitrogenCompound,
} from './water-units';
import {
  HARDNESS_TRACE,
  hardnessAfterWaterChange,
  isHardness,
  MAX_HARDNESS,
  MIN_HARDNESS,
  tapHardness,
} from './water-hardness';

/**
 * Modèle d'eau (issue #206, ADR 0052) : température, ammoniaque, nitrites, nitrates et
 * efficacité du filtre d'un bac, avancés par pas fixe. Pur et déterministe : aucun hasard,
 * aucune horloge, aucune allocation par pas (`stepWaterInPlace`).
 *
 * Les concentrations sont en **mg/L** (ammoniaque totale, nitrites, nitrates), dans
 * [0, `MAX_CONCENTRATIONS`] (0 : eau saine) : issue #793, ADR 0167, `sim/water-units.ts`.
 * Les constantes sont les anciennes valeurs de jeu converties (facteurs exacts) : la
 * dynamique est celle d'avant.
 *
 * Équations simplifiées, par seconde (B : charge des habitants, L : litres d'eau, f : filtre) :
 * - ammoniaque produite au repos : `RESTING_AMMONIA_PER_LOAD_LITER · B / L` (issue #798) ; la
 *   part liée aux repas entre par la nourriture mangée (`sim/food-decay.ts`) ;
 * - ammoniaque → nitrites, puis nitrites → nitrates : décroissance du premier ordre de taux
 *   `AMMONIA_CONVERSION · f` et `NITRITE_CONVERSION · f` (forme exacte `1 − e^(−k·dt)`,
 *   stable quel que soit le pas), la masse convertie étant comptée avec `NITRITE_PER_AMMONIA`
 *   et `NITRATE_PER_NITRITE` ;
 * - nitrates : s'accumulent, retirés seulement par un changement d'eau (`changeWaterInPlace`) ;
 * - température : tend vers celle visée (consigne du chauffage `heater` si elle est réglée,
 *   sinon la température de référence, `ambientTemperature` : saisonnière au bassin, issue
 *   #858, celle de l'environnement ailleurs ; issue #207), constante de temps
 *   `TEMPERATURE_TIME_CONSTANT` ;
 * - pH : baisse lente avec la charge, remonte vers celui de l'eau neuve au changement d'eau
 *   (`sim/water-ph.ts`, issue #236, ADR 0057) ; les feuilles de catappa le tirent vers un
 *   plancher et se décomposent (`sim/catappa.ts`, issue #239, ADR 0071).
 * Une concentration plafonnée perd ce qui la ferait dépasser son plafond (`MAX_CONCENTRATIONS`).
 */

/** État de l'eau d'un bac : objet de données pur, sérialisable en JSON. */
export interface WaterState {
  /** Température, en °C, dans [`MIN_WATER_TEMPERATURE`, `MAX_WATER_TEMPERATURE`]. */
  readonly temperature: number;
  /** Ammoniaque, en mg/L, dans [0, `MAX_CONCENTRATIONS.ammonia`]. */
  readonly ammonia: number;
  /** Nitrites, en mg/L, dans [0, `MAX_CONCENTRATIONS.nitrite`]. */
  readonly nitrite: number;
  /** Nitrates, en mg/L, dans [0, `MAX_CONCENTRATIONS.nitrate`]. */
  readonly nitrate: number;
  /** Efficacité du filtre, dans [0, 1] : 0, filtre arrêté ; 1, filtre neuf. */
  readonly filter: number;
  /**
   * pH, dans [`MIN_PH`, `MAX_PH`] (issue #236, ADR 0057). Eau neuve : `FRESH_PH` de
   * l'environnement.
   */
  readonly ph: number;
  /**
   * Consigne du chauffage (thermostat), en °C, dans [`MIN_HEATER_TEMPERATURE`,
   * `MAX_HEATER_TEMPERATURE`] (issue #207, ADR 0053). Absente : jamais réglée, l'eau suit la
   * température de l'environnement (`targetTemperature`).
   */
  readonly heater?: number;
  /**
   * Feuilles de catappa du bac (issue #239, ADR 0071) : réserve de chaque feuille dans
   * [0, 1], au plus `MAX_CATAPPA_LEAVES` (`sim/catappa.ts`). Absent : aucune feuille.
   */
  readonly catappa?: readonly number[];
  /**
   * Sel non iodé dissous, en g/L, dans ]0, `MAX_SALT`] (issue #361, `sim/treatment.ts`).
   * Absent : aucun sel. Ne part qu'avec les changements d'eau (`docs/SOINS.md` § 12).
   */
  readonly salt?: number;
  /**
   * Médicament contre les points blancs dissous, en doses d'étiquette, dans
   * ]0, `MAX_MEDICATION`] (issue #361, `sim/treatment.ts`). Absent : aucun médicament.
   */
  readonly medication?: number;
  /**
   * Avancement du traitement des points blancs en cours, dans [0, 1[ (issue #361,
   * `sim/treatment.ts`). Absent : aucun traitement en cours.
   */
  readonly ichCure?: number;
  /**
   * Durée d'éclairage du bac, en heures entières par jour, dans [`MIN_LIGHTING_HOURS`,
   * `MAX_LIGHTING_HOURS`] (issue #476, `sim/algae.ts`). Absente : `DEFAULT_LIGHTING_HOURS`.
   * Réglage d'un appareil, comme la consigne du chauffage : le changement d'eau n'y touche pas.
   */
  readonly lighting?: number;
  /**
   * Heure d'allumage de la lampe du bac, heure entière dans [0, 23] (issue #584,
   * `sim/lamp.ts`). Absente : `DEFAULT_LAMP_ON_HOUR`. Réglage d'un appareil, comme `lighting`.
   */
  readonly lampOn?: number;
  /**
   * Couverture de chaque plaque d'algues, dans [0, 1], au plus `ALGAE_PATCH_COUNT` (issue
   * #476, `sim/algae.ts`). Absente : aucune algue. Seule la raclette la fait baisser.
   */
  readonly algae?: readonly number[];
  /**
   * Pousse des plantes à tige, en voxels, par graine de plante (issue #477,
   * `sim/plant-growth.ts`). Absente : toutes les plantes à leur hauteur d'origine. Seule la
   * taille la fait baisser ; le changement d'eau n'y touche pas.
   */
  readonly plantGrowth?: PlantGrowth;
  /**
   * Dureté générale, en °dGH, dans [`MIN_HARDNESS`, `MAX_HARDNESS`] (issue #484,
   * `sim/water-hardness.ts`). Absente : celle de l'eau du robinet de l'environnement
   * (`TAP_HARDNESS`). Seul le changement d'eau la fait bouger.
   */
  readonly gh?: number;
  /** Dureté carbonatée, en °dKH (issue #484), même convention que `gh`. */
  readonly kh?: number;
  /**
   * Réserve d'amorce de bactéries nitrifiantes, en doses, dans ]0, `MAX_BACTERIA_STARTER`]
   * (issue #529, `sim/bacteria-starter.ts`). Absente : aucune amorce.
   */
  readonly bacteriaStarter?: number;
  /**
   * Filtre en cours de maturation (issue #538, `sim/filter-maturation.ts`) : posé sur un bac
   * ajouté par le joueur, retiré une fois le filtre mûr. Absent : le filtre ne mûrit pas seul.
   * Le changement d'eau n'y touche pas (les bactéries vivent dans le filtre).
   */
  readonly cycling?: true;
  /**
   * Chlore, en mg/L, dans ]0, `MAX_CHLORINE`] (issue #530, `sim/water-conditioner.ts`).
   * Absent : aucun chlore.
   */
  readonly chlorine?: number;
  /** Changements d'eau à l'eau du robinet non traitée (issue #530) ; absent : eau traitée. */
  readonly untreatedTap?: true;
  /** Secondes restantes de protection de l'ammoniaque liée (issue #530) ; absent : aucune. */
  readonly ammoniaBinder?: number;
  /** Charbon actif dans le filtre (issue #531, `sim/water-carbon.ts`) ; absent : aucun. */
  readonly carbon?: true;
  /** Secondes d'attente avant la prochaine dose de régulateur de pH (issue #531) ; absent : aucune. */
  readonly phRegulatorWait?: number;
  /**
   * Température ambiante saisonnière, en °C, dans [`MIN_WATER_TEMPERATURE`,
   * `MAX_WATER_TEMPERATURE`] (issue #858, ADR 0186) : celle du bassin extérieur au jour de jeu,
   * posée à chaque pas par `stepPondSeasonInPlace` (`sim/pond-season.ts`). Absente : celle de
   * l'environnement (`WATER_TEMPERATURES`), comme pour tout bac intérieur.
   */
  readonly ambient?: number;
}

/** État de l'eau modifiable en place (propriétaire unique : le monde). */
export type MutableWaterState = { -readonly [K in keyof WaterState]: WaterState[K] };

export { MAX_CONCENTRATIONS } from './water-units';

/** Bornes de la température acceptée, en °C. */
export const MIN_WATER_TEMPERATURE = 0;
export const MAX_WATER_TEMPERATURE = 40;

/**
 * Température de l'eau de chaque environnement, en °C : **ordres de grandeur** de
 * l'aquariophilie (bassin extérieur 18, récif 26). Paludarium 20 et bac d'eau froide 17
 * (issue #271, ADR 0065) : 20 °C est la seule température commune aux plages préférées du
 * sonneur oriental (20–24 °C) et du triton à ventre de feu (14–20 °C) ; 17 °C tombe dans
 * celle de l'axolotl (16–18 °C). Bac tropical 24 (issue #286, ADR 0067) : dans la plage
 * préférée commune du néon, du guppy et du corydoras (23–24 °C). Chaque eau tombe dans la
 * plage préférée commune de la population par défaut (testé). Le type impose une entrée pour
 * tout nouvel environnement.
 */
export const WATER_TEMPERATURES: Readonly<Record<EnvironmentId, number>> = {
  tropical: 24,
  bassin: 18,
  paludarium: 20,
  recif: 26,
  eaufroide: 17,
};

/** Bornes de la consigne du chauffage, en °C (issue #207). */
export const MIN_HEATER_TEMPERATURE = 16;
export const MAX_HEATER_TEMPERATURE = 32;

/**
 * Température de référence de l'eau `water` d'un bac de l'environnement `environment` (issue
 * #858) : la température ambiante saisonnière (`ambient`) si elle est posée, sinon celle de
 * l'environnement (`WATER_TEMPERATURES`). Les seuils de qualité, d'alerte et de stress s'y
 * comparent.
 */
export function ambientTemperature(water: WaterState, environment: EnvironmentId): number {
  return water.ambient ?? WATER_TEMPERATURES[environment];
}

/**
 * Température visée par l'eau `water` d'un bac de l'environnement `environment` : la consigne
 * du chauffage si elle est réglée, sinon la température de référence (`ambientTemperature`).
 */
export function targetTemperature(water: WaterState, environment: EnvironmentId): number {
  return water.heater ?? ambientTemperature(water, environment);
}

/**
 * Règle la consigne du chauffage de `water` **en le modifiant** (issue #207), arrondie au
 * dixième de degré, et la renvoie. La température de l'eau la rejoint peu à peu
 * (`stepWaterInPlace`).
 * @throws RangeError si `temperature` n'est pas un réel dans [`MIN_HEATER_TEMPERATURE`,
 * `MAX_HEATER_TEMPERATURE`] (eau inchangée).
 */
export function setHeaterInPlace(water: MutableWaterState, temperature: number): number {
  if (!isIn(temperature, MIN_HEATER_TEMPERATURE, MAX_HEATER_TEMPERATURE)) {
    throw new RangeError(
      `consigne du chauffage dans [${MIN_HEATER_TEMPERATURE}, ${MAX_HEATER_TEMPERATURE}] attendue (reçu : ${temperature})`,
    );
  }
  water.heater = Math.round(temperature * 10) / 10;
  return water.heater;
}

/** Longueur de référence de la charge : un habitant de 5 cm compte pour 1. */
export const REFERENCE_BODY_LENGTH = 0.05;

/**
 * Ammoniaque produite par seconde par des habitants **nourris à leur faim**, en mg × L par
 * unité de charge (soit des mg/L par seconde pour une charge de 1 dans 1 L), repas et repos
 * compris. **Approximation de jeu** (ancienne valeur 0,045 convertie, `sim/water-units.ts`,
 * puis recalée sur le jour de jeu, `NITROGEN_DAY_SCALE`, #805) : la population par défaut du
 * bac tropical (24 habitants, charge ≈ 45 dans 288 L) fait monter les nitrates d'environ
 * 50 mg/L en seize heures simulées sans changement d'eau (48 journées de 20 min). Référence du bilan (`sim/bilan.ts`) ; depuis l'issue #798, la simulation la
 * sépare en une part au repos (`RESTING_AMMONIA_PER_LOAD_LITER`) et une part apportée par la
 * nourriture mangée (`sim/food-decay.ts`).
 */
export const AMMONIA_PER_LOAD_LITER = 0.0225 * NITROGEN_DAY_SCALE;

/**
 * Ammoniaque produite **au repos**, sans repas, par seconde, en mg × L par unité de charge
 * (`waterLoad` : la masse, cube de la taille de chaque espèce), issue #798 : un tiers de
 * `AMMONIA_PER_LOAD_LITER`. **Approximation de jeu** : un poisson à jeun excrète encore de
 * l'ammoniaque, mais aucune source retenue ne chiffre cette part pour les espèces du jeu.
 * Valeur écrite telle quelle (moitié exacte de 0,015 en unités de jeu d'avant #793), recalée
 * sur le jour de jeu (#805).
 */
export const RESTING_AMMONIA_PER_LOAD_LITER = 0.0075 * NITROGEN_DAY_SCALE;

/**
 * Taux de conversion de l'ammoniaque en nitrites par un filtre mûr, en s⁻¹ (≈ 16 min, soit
 * moins d'un jour de jeu ; 2 min avant le recalage #805).
 */
export const AMMONIA_CONVERSION = (1 / 120) * NITROGEN_DAY_SCALE;

/**
 * Taux de conversion des nitrites en nitrates par un filtre mûr, en s⁻¹ (≈ 24 min ; 3 min
 * avant le recalage #805).
 */
export const NITRITE_CONVERSION = (1 / 180) * NITROGEN_DAY_SCALE;

/** Constante de temps du retour de la température à celle de l'environnement, en s. */
export const TEMPERATURE_TIME_CONSTANT = 600;

/** Part des composés dissous retirée par un changement d'eau. */
export const WATER_CHANGE_SHARE = 0.3;

/**
 * Plafond du sel dissous, en g/L (issue #361) : la dose contre les points blancs, 5 g/L
 * (Merck, `docs/SOINS.md` § 5.1) ; au-delà, l'ajout est refusé (surdosage, `sim/treatment.ts`).
 */
export const MAX_SALT = 5;

/** Plafond du médicament dissous, en doses d'étiquette (issue #361, approximation de jeu). */
export const MAX_MEDICATION = 1.5;

/**
 * Traces de sel (g/L) et de médicament (doses) en deçà desquelles le produit est considéré
 * comme retiré : le champ disparaît de l'eau. Approximation de jeu.
 */
export const SALT_TRACE = 0.05;
export const MEDICATION_TRACE = 0.01;

/** Produits de traitement présents dans l'eau, au-delà des traces (issue #374). */
export interface WaterProducts {
  /** Sel dissous (`WaterState.salt`, retiré sous `SALT_TRACE`). */
  readonly salted: boolean;
  /** Médicament dissous (`WaterState.medication`, retiré sous `MEDICATION_TRACE`). */
  readonly medicated: boolean;
}

/** Produits de traitement présents dans `water` (sel, médicament), quelle que soit la dose. */
export function waterProducts(water: Pick<WaterState, 'salt' | 'medication'>): WaterProducts {
  return {
    salted: (water.salt ?? 0) > 0,
    medicated: (water.medication ?? 0) > 0,
  };
}

/**
 * Eau saine de l'environnement `environment` : à sa température, sans composé azoté, filtre
 * neuf, au pH de l'eau neuve (`FRESH_PH`). Nouvel objet à chaque appel.
 */
export function freshWater(environment: EnvironmentId): WaterState {
  return {
    temperature: WATER_TEMPERATURES[environment],
    ammonia: 0,
    nitrite: 0,
    nitrate: 0,
    filter: 1,
    ph: freshPh(environment),
  };
}

/**
 * Longueur réelle, en mètres, des espèces dont le modèle est agrandi pour rester lisible
 * (issue #836) : la crevette cerise mesure 3 cm (FishKeeper,
 * https://www.fishkeeper.co.uk/fish/freshwater/miscellaneous/cherry-shrimp), son modèle 10 cm.
 * Sans elle, dix crevettes pesaient dans l'eau autant que dix poissons de 10 cm.
 */
const LOAD_BODY_LENGTHS: Readonly<Partial<Record<SpeciesId, number>>> = Object.freeze({
  cerise: 0.03,
});

/**
 * Charge des habitants `entities` : somme des cubes de leur longueur rapportée à
 * `REFERENCE_BODY_LENGTH` (la masse, donc les déchets, croît comme le cube de la taille) ;
 * longueur réelle (`LOAD_BODY_LENGTHS`) quand le modèle est agrandi, sinon `bodyLength`.
 * Aucune allocation.
 */
export function waterLoad(entities: readonly { readonly species: SpeciesId }[]): number {
  let load = 0;
  for (const entity of entities) {
    const length = LOAD_BODY_LENGTHS[entity.species] ?? SPECIES[entity.species].bodyLength;
    const r = length / REFERENCE_BODY_LENGTH;
    load += r * r * r;
  }
  return load;
}

/** Litres d'eau d'une boîte d'eau (`environmentWater`), en dm³. */
export function waterLiters(water: Box3): number {
  return (water.maxX - water.minX) * (water.maxY - water.minY) * (water.maxZ - water.minZ) * 1000;
}

/**
 * Fait avancer `water` de `dt` secondes **en le modifiant**, et le renvoie : charge `load`
 * (`waterLoad`) dans `liters` litres, température visée `temperature` (°C). Aucune
 * allocation. Toutes les valeurs restent finies et bornées.
 * @throws RangeError si `dt` n'est pas un réel strictement positif, si `load` n'est pas un
 * réel positif ou nul, si `liters` n'est pas un réel strictement positif, ou si
 * `temperature` est hors de [`MIN_WATER_TEMPERATURE`, `MAX_WATER_TEMPERATURE`] (eau inchangée).
 */
export function stepWaterInPlace(
  water: MutableWaterState,
  dt: number,
  load: number,
  liters: number,
  temperature: number,
): MutableWaterState {
  assertTimeStep(dt);
  if (!(load >= 0) || !Number.isFinite(load)) {
    throw new RangeError(`load doit être un réel positif ou nul (reçu : ${load})`);
  }
  if (!(liters > 0) || !Number.isFinite(liters)) {
    throw new RangeError(`liters doit être un réel strictement positif (reçu : ${liters})`);
  }
  if (!isIn(temperature, MIN_WATER_TEMPERATURE, MAX_WATER_TEMPERATURE)) {
    throw new RangeError(
      `temperature doit être dans [${MIN_WATER_TEMPERATURE}, ${MAX_WATER_TEMPERATURE}] (reçu : ${temperature})`,
    );
  }
  const filter = clamp(water.filter, 0, 1);
  // Conversions calculées sur les concentrations du début du pas : l'ammoniaque produite
  // pendant le pas n'est convertie qu'au pas suivant.
  const toNitrite = water.ammonia * (1 - Math.exp(-AMMONIA_CONVERSION * filter * dt));
  const toNitrate = water.nitrite * (1 - Math.exp(-NITRITE_CONVERSION * filter * dt));
  const produced = ((RESTING_AMMONIA_PER_LOAD_LITER * load) / liters) * dt;
  water.ammonia = clampConcentration(water.ammonia - toNitrite + produced, 'ammonia');
  water.nitrite = clampConcentration(
    water.nitrite + toNitrite * NITRITE_PER_AMMONIA - toNitrate,
    'nitrite',
  );
  water.nitrate = clampConcentration(water.nitrate + toNitrate * NITRATE_PER_NITRITE, 'nitrate');
  const follow = 1 - Math.exp(-dt / TEMPERATURE_TIME_CONSTANT);
  water.temperature = clamp(
    water.temperature + (temperature - water.temperature) * follow,
    MIN_WATER_TEMPERATURE,
    MAX_WATER_TEMPERATURE,
  );
  water.filter = filter;
  stepBacteriaStarterInPlace(water, dt);
  stepFilterMaturationInPlace(water, dt);
  stepAmmoniaBinderInPlace(water, dt);
  stepPhRegulatorInPlace(water, dt);
  water.ph = stepPh(water.ph, dt, load, liters);
  const leaves = water.catappa as number[] | undefined;
  if (leaves !== undefined && leaves.length > 0) {
    // Réserve du début du pas, puis décomposition (même convention que les conversions).
    water.ph = catappaPh(water.ph, catappaStrength(leaves), liters, dt);
    stepCatappaInPlace(leaves, dt);
  }
  return water;
}

/** Comme `stepWaterInPlace`, sur une copie : `water` n'est jamais modifié. */
export function stepWater(
  water: WaterState,
  dt: number,
  load: number,
  liters: number,
  temperature: number,
): WaterState {
  return stepWaterInPlace(copyWater(water), dt, load, liters, temperature);
}

/** Eau neuve versée à la main (séance d'entretien, #605) : traitement et température. */
export interface FreshWaterOptions {
  /** Vrai si le conditionneur a été oublié : l'eau du robinet apporte son chlore. */
  readonly untreated: boolean;
  /** Température de l'eau versée, en °C : celle du bac devient le mélange des deux. */
  readonly temperature: number;
}

/**
 * Changement d'eau **en modifiant** `water`, bac de l'environnement `environment` : retire la
 * part `share` (par défaut `WATER_CHANGE_SHARE`, ramenée dans [0, 1]) de chaque composé
 * dissous (nitrates, et aussi ammoniaque et nitrites, dilués de même) et rapproche d'autant le
 * pH de celui de l'eau neuve (`FRESH_PH`, issue #236). Sans `fresh`, la température et le
 * filtre ne changent pas (eau neuve à la température du bac) et le chlore suit le réglage
 * `untreatedTap` ; avec `fresh` (#605), ils suivent l'eau versée. Renvoie `water`.
 */
export function changeWaterInPlace(
  water: MutableWaterState,
  environment: EnvironmentId,
  share: number = WATER_CHANGE_SHARE,
  fresh: FreshWaterOptions | null = null,
): MutableWaterState {
  const part = Number.isFinite(share) ? clamp(share, 0, 1) : 0;
  const keep = 1 - part;
  water.ammonia *= keep;
  water.nitrite *= keep;
  water.nitrate *= keep;
  water.ph = phAfterWaterChange(water.ph, freshPh(environment), part);
  // Dureté (issue #484) : rapprochée de celle de l'eau du robinet ; revenue à celle-ci, le
  // champ disparaît (une eau jamais modifiée n'en porte pas).
  const tap = tapHardness(environment);
  for (const key of ['gh', 'kh'] as const) {
    const value = water[key];
    if (value === undefined) {
      continue;
    }
    const next = hardnessAfterWaterChange(value, tap[key], part);
    if (Math.abs(next - tap[key]) < HARDNESS_TRACE) {
      delete water[key];
    } else {
      water[key] = next;
    }
  }
  // Sel et médicament (issue #361) : retirés par les changements d'eau (`docs/SOINS.md` § 12).
  if (water.salt !== undefined) {
    water.salt *= keep;
    if (!(water.salt >= SALT_TRACE)) {
      delete water.salt;
    }
  }
  if (water.medication !== undefined) {
    water.medication *= keep;
    if (!(water.medication >= MEDICATION_TRACE)) {
      delete water.medication;
    }
  }
  // Amorce de bactéries (issue #529) : diluée comme les autres produits (`docs/SOINS.md` § 12).
  if (water.bacteriaStarter !== undefined) {
    water.bacteriaStarter *= keep;
    if (!(water.bacteriaStarter >= BACTERIA_STARTER_TRACE)) {
      delete water.bacteriaStarter;
    }
  }
  // Chlore (issue #530) : dilué, et apporté par l'eau du robinet si elle n'est pas traitée.
  chlorineAfterWaterChangeInPlace(water, part, fresh?.untreated);
  if (fresh !== null && Number.isFinite(fresh.temperature)) {
    water.temperature = clamp(
      water.temperature * keep + fresh.temperature * part,
      MIN_WATER_TEMPERATURE,
      MAX_WATER_TEMPERATURE,
    );
  }
  return water;
}

/** Comme `changeWaterInPlace`, sur une copie : `water` n'est jamais modifié. */
export function changeWater(water: WaterState, environment: EnvironmentId): WaterState {
  return changeWaterInPlace(copyWater(water), environment);
}

/** Copie de `water`, feuilles de catappa comprises (le tableau n'est jamais partagé). */
export function copyWater(water: WaterState): MutableWaterState {
  const copy: MutableWaterState = { ...water };
  if (water.catappa !== undefined) {
    copy.catappa = [...water.catappa];
  }
  if (water.algae !== undefined) {
    copy.algae = [...water.algae];
  }
  if (water.plantGrowth !== undefined) {
    copy.plantGrowth = { ...water.plantGrowth };
  }
  return copy;
}

/** Résultat de `readWater`. */
export type ReadWaterResult =
  | { readonly ok: true; readonly water: WaterState }
  | { readonly ok: false; readonly error: string };

/** Champs numériques obligatoires de l'eau relue, bornes comprises. */
const REQUIRED_FIELDS = [
  ['temperature', MIN_WATER_TEMPERATURE, MAX_WATER_TEMPERATURE],
  ['ammonia', 0, MAX_CONCENTRATIONS.ammonia],
  ['nitrite', 0, MAX_CONCENTRATIONS.nitrite],
  ['nitrate', 0, MAX_CONCENTRATIONS.nitrate],
  ['filter', 0, 1],
] as const;

/** Quantités facultatives, bornes comprises (sauf `ichCure`, borne haute exclue). */
const OPTIONAL_AMOUNTS = [
  ['salt', 0, MAX_SALT],
  ['medication', 0, MAX_MEDICATION],
  ['ichCure', 0, 1],
  ['bacteriaStarter', 0, MAX_BACTERIA_STARTER],
  ['chlorine', 0, MAX_CHLORINE],
  ['ammoniaBinder', 0, AMMONIA_BINDER_SECONDS],
  ['phRegulatorWait', 0, PH_REGULATOR_WAIT_SECONDS],
] as const;

/** Drapeaux facultatifs : `true` ou absents, contrôlés dans cet ordre. */
const FLAGS = ['untreatedTap', 'cycling', 'carbon'] as const;

/**
 * Champs facultatifs de l'eau relue, dans l'ordre où ils sont écrits (il fixe le texte des
 * sauvegardes) : il diffère de l'ordre des contrôles.
 */
const OPTIONAL_ORDER = [
  'heater',
  'catappa',
  ...OPTIONAL_AMOUNTS.map(([key]) => key),
  'untreatedTap',
  'carbon',
  'cycling',
  'lighting',
  'lampOn',
  'algae',
  'plantGrowth',
  'gh',
  'kh',
  'ambient',
] as const satisfies readonly (keyof WaterState)[];

/** Lecture d'une propriété propre de la sauvegarde (`undefined` si absente ou héritée). */
type FieldReader = (key: keyof WaterState) => unknown;

/** Champs facultatifs retenus au fil de la lecture (absents : non écrits). */
type WaterExtras = Partial<MutableWaterState>;

/** Lecture d'un groupe de champs : écrit les valeurs retenues, renvoie l'erreur ou `null`. */
type SectionReader = (read: FieldReader, extras: WaterExtras) => string | null;

/** Groupes de champs facultatifs, dans l'ordre des contrôles (la première erreur l'emporte). */
const SECTIONS: readonly SectionReader[] = [
  readHeaterField,
  readAmbientField,
  readPhField,
  readCatappaField,
  readLightingField,
  readLampOnField,
  readAlgaeField,
  readPlantGrowthField,
  readHardnessFields,
  readAmountFields,
  readFlagFields,
];

/**
 * Relit un état d'eau venu d'une sauvegarde d'un bac de l'environnement `environment` : objet
 * aux cinq champs numériques finis et bornés, plus la consigne du chauffage facultative
 * (`heater`, issue #207 : absente, jamais réglée) et le pH facultatif (`ph`, issue #236 :
 * absent dans une sauvegarde antérieure, il reprend celui de l'eau neuve de
 * l'environnement) et les feuilles de catappa facultatives (`catappa`, issue #239 : absentes,
 * aucune feuille), ainsi que le sel, le médicament et l'avancement d'un traitement des points
 * blancs (`salt`, `medication`, `ichCure`, issue #361 : absents, aucun) et la dureté (`gh`,
 * `kh`, issue #484 : absente, celle de l'eau du robinet de l'environnement) ; seules les
 * propriétés propres sont lues, les champs inconnus ignorés.
 * Renvoie une copie, ou la raison du refus. Ne lève jamais.
 */
export function readWater(value: unknown, environment: EnvironmentId): ReadWaterResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: 'eau : doit être un objet' };
  }
  const record = value as Record<string, unknown>;
  const read: FieldReader = (key) => (Object.hasOwn(record, key) ? record[key] : undefined);
  const requiredError = requiredFieldsError(read);
  if (requiredError !== null) {
    return { ok: false, error: requiredError };
  }
  const extras: WaterExtras = {};
  for (const section of SECTIONS) {
    const error = section(read, extras);
    if (error !== null) {
      return { ok: false, error };
    }
  }
  return { ok: true, water: assembleWater(read, extras, environment) };
}

/**
 * Contrôle les champs obligatoires (`REQUIRED_FIELDS`) ; erreur au premier absent, non numérique
 * ou hors bornes.
 */
function requiredFieldsError(read: FieldReader): string | null {
  for (const [key, min, max] of REQUIRED_FIELDS) {
    if (!isIn(read(key), min, max)) {
      return `eau : ${key} doit être un nombre dans [${min}, ${max}]`;
    }
  }
  return null;
}

/** Eau relue : champs obligatoires, pH (celui de l'eau neuve s'il manque), puis facultatifs. */
function assembleWater(
  read: FieldReader,
  extras: WaterExtras,
  environment: EnvironmentId,
): WaterState {
  // Les cinq champs obligatoires ont été contrôlés par `requiredFieldsError`.
  const water: MutableWaterState = {
    temperature: read('temperature') as number,
    ammonia: read('ammonia') as number,
    nitrite: read('nitrite') as number,
    nitrate: read('nitrate') as number,
    filter: read('filter') as number,
    ph: extras.ph ?? freshPh(environment),
  };
  for (const key of OPTIONAL_ORDER) {
    if (extras[key] !== undefined) {
      Object.assign(water, { [key]: extras[key] });
    }
  }
  return water;
}

/**
 * Lit `heater` (consigne du chauffage) ; erreur s'il est présent mais hors
 * [`MIN_HEATER_TEMPERATURE`, `MAX_HEATER_TEMPERATURE`].
 */
function readHeaterField(read: FieldReader, extras: WaterExtras): string | null {
  const heater = read('heater');
  if (heater === undefined) {
    return null;
  }
  if (!isIn(heater, MIN_HEATER_TEMPERATURE, MAX_HEATER_TEMPERATURE)) {
    return `eau : heater doit être un nombre dans [${MIN_HEATER_TEMPERATURE}, ${MAX_HEATER_TEMPERATURE}]`;
  }
  extras.heater = heater;
  return null;
}

/**
 * Lit `ambient` (température ambiante saisonnière, issue #858) ; erreur s'il est présent mais
 * hors [`MIN_WATER_TEMPERATURE`, `MAX_WATER_TEMPERATURE`].
 */
function readAmbientField(read: FieldReader, extras: WaterExtras): string | null {
  const ambient = read('ambient');
  if (ambient === undefined) {
    return null;
  }
  if (!isIn(ambient, MIN_WATER_TEMPERATURE, MAX_WATER_TEMPERATURE)) {
    return `eau : ambient doit être un nombre dans [${MIN_WATER_TEMPERATURE}, ${MAX_WATER_TEMPERATURE}]`;
  }
  extras.ambient = ambient;
  return null;
}

/** Lit `ph` ; erreur s'il est présent mais hors [`MIN_PH`, `MAX_PH`]. */
function readPhField(read: FieldReader, extras: WaterExtras): string | null {
  const ph = read('ph');
  if (ph === undefined) {
    return null;
  }
  if (!isIn(ph, MIN_PH, MAX_PH)) {
    return `eau : ph doit être un nombre dans [${MIN_PH}, ${MAX_PH}]`;
  }
  extras.ph = ph;
  return null;
}

/**
 * Lit `catappa` (feuilles posées) ; erreur de `readCatappa` si la liste est mal formée, ignoré si
 * vide.
 */
function readCatappaField(read: FieldReader, extras: WaterExtras): string | null {
  const value = read('catappa');
  if (value === undefined) {
    return null;
  }
  const catappa = readCatappa(value);
  if (!catappa.ok) {
    return catappa.error;
  }
  if (catappa.leaves.length > 0) {
    extras.catappa = catappa.leaves;
  }
  return null;
}

/**
 * Lit `lighting` (heures d'éclairage) ; erreur s'il n'est pas un entier dans
 * [`MIN_LIGHTING_HOURS`, `MAX_LIGHTING_HOURS`].
 */
function readLightingField(read: FieldReader, extras: WaterExtras): string | null {
  const lighting = read('lighting');
  if (lighting === undefined) {
    return null;
  }
  if (!isIn(lighting, MIN_LIGHTING_HOURS, MAX_LIGHTING_HOURS) || !Number.isInteger(lighting)) {
    return `eau : lighting doit être un entier dans [${MIN_LIGHTING_HOURS}, ${MAX_LIGHTING_HOURS}]`;
  }
  extras.lighting = lighting;
  return null;
}

/** Lit `lampOn` (heure d'allumage) ; erreur s'il n'est pas un entier dans [0, 23]. */
function readLampOnField(read: FieldReader, extras: WaterExtras): string | null {
  const lampOn = read('lampOn');
  if (lampOn === undefined) {
    return null;
  }
  if (!isLampOnHour(lampOn)) {
    return 'eau : lampOn doit être un entier dans [0, 23]';
  }
  extras.lampOn = lampOn;
  return null;
}

/**
 * Lit `algae` (couverture par vitre) ; erreur de `readAlgae` si mal formé, ignoré si tout est nul.
 */
function readAlgaeField(read: FieldReader, extras: WaterExtras): string | null {
  const value = read('algae');
  if (value === undefined) {
    return null;
  }
  const algae = readAlgae(value);
  if (!algae.ok) {
    return algae.error;
  }
  if (!algae.algae.every((c) => c === 0)) {
    extras.algae = algae.algae;
  }
  return null;
}

/**
 * Lit `plantGrowth` (pousse des plantes) ; erreur de `readPlantGrowth` si mal formé, ignoré si
 * vide.
 */
function readPlantGrowthField(read: FieldReader, extras: WaterExtras): string | null {
  const value = read('plantGrowth');
  if (value === undefined) {
    return null;
  }
  const plantGrowth = readPlantGrowth(value);
  if (!plantGrowth.ok) {
    return plantGrowth.error;
  }
  if (Object.keys(plantGrowth.growth).length > 0) {
    extras.plantGrowth = plantGrowth.growth;
  }
  return null;
}

/** Lit `gh` et `kh` (duretés) ; erreur au premier présent hors [`MIN_HARDNESS`, `MAX_HARDNESS`]. */
function readHardnessFields(read: FieldReader, extras: WaterExtras): string | null {
  for (const key of ['gh', 'kh'] as const) {
    const v = read(key);
    if (v === undefined) {
      continue;
    }
    if (!isHardness(v)) {
      return `eau : ${key} doit être un nombre dans [${MIN_HARDNESS}, ${MAX_HARDNESS}]`;
    }
    extras[key] = v;
  }
  return null;
}

/**
 * Lit les quantités facultatives (`OPTIONAL_AMOUNTS`) ; erreur à la première hors bornes
 * (`ichCure` exclut sa borne haute).
 */
function readAmountFields(read: FieldReader, extras: WaterExtras): string | null {
  for (const [key, min, max] of OPTIONAL_AMOUNTS) {
    const v = read(key);
    if (v === undefined) {
      continue;
    }
    const upperExcluded = key === 'ichCure';
    if (!isIn(v, min, max) || (upperExcluded && v === max)) {
      return `eau : ${key} doit être un nombre dans [${min}, ${max}${upperExcluded ? '[' : ']'}`;
    }
    extras[key] = v;
  }
  return null;
}

/** Lit les drapeaux (`FLAGS`) ; erreur au premier présent qui ne vaut pas `true`. */
function readFlagFields(read: FieldReader, extras: WaterExtras): string | null {
  for (const key of FLAGS) {
    const v = read(key);
    if (v === undefined) {
      continue;
    }
    if (v !== true) {
      return `eau : ${key} doit valoir true ou être absent`;
    }
    extras[key] = v;
  }
  return null;
}

function isIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Concentration ramenée dans [0, son plafond] (un résidu négatif d'arrondi vaut 0). */
function clampConcentration(v: number, compound: NitrogenCompound): number {
  return clamp(v, 0, MAX_CONCENTRATIONS[compound]);
}
