import {
  clampIntensity,
  DAY_PHASE_MIN_INTENSITY,
  mix,
  NIGHT_PHASE_MAX_INTENSITY,
  type DayLight,
  type MutableRgb,
} from './daylight';
import {
  BASEBOARD_DEPTH,
  BASEBOARD_HEIGHT,
  clampRoom,
  DEFAULT_ROOM,
  roomInterior,
  ROOM_VOXEL,
  type Room,
  type RoomBlock,
  type RoomPart,
  type RoomShell,
} from './room';
import { segmentHitsTank } from './room-window';
import type { Box3, TankDimensions } from './tank';

/**
 * Détails de la pièce (issue #363, lot 3/3 de #227, ADR 0093) : plinthes au pied des quatre
 * murs, moulure sous le plafond, porte dans le mur de droite (+X) et applique murale à côté,
 * allumée à la nuit tombante. Purement graphique, comme la pièce (`sim/room.ts`) : aucun
 * réglage ni champ de sauvegarde, tout se déduit des dimensions du bac et de la hauteur du
 * meuble.
 *
 * La porte est sur le mur de droite : la vue `side` regarde depuis +X, ce mur est derrière
 * elle ; vu de trois-quarts (de devant à droite) ou de face, aucune ligne de visée qui
 * traverse le bac ne l'atteint. La fenêtre (#342) est sur le mur du fond, à gauche du bac.
 *
 * Repère : celui du bac (mètres), sol du bac en y = 0, vitre avant du côté +Z ; parquet en
 * y = −hauteur du meuble.
 */

/** Ouverture de la porte (vantail, sans le chambranle), sur la face intérieure du mur de droite. */
export interface RoomDoor {
  /** Bords arrière (côté mur du fond) et avant de l'ouverture (selon Z). */
  readonly minZ: number;
  readonly maxZ: number;
  /** Seuil (le parquet) et haut de l'ouverture (selon Y). */
  readonly minY: number;
  readonly maxY: number;
  /** Face intérieure du mur de droite (selon X). */
  readonly wallX: number;
}

/** Largeur et hauteur visées du vantail. */
export const DOOR_WIDTH = 0.9;
export const DOOR_HEIGHT = 2.04;
/** Écart entre le bord avant du vantail et le mur d'en face. */
export const DOOR_FRONT_GAP = 0.8;
/** Chambranle : largeur des montants et de la traverse, saillie dans la pièce. */
export const DOOR_CASING = 0.07;
/**
 * Saillie du chambranle : un voxel de plus que la plinthe (2 cm au voxel), pour ne pas se
 * confondre avec elle (`docs/PIEGES.md`).
 */
export const DOOR_CASING_DEPTH = 0.03;
/** Mur plein entre le haut du chambranle et la moulure, au moins. */
export const DOOR_HEADROOM = 0.15;
/** Passage devant la porte où rien ne se pose (profondeur selon X, depuis le mur). */
export const DOOR_CLEARANCE = 0.6;
/** Hauteur de la poignée au-dessus du parquet. */
export const DOOR_HANDLE_HEIGHT = 1;

/** Plinthe des trois autres murs : saillie au voxel (celle du mur du fond, arrondie). */
export const PLINTH_DEPTH = Math.round(BASEBOARD_DEPTH / ROOM_VOXEL) * ROOM_VOXEL;
/** Moulure sous le plafond : hauteur et saillie. */
export const MOLDING_HEIGHT = 0.05;
export const MOLDING_DEPTH = 0.03;

/** Applique : hauteur visée de son centre au-dessus du parquet, écart au chambranle. */
export const LAMP_HEIGHT = 1.7;
export const LAMP_DOOR_GAP = 0.5;
/** Mur plein entre le haut du halo de l'applique et la moulure, au moins. */
const LAMP_HEADROOM = 0.1;
/** Demi-hauteur et demi-largeur du halo de l'applique sur le mur. */
const HALO_HALF = 0.3;

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

function assertDims(dims: TankDimensions): void {
  for (const value of [dims.width, dims.height, dims.depth]) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new RangeError(`dimensions invalides : ${JSON.stringify(dims)}`);
    }
  }
}

/**
 * Porte de la pièce `room` autour d'un bac `dims` : dans le mur de droite, bord avant à
 * `DOOR_FRONT_GAP` du mur d'en face, largeur `DOOR_WIDTH`, du parquet à `DOOR_HEIGHT` au plus,
 * le chambranle restant à `DOOR_HEADROOM` sous la moulure (pièce basse : porte plus basse).
 * Cotes au centimètre. Fonction pure.
 * @throws RangeError si une dimension du bac n'est pas un réel strictement positif.
 */
