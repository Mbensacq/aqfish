import { SIM_DT } from './constants';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { SPECIES, type SpeciesId } from './species';
import type { MutableWaterState } from './water';
import type { Entity, Mutable, MutableWorld } from './world-types';

/**
 * Saisons du bassin extérieur (issue #858, ADR 0186). Le bassin à koïs n'a pas de chauffage :
 * sa température ambiante suit une courbe annuelle lente, comptée en jours de jeu
 * (`DEFAULT_DAY_LENGTH_SECONDS`, comme l'azote, ADR 0170), et l'eau la suit avec la constante
 * de temps habituelle (`sim/water.ts`). Sous `COLD_ACTIVE_TEMPERATURE`, les koïs et les
 * poissons rouges ralentissent, se tiennent au fond et mangent moins.
 *
 * Pur, sans hasard ni allocation. Les autres environnements ne passent par aucun calcul de ce
 * module : leur état reste identique au bit près. Valeurs : **approximations de jeu** pour un
 * bassin de jardin en climat tempéré (France), à défaut d'une source unique.
 */

/** Jours d'une année de jeu. */
export const DAYS_PER_YEAR = 365;

/** Jour de l'année (0 = 1er janvier) au temps 0 du monde : le 19 mai, eau proche de 18 °C. */
export const START_DAY_OF_YEAR = 138;

/** Jour de l'année le plus chaud (fin juillet) ; le plus froid tombe six mois plus tôt. */
export const WARMEST_DAY_OF_YEAR = 205;

/** Température ambiante moyenne de l'année, en °C. */
export const MEAN_POND_TEMPERATURE = 14;

/** Demi-écart entre l'été et l'hiver, en °C : de 4 °C en janvier à 24 °C en juillet. */
export const POND_TEMPERATURE_SWING = 10;

/** Température minimale (hiver) et maximale (été) de la courbe, en °C. */
export const MIN_POND_TEMPERATURE = MEAN_POND_TEMPERATURE - POND_TEMPERATURE_SWING;
export const MAX_POND_TEMPERATURE = MEAN_POND_TEMPERATURE + POND_TEMPERATURE_SWING;

/**
 * Seuil d'activité, en °C : au-dessus, nage et appétit normaux. Consigne courante des
 * éleveurs de koïs (nourrir peu sous 10 °C), approximation de jeu.
 */
export const COLD_ACTIVE_TEMPERATURE = 10;

/** Température de repos hivernal, en °C : à et sous elle, repos complet et appétit plancher. */
export const COLD_DORMANT_TEMPERATURE = 5;

/** Appétit restant au repos hivernal, en part de l'appétit normal (la faim monte à peine). */
export const COLD_APPETITE_FLOOR = 0.1;

/** Variation journalière sous laquelle la tendance est dite stable, en °C par jour de jeu. */
export const STABLE_TREND_PER_DAY = 0.05;

/**
 * Espèces que le froid ralentit : poissons d'eau froide du bassin. Le type impose une entrée
 * pour toute nouvelle espèce.
 */
export const COLD_SLOWED: Readonly<Record<SpeciesId, boolean>> = {
  neon: false,
  guppy: false,
  corydora: false,
  koi: true,
  axolotl: false,
  grenouille: false,
  triton: false,
  clown: false,
  chirurgien: false,
  rasbora: false,
  tetra: false,
  kuhli: false,
  gourami: false,
  platy: false,
  danio: false,
  ancistrus: false,
  otocinclus: false,
  braise: false,
  molly: false,
  miel: false,
  chromis: false,
  gobie: false,
  gramma: false,
  crevette: false,
  blennie: false,
  xipho: false,
  cerise: false,
  neritine: false,
  // Poisson rouge : carpe d'eau froide comme la koï, même repos hivernal (approximation de jeu).
  rouge: true,
};

/** Saison d'un jour de l'année (saisons météorologiques de l'hémisphère nord). */
export type PondSeason = 'printemps' | 'ete' | 'automne' | 'hiver';

/** Sens de variation de la température ambiante. */
export type PondTrend = 'hausse' | 'baisse' | 'stable';

/** Premier jour (0 = 1er janvier) de chaque saison, hiver à cheval sur deux années. */
const SPRING_START = 59;
const SUMMER_START = 151;
const AUTUMN_START = 243;
const WINTER_START = 334;

/** Libellés affichés (texte en plus de la couleur). */
export const SEASON_LABELS: Readonly<Record<PondSeason, string>> = {
  printemps: 'printemps',
  ete: 'été',
  automne: 'automne',
  hiver: 'hiver',
};

export const TREND_LABELS: Readonly<Record<PondTrend, string>> = {
  hausse: 'l’eau se réchauffe',
  baisse: 'l’eau se refroidit',
  stable: 'température stable',
};

/** Pulsation de la courbe, en radians par jour. */
const ANGULAR_SPEED = (2 * Math.PI) / DAYS_PER_YEAR;

