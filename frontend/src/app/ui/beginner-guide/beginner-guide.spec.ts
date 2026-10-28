import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { GUIDE_STEPS, WHY_TOPIC_ORDER } from '../../sim/beginner-help';
import type { KeyValueStore } from '../commands-help/commands-help-store';
import { BEGINNER_GUIDE_TITLE_ID, BeginnerGuide, whyTextId } from './beginner-guide';
import {
  BEGINNER_GUIDE_SEEN,
  BEGINNER_GUIDE_STORAGE_KEY,
  BEGINNER_GUIDE_STORE,
  BeginnerGuideState,
} from './beginner-guide-state';

/** Magasin en mémoire qui consigne les écritures. */
class MemoryStore implements KeyValueStore {
  readonly values = new Map<string, string>();
  readonly writes: [string, string][] = [];
  read(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  write(key: string, value: string): void {
    this.values.set(key, value);
    this.writes.push([key, value]);
  }
}

/** Le guide et un bouton qui l'ouvre, pour vérifier le retour du focus. */
@Component({
  imports: [BeginnerGuide],
  template: `<button type="button" id="ouvrir" (click)="state.show()">Guide</button>
    <app-beginner-guide />`,
})
class Host {
  readonly state = TestBed.inject(BeginnerGuideState);
}

function key(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('Guide du débutant (#240)', () => {
  let store: MemoryStore;
  let fixture: ComponentFixture<Host>;
  let state: BeginnerGuideState;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const dialog = (): HTMLElement | null => root().querySelector('[role="dialog"]');
  const opener = (): HTMLButtonElement => root().querySelector('#ouvrir') as HTMLButtonElement;

  async function create(stored: string | null = null): Promise<void> {
    store = new MemoryStore();
    if (stored !== null) {
      store.values.set(BEGINNER_GUIDE_STORAGE_KEY, stored);
    }
    TestBed.configureTestingModule({
      providers: [{ provide: BEGINNER_GUIDE_STORE, useValue: store }],
    });
    state = TestBed.inject(BeginnerGuideState);
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  }

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
  });

  it('fermé par défaut : rien d’affiché', async () => {
    await create();
    expect(dialog()).toBeNull();
    expect(state.open()).toBe(false);
  });

  it('ouvert : dialogue modal nommé par son titre, cinq étapes, toutes les explications', async () => {
    await create();
    opener().focus();
    opener().click();
    await fixture.whenStable();
    const d = dialog()!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-labelledby')).toBe(BEGINNER_GUIDE_TITLE_ID);
    expect(document.getElementById(BEGINNER_GUIDE_TITLE_ID)?.textContent?.trim()).toBe(
      'Guide du débutant',
    );
    expect(
      Array.from(d.querySelectorAll('[data-guide-step]')).map((s) =>
        s.getAttribute('data-guide-step'),
      ),
    ).toEqual(GUIDE_STEPS.map((s) => s.id));
    expect(
      Array.from(d.querySelectorAll('[data-why]')).map((s) => s.getAttribute('data-why')),
    ).toEqual(WHY_TOPIC_ORDER);
    // Aucune explication dépliée sans sujet demandé ; le focus est sur le dialogue.
    expect(d.querySelectorAll('[data-why-text]').length).toBe(0);
    expect(document.activeElement).toBe(d);
  });

  it('ouvrir marque la visite ; Échap ferme et rend le focus au bouton d’ouverture', async () => {
    await create();
    opener().focus();
    opener().click();
    await fixture.whenStable();
    expect(store.writes).toEqual([[BEGINNER_GUIDE_STORAGE_KEY, BEGINNER_GUIDE_SEEN]]);
    const event = key(dialog()!, 'Escape');
    expect(event.defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it('« Fermer » et le voile ferment aussi', async () => {
    await create();
    state.show();
    await fixture.whenStable();
    (root().querySelector('[data-guide-close]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(dialog()).toBeNull();
    state.show();
    await fixture.whenStable();
    (root().querySelector('[data-guide-backdrop]') as HTMLElement).click();
    await fixture.whenStable();
    expect(dialog()).toBeNull();
  });

  it('ouvert sur un sujet : explication dépliée, focus sur son bouton', async () => {
    await create();
    state.show('ph');
    await fixture.whenStable();
    const toggle = root().querySelector('[data-why-toggle="ph"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(whyTextId('ph'));
    expect(document.getElementById(whyTextId('ph'))?.textContent).toContain('acide');
    expect(document.activeElement).toBe(toggle);
  });

  it('« Pourquoi ? » déplie une explication à la fois, et la replie', async () => {
    await create();
    state.show();
    await fixture.whenStable();
    const toggle = (id: string) =>
      root().querySelector(`[data-why-toggle="${id}"]`) as HTMLButtonElement;
    toggle('azote').click();
    await fixture.whenStable();
    expect(toggle('azote').getAttribute('aria-expanded')).toBe('true');
    toggle('acclimatation').click();
    await fixture.whenStable();
    expect(toggle('azote').getAttribute('aria-expanded')).toBe('false');
    expect(root().querySelectorAll('[data-why-text]').length).toBe(1);
    toggle('acclimatation').click();
    await fixture.whenStable();
    expect(root().querySelectorAll('[data-why-text]').length).toBe(0);
  });

  it('Tab et Maj+Tab restent dans le dialogue', async () => {
    await create();
    state.show();
    await fixture.whenStable();
    const focusable = Array.from(dialog()!.querySelectorAll<HTMLElement>('button'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    last.focus();
    expect(key(last, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(key(first, 'Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    // Depuis le dialogue lui-même (focus d'ouverture), Maj+Tab va au dernier élément.
    dialog()!.focus();
    key(dialog()!, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(last);
    // Ailleurs : Tab laissé au navigateur.
    first.focus();
    expect(key(first, 'Tab').defaultPrevented).toBe(false);
  });

  it('les touches frappées dans le dialogue ne vont pas aux raccourcis du document', async () => {
    await create();
    state.show();
    await fixture.whenStable();
    let reached = 0;
    const listener = () => reached++;
    document.addEventListener('keydown', listener);
    try {
      key(dialog()!, 'g');
      key(dialog()!, '?');
      expect(reached).toBe(0);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('Échap reçu par le document (focus hors du dialogue) ferme le guide', async () => {
    await create();
    state.show();
    await fixture.whenStable();
    expect(key(document.body, 'Escape').defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(dialog()).toBeNull();
    // Fermé : Échap n'est plus consommée.
    expect(key(document.body, 'Escape').defaultPrevented).toBe(false);
  });

  it('première visite : ouvert une fois ; déjà vu : rien', async () => {
    await create();
    expect(state.firstVisit()).toBe(true);
    state.showOnFirstVisit();
    expect(state.open()).toBe(true);
    state.hide();
    state.showOnFirstVisit();
    expect(state.open()).toBe(false);

    TestBed.resetTestingModule();
    (fixture.nativeElement as HTMLElement).remove();
    await create(BEGINNER_GUIDE_SEEN);
    state.showOnFirstVisit();
    expect(state.open()).toBe(false);
    expect(store.writes).toEqual([]);
  });

  it('valeur stockée inconnue : considérée comme jamais vue', async () => {
    await create('peut-etre');
    expect(state.firstVisit()).toBe(true);
  });

  it('hide() sans guide ouvert : sans effet', async () => {
    await create();
    expect(() => state.hide()).not.toThrow();
    expect(state.open()).toBe(false);
  });

  it('magasin par défaut adossé à localStorage', () => {
    const defaultStore = TestBed.inject(BEGINNER_GUIDE_STORE);
    try {
      defaultStore.write(BEGINNER_GUIDE_STORAGE_KEY, BEGINNER_GUIDE_SEEN);
      expect(window.localStorage.getItem(BEGINNER_GUIDE_STORAGE_KEY)).toBe(BEGINNER_GUIDE_SEEN);
    } finally {
      window.localStorage.removeItem(BEGINNER_GUIDE_STORAGE_KEY);
    }
  });
});
