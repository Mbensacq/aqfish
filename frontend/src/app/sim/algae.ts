import { assertSeed, createPrng, deriveSeed } from '../core/random/prng';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import type { EnvironmentId } from './environment';
import type { Box3 } from './tank';
import { assertTimeStep } from './time-step';

/**
 * Algues vertes du bac (issue #476, ADR 0109) : des plaques fixes sur les vitres, dont la
 * couverture (dans [0, 1]) croît avec la durée d'éclairage et les nitrates, et que la raclette
 * remet à zéro. Fonctions pures et déterministes : l'emplacement, la taille et la vigueur de
 * chaque plaque viennent de la graine du monde, la croissance du pas fixe, jamais d'horloge.
 *
 * Règles (**approximations de jeu**, `docs/SOINS.md` § 12) :
 * - **lumière** : aucune pousse sans lumière ; au-delà de `ALGAE_LIGHT_LIMIT_HOURS` heures
 *   par jour, l'excès de lumière fait pousser les algues, d'autant plus que la durée approche
 *   24 h ;
 * - **nitrates** : au-delà du seuil « à surveiller » de la jauge (`ALGAE_NITRATE_LIMIT`),
 *   l'excès de nitrates fait pousser les algues, à plein au plein de la jauge ;
 * - à éclairage normal (8 h, valeur par défaut) et eau propre, la pousse est nulle : le bac par
 *   défaut n'a jamais d'algues (captures inchangées) ;
 * - une plaque ne recule pas seule : seule la raclette la retire ; le changement d'eau n'y
 *   touche pas (il agit sur la cause, les nitrates).
 *
 * L'état tient dans l'eau du bac (`WaterState.algae`, `WaterState.lighting`), comme la consigne
 * du chauffage : il est donc enregistré et copié avec elle. Absents, aucune algue et un
 * éclairage de `DEFAULT_LIGHTING_HOURS`.
 */

/** Nombre de plaques d'algues d'un bac. */
export const ALGAE_PATCH_COUNT = 8;

/** Durée d'éclairage par défaut, en heures par jour (approximation de jeu). */
export const DEFAULT_LIGHTING_HOURS = 8;
/** Bornes de la durée d'éclairage, en heures par jour. */
export const MIN_LIGHTING_HOURS = 0;
export const MAX_LIGHTING_HOURS = 24;

/**
 * Durée d'éclairage au-delà de laquelle les algues poussent, en heures par jour. Ordre de
 * grandeur courant de l'aquariophilie (8 à 10 h conseillées) : **non vérifié** dans une
 * source primaire, approximation de jeu.
 */
export const ALGAE_LIGHT_LIMIT_HOURS = 10;

/**
 * Nitrates au-delà desquels les algues poussent, en unités de jeu : le seuil « à surveiller »
 * de la jauge (`COMPOUND_THRESHOLDS.nitrate.watch`, `sim/water-quality.ts`, vérifié par test).
 */
export const ALGAE_NITRATE_LIMIT = 20;
/** Nitrates d'une pousse à plein, en unités de jeu : le plein de la jauge (`GAUGE_MAX`). */
export const ALGAE_NITRATE_FULL = 60;

/**
 * Durée, en jours simulés (`DEFAULT_DAY_LENGTH_SECONDS`), pour qu'une plaque de vigueur 1
 * passe de 0 à couverture pleine à pousse maximale (approximation de jeu).
 */
export const ALGAE_FULL_DAYS = 2;

/** Vigueur d'une plaque : facteur de sa pousse, tiré de la graine dans cet intervalle. */
export const ALGAE_VIGOR_MIN = 0.6;
export const ALGAE_VIGOR_MAX = 1.4;

/** Couverture moyenne d'une prolifération (alerte « attention »). */
export const ALGAE_WATCH_COVERAGE = 0.25;
/** Couverture moyenne d'une prolifération grave (alerte « critique »). */
export const ALGAE_BAD_COVERAGE = 0.6;

/** Couverture en dessous de laquelle une plaque n'est pas dessinée (encore invisible). */
export const ALGAE_VISIBLE_COVERAGE = 0.05;

/** Rayon d'une plaque à couverture pleine, en mètres. */
export const ALGAE_RADIUS_MIN = 0.05;
export const ALGAE_RADIUS_MAX = 0.09;

/** Portée de la raclette autour du rayon visé, en mètres (en plus du rayon de la plaque). */
export const SCRAPER_REACH = 0.02;

/** Vitre portant une plaque. Le devant du bac est du côté des z positifs. */
export type AlgaeWall = 'fond' | 'gauche' | 'droite' | 'devant';

