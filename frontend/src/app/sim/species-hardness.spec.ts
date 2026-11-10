import { describe, expect, it } from 'vitest';
import { environmentById, ENVIRONMENT_IDS } from './environment';
import { SPECIES, type SpeciesId } from './species';
import { comparisonRowOf, tankComparison } from './species-care';
import {
  DETAIL_FIELDS,
  detailRows,
  publicReference,
  speciesSheet,
  statusText,
  thresholdText,
} from './species-sheet';
import { wikiSheet } from './species-wiki';
import { tapHardness } from './water-hardness';
import { COMPOUND_THRESHOLDS } from './water-quality';

const IDS = Object.keys(SPECIES) as SpeciesId[];
const REEF = new Set<SpeciesId>(environmentById('recif').species);

describe('fiches complètes : dureté et durée de vie (#484)', () => {
  it('toute espèce a une plage de dureté et une durée de vie, chacune avec son statut', () => {
    for (const id of IDS) {
      const sheet = speciesSheet(id);
      for (const field of [sheet.hardness, sheet.lifespan]) {
        const { min, max } = field.value;
        expect(Number.isFinite(min) && Number.isFinite(max), id).toBe(true);
        expect(min, id).toBeGreaterThanOrEqual(0);
        expect(min, id).toBeLessThanOrEqual(max);
        if (field.status.kind === 'source') {
          expect(field.status.reference.trim().length, id).toBeGreaterThan(3);
        } else {
          expect(field.status.kind, id).toBe('approximation');
        }
      }
      // Durée de vie en années : au moins une, au plus un siècle.
      expect(sheet.lifespan.value.min, id).toBeGreaterThanOrEqual(1);
      expect(sheet.lifespan.value.max, id).toBeLessThanOrEqual(100);
    }
  });

  it('GH pour l’eau douce, KH (7–11 dKH, Holmes-Farley) pour le récif', () => {
    for (const id of IDS) {
      const { kind, min, max } = speciesSheet(id).hardness.value;
      expect(kind, id).toBe(REEF.has(id) ? 'kh' : 'gh');
      if (kind === 'kh') {
        expect([min, max], id).toEqual([7, 11]);
        expect(speciesSheet(id).hardness.status).toMatchObject({ kind: 'source' });
      }
    }
  });

  it('valeurs sourcées reprises de la documentation et des fiches citées', () => {
    expect(speciesSheet('neon').hardness.value).toMatchObject({ min: 1, max: 12 });
    expect(speciesSheet('guppy').hardness.value).toMatchObject({ min: 8, max: 30 });
    expect(speciesSheet('corydora').hardness.value).toMatchObject({ min: 0, max: 12 });
    expect(speciesSheet('molly').hardness.value).toMatchObject({ min: 15, max: 30 });
    expect(speciesSheet('xipho').hardness.value).toMatchObject({ min: 8, max: 20 });
    for (const id of ['neon', 'guppy', 'corydora', 'molly', 'xipho'] as const) {
      expect(speciesSheet(id).hardness.status.kind, id).toBe('source');
    }
  });

  it('aucune durée de vie n’est présentée comme sourcée (aucune source consultée)', () => {
    for (const id of IDS) {
      expect(speciesSheet(id).lifespan.status.kind, id).toBe('approximation');
    }
  });

  it('l’eau neuve de chaque lieu est dans la plage de dureté de sa population par défaut', () => {
    for (const env of ENVIRONMENT_IDS) {
      const tap = tapHardness(env);
      for (const { species } of environmentById(env).population) {
        const [, , hardness] = tankComparison(species, Number.NaN, Number.NaN, tap);
        expect(hardness.fit, `${env}/${species}`).toBe('dans-la-plage');
      }
    }
  });
});

