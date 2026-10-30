import { clampDimension, type Box3, type DimensionRange, type TankDimensions } from './tank';
import type { EnvironmentId } from './environment';

/**
 * Pièce autour du bac (issue #187, ADR 0048) : un sol de lames de parquet, un mur du fond
 * avec sa plinthe et un meuble support sous le bac ; depuis #324 (ADR 0081), une pièce
 * fermée : trois autres murs, un plafond et des poutres apparentes. Purement graphique : la simulation des
 * animaux ne la lit jamais.
 *
 * Le modèle (`Room`) est une petite donnée enregistrée avec les réglages de la sauvegarde ;
 * la disposition (`roomBlocks`) en est déduite, avec les dimensions du bac, par une fonction
 * pure : des blocs alignés sur les axes, aux tailles en centimètres entiers, que le rendu
 * dessine en voxels (`render/room-layer.ts`).
 *
 * Repère : celui du bac (mètres), sol du bac en y = 0, centré en X et Z ; la vitre avant est
 * du côté +Z. Le meuble est sous le bac (y < 0), le mur derrière (z < −profondeur / 2).
 */

/** Réglages de la pièce. */
export interface Room {
  /** Pièce affichée (case « Afficher la pièce »). */
  readonly shown: boolean;
  /** Hauteur du meuble support, en mètres (`ROOM_LIMITS`). */
  readonly cabinetHeight: number;
  /**
   * Meubles et plantes posés dans la pièce (issue #188, `sim/room-furniture.ts`).
   * Facultatif : absent ou vide, la pièce est nue (pièces d'avant #188 identiques à l'octet).
   */
  readonly items?: readonly RoomItem[];
}

/** Types d'éléments de la pièce (catalogue de `sim/room-furniture.ts`). */
export const ROOM_ITEM_KINDS = ['etagere', 'table-basse', 'canape', 'plante-pot'] as const;
export type RoomItemKind = (typeof ROOM_ITEM_KINDS)[number];

/** Quart de tour d'un élément de la pièce autour de la verticale (0 : face à +Z). */
export type RoomQuarter = 0 | 1 | 2 | 3;

/**
 * Élément posé dans la pièce : type, centre de son emprise au sol (x, z, repère du bac, en
 * mètres, au centimètre), quart de tour, et hauteur de sa base au-dessus du parquet
 * (`elevation`, omise au sol), calculée par la pose par gravité (`dropRoomItem`).
 */
export interface RoomItem {
  readonly kind: RoomItemKind;
  readonly x: number;
  readonly z: number;
  readonly quarter: RoomQuarter;
  readonly elevation?: number;
}

/** Nombre maximal d'éléments dans la pièce. */
export const MAX_ROOM_ITEMS = 24;