/**
 * Vitre de chaque plaque, dans l'ordre : surtout le fond et les côtés ; deux plaques devant,
 * près du sable, pour ne pas masquer le bac en vue de face.
 */
export const ALGAE_WALLS: readonly AlgaeWall[] = [
  'fond',
  'gauche',
  'droite',
  'fond',
  'devant',
  'fond',
  'droite',
  'devant',
];

/** Plaque d'algues : centre sur la face intérieure d'une vitre, rayon à couverture pleine. */
export interface AlgaePatch {
  readonly wall: AlgaeWall;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  /** Facteur de pousse, dans [`ALGAE_VIGOR_MIN`, `ALGAE_VIGOR_MAX`]. */
  readonly vigor: number;
}

/** Sel du sous-générateur des algues (distinct de ceux des poissons et du décor). */
const ALGAE_SALT = 0xa16e;

/** Environnements où les algues poussent : bacs vitrés d'eau douce (ni bassin, ni récif). */
const ALGAE_ENVIRONMENTS: readonly EnvironmentId[] = ['tropical', 'paludarium', 'eaufroide'];

/** Vrai si les algues poussent dans un bac de l'environnement `environment`. */
export function hasAlgae(environment: EnvironmentId): boolean {
  return ALGAE_ENVIRONMENTS.includes(environment);
}

/**
 * Plaques d'un bac de graine `seed` et de volume d'eau `water`, dans l'ordre de
 * `ALGAE_WALLS` : chacune tient entière sur sa vitre, sous la surface et au-dessus du sable ;
 * celles de devant restent dans le tiers bas. Même graine et même volume : mêmes plaques.
 * @throws RangeError si la graine n'est pas un entier 32 bits non signé.
 */
export function algaePatches(seed: number, water: Box3): readonly AlgaePatch[] {
  const prng = createPrng(deriveSeed(assertSeed(seed), ALGAE_SALT));
  const height = water.maxY - water.minY;
  return ALGAE_WALLS.map((wall) => {
    const radius = lerp(ALGAE_RADIUS_MIN, ALGAE_RADIUS_MAX, prng.next());
    const r = Math.min(radius, height / 2);
    const u = prng.next();
    const v = prng.next();
    const vigor = lerp(ALGAE_VIGOR_MIN, ALGAE_VIGOR_MAX, prng.next());
    const top = wall === 'devant' ? water.minY + Math.max(r, height / 3) : water.maxY - r;
    const y = lerp(water.minY + r, Math.max(water.minY + r, top), v);
    const along = (min: number, max: number) => lerp(min + r, Math.max(min + r, max - r), u);
    switch (wall) {
      case 'fond':
        return { wall, x: along(water.minX, water.maxX), y, z: water.minZ, radius: r, vigor };
      case 'devant':
        return { wall, x: along(water.minX, water.maxX), y, z: water.maxZ, radius: r, vigor };
      case 'gauche':
        return { wall, x: water.minX, y, z: along(water.minZ, water.maxZ), radius: r, vigor };
      case 'droite':
        return { wall, x: water.maxX, y, z: along(water.minZ, water.maxZ), radius: r, vigor };
    }
  });
}

let cachedSeed = -1;
let cachedWater: Box3 | null = null;
let cachedPatches: readonly AlgaePatch[] = [];

/**
 * Comme `algaePatches`, avec un cache d'une entrée (graine et bornes du volume) : la boucle
 * de simulation et le rendu le relisent à chaque pas sans allouer.
 */
export function cachedAlgaePatches(seed: number, water: Box3): readonly AlgaePatch[] {
  const c = cachedWater;
  if (
    seed !== cachedSeed ||
    c === null ||
    c.minX !== water.minX ||
    c.maxX !== water.maxX ||
    c.minY !== water.minY ||
    c.maxY !== water.maxY ||
    c.minZ !== water.minZ ||
    c.maxZ !== water.maxZ
  ) {
    cachedPatches = algaePatches(seed, water);
    cachedSeed = seed;
    cachedWater = { ...water };
  }
  return cachedPatches;
}

/**
 * Pousse des algues, dans [0, 1], pour une durée d'éclairage `hours` (heures par jour) et des
 * nitrates `nitrate` (unités de jeu) : nulle sans lumière, nulle à éclairage normal et eau
 * propre, pleine à 24 h d'éclairage ou au plein de la jauge des nitrates. Une valeur non
 * finie ou négative compte pour zéro (aucune pousse fantôme).
 */
