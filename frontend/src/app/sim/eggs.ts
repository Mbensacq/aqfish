import { deriveSeed, prngOutput } from '../core/random/prng';
import { MAX_TOTAL_FISH, SIM_DT } from './constants';
import type { Anemone } from './anemones';
import { rockSpheres, type DecorItem } from './decor';
import { FED_HUNGER, isFry, isPredator } from './fry';
import { SPECIES, type SpeciesId } from './species';
import type { LilyPad } from './lily-pads';
import type { Fish } from './swimmer';
import type { Box3 } from './tank';

/**
 * Ponte et œufs des corydoras (issue #478, ADR 0111).
 *
 * - **Ponte** : calendrier sans état, comme la mise bas des guppys (`sim/fry.ts`). Le temps
 *   simulé est découpé en périodes de `SPAWN_PERIOD` secondes ; au dernier pas de chaque
 *   période, une espèce ovipare (`EGG_SPECIES`) qui compte au moins `SPAWN_MIN_ADULTS` adultes
 *   en bonne santé et nourris, dans une eau bonne au pH toléré et à une température dans
 *   `SPAWN_TEMPERATURE`, pond une ponte de `MIN_CLUTCH` à `MAX_CLUTCH` œufs. Nombre, surfaces
 *   et positions sont tirés du hachage (graine du monde, espèce, rang de la période) : aucun
 *   tirage pris aux générateurs des poissons.
 * - **Surfaces** : la vitre de devant ou de derrière (œuf exposé) et, s'il y en a, les plantes
 *   du décor (œuf caché dans le feuillage), bas dans l'eau.
 * - **Prédation** : un adulte nageur (`isPredator`) à portée d'un œuf de la vitre
 *   (`EGG_EAT_RADIUS`, plus `EGG_GLASS_REACH` vers la vitre) le mange ; les œufs des plantes sont à l'abri. Aucun adulte n'en meurt.
 * - **Éclosion** : à `EGG_HATCH_TIME` secondes, l'œuf devient un alevin (`Fish.growth`, même
 *   croissance et mêmes cachettes que les alevins de guppy), dans la limite des plafonds.
 * - **Plafonds** : œufs et animaux de l'espèce ne dépassent pas `maxPopulation` (œufs d'une
 *   espèce sans alevin exclus, `eggRoom`), œufs et animaux du bac `MAX_TOTAL_FISH`, et le bac
 *   garde au plus `MAX_EGGS` œufs.
 *
 * - **Poisson-clown** (issue #653) : même calendrier, mêmes conditions (température propre à
 *   l'espèce, `spawnTemperature`) ; la ponte est collée sur une surface dure près d'une anémone
 *   (`layReefClutch`) : le flanc du rocher le plus proche (`'rocher'`) ou, sans rocher à
 *   portée, le sable au pied de l'anémone (`'sol'`). Sans anémone, aucune ponte. Ces œufs, gardés
 *   par le couple, ne sont pas mangés ; ils éclosent en larves planctoniques qui quittent le bac
 *   (`hatchesToFry` faux : aucun alevin).
 *
 * - **Poisson rouge** (issue #675) : même calendrier ; frai dès 15 °C (`GOLDFISH_SPAWN_TEMPERATURE`,
 *   FishKeeper : poursuite de frai « à 15 °C et au-dessus », œufs « parmi la végétation
 *   aquatique »). Les œufs sont collés sur la végétation seulement (`layVegetationClutch`) : au
 *   pied des plantes du décor ou le long des tiges des nénuphars, sous les feuilles. Sans
 *   végétation, aucune ponte. Ces œufs sont exposés : un adulte nageur à portée
 *   (`EGG_EAT_RADIUS`) les mange, comme ceux de la vitre. Ils éclosent sans alevin (alevins du
 *   poisson rouge hors périmètre de #675).
 *
 * - **Triton** (issue #676) : même calendrier ; ponte de 15 à 23 °C (`NEWT_SPAWN_TEMPERATURE`,
 *   Caudata Culture), un œuf par période (`LEAF_CLUTCH`), posé dans une feuille immergée libre
 *   d'une plante enracinée (`layLeafClutch`, `sim/eggs-leaf.ts`) : un œuf par feuille. Sans plante, aucune
 *   ponte. Repliés dans la feuille, ils ne sont pas mangés ; ils éclosent sans larve simulée.
 *
 * Toutes les valeurs sont des **approximations de jeu** : dans la nature, l'éclosion prend
 * plusieurs jours et une ponte compte souvent plusieurs dizaines d'œufs (plusieurs centaines
 * pour le poisson-clown).
 */

