import { clampIntensity, mix, type DayLight, type MutableRgb, type Rgb } from './daylight';
import {
  clampRoom,
  roomBlocks,
  roomInterior,
  ROOM_MARGIN,
  ROOM_VOXEL,
  type Room,
  type RoomBlock,
} from './room';
import type { Box3, TankDimensions } from './tank';

/**
 * Fenêtre de la pièce et sa lumière (issue #342, lot 2/3 de #227, ADR 0083) : une fenêtre à
 * quatre carreaux dans le mur du fond, à gauche du bac, et la tache de lumière qu'elle pose
 * sur le parquet. Purement graphique, comme la pièce (`sim/room.ts`) : aucun réglage ni champ
 * de sauvegarde, la fenêtre se déduit des dimensions du bac.
 *
 * Repère : celui du bac (mètres), sol du bac en y = 0, vitre avant du côté +Z ; le mur du fond
 * a sa face intérieure en `roomInterior(dims).minZ`.
 */

/** Ouverture de la fenêtre (cadre compris) sur la face intérieure du mur du fond. */
export interface RoomWindow {
  /** Bords gauche et droit de l'ouverture (selon X). */
  readonly minX: number;
  readonly maxX: number;
  /** Appui (bas) et linteau (haut) de l'ouverture (selon Y). */
  readonly minY: number;
  readonly maxY: number;
  /** Face intérieure du mur du fond, où la fenêtre est posée (selon Z). */
  readonly wallZ: number;
}

/** Largeur visée de la fenêtre. */
export const WINDOW_WIDTH = 1;
/** Hauteur maximale de la fenêtre. */
export const WINDOW_MAX_HEIGHT = 1.3;
/**
 * Écart entre le côté gauche du bac et le bord droit de la fenêtre, plus la profondeur du bac :
 * vu de trois-quarts (de devant à droite), un bac plus profond cache plus loin à sa gauche.
 */
export const WINDOW_TANK_GAP = 0.6;
/** Écart minimal entre la fenêtre et le mur de gauche. */
export const WINDOW_SIDE_MARGIN = 0.3;
/** Mur plein entre le haut de la fenêtre et le dessous des poutres. */
export const WINDOW_HEADER = 0.2;
/** Hauteur minimale de l'appui au-dessus du sol du bac (y = 0). */
export const WINDOW_MIN_SILL = 0.1;
/** Cadre : largeur des montants et traverses, du meneau et du croisillon. */
export const WINDOW_FRAME = 0.05;
export const WINDOW_BAR = 0.03;
/**
 * Saillies dans la pièce : cadre, vitre (en retrait) et appui. La vitre dépasse la cimaise du
 * mur du fond (`BASEBOARD_DEPTH`, 1,5 cm, soit 2 cm au voxel) d'un voxel : elle la recouvre
 * dans l'ouverture, sans face confondue avec la sienne.
 */
export const WINDOW_FRAME_DEPTH = 0.05;
export const WINDOW_GLASS_DEPTH = 0.03;
export const WINDOW_SILL_DEPTH = 0.07;
const SILL_HEIGHT = 0.03;
const SILL_OVERHANG = 0.04;
/** Tache de lumière sur le parquet : écart au mur et profondeur (selon Z). */
export const PATCH_OFFSET = 0.25;
export const PATCH_DEPTH = 1.2;

function snap(value: number): number {
  return Math.round(value / ROOM_VOXEL) * ROOM_VOXEL;
}

function box(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): Box3 {
  return {
    minX: snap(minX),
    maxX: snap(maxX),
    minY: snap(minY),
    maxY: snap(maxY),
    minZ: snap(minZ),
    maxZ: snap(maxZ),
  };
}

