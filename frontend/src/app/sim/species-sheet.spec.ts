import { describe, expect, it } from 'vitest';
import { compatibility, TEMPERAMENTS } from './compatibility';
import { ENVIRONMENT_IDS, environmentById, environmentWater } from './environment';
import { SPECIES, type SpeciesId } from './species';
import { speciesCatalog } from './species-catalog';
import {
  addWarnings,
  addWarningText,
  frenchNumber,
  SHEET_FIELD_LABELS,
  SHEET_FIELDS,
  sheetNotes,
  sheetRows,
  speciesSheet,
  statusText,
  type SheetField,
} from './species-sheet';
import { TANK_LIMITS } from './tank';
import { waterLiters } from './water';
import { SPECIES_PH } from './water-ph';

const IDS = Object.keys(SPECIES) as SpeciesId[];

describe('fiches d’espèces (#237)', () => {
  it('toute espèce du catalogue a une fiche complète, chaque champ avec un statut valable', () => {
    const catalogued = new Set(ENVIRONMENT_IDS.flatMap((env) => speciesCatalog(env)));
    expect(catalogued.size).toBeGreaterThan(0);
    for (const entry of catalogued) {
      const sheet = speciesSheet(entry.species);
      expect(sheet.species).toBe(entry.species);
      for (const field of SHEET_FIELDS) {
        const value = sheet[field] as SheetField<unknown>;
        expect(value, `${entry.species}.${field}`).toBeDefined();
        expect(value.value, `${entry.species}.${field}`).not.toBeUndefined();
        const status = value.status;
        if (status.kind === 'source') {
          expect(status.reference.trim(), `${entry.species}.${field}`).not.toBe('');
        } else {
          expect(status.kind).toBe('approximation');
        }
      }
    }
  });

  it('chaque espèce connue a une fiche ; valeurs plausibles et cohérentes', () => {
    for (const id of IDS) {
      const s = speciesSheet(id);
      expect(s.adultSize.value).toBeGreaterThan(0);
      expect(s.minGroup.value).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(s.minGroup.value)).toBe(true);
      expect(s.minLiters.value).toBeGreaterThan(0);
      const tp = s.temperaturePreferred.value;
      const tt = s.temperatureTolerated.value;
      expect(tp.min).toBeLessThanOrEqual(tp.max);
      // La préférée est comprise dans la tolérée.
      expect(tp.min).toBeGreaterThanOrEqual(tt.min);
      expect(tp.max).toBeLessThanOrEqual(tt.max);
    }
  });

  it('pH, caractère et espèces à éviter viennent de la simulation (pas de copie)', () => {
    for (const id of IDS) {
      const s = speciesSheet(id);
      expect(s.phPreferred.value).toBe(SPECIES_PH[id].ideal);
      expect(s.phTolerated.value).toBe(SPECIES_PH[id].tolerated);
      expect(s.phPreferred.status.kind).toBe('approximation');
      expect(s.temperament.value).toBe(TEMPERAMENTS[id]);
      expect(s.avoid.value).toEqual(IDS.filter((o) => compatibility(id, o) !== 'compatible'));
      expect(s.avoid.value).not.toContain(id);
    }
    expect(speciesSheet('axolotl').avoid.value).toContain('triton');
    expect(speciesSheet('neon').avoid.value).toContain('koi');
  });

  it('les plages de température de docs/SOINS.md § 11 portent leur source', () => {
    expect(speciesSheet('neon').temperatureTolerated).toEqual({
      value: { min: 20, max: 26 },
      status: { kind: 'source', reference: 'docs/SOINS.md § 11 (FishBase)' },
    });
    // Sonneur et triton (#270) : plage préférée sourcée (docs/ESPECES.md, anapsid.org), plage
    // tolérée non sourcée, donc approximation.
    expect(speciesSheet('grenouille').temperatureTolerated.status.kind).toBe('approximation');
    expect(speciesSheet('triton').temperatureTolerated.status.kind).toBe('approximation');
    expect(speciesSheet('triton').temperaturePreferred.status.kind).toBe('source');
  });

  it('fiches figées et partagées', () => {
    const s = speciesSheet('guppy');
    expect(speciesSheet('guppy')).toBe(s);
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.avoid.value)).toBe(true);
  });

  it('lignes affichées : un intitulé, une valeur et un statut par champ, à la française', () => {
    const rows = sheetRows('neon');
    expect(rows.map((r) => r.field)).toEqual([...SHEET_FIELDS]);
    expect(rows.map((r) => r.label)).toEqual(SHEET_FIELDS.map((f) => SHEET_FIELD_LABELS[f]));
    const byField = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(byField['adultSize'].value).toBe('4 cm');
    expect(byField['temperatureTolerated']).toMatchObject({
      value: '20 – 26 °C',
      status: 'Source : docs/SOINS.md § 11 (FishBase)',
    });
    expect(byField['phPreferred']).toMatchObject({
      value: '6 – 7,2',
      status: 'Approximation de jeu',
    });
    expect(byField['minGroup'].value).toBe('6 individus');
    expect(byField['minLiters'].value).toBe('60 L');
    expect(byField['avoid'].value).toBe('koïs, axolotls');
    expect(sheetRows('axolotl').find((r) => r.field === 'minGroup')?.value).toBe('peut vivre seul');
    expect(sheetRows('guppy').find((r) => r.field === 'avoid')?.value).toBe('koïs, axolotls');
    expect(sheetRows('chirurgien').find((r) => r.field === 'avoid')?.value).toBe('koïs');
    for (const id of IDS) {
      for (const row of sheetRows(id)) {
        expect(row.value, `${id}.${row.field}`).not.toBe('');
        expect(row.value).not.toMatch(/undefined|NaN/);
      }
    }
  });

  it('nombres et statuts écrits à la française', () => {
    expect(frenchNumber(7.2)).toBe('7,2');
    expect(frenchNumber(60)).toBe('60');
    expect(statusText({ kind: 'approximation' })).toBe('Approximation de jeu');
    expect(statusText({ kind: 'source', reference: 'X' })).toBe('Source : X');
  });
});

