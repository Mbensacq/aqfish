import { describe, expect, it } from 'vitest';
import { compatibility } from './compatibility';
import { ENVIRONMENTS } from './environment';
import { SPECIES, type SpeciesId } from './species';
import {
  cohabitation,
  cohabitationReason,
  feedingRows,
  feedingZone,
  gapText,
  tankComparison,
  tankFit,
} from './species-care';
import { speciesSheet } from './species-sheet';

const IDS = Object.keys(SPECIES) as SpeciesId[];

describe('soins du wiki : alimentation (#291)', () => {
  it('chaque espèce a quatre lignes non vides, chacune avec un statut', () => {
    for (const id of IDS) {
      const rows = feedingRows(id);
      expect(
        rows.map((r) => r.field),
        id,
      ).toEqual(['foods', 'frequency', 'quantity', 'zone']);
      for (const row of rows) {
        expect(row.value.trim(), `${id}.${row.field}`).not.toBe('');
        expect(row.status, `${id}.${row.field}`).toMatch(/^(Source : \S.*|Approximation de jeu)$/);
      }
    }
  });

  it('une valeur sourcée a une référence non vide', () => {
    for (const id of IDS) {
      for (const row of feedingRows(id)) {
        if (row.status.startsWith('Source')) {
          expect(row.status.slice('Source : '.length).trim().length).toBeGreaterThan(3);
        }
      }
    }
  });

  it('zone de nourrissage par tiers de la hauteur d’eau', () => {
    expect(feedingZone(0, 0.1)).toBe('fond');
    expect(feedingZone(0.7, 1)).toBe('surface');
    expect(feedingZone(0.4, 0.6)).toBe('pleine eau');
    expect(feedingZone(0.35, 1)).toBe('pleine eau et surface');
    expect(feedingZone(0, 0.5)).toBe('fond et pleine eau');
    expect(feedingZone(0, 1)).toBe('toute la hauteur d’eau');
    // Bornes exactes : 1/3 et 2/3 n'entrent pas dans le tiers voisin.
    expect(feedingZone(0, 1 / 3)).toBe('fond');
    expect(feedingZone(2 / 3, 1)).toBe('surface');
  });

  it('zone tirée de la simulation : le corydoras mange au fond, le sonneur en surface', () => {
    const zone = (id: SpeciesId) => feedingRows(id).find((r) => r.field === 'zone')?.value;
    expect(zone('corydora')).toBe('fond');
    expect(zone('axolotl')).toBe('fond');
    expect(zone('grenouille')).toBe('surface');
    expect(zone('koi')).toBe('toute la hauteur d’eau');
  });
});

describe('soins du wiki : cohabitation (#291)', () => {
  it('une entrée par autre espèce, dans l’ordre de SPECIES, sans l’espèce elle-même', () => {
    for (const id of IDS) {
      expect(
        cohabitation(id).map((e) => e.other),
        id,
      ).toEqual(IDS.filter((other) => other !== id));
    }
  });

  it('les verdicts sont ceux de la table de compatibilité, avec une raison non vide', () => {
    for (const id of IDS) {
      for (const entry of cohabitation(id)) {
        expect(entry.verdict, `${id}/${entry.other}`).toBe(compatibility(id, entry.other));
        expect(entry.reason.trim(), `${id}/${entry.other}`).not.toBe('');
      }
    }
  });

  it('les espèces déconseillées sont celles de la ligne « À éviter avec » de la fiche', () => {
    for (const id of IDS) {
      const avoided = cohabitation(id)
        .filter((e) => e.verdict !== 'compatible')
        .map((e) => e.other);
      expect(avoided, id).toEqual(speciesSheet(id).avoid.value);
    }
  });

  it('la raison nomme le prédateur et sa proie, dans les deux sens', () => {
    const koiNeon = cohabitation('koi').find((e) => e.other === 'neon');
    const neonKoi = cohabitation('neon').find((e) => e.other === 'koi');
    expect(koiNeon?.reason).toBe('les koïs mangent ou blessent les néons, plus petits');
    expect(neonKoi?.reason).toBe(koiNeon?.reason);
    const axolotlTriton = cohabitation('axolotl').find((e) => e.other === 'triton');
    expect(axolotlTriton?.verdict).toBe('predateur');
    expect(axolotlTriton?.reason).toMatch(/^les axolotls mangent ou blessent les tritons/);
  });

  it('raisons des verdicts compatibles et territoriaux', () => {
    const neonGuppy = cohabitation('neon').find((e) => e.other === 'guppy');
    expect(neonGuppy?.verdict).toBe('compatible');
    expect(neonGuppy?.reason).toBe('aucun conflit de caractère (paisible et paisible)');
    // Deux espèces territoriales depuis le gourami nain (#238) : un seul couple territorial.
    const territorial = IDS.flatMap((id) =>
      cohabitation(id)
        .filter((e) => e.verdict === 'territorial')
        .map((e) => `${id}/${e.other}`),
    );
    expect(territorial).toEqual(['clown/gourami', 'gourami/clown']);
    const gouramiClown = cohabitation('gourami').find((e) => e.other === 'clown');
    expect(gouramiClown?.reason).toBe('deux espèces territoriales : elles se disputent l’espace');
    expect(gouramiClown?.sameEnvironment).toBe(false);
  });

  it('raison d’un verdict « territorial », même pour un couple factice', () => {
    expect(cohabitationReason('clown', 'neon', 'territorial')).toBe(
      'deux espèces territoriales : elles se disputent l’espace',
    );
  });

  it('environnement commun : vrai si un environnement accueille les deux espèces', () => {
    const together = (a: SpeciesId, b: SpeciesId) =>
      cohabitation(a).find((e) => e.other === b)?.sameEnvironment;
    expect(together('neon', 'guppy')).toBe(true);
    expect(together('clown', 'chirurgien')).toBe(true);
    expect(together('grenouille', 'axolotl')).toBe(true);
    expect(together('neon', 'clown')).toBe(false);
    for (const id of IDS) {
      for (const entry of cohabitation(id)) {
        const expected = Object.values(ENVIRONMENTS).some(
          (env) => env.species.includes(id) && env.species.includes(entry.other),
        );
        expect(entry.sameEnvironment, `${id}/${entry.other}`).toBe(expected);
      }
    }
  });
});

