import { assertSeed, deriveSeed, prngNextState, prngOutput } from '../core/random/prng';
import { sunElevation } from './daylight';
import type { Box3 } from './tank';

/**
 * Nénuphars du bassin (issue #103, ADR 0029) : feuilles rondes à encoche qui flottent à la
 * surface et dérivent très lentement.
 *
 * Tout est **dérivé** de la graine du monde et du temps simulé, sans état : la disposition
 * (`lilyPadLayout`) se tire d'un flux de hasard propre (`LILY_PAD_STREAM`), qui ne touche
 * jamais aux sous-générateurs des poissons, des bulles ni de la nourriture ; la pose à
 * l'instant `time` (`lilyPadPose`) est une fonction pure. La sauvegarde (ADR 0028) n'a donc
 * aucun champ nouveau.
 *
 * Bornes : chaque feuille dérive dans un disque de rayon `drift` autour de son ancre. Son
 * encombrement (`lilyPadReach` : rayon + dérive) tient dans la surface rétrécie de
 * `LILY_PAD_EDGE_MARGIN`, et deux encombrements ne se recouvrent jamais : à tout instant,
 * aucune feuille ne touche la bordure ni une autre feuille.
 *
 * Fleurs (issue #104) : certaines feuilles portent une fleur, quelques autres sont des lotus
 * (feuille plus grande, fleur plus haute). La nature de chaque feuille se tire d'un second
 * flux (`LILY_FLOWER_STREAM`), deux tirages par feuille visée, avant son placement : le
 * rayon d'un lotus compte donc dans les bornes ci-dessus. L'ouverture des fleurs ne dépend
 * que de l'heure (`flowerOpenness`).
 */

/** Flux de hasard des nénuphars, dérivé de la graine du monde (`deriveSeed`). */
export const LILY_PAD_STREAM = 0x111e9ad;

/**
 * Distance minimale entre l'encombrement d'une feuille et la bordure du bassin, en mètres.
 * Elle couvre aussi le décalage de l'ombre portée sur le fond (`render/lily-pad-layer.ts`).
 */
export const LILY_PAD_EDGE_MARGIN = 0.06;
/** Jeu minimal entre les encombrements de deux feuilles, en mètres. */
export const LILY_PAD_GAP = 0.015;
/** Essais de placement par feuille avant d'abandonner (la feuille est alors omise). */
export const LILY_PAD_ATTEMPTS = 60;

/** Amplitude de la dérive, en mètres : de `min` à `max`, tirée par feuille. */
export const LILY_PAD_DRIFT = { min: 0.015, max: 0.035 } as const;
/** Période de la dérive, en secondes (très lente), tirée par feuille et par axe. */
export const LILY_PAD_DRIFT_PERIOD = { min: 45, max: 80 } as const;
/** Balancement en rotation (radians, de part et d'autre de l'orientation de repos). */
export const LILY_PAD_SWAY_ANGLE = 0.06;
/** Période du balancement, en secondes. */
export const LILY_PAD_SWAY_PERIOD = { min: 14, max: 22 } as const;
/** Demi-ouverture de l'encoche, en radians : de `min` à `max`, tirée par feuille. */
export const LILY_PAD_NOTCH = { min: 0.2, max: 0.32 } as const;

/** Flux de hasard des fleurs (nature de chaque feuille), dérivé de la graine du monde. */
export const LILY_FLOWER_STREAM = 0xf1e0c;
/**
 * Probabilités de la nature d'une feuille : `lotus`, sinon `fleur`, sinon feuille nue.
 * Le reste (1 − lotus − fleur) donne une feuille sans fleur.
 */
export const LILY_PAD_BLOOM = { lotus: 0.2, fleur: 0.4 } as const;
/** Rayon d'une feuille de lotus, en multiple du rayon tiré dans le réglage. */
export const LOTUS_LEAF_SCALE = 1.3;
/**
 * Élévation du soleil (`sunElevation`, dans [−1, 1]) en dessous de laquelle les fleurs sont
 * fermées, et au-dessus de laquelle elles sont grandes ouvertes : avec l'élévation
 * `−cos(2π · h / 24)`, elles s'ouvrent d'environ 5 h à 8 h et se referment de 16 h à 19 h.
 */
export const FLOWER_CLOSED_ELEVATION = -0.25;
export const FLOWER_OPEN_ELEVATION = 0.5;

/** Nature d'une feuille : nue, fleurie (nénuphar) ou lotus. */
export type LilyPadKind = 'feuille' | 'fleur' | 'lotus';