describe('statut légal et corrections de fiches (#269)', () => {
  it('chaque fiche porte le statut légal, sourcé, avec sa confiance et la prudence DDPP', () => {
    for (const id of IDS) {
      const legal = speciesSheet(id).legal;
      expect(legal.status.kind, id).toBe('source');
      const row = sheetRows(id).find((r) => r.field === 'legal');
      expect(row?.label).toBe('Statut légal en France');
      expect(row?.value, id).toContain('à vérifier auprès de la DDPP');
      expect(row?.status, id).toMatch(/^Source : .+ ; (confiance \S+|non vérifié)$/);
    }
    expect(sheetRows('axolotl').find((r) => r.field === 'legal')?.status).toMatch(
      /confiance moyenne$/,
    );
  });

  it('koï : fiche non vérifiée, aucun paramètre chiffré présenté comme sourcé', () => {
    const koi = speciesSheet('koi');
    for (const field of SHEET_FIELDS.filter((f) => f !== 'legal')) {
      expect(koi[field].status.kind, field).toBe('approximation');
    }
    expect(sheetNotes('koi').map((n) => n.text)).toEqual([
      'Fiche non vérifiée : aucun paramètre chiffré confirmé (FishBase et source vétérinaire à consulter)',
    ]);
  });

  it('chirurgien bleu : pas pour débutant, 31 cm et 300 L sourcés', () => {
    const s = speciesSheet('chirurgien');
    expect(s.adultSize).toMatchObject({ value: 31, status: { kind: 'source' } });
    expect(s.minLiters).toMatchObject({ value: 300, status: { kind: 'source' } });
    expect(sheetNotes('chirurgien')[0].text).toMatch(/^Pas pour débutant/);
  });

  it('poisson-clown : vit sans anémone ; autres espèces sans mise en garde', () => {
    expect(sheetNotes('clown')[0].text).toMatch(/^Vit très bien sans anémone/);
    for (const note of [
      ...sheetNotes('clown'),
      ...sheetNotes('chirurgien'),
      ...sheetNotes('koi'),
    ]) {
      expect(note.status).toMatch(/^Source : docs\/ESPECES\.md/);
    }
    expect(sheetNotes('neon')).toEqual([]);
    expect(Object.isFrozen(speciesSheet('neon').notes)).toBe(true);
  });

  it('corydoras : Hoplisoma paleatum, nom courant conservé', () => {
    expect(SPECIES.corydora.scientificName).toBe('Hoplisoma paleatum');
    expect(SPECIES.corydora.name).toBe('Corydora');
  });

  it('avertissement d’ajout du chirurgien bleu sous 300 L, absent à 300 L et plus', () => {
    const recif = environmentById('recif').species;
    const kinds = (liters: number) =>
      addWarnings('chirurgien', 1, liters, { chirurgien: 1 }, recif).map((w) => w.kind);
    expect(addWarnings('chirurgien', 1, 299, { chirurgien: 1 }, recif)).toContainEqual({
      kind: 'volume',
      species: 'chirurgien',
      liters: 299,
      minLiters: 300,
    });
    expect(kinds(299.9)).toContain('volume');
    expect(kinds(300)).not.toContain('volume');
    expect(kinds(1000)).not.toContain('volume');
  });
});

