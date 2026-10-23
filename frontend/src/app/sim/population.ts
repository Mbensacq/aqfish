import { SPECIES, type SpeciesId } from './species';
import {
  bondedCount,
  cloneWorld,
  homeForRank,
  spawnEntity,
  worldAnemoneHomes,
  type Entity,
  type MutableWorld,
  type World,
} from './world';

/**
 * Population réglable par espèce (issue #69, ADR 0025).
 *
 * - Bornes : de 0 à `SpeciesDefinition.maxPopulation` par espèce, et au plus
 *   `MAX_TOTAL_FISH` poissons en tout (coût du banc en O(n²) par espèce, et lisibilité du
 *   bac). Une demande au-delà est ramenée à la borne ; une demande invalide est refusée.
 * - Ajout : chaque nouveau poisson reçoit l'identifiant `world.nextFishId` (compteur jamais
 *   réutilisé), donc son propre sous-générateur (`deriveSeed(seed, id)`), et naît comme à la
 *   création du monde (`spawnEntity` : zone de naissance de l'espèce, à sa profondeur
 *   préférée, hors des obstacles). Il est ajouté en fin de tableau : l'ordre des entités
 *   reste celui des identifiants.
 * - Retrait : le poisson de l'espèce le plus récent (identifiant le plus grand) disparaît ;
 *   les autres gardent leur état tel quel.
 * - Rien d'autre ne change : temps, décor, nourriture, générateurs des autres poissons. Les
 *   espèces n'interagissent pas (banc et espacement entre congénères seulement), donc
 *   ajouter ou retirer une espèce ne change pas les trajectoires des autres.
 */

/** Nombre maximal de poissons du bac, toutes espèces confondues. */
export const MAX_TOTAL_FISH = 60;

/** Effectif de chaque espèce, dans l'ordre de `SPECIES`. */
export type PopulationCounts = Readonly<Record<SpeciesId, number>>;

/** Identifiants des espèces, dans l'ordre de `SPECIES` (celui du panneau). */
export const SPECIES_IDS: readonly SpeciesId[] = Object.values(SPECIES).map((def) => def.id);

/** Effectifs tous nuls (valeur initiale des signaux et entrées de l'interface). */
export const NO_FISH: PopulationCounts = Object.freeze(
  Object.fromEntries(SPECIES_IDS.map((id) => [id, 0])) as Record<SpeciesId, number>,
);

/** Vrai si `value` est l'identifiant d'une espèce connue (clés héritées refusées). */
export function isSpeciesId(value: unknown): value is SpeciesId {
  return typeof value === 'string' && Object.hasOwn(SPECIES, value);
}

/** Effectif de chaque espèce dans `world`. */
export function populationCounts(world: World): PopulationCounts {
  const counts = Object.fromEntries(SPECIES_IDS.map((id) => [id, 0])) as Record<SpeciesId, number>;
  for (const entity of world.entities) {
    counts[entity.species] += 1;
  }
  return counts;
}

/**
 * Effectif maximal de `species` dans `world`, compte tenu des autres espèces : le plus petit
 * de `maxPopulation` et de la place laissée sous `MAX_TOTAL_FISH`, jamais négatif.
 * @throws RangeError si l'espèce est inconnue.
 */
export function populationLimit(world: World, species: SpeciesId): number {
  assertSpecies(species);
  let others = 0;
  for (const entity of world.entities) {
    if (entity.species !== species) {
      others += 1;
    }
  }
  return Math.max(0, Math.min(SPECIES[species].maxPopulation, MAX_TOTAL_FISH - others));
}

/** Effectif maximal de chaque espèce dans `world` (`populationLimit`). */
export function populationLimits(world: World): PopulationCounts {
  return Object.fromEntries(SPECIES_IDS.map((id) => [id, populationLimit(world, id)])) as Record<
    SpeciesId,
    number
  >;
}

/**
 * Règle l'effectif de `species` à `count`, ramené à `populationLimit`. Fonction pure :
 * renvoie un nouvel état, `world` n'est jamais modifié (même s'il n'y a rien à changer).
 * @throws RangeError si l'espèce est inconnue ou si `count` n'est pas un entier positif ou nul.
 */
export function setPopulation(world: World, species: SpeciesId, count: number): World {
  const next = cloneWorld(world);
  setPopulationInPlace(next, species, count);
  return next;
}

/**
 * Comme `setPopulation`, **en modifiant** `world` ; renvoie l'effectif obtenu. Réservé au
 * propriétaire unique du monde (`ui/aquarium-host`), comme `advanceInPlace`.
 * @throws RangeError si l'espèce est inconnue ou si `count` n'est pas un entier positif ou
 * nul (monde inchangé).
 */
export function setPopulationInPlace(
  world: MutableWorld,
  species: SpeciesId,
  count: number,
): number {
  assertSpecies(species);
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`count doit être un entier positif ou nul (reçu : ${count})`);
  }
  const target = Math.min(count, populationLimit(world, species));
  const entities = world.entities as Entity[];
  let current = populationCounts(world)[species];
  // Retrait : du plus récent au plus ancien (fin du tableau, identifiants décroissants).
  for (let i = entities.length - 1; i >= 0 && current > target; i--) {
    if (entities[i].species === species) {
      entities.splice(i, 1);
      current -= 1;
    }
  }
  while (current < target) {
    entities.push(
      spawnEntity(
        world.seed,
        world.nextFishId,
        species,
        world.environment,
        world.obstacles,
        homeForRank(worldAnemoneHomes(world), SPECIES[species].anemone, bondedCount(entities)),
      ),
    );
    world.nextFishId += 1;
    current += 1;
  }
  return current;
}

function assertSpecies(species: SpeciesId): void {
  if (!isSpeciesId(species)) {
    throw new RangeError(`espèce inconnue : ${String(species)}`);
  }
}