/** Bornes et pas des réglages numériques de la pièce. */
export const ROOM_LIMITS: Readonly<{ cabinetHeight: DimensionRange }> = {
  cabinetHeight: { min: 0.6, max: 1, step: 0.05 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Pièce par défaut : masquée (rendu inchangé), meuble de 75 cm. */
export const DEFAULT_ROOM: Room = { shown: false, cabinetHeight: 0.75 };

/** Environnements où la pièce peut être affichée (le bac tropical seulement, #187). */
export const ROOM_ENVIRONMENTS: readonly EnvironmentId[] = ['tropical'];

/** Vrai si la pièce peut être affichée autour de l'environnement `id`. */
export function isRoomAvailable(id: EnvironmentId): boolean {
  return ROOM_ENVIRONMENTS.includes(id);
}

/**
 * Pièce `room` aux réglages bornés (`ROOM_LIMITS`, au pas) : une valeur hors bornes est
 * ramenée à la borne ; une hauteur non finie prend celle de `DEFAULT_ROOM`. Nouvel objet.
 */
export function clampRoom(room: Room): Room {
  const clamped: Room = {
    shown: room.shown === true,
    cabinetHeight: clampDimension(
      room.cabinetHeight,
      ROOM_LIMITS.cabinetHeight,
      DEFAULT_ROOM.cabinetHeight,
    ),
  };
  return room.items && room.items.length > 0 ? { ...clamped, items: room.items } : clamped;
}

function sameItem(a: RoomItem, b: RoomItem): boolean {
  return (
    a.kind === b.kind &&
    a.x === b.x &&
    a.z === b.z &&
    a.quarter === b.quarter &&
    (a.elevation ?? 0) === (b.elevation ?? 0)
  );
}

/** Vrai si `a` et `b` décrivent la même pièce (éléments compris, dans le même ordre). */
export function sameRoom(a: Room, b: Room): boolean {
  const itemsA = a.items ?? [];
  const itemsB = b.items ?? [];
  return (
    a.shown === b.shown &&
    a.cabinetHeight === b.cabinetHeight &&
    itemsA.length === itemsB.length &&
    itemsA.every((item, i) => sameItem(item, itemsB[i]))
  );
}

/** Copie d'un élément, champs connus seulement ; `elevation` omise au sol. */
export function roomItemData(item: RoomItem): RoomItem {
  const data: RoomItem = { kind: item.kind, x: item.x, z: item.z, quarter: item.quarter };
  return item.elevation !== undefined && item.elevation > 0
    ? { ...data, elevation: item.elevation }
    : data;
}

/**
 * Pièce enregistrée dans une sauvegarde (copie simple, champs connus seulement) ; `items`
 * n'est écrit que s'il y a des éléments.
 */
export function roomData(room: Room): Room {
  const data: Room = { shown: room.shown, cabinetHeight: room.cabinetHeight };
  return room.items && room.items.length > 0
    ? { ...data, items: room.items.map(roomItemData) }
    : data;
}

/** Plus grande cote acceptée pour un élément relu (position ou élévation), en mètres. */
const MAX_ITEM_COORD = 100;

function isQuarter(value: unknown): value is RoomQuarter {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

/**
 * Relit l'élément `value` d'une sauvegarde : `kind` du catalogue, `x` et `z` réels finis
 * (|v| ≤ 100 m), `quarter` entier de 0 à 3, `elevation` facultative, réelle finie dans
 * [0, 100 m]. `null` si l'élément est invalide. Propriétés propres seulement.
 */
export function readRoomItem(value: unknown): RoomItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const field = (key: string): unknown => (Object.hasOwn(value, key) ? value[key] : undefined);
  const kind = field('kind');
  const x = field('x');
  const z = field('z');
  const quarter = field('quarter');
  const elevation = field('elevation');
  const isCoord = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_ITEM_COORD;
  if (
    typeof kind !== 'string' ||
    !(ROOM_ITEM_KINDS as readonly string[]).includes(kind) ||
    !isCoord(x) ||
    !isCoord(z) ||
    !isQuarter(quarter) ||
    (elevation !== undefined && (!isCoord(elevation) || elevation < 0))
  ) {
    return null;
  }
  return roomItemData({ kind: kind as RoomItemKind, x, z, quarter, elevation });
}

/** Résultat de `readRoom` : la pièce lue (bornée), ou la raison du refus. */
export type ReadRoomResult =
  { readonly ok: true; readonly room: Room } | { readonly ok: false; readonly error: string };

/**
 * Relit la pièce d'une sauvegarde : objet avec `shown` (booléen, obligatoire) et
 * `cabinetHeight` (réel fini, facultatif : absent, celui de `DEFAULT_ROOM`). Une hauteur
 * hors bornes est bornée, pas refusée. `items` (#188) facultatif : liste d'au plus
 * `MAX_ROOM_ITEMS` éléments valides (`readRoomItem`), sinon refus. Seules les propriétés
 * propres sont lues ; les champs inconnus sont ignorés. Ne lève jamais.
 */
export function readRoom(value: unknown): ReadRoomResult {
  if (!isRecord(value)) {
    return { ok: false, error: 'pièce : doit être un objet' };
  }
  const shown = Object.hasOwn(value, 'shown') ? value['shown'] : undefined;
  if (typeof shown !== 'boolean') {
    return { ok: false, error: 'pièce : shown doit être un booléen' };
  }
  const height = Object.hasOwn(value, 'cabinetHeight')
    ? value['cabinetHeight']
    : DEFAULT_ROOM.cabinetHeight;
  if (typeof height !== 'number' || !Number.isFinite(height)) {
    return { ok: false, error: 'pièce : cabinetHeight doit être un nombre fini' };
  }
  const itemsValue = Object.hasOwn(value, 'items') ? value['items'] : undefined;
  if (itemsValue === undefined) {
    return { ok: true, room: clampRoom({ shown, cabinetHeight: height }) };
  }
  if (!Array.isArray(itemsValue) || itemsValue.length > MAX_ROOM_ITEMS) {
    return {
      ok: false,
      error: `pièce : items doit être une liste de ${MAX_ROOM_ITEMS} éléments au plus`,
    };
  }
  const items: RoomItem[] = [];
  for (const [i, entry] of itemsValue.entries()) {
    const item = readRoomItem(entry);
    if (!item) {
      return { ok: false, error: `pièce : élément ${i} invalide` };
    }
    items.push(item);
  }
  return { ok: true, room: clampRoom({ shown, cabinetHeight: height, items }) };
}

/** Partie de la pièce à laquelle appartient un bloc (choisit sa couleur au rendu). */
export type RoomPart =
  | 'parquet'
  | 'mur'
  | 'cimaise'
  | 'plinthe'
  | 'plateau'
  | 'caisson'
  | 'porte'
  | 'poignee'
  | 'socle'
  // Enveloppe de la pièce (#324) : plafond et poutres apparentes.
  | 'plafond'
  | 'poutre'
  // Fenêtre du mur du fond (#342, `sim/room-window.ts`) : bois, vitre, tache de lumière au sol.
  | 'fenetre'
  | 'vitre'
  | 'lumiere'
  // Meubles et plantes de la pièce (#188).
  | 'bois'
  | 'livre'
  | 'tissu'
  | 'coussin'
  | 'pot'
  | 'feuillage'
  // Bacs posés de la pièce de N bacs (#305, lot 2b) : cadre, eau et sol du bac.
  | 'cadre'
  | 'eau'
  | 'substrat';

/**
 * Paroi de l'enveloppe de la pièce (#324) : mur du fond (derrière le bac), murs de gauche
 * (−X), de droite (+X) et d'en face (+Z, devant le bac), plafond et ses poutres. Chacune est
 * masquée seule quand la caméra passe de l'autre côté (`roomVisibility`).
 */
export type RoomShell = 'fond' | 'gauche' | 'droite' | 'avant' | 'plafond';

/** Parois de l'enveloppe, dans l'ordre de construction des blocs. */
export const ROOM_SHELLS: readonly RoomShell[] = ['fond', 'gauche', 'droite', 'avant', 'plafond'];

/** Bloc de la pièce : boîte alignée sur les axes, partie et teinte (0 ou 1). */
export interface RoomBlock {
  readonly box: Box3;
  readonly part: RoomPart;
  /** Variante de teinte, pour alterner deux tons (lames de parquet). */
  readonly shade: 0 | 1;
  /** Paroi de l'enveloppe à laquelle le bloc appartient (#324) ; absente hors enveloppe. */
  readonly shell?: RoomShell;
}

/** Côté du voxel de la pièce : toutes les cotes des blocs en sont des multiples (1 cm). */
export const ROOM_VOXEL = 0.01;
/** Débord du plateau du meuble autour du bac, en mètres. */
export const CABINET_OVERHANG = 0.02;
/** Épaisseur du plateau du meuble. */
export const CABINET_TOP_THICKNESS = 0.04;
/** Hauteur du socle (en retrait) au pied du meuble. */
export const CABINET_PLINTH_HEIGHT = 0.08;
/** Espace entre la vitre arrière du bac et le mur. */
export const WALL_GAP = 0.1;
/** Épaisseur du mur et du sol. */
export const WALL_THICKNESS = 0.05;
export const FLOOR_THICKNESS = 0.03;
/** Hauteur du mur au-dessus du haut du bac. */
export const WALL_RISE = 1.2;
/** Saillie de la plinthe du mur dans la pièce. */
export const BASEBOARD_DEPTH = 0.015;
/** Étendue du sol et du mur de chaque côté du bac, et du sol devant lui. */
export const ROOM_MARGIN = 3;
/** Lames de parquet : largeur (selon Z) et longueur (selon X), décalées d'une rangée à l'autre. */
export const PLANK_WIDTH = 0.12;
export const PLANK_LENGTH = 0.72;
/** Décalage de la longueur des lames d'une rangée à la suivante (pose « à l'anglaise »). */
const PLANK_STAGGER = [0, 0.36, 0.12, 0.48, 0.24, 0.6] as const;
/** Largeur visée d'une porte du meuble ; un nombre pair de portes divise exactement la façade. */
const DOOR_WIDTH = 0.4;
/** Jeu entre deux portes et autour des portes. */
const DOOR_GAP = 0.01;
/** Saillie des portes, de la plinthe et des poignées. */
const DOOR_DEPTH = 0.01;
const BASEBOARD_HEIGHT = 0.08;
/** Cimaise : baguette horizontale du mur, au-dessus du haut du bac (hauteur de son bas). */
export const RAIL_RISE = 0.25;
const RAIL_HEIGHT = 0.03;
/** Épaisseur du plafond (au-dessus du haut des murs). */
export const CEILING_THICKNESS = 0.05;
/** Poutres apparentes (#324) : largeur (selon X), retombée sous le plafond, entraxe visé. */
export const BEAM_WIDTH = 0.14;
export const BEAM_DROP = 0.18;
export const BEAM_SPACING = 1;

/**
 * Teinte d'une lame, tirée d'un hachage entier de son rang et de sa rangée : fixe, sans
 * motif diagonal (une alternance stricte dessinait des escaliers).
 */
export function plankShade(row: number, plank: number): 0 | 1 {
  let h = Math.imul(row ^ 0x5bd1e995, 0x27d4eb2d) ^ Math.imul(plank + 0x9e37, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) % 2 === 0 ? 0 : 1;
}

/** Arrondi d'une cote au voxel de la pièce (1 cm). */
function snap(value: number): number {
  return Math.round(value / ROOM_VOXEL) * ROOM_VOXEL;
}

function box(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number) {
  return {
    minX: snap(minX),
    maxX: snap(maxX),
    minY: snap(minY),
    maxY: snap(maxY),
    minZ: snap(minZ),
    maxZ: snap(maxZ),
  };
}

/** Demi-dimension arrondie au voxel, par excès (voir `roomBlocks`). */
function halfUp(size: number): number {
  return Math.ceil(size / 2 / ROOM_VOXEL - 1e-9) * ROOM_VOXEL;
}

/** Faces intérieures de l'enveloppe de la pièce (repère du bac, mètres). */
export interface RoomInterior {
  /** Faces intérieures des murs de gauche et de droite. */
  readonly minX: number;
  readonly maxX: number;
  /** Face du mur du fond (côté pièce) et face du mur d'en face (côté pièce). */
  readonly minZ: number;
  readonly maxZ: number;
  /** Sous-face du plafond et dessous des poutres. */
  readonly ceilingY: number;
  readonly beamY: number;
}

/**
 * Faces intérieures de la pièce autour d'un bac `dims` : murs à `ROOM_MARGIN` des côtés et de
 * la vitre avant, mur du fond à `WALL_GAP` de la vitre arrière, plafond à `WALL_RISE`
 * au-dessus du haut du bac. Indépendantes de la hauteur du meuble. Fonction pure.
 */
export function roomInterior(dims: TankDimensions): RoomInterior {
  const halfW = halfUp(dims.width);
  const halfD = halfUp(dims.depth);
  const ceilingY = snap(dims.height + WALL_RISE);
  return {
    minX: snap(-halfW - ROOM_MARGIN),
    maxX: snap(halfW + ROOM_MARGIN),
    minZ: snap(-halfD - WALL_GAP),
    maxZ: snap(halfD + ROOM_MARGIN),
    ceilingY,
    beamY: snap(ceilingY - BEAM_DROP),
  };
}

/**
 * Enveloppe de la pièce (#324) : murs de gauche, de droite et d'en face, du dessous du parquet
 * au plafond, hors de l'aire du parquet (ils ne la réduisent pas) ; cimaise du mur du fond
 * reprise sur le mur d'en face ; murs latéraux plus sombres (teinte 1) ; plafond couvrant les
 * murs ;
 * poutres selon Z, d'un mur à l'autre (du fond à celui d'en face), réparties à entraxe égal
 * selon X, la première et la dernière à une demi-travée des murs latéraux.
 */
function shellBlocks(
  inner: RoomInterior,
  floorBottom: number,
  railY: number,
  add: (b: Box3, part: RoomPart, shade: 0 | 1, shell: RoomShell) => void,
): void {
  const { minX, maxX, minZ, maxZ, ceilingY, beamY } = inner;
  const t = WALL_THICKNESS;
  const d = BASEBOARD_DEPTH;
  const railTop = railY + RAIL_HEIGHT;
  // Murs latéraux en teinte 1 (plus sombre, « à l'ombre ») : le coin avec le mur du fond se
  // lit sans repère clair qui, vu de côté, passerait derrière l'eau du bac.
  add(box(minX - t, minX, floorBottom, ceilingY, minZ - t, maxZ + t), 'mur', 1, 'gauche');
  add(box(maxX, maxX + t, floorBottom, ceilingY, minZ - t, maxZ + t), 'mur', 1, 'droite');
  add(box(minX, maxX, floorBottom, ceilingY, maxZ, maxZ + t), 'mur', 0, 'avant');
  add(box(minX, maxX, railY, railTop, maxZ - d, maxZ), 'cimaise', 0, 'avant');
  add(
    box(minX - t, maxX + t, ceilingY, ceilingY + CEILING_THICKNESS, minZ - t, maxZ + t),
    'plafond',
    0,
    'plafond',
  );
  const width = maxX - minX;
  const beams = Math.max(2, Math.round(width / BEAM_SPACING));
  // Centres au centimètre : l'entraxe arrondi garde des poutres de largeur égale.
  const pitchCm = Math.round((width / beams) * 100);
  const startCm = Math.round(minX * 100 + (width * 100 - pitchCm * (beams - 1)) / 2);
  const halfBeamCm = Math.round(BEAM_WIDTH * 50);
  for (let i = 0; i < beams; i++) {
    const centerCm = startCm + i * pitchCm;
    add(
      box(
        (centerCm - halfBeamCm) / 100,
        (centerCm + halfBeamCm) / 100,
        beamY,
        ceilingY,
        minZ,
        maxZ,
      ),
      'poutre',
      (i % 2) as 0 | 1,
      'plafond',
    );
  }
}

/**
 * Blocs de la pièce autour d'un bac `dims` (dimensions réelles du monde), pour la pièce
 * `room` (bornée par `clampRoom`). Renvoie une liste vide si la pièce est masquée. Aucun
 * bloc n'entre dans le volume du bac (`0 ≤ y ≤ hauteur`, |x| ≤ longueur / 2,
 * |z| ≤ profondeur / 2) ; toutes les cotes sont des multiples de `ROOM_VOXEL`. Fonction
 * pure : mêmes entrées, mêmes blocs.
 * @throws RangeError si une dimension du bac n'est pas un réel strictement positif.
 */
export function roomBlocks(dims: TankDimensions, room: Room): RoomBlock[] {
  for (const value of [dims.width, dims.height, dims.depth]) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new RangeError(`dimensions invalides : ${JSON.stringify(dims)}`);
    }
  }
  const { shown, cabinetHeight } = clampRoom(room);
  if (!shown) {
    return [];
  }
  const blocks: RoomBlock[] = [];
  const add = (b: Box3, part: RoomPart, shade: 0 | 1 = 0, shell?: RoomShell): void => {
    if (b.maxX > b.minX && b.maxY > b.minY && b.maxZ > b.minZ) {
      blocks.push(shell ? { box: b, part, shade, shell } : { box: b, part, shade });
    }
  };
  // Demi-dimensions arrondies une fois au voxel, par excès : les cotes suivantes en sont des
  // sommes de pas. Arrondies une à une, deux cotes voisines pouvaient se confondre
  // (`Math.round(-17.5)` vaut −17, `Math.round(17.5)` vaut 18 : poignée d'épaisseur nulle).
  const halfW = halfUp(dims.width);
  const halfD = halfUp(dims.depth);
  const floorY = -cabinetHeight;
  const wallFront = -halfD - WALL_GAP;
  const minX = -halfW - ROOM_MARGIN;
  const maxX = halfW + ROOM_MARGIN;

  // Meuble : plateau au débord, caisson, portes sur la façade, poignées, socle en retrait.
  const cx = halfW + CABINET_OVERHANG;
  const cz = halfD + CABINET_OVERHANG;
  add(box(-cx, cx, -CABINET_TOP_THICKNESS, 0, -cz, cz), 'plateau');
  const bodyX = cx - DOOR_DEPTH;
  const bodyFront = cz - 2 * DOOR_DEPTH;
  const bodyBottom = floorY + CABINET_PLINTH_HEIGHT;
  add(box(-bodyX, bodyX, bodyBottom, -CABINET_TOP_THICKNESS, -bodyFront, bodyFront), 'caisson');
  add(
    box(-bodyX + 0.03, bodyX - 0.03, floorY, bodyBottom, -bodyFront + 0.03, bodyFront - 0.03),
    'socle',
  );
  const doors = 2 * Math.max(1, Math.round((2 * bodyX) / (2 * DOOR_WIDTH)));
  const doorStep = (2 * bodyX) / doors;
  const doorTop = -CABINET_TOP_THICKNESS - DOOR_GAP;
  const doorBottom = bodyBottom + DOOR_GAP;
  for (let i = 0; i < doors; i++) {
    const left = -bodyX + i * doorStep + DOOR_GAP / 2;
    const right = -bodyX + (i + 1) * doorStep - DOOR_GAP / 2;
    add(box(left, right, doorBottom, doorTop, bodyFront, bodyFront + DOOR_DEPTH), 'porte');
    // Poignée côté intérieur de chaque paire de portes, au tiers haut.
    const handleX = snap(i % 2 === 0 ? right - 0.04 : left + 0.02);
    const handleY = snap(doorTop - (doorTop - doorBottom) / 3);
    add(
      box(
        handleX,
        handleX + 0.02,
        handleY - 0.04,
        handleY + 0.04,
        bodyFront + DOOR_DEPTH,
        bodyFront + 2 * DOOR_DEPTH,
      ),
      'poignee',
    );
  }

  // Sol : lames de parquet selon X, rangées selon Z, du mur jusque devant le bac.
  const floorFront = halfD + ROOM_MARGIN;
  const rows = Math.ceil((floorFront - wallFront) / PLANK_WIDTH);
  for (let row = 0; row < rows; row++) {
    const z0 = wallFront + row * PLANK_WIDTH;
    const z1 = Math.min(floorFront, z0 + PLANK_WIDTH);
    let x0 = minX;
    let x1 = minX + PLANK_LENGTH - PLANK_STAGGER[row % PLANK_STAGGER.length];
    let plank = 0;
    while (x0 < maxX) {
      const end = Math.min(maxX, x1);
      add(
        box(x0, end, floorY - FLOOR_THICKNESS, floorY, z0, z1),
        'parquet',
        plankShade(row, plank),
      );
      x0 = end;
      x1 = end + PLANK_LENGTH;
      plank++;
    }
  }

  // Mur du fond, cimaise au-dessus du bac, plinthe à son pied.
  const wallTop = dims.height + WALL_RISE;
  add(
    box(minX, maxX, floorY - FLOOR_THICKNESS, wallTop, wallFront - WALL_THICKNESS, wallFront),
    'mur',
    0,
    'fond',
  );
  const railY = dims.height + RAIL_RISE;
  add(
    box(minX, maxX, railY, railY + RAIL_HEIGHT, wallFront, wallFront + BASEBOARD_DEPTH),
    'cimaise',
    0,
    'fond',
  );
  add(
    box(minX, maxX, floorY, floorY + BASEBOARD_HEIGHT, wallFront, wallFront + BASEBOARD_DEPTH),
    'plinthe',
  );

  // Enveloppe (#324) : trois autres murs, plafond et poutres.
  shellBlocks(roomInterior(dims), floorY - FLOOR_THICKNESS, railY, add);
  return blocks;
}