/**
 * Fenêtre de la pièce autour d'un bac `dims` : dans le mur du fond, à `WINDOW_TANK_GAP` plus la
 * profondeur du bac à gauche du bac (jamais derrière lui, ni vue de face ni de dessus), à `WINDOW_SIDE_MARGIN` au
 * moins du mur de gauche ; haut à `WINDOW_HEADER` sous le dessous des poutres, hauteur d'au
 * plus `WINDOW_MAX_HEIGHT`, appui à `WINDOW_MIN_SILL` au moins au-dessus du sol du bac. Cotes
 * au centimètre. Indépendante de la hauteur du meuble. Fonction pure.
 * @throws RangeError si une dimension du bac n'est pas un réel strictement positif.
 */
export function roomWindow(dims: TankDimensions): RoomWindow {
  for (const value of [dims.width, dims.height, dims.depth]) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new RangeError(`dimensions invalides : ${JSON.stringify(dims)}`);
    }
  }
  const inner = roomInterior(dims);
  // Côté gauche du bac arrondi au voxel par excès (`inner.minX + ROOM_MARGIN`, voir
  // `roomInterior`) : la fenêtre n'approche jamais le bac de moins de l'écart voulu.
  const tankLeft = inner.minX + ROOM_MARGIN;
  const gap = WINDOW_TANK_GAP + dims.depth;
  const maxX = snap(Math.max(inner.minX + WINDOW_SIDE_MARGIN + WINDOW_WIDTH, tankLeft - gap));
  const minX = snap(Math.max(inner.minX + WINDOW_SIDE_MARGIN, maxX - WINDOW_WIDTH));
  const maxY = snap(inner.beamY - WINDOW_HEADER);
  const minY = snap(Math.max(WINDOW_MIN_SILL, maxY - WINDOW_MAX_HEIGHT));
  return { minX, maxX, minY, maxY, wallZ: inner.minZ };
}

/** Carreaux de la fenêtre `w` (entre cadre, meneau et croisillon), selon X puis selon Y. */
function panes(w: RoomWindow): {
  readonly xs: [number, number][];
  readonly ys: [number, number][];
} {
  const midX = snap((w.minX + w.maxX) / 2);
  const midY = snap((w.minY + w.maxY) / 2);
  const half = WINDOW_BAR / 2;
  return {
    xs: [
      [w.minX + WINDOW_FRAME, midX - half],
      [midX + half, w.maxX - WINDOW_FRAME],
    ],
    ys: [
      [w.minY + WINDOW_FRAME, midY - half],
      [midY + half, w.maxY - WINDOW_FRAME],
    ],
  };
}

/** Intersection de deux intervalles, ou `null` si elle est vide. */
function overlap(a0: number, a1: number, b0: number, b1: number): [number, number] | null {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return hi > lo ? [lo, hi] : null;
}

/**
 * Blocs de la fenêtre de la pièce `room` autour d'un bac `dims` : cadre, meneau, croisillon
 * et appui en bois (partie `fenetre`), vitre en retrait (`vitre`), tous de la paroi `fond`
 * (masqués avec le mur du fond) ; tache de lumière (`lumiere`, hors enveloppe) : les lames de
 * parquet découpées sous les quatre carreaux projetés au sol devant le mur, ombres du meneau
 * et du croisillon comprises, chaque morceau gardant la teinte de sa lame. Liste vide si la
 * pièce est masquée. Fonction pure.
 * @throws RangeError si une dimension du bac n'est pas un réel strictement positif.
 */