/** Espèces ovipares qui pondent des œufs dans la simulation. */
export const EGG_SPECIES: readonly SpeciesId[] = Object.freeze([
  'corydora',
  'clown',
  'rouge',
  'triton',
]);
/**
 * Espèces dont la ponte est collée près d'une anémone (`layReefClutch`) et dont les œufs
 * éclosent en larves planctoniques, qui quittent le bac (issue #653).
 */
export const REEF_EGG_SPECIES: readonly SpeciesId[] = Object.freeze(['clown']);
/**
 * Espèces qui fraient sur la végétation seulement (`layVegetationClutch`), œufs exposés aux
 * adultes, éclosion sans alevin (issue #675).
 */
export const VEGETATION_EGG_SPECIES: readonly SpeciesId[] = Object.freeze(['rouge']);
/**
 * Espèces qui pondent un à un dans les feuilles des plantes (`layLeafClutch` de
 * `sim/eggs-leaf.ts`, issue #676) : œufs isolés, repliés dans la feuille (à l'abri des adultes),
 * éclosion sans larve simulée.
 */
export const LEAF_EGG_SPECIES: readonly SpeciesId[] = Object.freeze(['triton']);

/** Période de ponte, en secondes simulées. */
export const SPAWN_PERIOD = 600;
/** Période de ponte en pas de `SIM_DT`. */
export const SPAWN_TICKS = Math.round(SPAWN_PERIOD / SIM_DT);
/** Nombre minimal d'adultes en forme de l'espèce pour une ponte (un couple). */
export const SPAWN_MIN_ADULTS = 2;
/** Température de l'eau permettant la ponte, en °C, bornes comprises. */
export const SPAWN_TEMPERATURE: readonly [number, number] = Object.freeze([22, 26]) as readonly [
  number,
  number,
];
/**
 * Température de ponte du poisson-clown, en °C, bornes comprises : approximation de jeu dans
 * la plage tolérée de l'espèce (fiche), autour des 26 °C du récif.
 */
export const REEF_SPAWN_TEMPERATURE: readonly [number, number] = Object.freeze([
  24, 28,
]) as readonly [number, number];
/**
 * Température de frai du poisson rouge, en °C, bornes comprises : 15 °C (FishKeeper, frai « à
 * 15 °C et au-dessus ») jusqu'au haut de la plage préférée du jeu (22 °C, approximation de jeu) :
 * l'eau qui se réchauffe au printemps. Le bassin (18 °C) est dans la plage.
 */
export const GOLDFISH_SPAWN_TEMPERATURE: readonly [number, number] = Object.freeze([
  15, 22,
]) as readonly [number, number];
/**
 * Profondeur d'un œuf sous la surface, le long de la tige d'un nénuphar, en mètres : de `min` à
 * `max`. Assez bas pour se voir sous la feuille en vue trois-quarts, sans toucher le fond du
 * bassin (30 cm d'eau). Approximation de jeu.
 */
export const LILY_EGG_DEPTH = { min: 0.08, max: 0.2 } as const;
/**
 * Écart horizontal d'un œuf à la tige de sa feuille (à l'ancre, la tige partant du fond), en
 * mètres (au plus).
 */
export const LILY_STEM_SPREAD = 0.04;
/**
 * Pas vertical entre deux œufs successifs d'une même tige, en mètres (#685) : les œufs d'une
 * tige s'étagent sur `LILY_EGG_DEPTH` (en revenant en haut quand la plage est pleine) et
 * alternent de part et d'autre de la tige, à `LILY_STEM_SPREAD`. Tirés au hasard autour d'un
 * même point, huit œufs se lisaient comme une seule tache en vue trois-quarts ; ce pas laisse un
 * creux d'au moins un pixel entre deux œufs, liseré compris.
 */