export function algaeGrowth(hours: number, nitrate: number): number {
  const light = finite(hours);
  if (light <= 0) {
    return 0;
  }
  const lightFactor = Math.min(1, light / DEFAULT_LIGHTING_HOURS);
  const lightExcess = clamp01(
    (light - ALGAE_LIGHT_LIMIT_HOURS) / (MAX_LIGHTING_HOURS - ALGAE_LIGHT_LIMIT_HOURS),
  );
  const nitrateExcess = clamp01(
    (finite(nitrate) - ALGAE_NITRATE_LIMIT) / (ALGAE_NITRATE_FULL - ALGAE_NITRATE_LIMIT),
  );
  return lightFactor * Math.min(1, lightExcess + nitrateExcess);
}

/** Durée d'éclairage d'une eau : sa valeur réglée, ou `DEFAULT_LIGHTING_HOURS`. */
export function lightingOf(water: { readonly lighting?: number }): number {
  return water.lighting ?? DEFAULT_LIGHTING_HOURS;
}

/** Ce que les algues lisent et écrivent dans l'eau. */
export interface AlgaeWater {
  nitrate: number;
  lighting?: number;
  algae?: readonly number[];
}

/**
 * Avance les algues d'un pas `dt`, **en modifiant** `water` : chaque plaque gagne
 * `pousse × vigueur × dt / (ALGAE_FULL_DAYS jours)`, plafonnée à 1. Sans pousse, rien n'est
 * écrit (une eau sans algues reste sans champ `algae`). Renvoie `water`.
 * @throws RangeError si `dt` n’est pas un pas valide.
 */
export function stepAlgaeInPlace<T extends AlgaeWater>(
  water: T,
  dt: number,
  patches: readonly AlgaePatch[],
): T {
  assertTimeStep(dt);
  const growth = algaeGrowth(lightingOf(water), water.nitrate);
  if (growth <= 0) {
    return water;
  }
  const rate = (growth * dt) / (ALGAE_FULL_DAYS * DEFAULT_DAY_LENGTH_SECONDS);
  const cover = (water.algae as number[] | undefined) ?? new Array<number>(patches.length).fill(0);
  for (let i = 0; i < patches.length; i++) {
    cover[i] = Math.min(1, (cover[i] ?? 0) + rate * patches[i].vigor);
  }
  water.algae = cover;
  return water;
}

/**
 * Couverture moyenne des `ALGAE_PATCH_COUNT` plaques du bac, dans [0, 1] (0 sans algues, non
 * fini si l'état l'est). Moyenne sur le nombre de plaques, pas sur la longueur de la liste
 * (#488) : une valeur absente (sauvegarde courte) compte pour une plaque nue ; au-delà de
 * `ALGAE_PATCH_COUNT`, les valeurs en trop sont ignorées.
 */
export function algaeCoverage(algae: readonly number[] | undefined): number {
  if (algae === undefined) {
    return 0;
  }
  const n = Math.min(algae.length, ALGAE_PATCH_COUNT);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += algae[i];
  }
  return sum / ALGAE_PATCH_COUNT;
}

/** Niveau d'une prolifération, d'après la couverture moyenne. */
export type AlgaeLevel = 'aucune' | 'proliferation' | 'grave';

/** Niveau de la couverture moyenne `coverage` (non finie : grave, jamais rassurant). */
export function algaeLevel(coverage: number): AlgaeLevel {
  if (!Number.isFinite(coverage) || coverage >= ALGAE_BAD_COVERAGE) {
    return 'grave';
  }
  return coverage >= ALGAE_WATCH_COVERAGE ? 'proliferation' : 'aucune';
}

/**
 * Plaque visible (couverture d'au moins `ALGAE_VISIBLE_COVERAGE`) touchée la première par le
 * rayon (`origin`, `direction`, repère du bac) : celle dont le centre est à moins de son
 * rayon dessiné plus `SCRAPER_REACH` du rayon, la plus proche de l'origine. `-1` : aucune.
 */
export function scrapedPatch(
  patches: readonly AlgaePatch[],
  algae: readonly number[] | undefined,
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
): number {
  if (algae === undefined) {
    return -1;
  }
  const [dx, dy, dz] = direction;
  const length = Math.hypot(dx, dy, dz);
  if (!(length > 0) || !Number.isFinite(length)) {
    return -1;
  }
  let best = -1;
  let bestT = Infinity;
  for (let i = 0; i < patches.length; i++) {
    const cover = algae[i] ?? 0;
    if (!(cover >= ALGAE_VISIBLE_COVERAGE)) {
      continue;
    }
    const p = patches[i];
    const px = p.x - origin[0];
    const py = p.y - origin[1];
    const pz = p.z - origin[2];
    const t = (px * dx + py * dy + pz * dz) / length;
    if (t <= 0) {
      continue;
    }
    const distance = Math.sqrt(Math.max(0, px * px + py * py + pz * pz - t * t));
    if (distance <= drawnRadius(p, cover) + SCRAPER_REACH && t < bestT) {
      best = i;
      bestT = t;
    }
  }
  return best;
}