export function roomDoor(dims: TankDimensions, room: Room): RoomDoor {
  assertDims(dims);
  const inner = roomInterior(dims);
  const floorY = -clampRoom(room).cabinetHeight;
  const maxZ = snap(inner.maxZ - DOOR_FRONT_GAP);
  const minZ = snap(maxZ - DOOR_WIDTH);
  const ceiling = inner.ceilingY - MOLDING_HEIGHT - DOOR_HEADROOM - DOOR_CASING;
  const maxY = snap(Math.min(floorY + DOOR_HEIGHT, ceiling));
  return { minZ, maxZ, minY: snap(floorY), maxY, wallX: inner.maxX };
}

/**
 * Emprise au sol (x, z) où rien ne se pose devant la porte : chambranle compris, sur
 * `DOOR_CLEARANCE` depuis le mur (`roomArea`, `dropRoomItem`, pose automatique du
 * catalogue). Indépendante de la hauteur du meuble.
 */
export function doorClearance(dims: TankDimensions) {
  const door = roomDoor(dims, DEFAULT_ROOM);
  return {
    minX: snap(door.wallX - DOOR_CLEARANCE),
    maxX: door.wallX,
    minZ: snap(door.minZ - DOOR_CASING),
    maxZ: snap(door.maxZ + DOOR_CASING),
  };
}

/** Applique murale : centre de sa platine sur la face intérieure du mur de droite. */
export interface RoomLamp {
  readonly y: number;
  readonly z: number;
  readonly wallX: number;
  /** Rectangle du halo sur le mur (même forme qu'une porte, pour `isDoorClear`). */
  readonly halo: RoomDoor;
}

/**
 * Applique de la pièce `room` : sur le mur de droite, entre la porte et le mur du fond, à
 * `LAMP_DOOR_GAP` plus un demi-halo du chambranle ; centre à `LAMP_HEIGHT` au-dessus du
 * parquet, plus bas dans une pièce basse (halo sous la moulure). Fonction pure.
 * @throws RangeError si une dimension du bac n'est pas un réel strictement positif.
 */
export function roomLamp(dims: TankDimensions, room: Room): RoomLamp {
  const door = roomDoor(dims, room);
  const inner = roomInterior(dims);
  const highest = inner.ceilingY - MOLDING_HEIGHT - LAMP_HEADROOM - HALO_HALF;
  const y = snap(Math.min(door.minY + LAMP_HEIGHT, highest));
  const z = snap(door.minZ - DOOR_CASING - LAMP_DOOR_GAP - HALO_HALF);
  const halo: RoomDoor = {
    minZ: snap(z - HALO_HALF),
    maxZ: snap(z + HALO_HALF),
    minY: snap(y - HALO_HALF),
    maxY: snap(y + HALO_HALF),
    wallX: door.wallX,
  };
  return { y, z, wallX: door.wallX, halo };
}

/**
 * Plinthes des murs de gauche, de droite (interrompue par la porte) et d'en face, moulure
 * sous le plafond des quatre murs : chaque bloc dans la paroi de son mur (masqué avec lui).
 * Les plinthes latérales s'arrêtent à celles du fond et d'en face (aucun recouvrement). Liste
 * vide si la pièce est masquée. Fonction pure.
 * @throws RangeError si une dimension du bac n'est pas un réel strictement positif.
 */
export function roomTrimBlocks(dims: TankDimensions, room: Room): RoomBlock[] {
  assertDims(dims);
  if (!clampRoom(room).shown) {
    return [];
  }
  const { minX, maxX, minZ, maxZ, ceilingY } = roomInterior(dims);
  const door = roomDoor(dims, room);
  const floorY = door.minY;
  const top = floorY + BASEBOARD_HEIGHT;
  const d = PLINTH_DEPTH;
  const m = MOLDING_DEPTH;
  const low = ceilingY - MOLDING_HEIGHT;
  const blocks: RoomBlock[] = [];
  const add = (b: Box3, part: RoomPart, shell: RoomShell): void => {
    if (b.maxX > b.minX && b.maxY > b.minY && b.maxZ > b.minZ) {
      blocks.push({ box: b, part, shade: 1, shell });
    }
  };
  // Mur de gauche : vu de côté, sa plinthe passe derrière le bas de l'eau ; plus sombre
  // (`plinthe-ombre`), elle ne vire pas l'eau au gris (`docs/PIEGES.md`).
  add(box(minX, minX + d, floorY, top, minZ + d, maxZ - d), 'plinthe-ombre', 'gauche');
  add(box(maxX - d, maxX, floorY, top, minZ + d, door.minZ - DOOR_CASING), 'plinthe', 'droite');
  add(box(maxX - d, maxX, floorY, top, door.maxZ + DOOR_CASING, maxZ - d), 'plinthe', 'droite');
  add(box(minX, maxX, floorY, top, maxZ - d, maxZ), 'plinthe', 'avant');
  add(box(minX, maxX, low, ceilingY, minZ, minZ + m), 'moulure', 'fond');
  add(box(minX, maxX, low, ceilingY, maxZ - m, maxZ), 'moulure', 'avant');
  add(box(minX, minX + m, low, ceilingY, minZ + m, maxZ - m), 'moulure', 'gauche');
  add(box(maxX - m, maxX, low, ceilingY, minZ + m, maxZ - m), 'moulure', 'droite');
  return blocks;
}

