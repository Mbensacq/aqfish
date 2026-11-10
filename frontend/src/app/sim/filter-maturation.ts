import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import type { MutableWaterState, WaterState } from './water';

/**
 * Maturation du filtre biologique d'un bac neuf (issue #538, ADR 0123) : un bac ajouté par le
 * joueur démarre avec un filtre presque vide de bactéries nitrifiantes, qui se peuple seul en 6
 * à 8 semaines simulées (`docs/SOINS.md` § 2, « Cyclage », UF/IFAS FA16). Pur et déterministe :
 * aucun hasard, aucune horloge, aucune allocation par pas.
 *
 * Modèle : croissance logistique de l'efficacité `f` du filtre, `df/dt = r · f · (1 − f)`,
 * intégrée sous sa forme exacte (stable quel que soit le pas). Une colonie bactérienne croît
 * d'abord vite puis plafonne : le filtre reste faible les premières semaines, puis devient
 * efficace. Le taux `r` est choisi pour aller de `NEW_TANK_FILTER` à `FILTER_MATURE_AT` en
 * `FILTER_MATURATION_DAYS` journées : efficace à 90 % vers 5,5 semaines, à 95 % vers 6 semaines,
 * mûr à 8 semaines. La forme logistique, le filtre de départ et le seuil « mûr » sont des
 * **approximations de jeu** ; la durée reprend la source.
 *
 * Simplification : la croissance ne dépend ni de l'ammoniaque disponible ni de l'oxygène (un vrai
 * cyclage sans poisson demande une source d'ammoniaque). Seule l'amorce de bactéries
 * (`sim/bacteria-starter.ts`) l'accélère.
 *
 * Portée : seule une eau marquée `cycling` mûrit. Les bacs créés par le jeu au démarrage et
 * toutes les sauvegardes antérieures (sans ce champ) gardent leur filtre tel quel.
 */

/** Efficacité du filtre d'un bac ajouté par le joueur. Approximation de jeu. */
export const NEW_TANK_FILTER = 0.05;
/** Efficacité à partir de laquelle le filtre est déclaré mûr (ramené à 1). Approximation de jeu. */
export const FILTER_MATURE_AT = 0.99;
/** Durée de maturation sans aide, en journées simulées : 8 semaines (UF/IFAS FA16 : 6 à 8). */
export const FILTER_MATURATION_DAYS = 56;
/** Plancher de la croissance : quelques bactéries restent toujours (un filtre à 0 repart). */
export const FILTER_SEED = 0.01;

/**
 * Taux de croissance logistique `r`, par seconde simulée : `logit(FILTER_MATURE_AT) −
 * logit(NEW_TANK_FILTER)` réparti sur `FILTER_MATURATION_DAYS` journées.
 */
export const FILTER_GROWTH_RATE =
  (logit(FILTER_MATURE_AT) - logit(NEW_TANK_FILTER)) /
  (FILTER_MATURATION_DAYS * DEFAULT_DAY_LENGTH_SECONDS);

function logit(p: number): number {
  return Math.log(p / (1 - p));
}

/** Vrai si le filtre de `water` est en cours de maturation. */
export function isFilterCycling(water: Pick<WaterState, 'cycling'>): boolean {
  return water.cycling === true;
}

/** Met l'eau d'un bac neuf, **en la modifiant** : filtre presque vide, marqué en maturation. */
export function startFilterCyclingInPlace(water: MutableWaterState): void {
  water.filter = NEW_TANK_FILTER;
  water.cycling = true;
}

/**
 * Un pas de `dt` secondes de maturation du filtre de `water`, **en le modifiant**. Sans marque
 * `cycling`, ne fait rien. Une fois `FILTER_MATURE_AT` atteint (seul ou grâce à l'amorce), le
 * filtre vaut 1 et la marque disparaît. `dt` est validé par `stepWaterInPlace`.
 */
export function stepFilterMaturationInPlace(water: MutableWaterState, dt: number): void {
  if (water.cycling !== true) {
    return;
  }
  const f = Math.max(FILTER_SEED, Math.min(1, water.filter));
  const grow = Math.exp(FILTER_GROWTH_RATE * dt);
  const next = (f * grow) / (1 - f + f * grow);
  if (next >= FILTER_MATURE_AT) {
    water.filter = 1;
    delete water.cycling;
  } else {
    water.filter = next;
  }
}

/** Avancement affiché de la maturation, en pour cent entier dans [0, 100]. */
export function filterMaturityPercent(water: Pick<WaterState, 'filter'>): number {
  const f = Number.isFinite(water.filter) ? Math.min(1, Math.max(0, water.filter)) : 0;
  // Epsilon : 0,29 · 100 vaut 28,999… en virgule flottante.
  return Math.floor(f * 100 + 1e-9);
}