describe('detailRows (#484)', () => {
  it('cinq lignes dans l’ordre de DETAIL_FIELDS, valeurs et statuts non vides', () => {
    for (const id of IDS) {
      const rows = detailRows(id);
      expect(
        rows.map((r) => r.field),
        id,
      ).toEqual([...DETAIL_FIELDS]);
      for (const row of rows) {
        expect(row.label.trim(), `${id}.${row.field}`).not.toBe('');
        expect(row.value.trim(), `${id}.${row.field}`).not.toBe('');
        expect(row.status, `${id}.${row.field}`).toMatch(
          /^(Source : \S.*|Approximation de jeu.*)$/,
        );
      }
      expect(Object.isFrozen(rows)).toBe(true);
    }
  });

  it('textes du néon et du poisson-clown', () => {
    const [hardness, lifespan] = detailRows('neon');
    expect(hardness).toMatchObject({ label: 'Dureté (GH)', value: '1 – 12 °dGH' });
    expect(hardness.status).toBe(statusText(speciesSheet('neon').hardness.status));
    expect(hardness.status).toContain('documentation du projet');
    expect(lifespan).toMatchObject({ value: '3 à 5 ans', status: 'Approximation de jeu' });
    expect(detailRows('clown')[0]).toMatchObject({
      label: 'Dureté carbonatée (KH)',
      value: '7 – 11 °dKH',
    });
    expect(publicReference('docs/SOINS.md § 3 (Holmes-Farley)')).toBe(
      'documentation du projet (Holmes-Farley)',
    );
  });

  it('seuils azotés : ceux du jeu (COMPOUND_THRESHOLDS), communs à toutes les espèces', () => {
    expect(thresholdText('ammonia')).toBe(
      'à surveiller dès 2, eau mauvaise dès 5 (unités de jeu, toutes espèces)',
    );
    expect(thresholdText('nitrate')).toContain(`dès ${COMPOUND_THRESHOLDS.nitrate.bad}`);
    const rows = detailRows('axolotl').slice(2);
    expect(rows.map((r) => r.label)).toEqual([
      'Ammoniaque (seuils du jeu)',
      'Nitrite (seuils du jeu)',
      'Nitrate (seuils du jeu)',
    ]);
    expect(rows.every((r) => r.status === 'Approximation de jeu (ADR 0052)')).toBe(true);
  });

  it('le wiki porte ces lignes, sans copie', () => {
    expect(wikiSheet('triton').details).toEqual(detailRows('triton'));
  });
});

describe('comparaison de la dureté avec le bac (#484)', () => {
  it('sans dureté : deux lignes, comme avant', () => {
    expect(tankComparison('neon', 24, 7)).toHaveLength(2);
  });

  it('ligne retrouvée par son paramètre, quel que soit l’ordre (#522)', () => {
    const rows = tankComparison('neon', 24, 7, { gh: 10, kh: 6 });
    const reversed = [...rows].reverse();
    expect(comparisonRowOf(reversed, 'hardness')).toBe(rows[2]);
    expect(comparisonRowOf(reversed, 'temperature')).toBe(rows[0]);
    expect(comparisonRowOf(tankComparison('neon', 24, 7), 'hardness')).toBeUndefined();
  });

  it('eau douce : GH du bac dans la plage, au dixième', () => {
    const rows = tankComparison('neon', 24, 7, { gh: 10, kh: 6 });
    expect(rows.map((r) => r.parameter)).toEqual(['temperature', 'ph', 'hardness']);
    expect(rows[2]).toMatchObject({
      label: 'Dureté (GH)',
      tank: '10,0 °dGH',
      preferred: '1 – 12 °dGH',
      rangeLabel: 'Plage',
      fit: 'dans-la-plage',
      fitLabel: 'dans la plage',
    });
  });

  it('bornes comprises ; au-delà, « hors plage » (jamais « limite »), écart à « la plage » (#505)', () => {
    expect(tankComparison('molly', 24, 7, { gh: 15, kh: 0 })[2].fit).toBe('dans-la-plage');
    expect(tankComparison('molly', 24, 7, { gh: 30, kh: 0 })[2].fit).toBe('dans-la-plage');
    const soft = tankComparison('molly', 24, 7, { gh: 10, kh: 6 })[2];
    expect(soft).toMatchObject({
      fit: 'hors-plage',
      fitLabel: 'hors plage',
      gap: '5 °dGH en dessous de la plage',
    });
    const hard = tankComparison('neon', 24, 7, { gh: 12.5, kh: 6 })[2];
    expect(hard.fit).toBe('hors-plage');
    expect(hard.gap).toBe('0,5 °dGH au-dessus de la plage');
  });

  it('récif : le KH du bac est comparé, pas la GH', () => {
    const row = tankComparison('clown', 26, 8.2, { gh: 350, kh: 8 })[2];
    expect(row).toMatchObject({ label: 'Dureté carbonatée (KH)', tank: '8,0 °dKH' });
    expect(row.fit).toBe('dans-la-plage');
    expect(tankComparison('clown', 26, 8.2, { gh: 8, kh: 3 })[2].fit).toBe('hors-plage');
  });

  it('dureté inconnue : « inconnue » et hors plage', () => {
    const row = tankComparison('guppy', 24, 7, { gh: Number.NaN, kh: Number.NaN })[2];
    expect(row).toMatchObject({ tank: 'inconnue', fit: 'hors-plage' });
    expect(row.gap).toBe('valeur du bac inconnue');
  });
});
