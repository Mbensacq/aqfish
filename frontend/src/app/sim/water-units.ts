/**
 * Unités des composés azotés de l'eau (issue #793, ADR 0167) : ammoniaque totale, nitrites et
 * nitrates sont en **mg/L**, comme sur les kits de test et dans `docs/SOINS.md`.
 *
 * Jusqu'au schéma 2 des sauvegardes, ils étaient en « unités de jeu ». Le passage aux mg/L
 * multiplie chaque composé par un facteur fixe (`MG_PER_LITER_PER_GAME_UNIT`), choisi parmi les
 * puissances de deux : la multiplication est exacte en virgule flottante, donc la dynamique de
 * l'eau est celle d'avant au bit près, à ce facteur près (testé), et une valeur relue d'un
 * ancien document puis réécrite dans l'ancien format ne bouge pas.
 *
 * Facteurs (approximations de jeu, bornées par les sources de `docs/SOINS.md`) :
 * - ammoniaque × 0,5 : seuil « à surveiller » 1 mg/L (« 1 mg/L d'ammoniaque totale […]
 *   dangereux dans un bac de guppys à pH 8 », § 6), « mauvaise » 2,5 mg/L (tolérance TAN
 *   < 2,0 mg/L, Loh 2015) ;
 * - nitrites × 0,125 : « à surveiller » 0,25 mg/L (toxiques dès 0,1 mg/L, § 1), « mauvaise »
 *   0,625 mg/L (tolérance < 0,5 mg/L, Loh 2015) ;
 * - nitrates × 1 : les anciens seuils (20 et 40) étaient déjà ceux des mg/L (< 10 idéal,
 *   < 70–110 toléré, Loh 2015).
 *
 * Module de données, sans dépendance : lu par `sim/water.ts` et les sauvegardes.
 */

/** Composé azoté dissous, en mg/L. */
export type NitrogenCompound = 'ammonia' | 'nitrite' | 'nitrate';

/** Composés azotés, dans l'ordre d'affichage. */
export const NITROGEN_COMPOUNDS: readonly NitrogenCompound[] = ['ammonia', 'nitrite', 'nitrate'];

/** mg/L correspondant à une ancienne unité de jeu, par composé (puissances de deux, exactes). */
export const MG_PER_LITER_PER_GAME_UNIT: Readonly<Record<NitrogenCompound, number>> = {
  ammonia: 0.5,
  nitrite: 0.125,
  nitrate: 1,
};

/** Ancien plafond commun des concentrations, en unités de jeu (schémas 1 et 2). */
export const LEGACY_MAX_CONCENTRATION = 100;

/**
 * Plafond de chaque composé, en mg/L : l'ancien plafond converti. Approximation de jeu : bien
 * au-delà des seuils « mauvaise », il ne sert qu'à garder des valeurs finies.
 */
export const MAX_CONCENTRATIONS: Readonly<Record<NitrogenCompound, number>> = {
  ammonia: LEGACY_MAX_CONCENTRATION * MG_PER_LITER_PER_GAME_UNIT.ammonia,
  nitrite: LEGACY_MAX_CONCENTRATION * MG_PER_LITER_PER_GAME_UNIT.nitrite,
  nitrate: LEGACY_MAX_CONCENTRATION * MG_PER_LITER_PER_GAME_UNIT.nitrate,
};

/**
 * mg/L de nitrites formés par mg/L d'ammoniaque convertie. Approximation de jeu, qui garde la
 * dynamique d'avant (une unité d'ammoniaque donnait une unité de nitrites) ; la stœchiométrie
 * réelle n'est pas modélisée.
 */
export const NITRITE_PER_AMMONIA =
  MG_PER_LITER_PER_GAME_UNIT.nitrite / MG_PER_LITER_PER_GAME_UNIT.ammonia;

/** mg/L de nitrates formés par mg/L de nitrites convertis (même convention). */
export const NITRATE_PER_NITRITE =
  MG_PER_LITER_PER_GAME_UNIT.nitrate / MG_PER_LITER_PER_GAME_UNIT.nitrite;

/**
 * Recalage du cycle de l'azote sur le jour de jeu (issue #805, ADR 0170) : facteur appliqué à
 * la production d'ammoniaque (au repos, repas, nourriture et corps qui pourrissent), aux
 * vitesses de conversion du filtre et à la dérive du pH. Tout le cycle se déroule ainsi huit
 * fois plus lentement qu'avant, aux mêmes concentrations d'équilibre : l'entretien et la
 * maturation du filtre, comptés en jours de 20 minutes, retrouvent des ordres de grandeur
 * réels (le bac tropical par défaut prend environ 1 mg/L de nitrates par jour de jeu au lieu
 * de 8). **Approximation de jeu** ; puissance de deux, donc multiplication exacte.
 */
export const NITROGEN_DAY_SCALE = 1 / 8;
