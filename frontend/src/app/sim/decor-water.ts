import type { DecorItem } from './decor';
import type { EnvironmentId } from './environment';
import type { MutableWaterState } from './water';
import { isHardness, MAX_HARDNESS, tapHardness } from './water-hardness';

/**
 * Roches et bois qui agissent sur l'eau (issue #733, ADR 0181, `docs/ECOSYSTEME.md` § 2) :
 * - une roche **calcaire** se dissout lentement : elle relève la dureté carbonatée et générale
 *   (le carbonate de calcium apporte autant de l'une que de l'autre) et tire le pH vers
 *   `LIMESTONE_PH_TARGET` sans jamais le dépasser ; elle n'agit plus au-dessus de
 *   `LIMESTONE_INACTIVE_PH` ; vite avec beaucoup de surface et de courant, en quelques mois
 *   pour un bloc en eau calme (aquariumscience.org, « Rocks ») ;
 * - une roche **inerte** n'a aucun effet ; aucune roche n'acidifie l'eau ni ne filtre (même
 *   source : le jeu ne donne aucun bonus de filtration aux roches) ;
 * - le **bois flotté** libère des tanins et tire légèrement le pH vers `WOOD_PH_FLOOR`, comme
 *   les feuilles de catappa (`sim/catappa.ts`), sans se décomposer.
 *
 * Surface d'un élément : son échelle au carré (1 pour un élément à l'échelle 1). Courant : le
 * filtre (`WaterState.filter`), seul brassage simulé. Les taux sont des **approximations de
 * jeu** calées sur les ordres de grandeur de la source ; la dureté n'agit toujours ni sur la
 * santé ni sur le pH (ADR 0113).
 *
 * Fonctions pures, sans hasard ni horloge ; `stepDecorWaterInPlace` n'alloue rien.
 */

/**
 * pH vers lequel tire une roche calcaire : milieu haut des 7,6–7,9 de la source, qu'elle ne
 * dépasse jamais (aquariumscience.org).
 */
export const LIMESTONE_PH_TARGET = 7.8;

/** pH au-dessus duquel une roche calcaire ne se dissout plus (aquariumscience.org : 8,4). */
export const LIMESTONE_INACTIVE_PH = 8.4;

/**
 * Dureté carbonatée vers laquelle une roche calcaire mène l'eau, en °dKH. **Approximation de
 * jeu** : eau « moyennement dure », la dissolution ralentissant à l'approche de la saturation.
 */
export const LIMESTONE_KH_CEILING = 10;

/**
 * Taux d'action d'une roche calcaire à l'échelle 1, dans `DECOR_REFERENCE_LITERS` litres, filtre
 * en marche, en s⁻¹. **Approximation de jeu** : constante de temps de 60 jours de jeu (de
 * 1 200 s) dans le bac tropical par défaut ; quatre fois plus lente en eau calme
 * (`LIMESTONE_STILL_WATER_FACTOR`) : environ huit mois, les « quelques mois » de la source.
 */
export const LIMESTONE_RATE = 1 / 72_000;

/**
 * Part du taux d'une roche calcaire gardée sans courant (filtre arrêté). **Approximation de
 * jeu** ; la source dit seulement « plus vite avec du courant ».
 */
export const LIMESTONE_STILL_WATER_FACTOR = 0.25;

/**
 * pH plancher vers lequel tire le bois flotté. **Approximation de jeu** : « légère baisse du
 * pH », au-dessus du plancher des feuilles de catappa (6).
 */
export const WOOD_PH_FLOOR = 6.5;

/**
 * Taux d'action du bois flotté à l'échelle 1, dans `DECOR_REFERENCE_LITERS` litres, en s⁻¹.
 * **Approximation de jeu** : constante de temps de 240 jours de jeu, quatre fois plus lent
 * qu'une roche calcaire (« légère » baisse).
 */
export const WOOD_PH_RATE = 1 / 288_000;

/** Volume de référence des taux, en litres : le bac tropical par défaut (288 L). */
export const DECOR_REFERENCE_LITERS = 288;

/**
 * Surfaces actives d'un décor, en somme d'échelles au carré : accumulateur réutilisable, écrit
 * par `decorSurfacesInto` (aucune allocation dans le pas).
 */
export interface DecorSurfaces {
  /** Roches calcaires ; un rocher sans matière écrite est inerte. */
  limestone: number;
  /** Bois flotté. */
  wood: number;
}

/**
 * Écrit dans `out` les surfaces de calcaire et de bois de `decor` (0 sans l'une ou l'autre) et
 * le renvoie : seule source de ces sommes, pour le pas comme pour les lectures. Une seule
 * boucle, sans appel ni allocation : elle tourne à chaque pas fin (60 par seconde).
 */
export function decorSurfacesInto(decor: readonly DecorItem[], out: DecorSurfaces): DecorSurfaces {
  out.limestone = 0;
  out.wood = 0;
  for (const item of decor) {
    if (item.kind === 'wood') {
      out.wood += item.scale * item.scale;
    } else if (item.kind === 'rock' && item.material === 'limestone') {
      out.limestone += item.scale * item.scale;
    }
  }
  return out;
}