describe('avertissement d’ajout (#237)', () => {
  const tropical = environmentById('tropical').species;

  it('population par défaut : ni volume ni groupe (mélanges déjà signalés, #209)', () => {
    for (const env of ENVIRONMENT_IDS) {
      const { population, species } = environmentById(env);
      const liters = waterLiters(environmentWater(env));
      const counts = Object.fromEntries(population.map((p) => [p.species, p.count]));
      for (const { species: id, count } of population) {
        const kinds = addWarnings(id, count, liters, counts, species).map((w) => w.kind);
        expect(kinds, `${env}/${id}`).not.toContain('volume');
        expect(kinds, `${env}/${id}`).not.toContain('groupe');
      }
    }
  });

  it('bac vide : seuls volume et groupe peuvent avertir', () => {
    expect(addWarnings('neon', 1, 288, { neon: 1 }, tropical)).toEqual([
      { kind: 'groupe', species: 'neon', count: 1, minGroup: 6 },
    ]);
    expect(addWarnings('axolotl', 1, 105, { axolotl: 1 }, ['axolotl'])).toEqual([]);
    expect(addWarnings('neon', 6, 288, {}, [])).toEqual([]);
  });

  it('volume : strictement sous le conseil seulement (volume exact : rien)', () => {
    expect(addWarnings('corydora', 6, 100, { corydora: 6 }, tropical)).toEqual([]);
    expect(addWarnings('corydora', 6, 99.9, { corydora: 6 }, tropical)).toEqual([
      { kind: 'volume', species: 'corydora', liters: 99.9, minLiters: 100 },
    ]);
    // Volume inconnu ou invalide : pas d'avertissement de volume.
    for (const liters of [0, -1, Number.NaN, Infinity]) {
      expect(addWarnings('corydora', 6, liters, { corydora: 6 }, tropical)).toEqual([]);
    }
  });

  it('volume : le plus petit bac tropical réglable déclenche l’avertissement des corydoras', () => {
    const small = {
      environment: 'tropical' as const,
      dimensions: {
        width: TANK_LIMITS.width.min,
        height: TANK_LIMITS.height.min,
        depth: TANK_LIMITS.depth.min,
      },
    };
    const liters = waterLiters(environmentWater(small));
    expect(liters).toBeLessThan(100);
    expect(addWarnings('corydora', 6, liters, { corydora: 6 }, tropical)).toEqual([
      { kind: 'volume', species: 'corydora', liters, minLiters: 100 },
    ]);
  });

  it('groupe : strictement sous le minimum seulement', () => {
    expect(addWarnings('neon', 5, 288, { neon: 5 }, tropical)).toEqual([
      { kind: 'groupe', species: 'neon', count: 5, minGroup: 6 },
    ]);
    expect(addWarnings('neon', 6, 288, { neon: 6 }, tropical)).toEqual([]);
  });

  it('rien d’ajouté (effectif nul, négatif ou non fini) : aucun avertissement', () => {
    for (const count of [0, -3, Number.NaN, Infinity]) {
      expect(addWarnings('neon', count, 10, { neon: count, guppy: 3 }, tropical)).toEqual([]);
    }
  });

  it('incompatibilité avec les espèces présentes, dans l’ordre donné', () => {
    const order = ['axolotl', 'grenouille', 'triton'];
    expect(addWarnings('triton', 2, 105, { axolotl: 2, grenouille: 3, triton: 2 }, order)).toEqual([
      { kind: 'incompatible', species: 'triton', other: 'axolotl', reason: 'predateur' },
    ]);
    // Espèce absente (effectif nul) : pas d'avertissement.
    expect(addWarnings('triton', 2, 105, { axolotl: 0, triton: 2 }, order)).toEqual([]);
    // Doublons, inconnues et clés héritées ignorés.
    expect(
      addWarnings('triton', 2, 105, { axolotl: 1 }, ['axolotl', 'axolotl', 'inconnu', 'toString']),
    ).toHaveLength(1);
    // Effectif non fini d'une autre espèce : ignoré.
    expect(addWarnings('triton', 2, 105, { axolotl: Infinity }, order)).toEqual([]);
  });

  it('textes', () => {
    expect(
      addWarningText({ kind: 'volume', species: 'corydora', liters: 80.6, minLiters: 100 }),
    ).toBe('Bac trop petit pour des corydoras : 81 L, 100 L conseillés');
    expect(addWarningText({ kind: 'groupe', species: 'neon', count: 1, minGroup: 6 })).toBe(
      'Groupe trop petit : 1 néon, 6 au moins conseillés',
    );
    expect(addWarningText({ kind: 'groupe', species: 'neon', count: 3, minGroup: 6 })).toBe(
      'Groupe trop petit : 3 néons, 6 au moins conseillés',
    );
    expect(
      addWarningText({
        kind: 'incompatible',
        species: 'triton',
        other: 'axolotl',
        reason: 'predateur',
      }),
    ).toBe('Tritons à ventre de feu déconseillés avec les axolotls (prédateur)');
    expect(
      addWarningText({
        kind: 'incompatible',
        species: 'grenouille',
        other: 'axolotl',
        reason: 'predateur',
      }),
    ).toBe('Sonneurs orientaux déconseillés avec les axolotls (prédateur)');
  });
});