/** Parties de la pièce affichées selon la position de la caméra. */
export interface RoomVisibility {
  /** Toute la pièce (sol, meuble, murs, plafond). */
  readonly room: boolean;
  /** Le mur du fond et sa cimaise. */
  readonly wall: boolean;
  /** Murs de gauche (−X), de droite (+X) et d'en face (+Z) (#324). */
  readonly left: boolean;
  readonly right: boolean;
  readonly front: boolean;
  /** Le plafond et ses poutres (#324). */
  readonly ceiling: boolean;
}

/**
 * Parties de la pièce à afficher pour une caméra en (`x`, `y`, `z`) (repère du bac) : sous le
 * fond du bac (y < 0), le meuble et le sol cacheraient le bac, la pièce est masquée ; de
 * l'intérieur, tout est affiché ; vu de l'extérieur, chaque mur dont la caméra a franchi la
 * face intérieure est masqué, et le plafond dès que la caméra atteint le dessous des poutres.
 * Rien ne cache ainsi le bac, sous aucun angle. Fonction pure.
 */
export function roomVisibility(
  dims: TankDimensions,
  x: number,
  y: number,
  z: number,
): RoomVisibility {
  const inner = roomInterior(dims);
  return {
    room: y >= 0,
    wall: isShellVisible(inner, 'fond', x, y, z),
    left: isShellVisible(inner, 'gauche', x, y, z),
    right: isShellVisible(inner, 'droite', x, y, z),
    front: isShellVisible(inner, 'avant', x, y, z),
    ceiling: isShellVisible(inner, 'plafond', x, y, z),
  };
}

/**
 * Vrai si la paroi `shell` est affichée depuis une caméra en (`x`, `y`, `z`), `inner` étant
 * `roomInterior(dims)` (règles de `roomVisibility`) : chaque paroi est masquée dès que la
 * caméra franchit sa face intérieure, mur du fond compris (`inner.minZ`, arrondie au voxel).
 * Sans allocation : appelée à chaque image par la couche de la pièce, avec les faces
 * intérieures calculées une fois.
 */
export function isShellVisible(
  inner: RoomInterior,
  shell: RoomShell,
  x: number,
  y: number,
  z: number,
): boolean {
  if (!(y >= 0)) {
    return false;
  }
  switch (shell) {
    case 'fond':
      return z >= inner.minZ;
    case 'gauche':
      return x >= inner.minX;
    case 'droite':
      return x <= inner.maxX;
    case 'avant':
      return z <= inner.maxZ;
    case 'plafond':
      return y < inner.beamY;
  }
}
