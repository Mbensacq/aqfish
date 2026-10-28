import { describe, expect, it } from 'vitest';
import { ENVIRONMENT_IDS, environmentById } from './environment';
import { SPECIES, type SpeciesId } from './species';
import { SHEET_FIELD_LABELS, SHEET_FIELDS, speciesSheet, statusText } from './species-sheet';
import { matchesWikiSearch, searchKey, wikiCare, wikiLists, wikiSheet } from './species-wiki';

const IDS = Object.keys(SPECIES) as SpeciesId[];

/** Espèces trouvées par `query`, toutes espèces confondues, dans l'ordre de `SPECIES`. */
const found = (query: string) => IDS.filter((id) => matchesWikiSearch(id, query));

const ids = (entries: readonly { species: SpeciesId }[]) => entries.map((e) => e.species);

describe('wiki des espèces : recherche (#287)', () => {
  it('clé de recherche : minuscules, sans accents, blancs et tirets resserrés', () => {
    expect(searchKey('  Koï  ')).toBe('koi');
    expect(searchKey('Poissons-Clowns')).toBe('poissons clowns');
    expect(searchKey('Triton à   ventre de FEU')).toBe('triton a ventre de feu');
    expect(searchKey('d’axolotls')).toBe('d axolotls');
    expect(searchKey('ÉCHAP')).toBe('echap');
    expect(searchKey('')).toBe('');
  });

  it('sans tenir compte de la casse ni des accents', () => {
    expect(found('koi')).toEqual(['koi']);
    expect(found('KOÏ')).toEqual(['koi']);
    expect(found('néon')).toEqual(['neon']);
    expect(found('NEON')).toEqual(['neon']);
    expect(found('triton a ventre')).toEqual(['triton']);
  });

  it('par nom scientifique, entier ou partiel', () => {
    expect(found('Ambystoma mexicanum')).toEqual(['axolotl']);
    expect(found('paracheirodon')).toEqual(['neon']);
    expect(found('bombina')).toEqual(['grenouille']);
    expect(found('hepatus')).toEqual(['chirurgien']);
  });

  it('par le singulier et le pluriel du catalogue', () => {
    expect(found('sonneurs orientaux')).toEqual(['grenouille']);
    expect(found('poisson clown')).toEqual(['clown']);
    expect(found('chirurgiens bleus')).toEqual(['chirurgien']);
  });

  it('aucun résultat : liste vide, dans les deux parties', () => {
    expect(found('requin')).toEqual([]);
    const lists = wikiLists('tropical', { neon: 12 }, 'requin');
    expect(lists.present).toEqual([]);
    expect(lists.addable).toEqual([]);
  });

  it('chaîne vide ou faite de blancs : toutes les espèces', () => {
    expect(found('')).toEqual(IDS);
    expect(found('   ')).toEqual(IDS);
    expect(wikiLists('tropical', {}, '')).toEqual(wikiLists('tropical', {}));
  });
});

describe('wiki des espèces : présentes et ajoutables (#287)', () => {
  it('bac tropical : présentes avec leur effectif, puis ajoutables, sans doublon', () => {
    const lists = wikiLists('tropical', { neon: 12, guppy: 0, corydora: 4 });
    expect(lists.present.map((e) => [e.species, e.count])).toEqual([
      ['neon', 12],
      ['corydora', 4],
    ]);
    // Lot 1 d'eau douce (#238) : proposé au bac tropical, jamais peuplé d'office.
    expect(ids(lists.addable)).toEqual(['guppy', 'rasbora', 'tetra', 'kuhli', 'gourami']);
    expect(lists.addable[0]).toEqual({
      species: 'guppy',
      name: SPECIES.guppy.name,
      scientificName: SPECIES.guppy.scientificName,
      count: 0,
    });
  });

  it('bac vide : rien de présent, toutes les espèces de l’environnement ajoutables', () => {
    for (const env of ENVIRONMENT_IDS) {
      const lists = wikiLists(env, {});
      expect(lists.present, env).toEqual([]);
      expect(ids(lists.addable), env).toEqual(environmentById(env).species);
    }
  });

  it('espèce hors environnement : jamais ajoutable ; présente seulement si le bac en contient', () => {
    expect(ids(wikiLists('tropical', {}).addable)).not.toContain('koi');
    expect(ids(wikiLists('tropical', { koi: 0 }).present)).toEqual([]);
    // Cas anormal (sauvegarde altérée) : montré tel quel, après les espèces du lieu.
    const lists = wikiLists('tropical', { koi: 2, neon: 3 });
    expect(lists.present.map((e) => [e.species, e.count])).toEqual([
      ['neon', 3],
      ['koi', 2],
    ]);
    expect(ids(lists.addable)).toEqual([
      'guppy',
      'corydora',
      'rasbora',
      'tetra',
      'kuhli',
      'gourami',
    ]);
  });

  it('effectifs invalides comptés comme nuls ; clés inconnues ignorées', () => {
    const lists = wikiLists('paludarium', {
      axolotl: Number.NaN,
      grenouille: -2,
      triton: Number.POSITIVE_INFINITY,
      requin: 5,
      toString: 3,
    } as Record<string, number>);
    expect(lists.present).toEqual([]);
    expect(ids(lists.addable)).toEqual(['axolotl', 'grenouille', 'triton']);
  });

  it('recherche appliquée aux deux parties', () => {
    const lists = wikiLists('paludarium', { axolotl: 1 }, 'TRITON');
    expect(lists.present).toEqual([]);
    expect(ids(lists.addable)).toEqual(['triton']);
    expect(ids(wikiLists('paludarium', { axolotl: 1 }, 'ambystoma').present)).toEqual(['axolotl']);
  });

  it('environnement inconnu : erreur', () => {
    expect(() => wikiLists('lune' as never, {})).toThrow(RangeError);
  });
});

