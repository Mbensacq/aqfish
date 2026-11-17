import type { AnemoneHome } from './anemones';
import { isSick } from './diseases';
import { laysNearAnemone, type Egg } from './eggs';
import { isFry } from './fry';
import type { Fish } from './swimmer';
import type { Vec3 } from './flocking';

/**
 * Garde de la ponte par le poisson-clown (issue #670, ADR 0149, suite de l'ADR 0146).
 *
 * Chez _Amphiprion ocellaris_, le mâle garde les œufs (FishBase, docs/ESPECES.md). Tant qu'une
 * ponte d'une espèce du récif (`laysNearAnemone`) est collée dans le bac, **un** gardien reste
 * près d'elle : il vise un point qui va et vient devant les œufs, côté anémone (la ventilation, rendue
 * par un simple déplacement) et, une fraction de chaque période, un point du côté de
 * l'anémone (courte sortie), toujours à moins de `GUARD_RADIUS` du centre de la ponte. Ce
 * point visé remplace la nourriture et l'attache à l'anémone : le gardien ne court pas aux
 * granulés.
 *
 * - **Gardien** : le sexe n'est pas modélisé ; le premier adulte de l'espèce dans l'ordre du
 *   tableau (ordre des identifiants) qui est sain (aucune maladie, santé au moins
 *   `GUARD_MIN_HEALTH`) et pas trop affamé (faim au plus `GUARD_HUNGER`) fait office de mâle.
 *   Un gardien qui a trop faim quitte la garde (il retourne manger) ; le suivant le relaie.
 *   Les morts ont quitté `World.entities` (ADR 0137) : ils ne gardent rien.
 * - **Ponte gardée** : celle du premier œuf du récif dans le tableau (la plus ancienne). Son
 *   centre est la moyenne des œufs de la même espèce à moins de `CLUTCH_GROUP_RADIUS` de cet
 *   œuf. Plusieurs pontes : seule la plus ancienne est gardée.
 * - **Fin** : à l'éclosion du dernier œuf (ou si la ponte disparaît), plus de gardien, la nage
 *   reprend telle qu'avant.
 *
 * - **Évitement rapproché** : la ponte est collée à un rocher, à l'intérieur de la zone où la
 *   nage évite les obstacles ; près d'elle (`isNearClutch`), le gardien ne les évite que de
 *   près (`stepFish`, `closeAvoid`), le filet de sécurité restant entier.
 *
 * Fonctions pures et déterministes (temps simulé, identifiant), sans tirage ni champ d'état :
 * la sauvegarde ne change pas. Valeurs : **approximations de jeu**.
 */

/** Distance maximale entre le point visé par le gardien et le centre de la ponte, en mètres. */
export const GUARD_RADIUS = 0.1;
/** Hauteur du point visé au-dessus du centre de la ponte, en mètres (au moins). */
export const GUARD_HOVER = 0.02;
/**
 * Hauteur du point visé au-dessus du bas des bornes de nage du gardien, en mètres (au moins) :
 * la ponte est collée au ras du sable, sous les bornes de nage (`wallMargin`) ; un point visé
 * plus bas serait repoussé par l'évitement du fond et le poisson tournerait loin au-dessus.
 */
export const GUARD_FLOOR_CLEARANCE = 0.03;
/**
 * Recul du point visé vers l'anémone, en mètres (à l'horizontale) : la ponte est collée au
 * flanc d'un rocher tourné vers l'anémone ; le gardien nage devant elle, pas dans le rocher.
 */
export const GUARD_STANDOFF = 0.05;
/** Amplitude du va-et-vient devant les œufs, en mètres (à l'horizontale). */
export const GUARD_SWAY = 0.02;
/** Période du va-et-vient, en secondes simulées. */
export const GUARD_SWAY_PERIOD = 4;
/** Période d'une garde (passages près des œufs puis courte sortie), en secondes simulées. */
export const GUARD_PERIOD = 12;
/** Durée de la sortie vers l'anémone à la fin de chaque période, en secondes simulées. */
export const GUARD_SORTIE = 3;
/** Distance de la sortie au centre de la ponte, en fraction de `GUARD_RADIUS`. */
export const GUARD_SORTIE_RATIO = 0.85;
/** Part de `GUARD_RADIUS²` laissée au point visé (marge de calcul flottant). */
const GUARD_LIFT_SAFETY = 0.99;
/** Faim au-delà de laquelle le gardien quitte la garde pour manger. */
export const GUARD_HUNGER = 0.8;
/** Santé minimale d'un gardien. */
export const GUARD_MIN_HEALTH = 0.5;
/**
 * Distance horizontale au centre de la ponte sous laquelle le gardien n'évite les obstacles
 * que de près (`stepFish`, `closeAvoid`), en mètres : assez pour tenir devant un rocher, pas
 * au point de se coincer contre un corail sur le chemin du retour.
 */
export const GUARD_CLOSE_RANGE = 0.12;
/** Rayon de regroupement des œufs d'une même ponte autour du premier, en mètres. */
export const CLUTCH_GROUP_RADIUS = 0.1;

/** Garde en cours : rang du gardien dans le tableau des animaux et centre de la ponte. */
export interface ClutchGuard {
  /** Rang du gardien dans le tableau des animaux, ou -1 sans garde. */
  index: number;
  x: number;
  y: number;
  z: number;
}

/** Garde vide, à réutiliser comme tampon (`clutchGuardInto`). */
export function noGuard(): ClutchGuard {
  return { index: -1, x: 0, y: 0, z: 0 };
}

