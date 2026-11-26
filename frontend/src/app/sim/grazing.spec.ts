import { describe, expect, it } from 'vitest';

import { algaeCoverage, ALGAE_PATCH_COUNT, sampleAlgae } from './algae';
import {
  GRAZE_SATIATION_PER_COVER,
  GRAZERS,
  grazeAlgaeInPlace,
  HARD_ALGAE_PATCHES,
  isHardAlgae,
  starvesWithoutFood,
  type GrazingAnimal,
} from './grazing';
import { SPECIES, type SpeciesId } from './species';
import { runScenario } from './testing/ecosystem-scenario';
import type { MutableWaterState } from './water';
import { healthStress, hungerCounts } from './wellbeing';
import { cloneWorld, createWorld } from './world';
import type { World } from './world-types';

/** Bac tropical à filtre mûr, toutes les plaques d'algues à `cover`, avec `population`. */
function algaeTank(population: { species: SpeciesId; count: number }[], cover = 0.6): World {
  const world = cloneWorld(createWorld(7, population, [], [], 'tropical'));
  const water = world.water as MutableWaterState;
  water.filter = 1;
  water.algae = sampleAlgae(cover);
  return world;
}

/** Fait tourner `world` une journée de jeu, sans entretien, et renvoie le bac final. */
function afterOneDay(world: World): World {
  return runScenario({ world, care: {}, days: 1 }).world;
}

function animal(species: SpeciesId, hunger: number): GrazingAnimal {
  return { species, hunger };
}

