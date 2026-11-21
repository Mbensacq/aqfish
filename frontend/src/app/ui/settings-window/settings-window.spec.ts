import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { SETTINGS_CATEGORIES, type SettingsCategoryId } from './settings-categories';
import { SETTINGS_WINDOW_ID, SettingsWindow } from './settings-window';
import { PHONE_LAYOUT } from './phone-layout';

@Component({
  imports: [SettingsWindow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div>
    <button type="button" id="dehors">Dehors</button>
    @if (open()) {
      <app-settings-window
        [(selected)]="selected"
        [summaries]="{ bac: 'Bac tropical', son: 'Coupés' }"
        (closeRequested)="closes.set(closes() + 1)"
      >
        <button type="button" data-contenu>Contenu {{ selected() }}</button>
      </app-settings-window>
    }
  </div>`,
})
class TestHost {
  readonly open = signal(true);
  readonly selected = signal<SettingsCategoryId>('bac');
  readonly closes = signal(0);
}

describe('SettingsWindow (#722)', () => {
  let fixture: ComponentFixture<TestHost>;
  const root = () => fixture.nativeElement as HTMLElement;
  const dialog = () => root().querySelector<HTMLElement>('[role="dialog"]')!;
  const category = (id: string) =>
    root().querySelector<HTMLButtonElement>(`[data-settings-category="${id}"]`)!;
  const search = () => root().querySelector<HTMLInputElement>('[data-settings-search]')!;
  const active = () => document.activeElement;

  function key(target: Element, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    fixture = TestBed.createComponent(TestHost);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
  });

  it('fenêtre modale titrée « Réglages », identifiant stable', () => {
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    expect(dialog().id).toBe(SETTINGS_WINDOW_ID);
    const title = document.getElementById(dialog().getAttribute('aria-labelledby')!);
    expect(title?.textContent?.trim()).toBe('Réglages');
    expect(root().querySelector('[data-settings-backdrop]')).not.toBeNull();
  });

  it('catégories par groupe, dans l’ordre de la déclaration ; la catégorie ouverte marquée', () => {
    const groups = [...root().querySelectorAll('.settings-window__group')].map((el) =>
      el.textContent?.trim(),
    );
    expect(groups).toEqual(['Le bac', 'Simulation', 'Préférences', 'Données']);
    const buttons = [...root().querySelectorAll<HTMLButtonElement>('[data-settings-category]')];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(
      SETTINGS_CATEGORIES.map((c) => c.title),
    );
    expect(buttons.filter((b) => b.getAttribute('aria-current') === 'true')).toEqual([
      category('bac'),
    ]);
  });

  it('le focus entre sur la catégorie ouverte', () => {
    expect(active()).toBe(category('bac'));
  });

  it('un clic ouvre une catégorie : titre, explication et contenu suivent', async () => {
    category('son').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('son');
    expect(category('son').getAttribute('aria-current')).toBe('true');
    expect(category('bac').getAttribute('aria-current')).toBeNull();
    const content = root().querySelector('[data-settings-content]')!;
    expect(content.getAttribute('data-settings-content')).toBe('son');
    expect(content.querySelector('h3')?.textContent?.trim()).toBe('Son');
    expect(content.querySelector('p')?.textContent).toContain('sons d’ambiance');
    expect(content.querySelector('[data-contenu]')?.textContent?.trim()).toBe('Contenu son');
  });

  it('flèches haut et bas : catégorie voisine ouverte et focalisée, en boucle', async () => {
    const ids = SETTINGS_CATEGORIES.map((c) => c.id);
    expect(key(category('bac'), { key: 'ArrowDown' }).defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe(ids[1]);
    expect(active()).toBe(category(ids[1]));
    key(category(ids[1]), { key: 'ArrowUp' });
    key(category(ids[0]), { key: 'ArrowUp' });
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe(ids[ids.length - 1]);
    expect(active()).toBe(category(ids[ids.length - 1]));
  });

  it('flèches hors de la liste des catégories : sans effet', async () => {
    const event = key(root().querySelector('[data-contenu]')!, { key: 'ArrowDown' });
    await fixture.whenStable();
    expect(event.defaultPrevented).toBe(false);
    expect(fixture.componentInstance.selected()).toBe('bac');
  });

  it('Échap, bouton « Fermer » et clic sur le fond demandent la fermeture', () => {
    expect(key(category('bac'), { key: 'Escape' }).defaultPrevented).toBe(true);
    root().querySelector<HTMLButtonElement>('[data-settings-close]')!.click();
    root().querySelector<HTMLElement>('[data-settings-backdrop]')!.click();
    expect(fixture.componentInstance.closes()).toBe(3);
  });

  it('Échap déjà traité par le contenu (fiche, confirmation) : la fenêtre reste', () => {
    const content = root().querySelector('[data-contenu]')!;
    content.addEventListener('keydown', (event) => event.preventDefault(), { once: true });
    key(content, { key: 'Escape' });
    expect(fixture.componentInstance.closes()).toBe(0);
  });

  it('« / » place le focus dans la recherche ; dans la recherche, « / » s’écrit', () => {
    expect(key(category('bac'), { key: '/' }).defaultPrevented).toBe(true);
    expect(active()).toBe(search());
    expect(key(search(), { key: '/' }).defaultPrevented).toBe(false);
  });

  it('Tab et Maj+Tab tournent dans la fenêtre', () => {
    const last = root().querySelector<HTMLButtonElement>('[data-contenu]')!;
    const first = root().querySelector<HTMLButtonElement>('[data-settings-close]')!;
    last.focus();
    expect(key(last, { key: 'Tab' }).defaultPrevented).toBe(true);
    expect(active()).toBe(first);
    expect(key(first, { key: 'Tab', shiftKey: true }).defaultPrevented).toBe(true);
    expect(active()).toBe(last);
    // Au milieu, le navigateur fait son travail.
    category('bac').focus();
    expect(key(category('bac'), { key: 'Tab' }).defaultPrevented).toBe(false);
  });
});

describe('SettingsWindow sur téléphone (#722, tranche 3)', () => {
  let fixture: ComponentFixture<TestHost>;
  const phone = signal(true);
  const root = () => fixture.nativeElement as HTMLElement;
  const category = (id: string) =>
    root().querySelector<HTMLButtonElement>(`[data-settings-category="${id}"]`)!;
  const list = () => root().querySelector<HTMLElement>('[data-settings-list]')!;
  const content = () => root().querySelector<HTMLElement>('[data-settings-content]')!;
  const back = () => root().querySelector<HTMLButtonElement>('[data-settings-back]');
  const active = () => document.activeElement;

  beforeEach(async () => {
    phone.set(true);
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [{ provide: PHONE_LAYOUT, useValue: phone.asReadonly() }],
    });
    fixture = TestBed.createComponent(TestHost);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
  });

  it('d’abord la liste, avec la valeur résumée de chaque catégorie en description', () => {
    expect(
      root().querySelector('[data-settings-window]')!.getAttribute('data-settings-layout'),
    ).toBe('telephone');
    expect(list().hidden).toBe(false);
    expect(content().hidden).toBe(true);
    expect(active()).toBe(category('bac'));
    const summaryOf = (id: string) => {
      const described = category(id).getAttribute('aria-describedby')!;
      return document.getElementById(described)?.textContent?.trim();
    };
    expect(summaryOf('bac')).toBe('Bac tropical');
    expect(summaryOf('son')).toBe('Coupés');
    expect(summaryOf('eau')).toBe('');
    expect(
      category('son').querySelector('[data-settings-summary]')!.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('une catégorie touchée remplace la liste ; « Retour » la rend, focus sur la catégorie', async () => {
    category('son').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('son');
    expect(list().hidden).toBe(true);
    expect(content().hidden).toBe(false);
    expect(active()).toBe(back());
    back()!.click();
    await fixture.whenStable();
    expect(list().hidden).toBe(false);
    expect(content().hidden).toBe(true);
    expect(active()).toBe(category('son'));
  });

  it('« / » depuis le contenu : la liste revient, focus dans la recherche', async () => {
    category('son').click();
    await fixture.whenStable();
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    back()!.dispatchEvent(event);
    await fixture.whenStable();
    expect(event.defaultPrevented).toBe(true);
    expect(list().hidden).toBe(false);
    expect(active()).toBe(root().querySelector('[data-settings-search]'));
  });

  it('Tab ne tourne que sur ce qui est montré (liste masquée exclue)', async () => {
    category('son').click();
    await fixture.whenStable();
    const last = root().querySelector<HTMLButtonElement>('[data-contenu]')!;
    last.focus();
    last.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(active()).toBe(root().querySelector('[data-settings-close]'));
    const close = active() as HTMLElement;
    close.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(active()).toBe(last);
  });

  it('écran élargi (téléphone tourné) : liste et contenu ensemble, sans « Retour »', async () => {
    category('son').click();
    await fixture.whenStable();
    phone.set(false);
    await fixture.whenStable();
    expect(list().hidden).toBe(false);
    expect(content().hidden).toBe(false);
    expect(back()).toBeNull();
    expect(category('son').hasAttribute('aria-describedby')).toBe(false);
    expect(root().querySelector('[data-settings-summary]')).toBeNull();
  });
});

describe('PHONE_LAYOUT (#722, tranche 3)', () => {
  it('sans matchMedia (jsdom) : jamais téléphone', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(PHONE_LAYOUT)()).toBe(false);
  });
});