/** Réglage des nénuphars d'un environnement (`sim/environment.ts`). */
export interface LilyPadSettings {
  /** Nombre de feuilles visé, tiré entre `min` et `max` (bornes comprises). */
  readonly count: { readonly min: number; readonly max: number };
  /** Rayon d'une feuille, en mètres, tiré entre `min` et `max`. */
  readonly radius: { readonly min: number; readonly max: number };
}

/** Feuille de nénuphar au repos (données pures). */
export interface LilyPad {
  /** Rang de la feuille dans la disposition (0, 1, 2…). */
  readonly id: number;
  /** Nature de la feuille (`LILY_PAD_BLOOM`) : nue, fleurie ou lotus. */
  readonly kind: LilyPadKind;
  /** Rotation propre de la fleur autour de sa tige, en radians (sans effet si nue). */
  readonly flowerTwist: number;
  /** Ancre de la dérive, dans le repère du bac (mètres). */
  readonly x: number;
  readonly z: number;
  /** Rayon de la feuille, en mètres (`LOTUS_LEAF_SCALE` fois le rayon tiré pour un lotus). */
  readonly radius: number;
  /** Orientation de repos (radians, autour de Y) : direction de l'encoche. */
  readonly rotation: number;
  /** Demi-ouverture de l'encoche, en radians. */
  readonly notch: number;
  /** Amplitude de la dérive, en mètres (rayon du disque parcouru autour de l'ancre). */
  readonly drift: number;
  /** Pulsations de la dérive selon X et Z, et du balancement (radians par seconde). */
  readonly omegaX: number;
  readonly omegaZ: number;
  readonly omegaSway: number;
  /** Phases de la dérive selon X et Z, et du balancement (radians). */
  readonly phaseX: number;
  readonly phaseZ: number;
  readonly phaseSway: number;
}

/** Pose d'une feuille à un instant : centre (mètres) et orientation (radians). */
export interface LilyPadPose {
  x: number;
  z: number;
  rotation: number;
}

/**
 * Vérifie un réglage de nénuphars : effectifs entiers positifs ou nuls avec `min ≤ max`,
 * rayons réels strictement positifs avec `min ≤ max`.
 * @throws RangeError si le réglage est invalide.
 */
export function assertLilyPadSettings(settings: LilyPadSettings): LilyPadSettings {
  const { count, radius } = settings;
  if (
    !Number.isInteger(count.min) ||
    !Number.isInteger(count.max) ||
    count.min < 0 ||
    count.max < count.min
  ) {
    throw new RangeError(`effectif de nénuphars invalide : ${JSON.stringify(count)}`);
  }
  if (
    !Number.isFinite(radius.min) ||
    !Number.isFinite(radius.max) ||
    radius.min <= 0 ||
    radius.max < radius.min
  ) {
    throw new RangeError(`rayon de nénuphar invalide : ${JSON.stringify(radius)}`);
  }
  return settings;
}

/** Encombrement d'une feuille : rayon plus amplitude de la dérive (mètres). */
export function lilyPadReach(pad: Pick<LilyPad, 'radius' | 'drift'>): number {
  return pad.radius + pad.drift;
}

/**
 * Disposition des nénuphars pour la graine `seed` à la surface `water` (seules ses bornes
 * en X et Z comptent) : nombre, ancres, tailles, encoches, mouvements et fleurs,
 * déterministes.
 * Chaque feuille est tirée au plus `LILY_PAD_ATTEMPTS` fois ; une feuille qui ne trouve pas
 * de place libre est omise (le nombre obtenu peut donc être inférieur au nombre visé).
 * `settings` nul : aucun nénuphar.
 * @throws RangeError si la graine ou le réglage est invalide.
 */