export function roomWindowBlocks(dims: TankDimensions, room: Room): RoomBlock[] {
  const w = roomWindow(dims);
  if (!clampRoom(room).shown) {
    return [];
  }
  const blocks: RoomBlock[] = [];
  const z0 = w.wallZ;
  const glassZ = z0 + WINDOW_GLASS_DEPTH;
  const frameZ = z0 + WINDOW_FRAME_DEPTH;
  const wood = (b: Box3, shade: 0 | 1 = 0): void => {
    blocks.push({ box: b, part: 'fenetre', shade, shell: 'fond' });
  };
  blocks.push({
    box: box(w.minX, w.maxX, w.minY, w.maxY, z0, glassZ),
    part: 'vitre',
    shade: 0,
    shell: 'fond',
  });
  const { xs, ys } = panes(w);
  // Cadre : traverses haute et basse sur toute la largeur, montants entre elles.
  wood(box(w.minX, w.maxX, w.maxY - WINDOW_FRAME, w.maxY, glassZ, frameZ));
  wood(box(w.minX, w.maxX, w.minY, w.minY + WINDOW_FRAME, glassZ, frameZ));
  wood(box(w.minX, xs[0][0], ys[0][0], ys[1][1], glassZ, frameZ));
  wood(box(xs[1][1], w.maxX, ys[0][0], ys[1][1], glassZ, frameZ));
  // Meneau (vertical) sur toute la hauteur des carreaux, croisillon de part et d'autre.
  wood(box(xs[0][1], xs[1][0], ys[0][0], ys[1][1], glassZ, frameZ));
  wood(box(xs[0][0], xs[0][1], ys[0][1], ys[1][0], glassZ, frameZ));
  wood(box(xs[1][0], xs[1][1], ys[0][1], ys[1][0], glassZ, frameZ));
  // Appui, plus foncé, en saillie sous la fenêtre.
  wood(
    box(
      w.minX - SILL_OVERHANG,
      w.maxX + SILL_OVERHANG,
      w.minY - SILL_HEIGHT,
      w.minY,
      z0,
      z0 + WINDOW_SILL_DEPTH,
    ),
    1,
  );
  // Tache de lumière : carreaux projetés au sol, le haut de la fenêtre le plus loin du mur.
  const patchStart = z0 + PATCH_OFFSET;
  const scale = PATCH_DEPTH / (w.maxY - w.minY);
  const zs = ys
    .map(([lo, hi]): [number, number] => [
      snap(patchStart + (w.maxY - hi) * scale),
      snap(patchStart + (w.maxY - lo) * scale),
    ])
    .reverse();
  for (const plank of roomBlocks(dims, room)) {
    if (plank.part !== 'parquet') {
      continue;
    }
    const p = plank.box;
    for (const [x0, x1] of xs) {
      const ox = overlap(p.minX, p.maxX, snap(x0), snap(x1));
      for (const [zLo, zHi] of zs) {
        const oz = overlap(p.minZ, p.maxZ, zLo, zHi);
        if (ox && oz) {
          blocks.push({
            box: box(ox[0], ox[1], p.minY, p.maxY, oz[0], oz[1]),
            part: 'lumiere',
            shade: plank.shade,
          });
        }
      }
    }
  }
  return blocks;
}

/** Couleurs de la fenêtre : multiplicateurs (linéaires) de la vitre et de la tache au sol. */
export interface WindowLight {
  readonly glass: Rgb;
  readonly patch: Rgb;
}

/** Couleurs de la fenêtre modifiables (tampon réutilisé par `windowLightInto`). */
export interface MutableWindowLight extends WindowLight {
  readonly glass: MutableRgb;
  readonly patch: MutableRgb;
}

/** Nouveau tampon, initialisé à la lumière de midi (multiplicateurs neutres). */
export function createWindowLight(): MutableWindowLight {
  return { glass: [1, 1, 1], patch: [1, 1, 1] };
}

/**
 * Vitre en pleine nuit : multiplicateur bleu sombre (la passe palette la ramène aux bleus de
 * lune) ; sous la teinte du ciel, elle aurait viré au gris-vert de la vitre du bac.
 */
export const WINDOW_NIGHT_GLASS: Rgb = [0.05, 0.11, 0.24];
/** Clarté de la tache au sol en pleine nuit (part de celle de midi), sous la lune. */
export const WINDOW_NIGHT_PATCH = 0.15;