/**
 * Blocs de la porte : chambranle (`chambranle`), vantail (`porte`, teinte 1) et ses deux
 * panneaux en relief (`porte`, teinte 0), poignée côté avant (`poignee`), tous de la paroi
 * `droite`. Liste vide si la pièce est masquée. Fonction pure.
 * @throws RangeError si une dimension du bac n'est pas un réel strictement positif.
 */
export function roomDoorBlocks(dims: TankDimensions, room: Room): RoomBlock[] {
  const door = roomDoor(dims, room);
  if (!clampRoom(room).shown) {
    return [];
  }
  const { minZ, maxZ, minY, maxY, wallX: x } = door;
  const c = DOOR_CASING;
  const blocks: RoomBlock[] = [];
  const add = (b: Box3, part: RoomPart, shade: 0 | 1): void => {
    blocks.push({ box: b, part, shade, shell: 'droite' });
  };
  const casing = x - DOOR_CASING_DEPTH;
  add(box(casing, x, minY, maxY + c, minZ - c, minZ), 'chambranle', 0);
  add(box(casing, x, minY, maxY + c, maxZ, maxZ + c), 'chambranle', 0);
  add(box(casing, x, maxY, maxY + c, minZ, maxZ), 'chambranle', 0);
  add(box(x - 0.01, x, minY, maxY, minZ, maxZ), 'porte', 1);
  // Panneaux en relief, un voxel devant le vantail : bas et haut, séparés par la traverse.
  const mid = snap(minY + DOOR_HANDLE_HEIGHT - 0.1);
  add(box(x - 0.02, x - 0.01, minY + 0.15, mid - 0.05, minZ + 0.12, maxZ - 0.12), 'porte', 0);
  add(box(x - 0.02, x - 0.01, mid + 0.05, maxY - 0.12, minZ + 0.12, maxZ - 0.12), 'porte', 0);
  const handleY = minY + DOOR_HANDLE_HEIGHT;
  add(box(x - 0.07, x - 0.01, handleY, handleY + 0.03, maxZ - 0.17, maxZ - 0.06), 'poignee', 0);
  return blocks;
}

/**
 * Blocs de l'applique : halo sur le mur (`halo`, quatre blocs en marches, affiché lampe
 * allumée), platine et bras (`applique`), abat-jour (`abat-jour`), tous de la paroi `droite`. Liste
 * vide si la pièce est masquée. Fonction pure.
 * @throws RangeError si une dimension du bac n'est pas un réel strictement positif.
 */
export function roomLampBlocks(dims: TankDimensions, room: Room): RoomBlock[] {
  const { y, z, wallX: x } = roomLamp(dims, room);
  if (!clampRoom(room).shown) {
    return [];
  }
  const add = (b: Box3, part: RoomPart, shade: 0 | 1 = 0): RoomBlock => ({
    box: b,
    part,
    shade,
    shell: 'droite',
  });
  // Halo en marches (pixel art) : deux croix emboîtées, la plus claire devant, autour de
  // l'abat-jour ; contenu dans le carré de `HALO_HALF` de côté (`RoomLamp.halo`).
  const glow = (depth: number, dy0: number, dy1: number, dz: number, shade: 0 | 1) =>
    add(box(x - depth, x, y + dy0, y + dy1, z - dz, z + dz), 'halo', shade);
  return [
    glow(0.01, -HALO_HALF, HALO_HALF, 0.16, 1),
    glow(0.01, -0.18, 0.22, 0.26, 1),
    glow(0.02, -0.1, 0.24, 0.1, 0),
    glow(0.02, -0.04, 0.18, 0.16, 0),
    add(box(x - 0.03, x - 0.01, y - 0.07, y + 0.07, z - 0.05, z + 0.05), 'applique'),
    add(box(x - 0.08, x - 0.03, y - 0.02, y, z - 0.01, z + 0.01), 'applique'),
    add(box(x - 0.18, x - 0.06, y, y + 0.13, z - 0.07, z + 0.07), 'abat-jour'),
  ];
}

