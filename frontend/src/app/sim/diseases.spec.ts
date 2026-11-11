import { catchesIch, ICH_AGGRAVATED_AT } from './disease';
import { DISEASES, diseasesOf, isSick, type DiseaseField } from './diseases';
import { catchesDropsy, DROPSY_MAX } from './dropsy';
import { catchesFinRot, FIN_ROT_MAX } from './fin-rot';
import { catchesFungus, FUNGUS_MAX } from './fungus';
import { catchesVelvet, VELVET_MAX } from './velvet';
import { ENVIRONMENT_IDS } from './environment';
import { SPECIES_IDS } from './population';

describe('table des maladies (#562)', () => {
  it('liste les cinq maladies dans l’ordre de la sauvegarde', () => {
    expect(DISEASES.map((d) => d.field)).toEqual(['ich', 'finRot', 'velvet', 'fungus', 'dropsy']);
  });

  it('reprend la borne de chaque module', () => {
    const max = Object.fromEntries(DISEASES.map((d) => [d.field, d.max]));
    expect(max).toEqual({
      ich: ICH_AGGRAVATED_AT,
      finRot: FIN_ROT_MAX,
      velvet: VELVET_MAX,
      fungus: FUNGUS_MAX,
      dropsy: DROPSY_MAX,
    });
  });

  it('valide la progression sur [0, max] : bornes incluses, hors bornes et non-nombres refusés', () => {
    for (const d of DISEASES) {
      expect(d.isProgress(0)).toBe(true);
      expect(d.isProgress(d.max)).toBe(true);
      expect(d.isProgress(d.max / 2)).toBe(true);
      expect(d.isProgress(-0.001)).toBe(false);
      expect(d.isProgress(d.max + 0.001)).toBe(false);
      expect(d.isProgress(Number.NaN)).toBe(false);
      expect(d.isProgress(Number.POSITIVE_INFINITY)).toBe(false);
      expect(d.isProgress('10')).toBe(false);
      expect(d.isProgress(undefined)).toBe(false);
    }
  });

  it('délègue les espèces touchées au module de chaque maladie, partout', () => {
    const catches: Record<DiseaseField, typeof catchesIch> = {
      ich: catchesIch,
      finRot: catchesFinRot,
      velvet: catchesVelvet,
      fungus: catchesFungus,
      dropsy: catchesDropsy,
    };
    for (const d of DISEASES) {
      for (const env of ENVIRONMENT_IDS) {
        for (const species of SPECIES_IDS) {
          expect(d.catches(species, env)).toBe(catches[d.field](species, env));
        }
      }
    }
  });
});

describe('diseasesOf et isSick (#562)', () => {
  it('animal sain : aucun champ, pas malade', () => {
    expect(diseasesOf({})).toEqual({});
    expect(Object.keys(diseasesOf({}))).toHaveLength(0);
    expect(isSick({})).toBe(false);
  });

  it('chaque maladie seule, même à zéro (début d’infection), rend malade', () => {
    for (const { field } of DISEASES) {
      const fish = { [field]: 0 };
      expect(diseasesOf(fish)).toEqual({ [field]: 0 });
      expect(isSick(fish)).toBe(true);
    }
  });

  it('copie toutes les maladies portées et ignore les autres champs', () => {
    const fish = {
      ich: 12,
      finRot: 30,
      velvet: 900,
      fungus: 1,
      dropsy: 700,
      health: 0.4,
      species: 'neon',
    };
    expect(diseasesOf(fish)).toEqual({ ich: 12, finRot: 30, velvet: 900, fungus: 1, dropsy: 700 });
    expect(isSick(fish)).toBe(true);
  });

  it('un champ explicitement undefined ne compte pas', () => {
    const fish = { ich: undefined, fungus: 5 };
    expect(diseasesOf(fish)).toEqual({ fungus: 5 });
    expect('ich' in diseasesOf(fish)).toBe(false);
    expect(isSick({ ich: undefined })).toBe(false);
  });
});
