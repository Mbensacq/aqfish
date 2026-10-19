import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { GESTURE_COMMANDS, KEY_COMMANDS, keyCommandFor } from '../../core/commands/commands';
import { ViewPresetsBar } from '../view-presets-bar/view-presets-bar';
import {
  COMMANDS_HELP_DEFAULT_OPEN,
  COMMANDS_HELP_STORE,
  createFallbackStore,
  type KeyValueStore,
} from './commands-help-store';
import {
  COMMANDS_HELP_FOLDED,
  COMMANDS_HELP_OPEN,
  COMMANDS_HELP_STORAGE_KEY,
  CommandsHelp,
  initialOpen,
} from './commands-help';

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

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('CommandsHelp (#74)', () => {
  let store: MemoryStore;
  let fixture: ComponentFixture<CommandsHelp>;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const panel = (): HTMLElement | null => root().querySelector('#aide-commandes');
  const toggleButton = (): HTMLButtonElement =>
    root().querySelector('button.commands-help__toggle') as HTMLButtonElement;

  async function create(stored: string | null = null, defaultOpen = true): Promise<void> {
    store = new MemoryStore();
    if (stored !== null) {
      store.values.set(COMMANDS_HELP_STORAGE_KEY, stored);
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: COMMANDS_HELP_STORE, useValue: store },
        { provide: COMMANDS_HELP_DEFAULT_OPEN, useValue: defaultOpen },
      ],
    });
    fixture = TestBed.createComponent(CommandsHelp);
    await fixture.whenStable();
  }

  afterEach(() => {
    document.querySelectorAll('[data-test-field]').forEach((el) => el.remove());
  });

  it('ouvert par défaut : liste chaque touche déclarée, avec sa description', async () => {
    await create();
    expect(panel()).not.toBeNull();
    for (const command of KEY_COMMANDS) {
      const row = root().querySelector(`[data-command="${command.id}"]`);
      expect(row, command.id).not.toBeNull();
      expect(row!.querySelector('kbd')?.textContent?.trim()).toBe(command.display);
      expect(row!.querySelector('dd')?.textContent?.trim()).toBe(command.description);
    }
  });

  it('liste les gestes de la souris et de l’écran tactile réellement réglés', async () => {
    await create();
    for (const gesture of GESTURE_COMMANDS) {
      const row = root().querySelector(`[data-command="${gesture.id}"]`);
      expect(row, gesture.id).not.toBeNull();
      expect(row!.querySelector('dt')?.textContent?.trim()).toBe(gesture.gesture);
      expect(row!.querySelector('dd')?.textContent?.trim()).toBe(gesture.description);
    }
    const mouse = root().querySelector('[data-group="souris"]')!.textContent!;
    expect(mouse).toContain('Molette');
    expect(mouse).toContain('Clic droit + glisser');
    expect(root().querySelector('[data-group="tactile"]')!.textContent).toContain('Deux doigts');
  });

  it('aucune ligne en trop : une ligne par touche et par geste déclarés', async () => {
    await create();
    expect(root().querySelectorAll('[data-command]').length).toBe(
      KEY_COMMANDS.length + GESTURE_COMMANDS.length,
    );
  });

  it('textes en français et titres de groupes', async () => {
    await create();
    const titles = Array.from(root().querySelectorAll('h3')).map((h) => h.textContent?.trim());
    expect(titles).toEqual([
      'Vues',
      'Affichage',
      'Heure',
      'Nourriture',
      'Souris',
      'Écran tactile',
      'Aide',
    ]);
    expect(root().querySelector('h2')?.textContent?.trim()).toBe('Commandes');
  });

  it('le bouton replie, puis déplie ; l’état est mémorisé à chaque fois', async () => {
    await create();
    expect(toggleButton().getAttribute('aria-expanded')).toBe('true');
    toggleButton().click();
    await fixture.whenStable();
    expect(panel()).toBeNull();
    expect(toggleButton().getAttribute('aria-expanded')).toBe('false');
    expect(toggleButton().textContent).toContain('Commandes');
    expect(store.writes).toEqual([[COMMANDS_HELP_STORAGE_KEY, COMMANDS_HELP_FOLDED]]);

    toggleButton().click();
    await fixture.whenStable();
    expect(panel()).not.toBeNull();
    expect(store.writes.at(-1)).toEqual([COMMANDS_HELP_STORAGE_KEY, COMMANDS_HELP_OPEN]);
  });

  it('état replié conservé : replié au démarrage si mémorisé ainsi', async () => {
    await create(COMMANDS_HELP_FOLDED);
    expect(panel()).toBeNull();
    expect(toggleButton().getAttribute('aria-keyshortcuts')).toBe('?');
    expect(store.writes).toEqual([]);
  });

  it.each(['', 'REPLIE', 'n’importe quoi'])(
    'valeur mémorisée invalide « %s » : état par défaut',
    async (stored) => {
      await create(stored);
      expect(panel()).not.toBeNull();
    },
  );

  it('petit écran (replié par défaut) : la pastille déplie ; « ouvert » mémorisé l’emporte', async () => {
    await create(null, false);
    expect(panel()).toBeNull();
    toggleButton().click();
    await fixture.whenStable();
    expect(panel()).not.toBeNull();
    expect(store.writes).toEqual([[COMMANDS_HELP_STORAGE_KEY, COMMANDS_HELP_OPEN]]);
    TestBed.resetTestingModule();
    await create(COMMANDS_HELP_OPEN, false);
    expect(panel()).not.toBeNull();
  });

  it('initialOpen : état mémorisé valide, sinon valeur par défaut', () => {
    for (const defaultOpen of [true, false]) {
      expect(initialOpen(COMMANDS_HELP_OPEN, defaultOpen)).toBe(true);
      expect(initialOpen(COMMANDS_HELP_FOLDED, defaultOpen)).toBe(false);
      expect(initialOpen(null, defaultOpen)).toBe(defaultOpen);
      expect(initialOpen('ouvert ', defaultOpen)).toBe(defaultOpen);
    }
  });

  it('la touche ? replie et déplie, et elle est consommée', async () => {
    await create();
    const event = press('?');
    expect(event.defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(panel()).toBeNull();
    press('?');
    await fixture.whenStable();
    expect(panel()).not.toBeNull();
    expect(store.writes.map(([, value]) => value)).toEqual([
      COMMANDS_HELP_FOLDED,
      COMMANDS_HELP_OPEN,
    ]);
  });

  it('? ignorée avec Ctrl, Alt, Meta, dans un champ de saisie ou déjà traitée', async () => {
    await create();
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      expect(press('?', { [modifier]: true }).defaultPrevented).toBe(false);
    }
    const input = document.createElement('input');
    input.setAttribute('data-test-field', '');
    document.body.appendChild(input);
    expect(press('?', {}, input).defaultPrevented).toBe(false);

    const handled = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true });
    handled.preventDefault();
    document.body.dispatchEvent(handled);

    await fixture.whenStable();
    expect(panel()).not.toBeNull();
    expect(store.writes).toEqual([]);
  });

  it('ignore les autres touches (dont / et , qui partagent la touche de ? selon le clavier)', async () => {
    await create();
    for (const key of ['/', ',', 'h', 'Escape', 'F1']) {
      expect(press(key).defaultPrevented).toBe(false);
    }
    expect(store.writes).toEqual([]);
  });

  it('ne réagit plus après destruction', async () => {
    await create();
    fixture.destroy();
    expect(press('?').defaultPrevented).toBe(false);
  });
});