/** Vrai si `fish` peut garder une ponte de son espèce : adulte sain, santé suffisante, pas affamé. */
export function canGuard(fish: Fish): boolean {
  return (
    laysNearAnemone(fish.species) &&
    !isFry(fish) &&
    !isSick(fish) &&
    fish.health >= GUARD_MIN_HEALTH &&
    fish.hunger <= GUARD_HUNGER
  );
}

/**
 * Garde du bac, écrite dans `out` (aucune allocation) et renvoyée : la ponte la plus ancienne
 * d'une espèce du récif et son gardien (`canGuard`, le premier du tableau). Sans œuf (`eggs`
 * absent, nul ou vide), sans œuf du récif ou sans gardien possible : `out.index` vaut -1.
 */
export function clutchGuardInto(
  fishes: readonly Fish[],
  eggs: readonly Egg[] | null | undefined,
  out: ClutchGuard,
): ClutchGuard {
  out.index = -1;
  if (eggs === null || eggs === undefined || eggs.length === 0) {
    return out;
  }
  // Boucles simples, sans fermeture : appelée à chaque pas tant qu'une ponte est posée (#672).
  let first: Egg | undefined;
  for (const egg of eggs) {
    if (laysNearAnemone(egg.species)) {
      first = egg;
      break;
    }
  }
  if (first === undefined) {
    return out;
  }
  let index = -1;
  for (let i = 0; i < fishes.length; i++) {
    const fish = fishes[i];
    if (fish.species === first.species && canGuard(fish)) {
      index = i;
      break;
    }
  }
  if (index < 0) {
    return out;
  }
  const r2 = CLUTCH_GROUP_RADIUS * CLUTCH_GROUP_RADIUS;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let n = 0;
  for (const egg of eggs) {
    if (egg.species !== first.species) {
      continue;
    }
    const dx = egg.x - first.x;
    const dy = egg.y - first.y;
    const dz = egg.z - first.z;
    if (dx * dx + dy * dy + dz * dz <= r2) {
      sx += egg.x;
      sy += egg.y;
      sz += egg.z;
      n += 1;
    }
  }
  // `first` est dans le groupe : n ≥ 1.
  out.index = index;
  out.x = sx / n;
  out.y = sy / n;
  out.z = sz / n;
  return out;
}

/**
 * Point visé par le gardien au temps `time`, écrit dans `out` et renvoyé : au-dessus du centre
 * de la ponte (`GUARD_HOVER`, et pas sous `floorY`, le plancher de nage du gardien), reculé de `GUARD_STANDOFF` vers l'anémone `home`, en
 * va-et-vient d'amplitude `GUARD_SWAY` ; pendant les
 * `GUARD_SORTIE` dernières secondes de chaque `GUARD_PERIOD`, du côté de l'anémone `home` à
 * `GUARD_SORTIE_RATIO · GUARD_RADIUS` du centre (sans anémone, ou anémone au-dessus de la
 * ponte, ni recul ni sortie : va-et-vient seul). Toujours à moins de `GUARD_RADIUS` du centre. Le va-et-vient
 * est perpendiculaire à la direction de l'anémone (axe X sans anémone).
 */
export function guardTarget(
  guard: ClutchGuard,
  home: AnemoneHome | null,
  time: number,
  out: Vec3,
  floorY = Number.NEGATIVE_INFINITY,
): Vec3 {
  let ux = 1;
  let uz = 0;
  let toward = false;
  if (home !== null) {
    const dx = home.x - guard.x;
    const dz = home.z - guard.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 1e-6) {
      ux = dx / d;
      uz = dz / d;
      toward = true;
    }
  }
  const t = Number.isFinite(time) ? time : 0;
  const inPeriod = t - Math.floor(t / GUARD_PERIOD) * GUARD_PERIOD;
  if (toward && inPeriod >= GUARD_PERIOD - GUARD_SORTIE) {
    const reach = GUARD_SORTIE_RATIO * GUARD_RADIUS;
    out.x = guard.x + ux * reach;
    out.z = guard.z + uz * reach;
  } else {
    // Devant la ponte, côté anémone, en va-et-vient perpendiculaire : (-uz, ux).
    const sway = GUARD_SWAY * Math.sin((2 * Math.PI * t) / GUARD_SWAY_PERIOD);
    const standoff = toward ? GUARD_STANDOFF : 0;
    out.x = guard.x + ux * standoff - uz * sway;
    out.z = guard.z + uz * standoff + ux * sway;
  }
  // Hauteur : au-dessus des œufs et du plancher de nage, sans sortir de `GUARD_RADIUS`.
  const h2 = (out.x - guard.x) ** 2 + (out.z - guard.z) ** 2;
  const lift = Math.sqrt(Math.max(0, GUARD_RADIUS * GUARD_RADIUS * GUARD_LIFT_SAFETY - h2));
  const wanted = Math.max(guard.y + GUARD_HOVER, Number.isNaN(floorY) ? -Infinity : floorY);
  out.y = Math.min(wanted, guard.y + lift);
  return out;
}

/** Anémone la plus proche du centre de la ponte (à l'horizontale), ou `null` sans anémone. */
export function nearestHome(homes: readonly AnemoneHome[], guard: ClutchGuard): AnemoneHome | null {
  let best: AnemoneHome | null = null;
  let bestD2 = Infinity;
  for (const home of homes) {
    const d2 = (home.x - guard.x) ** 2 + (home.z - guard.z) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = home;
    }
  }
  return best;
}

/** Vrai si `fish` est à moins de `GUARD_CLOSE_RANGE` (à l'horizontale) du centre de la ponte. */
export function isNearClutch(fish: Pick<Fish, 'x' | 'z'>, guard: ClutchGuard): boolean {
  const dx = fish.x - guard.x;
  const dz = fish.z - guard.z;
  return dx * dx + dz * dz < GUARD_CLOSE_RANGE * GUARD_CLOSE_RANGE;
}
