import type { SavedWorld } from './save';
import { isRecord } from './save-schema';
import type { WaterState } from './water';
import { WATER_HISTORY_SERIES } from './water-history';
import {
  MG_PER_LITER_PER_GAME_UNIT,
  NITROGEN_COMPOUNDS,
  type NitrogenCompound,
} from './water-units';

/**
 * Unités des composés azotés dans les sauvegardes (issue #793, ADR 0167).
 *
 * - Schéma 1 (un monde : fichiers de compatibilité, liens partagés) : toujours en **unités de
 *   jeu**, à l'écriture comme à la relecture, pour que les liens restent lisibles d'une version
 *   à l'autre de l'application.
 * - Schéma 2 (la pièce, jusqu'à #793) : en unités de jeu, converti à la relecture.
 * - Schéma 3 (la pièce) : en mg/L, comme le monde en mémoire.
 *
 * La conversion porte sur `water` (ammoniaque, nitrites, nitrates) et sur les séries de même
 * nom de `waterHistory`. Elle a lieu **avant** la validation (dont les bornes sont en mg/L) et
 * ne touche que des nombres finis : toute autre valeur reste telle quelle et la validation la
 * refuse avec son message habituel. Les facteurs sont des puissances de deux : la conversion
 * aller-retour est exacte. Fonctions pures : les données reçues ne sont jamais modifiées.
 */

/** Rang de chaque composé dans un relevé de l'historique (`WATER_HISTORY_SERIES`). */
const HISTORY_RANKS: readonly (readonly [number, NitrogenCompound])[] = NITROGEN_COMPOUNDS.map(
  (compound) => [WATER_HISTORY_SERIES.indexOf(compound), compound] as const,
);

/** Facteur appliqué à chaque composé : vers les mg/L, ou retour aux unités de jeu. */
type UnitFactor = (compound: NitrogenCompound) => number;

const TO_MG_PER_LITER: UnitFactor = (compound) => MG_PER_LITER_PER_GAME_UNIT[compound];
const TO_GAME_UNITS: UnitFactor = (compound) => 1 / MG_PER_LITER_PER_GAME_UNIT[compound];

/**
 * Corps de monde JSON non vérifié (schémas 1 et 2) converti des unités de jeu aux mg/L : copie
 * de `body` dont l'eau et l'historique sont convertis. Une valeur qui n'est pas un objet est
 * renvoyée telle quelle (la validation la refusera).
 */
export function worldBodyToMgPerLiter(body: unknown): unknown {
  if (!isRecord(body)) {
    return body;
  }
  const water = body['water'];
  const history = body['waterHistory'];
  return {
    ...body,
    ...(Object.hasOwn(body, 'water') ? { water: convertedWater(water, TO_MG_PER_LITER) } : {}),
    ...(Object.hasOwn(body, 'waterHistory')
      ? { waterHistory: convertedHistory(history, TO_MG_PER_LITER) }
      : {}),
  };
}

/**
 * Document au schéma 1 converti aux mg/L : le monde affiché et chacun des mondes rangés
 * (`others`). Copie ; une valeur qui n'est pas un objet est renvoyée telle quelle.
 */
export function schema1ToMgPerLiter(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  // Un objet reste un objet : `worldBodyToMgPerLiter` n'en renvoie qu'une copie.
  const converted = worldBodyToMgPerLiter(value) as Record<string, unknown>;
  const others = value['others'];
  return Array.isArray(others) && Object.hasOwn(value, 'others')
    ? { ...converted, others: others.map(worldBodyToMgPerLiter) }
    : converted;
}

/**
 * Document de la pièce au schéma 2 converti aux mg/L : le monde de chaque bac. Copie ; une
 * valeur qui n'est pas un objet est renvoyée telle quelle.
 */
export function schema2ToMgPerLiter(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value['tanks']) || !Object.hasOwn(value, 'tanks')) {
    return value;
  }
  // Liste vérifiée juste au-dessus.
  const tanks = (value['tanks'] as unknown[]).map((tank) =>
    isRecord(tank) && Object.hasOwn(tank, 'world')
      ? { ...tank, world: worldBodyToMgPerLiter(tank['world']) }
      : tank,
  );
  return { ...value, tanks };
}

/** Corps enregistré `saved` (en mg/L) exprimé en unités de jeu, pour le schéma 1. Copie. */
export function savedWorldInGameUnits(saved: SavedWorld): SavedWorld {
  return {
    ...saved,
    ...(saved.water === undefined
      ? {}
      : // Copie d'un `WaterState` dont seuls trois nombres changent : même forme.
        { water: convertedWater(saved.water, TO_GAME_UNITS) as WaterState }),
    ...(saved.waterHistory === undefined
      ? {}
      : {
          waterHistory: {
            ...saved.waterHistory,
            samples: convertedSamples(saved.waterHistory.samples, TO_GAME_UNITS),
          },
        }),
  };
}

function convertedWater(water: unknown, factor: UnitFactor): unknown {
  if (!isRecord(water)) {
    return water;
  }
  const copy: Record<string, unknown> = { ...water };
  for (const compound of NITROGEN_COMPOUNDS) {
    const value = copy[compound];
    if (Object.hasOwn(water, compound) && typeof value === 'number' && Number.isFinite(value)) {
      copy[compound] = value * factor(compound);
    }
  }
  return copy;
}

function convertedHistory(history: unknown, factor: UnitFactor): unknown {
  if (!isRecord(history) || !Array.isArray(history['samples'])) {
    return history;
  }
  // Liste vérifiée juste au-dessus.
  return { ...history, samples: convertedSamples(history['samples'] as unknown[], factor) };
}

/** Relevés à plat, série après série : seules les séries azotées sont converties. */
function convertedSamples<T>(samples: readonly T[], factor: UnitFactor): T[] {
  const count = WATER_HISTORY_SERIES.length;
  return samples.map((sample, index) => {
    const entry = HISTORY_RANKS.find(([rank]) => rank === index % count);
    return entry !== undefined && typeof sample === 'number' && Number.isFinite(sample)
      ? // `sample` est un nombre : son produit reste du type `T` des relevés.
        ((sample * factor(entry[1])) as T)
      : sample;
  });
}
