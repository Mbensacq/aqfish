import { describe, expect, it } from 'vitest';
import {
  CARE_DISCLAIMER,
  GUIDE_PAGE_TITLES,
  GUIDE_PAGES,
  guideEntries,
  guideView,
} from './care-guide';

describe('pages « Produits et traitements » et « Maladies » (#291)', () => {
  it('deux pages titrées, non vides', () => {
    expect(GUIDE_PAGES).toEqual(['produits', 'maladies']);
    for (const page of GUIDE_PAGES) {
      expect(GUIDE_PAGE_TITLES[page].trim()).not.toBe('');
      expect(guideEntries(page).length).toBeGreaterThanOrEqual(8);
    }
    expect(CARE_DISCLAIMER).toMatch(/pas un avis vétérinaire/);
  });

  it('aucun texte vide, aucun identifiant ni nom en double dans une page', () => {
    for (const page of GUIDE_PAGES) {
      const entries = guideEntries(page);
      const ids = entries.map((e) => e.id);
      const names = entries.map((e) => e.name);
      expect(new Set(ids).size, page).toBe(ids.length);
      expect(new Set(names).size, page).toBe(names.length);
      for (const entry of entries) {
        expect(entry.id, page).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(entry.name.trim(), entry.id).not.toBe('');
        expect(entry.lines.length, entry.id).toBeGreaterThan(0);
        const labels = entry.lines.map((l) => l.label);
        expect(new Set(labels).size, entry.id).toBe(labels.length);
        for (const line of entry.lines) {
          expect(line.label.trim(), entry.id).not.toBe('');
          expect(line.text.trim(), `${entry.id} : ${line.label}`).not.toBe('');
        }
      }
    }
  });

  it('identifiants uniques entre les deux pages aussi (ancres du wiki)', () => {
    const all = GUIDE_PAGES.flatMap((page) => guideEntries(page).map((e) => e.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it('chaque entrée a une source non vide ou la mention « approximation de jeu »', () => {
    for (const page of GUIDE_PAGES) {
      for (const entry of guideEntries(page)) {
        if (entry.status.kind === 'source') {
          expect(entry.status.reference.trim().length, entry.id).toBeGreaterThan(3);
        } else {
          expect(entry.status.kind, entry.id).toBe('approximation');
        }
      }
      for (const view of guideView(page)) {
        expect(view.status, view.id).toMatch(/^(Source : \S.*|Approximation de jeu)$/);
      }
    }
  });

  it('chaque maladie dit ses symptômes, sa cause et les gestes', () => {
    for (const entry of guideEntries('maladies')) {
      const labels = entry.lines.map((l) => l.label);
      expect(labels[0], entry.id).toBe('Symptômes');
      expect(
        labels.some((l) => l.startsWith('Cause')),
        entry.id,
      ).toBe(true);
      expect(labels.at(-1), entry.id).toBe('Gestes');
    }
  });

  it('chaque produit dit son usage', () => {
    for (const entry of guideEntries('produits')) {
      expect(entry.lines[0].label, entry.id).toBe('Usage');
    }
  });

  it('les données sont figées', () => {
    const [first] = guideEntries('produits');
    expect(Object.isFrozen(guideEntries('produits'))).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.lines[0])).toBe(true);
  });
});