/** Rayon de la caméra, repère du bac : origine et direction. */
export interface ScraperRay {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

/**
 * Plaques touchées par un passage de raclette (#604) : la trajectoire est la suite des rayons
 * `rays` (un par point du geste), chacun retirant la plaque visible qu'il touche la première
 * (`scrapedPatch`, portée `SCRAPER_REACH`). Une plaque retirée ne compte qu'une fois et ne
 * cache plus celle qui est derrière. Indices dans l'ordre du passage ; ne modifie rien.
 */
export function scrapedPatchesAlong(
  patches: readonly AlgaePatch[],
  algae: readonly number[] | undefined,
  rays: readonly ScraperRay[],
): number[] {
  const touched: number[] = [];
  if (algae === undefined) {
    return touched;
  }
  const cover = [...algae];
  for (const ray of rays) {
    const index = scrapedPatch(patches, cover, ray.origin, ray.direction);
    if (index >= 0) {
      touched.push(index);
      cover[index] = 0;
    }
  }
  return touched;
}

/** Nombre de plaques visibles (couverture d'au moins `ALGAE_VISIBLE_COVERAGE`). */
export function visibleAlgaeCount(algae: readonly number[] | undefined): number {
  return algae === undefined ? 0 : algae.filter((c) => c >= ALGAE_VISIBLE_COVERAGE).length;
}

/** Rayon dessiné d'une plaque de couverture `cover` : croît comme la racine de la surface. */
export function drawnRadius(patch: AlgaePatch, cover: number): number {
  return patch.radius * Math.sqrt(clamp01(cover));
}

/**
 * Raclette, **en modifiant** `water` : la plaque `index` est remise à zéro ; s'il ne reste
 * aucune algue, le champ `algae` est retiré (eau d'avant, sauvegarde inchangée). Renvoie
 * vrai si une plaque a été retirée. Ne touche ni aux poissons ni au reste de l'eau.
 */
export function scrapeAlgaeInPlace(water: AlgaeWater, index: number): boolean {
  const cover = water.algae as number[] | undefined;
  if (cover === undefined || !Number.isInteger(index) || !(cover[index] > 0)) {
    return false;
  }
  cover[index] = 0;
  if (cover.every((c) => c === 0)) {
    delete water.algae;
  }
  return true;
}

/**
 * Règle la durée d'éclairage, **en modifiant** `water`, arrondie à l'heure ; la valeur par
 * défaut n'est pas écrite (sauvegardes inchangées). Renvoie faux, sans rien changer, hors de
 * [`MIN_LIGHTING_HOURS`, `MAX_LIGHTING_HOURS`].
 */
export function setLightingInPlace(water: AlgaeWater, hours: number): boolean {
  if (!Number.isFinite(hours) || hours < MIN_LIGHTING_HOURS || hours > MAX_LIGHTING_HOURS) {
    return false;
  }
  const rounded = Math.round(hours);
  if (rounded === DEFAULT_LIGHTING_HOURS) {
    delete water.lighting;
  } else {
    water.lighting = rounded;
  }
  return true;
}

/** Résultat de `readAlgae`. */
export type ReadAlgaeResult =
  | { readonly ok: true; readonly algae: readonly number[] }
  | { readonly ok: false; readonly error: string };

/**
 * Relit les couvertures enregistrées : tableau d'au plus `ALGAE_PATCH_COUNT` réels dans
 * [0, 1]. Renvoie une copie, ou la raison du refus. Ne lève jamais.
 */
export function readAlgae(value: unknown): ReadAlgaeResult {
  if (
    !Array.isArray(value) ||
    value.length > ALGAE_PATCH_COUNT ||
    !value.every((c) => typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= 1)
  ) {
    return {
      ok: false,
      error: `eau : algae doit être une liste d’au plus ${ALGAE_PATCH_COUNT} nombres dans [0, 1]`,
    };
  }
  return { ok: true, algae: [...(value as number[])] };
}

/**
 * Algues d'exemple (paramètre de capture `algues=`) : toutes les plaques à la couverture
 * `coverage`, ramenée dans [0, 1] ; `undefined` pour une couverture nulle ou non finie.
 */
export function sampleAlgae(coverage: number): number[] | undefined {
  const c = clamp01(finite(coverage));
  return c > 0 ? new Array<number>(ALGAE_PATCH_COUNT).fill(c) : undefined;
}

function finite(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