/**
 * Jour de l'année au temps `time` du monde (secondes), réel dans [0, `DAYS_PER_YEAR`[ (0 = 1er
 * janvier à minuit), à partir du jour `startDay` (`START_DAY_OF_YEAR` par défaut ; paramètre
 * de capture `saison=`, #864). Un temps non fini compte comme 0.
 */
export function dayOfYear(time: number, startDay = START_DAY_OF_YEAR): number {
  const elapsed = Number.isFinite(time) ? time / DEFAULT_DAY_LENGTH_SECONDS : 0;
  const day = (startDay + elapsed) % DAYS_PER_YEAR;
  return day < 0 ? day + DAYS_PER_YEAR : day;
}

/**
 * Température ambiante du bassin au jour `day` de l'année, en °C : sinusoïde de moyenne
 * `MEAN_POND_TEMPERATURE` et de demi-écart `POND_TEMPERATURE_SWING`, au plus haut le jour
 * `WARMEST_DAY_OF_YEAR`. Continue et lisse, y compris au passage d'une année à l'autre.
 */
export function pondTemperatureOnDay(day: number): number {
  return (
    MEAN_POND_TEMPERATURE +
    POND_TEMPERATURE_SWING * Math.cos(ANGULAR_SPEED * (day - WARMEST_DAY_OF_YEAR))
  );
}

/** Température ambiante du bassin au temps `time` du monde, en °C (`startDay` : `dayOfYear`). */
export function pondTemperature(time: number, startDay?: number): number {
  return pondTemperatureOnDay(dayOfYear(time, startDay));
}

/** Variation de la température ambiante au jour `day`, en °C par jour de jeu. */
export function pondTemperatureSlope(day: number): number {
  return (
    -POND_TEMPERATURE_SWING * ANGULAR_SPEED * Math.sin(ANGULAR_SPEED * (day - WARMEST_DAY_OF_YEAR))
  );
}

/** Saison du jour `day` de l'année (réel dans [0, `DAYS_PER_YEAR`[). */
export function seasonOfDay(day: number): PondSeason {
  if (day >= SPRING_START && day < SUMMER_START) {
    return 'printemps';
  }
  if (day >= SUMMER_START && day < AUTUMN_START) {
    return 'ete';
  }
  if (day >= AUTUMN_START && day < WINTER_START) {
    return 'automne';
  }
  return 'hiver';
}

/** Tendance de la température ambiante au jour `day` (`STABLE_TREND_PER_DAY`). */
export function trendOfDay(day: number): PondTrend {
  const slope = pondTemperatureSlope(day);
  if (Math.abs(slope) < STABLE_TREND_PER_DAY) {
    return 'stable';
  }
  return slope > 0 ? 'hausse' : 'baisse';
}

/** Saison, tendance et température ambiante du bassin au temps `time` (tableau de bord). */
export interface PondSeasonReadout {
  readonly season: PondSeason;
  readonly trend: PondTrend;
  /** Température ambiante, en °C, au dixième. */
  readonly ambient: number;
  /** Phrase affichée : « été, l’eau se réchauffe ». */
  readonly text: string;
}

/** Relevé de la saison du bassin au temps `time` du monde (`startDay` : `dayOfYear`). */
export function pondSeasonReadout(time: number, startDay?: number): PondSeasonReadout {
  const day = dayOfYear(time, startDay);
  const season = seasonOfDay(day);
  const trend = trendOfDay(day);
  return {
    season,
    trend,
    ambient: Math.round(pondTemperatureOnDay(day) * 10) / 10,
    text: `${SEASON_LABELS[season]}, ${TREND_LABELS[trend]}`,
  };
}

/** Saison affichée par le tableau de bord (issue #858). */
export interface DashboardSeason {
  readonly season: PondSeason;
  readonly trend: PondTrend;
  /** Mot affiché, capitale initiale : « Été ». */
  readonly label: string;
  /** Saison et tendance en toutes lettres : « été, l’eau se réchauffe ». */
  readonly text: string;
  /** Phrase lue et infobulle : « Saison : été, l’eau se réchauffe ». */
  readonly spoken: string;
}

/**
 * Saison du relevé de l'eau au pas `tick` (`world.tick`), ou `null` sans température ambiante
 * saisonnière (`ambient` absent : bac intérieur, saisons coupées). Pas non fini : `null`.
 * `seasonStartDay` : jour de l'année au temps 0 (`World.seasonStartDay`, capture `saison=`).
 */
export function dashboardSeason(sample: {
  readonly tick: number;
  readonly ambient?: number;
  readonly seasonStartDay?: number;
}): DashboardSeason | null {
  if (sample.ambient === undefined || !Number.isFinite(sample.tick)) {
    return null;
  }
  const { season, trend, text } = pondSeasonReadout(sample.tick * SIM_DT, sample.seasonStartDay);
  const word = SEASON_LABELS[season];
  return {
    season,
    trend,
    label: word.charAt(0).toUpperCase() + word.slice(1),
    text,
    spoken: `Saison : ${text}`,
  };
}