export const LILY_EGG_PITCH = 0.05;
/** Distance horizontale maximale entre une anémone et le rocher où pondre, en mètres. */
export const REEF_ROCK_REACH = 0.3;
/** Distance horizontale d'une ponte sur le sable au centre de l'anémone, en mètres. */
export const REEF_SAND_DISTANCE = 0.075;
/** Écart entre deux œufs d'une ponte du récif, en mètres (au plus, par axe). */
export const REEF_CLUSTER_SPREAD = 0.016;
/** Hauteur d'un œuf posé sur le sable, au-dessus du fond, en mètres. */
export const EGG_SAND_LIFT = 0.006;
/** Nombre d'œufs d'une ponte, bornes comprises (avant plafonds). */
export const MIN_CLUTCH = 4;
export const MAX_CLUTCH = 10;
/**
 * Nombre d'œufs d'une ponte dans les feuilles (triton) : un seul, la femelle pond « un à un »
 * (Caudata Culture, _Cynops orientalis_ : 2,8 œufs par jour en moyenne) ; une ponte par période
 * (approximation de jeu). Les œufs s'accumulent d'une période à l'autre, chacun sur sa feuille.
 */
export const LEAF_CLUTCH = 1;
/**
 * Température de ponte du triton, en °C, bornes comprises : Caudata Culture (_Cynops
 * orientalis_), reproduction de mars à juillet « quand l'eau est entre 15 et 23 °C ». Le
 * paludarium (20 °C) est dans la plage.
 */
export const NEWT_SPAWN_TEMPERATURE: readonly [number, number] = Object.freeze([
  15, 23,
]) as readonly [number, number];
/** Nombre maximal d'œufs dans un bac. */
export const MAX_EGGS = 30;
/** Durée d'incubation, en secondes simulées. */
export const EGG_HATCH_TIME = 180;
/** Distance sous laquelle un adulte mange un œuf exposé, en mètres (`eggReachDistance2`). */
export const EGG_EAT_RADIUS = 0.04;
/**
 * Portée vers la vitre, en mètres : les nageurs restent à quelques centimètres des vitres
 * (bornes de nage et marge aux parois), un œuf de la vitre est atteint par un adulte qui passe
 * devant lui à moins de cette distance de plus (approximation de jeu).
 */
export const EGG_GLASS_REACH = 0.04;
/** Retrait d'un œuf de la vitre vers l'intérieur de l'eau, en mètres. */
export const EGG_GLASS_INSET = 0.004;
/** Hauteur de ponte au-dessus du fond, en mètres : de `EGG_MIN_HEIGHT` à `EGG_MAX_HEIGHT`. */
export const EGG_MIN_HEIGHT = 0.02;
export const EGG_MAX_HEIGHT = 0.1;
/** Écart horizontal d'un œuf au pied de sa plante, en mètres (au plus). */
export const EGG_PLANT_SPREAD = 0.025;
/** Écart horizontal entre deux œufs d'une même grappe sur la vitre, en mètres (au plus). */
export const EGG_CLUSTER_SPREAD = 0.03;

/** Surface où un œuf est collé. */
export type EggSurface = 'vitre' | 'plante' | 'rocher' | 'sol';
export const EGG_SURFACES: readonly EggSurface[] = Object.freeze([
  'vitre',
  'plante',
  'rocher',
  'sol',
]);

/** Œuf collé : objet de données pur, sérialisable en JSON. */
export interface Egg {
  readonly species: SpeciesId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Âge, en secondes simulées, dans [0, `EGG_HATCH_TIME`). */
  readonly age: number;
  readonly surface: EggSurface;
}

export type MutableEgg = { -readonly [K in keyof Egg]: Egg[K] };

const UINT32_RANGE = 4294967296;
const SPAWN_SALT = 0x0e66;

/** Vrai si l'espèce pond des œufs. */
export function laysEggs(species: SpeciesId): boolean {
  return EGG_SPECIES.includes(species);
}

