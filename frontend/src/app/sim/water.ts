import type { EnvironmentId } from './environment';
import { SPECIES, type SpeciesId } from './species';
import type { Box3 } from './tank';
import { assertTimeStep } from './time-step';
import { freshPh, MAX_PH, MIN_PH, phAfterWaterChange, stepPh } from './water-ph';

/**
 * Modèle d'eau (issue #206, ADR 0052) : température, ammoniaque, nitrites, nitrates et
 * efficacité du filtre d'un bac, avancés par pas fixe. Pur et déterministe : aucun hasard,
 * aucune horloge, aucune allocation par pas (`stepWaterInPlace`).
 *
 * Les concentrations sont des **unités de jeu** dans [0, `MAX_CONCENTRATION`] (0 : eau
 * saine), pas des mg/L : seules comptent leur évolution relative et leurs paliers, que le
 * rendu et la santé des poissons liront plus tard.
 *
 * Équations simplifiées, par seconde (B : charge des habitants, L : litres d'eau, f : filtre) :
 * - ammoniaque produite : `AMMONIA_PER_LOAD_LITER · B / L` ;
 * - ammoniaque → nitrites, puis nitrites → nitrates : décroissance du premier ordre de taux
 *   `AMMONIA_CONVERSION · f` et `NITRITE_CONVERSION · f` (forme exacte `1 − e^(−k·dt)`,
 *   stable quel que soit le pas) ;
 * - nitrates : s'accumulent, retirés seulement par un changement d'eau (`changeWaterInPlace`) ;
 * - température : tend vers celle visée (consigne du chauffage `heater` si elle est réglée,
 *   sinon celle de l'environnement, `WATER_TEMPERATURES` ; issue #207), constante de temps
 *   `TEMPERATURE_TIME_CONSTANT` ;
 * - pH : baisse lente avec la charge, remonte vers celui de l'eau neuve au changement d'eau
 *   (`sim/water-ph.ts`, issue #236, ADR 0057).
 * Une concentration plafonnée perd ce qui la ferait dépasser `MAX_CONCENTRATION`.
 */

/** État de l'eau d'un bac : objet de données pur, sérialisable en JSON. */
export interface WaterState {
  /** Température, en °C, dans [`MIN_WATER_TEMPERATURE`, `MAX_WATER_TEMPERATURE`]. */
  readonly temperature: number;
  /** Ammoniaque, en unités de jeu, dans [0, `MAX_CONCENTRATION`]. */
  readonly ammonia: number;
  /** Nitrites, en unités de jeu, dans [0, `MAX_CONCENTRATION`]. */
  readonly nitrite: number;
  /** Nitrates, en unités de jeu, dans [0, `MAX_CONCENTRATION`]. */
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
}

/** État de l'eau modifiable en place (propriétaire unique : le monde). */
export type MutableWaterState = { -readonly [K in keyof WaterState]: WaterState[K] };

/** Plafond des concentrations, en unités de jeu. */
export const MAX_CONCENTRATION = 100;

/** Bornes de la température acceptée, en °C. */
export const MIN_WATER_TEMPERATURE = 0;
export const MAX_WATER_TEMPERATURE = 40;

/**
 * Température de l'eau de chaque environnement, en °C : **ordres de grandeur** de
 * l'aquariophilie (tropical 25, bassin extérieur 18, paludarium 22, récif 26). Le type
 * impose une entrée pour tout nouvel environnement.
 */
export const WATER_TEMPERATURES: Readonly<Record<EnvironmentId, number>> = {
  tropical: 25,
  bassin: 18,
  paludarium: 22,
  recif: 26,
};

/** Bornes de la consigne du chauffage, en °C (issue #207). */
export const MIN_HEATER_TEMPERATURE = 16;
export const MAX_HEATER_TEMPERATURE = 32;

/**
 * Température visée par l'eau `water` d'un bac de l'environnement `environment` : la consigne
 * du chauffage si elle est réglée, sinon la température de l'environnement.
 */