describe('wiki des espèces : modèle de vue d’une fiche (#287)', () => {
  it.each(IDS)('%s : chaque champ de la fiche, dans l’ordre, avec son statut', (id) => {
    const view = wikiSheet(id);
    const sheet = speciesSheet(id);
    expect(view.species).toBe(id);
    expect(view.name).toBe(SPECIES[id].name);
    expect(view.scientificName).toBe(SPECIES[id].scientificName);
    expect(view.rows.map((row) => row.field)).toEqual([...SHEET_FIELDS]);
    for (const row of view.rows) {
      expect(row.label).toBe(SHEET_FIELD_LABELS[row.field]);
      expect(row.value.trim(), `${id}.${row.field}`).not.toBe('');
      // Le statut affiché est celui de la fiche (source avec référence, ou approximation).
      expect(row.status.startsWith(statusText(sheet[row.field].status)), row.field).toBe(true);
    }
    expect(view.notes.map((n) => n.text)).toEqual(sheet.notes.map((n) => n.text));
    expect(view.notes.map((n) => n.status)).toEqual(sheet.notes.map((n) => statusText(n.status)));
  });

  it('valeurs lues dans la fiche, pas recopiées : la taille et le volume suivent la donnée', () => {
    const neon = wikiSheet('neon');
    const size = neon.rows.find((row) => row.field === 'adultSize');
    const liters = neon.rows.find((row) => row.field === 'minLiters');
    expect(size?.value).toBe(`${speciesSheet('neon').adultSize.value} cm`);
    expect(liters?.value).toBe(`${speciesSheet('neon').minLiters.value} L`);
    // Source citée : le statut porte la référence de la fiche.
    const triton = wikiSheet('triton').rows.find((row) => row.field === 'adultSize');
    const status = speciesSheet('triton').adultSize.status;
    expect(status.kind).toBe('source');
    expect(triton?.status).toBe(statusText(status));
  });
});

describe('wiki des espèces : soins de la fiche (#291)', () => {
  it('chaque espèce : alimentation non vide, cohabitation en trois groupes disjoints', () => {
    for (const id of IDS) {
      const care = wikiCare(id);
      expect(care.feeding.length, id).toBe(4);
      const { avoid, together, elsewhere, status } = care.cohabitation;
      expect(avoid.length + together.length + elsewhere.length, id).toBe(IDS.length - 1);
      expect(ids(avoid), id).toEqual(speciesSheet(id).avoid.value);
      for (const item of [...avoid, ...together]) {
        expect(item.reason.trim(), `${id}/${item.species}`).not.toBe('');
        expect(item.name).toBe(SPECIES[item.species].name);
      }
      expect(status).toBe('Approximation de jeu');
    }
  });

  it('néon : déconseillé avec koï et axolotl, avec guppy et corydoras dans le bac tropical', () => {
    const { avoid, together, elsewhere } = wikiCare('neon').cohabitation;
    expect(ids(avoid)).toEqual(['koi', 'axolotl']);
    expect(ids(together)).toEqual(['guppy', 'corydora', 'rasbora', 'tetra', 'kuhli', 'gourami']);
    expect(elsewhere).toEqual(
      ['grenouille', 'triton', 'clown', 'chirurgien'].map((id) => SPECIES[id as SpeciesId].name),
    );
  });
});
