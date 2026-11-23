import { describe, expect, it } from 'vitest';
import { SPECIES, type SpeciesId } from './species';
import { DENSITY_LITERS_PER_CM, SPECIES_ECOLOGY } from './species-ecology';
import {
  AMPHIBIAN_ECOLOGY,
  AMPHIBIAN_WATER_SHARE,
  amphibianWaterLiters,
  type AmphibianId,
} from './species-ecology-amphibiens';
import { exclusionOf, isExcluded } from './species-legal';
import { speciesSheet } from './species-sheet';

/** Tranche du paludarium (#786, c283). */
const TRANCHE: readonly AmphibianId[] = ['axolotl', 'grenouille', 'triton'];

describe('données d’écologie, paludarium (#786)', () => {
  it('les 3 amphibiens ont leurs données, reprises telles quelles par la table et la fiche', () => {
    expect(Object.keys(AMPHIBIAN_ECOLOGY).sort()).toEqual([...TRANCHE].sort());
    for (const id of TRANCHE) {
      expect(SPECIES_ECOLOGY[id], id).toBe(AMPHIBIAN_ECOLOGY[id]);
      expect(speciesSheet(id).ecology, id).toBe(AMPHIBIAN_ECOLOGY[id]);
      expect(SPECIES_ECOLOGY[id].densityClass.value, id).toBe('amphibian');
    }
  });

  it('part d’eau : dans ]0, 1], axolotl entièrement aquatique, triton plus aquatique que le sonneur', () => {
    for (const id of TRANCHE) {
      const share = AMPHIBIAN_WATER_SHARE[id].value;
      expect(share, id).toBeGreaterThan(0);
      expect(share, id).toBeLessThanOrEqual(1);
    }
    expect(AMPHIBIAN_WATER_SHARE.axolotl.value).toBe(1);
    expect(AMPHIBIAN_WATER_SHARE.triton.value).toBeGreaterThan(
      AMPHIBIAN_WATER_SHARE.grenouille.value,
    );
  });

  it('sonneur : un quart de berge sèche, sourcé ; les autres parts sont des approximations', () => {
    const frog = AMPHIBIAN_WATER_SHARE.grenouille;
    expect(frog.value).toBe(0.75);
    expect(frog.status.kind).toBe('source');
    expect(frog.status.kind === 'source' && frog.status.reference).toContain('anapsid.org');
    expect(AMPHIBIAN_WATER_SHARE.axolotl.status.kind).toBe('approximation');
    expect(AMPHIBIAN_WATER_SHARE.triton.status.kind).toBe('approximation');
  });

  it('volume d’eau : berge déduite, jamais négatif, nul pour un milieu vide', () => {
    expect(amphibianWaterLiters('grenouille', 100)).toBe(75);
    expect(amphibianWaterLiters('axolotl', 120)).toBe(120);
    expect(amphibianWaterLiters('triton', 0)).toBe(0);
    expect(amphibianWaterLiters('grenouille', -40)).toBe(0);
    expect(amphibianWaterLiters('triton', 1e6)).toBeCloseTo(9e5);
  });

  it('le volume minimal de la fiche, berge déduite, loge un adulte au plafond de densité', () => {
    const ceiling = DENSITY_LITERS_PER_CM.amphibian.value.min;
    for (const id of TRANCHE) {
      const sheet = speciesSheet(id);
      const water = amphibianWaterLiters(id, sheet.minLiters.value);
      expect(water, id).toBeGreaterThanOrEqual(sheet.adultSize.value * ceiling);
    }
    // 3 L par cm : l'axolotl de 25 cm retrouve exactement les 75 L de sa fiche.
    expect(speciesSheet('axolotl').adultSize.value * ceiling).toBe(75);
  });

  it('dureté tolérée en GH, qui contient la dureté conseillée de la fiche', () => {
    for (const id of TRANCHE) {
      const tolerated = SPECIES_ECOLOGY[id].hardnessTolerated.value;
      const preferred = speciesSheet(id).hardness.value;
      expect(tolerated.kind, id).toBe('gh');
      expect(tolerated.min, id).toBeLessThanOrEqual(preferred.min);
      expect(tolerated.max, id).toBeGreaterThanOrEqual(preferred.max);
    }
  });

  it('sans poissons ni crevettes : aucune proie, aucun prédateur, et aucune espèce ne les mange', () => {
    for (const id of TRANCHE) {
      expect(SPECIES_ECOLOGY[id].prey.value, id).toEqual([]);
      expect(SPECIES_ECOLOGY[id].predators.value, id).toEqual([]);
    }
    const hunters = (Object.keys(SPECIES) as SpeciesId[]).filter((id) =>
      SPECIES_ECOLOGY[id].prey.value.some((prey) =>
        (TRANCHE as readonly SpeciesId[]).includes(prey.species),
      ),
    );
    expect(hunters).toEqual([]);
    expect(SPECIES_ECOLOGY.grenouille.foods.value).toEqual([]);
  });

  it('exclusions légales : les espèces retenues passent, Xenopus, Pipidae et Triturus restent refusés', () => {
    for (const id of TRANCHE) {
      expect(isExcluded(SPECIES[id].scientificName), id).toBe(false);
    }
    expect(exclusionOf('Xenopus laevis')?.reason).toBe('interdit');
    expect(exclusionOf('Hymenochirus boettgeri')).not.toBeNull();
    expect(exclusionOf('Triturus cristatus')).not.toBeNull();
    expect(exclusionOf('Bombina variegata')).not.toBeNull();
  });

  it('données figées', () => {
    expect(Object.isFrozen(AMPHIBIAN_ECOLOGY)).toBe(true);
    expect(Object.isFrozen(AMPHIBIAN_WATER_SHARE)).toBe(true);
    for (const id of TRANCHE) {
      expect(Object.isFrozen(AMPHIBIAN_ECOLOGY[id].foods.value), id).toBe(true);
    }
  });
});