export function targetTemperature(water: WaterState, environment: EnvironmentId): number {
  return water.heater ?? WATER_TEMPERATURES[environment];
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
 * Ammoniaque produite par seconde, en unités de jeu, par unité de charge et par litre.
 * **Valeur de jeu** : la population par défaut du bac tropical (24 habitants, charge ≈ 45
 * dans 288 L) fait monter les nitrates d'environ 50 unités en deux heures simulées sans
 * changement d'eau (six journées de 20 min).
 */
export const AMMONIA_PER_LOAD_LITER = 0.045;

/** Taux de conversion de l'ammoniaque en nitrites par un filtre neuf, en s⁻¹ (≈ 2 min). */
export const AMMONIA_CONVERSION = 1 / 120;

/** Taux de conversion des nitrites en nitrates par un filtre neuf, en s⁻¹ (≈ 3 min). */
export const NITRITE_CONVERSION = 1 / 180;

/** Constante de temps du retour de la température à celle de l'environnement, en s. */
export const TEMPERATURE_TIME_CONSTANT = 600;

/** Part des composés dissous retirée par un changement d'eau. */
export const WATER_CHANGE_SHARE = 0.3;

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
 * Charge des habitants `entities` : somme des cubes de `bodyLength / REFERENCE_BODY_LENGTH`
 * (la masse, donc les déchets, croît comme le cube de la taille). Aucune allocation.
 */
export function waterLoad(entities: readonly { readonly species: SpeciesId }[]): number {
  let load = 0;
  for (const entity of entities) {
    const r = SPECIES[entity.species].bodyLength / REFERENCE_BODY_LENGTH;
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
  const produced = ((AMMONIA_PER_LOAD_LITER * load) / liters) * dt;
  water.ammonia = clampConcentration(water.ammonia - toNitrite + produced);
  water.nitrite = clampConcentration(water.nitrite + toNitrite - toNitrate);
  water.nitrate = clampConcentration(water.nitrate + toNitrate);
  const follow = 1 - Math.exp(-dt / TEMPERATURE_TIME_CONSTANT);
  water.temperature = clamp(
    water.temperature + (temperature - water.temperature) * follow,
    MIN_WATER_TEMPERATURE,
    MAX_WATER_TEMPERATURE,
  );
  water.filter = filter;
  water.ph = stepPh(water.ph, dt, load, liters);
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
  return stepWaterInPlace({ ...water }, dt, load, liters, temperature);
}

/**
 * Changement d'eau **en modifiant** `water`, bac de l'environnement `environment` : retire
 * `WATER_CHANGE_SHARE` de chaque composé dissous (nitrates, et aussi ammoniaque et nitrites,
 * dilués de même) et rapproche d'autant le pH de celui de l'eau neuve (`FRESH_PH`, issue
 * #236). La température et le filtre ne changent pas (eau neuve à la température du bac).
 * Renvoie `water`.
 */
export function changeWaterInPlace(
  water: MutableWaterState,
  environment: EnvironmentId,
): MutableWaterState {
  const keep = 1 - WATER_CHANGE_SHARE;
  water.ammonia *= keep;
  water.nitrite *= keep;
  water.nitrate *= keep;
  water.ph = phAfterWaterChange(water.ph, freshPh(environment), WATER_CHANGE_SHARE);
  return water;
}

/** Comme `changeWaterInPlace`, sur une copie : `water` n'est jamais modifié. */
export function changeWater(water: WaterState, environment: EnvironmentId): WaterState {
  return changeWaterInPlace({ ...water }, environment);
}

/** Résultat de `readWater`. */
export type ReadWaterResult =
  | { readonly ok: true; readonly water: WaterState }
  | { readonly ok: false; readonly error: string };

/**
 * Relit un état d'eau venu d'une sauvegarde d'un bac de l'environnement `environment` : objet
 * aux cinq champs numériques finis et bornés, plus la consigne du chauffage facultative
 * (`heater`, issue #207 : absente, jamais réglée) et le pH facultatif (`ph`, issue #236 :
 * absent dans une sauvegarde antérieure, il reprend celui de l'eau neuve de
 * l'environnement) ; seules les propriétés propres sont lues, les champs inconnus ignorés.
 * Renvoie une copie, ou la raison du refus. Ne lève jamais.
 */
export function readWater(value: unknown, environment: EnvironmentId): ReadWaterResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: 'eau : doit être un objet' };
  }
  const record = value as Record<string, unknown>;
  const read = (key: keyof WaterState): unknown =>
    Object.hasOwn(record, key) ? record[key] : undefined;
  const fields: [Exclude<keyof WaterState, 'ph' | 'heater'>, number, number][] = [
    ['temperature', MIN_WATER_TEMPERATURE, MAX_WATER_TEMPERATURE],
    ['ammonia', 0, MAX_CONCENTRATION],
    ['nitrite', 0, MAX_CONCENTRATION],
    ['nitrate', 0, MAX_CONCENTRATION],
    ['filter', 0, 1],
  ];
  for (const [key, min, max] of fields) {
    if (!isIn(read(key), min, max)) {
      return { ok: false, error: `eau : ${key} doit être un nombre dans [${min}, ${max}]` };
    }
  }
  const heater = read('heater');
  if (heater !== undefined && !isIn(heater, MIN_HEATER_TEMPERATURE, MAX_HEATER_TEMPERATURE)) {
    return {
      ok: false,
      error: `eau : heater doit être un nombre dans [${MIN_HEATER_TEMPERATURE}, ${MAX_HEATER_TEMPERATURE}]`,
    };
  }
  const ph = read('ph');
  if (ph !== undefined && !isIn(ph, MIN_PH, MAX_PH)) {
    return { ok: false, error: `eau : ph doit être un nombre dans [${MIN_PH}, ${MAX_PH}]` };
  }
  return {
    ok: true,
    water: {
      temperature: read('temperature') as number,
      ammonia: read('ammonia') as number,
      nitrite: read('nitrite') as number,
      nitrate: read('nitrate') as number,
      filter: read('filter') as number,
      ph: (ph as number | undefined) ?? freshPh(environment),
      ...(heater === undefined ? {} : { heater }),
    },
  };
}

function isIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Concentration ramenée dans [0, `MAX_CONCENTRATION`] (un résidu négatif d'arrondi vaut 0). */
function clampConcentration(v: number): number {
  return clamp(v, 0, MAX_CONCENTRATION);
}
