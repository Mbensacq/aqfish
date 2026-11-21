import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import {
  SETTINGS_CATEGORIES,
  type SettingsCategoryId,
} from '../settings-window/settings-categories';
import { ControlPanel } from './control-panel';

/** Panneau avec toutes ses sections possibles : pièce affichée, points blancs selon `ich`. */
@Component({
  imports: [ControlPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-control-panel
    [roomShown]="true"
    [ichCount]="ich()"
    (editRequested)="edits = edits + 1"
  />`,
})
class WindowHost {
  readonly ich = signal(1);
  edits = 0;
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

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [WindowHost] });
    fixture = TestBed.createComponent(WindowHost);
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
    expect(root().querySelectorAll('[data-section]')).toHaveLength(12);
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
      ['[data-scraper]', 'eau'],
      ['[data-pruner]', 'eau'],
      ['[data-bacteria-starter]', 'eau'],
      ['[data-untreated-tap]', 'eau'],
      ['[data-carbon]', 'eau'],
      ['[data-treatment-status]', 'soins'],
      ['input[aria-label="Vitesse de la simulation"]', 'temps'],
      ['input[aria-label="Heure de la journée"]', 'temps'],
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

  it('« Soins et produits » sans points blancs : une phrase, aucune section', async () => {
    fixture.componentInstance.ich.set(0);
    await open();
    await choose('soins');
    expect(shownSections()).toEqual([]);
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

  it('l’hôte passe au-dessus des autres panneaux tant que la fenêtre est ouverte', async () => {
    const host = root().querySelector('app-control-panel')!;
    expect(host.classList).not.toContain('control-panel-host--window');
    await open();
    expect(host.classList).toContain('control-panel-host--window');
  });
});