describe('soins du wiki : comparaison avec le bac (#291)', () => {
  const preferred = { min: 22, max: 25 };
  const tolerated = { min: 20, max: 26 };

  it('dans la plage, limite, hors plage, bornes comprises', () => {
    expect(tankFit(23, preferred, tolerated)).toBe('dans-la-plage');
    expect(tankFit(22, preferred, tolerated)).toBe('dans-la-plage');
    expect(tankFit(25, preferred, tolerated)).toBe('dans-la-plage');
    expect(tankFit(25.01, preferred, tolerated)).toBe('limite');
    expect(tankFit(21.99, preferred, tolerated)).toBe('limite');
    expect(tankFit(20, preferred, tolerated)).toBe('limite');
    expect(tankFit(26, preferred, tolerated)).toBe('limite');
    expect(tankFit(26.01, preferred, tolerated)).toBe('hors-plage');
    expect(tankFit(19.99, preferred, tolerated)).toBe('hors-plage');
    expect(tankFit(-40, preferred, tolerated)).toBe('hors-plage');
    expect(tankFit(1e9, preferred, tolerated)).toBe('hors-plage');
  });

  it('valeur non finie : hors plage', () => {
    expect(tankFit(Number.NaN, preferred, tolerated)).toBe('hors-plage');
    expect(tankFit(Infinity, preferred, tolerated)).toBe('hors-plage');
    expect(tankFit(-Infinity, preferred, tolerated)).toBe('hors-plage');
  });

  it('plages confondues : pas de marge, donc jamais « limite »', () => {
    const one = { min: 7, max: 7 };
    expect(tankFit(7, one, one)).toBe('dans-la-plage');
    expect(tankFit(7.1, one, one)).toBe('hors-plage');
  });

  it('écart lisible, arrondi au dixième, à la française', () => {
    expect(gapText(24, preferred, '°C')).toBe('dans la plage préférée');
    expect(gapText(26.54, preferred, '°C')).toBe('1,5 °C au-dessus de la plage préférée');
    expect(gapText(18, preferred, '°C')).toBe('4 °C en dessous de la plage préférée');
    expect(gapText(5.8, { min: 6, max: 7.2 }, '')).toBe('0,2 en dessous de la plage préférée');
    expect(gapText(Number.NaN, preferred, '°C')).toBe('valeur du bac inconnue');
  });

  it('néon dans le bac tropical à 24 °C et pH 7 : dans la plage', () => {
    const rows = tankComparison('neon', 24, 7);
    expect(rows.map((r) => r.parameter)).toEqual(['temperature', 'ph']);
    expect(rows.map((r) => r.fit)).toEqual(['dans-la-plage', 'dans-la-plage']);
    expect(rows[0]).toMatchObject({
      tank: '24 °C',
      preferred: '22 – 25 °C',
      fitLabel: 'dans la plage',
    });
    expect(rows[1]).toMatchObject({ tank: '7', preferred: '6 – 7,2' });
  });

  it('axolotl à 24 °C : hors plage tolérée (14 – 22 °C), écart à la plage préférée', () => {
    const [temperature] = tankComparison('axolotl', 24, 7.4);
    expect(temperature).toMatchObject({
      fit: 'hors-plage',
      fitLabel: 'hors plage',
      gap: '6 °C au-dessus de la plage préférée',
    });
  });

  it('relevé inconnu : « inconnue » et hors plage', () => {
    const rows = tankComparison('clown', Number.NaN, Number.NaN);
    expect(rows.map((r) => r.tank)).toEqual(['inconnue', 'inconnue']);
    expect(rows.map((r) => r.fit)).toEqual(['hors-plage', 'hors-plage']);
  });

  it('chaque espèce : plage préférée de la fiche, « dans la plage » à son milieu', () => {
    for (const id of IDS) {
      const sheet = speciesSheet(id);
      const t = sheet.temperaturePreferred.value;
      const p = sheet.phPreferred.value;
      const rows = tankComparison(id, (t.min + t.max) / 2, (p.min + p.max) / 2);
      expect(
        rows.map((r) => r.fit),
        id,
      ).toEqual(['dans-la-plage', 'dans-la-plage']);
    }
  });
});
