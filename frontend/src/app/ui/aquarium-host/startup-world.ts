import type {
  CaptureFurniture,
  CaptureParams,
  CapturePopulation,
  CaptureWood,
} from '../../core/capture/capture-params';
import { hasAlgae, sampleAlgae } from '../../sim/algae';
import { setCareModeInPlace } from '../../sim/care-mode';
import { validateDecorItem, type DecorItem } from '../../sim/decor';
import { MAX_DECOR_ITEMS, setDecorInPlace } from '../../sim/decor-edit';
import { DROPSY_ADVANCED_AT, DROPSY_MAX } from '../../sim/dropsy';
import {
  DEFAULT_ENVIRONMENT_ID,
  isEnvironmentId,
  isPondShapeable,
  placeDimensions,
} from '../../sim/environment';
import { isPondShape } from '../../sim/pond-shape';
import { DEFAULT_ROOM, ROOM_ITEM_KINDS, type Room, type RoomItemKind } from '../../sim/room';
import { dropRoomItem } from '../../sim/room-furniture';
import { applySpeciesCountsInPlace } from '../../sim/species-counts';
import type { TankDimensions } from '../../sim/tank';
import { setTankDimensionsInPlace } from '../../sim/tank-resize';
import { isCurrentLevel } from '../../sim/water-current';
import { isWaterQuality, sampleWater } from '../../sim/water-quality';
import { broodWorldInPlace } from '../../sim/fry-sample';
import {
  createDefaultWorld,
  dropsyWorldInPlace,
  fungusWorldInPlace,
  infectWorldInPlace,
  killWorldAnimalInPlace,
  layEggsWorldInPlace,
  rotWorldFinsInPlace,
  setWorldCatappaInPlace,
  setWorldCurrentInPlace,
  setWorldFeederInPlace,
  setWorldMortalityInPlace,
  starveWorldInPlace,
  velvetWorldInPlace,
} from '../../sim/world';
import type { MutableWorld } from '../../sim/world-types';

/**
 * Monde neuf du démarrage décrit par l'URL (sans sauvegarde à restaurer), à t = 0 : sortie de
 * `AquariumHost.begin` au lot 10 de l'assainissement (#696), dans le même ordre. Les réglages
 * d'exemple réservés à la capture (`bac=`, `bois=`, `eau=`…) ne s'appliquent qu'en capture ;
 * les maladies d'exemple (`points-blancs=1`…) s'appliquent dans les deux cas.
 */
export interface StartupWorld {
  readonly world: MutableWorld;
  /** Pièce autour du bac, garnie des meubles de `meubles=` en capture. */
  readonly room: Room;
}

/**
 * Crée le monde neuf du démarrage d'après `params`, autour de la pièce `room` (réglage courant
 * de l'hôte). Le monde n'est pas avancé : l'hôte l'amène au temps de capture ensuite.
 */
export function createStartupWorld(params: CaptureParams, room: Room): StartupWorld {
  // Pièce de `piece=1` (#187), en capture : appliquée à la création de la vue.
  let startRoom = params.capture && params.room ? { ...DEFAULT_ROOM, shown: true } : room;
  const environment = isEnvironmentId(params.environment)
    ? params.environment
    : DEFAULT_ENVIRONMENT_ID;
  // Forme du bassin de `forme=` (#190), en capture et au bassin seulement.
  const shape =
    params.capture && isPondShape(params.shape) && isPondShapeable(environment)
      ? params.shape
      : undefined;
  const world: MutableWorld = createDefaultWorld(params.seed, environment, shape);
  if (params.capture) {
    startRoom = applyCaptureTank(world, params, startRoom);
  }
  // Mode décor de `mode=decor` (#278) : avant `population=`, qui admet alors toute espèce.
  if (params.decorMode) {
    setCareModeInPlace(world, 'decor');
  }
  // Effectifs de `population=` (#69) : appliqués à t = 0, avant d'avancer le monde.
  applyPopulation(world, params.population);
  if (params.capture) {
    applyCaptureWater(world, params);
  }
  applySampleDiseases(world, params);
  if (params.capture) {
    applyCaptureLife(world, params);
  }
  return { world, room: startRoom };
}

/**
 * Bac de capture (#169, #171, #188) : dimensions de `bac=`, puis bois flottés de `bois=`
 * ajoutés au décor avant la population, puis meubles de `meubles=` aux dimensions du bac.
 * Renvoie la pièce garnie.
 */
function applyCaptureTank(world: MutableWorld, params: CaptureParams, room: Room): Room {
  if (params.tank !== null) {
    setTankDimensionsInPlace(world, params.tank);
  }
  applyCaptureWoods(world, params.woods);
  if (params.room && params.furniture.length > 0) {
    return applyCaptureFurniture(room, placeDimensions(world), params.furniture);
  }
  return room;
}

