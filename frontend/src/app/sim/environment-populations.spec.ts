import { describe, expect, it } from 'vitest';

import { compatibility, mixWarnings } from './compatibility';
import { ENVIRONMENT_IDS, environmentById, livesIn, type EnvironmentId } from './environment';
import { speciesSheet } from './species-sheet';
import type { SpeciesId } from './species';
import { WATER_TEMPERATURES } from './water';
import { FRESH_PH, SPECIES_PH } from './water-ph';

/**
 * Populations par défaut cohérentes (issue #271, ADR 0065) : dans **chaque** environnement,
 * aucune paire d'espèces peuplées par défaut n'est déconseillée (`sim/compatibility.ts`),
 * leurs températures préférées se recoupent (règle « intersection non vide des plages » de
 * `docs/ESPECES.md`), et l'eau neuve de l'environnement convient à chacune.
 */

function defaultSpecies(env: EnvironmentId): SpeciesId[] {
  return environmentById(env).population.map((p) => p.species);
}

function defaultCounts(env: EnvironmentId): Record<string, number> {
  return Object.fromEntries(environmentById(env).population.map((p) => [p.species, p.count]));
}

describe('populations par défaut cohérentes (#271)', () => {
  it.each(ENVIRONMENT_IDS)('%s : aucune paire incompatible', (env) => {
    const species = defaultSpecies(env);
    for (const a of species) {
      for (const b of species) {
        expect(compatibility(a, b), `${env} : ${a} et ${b}`).toBe('compatible');
      }
    }
    expect(mixWarnings(environmentById(env).species, defaultCounts(env))).toEqual([]);
  });

  it.each(ENVIRONMENT_IDS)('%s : températures préférées communes à toutes les espèces', (env) => {
    const ranges = defaultSpecies(env).map((id) => speciesSheet(id).temperaturePreferred.value);
    const low = Math.max(...ranges.map((r) => r.min));
    const high = Math.min(...ranges.map((r) => r.max));
    expect(low, env).toBeLessThanOrEqual(high);
    // L'eau de l'environnement est tolérée par chaque espèce.
    for (const id of defaultSpecies(env)) {
      const tolerated = speciesSheet(id).temperatureTolerated.value;
      expect(WATER_TEMPERATURES[env], `${env}/${id}`).toBeGreaterThanOrEqual(tolerated.min);
      expect(WATER_TEMPERATURES[env], `${env}/${id}`).toBeLessThanOrEqual(tolerated.max);
    }
    // Environnements revus à l'issue #271 : l'eau tombe dans la plage préférée commune (le
    // bac tropical, à 25 °C, dépasse d'un degré la plage préférée approximative du corydoras,
    // 22–24 °C, sans sortir de sa plage tolérée : hors du périmètre de #271).
    if (env === 'paludarium' || env === 'eaufroide') {
      expect(WATER_TEMPERATURES[env], env).toBeGreaterThanOrEqual(low);
      expect(WATER_TEMPERATURES[env], env).toBeLessThanOrEqual(high);
    }
  });

  it.each(ENVIRONMENT_IDS)('%s : pH de l’eau neuve toléré par chaque espèce', (env) => {
    for (const id of defaultSpecies(env)) {
      const { tolerated } = SPECIES_PH[id];
      expect(FRESH_PH[env], `${env}/${id}`).toBeGreaterThanOrEqual(tolerated.min);
      expect(FRESH_PH[env], `${env}/${id}`).toBeLessThanOrEqual(tolerated.max);
    }
  });

  it.each(ENVIRONMENT_IDS)(
    '%s : chaque espèce peuplée y vit, effectif strictement positif',
    (env) => {
      for (const { species, count } of environmentById(env).population) {
        expect(livesIn(env, species), `${env}/${species}`).toBe(true);
        expect(count, `${env}/${species}`).toBeGreaterThan(0);
      }
    },
  );

  it('chaque environnement a au moins une espèce par défaut', () => {
    for (const env of ENVIRONMENT_IDS) {
      expect(defaultSpecies(env).length, env).toBeGreaterThan(0);
    }
  });

  it('l’axolotl vit seul par défaut, dans le bac d’eau froide', () => {
    const homes = ENVIRONMENT_IDS.filter((env) => defaultSpecies(env).includes('axolotl'));
    expect(homes).toEqual(['eaufroide']);
    expect(defaultSpecies('eaufroide')).toEqual(['axolotl']);
  });

  it('paludarium : sonneurs et tritons par défaut ; un axolotl ajouté est déconseillé avec eux', () => {
    expect(defaultSpecies('paludarium')).toEqual(['grenouille', 'triton']);
    const species = environmentById('paludarium').species;
    expect(mixWarnings(species, { ...defaultCounts('paludarium'), axolotl: 1 })).toEqual([
      { first: 'axolotl', second: 'grenouille', reason: 'predateur' },
      { first: 'axolotl', second: 'triton', reason: 'predateur' },
    ]);
  });
});
