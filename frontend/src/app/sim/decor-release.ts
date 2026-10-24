import { decorBaseY, decorElevation, decorSpheres, type DecorItem } from './decor';
import {
  DROP_SKIN,
  decorDropScene,
  groundDecorItem,
  type DropPoint,
  type DropScene,
} from './decor-drop';
import { isDecorPoseAllowed } from './decor-edit';
import type { Place } from './environment';
import type { Sphere } from './obstacles';

/**
 * Relâcher les éléments dont le support disparaît (issue #182, ADR 0046) : après une
 * modification du décor dans l'éditeur, un élément posé sur un autre (`elevation` > 0) dont le
 * support a été supprimé, déplacé ou réduit retombe, par la même chute que le lâcher, jusqu'au
 * sable ou à un autre support ; sans moteur, il est posé sur le sable. Un élément toujours
 * soutenu garde sa pose à l'octet. Module pur et déterministe : le moteur est passé en
 * fonction (`DecorFall`), comme pour le lâcher (ADR 0003).
 */

/**
 * Jeu toléré entre une sphère de l'élément et celle de son support, en mètres, en plus de
 * `DROP_SKIN` : le corps de la chute se pose sur les sphères épaissies, avec la tolérance de
 * contact du moteur.
 */
export const SUPPORT_GAP = 0.005;

/**
 * Composante verticale minimale de la normale de contact (du support vers l'élément) pour
 * compter comme un appui : un voisin seulement touché de côté ne porte rien.
 */
export const SUPPORT_MIN_NORMAL_Y = 0.2;

/**
 * Écart (m) en dessous duquel une chute est jugée sans effet : l'élément était soutenu (calé
 * entre deux voisins, par exemple, sans appui assez vertical) et garde sa pose à l'octet.
 */
export const SUPPORT_SAME_POSE = 0.001;

/** Chute de l'élément `index` de `decor` depuis sa pose (moteur), `null` si elle échoue. */
export type DecorFall = (
  decor: readonly DecorItem[],
  index: number,
) => { readonly decor: readonly DecorItem[]; readonly path: readonly DropPoint[] } | null;

/** Élément retombé par `releaseUnsupportedDecor` et trajectoire de sa chute (vide sans moteur). */
export interface DecorReleaseFall {
  readonly index: number;
  readonly path: readonly DropPoint[];
}

/** Résultat de `releaseUnsupportedDecor`. */
export interface DecorRelease {
  readonly decor: readonly DecorItem[];
  /** Chutes dans l'ordre où elles ont eu lieu (un élément peut retomber en cascade). */
  readonly falls: readonly DecorReleaseFall[];
}

/** Vrai si une sphère de `own` repose sur une sphère de `support` (appui assez vertical). */
function restsOn(own: readonly Sphere[], support: readonly Sphere[]): boolean {
  return own.some((s) =>
    support.some((t) => {
      const dx = s.x - t.x;
      const dy = s.y - t.y;
      const dz = s.z - t.z;
      const d = Math.hypot(dx, dy, dz);
      return d <= s.radius + t.radius + DROP_SKIN + SUPPORT_GAP && dy > SUPPORT_MIN_NORMAL_Y * d;
    }),
  );
}

/**
 * Vrai si l'élément `index` de `decor` est soutenu : posé sur le sable (élévation nulle), ou
 * au contact, par en dessous, d'un rocher ou d'un bois (les plantes ne portent rien, ADR
 * 0046). Faux pour un indice absent.
 */
export function isDecorItemSupported(decor: readonly DecorItem[], index: number): boolean {
  const item = Number.isInteger(index) ? decor[index] : undefined;
  if (!item) {
    return false;
  }
  if (decorElevation(item) === 0) {
    return true;
  }
  const own = decorSpheres(item);
  return decor.some(
    (other, n) => n !== index && other.kind !== 'plant' && restsOn(own, decorSpheres(other)),
  );
}