/**
 * Eau d'exemple de capture à t = 0 : qualité de `eau=` (#207), puis algues de `algues=`
 * (#476), puis animaux affamés de `affames=1` (#208).
 */
function applyCaptureWater(world: MutableWorld, params: CaptureParams): void {
  if (isWaterQuality(params.water)) {
    world.water = sampleWater(world.environment, params.water);
  }
  const algae = sampleAlgae(params.algae);
  if (algae !== undefined && hasAlgae(world.environment)) {
    world.water = { ...world.water, algae };
  }
  if (params.starved) {
    starveWorldInPlace(world);
  }
}

/**
 * Maladies d'exemple, en capture comme hors capture, à t = 0 après `population=` : points
 * blancs (#366), nageoires effilochées (#485), voile doré (#532), coton blanc (#548),
 * hydropisie (#565), puis animal mort de `mort=1` (#582).
 */
function applySampleDiseases(world: MutableWorld, params: CaptureParams): void {
  if (params.ich) {
    infectWorldInPlace(world);
  }
  if (params.finRot) {
    rotWorldFinsInPlace(world);
  }
  if (params.velvet) {
    velvetWorldInPlace(world);
  }
  if (params.fungus) {
    fungusWorldInPlace(world);
  }
  if (params.dropsy !== null) {
    dropsyWorldInPlace(world, params.dropsy === 'gonfle' ? DROPSY_ADVANCED_AT - 1 : DROPSY_MAX);
  }
  if (params.dead) {
    setWorldMortalityInPlace(world, true);
    const first = world.entities[0];
    if (first !== undefined) {
      killWorldAnimalInPlace(world, first.id);
    }
  }
}

/**
 * Vie et équipement d'exemple de capture à t = 0 : courant de `courant=` (#460), alevins
 * (#459), œufs (#478), feuilles de catappa (#239), distributeur plein (#583).
 */
function applyCaptureLife(world: MutableWorld, params: CaptureParams): void {
  if (isCurrentLevel(params.current)) {
    setWorldCurrentInPlace(world, params.current);
  }
  if (params.fry) {
    broodWorldInPlace(world);
  }
  if (params.eggs) {
    layEggsWorldInPlace(world);
  }
  if (params.catappa > 0) {
    setWorldCatappaInPlace(world, params.catappa);
  }
  if (params.feeder !== null) {
    setWorldFeederInPlace(world, params.feeder);
  }
}

/**
 * Applique les effectifs de `population=` au monde, dans l'ordre de l'URL, bornés par le
 * catalogue d'espèces (`applySpeciesCountsInPlace`, #189). Une espèce inconnue, ou qui ne vit
 * pas dans l'environnement du monde (`Environment.species`, #88), est ignorée.
 */
export function applyPopulation(
  world: MutableWorld,
  population: readonly CapturePopulation[],
): void {
  applySpeciesCountsInPlace(world, population);
}

/**
 * Pièce `room` garnie des éléments de `meubles=` (#188), lâchés dans l'ordre autour d'un bac
 * `dims` (`dropRoomItem`) ; type inconnu ou pose refusée : élément ignoré. Nouvel objet.
 */
export function applyCaptureFurniture(
  room: Room,
  dims: TankDimensions,
  furniture: readonly CaptureFurniture[],
): Room {
  let current = room;
  for (const { kind, x, z, quarter } of furniture) {
    if (!(ROOM_ITEM_KINDS as readonly string[]).includes(kind)) {
      continue;
    }
    const result = dropRoomItem(current, dims, { kind: kind as RoomItemKind, x, z, quarter });
    if (result.ok) {
      current = { ...current, items: result.items };
    }
  }
  return current;
}

/**
 * Ajoute au décor du monde les bois flottés de `bois=` (#169), dans l'ordre de l'URL. Un bois
 * invalide (hors du bac de l'environnement, échelle hors bornes, graine invalide) est ignoré,
 * de même que ceux qui dépassent `MAX_DECOR_ITEMS`. Sans bois valide, le monde est inchangé.
 */
export function applyCaptureWoods(world: MutableWorld, woods: readonly CaptureWood[]): void {
  const dims = placeDimensions(world);
  const added = woods
    .map(({ x, z, rotation, scale, seed }): DecorItem => ({
      kind: 'wood',
      x,
      z,
      rotation,
      scale,
      seed,
    }))
    .filter((item) => validateDecorItem(item, dims).length === 0)
    .slice(0, Math.max(0, MAX_DECOR_ITEMS - world.decor.length));
  if (added.length > 0) {
    setDecorInPlace(world, [...world.decor, ...added]);
  }
}
