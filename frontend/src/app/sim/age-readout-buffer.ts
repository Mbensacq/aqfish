import { ageSeconds } from './aging';
import { ageDays, speciesAges, type AgeReadout } from './aging-text';
import type { SpeciesId } from './species';
import type { World } from './world-types';

/** Âges extrêmes d'une espèce dans le tampon, réécrits à chaque relevé. */
interface SpanScratch {
  readonly species: SpeciesId;
  /** Animaux de l'espèce au dernier relevé (0 : espèce absente du bac). */
  count: number;
  youngest: number;
  oldest: number;
}

/**
 * Tampon du relevé des âges d'un bac (#868, suite de la revue de #857) : les relevés de
 * l'hôte (4 fois par seconde) recalculent les âges dans des objets réutilisés et ne
 * construisent un nouveau relevé (`speciesAges`) que si un nombre de jours affiché change,
 * ou si une espèce arrive ou disparaît. Résultat identique à `speciesAges` ; seul le tampon
 * (une entrée par espèce déjà vue) persiste d'un relevé à l'autre.
 */
export class AgeReadoutBuffer {
  private readonly spans: SpanScratch[] = [];
  private readonly bySpecies = new Map<SpeciesId, SpanScratch>();

  /**
   * Relevé des âges de `world` : `shown` lui-même s'il affiche les mêmes espèces et les mêmes
   * nombres de jours (`sameAgeDays`), sinon un nouveau relevé.
   */
  readout(world: Pick<World, 'seed' | 'time' | 'entities'>, shown: AgeReadout): AgeReadout {
    this.fill(world);
    return this.sameDaysAs(shown) ? shown : speciesAges(world);
  }

  /** Âges extrêmes de chaque espèce de `world`, avec les mêmes `Math.min` / `Math.max`. */
  private fill(world: Pick<World, 'seed' | 'time' | 'entities'>): void {
    for (const span of this.spans) {
      span.count = 0;
    }
    for (const fish of world.entities) {
      const age = ageSeconds(fish, world.seed, world.time);
      const span = this.spanOf(fish.species);
      if (span.count === 0) {
        span.youngest = age;
        span.oldest = age;
      } else {
        span.youngest = Math.min(span.youngest, age);
        span.oldest = Math.max(span.oldest, age);
      }
      span.count++;
    }
  }

  /** Entrée du tampon de `species`, créée à sa première apparition. */
  private spanOf(species: SpeciesId): SpanScratch {
    let span = this.bySpecies.get(species);
    if (span === undefined) {
      span = { species, count: 0, youngest: 0, oldest: 0 };
      this.bySpecies.set(species, span);
      this.spans.push(span);
    }
    return span;
  }

  /** Vrai si `shown` a exactement les espèces présentes du tampon, aux mêmes jours. */
  private sameDaysAs(shown: AgeReadout): boolean {
    let present = 0;
    for (const span of this.spans) {
      if (span.count === 0) {
        continue;
      }
      present++;
      const other = shown[span.species];
      if (
        other === undefined ||
        ageDays(other.youngest) !== ageDays(span.youngest) ||
        ageDays(other.oldest) !== ageDays(span.oldest)
      ) {
        return false;
      }
    }
    return present === speciesCount(shown);
  }
}

/** Espèces d'un relevé, comptées sans tableau intermédiaire. */
function speciesCount(readout: AgeReadout): number {
  let count = 0;
  for (const species in readout) {
    if (Object.hasOwn(readout, species)) {
      count++;
    }
  }
  return count;
}