describe('createFallbackStore', () => {
  it('lit et écrit dans le stockage fourni', () => {
    const backing = new Map<string, string>([['a', '1']]);
    const store = createFallbackStore({
      getItem: (key) => backing.get(key) ?? null,
      setItem: (key, value) => void backing.set(key, value),
    });
    expect(store.read('a')).toBe('1');
    expect(store.read('b')).toBeNull();
    store.write('b', '2');
    expect(backing.get('b')).toBe('2');
    expect(store.read('b')).toBe('2');
  });

  it('sans stockage : repli en mémoire pour la session', () => {
    const store = createFallbackStore(null);
    expect(store.read('k')).toBeNull();
    store.write('k', 'v');
    expect(store.read('k')).toBe('v');
  });

  it('stockage qui lève (navigation privée, quota) : aucune exception, repli en mémoire', () => {
    const store = createFallbackStore({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(store.read('k')).toBeNull();
    expect(() => store.write('k', 'v')).not.toThrow();
    expect(store.read('k')).toBe('v');
  });

  it('par défaut sans matchMedia (jsdom) : déplié', () => {
    expect(TestBed.inject(COMMANDS_HELP_DEFAULT_OPEN)).toBe(true);
  });

  it('magasin par défaut adossé à localStorage', () => {
    const store = TestBed.inject(COMMANDS_HELP_STORE);
    try {
      store.write(COMMANDS_HELP_STORAGE_KEY, COMMANDS_HELP_FOLDED);
      expect(window.localStorage.getItem(COMMANDS_HELP_STORAGE_KEY)).toBe(COMMANDS_HELP_FOLDED);
    } finally {
      window.localStorage.removeItem(COMMANDS_HELP_STORAGE_KEY);
    }
  });
});

/** L'interface complète (hors mode capture) : barre des préréglages et aide-mémoire. */
@Component({
  imports: [ViewPresetsBar, CommandsHelp],
  template: `<app-view-presets-bar /><app-commands-help />`,
})
class KeyboardHost {}

/**
 * Test d'exhaustivité (#74) : toute touche gérée par l'interface figure dans l'aide-mémoire,
 * et toute touche de l'aide-mémoire est gérée. Un futur raccourci ajouté à un gestionnaire
 * sans être déclaré dans `core/commands` fait échouer ce test.
 */
describe('raccourcis : déclaration unique et exhaustive (#74)', () => {
  /** Touches candidates : ASCII imprimable (minuscules et majuscules) et touches nommées. */
  const CANDIDATE_KEYS = [
    ...Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)),
    ...'àâçéèêëîïôùûüœ²µ§£€'.split(''),
    'Escape',
    'Enter',
    'Tab',
    'Backspace',
    'Delete',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  ];

  let fixture: ComponentFixture<KeyboardHost>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: COMMANDS_HELP_STORE, useValue: new MemoryStore() },
        { provide: COMMANDS_HELP_DEFAULT_OPEN, useValue: true },
      ],
    });
    fixture = TestBed.createComponent(KeyboardHost);
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  it('toute touche consommée par l’interface est déclarée, et inversement', () => {
    const handled = CANDIDATE_KEYS.filter((key) => press(key).defaultPrevented);
    const declared = CANDIDATE_KEYS.filter((key) => keyCommandFor(key) !== null);
    expect(handled).toEqual(declared);
    // Chaque raccourci déclaré est bien atteint par les candidates, en minuscule et majuscule.
    for (const command of KEY_COMMANDS) {
      expect(handled).toContain(command.key);
      expect(handled).toContain(command.key.toUpperCase());
    }
  });

  it('chaque touche consommée apparaît dans l’aide-mémoire affiché', () => {
    const shown = new Set(
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('#aide-commandes kbd'))
        .map((kbd) => kbd.textContent?.trim().toLowerCase())
        .filter((text): text is string => !!text),
    );
    // Touches lues sur l'aide-mémoire ouvert, avant le parcours (où `?` le replie).
    for (const key of CANDIDATE_KEYS.filter((candidate) => press(candidate).defaultPrevented)) {
      expect(shown, `touche « ${key} » absente de l’aide-mémoire`).toContain(key.toLowerCase());
    }
  });
});
