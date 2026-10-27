import { describe, expect, it } from 'vitest';
import { ENVIRONMENT_IDS } from './environment';
import { SPECIES, validateSpecies, type SpeciesId } from './species';
import { speciesCatalog } from './species-catalog';
import {
  confidenceText,
  DDPP_NOTICE,
  EXCLUSIONS,
  exclusionOf,
  isExcluded,
  LEGAL_STATUS,
  legalStatus,
  legalText,
  type LegalStatus,
} from './species-legal';

const IDS = Object.keys(SPECIES) as SpeciesId[];

describe('statut légal en France (#269)', () => {
  it('toute espèce a un statut, une référence non vide et un niveau de confiance', () => {
    expect(Object.keys(LEGAL_STATUS).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const status = legalStatus(id);
      expect(status.reference.trim(), id).not.toBe('');
      expect(['sans-formalite', 'declaration', 'certificat', 'interdit', 'a-verifier']).toContain(
        status.regime,
      );
      expect(['elevee', 'moyenne', 'faible', 'non-verifie']).toContain(status.confidence);
      expect(Object.isFrozen(status)).toBe(true);
      // Un statut « à vérifier » ne prétend pas à une confiance.
      if (status.regime === 'a-verifier') {
        expect(status.confidence, id).toBe('non-verifie');
      }
    }
  });

  it('aucune espèce du jeu n’est interdite ni soumise à certificat dès le premier individu', () => {
    for (const id of IDS) {
      expect(['interdit', 'certificat'], id).not.toContain(legalStatus(id).regime);
    }
  });

  it('tant qu’un statut n’est pas confirmé, le texte dit « à vérifier auprès de la DDPP »', () => {
    for (const id of IDS) {
      const status = legalStatus(id);
      expect(status.confirmed, id).toBe(false);
      expect(legalText(status), id).toContain(DDPP_NOTICE);
    }
    expect(legalText(legalStatus('axolotl'))).toBe(
      'sans formalité jusqu’à 40 individus ; certificat de capacité au-delà ; ne jamais relâcher ; à vérifier auprès de la DDPP',
    );
    expect(legalText(legalStatus('neon'))).toMatch(/^statut non établi ; /);
  });

  it('texte de chaque régime ; prudence absente une fois confirmé', () => {
    const base: LegalStatus = {
      regime: 'declaration',
      maxWithoutFormality: null,
      confidence: 'elevee',
      confirmed: true,
      reference: 'X',
      note: '',
    };
    expect(legalText(base)).toBe('déclaration avant l’acquisition');
    expect(legalText({ ...base, regime: 'certificat' })).toBe(
      'certificat de capacité dès le premier individu',
    );
    expect(legalText({ ...base, regime: 'interdit', note: 'n' })).toBe('détention interdite ; n');
    expect(legalText({ ...base, regime: 'sans-formalite' })).toBe('sans formalité');
    expect(confidenceText('moyenne')).toBe('confiance moyenne');
    expect(confidenceText('non-verifie')).toBe('non vérifié');
  });
});

describe('liste d’exclusion (#269)', () => {
  it('refuse Xenopus laevis (interdit en France)', () => {
    expect(exclusionOf('Xenopus laevis')?.reason).toBe('interdit');
    // Casse, espaces, auteur et sous-espèce ignorés.
    expect(exclusionOf('  xenopus   LAEVIS (Daudin, 1802) ')?.reason).toBe('interdit');
    expect(exclusionOf('Xenopus laevis laevis')?.taxon).toBe('Xenopus laevis');
  });

  it('refuse une espèce de la liste de l’Union (règlement UE 1143/2014)', () => {
    expect(exclusionOf('Pseudorasbora parva')?.reason).toBe('liste-union');
    expect(exclusionOf('Procambarus clarkii')?.reason).toBe('liste-union');
    expect(isExcluded('Trachemys scripta elegans')).toBe(true);
  });

  it('refuse un genre entier soumis à certificat dès 1 individu, et les indigènes protégées', () => {
    expect(exclusionOf('Xenopus tropicalis')).toMatchObject({
      taxon: 'Xenopus',
      reason: 'certificat-des-un',
    });
    expect(exclusionOf('Hymenochirus boettgeri')?.reason).toBe('certificat-des-un');
    expect(exclusionOf('Triturus cristatus')?.reason).toBe('certificat-des-un');
    expect(exclusionOf('Salamandra salamandra')?.reason).toBe('indigene-protegee');
  });

  it('laisse passer les espèces non listées, les noms vides et les genres proches', () => {
    expect(exclusionOf('Cynops orientalis')).toBeNull();
    expect(exclusionOf('Ambystoma mexicanum')).toBeNull();
    expect(exclusionOf('')).toBeNull();
    expect(exclusionOf('   ')).toBeNull();
    expect(exclusionOf('Xenopuss laevis')).toBeNull();
    expect(exclusionOf('Salamandra atra')).toBeNull();
  });

  it('chaque exclusion porte une référence ; liste figée', () => {
    expect(Object.isFrozen(EXCLUSIONS)).toBe(true);
    for (const entry of EXCLUSIONS) {
      expect(entry.reference.trim(), entry.taxon).not.toBe('');
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });

  it('aucune espèce exclue dans le catalogue ni dans les définitions', () => {
    for (const id of IDS) {
      expect(isExcluded(SPECIES[id].scientificName), id).toBe(false);
    }
    for (const env of ENVIRONMENT_IDS) {
      for (const entry of speciesCatalog(env)) {
        expect(isExcluded(entry.scientificName), `${env}/${entry.species}`).toBe(false);
      }
    }
  });

  it('une définition d’espèce exclue est refusée par la validation', () => {
    const problems = validateSpecies({ ...SPECIES.grenouille, scientificName: 'Xenopus laevis' });
    expect(problems).toContain('espèce exclue (interdit) : Xenopus laevis');
    expect(validateSpecies(SPECIES.grenouille)).toEqual([]);
  });
});
