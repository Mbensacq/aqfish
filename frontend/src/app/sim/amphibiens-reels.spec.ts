import { livesIn } from './environment';
import { speciesCatalog } from './species-catalog';
import { exclusionOf, isExcluded, legalStatus, legalText } from './species-legal';
import { sheetNotes, sheetRows, speciesSheet } from './species-sheet';
import {
  GRENOUILLE,
  SILHOUETTE_IDS,
  SPECIES,
  TRITON,
  validateSpecies,
  type AmphibianParams,
  type SpeciesId,
} from './species';
import { SPECIES_PH } from './water-ph';

/**
 * Amphibiens réels du paludarium (issue #270, lot 2/3 de #262, ADR 0064) : sonneur oriental
 * (identifiant `grenouille`) et triton à ventre de feu chinois (identifiant `triton`).
 */
describe('amphibiens réels du paludarium (#270)', () => {
  const REAL: readonly { id: SpeciesId; name: string; scientific: string }[] = [
    { id: 'grenouille', name: 'Sonneur oriental', scientific: 'Bombina orientalis' },
    { id: 'triton', name: 'Triton à ventre de feu', scientific: 'Cynops orientalis' },
  ];

  it('noms réels, plus aucun taxon générique dans les définitions', () => {
    for (const { id, name, scientific } of REAL) {
      expect(SPECIES[id].name).toBe(name);
      expect(SPECIES[id].scientificName).toBe(scientific);
    }
    for (const def of Object.values(SPECIES)) {
      expect(def.scientificName).not.toMatch(/^(Anura|Salamandridae)$/);
      // Nom binominal : « Genre espèce ».
      expect(def.scientificName).toMatch(/^[A-Z][a-z]+ [a-z]+$/);
    }
  });

  it('catalogue du paludarium : nom, nom scientifique et effectifs inchangés', () => {
    const entries = speciesCatalog('paludarium');
    for (const { id, name, scientific } of REAL) {
      const entry = entries.find((e) => e.species === id);
      expect(entry).toMatchObject({ name, scientificName: scientific });
      expect(livesIn('paludarium', id)).toBe(true);
    }
    expect(entries.find((e) => e.species === 'grenouille')).toMatchObject({
      defaultCount: 3,
      maxCount: 4,
    });
    expect(entries.find((e) => e.species === 'triton')).toMatchObject({
      defaultCount: 2,
      maxCount: 3,
    });
  });

  it('statut légal : sans formalité jusqu’à 40, non confirmé, jamais exclu', () => {
    for (const { id, scientific } of REAL) {
      const status = legalStatus(id);
      expect(status.regime).toBe('sans-formalite');
      expect(status.maxWithoutFormality).toBe(40);
      expect(status.confirmed).toBe(false);
      expect(status.reference).not.toBe('');
      expect(legalText(status)).toMatch(
        /^sans formalité jusqu’à 40 individus ; .*à vérifier auprès de la DDPP$/,
      );
      expect(isExcluded(scientific)).toBe(false);
    }
    expect(legalStatus('triton').confidence).toBe('moyenne');
    expect(legalStatus('triton').reference).toContain('Autres Caudata');
    // Ligne « Autres Anoures » appliquée sans confirmation : confiance faible (ADR 0064).
    expect(legalStatus('grenouille').confidence).toBe('faible');
    expect(legalStatus('grenouille').reference).toContain('Autres Anoures');
  });

  it('le sonneur indigène (Bombina variegata) est exclu, pas le sonneur oriental', () => {
    expect(exclusionOf('Bombina variegata')?.reason).toBe('indigene-protegee');
    expect(exclusionOf('Bombina orientalis')).toBeNull();
    expect(exclusionOf('Cynops pyrrhogaster')).toBeNull();
  });

  it('fiches : taille, températures et régime sourcés ou marqués, plages cohérentes', () => {
    for (const { id } of REAL) {
      const sheet = speciesSheet(id);
      const preferred = sheet.temperaturePreferred.value;
      const tolerated = sheet.temperatureTolerated.value;
      expect(preferred.min).toBeLessThanOrEqual(preferred.max);
      expect(tolerated.min).toBeLessThanOrEqual(preferred.min);
      expect(tolerated.max).toBeGreaterThanOrEqual(preferred.max);
      expect(sheet.adultSize.status.kind).toBe('source');
      expect(sheet.temperaturePreferred.status.kind).toBe('source');
      expect(sheet.diet).toMatchObject({ value: 'carnivore', status: { kind: 'source' } });
      for (const field of [sheet.adultSize, sheet.temperaturePreferred, sheet.diet]) {
        if (field.status.kind === 'source') {
          expect(field.status.reference).not.toBe('');
        }
      }
      // pH : plages de la simulation (approximations de jeu), idéale incluse dans la tolérée.
      const ph = SPECIES_PH[id];
      expect(ph.tolerated.min).toBeLessThanOrEqual(ph.ideal.min);
      expect(ph.tolerated.max).toBeGreaterThanOrEqual(ph.ideal.max);
      expect(sheet.phTolerated.status.kind).toBe('approximation');
      expect(sheetNotes(id).length).toBeGreaterThan(0);
      expect(sheetRows(id).find((row) => row.field === 'legal')?.status).toMatch(/confiance/);
    }
    // Valeurs tirées des sources citées (docs/ESPECES.md, anapsid.org).
    expect(speciesSheet('triton').adultSize.value).toBe(10);
    expect(speciesSheet('triton').temperaturePreferred.value).toEqual({ min: 14, max: 20 });
    expect(speciesSheet('triton').temperatureTolerated.value.max).toBe(23);
    expect(speciesSheet('grenouille').adultSize.value).toBe(6);
    expect(speciesSheet('grenouille').temperaturePreferred.value).toEqual({ min: 20, max: 24 });
  });

  it('modèle : gabarits existants, couleurs de la palette, ventre « de feu » visible', () => {
    expect(validateSpecies(GRENOUILLE)).toEqual([]);
    expect(validateSpecies(TRITON)).toEqual([]);
    expect(SILHOUETTE_IDS).toContain(GRENOUILLE.silhouette);
    expect(SILHOUETTE_IDS).toContain(TRITON.silhouette);
    expect(GRENOUILLE.colors).toMatchObject({
      back: '#7bc950',
      accent: '#1c1c22',
      belly: '#d94a3a',
    });
    expect(TRITON.colors).toMatchObject({ back: '#1c1c22', belly: '#e07a2f' });
    // Le ventre se distingue du dos.
    expect(GRENOUILLE.colors.belly).not.toBe(GRENOUILLE.colors.back);
    expect(TRITON.colors.belly).not.toBe(TRITON.colors.back);
  });

  it('comportement : amphibies, le triton plus aquatique que le sonneur', () => {
    const frog = GRENOUILLE.amphibian as AmphibianParams;
    const newt = TRITON.amphibian as AmphibianParams;
    expect(frog).toBeDefined();
    expect(newt).toBeDefined();
    expect(GRENOUILLE.walker).toBeUndefined();
    expect(TRITON.walker).toBeUndefined();
    expect(newt.waterShare).toBeGreaterThan(frog.waterShare);
    expect(newt.hopHeight).toBeLessThan(frog.hopHeight);
    expect(GRENOUILLE.schooling).toBeNull();
    expect(TRITON.schooling).toBeNull();
  });
});
