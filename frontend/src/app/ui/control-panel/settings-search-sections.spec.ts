import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { SETTINGS_CATEGORIES } from '../settings-window/settings-categories';
import { SETTINGS_CATEGORY_STORAGE } from '../settings-window/settings-category-store';
import { ControlPanel } from './control-panel';

/** Panneau avec la pièce affichée. */
@Component({
  imports: [ControlPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-control-panel [roomShown]="true" [ichCount]="1" />`,
})
class SearchHost {}

/** Légende masquée (`SectionLegend`, #764) attendue pour chaque catégorie à section unique. */
const REPEATED_LEGEND: Readonly<Record<string, boolean>> = {
  population: true,
  eau: false,
  decor: false,
  affichage: true,
  son: true,
  accessibilite: true,
  sauvegarde: false,
};

/**
 * Recherche dans les sections « environnement », « bacs », « produits » et « population »
 * (#768) : seules les lignes des réglages trouvés restent, comme dans les autres sections (#764).
 */
describe('ControlPanel : recherche dans les sections restantes (#768)', () => {
  let fixture: ComponentFixture<SearchHost>;
  const root = () => fixture.nativeElement as HTMLElement;
  const search = () => root().querySelector<HTMLInputElement>('[data-settings-search]')!;
  const visible = (element: Element | null) =>
    element instanceof HTMLElement && element.style.display !== 'none';

  /** Noms (sans doublon) des contrôles marqués visibles dans la section `key`. */
  const shownSettings = (key: string) => [
    ...new Set(
      [...root().querySelectorAll<HTMLElement>(`[data-section="${key}"] [data-setting]`)]
        .filter(visible)
        .map((control) => control.getAttribute('data-setting')),
    ),
  ];

  async function type(text: string): Promise<void> {
    search().value = text;
    search().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function choose(id: string): Promise<void> {
    root().querySelector<HTMLButtonElement>(`[data-settings-category="${id}"]`)!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    const data = new Map<string, string>();
    TestBed.configureTestingModule({
      imports: [SearchHost],
      providers: [
        {
          provide: SETTINGS_CATEGORY_STORAGE,
          useValue: {
            getItem: (key: string) => data.get(key) ?? null,
            setItem: (key: string, value: string) => void data.set(key, value),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(SearchHost);
    await fixture.whenStable();
    root().querySelector<HTMLButtonElement>('.control-panel__toggle')!.click();
    await fixture.whenStable();
  });

  it('hors recherche, les quatre sections montrent tous leurs contrôles marqués', async () => {
    expect(shownSettings('environnement')).toEqual(['Environnement', 'Afficher la pièce']);
    expect(shownSettings('bacs')).toEqual(['Mode soins ou décor', 'Liste des bacs']);
    await choose('soins');
    expect(shownSettings('produits')).toEqual([
      'Bactéries',
      'Robinet',
      'Déchlorer',
      'Liant',
      'Charbon',
      'pH −',
      'pH +',
      'Feuilles de catappa',
    ]);
    await choose('population');
    expect(visible(root().querySelector('.population__toolbar'))).toBe(true);
    expect(visible(root().querySelector('[data-population-summary]'))).toBe(true);
  });

  it('« salon » : seule la case de la pièce dans « environnement », le libellé « Lieu » masqué', async () => {
    await type('salon');
    expect(shownSettings('environnement')).toEqual(['Afficher la pièce']);
    expect(
      visible(root().querySelector('[data-section="environnement"] select')?.parentElement ?? null),
    ).toBe(false);
  });

  it('« mode » : seul le bouton de mode dans « bacs », la liste des bacs masquée', async () => {
    await type('mode');
    expect(shownSettings('bacs')).toEqual(['Mode soins ou décor']);
    expect(visible(root().querySelector('[data-section="bacs"] > legend'))).toBe(true);
    expect(visible(root().querySelector('[aria-label="Liste des bacs"]'))).toBe(false);
  });

  it('« charbon » puis « catappa » : seul le produit trouvé dans « produits »', async () => {
    await type('charbon');
    expect(shownSettings('produits')).toEqual(['Charbon']);
    expect(visible(root().querySelector('[data-bacteria-starter]'))).toBe(false);
    await type('catappa');
    expect(shownSettings('produits')).toEqual(['Feuilles de catappa']);
    expect(visible(root().querySelector('[data-catappa-note]'))).toBe(true);
  });

  it('population : filtres et résumé pour « effectif », pas pour une espèce ni pour la fiche', async () => {
    const toolbar = () => root().querySelector('.population__toolbar');
    await type('effectif');
    expect(visible(toolbar())).toBe(true);
    await type('néon');
    expect(visible(toolbar())).toBe(false);
    expect(visible(root().querySelector('[data-population-summary]'))).toBe(false);
    expect(root().querySelectorAll('[data-section="population"] [data-species]')).toHaveLength(1);
    await type('wiki');
    expect(visible(toolbar())).toBe(false);
    expect(
      root().querySelectorAll('[data-section="population"] [data-species]').length,
    ).toBeGreaterThan(1);
  });

  it('chaque catégorie à section unique masque sa légende comme attendu (#768)', async () => {
    const single = SETTINGS_CATEGORIES.filter((category) => category.sections.length === 1);
    expect(single.map((category) => category.id).sort()).toEqual(
      Object.keys(REPEATED_LEGEND).sort(),
    );
    for (const category of single) {
      await choose(category.id);
      const legend = root().querySelector<HTMLElement>(
        `[data-section="${category.sections[0]}"] > legend`,
      )!;
      const repeated = legend.classList.contains('control-panel__legend--repeated');
      expect(repeated, category.title).toBe(REPEATED_LEGEND[category.id]);
      // Une légende non masquée ne répète jamais le titre : sinon elle doit l'être.
      if (!repeated) {
        expect(legend.textContent?.trim(), category.title).not.toBe(category.title);
      }
    }
  });
});