/**
 * Couleurs de la fenêtre sous la lumière du jour `light` (`sim/daylight.ts`) et le ciel couvert
 * `overcast` (1 : ciel dégagé, ADR 0082) : la vitre passe de `WINDOW_NIGHT_GLASS` (nuit) à la
 * teinte du ciel (jour) ; la tache au sol prend celle de la lumière directe (soleil, puis
 * lune), sa clarté passant de `WINDOW_NIGHT_PATCH` (nuit) à 1 (plein jour) ; les deux
 * multipliées par le ciel couvert. Exactement neutre (1, 1, 1) à midi, ciel dégagé ; bleutée et sombre la nuit,
 * orangée ou rosée à l'aube. Intensité et ciel couvert ramenés dans [0, 1] (non fini : 1).
 * Écrit dans `out` et le renvoie, sans allocation.
 */
export function windowLightInto(
  light: DayLight,
  overcast: number,
  out: MutableWindowLight,
): MutableWindowLight {
  const intensity = clampIntensity(light.intensity);
  const sky = clampIntensity(overcast);
  const patch = mix(WINDOW_NIGHT_PATCH, 1, intensity) * sky;
  for (let k = 0; k < 3; k++) {
    out.glass[k] = mix(WINDOW_NIGHT_GLASS[k], light.sky[k], intensity) * sky;
    out.patch[k] = light.tint[k] * patch;
  }
  return out;
}

/** Points de la fenêtre testés par `isWindowClear` : coins, milieux des bords et centre. */
const SAMPLES = [0, 0.5, 1] as const;

/**
 * Partie du segment de `p` à `q` (paramètre dans [`t0`, `t1`]) comprise entre `lo` et `hi` sur
 * un axe (méthode des tranches) : nouvel intervalle `[t0, t1]` écrit dans `out`, vide si
 * `out[0] > out[1]`.
 */
function slab(p: number, q: number, lo: number, hi: number, out: [number, number]): void {
  const d = q - p;
  if (d === 0) {
    if (p < lo || p > hi) {
      out[0] = 1;
      out[1] = 0;
    }
    return;
  }
  const a = (lo - p) / d;
  const c = (hi - p) / d;
  out[0] = Math.max(out[0], Math.min(a, c));
  out[1] = Math.min(out[1], Math.max(a, c));
}

/** Tampon de `slab` (module pur : aucun état gardé d'un appel à l'autre). */
const range: [number, number] = [0, 1];

/**
 * Vrai si le segment de (`px`, `py`, `pz`) à (`qx`, `qy`, `qz`) traverse le volume d'un bac
 * `dims` (|x| ≤ longueur / 2, 0 ≤ y ≤ hauteur, |z| ≤ profondeur / 2, bords compris).
 */
function segmentHitsTank(
  dims: TankDimensions,
  px: number,
  py: number,
  pz: number,
  qx: number,
  qy: number,
  qz: number,
): boolean {
  range[0] = 0;
  range[1] = 1;
  slab(px, qx, -dims.width / 2, dims.width / 2, range);
  slab(py, qy, 0, dims.height, range);
  slab(pz, qz, -dims.depth / 2, dims.depth / 2, range);
  return range[0] <= range[1];
}

/**
 * Vrai si la fenêtre `w` d'un bac `dims` se voit sans passer à travers le bac depuis une caméra
 * en (`x`, `y`, `z`) : aucun des neuf points de l'ouverture (coins, milieux des bords, centre)
 * n'est caché par le volume du bac (vitres comprises). Vue à travers l'eau, la fenêtre claire
 * virerait l'eau au gris ou à la menthe (passe palette, `docs/PIEGES.md`) : en vue de côté,
 * le mur du fond se voit en enfilade derrière l'eau. Ne vérifie pas le mur lui-même
 * (`isShellVisible(…, 'fond', …)`). Sans allocation : appelée à chaque image.
 */
export function isWindowClear(
  dims: TankDimensions,
  w: RoomWindow,
  x: number,
  y: number,
  z: number,
): boolean {
  const wz = w.wallZ + WINDOW_GLASS_DEPTH;
  for (const u of SAMPLES) {
    const sx = mix(w.minX, w.maxX, u);
    for (const v of SAMPLES) {
      if (segmentHitsTank(dims, x, y, z, sx, mix(w.minY, w.maxY, v), wz)) {
        return false;
      }
    }
  }
  return true;
}