/**
 * Scène de chute de l'élément `index` depuis sa pose actuelle (base à son élévation), et non
 * depuis le dessus du décor comme au lâcher : un élément posé sur lui ne l'arrête pas. `null`
 * dans les cas de `decorDropScene`.
 */
export function decorFallScene(
  decor: readonly DecorItem[],
  index: number,
  environment: Place,
): DropScene | null {
  const scene = decorDropScene(decor, index, environment);
  if (!scene) {
    return null;
  }
  const item = decor[index];
  return { ...scene, start: { x: item.x, y: decorBaseY(item), z: item.z } };
}

/** Vrai si `a` et `b` ont la même pose à `SUPPORT_SAME_POSE` près. */
function samePose(a: DecorItem, b: DecorItem): boolean {
  return (
    Math.abs(a.x - b.x) <= SUPPORT_SAME_POSE &&
    Math.abs(a.z - b.z) <= SUPPORT_SAME_POSE &&
    Math.abs(decorElevation(a) - decorElevation(b)) <= SUPPORT_SAME_POSE
  );
}

/**
 * Fait retomber l'élément `index` (non soutenu) : par `fall` si elle aboutit à une pose
 * permise (`isDecorPoseAllowed`), sinon posé sur le sable si cette pose est permise. `null`
 * si l'élément reste où il est (chute sans effet, ou aucune pose permise).
 */
function releaseOne(
  decor: readonly DecorItem[],
  index: number,
  fall: DecorFall | null,
): { decor: readonly DecorItem[]; path: readonly DropPoint[] } | null {
  const fallen = fall ? fall(decor, index) : null;
  if (fallen && isDecorPoseAllowed(decor, fallen.decor, index)) {
    return samePose(decor[index], fallen.decor[index]) ? null : fallen;
  }
  const grounded = groundDecorItem(decor, index);
  return grounded && isDecorPoseAllowed(decor, grounded, index)
    ? { decor: grounded, path: [] }
    : null;
}

/**
 * Prochain élément à relâcher : non soutenu, pas encore écarté (`kept`), le plus bas d'abord
 * (son support est traité avant ce qu'il porte), puis par indice. `null` s'il n'y en a pas.
 */
function nextUnsupported(decor: readonly DecorItem[], kept: ReadonlySet<number>): number | null {
  let best: number | null = null;
  let bestY = Number.POSITIVE_INFINITY;
  decor.forEach((item, n) => {
    if (decorElevation(item) === 0 || kept.has(n)) {
      return;
    }
    const y = decorBaseY(item);
    if (y < bestY && !isDecorItemSupported(decor, n)) {
      best = n;
      bestY = y;
    }
  });
  return best;
}

/**
 * Fait retomber chaque élément non soutenu de `decor` (#182), le plus bas d'abord, puis
 * recommence : un élément porté par un élément qui tombe retombe à son tour (cascade). Au plus
 * deux chutes par élément en tout (borne). `fall` : chute par le moteur depuis la pose
 * (`decorFallScene`) ; `null` (moteur absent), l'élément est posé sur le sable. Les éléments
 * soutenus, ou qu'aucune pose permise ne fait bouger, sont rendus tels quels (mêmes objets).
 * Même décor, même `fall` : même résultat.
 */
export function releaseUnsupportedDecor(
  decor: readonly DecorItem[],
  fall: DecorFall | null,
): DecorRelease {
  let current = decor;
  const falls: DecorReleaseFall[] = [];
  const kept = new Set<number>();
  for (let pass = 0; pass < 2 * decor.length; pass++) {
    const index = nextUnsupported(current, kept);
    if (index === null) {
      break;
    }
    const released = releaseOne(current, index, fall);
    if (!released) {
      kept.add(index);
      continue;
    }
    current = released.decor;
    falls.push({ index, path: released.path });
  }
  return { decor: current, falls };
}