describe('brouteurs d’algues (#833)', () => {
  it('les algues d’un bac diminuent avec des brouteurs et pas sans eux (déterministe, même graine)', () => {
    const grazed = algaeTank([
      { species: 'neritine', count: 2 },
      { species: 'otocinclus', count: 4 },
    ]);
    const bare = algaeTank([{ species: 'neon', count: 6 }]);

    const withGrazers = afterOneDay(grazed);
    const again = afterOneDay(grazed);
    const without = afterOneDay(bare);

    expect(algaeCoverage(withGrazers.water.algae)).toBeLessThan(0.3);
    expect(algaeCoverage(without.water.algae)).toBeCloseTo(0.6, 10);
    expect(again.water.algae).toEqual(withGrazers.water.algae);
  });

  it('les crevettes ne mangent pas les algues dures, les néritines si', () => {
    const shrimps = afterOneDay(algaeTank([{ species: 'cerise', count: 8 }]));
    const snails = afterOneDay(algaeTank([{ species: 'neritine', count: 2 }]));

    const shrimpCover = shrimps.water.algae ?? [];
    for (let i = 0; i < ALGAE_PATCH_COUNT; i++) {
      if (isHardAlgae(i)) {
        expect(shrimpCover[i]).toBe(0.6);
      } else {
        expect(shrimpCover[i]).toBeLessThan(0.6);
      }
    }
    for (const index of HARD_ALGAE_PATCHES) {
      expect(snails.water.algae?.[index] ?? 0).toBeLessThan(0.6);
    }
  });

  it('une bouchée calme la faim d’autant et se répartit selon la couverture des plaques', () => {
    const water = { algae: [0.2, 0.4, 0, 0, 0, 0, 0, 0] };
    const snail = animal('neritine', 0.5);
    const rate = GRAZERS.neritine?.rate.value ?? 0;

    const eaten = grazeAlgaeInPlace(water, [snail], 1);

    expect(eaten).toBeCloseTo(rate, 12);
    expect(snail.hunger).toBeCloseTo(0.5 - rate * GRAZE_SATIATION_PER_COVER, 12);
    expect(water.algae[1] / water.algae[0]).toBeCloseTo(2, 12);
    expect(water.algae[0] + water.algae[1]).toBeCloseTo(0.6 - rate, 12);
  });

  it('la bouchée ne dépasse jamais ce qui calme la faim ni ce qui reste', () => {
    const hungry = { algae: [1, 1, 1, 0, 1, 1, 0, 1] };
    const snail = animal('neritine', 0.001);
    grazeAlgaeInPlace(hungry, [snail], 1000);
    expect(snail.hunger).toBe(0);
    expect(algaeCoverage(hungry.algae)).toBeCloseTo((6 - 0.001) / 8, 12);

    const scarce: { algae?: readonly number[] } = { algae: [0.001, 0, 0, 0, 0, 0, 0, 0] };
    const starving = animal('ancistrus', 1);
    expect(grazeAlgaeInPlace(scarce, [starving], 1000)).toBeCloseTo(0.001, 12);
    expect(scarce.algae).toBeUndefined();
    expect(starving.hunger).toBeCloseTo(1 - 0.001 * GRAZE_SATIATION_PER_COVER, 12);
  });

  it('sans algues, sans faim ou sans brouteur, rien ne change', () => {
    const empty: { algae?: readonly number[] } = {};
    expect(grazeAlgaeInPlace(empty, [animal('neritine', 1)], 1)).toBe(0);
    expect(empty).toEqual({});

    const water = { algae: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] };
    expect(grazeAlgaeInPlace(water, [animal('neritine', 0), animal('neon', 1)], 1)).toBe(0);
    expect(grazeAlgaeInPlace(water, [], 1)).toBe(0);
    expect(water.algae).toEqual(new Array(8).fill(0.5));
  });

  it('le champ algae n’est retiré que si le broutage vide toutes les plaques (#835)', () => {
    const emptied: { algae?: readonly number[] } = { algae: [0, 0.001, 0, 0, 0, 0, 0, 0] };
    expect(grazeAlgaeInPlace(emptied, [animal('ancistrus', 1)], 1000)).toBeCloseTo(0.001, 12);
    expect(emptied.algae).toBeUndefined();

    const left: { algae?: readonly number[] } = { algae: [0, 0.001, 0, 0.5, 0, 0, 0, 0] };
    expect(grazeAlgaeInPlace(left, [animal('cerise', 1)], 1000)).toBeCloseTo(0.001, 12);
    expect(left.algae).toEqual([0, 0, 0, 0.5, 0, 0, 0, 0]);

    const bare: { algae?: readonly number[] } = { algae: new Array(8).fill(0) };
    expect(grazeAlgaeInPlace(bare, [animal('neritine', 1)], 1)).toBe(0);
    expect(bare.algae).toEqual(new Array(8).fill(0));
  });

  it('crevettes face aux seules algues dures : rien à manger, faim intacte', () => {
    const water = { algae: [0, 0, 0, 0.5, 0, 0, 0.5, 0] };
    const shrimp = animal('cerise', 0.8);
    expect(grazeAlgaeInPlace(water, [shrimp], 10)).toBe(0);
    expect(shrimp.hunger).toBe(0.8);
  });

  it('refuse un pas invalide', () => {
    for (const dt of [0, -1, Number.NaN, Infinity]) {
      expect(() => grazeAlgaeInPlace({}, [], dt)).toThrow(RangeError);
    }
  });

  it('seule la faim de la néritine compte en plus des mangeurs de granulés', () => {
    expect(starvesWithoutFood('neritine')).toBe(true);
    expect(starvesWithoutFood('cerise')).toBe(false);
    expect(starvesWithoutFood('neon')).toBe(false);
    expect(hungerCounts(SPECIES.neritine)).toBe(true);
    expect(hungerCounts(SPECIES.cerise)).toBe(false);
    expect(healthStress(1, SPECIES.neritine, false)).toBe(1);
    expect(healthStress(1, SPECIES.cerise, false)).toBe(0);
  });

  it('chaque brouteur a une vitesse strictement positive et finie', () => {
    for (const grazer of Object.values(GRAZERS)) {
      expect(grazer.rate.value).toBeGreaterThan(0);
      expect(Number.isFinite(grazer.rate.value)).toBe(true);
    }
    expect(Object.keys(GRAZERS).sort()).toEqual(['ancistrus', 'cerise', 'neritine', 'otocinclus']);
  });
});