export function lilyPadLayout(
  seed: number,
  water: Box3,
  settings: LilyPadSettings | null,
): LilyPad[] {
  assertSeed(seed);
  if (settings === null) {
    return [];
  }
  assertLilyPadSettings(settings);
  let state = deriveSeed(seed, LILY_PAD_STREAM);
  const next = (): number => {
    state = prngNextState(state);
    return prngOutput(state) / 4294967296;
  };
  const between = (range: { readonly min: number; readonly max: number }): number =>
    range.min + (range.max - range.min) * next();
  const omega = (range: { readonly min: number; readonly max: number }): number =>
    (2 * Math.PI) / between(range);
  let bloomState = deriveSeed(seed, LILY_FLOWER_STREAM);
  const nextBloom = (): number => {
    bloomState = prngNextState(bloomState);
    return prngOutput(bloomState) / 4294967296;
  };

  const target =
    settings.count.min + Math.floor(next() * (settings.count.max - settings.count.min + 1));
  const pads: LilyPad[] = [];
  for (let n = 0; n < target; n++) {
    // Tirages de la feuille, faits une fois (indépendants des essais de placement).
    const kind = lilyPadKind(nextBloom());
    const flowerTwist = nextBloom() * 2 * Math.PI;
    const radius = between(settings.radius) * (kind === 'lotus' ? LOTUS_LEAF_SCALE : 1);
    const drift = between(LILY_PAD_DRIFT);
    const shape = {
      rotation: next() * 2 * Math.PI,
      notch: between(LILY_PAD_NOTCH),
      omegaX: omega(LILY_PAD_DRIFT_PERIOD),
      omegaZ: omega(LILY_PAD_DRIFT_PERIOD),
      omegaSway: omega(LILY_PAD_SWAY_PERIOD),
      phaseX: next() * 2 * Math.PI,
      phaseZ: next() * 2 * Math.PI,
      phaseSway: next() * 2 * Math.PI,
    };
    const reach = radius + drift;
    const inset = LILY_PAD_EDGE_MARGIN + reach;
    const minX = water.minX + inset;
    const maxX = water.maxX - inset;
    const minZ = water.minZ + inset;
    const maxZ = water.maxZ - inset;
    if (minX > maxX || minZ > maxZ) {
      continue;
    }
    for (let attempt = 0; attempt < LILY_PAD_ATTEMPTS; attempt++) {
      const x = minX + (maxX - minX) * next();
      const z = minZ + (maxZ - minZ) * next();
      const free = pads.every(
        (other) =>
          Math.hypot(other.x - x, other.z - z) >= reach + lilyPadReach(other) + LILY_PAD_GAP,
      );
      if (free) {
        pads.push({ id: pads.length, kind, flowerTwist, x, z, radius, drift, ...shape });
        break;
      }
    }
  }
  return pads;
}

/**
 * Écrit dans `out` la pose de la feuille `pad` au temps simulé `time` (secondes, jamais
 * l'horloge murale : contrat de capture). Le centre reste dans le disque de rayon
 * `pad.drift` autour de l'ancre (dérive de Lissajous normalisée), l'orientation à
 * `LILY_PAD_SWAY_ANGLE` près de celle de repos.
 * @throws RangeError si `time` n'est pas fini.
 */
export function lilyPadPose(pad: LilyPad, time: number, out: LilyPadPose): LilyPadPose {
  if (!Number.isFinite(time)) {
    throw new RangeError(`time doit être fini (reçu : ${time})`);
  }
  // Composantes de norme ≤ 1/√2 chacune : le déplacement reste dans le disque de rayon `drift`.
  const k = pad.drift * Math.SQRT1_2;
  out.x = pad.x + k * Math.sin(pad.omegaX * time + pad.phaseX);
  out.z = pad.z + k * Math.sin(pad.omegaZ * time + pad.phaseZ);
  out.rotation =
    pad.rotation + LILY_PAD_SWAY_ANGLE * Math.sin(pad.omegaSway * time + pad.phaseSway);
  return out;
}

/**
 * Nature d'une feuille pour le tirage `u` dans [0, 1[ (`LILY_PAD_BLOOM`) : `lotus` sous
 * `lotus`, puis `fleur` sous `lotus + fleur`, sinon `feuille`.
 * @throws RangeError si `u` n'est pas dans [0, 1[.
 */
export function lilyPadKind(u: number): LilyPadKind {
  if (!(u >= 0 && u < 1)) {
    throw new RangeError(`tirage hors de [0, 1[ (reçu : ${u})`);
  }
  if (u < LILY_PAD_BLOOM.lotus) {
    return 'lotus';
  }
  return u < LILY_PAD_BLOOM.lotus + LILY_PAD_BLOOM.fleur ? 'fleur' : 'feuille';
}

/**
 * Ouverture des fleurs à l'heure `hour` (toute valeur finie, ramenée modulo 24) : 0 (fermées)
 * à minuit, 1 (grandes ouvertes) à midi, exactement ; entre les deux, `smoothstep` de
 * l'élévation du soleil entre `FLOWER_CLOSED_ELEVATION` et `FLOWER_OPEN_ELEVATION` :
 * transition continue, symétrique autour de midi et de période 24 h.
 * @throws RangeError si `hour` n'est pas un réel fini.
 */
export function flowerOpenness(hour: number): number {
  const t = Math.min(
    1,
    Math.max(
      0,
      (sunElevation(hour) - FLOWER_CLOSED_ELEVATION) /
        (FLOWER_OPEN_ELEVATION - FLOWER_CLOSED_ELEVATION),
    ),
  );
  return t * t * (3 - 2 * t);
}