/**
 * Repos dû au froid d'une espèce dans une eau à `temperature` °C, dans [0, 1] : 0 à et
 * au-dessus de `COLD_ACTIVE_TEMPERATURE` (et pour une espèce que le froid ne ralentit pas, ou
 * une température non finie), 1 à et sous `COLD_DORMANT_TEMPERATURE`, linéaire entre les deux.
 * Même effet que le repos de nuit (`sim/day-rhythm.ts`) : nage ralentie, près du fond.
 */
export function coldRest(species: string, temperature: number): number {
  if (!Object.hasOwn(COLD_SLOWED, species) || !COLD_SLOWED[species as SpeciesId]) {
    return 0;
  }
  if (!Number.isFinite(temperature) || temperature >= COLD_ACTIVE_TEMPERATURE) {
    return 0;
  }
  const span = COLD_ACTIVE_TEMPERATURE - COLD_DORMANT_TEMPERATURE;
  return Math.min(1, (COLD_ACTIVE_TEMPERATURE - temperature) / span);
}

/**
 * Appétit d'une espèce dans une eau à `temperature` °C, en part de l'appétit normal, dans
 * [`COLD_APPETITE_FLOOR`, 1] : 1 sans repos dû au froid, `COLD_APPETITE_FLOOR` au repos
 * hivernal complet.
 */
export function coldAppetite(species: string, temperature: number): number {
  return 1 - (1 - COLD_APPETITE_FLOOR) * coldRest(species, temperature);
}

/**
 * Saison du pas, **en modifiant** `world` (issue #858) : au bassin seulement, pose la
 * température ambiante du temps courant (`ambient`, que l'eau suit ensuite) et retire à la
 * faim des poissons transis la part que leur appétit réduit ne prend pas (`coldAppetite`) ; la
 * faim, déjà montée pendant la nage, ne descend jamais sous 0. Ailleurs, ou saisons coupées
 * (`World.seasonsOff`, #864), ne fait rien.
 */
export function stepPondSeasonInPlace(world: MutableWorld, dt: number): void {
  if (world.environment !== 'bassin' || world.seasonsOff === true) {
    return;
  }
  const water = world.water as MutableWaterState;
  water.ambient = pondTemperature(world.time, world.seasonStartDay);
  const fishes = world.entities as Mutable<Entity>[];
  for (const fish of fishes) {
    const appetite = coldAppetite(fish.species, water.temperature);
    if (appetite < 1) {
      const skipped = (1 - appetite) * SPECIES[fish.species].feeding.hungerRate * dt;
      fish.hunger = Math.max(0, fish.hunger - skipped);
    }
  }
}

/** Vrai si `world` suit les saisons du bassin : le bassin, saisons non coupées (#864). */
export function hasPondSeasons(world: Pick<MutableWorld, 'environment' | 'seasonsOff'>): boolean {
  return world.environment === 'bassin' && world.seasonsOff !== true;
}

/**
 * Active ou coupe les saisons du bassin (issue #864), **en modifiant** `world`. Coupées : la
 * température ambiante saisonnière est retirée, l'eau revient vers les 18 °C fixes du bassin
 * (`WATER_TEMPERATURES`) à son rythme habituel. Rétablies au bassin : la température ambiante
 * du jour est posée tout de suite. Le drapeau est gardé hors du bassin (sans effet).
 */
export function setWorldSeasonsInPlace(world: MutableWorld, enabled: boolean): void {
  const water = world.water as MutableWaterState;
  if (!enabled) {
    world.seasonsOff = true;
    delete water.ambient;
    return;
  }
  delete world.seasonsOff;
  if (world.environment === 'bassin') {
    water.ambient = pondTemperature(world.time, world.seasonStartDay);
  }
}

/**
 * Jour de l'année de chaque saison pour le paramètre de capture `saison=` (#864) : le cœur de
 * la saison, au plus chaud pour l'été et au plus froid pour l'hiver.
 */
export const SEASON_CAPTURE_DAYS: Readonly<Record<PondSeason, number>> = {
  printemps: 113,
  ete: WARMEST_DAY_OF_YEAR,
  automne: 297,
  hiver: 22,
};

/** Vrai si `value` est une saison connue (`PondSeason`). */
export function isPondSeason(value: unknown): value is PondSeason {
  return typeof value === 'string' && Object.hasOwn(SEASON_CAPTURE_DAYS, value);
}

/**
 * Place le calendrier du bassin au cœur de la saison `season` (paramètre de capture `saison=`,
 * #864), **en modifiant** `world` : jour de l'année au temps 0 (`seasonStartDay`), puis
 * température ambiante et température de l'eau de ce jour, pour que la capture montre la
 * saison dès t = 0. Sans effet hors du bassin ou saisons coupées.
 */
export function setWorldSeasonInPlace(world: MutableWorld, season: PondSeason): void {
  if (!hasPondSeasons(world)) {
    return;
  }
  world.seasonStartDay = SEASON_CAPTURE_DAYS[season];
  const water = world.water as MutableWaterState;
  water.ambient = pondTemperature(world.time, world.seasonStartDay);
  water.temperature = water.ambient;
}
