import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ControlPanel } from '../control-panel/control-panel';
import {
  categoriesOf,
  DEFAULT_SETTINGS_CATEGORY,
  neighbourCategory,
  SETTINGS_CATEGORIES,
  SETTINGS_GROUPS,
  settingsCategory,
  type SettingsCategoryId,
} from './settings-categories';

/** Panneau actuel avec toutes ses sections : pièce affichée, points blancs visibles. */
@Component({
  imports: [ControlPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-control-panel [roomShown]="true" [ichCount]="1" />`,
})
class FullPanelHost {}

/** Sections du panneau actuel, par leur attribut `data-section`, dans l'ordre du document. */
async function panelSections(): Promise<string[]> {
  TestBed.configureTestingModule({ imports: [FullPanelHost] });
  const fixture = TestBed.createComponent(FullPanelHost);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  root.querySelector<HTMLButtonElement>('.control-panel__toggle')!.click();
  await fixture.whenStable();
  return [...root.querySelectorAll('[data-section]')].map((el) => el.getAttribute('data-section')!);
}

describe('catégories des réglages (#722)', () => {
  it('chaque section du panneau actuel est dans une et une seule catégorie', async () => {
    const sections = await panelSections();
    expect(sections.length).toBe(14);
    const declared = SETTINGS_CATEGORIES.flatMap((category) => category.sections);
    expect(new Set(declared).size).toBe(declared.length);
    expect([...declared].sort()).toEqual([...sections].sort());
  });

  it('groupes dans l’ordre de docs/INTERFACE.md, chacun non vide, catégories regroupées', () => {
    expect(SETTINGS_GROUPS).toEqual(['Le bac', 'Simulation', 'Préférences', 'Données']);
    const ordered = SETTINGS_GROUPS.flatMap((group) => categoriesOf(group));
    expect(ordered).toEqual([...SETTINGS_CATEGORIES]);
    for (const group of SETTINGS_GROUPS) {
      expect(categoriesOf(group).length).toBeGreaterThan(0);
    }
    expect(categoriesOf('Le bac').map((category) => category.title)).toEqual([
      'Bac et milieu',
      'Population',
      'Eau et matériel',
      'Soins et produits',
      'Décor',
    ]);
  });

  it('produits dans « Soins et produits », « Pluie » dans « Affichage » (#762)', () => {
    expect(categoriesOf('Préférences').map((category) => category.title)).toEqual([
      'Affichage',
      'Son',
      'Accessibilité',
    ]);
    const owner = (name: string) =>
      SETTINGS_CATEGORIES.find((category) =>
        category.controls.some((control) => control.name === name),
      )?.id;
    for (const name of [
      'Bactéries',
      'Robinet',
      'Déchlorer',
      'Liant',
      'Charbon',
      'pH −',
      'pH +',
      'Feuilles de catappa',
    ]) {
      expect(owner(name), name).toBe('soins');
    }
    expect(owner('Pluie')).toBe('affichage');
    expect(settingsCategory('eau').controls.map((control) => control.name)).toEqual([
      'Courant',
      'Changer l’eau',
      'Chauffage',
      'Éclairage',
      'Lampe',
    ]);
  });

  it('identifiants et titres uniques, explication et contrôles renseignés', () => {
    const ids = SETTINGS_CATEGORIES.map((category) => category.id);
    const titles = SETTINGS_CATEGORIES.map((category) => category.title);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
    for (const category of SETTINGS_CATEGORIES) {
      expect(category.explanation.trim()).not.toBe('');
      expect(category.explanation.endsWith('.')).toBe(true);
      expect(category.sections.length).toBeGreaterThan(0);
      expect(category.controls.length).toBeGreaterThan(0);
    }
  });

  it('settingsCategory : la catégorie de chaque identifiant ; inconnu ⇒ RangeError', () => {
    for (const category of SETTINGS_CATEGORIES) {
      expect(settingsCategory(category.id)).toBe(category);
    }
    expect(settingsCategory(DEFAULT_SETTINGS_CATEGORY).title).toBe('Bac et milieu');
    expect(() => settingsCategory('inconnue' as SettingsCategoryId)).toThrow(RangeError);
  });

  it('neighbourCategory : suivante et précédente, en boucle aux deux bouts', () => {
    const ids = SETTINGS_CATEGORIES.map((category) => category.id);
    const last = ids[ids.length - 1];
    expect(neighbourCategory(ids[0], 1)).toBe(ids[1]);
    expect(neighbourCategory(ids[1], -1)).toBe(ids[0]);
    expect(neighbourCategory(last, 1)).toBe(ids[0]);
    expect(neighbourCategory(ids[0], -1)).toBe(last);
    // Un tour complet revient au départ, groupes enchaînés.
    const tour = ids.reduce((id) => neighbourCategory(id, 1), ids[0]);
    expect(tour).toBe(ids[0]);
  });
});