/** Vrai si l'espèce pond près d'une anémone (`REEF_EGG_SPECIES`). */
export function laysNearAnemone(species: SpeciesId): boolean {
  return REEF_EGG_SPECIES.includes(species);
}

/** Vrai si l'espèce fraie sur la végétation seulement (`VEGETATION_EGG_SPECIES`). */
export function laysOnVegetation(species: SpeciesId): boolean {
  return VEGETATION_EGG_SPECIES.includes(species);
}

/** Vrai si l'espèce pond un à un dans les feuilles (`LEAF_EGG_SPECIES`). */
export function laysInLeaves(species: SpeciesId): boolean {
  return LEAF_EGG_SPECIES.includes(species);
}

/**
 * Vrai si les œufs de l'espèce éclosent en alevins (faux : larves du clown qui quittent le bac,
 * œufs du poisson rouge dont les alevins ne sont pas encore simulés, larves du triton non
 * simulées).
 */
export function hatchesToFry(species: SpeciesId): boolean {
  return (
    laysEggs(species) &&
    !laysNearAnemone(species) &&
    !laysOnVegetation(species) &&
    !laysInLeaves(species)
  );
}

/** Plage de température de ponte de l'espèce, en °C, bornes comprises. */
export function spawnTemperature(species: SpeciesId): readonly [number, number] {
  if (laysNearAnemone(species)) {
    return REEF_SPAWN_TEMPERATURE;
  }
  if (laysInLeaves(species)) {
    return NEWT_SPAWN_TEMPERATURE;
  }
  return laysOnVegetation(species) ? GOLDFISH_SPAWN_TEMPERATURE : SPAWN_TEMPERATURE;
}

/** Vrai si `age` est un âge d'œuf valide : réel dans [0, `EGG_HATCH_TIME`). */
export function isEggAge(age: unknown): age is number {
  return typeof age === 'number' && Number.isFinite(age) && age >= 0 && age < EGG_HATCH_TIME;
}

/** Rang de la période qui s'achève au pas `tick`, ou -1 si `tick` n'achève aucune période. */
export function spawnIndexAt(tick: number): number {
  if (!Number.isInteger(tick) || tick <= 0 || tick % SPAWN_TICKS !== 0) {
    return -1;
  }
  return tick / SPAWN_TICKS - 1;
}

/** Tirage uniforme dans [0, 1) du hachage (graine, espèce, période, rang), sans générateur. */
export function spawnDraw(seed: number, species: SpeciesId, spawn: number, k: number): number {
  const salt = EGG_SPECIES.indexOf(species) + 1;
  const state = deriveSeed(deriveSeed(deriveSeed(seed, salt), (spawn ^ SPAWN_SALT) >>> 0), k >>> 0);
  return prngOutput(state) / UINT32_RANGE;
}

/**
 * Nombre d'œufs d'une ponte, dans [`MIN_CLUTCH`, `MAX_CLUTCH`] ; `LEAF_CLUTCH` pour une espèce
 * qui pond dans les feuilles.
 */
export function clutchSize(seed: number, species: SpeciesId, spawn: number): number {
  if (laysInLeaves(species)) {
    return LEAF_CLUTCH;
  }
  const u = spawnDraw(seed, species, spawn, 0);
  return MIN_CLUTCH + Math.floor(u * (MAX_CLUTCH - MIN_CLUTCH + 1));
}

/** État du bac lu par la ponte. */
export interface SpawnConditions {
  /** Eau « bonne » (`waterQuality`). */
  readonly goodWater: boolean;
  /** Température de l'eau, en °C. */
  readonly temperature: number;
  /** Vrai si le pH de l'eau sort de la plage tolérée de l'espèce. */
  readonly phOut: (species: SpeciesId) => boolean;
}

/** Vrai si `fish` est un adulte en forme : ni alevin, santé pleine, sans points blancs, nourri. */
export function isFitSpawner(fish: Fish): boolean {
  return !isFry(fish) && fish.health >= 1 && fish.ich === undefined && fish.hunger < FED_HUNGER;
}