/** Clarté de l'applique au-dessus de laquelle elle est éteinte, et sous laquelle pleine. */
export const LAMP_OFF_ABOVE = DAY_PHASE_MIN_INTENSITY;
export const LAMP_FULL_BELOW = NIGHT_PHASE_MAX_INTENSITY;

/**
 * Intensité de l'applique (0 : éteinte, 1 : pleine) pour une intensité du jour
 * `dayIntensity` (`sim/daylight.ts`) : nulle de jour (≥ `LAMP_OFF_ABOVE`), pleine la nuit
 * (≤ `LAMP_FULL_BELOW`), croissante entre les deux (lissage d'Hermite) au crépuscule et
 * décroissante à l'aube. Valeur non finie : 0 (éteinte).
 */
export function lampIntensity(dayIntensity: number): number {
  if (!Number.isFinite(dayIntensity)) {
    return 0;
  }
  const t = (LAMP_OFF_ABOVE - dayIntensity) / (LAMP_OFF_ABOVE - LAMP_FULL_BELOW);
  if (!(t > 0)) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  return t * t * (3 - 2 * t);
}

/** Abat-jour éteint : part de sa couleur (`koiBlanc`) gardée, il se lit comme un tissu terne. */
export const LAMP_OFF_SHADE = 0.6;
/** Abat-jour allumé : multiplicateur chaud (linéaire), la passe palette le tire vers l'or. */
export const LAMP_ON_SHADE: readonly [number, number, number] = [1, 0.82, 0.5];

/**
 * Multiplicateurs (linéaires) de l'abat-jour et du halo pour une lampe d'intensité `lamp`
 * (`lampIntensity`, ramenée dans [0, 1], non finie : 0) : abat-jour de `LAMP_OFF_SHADE`
 * (gris) à `LAMP_ON_SHADE` (chaud), halo de 0 à 1. Écrit dans `shade` et `halo`, sans
 * allocation.
 */
export function lampColorsInto(lamp: number, shade: MutableRgb, halo: MutableRgb): void {
  const k = Number.isFinite(lamp) ? Math.min(1, Math.max(0, lamp)) : 0;
  for (let i = 0; i < 3; i++) {
    shade[i] = mix(LAMP_OFF_SHADE, LAMP_ON_SHADE[i], k);
    halo[i] = k;
  }
}

/** Points de la porte testés par `isDoorClear` : coins, milieux des bords et centre. */
const SAMPLES = [0, 0.5, 1] as const;

/**
 * Vrai si la porte `door` d'un bac `dims` se voit sans passer à travers le bac depuis une
 * caméra en (`x`, `y`, `z`) : aucun des neuf points de l'ouverture n'est caché par le volume
 * du bac (`segmentHitsTank`). Comme la fenêtre (`isWindowClear`), un objet clair vu à travers
 * l'eau la virerait au gris (`docs/PIEGES.md`). Sans allocation : appelée à chaque image.
 */
export function isDoorClear(
  dims: TankDimensions,
  door: RoomDoor,
  x: number,
  y: number,
  z: number,
): boolean {
  for (const u of SAMPLES) {
    const sz = mix(door.minZ, door.maxZ, u);
    for (const v of SAMPLES) {
      if (segmentHitsTank(dims, x, y, z, door.wallX, mix(door.minY, door.maxY, v), sz)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Clarté de la porte et de son chambranle (#388), part de leurs couleurs de palette : en
 * plein jour, assez sombre pour ne pas ressortir en aplat clair sur le mur presque noir ;
 * la nuit, plus sombre encore (seule la lampe et la lune éclairent la pièce).
 */
export const DOOR_DAY_LIGHT = 0.7;
export const DOOR_NIGHT_LIGHT = 0.35;

/**
 * Multiplicateur de couleur de la porte sous la lumière du jour `light` et le ciel couvert
 * `overcast` (1 : dégagé) : de `DOOR_NIGHT_LIGHT` (nuit) à `DOOR_DAY_LIGHT` (plein jour),
 * teinté par le ciel (ambiante) et multiplié par le ciel couvert. Intensité et ciel couvert
 * ramenés dans [0, 1] (non fini : 1). Écrit dans `out` et le renvoie, sans allocation.
 */
export function doorLightInto(light: DayLight, overcast: number, out: MutableRgb): MutableRgb {
  const level = mix(DOOR_NIGHT_LIGHT, DOOR_DAY_LIGHT, clampIntensity(light.intensity));
  const sky = clampIntensity(overcast);
  for (let k = 0; k < 3; k++) {
    const tint = Number.isFinite(light.sky[k]) ? Math.min(1, Math.max(0, light.sky[k])) : 1;
    out[k] = level * tint * sky;
  }
  return out;
}
