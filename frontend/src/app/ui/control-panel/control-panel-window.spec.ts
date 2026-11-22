import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import {
  SETTINGS_CATEGORIES,
  type SettingsCategoryId,
} from '../settings-window/settings-categories';
import { ControlPanel } from './control-panel';
import { SETTINGS_CATEGORY_STORAGE } from '../settings-window/settings-category-store';
import { SETTINGS_CATEGORY_STORAGE_KEY } from '../../core/settings-category-pref/settings-category-pref';

/** Stockage en mémoire de la catégorie retenue, partagé entre deux montages du panneau. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

/** Panneau avec toutes ses sections possibles : pièce affichée, points blancs selon `ich`. */
@Component({
  imports: [ControlPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-control-panel
    [roomShown]="true"
    [ichCount]="ich()"
    (editRequested)="edits = edits + 1"
    (closedByUser)="closes = closes + 1"
  />`,
})
class WindowHost {
  readonly ich = signal(1);
  edits = 0;
  closes = 0;
}

/**
 * Fenêtre des réglages branchée dans le panneau (#722, tranche 1b) : une catégorie affichée à
 * la fois, toutes les sections restent dans le document (ADR 0165), fermeture et focus.
 */
describe('ControlPanel : fenêtre des réglages (#722)', () => {
  let fixture: ComponentFixture<WindowHost>;
  const root = () => fixture.nativeElement as HTMLElement;
  const toggle = () => root().querySelector<HTMLButtonElement>('.control-panel__toggle')!;
  const dialog = () => root().querySelector<HTMLElement>('[role="dialog"]');
  const shownSections = () =>
    [...root().querySelectorAll<HTMLElement>('[data-section]')]
      .filter((section) => !section.hidden)
      .map((section) => section.getAttribute('data-section'));

  async function open(): Promise<void> {
    toggle().click();
    await fixture.whenStable();
  }

  async function choose(id: SettingsCategoryId): Promise<void> {
    root().querySelector<HTMLButtonElement>(`[data-settings-category="${id}"]`)!.click();
    await fixture.whenStable();
  }

  let storage: ReturnType<typeof memoryStorage>;

  function mount(): void {
    fixture = TestBed.createComponent(WindowHost);
  }

  beforeEach(async () => {
    storage = memoryStorage();
    TestBed.configureTestingModule({
      imports: [WindowHost],
      providers: [{ provide: SETTINGS_CATEGORY_STORAGE, useValue: storage }],
    });
    mount();
    await fixture.whenStable();
  });

  it('chaque catégorie affiche ses sections, et elles seules, dans l’ordre déclaré', async () => {
    await open();
    expect(
      root().querySelector('[data-settings-content]')?.getAttribute('data-settings-content'),
    ).toBe('bac');
    for (const category of SETTINGS_CATEGORIES) {
      await choose(category.id);
      expect(shownSections(), category.title).toEqual([...category.sections]);
      expect(root().querySelector('#fenetre-reglages-categorie')?.textContent?.trim()).toBe(
        category.title,
      );
    }
  });

  it('les sections des autres catégories restent dans le document, masquées', async () => {
    await open();
    await choose('son');
    expect(root().querySelectorAll('[data-section]')).toHaveLength(14);
    const water = root().querySelector<HTMLElement>('[data-section="eau"]')!;
    expect(water.hidden).toBe(true);
    // Le champ d'import reste joignable (e2e : `setInputFiles` sans changer de catégorie).
    expect(root().querySelector('[data-section="sauvegarde"] input[type="file"]')).not.toBeNull();
  });

  it('contrôles de l’inventaire de la PR #751 : chacun dans sa catégorie', async () => {
    await open();
    const owner = (selector: string) =>
      root().querySelector(selector)?.closest('[data-section]')?.getAttribute('data-section');
    const placed: [string, SettingsCategoryId][] = [
      ['select[aria-label="Environnement"], [data-section="environnement"] select', 'bac'],
      ['[data-quarantine-install], [data-section="bacs"] button', 'bac'],
      ['[data-current]', 'eau'],
      ['[data-bacteria-starter]', 'soins'],
      ['[data-untreated-tap]', 'soins'],
      ['[data-carbon]', 'soins'],
      ['[data-catappa]', 'soins'],
      ['[data-treatment-status]', 'soins'],
      ['input[aria-label="Vitesse de la simulation"]', 'temps'],
      ['input[aria-label="Heure de la journée"]', 'temps'],
      ['[data-rain-note]', 'affichage'],
      ['[data-section="sauvegarde"] input[type="file"]', 'sauvegarde'],
    ];
    for (const [selector, id] of placed) {
      const section = owner(selector);
      expect(section, selector).toBeTruthy();
      const category = SETTINGS_CATEGORIES.find((entry) =>
        entry.sections.some((key) => key === section),
      );
      expect(category?.id, selector).toBe(id);
    }
  });

  it('« Soins et produits » sans points blancs : une phrase, puis les produits seuls', async () => {
    fixture.componentInstance.ich.set(0);
    await open();
    await choose('soins');
    expect(shownSections()).toEqual(['produits']);
    expect(root().querySelector('[data-settings-empty]')?.textContent).toContain('points blancs');
    await choose('eau');
    expect(root().querySelector('[data-settings-empty]')).toBeNull();
  });

  it('Échap, « Fermer » et clic sur le fond ferment la fenêtre et rendent le focus au bouton', async () => {
    const closers: (() => void)[] = [
      () => dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      () => root().querySelector<HTMLButtonElement>('[data-settings-close]')!.click(),
      () => root().querySelector<HTMLElement>('[data-settings-backdrop]')!.click(),
    ];
    for (const close of closers) {
      await open();
      expect(dialog()).not.toBeNull();
      close();
      await fixture.whenStable();
      expect(dialog()).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(toggle());
    }
    // Chaque fermeture par l'utilisateur est signalée (l'application rend « Commandes »).
    expect(fixture.componentInstance.closes).toBe(3);
  });

  it('raclette et sécateur ne sont plus dans la fenêtre (barre du bas, #722)', async () => {
    await open();
    expect(root().querySelector('[data-scraper], [data-pruner]')).toBeNull();
  });

  it('Tab sur le dernier contrôle affiché revient au premier, sections masquées sautées', async () => {
    await open();
    await choose('son');
    const window = dialog()!;
    const visible = [...window.querySelectorAll<HTMLElement>('button, input, select')].filter(
      (element) => element.closest('[hidden]') === null && element.tabIndex >= 0,
    );
    const last = visible[visible.length - 1];
    expect(last.closest('[data-section]')?.getAttribute('data-section')).toBe('son');
    last.focus();
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(root().querySelector('[data-settings-close]'));
  });

  it('la catégorie ouverte est gardée d’une ouverture à l’autre', async () => {
    await open();
    await choose('decor');
    toggle().click();
    await fixture.whenStable();
    await open();
    expect(shownSections()).toEqual(['decor']);
  });

  it('catégorie retenue d’une visite à l’autre (préférence locale, #722)', async () => {
    expect(storage.data.has(SETTINGS_CATEGORY_STORAGE_KEY)).toBe(false);
    await open();
    // Ouvrir sans choisir n'écrit rien : la préférence reste absente.
    expect(storage.data.has(SETTINGS_CATEGORY_STORAGE_KEY)).toBe(false);
    await choose('son');
    expect(storage.data.get(SETTINGS_CATEGORY_STORAGE_KEY)).toBe('son');
    // Nouveau montage (rechargement de la page) : la fenêtre rouvre « Son ».
    fixture.destroy();
    mount();
    await fixture.whenStable();
    await open();
    expect(
      root().querySelector('[data-settings-content]')?.getAttribute('data-settings-content'),
    ).toBe('son');
    expect(shownSections()).toEqual(['son']);
  });

  it('flèches dans la liste : la catégorie atteinte est retenue', async () => {
    await open();
    const current = root().querySelector<HTMLElement>('[data-settings-category="bac"]')!;
    current.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    expect(storage.data.get(SETTINGS_CATEGORY_STORAGE_KEY)).toBe(SETTINGS_CATEGORIES[1].id);
  });

  it('catégorie retenue inconnue (retirée, renommée) : la première de la liste', async () => {
    fixture.destroy();
    storage.data.set(SETTINGS_CATEGORY_STORAGE_KEY, 'affichage-ancien');
    mount();
    await fixture.whenStable();
    await open();
    expect(
      root().querySelector('[data-settings-content]')?.getAttribute('data-settings-content'),
    ).toBe(SETTINGS_CATEGORIES[0].id);
  });

  it('l’hôte passe au-dessus des autres panneaux tant que la fenêtre est ouverte', async () => {
    const host = root().querySelector('app-control-panel')!;
    expect(host.classList).not.toContain('control-panel-host--window');
    await open();
    expect(host.classList).toContain('control-panel-host--window');
  });

  describe('recherche (#723)', () => {
    const search = () => root().querySelector<HTMLInputElement>('[data-settings-search]')!;
    const results = () =>
      [...root().querySelectorAll('[data-settings-result]')].map((item) =>
        item.getAttribute('data-settings-result'),
      );
    const tiles = () =>
      [...root().querySelectorAll('[data-section="population"] [data-species]')].map((tile) =>
        tile.getAttribute('data-species'),
      );

    async function type(text: string): Promise<void> {
      search().value = text;
      search().dispatchEvent(new Event('input'));
      await fixture.whenStable();
    }

    it('« chauffage » : le résultat, sa catégorie, et la section « eau » réglable sur place', async () => {
      await open();
      await type('chauffage');
      expect(results()[0]).toBe('Chauffage');
      expect(root().querySelector('#fenetre-reglages-categorie')?.textContent?.trim()).toBe(
        'Résultats',
      );
      expect(shownSections()).toEqual(['eau']);
      expect(root().querySelector('[data-section="eau"] input[type="range"]')).not.toBeNull();
    });

    it('« LUM » : éclairage, lampe et heure en tête ; leurs sections « eau » et « journee » montrées', async () => {
      await open();
      await type('LUM');
      expect(results().slice(0, 3)).toEqual(['Éclairage', 'Lampe', 'Heure']);
      expect(shownSections()).toEqual(expect.arrayContaining(['eau', 'journee']));
    });

    /** Noms des contrôles marqués (`appSetting`) visibles dans la section `key`. */
    const shownSettings = (key: string) =>
      [...root().querySelectorAll<HTMLElement>(`[data-section="${key}"] [data-setting]`)]
        .filter((control) => control.style.display !== 'none')
        .map((control) => control.getAttribute('data-setting'));

    it('« lum » : seuls l’éclairage et la lampe dans « eau », l’heure dans « journee » (#764)', async () => {
      await open();
      await type('lum');
      expect(shownSettings('eau')).toEqual(['Éclairage', 'Lampe']);
      expect(shownSettings('journee')).toEqual(['Heure']);
      expect(root().querySelector('[data-section="eau"] [data-current]')).toHaveProperty(
        'style.display',
        'none',
      );
      // Recherche effacée : la section entière revient.
      await type('');
      await choose('eau');
      expect(shownSettings('eau')).toEqual([
        'Courant',
        'Changer l’eau',
        'Chauffage',
        'Éclairage',
        'Lampe',
      ]);
    });

    it('chaque contrôle marqué porte le nom d’un réglage déclaré dans sa section (#764)', async () => {
      await open();
      const marked = [...root().querySelectorAll<HTMLElement>('[data-setting]')];
      expect(marked.length).toBeGreaterThanOrEqual(17);
      for (const control of marked) {
        const section = control.closest('[data-section]')?.getAttribute('data-section');
        const declared = SETTINGS_CATEGORIES.flatMap((category) => category.controls).find(
          (entry) => entry.name === control.getAttribute('data-setting'),
        );
        expect(declared?.section, control.getAttribute('data-setting') ?? '').toBe(section);
      }
    });

    it('la légende qui répète le titre est masquée à l’écran, pas pendant une recherche (#764)', async () => {
      const legend = () =>
        root().querySelector<HTMLElement>('[data-section="population"] > legend')!;
      await open();
      await choose('population');
      expect(legend().classList).toContain('control-panel__legend--repeated');
      expect(legend().textContent?.trim()).toBe('Population');
      await choose('eau');
      expect(
        root()
          .querySelector('[data-section="eau"] > legend')
          ?.classList.contains('control-panel__legend--repeated'),
      ).toBe(false);
      await type('néon');
      expect(legend().classList).not.toContain('control-panel__legend--repeated');
    });

    it('« néon » : sa tuile seule dans la population', async () => {
      await open();
      await type('néon');
      expect(results()[0]).toBe('Néon');
      expect(shownSections()).toEqual(['population']);
      expect(tiles()).toEqual(['neon']);
    });

    it('Entrée ouvre la catégorie du premier résultat et efface la recherche', async () => {
      await open();
      await type('chauffage');
      search().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await fixture.whenStable();
      expect(search().value).toBe('');
      expect(
        root().querySelector('[data-settings-content]')?.getAttribute('data-settings-content'),
      ).toBe('eau');
      expect(storage.data.get(SETTINGS_CATEGORY_STORAGE_KEY)).toBe('eau');
    });

    it('le nom de catégorie d’un résultat y mène', async () => {
      await open();
      await type('volume');
      root().querySelector<HTMLButtonElement>('[data-settings-result-category="son"]')!.click();
      await fixture.whenStable();
      expect(shownSections()).toEqual(['son']);
      expect(search().value).toBe('');
    });

    it('aucun résultat : un message, la liste des catégories, aucune section ; Entrée sans effet', async () => {
      await open();
      await type('zzzz');
      const message = root().querySelector('[data-settings-no-result]');
      expect(message?.textContent).toContain('« zzzz »');
      expect(message?.getAttribute('role')).toBe('status');
      expect(root().querySelectorAll('[data-settings-result-category]')).toHaveLength(
        SETTINGS_CATEGORIES.length,
      );
      expect(shownSections()).toEqual([]);
      search().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await fixture.whenStable();
      expect(search().value).toBe('zzzz');
    });

    it('recherche effacée : la catégorie ouverte revient ; refermée : la recherche repart vide', async () => {
      await open();
      await type('chauffage');
      await type('  ');
      expect(shownSections()).toEqual(['environnement', 'bacs-meubles', 'bacs']);
      await type('son');
      toggle().click();
      await fixture.whenStable();
      await open();
      expect(search().value).toBe('');
    });
  });
});