/** Vrai si l'eau permet à `species` de pondre (qualité, pH, température). */
export function waterAllowsSpawn(species: SpeciesId, conditions: SpawnConditions): boolean {
  const t = conditions.temperature;
  const [low, high] = spawnTemperature(species);
  return conditions.goodWater && !conditions.phOut(species) && t >= low && t <= high;
}

/** Nombre d'adultes en forme de `species` dans `fishes`. */
export function fitSpawners(fishes: readonly Fish[], species: SpeciesId): number {
  let count = 0;
  for (const fish of fishes) {
    if (fish.species === species && isFitSpawner(fish)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Place restante pour des œufs de `species` : le plus petit des écarts aux plafonds
 * (`maxPopulation` de l'espèce ; `MAX_TOTAL_FISH`, œufs compris ; `MAX_EGGS`), jamais négatif.
 * Les œufs d'une espèce qui éclôt en alevins (`hatchesToFry`) comptent dans `maxPopulation` :
 * chacun deviendra un poisson. Ceux d'une espèce sans alevin (larves du clown qui quittent le
 * bac, œufs du poisson rouge) n'y comptent pas, faute de quoi la ponte était presque toujours
 * réduite (issue #662, ADR 0146) ; ils restent comptés dans `MAX_TOTAL_FISH` et `MAX_EGGS`.
 */
export function eggRoom(fishes: readonly Fish[], eggs: readonly Egg[], species: SpeciesId): number {
  let same = 0;
  for (const fish of fishes) {
    if (fish.species === species) {
      same += 1;
    }
  }
  if (hatchesToFry(species)) {
    for (const egg of eggs) {
      if (egg.species === species) {
        same += 1;
      }
    }
  }
  return Math.max(
    0,
    Math.min(
      SPECIES[species].maxPopulation - same,
      MAX_TOTAL_FISH - fishes.length - eggs.length,
      MAX_EGGS - eggs.length,
    ),
  );
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Œufs de la ponte `spawn` de `species` (au plus `count`), collés sur les surfaces du bac :
 * une grappe sur la vitre (devant ou derrière, tirée de la ponte) et, s'il y a des plantes,
 * environ un œuf sur deux au pied d'une plante tirée. Tous dans `water`, entre
 * `EGG_MIN_HEIGHT` et `EGG_MAX_HEIGHT` au-dessus du fond. Âge 0.
 */
export function layClutch(
  seed: number,
  species: SpeciesId,
  spawn: number,
  count: number,
  water: Box3,
  plants: readonly DecorItem[],
): MutableEgg[] {
  const eggs: MutableEgg[] = [];
  if (count <= 0) {
    return eggs;
  }
  const draw = (k: number): number => spawnDraw(seed, species, spawn, k);
  const top = Math.min(water.maxY, water.minY + EGG_MAX_HEIGHT);
  const bottom = Math.min(top, water.minY + EGG_MIN_HEIGHT);
  const height = (u: number): number => bottom + u * (top - bottom);
  const margin = EGG_CLUSTER_SPREAD + EGG_GLASS_INSET;
  const front = draw(1) < 0.5;
  const glassZ = front ? water.maxZ - EGG_GLASS_INSET : water.minZ + EGG_GLASS_INSET;
  const centerX = clamp(
    water.minX + margin + draw(2) * (water.maxX - water.minX - 2 * margin),
    water.minX + EGG_GLASS_INSET,
    water.maxX - EGG_GLASS_INSET,
  );
  for (let k = 0; k < count; k++) {
    const base = 8 + 5 * k;
    const onPlant = plants.length > 0 && draw(base) < 0.5;
    const y = height(draw(base + 1));
    if (onPlant) {
      const plant = plants[Math.min(plants.length - 1, Math.floor(draw(base + 2) * plants.length))];
      const angle = draw(base + 3) * 2 * Math.PI;
      const r = EGG_PLANT_SPREAD * Math.sqrt(draw(base + 4));
      eggs.push({
        species,
        x: clamp(
          plant.x + r * Math.cos(angle),
          water.minX + EGG_GLASS_INSET,
          water.maxX - EGG_GLASS_INSET,
        ),
        y,
        z: clamp(
          plant.z + r * Math.sin(angle),
          water.minZ + EGG_GLASS_INSET,
          water.maxZ - EGG_GLASS_INSET,
        ),
        age: 0,
        surface: 'plante',
      });
    } else {
      const dx = (draw(base + 2) * 2 - 1) * EGG_CLUSTER_SPREAD;
      eggs.push({
        species,
        x: clamp(centerX + dx, water.minX + EGG_GLASS_INSET, water.maxX - EGG_GLASS_INSET),
        y,
        z: glassZ,
        age: 0,
        surface: 'vitre',
      });
    }
  }
  return eggs;
}

/**
 * Frai `spawn` de `species` sur la végétation (issue #675), au plus `count` œufs : chaque œuf
 * est tiré, parmi les plantes du décor et les nénuphars, sur l'une d'elles ; au pied d'une plante
 * (comme `layClutch`), ou le long de la tige d'un nénuphar (à `LILY_STEM_SPREAD` de son ancre,
 * la tige partant du fond, et à `LILY_EGG_DEPTH` sous la surface), étagés de `LILY_EGG_PITCH`
 * et alternés de part et d'autre de la tige (#685). Sans
 * végétation (listes vides, `null` ou `undefined`), aucun œuf. Tous dans `water`, âge 0,
 * surface `'plante'`.
 */
export function layVegetationClutch(
  seed: number,
  species: SpeciesId,
  spawn: number,
  count: number,
  water: Box3,
  plants: readonly DecorItem[] | null | undefined,
  pads: readonly LilyPad[] | null | undefined,
): MutableEgg[] {
  const eggs: MutableEgg[] = [];
  const plantCount = plants?.length ?? 0;
  const padCount = pads?.length ?? 0;
  const total = plantCount + padCount;
  if (count <= 0 || total === 0) {
    return eggs;
  }
  const draw = (k: number): number => spawnDraw(seed, species, spawn, k);
  const inX = (x: number): number =>
    clamp(x, water.minX + EGG_GLASS_INSET, water.maxX - EGG_GLASS_INSET);
  const inZ = (z: number): number =>
    clamp(z, water.minZ + EGG_GLASS_INSET, water.maxZ - EGG_GLASS_INSET);
  const top = Math.min(water.maxY, water.minY + EGG_MAX_HEIGHT);
  const bottom = Math.min(top, water.minY + EGG_MIN_HEIGHT);
  const perPad: number[] = [];
  for (let k = 0; k < count; k++) {
    const base = 8 + 4 * k;
    const pick = Math.min(total - 1, Math.floor(draw(base) * total));
    const angle = draw(base + 1) * 2 * Math.PI;
    const u = draw(base + 2);
    const v = draw(base + 3);
    if (pick < plantCount) {
      const plant = plants![pick];
      const r = EGG_PLANT_SPREAD * Math.sqrt(u);
      eggs.push({
        species,
        x: inX(plant.x + r * Math.cos(angle)),
        y: bottom + v * (top - bottom),
        z: inZ(plant.z + r * Math.sin(angle)),
        age: 0,
        surface: 'plante',
      });
    } else {
      const index = pick - plantCount;
      const pad = pads![index];
      // Rang de l'œuf sur sa tige : étage et côté (#685).
      const rank = (perPad[index] = (perPad[index] ?? 0) + 1) - 1;
      const range = LILY_EGG_DEPTH.max - LILY_EGG_DEPTH.min;
      const side = angle + (rank % 2) * Math.PI;
      const r = LILY_STEM_SPREAD * (0.75 + 0.25 * u);
      const depth =
        LILY_EGG_DEPTH.min + ((rank * LILY_EGG_PITCH + 0.2 * LILY_EGG_PITCH * v) % range);
      eggs.push({
        species,
        x: inX(pad.x + r * Math.cos(side)),
        y: clamp(water.maxY - depth, water.minY + EGG_SAND_LIFT, water.maxY),
        z: inZ(pad.z + r * Math.sin(side)),
        age: 0,
        surface: 'plante',
      });
    }
  }
  return eggs;
}

/**
 * Ponte `spawn` de `species` près d'une anémone (issue #653), au plus `count` œufs : une
 * anémone est tirée de la ponte ; si un rocher du décor est à moins de `REEF_ROCK_REACH` d'elle
 * (à l'horizontale, le plus proche), la grappe est collée sur le flanc de ce rocher tourné vers
 * l'anémone, au ras du sable (`'rocher'`) ; sinon, sur le sable à `REEF_SAND_DISTANCE` du centre
 * de l'anémone (`'sol'`). Sans anémone (`null`, `undefined` ou liste vide), aucun œuf ; un
 * décor absent compte comme sans rocher. Tous les œufs sont dans `water`, âge 0.
 */
export function layReefClutch(
  seed: number,
  species: SpeciesId,
  spawn: number,
  count: number,
  water: Box3,
  decor: readonly DecorItem[] | null | undefined,
  anemones: readonly Anemone[] | null | undefined,
): MutableEgg[] {
  const eggs: MutableEgg[] = [];
  if (count <= 0 || anemones === null || anemones === undefined || anemones.length === 0) {
    return eggs;
  }
  const draw = (k: number): number => spawnDraw(seed, species, spawn, k);
  const anemone = anemones[Math.min(anemones.length - 1, Math.floor(draw(1) * anemones.length))];
  const rock = nearestRock(decor, anemone.x, anemone.z);
  const inX = (x: number): number =>
    clamp(x, water.minX + EGG_GLASS_INSET, water.maxX - EGG_GLASS_INSET);
  const inZ = (z: number): number =>
    clamp(z, water.minZ + EGG_GLASS_INSET, water.maxZ - EGG_GLASS_INSET);
  const floor = Math.min(water.maxY, water.minY + EGG_SAND_LIFT);
  if (rock === null) {
    const angle = draw(2) * 2 * Math.PI;
    const cx = anemone.x + REEF_SAND_DISTANCE * Math.cos(angle);
    const cz = anemone.z + REEF_SAND_DISTANCE * Math.sin(angle);
    for (let k = 0; k < count; k++) {
      const base = 8 + 3 * k;
      eggs.push({
        species,
        x: inX(cx + (draw(base) * 2 - 1) * REEF_CLUSTER_SPREAD),
        y: floor,
        z: inZ(cz + (draw(base + 1) * 2 - 1) * REEF_CLUSTER_SPREAD),
        age: 0,
        surface: 'sol',
      });
    }
    return eggs;
  }
  // Sphère du rocher la plus proche d'un point au ras du sable, sous l'anémone.
  const target = { x: anemone.x, y: water.minY + EGG_MIN_HEIGHT, z: anemone.z };
  let best = { x: rock.x, y: target.y, z: rock.z, radius: 0 };
  let bestGap = Infinity;
  for (const sphere of rockSpheres(rock)) {
    const gap =
      Math.hypot(target.x - sphere.x, target.y - sphere.y, target.z - sphere.z) - sphere.radius;
    if (gap < bestGap) {
      bestGap = gap;
      best = sphere;
    }
  }
  const top = Math.min(water.maxY, water.minY + EGG_MAX_HEIGHT);
  const radius = best.radius + EGG_GLASS_INSET;
  for (let k = 0; k < count; k++) {
    const base = 8 + 3 * k;
    // Point visé près du sable, sous l'anémone, décalé dans la grappe, puis ramené sur la
    // surface de la sphère (flanc tourné vers l'anémone).
    const px = target.x + (draw(base) * 2 - 1) * REEF_CLUSTER_SPREAD * 3;
    const py = target.y + draw(base + 1) * REEF_CLUSTER_SPREAD * 2;
    const pz = target.z + (draw(base + 2) * 2 - 1) * REEF_CLUSTER_SPREAD * 3;
    const dx = px - best.x;
    const dy = py - best.y;
    const dz = pz - best.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    eggs.push({
      species,
      x: inX(best.x + (dx / d) * radius),
      y: clamp(best.y + (dy / d) * radius, floor, Math.max(floor, top)),
      z: inZ(best.z + (dz / d) * radius),
      age: 0,
      surface: 'rocher',
    });
  }
  return eggs;
}

/** Rocher du décor le plus proche de `(x, z)` à moins de `REEF_ROCK_REACH`, ou `null`. */
export function nearestRock(
  decor: readonly DecorItem[] | null | undefined,
  x: number,
  z: number,
): DecorItem | null {
  let best: DecorItem | null = null;
  let bestD2 = REEF_ROCK_REACH * REEF_ROCK_REACH;
  for (const item of decor ?? []) {
    if (item.kind !== 'rock') {
      continue;
    }
    const d2 = (item.x - x) ** 2 + (item.z - z) ** 2;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = item;
    }
  }
  return best;
}

/**
 * Carré de la distance de `fish` à l'œuf `egg` : pour un œuf de la vitre, l'écart en profondeur
 * (axe des vitres) est diminué de `EGG_GLASS_REACH` ; ailleurs, distance ordinaire.
 */
export function eggReachDistance2(fish: Pick<Fish, 'x' | 'y' | 'z'>, egg: Egg): number {
  const reach = egg.surface === 'vitre' ? EGG_GLASS_REACH : 0;
  const dz = Math.max(0, Math.abs(fish.z - egg.z) - reach);
  return (fish.x - egg.x) ** 2 + (fish.y - egg.y) ** 2 + dz * dz;
}

/** Vrai si un adulte nageur de `fishes` est à portée (`EGG_EAT_RADIUS`) de `egg`. */
function isEggCaught(fishes: readonly Fish[], egg: Egg): boolean {
  const r2 = EGG_EAT_RADIUS * EGG_EAT_RADIUS;
  for (const fish of fishes) {
    if (isPredator(fish) && eggReachDistance2(fish, egg) < r2) {
      return true;
    }
  }
  return false;
}

/** Vrai si `egg` est exposé aux adultes : collé sur la vitre, ou frai sur la végétation (#675). */
export function isEggExposed(egg: Egg): boolean {
  return egg.surface === 'vitre' || laysOnVegetation(egg.species);
}

/**
 * Prédation des œufs, **en place** : retire de `eggs` chaque œuf exposé (`isEggExposed` : vitre,
 * frai du poisson rouge) à moins de `EGG_EAT_RADIUS` d'un adulte nageur ; les œufs des
 * corydoras cachés dans les plantes sont à l'abri. Renvoie le nombre d'œufs mangés. Coût en
 * O(œufs × animaux), borné par `MAX_EGGS` et `MAX_TOTAL_FISH`.
 */
export function eatEggsInPlace(eggs: Egg[], fishes: readonly Fish[]): number {
  let eaten = 0;
  for (let i = eggs.length - 1; i >= 0; i--) {
    const egg = eggs[i];
    if (isEggExposed(egg) && isEggCaught(fishes, egg)) {
      eggs.splice(i, 1);
      eaten += 1;
    }
  }
  return eaten;
}

/**
 * Fait vieillir les œufs de `dt` secondes, **en place**, et retire ceux qui éclosent ; chaque
 * œuf éclos est passé à `hatch` avec `context` (le monde, pour l'appelant de `sim/world.ts`),
 * dans l'ordre du tableau. Le contexte passé en paramètre évite à la fois une fermeture
 * allouée à chaque pas et un état de module (#501). Renvoie le nombre d'éclosions.
 */
export function ageEggsInPlace<C>(
  eggs: MutableEgg[],
  dt: number,
  context: C,
  hatch: (context: C, egg: Egg) => void,
): number {
  let hatched = 0;
  let write = 0;
  // Réécriture en place derrière la lecture (`write` ≤ rang lu) : sans effet sur le parcours.
  for (const egg of eggs) {
    egg.age += dt;
    if (egg.age >= EGG_HATCH_TIME) {
      hatch(context, egg);
      hatched += 1;
    } else {
      eggs[write++] = egg;
    }
  }
  eggs.length = write;
  return hatched;
}