/** Surface de roche calcaire du décor (somme des échelles au carré ; 0 sans calcaire). */
export function limestoneSurface(decor: readonly DecorItem[]): number {
  return decorSurfacesInto(decor, { limestone: 0, wood: 0 }).limestone;
}

/** Surface de bois flotté du décor (somme des échelles au carré ; 0 sans bois). */
export function woodSurface(decor: readonly DecorItem[]): number {
  return decorSurfacesInto(decor, { limestone: 0, wood: 0 }).wood;
}

/**
 * Taux d'une roche calcaire de surface `surface` dans `liters` litres avec le filtre `filter`
 * (dans [0, 1]), en s⁻¹ : `LIMESTONE_RATE · surface · courant · DECOR_REFERENCE_LITERS /
 * liters`, courant = `LIMESTONE_STILL_WATER_FACTOR + (1 − LIMESTONE_STILL_WATER_FACTOR) ·
 * filter`.
 */
export function limestoneRate(surface: number, filter: number, liters: number): number {
  const flow = LIMESTONE_STILL_WATER_FACTOR + (1 - LIMESTONE_STILL_WATER_FACTOR) * filter;
  return (LIMESTONE_RATE * surface * flow * DECOR_REFERENCE_LITERS) / liters;
}

/**
 * pH après `dt` secondes d'une roche calcaire de taux `rate` (`limestoneRate`) :
 * `cible + (pH − cible) · e^(−rate·dt)` sous la cible ; inchangé à la cible ou au-dessus (une
 * roche n'acidifie jamais) et sans roche.
 */
export function limestonePh(ph: number, rate: number, dt: number): number {
  if (!(rate > 0) || !(ph < LIMESTONE_PH_TARGET)) {
    return ph;
  }
  return LIMESTONE_PH_TARGET + (ph - LIMESTONE_PH_TARGET) * Math.exp(-rate * dt);
}

/**
 * Carbonate dissous pendant `dt` secondes par une roche calcaire de taux `rate`, en degrés
 * (°dKH, autant de °dGH) : `(LIMESTONE_KH_CEILING − kh) · (1 − e^(−rate·dt))`, 0 si la dureté
 * carbonatée atteint déjà le plafond ou si le pH dépasse `LIMESTONE_INACTIVE_PH`.
 */
export function limestoneDissolved(kh: number, ph: number, rate: number, dt: number): number {
  if (!(rate > 0) || !(kh < LIMESTONE_KH_CEILING) || ph > LIMESTONE_INACTIVE_PH) {
    return 0;
  }
  return (LIMESTONE_KH_CEILING - kh) * (1 - Math.exp(-rate * dt));
}

/**
 * pH après `dt` secondes avec `surface` de bois flotté dans `liters` litres : approche
 * exponentielle de `WOOD_PH_FLOOR`, inchangé au plancher ou en dessous et sans bois.
 */
export function woodPh(ph: number, surface: number, liters: number, dt: number): number {
  if (!(surface > 0) || !(ph > WOOD_PH_FLOOR)) {
    return ph;
  }
  const rate = (WOOD_PH_RATE * surface * DECOR_REFERENCE_LITERS) / liters;
  return WOOD_PH_FLOOR + (ph - WOOD_PH_FLOOR) * Math.exp(-rate * dt);
}

/** Accumulateur du pas, réutilisé (le pas n'est pas réentrant). */
const SURFACES: DecorSurfaces = { limestone: 0, wood: 0 };

/**
 * Fait agir le décor `decor` sur `water` (bac de l'environnement `environment`, `liters`
 * litres) pendant `dt` secondes, **en modifiant** l'eau : roches calcaires (dureté écrite
 * dans l'eau, pH), puis bois flotté (pH). Sans calcaire ni bois, rien n'est écrit : un bac
 * sans matière active garde son eau au bit près. `dt` et `liters` sont supposés validés par
 * l'appelant (`stepWaterInPlace`). Aucune allocation.
 */
export function stepDecorWaterInPlace(
  water: MutableWaterState,
  decor: readonly DecorItem[],
  environment: EnvironmentId,
  liters: number,
  dt: number,
): void {
  const { limestone, wood } = decorSurfacesInto(decor, SURFACES);
  if (limestone > 0) {
    const rate = limestoneRate(limestone, water.filter, liters);
    dissolveLimestoneInPlace(water, environment, rate, dt);
    water.ph = limestonePh(water.ph, rate, dt);
  }
  if (wood > 0) {
    water.ph = woodPh(water.ph, wood, liters, dt);
  }
}

/** Dureté relevée par la dissolution du calcaire (pH du début du pas). */
function dissolveLimestoneInPlace(
  water: MutableWaterState,
  environment: EnvironmentId,
  rate: number,
  dt: number,
): void {
  const tap = tapHardness(environment);
  const kh = isHardness(water.kh) ? water.kh : tap.kh;
  const dissolved = limestoneDissolved(kh, water.ph, rate, dt);
  if (dissolved > 0) {
    const gh = isHardness(water.gh) ? water.gh : tap.gh;
    water.kh = kh + dissolved;
    water.gh = Math.min(MAX_HARDNESS, gh + dissolved);
  }
}
