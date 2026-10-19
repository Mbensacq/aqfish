import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { CameraPreset } from '../../core/capture/capture-params';
import { CAMERA_PRESETS } from '../../core/capture/capture-params';
import {
  isClockKey,
  isPixelArtKey,
  isTypingContext,
  presetForKey,
  VIEW_PRESET_BUTTONS,
  ViewPresetsBar,
} from './view-presets-bar';

describe('ViewPresetsBar', () => {
  let fixture: ComponentFixture<ViewPresetsBar>;
  let emitted: CameraPreset[];

  /** Boutons des préréglages (dans la barre d'outils), hors bascule du filtre. */
  const buttons = (): HTMLButtonElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[role="toolbar"] button'));
  const toggle = (): HTMLButtonElement =>
    (fixture.nativeElement as HTMLElement).querySelector(
      'button[aria-keyshortcuts="P"]',
    ) as HTMLButtonElement;

  function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  beforeEach(async () => {
    emitted = [];
    fixture = TestBed.createComponent(ViewPresetsBar);
    fixture.componentInstance.presetSelected.subscribe((p) => emitted.push(p));
    await fixture.whenStable();
  });

  afterEach(() => {
    document.querySelectorAll('[data-test-field]').forEach((el) => el.remove());
  });

  it('affiche 5 boutons libellés en français, dans l’ordre des touches', () => {
    const list = buttons();
    expect(list).toHaveLength(5);
    expect(list.map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '1 Dessus',
      '2 Dessous',
      '3 Face',
      '4 Côté',
      '5 3/4',
    ]);
    expect(list.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Vue de dessus (touche 1)',
      'Vue de dessous (touche 2)',
      'Vue de face (touche 3)',
      'Vue de côté (touche 4)',
      'Vue trois-quarts (touche 5)',
    ]);
    list.forEach((b, i) => {
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-keyshortcuts')).toBe(String(i + 1));
    });
    const toolbar = (fixture.nativeElement as HTMLElement).querySelector('[role="toolbar"]');
    expect(toolbar?.getAttribute('aria-label')).toBe('Préréglages de vue');
  });

  it('couvre exactement les 5 préréglages du contrat de capture', () => {
    expect(VIEW_PRESET_BUTTONS.map((b) => b.preset).sort()).toEqual([...CAMERA_PRESETS].sort());
  });

  const pressed = () => buttons().map((b) => b.getAttribute('aria-pressed'));

  it('émet le préréglage au clic, sans marquer le bouton elle-même (#23)', async () => {
    buttons()[3].click();
    await fixture.whenStable();
    expect(emitted).toEqual(['side']);
    // L'état actif vient de l'hôte (entrée `activePreset`), pas du clic.
    expect(pressed()).toEqual(['false', 'false', 'false', 'false', 'false']);
  });

  it('marque le bouton du préréglage actif fourni par l’hôte, aucun si null (#23)', async () => {
    fixture.componentRef.setInput('activePreset', 'side');
    await fixture.whenStable();
    expect(pressed()).toEqual(['false', 'false', 'false', 'true', 'false']);
    expect(buttons()[3].classList).toContain('view-presets-bar__button--active');

    fixture.componentRef.setInput('activePreset', 'top');
    await fixture.whenStable();
    expect(pressed()).toEqual(['true', 'false', 'false', 'false', 'false']);

    fixture.componentRef.setInput('activePreset', null);
    await fixture.whenStable();
    expect(pressed()).toEqual(['false', 'false', 'false', 'false', 'false']);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[role="toolbar"] .view-presets-bar__button--active',
      ),
    ).toBeNull();
  });

  describe('bascule pixel art (#33)', () => {
    let toggles: number;

    beforeEach(() => {
      toggles = 0;
      fixture.componentInstance.pixelArtToggled.subscribe(() => toggles++);
    });

    it('bouton « Pixel art » hors de la barre des préréglages, accessible', () => {
      const button = toggle();
      expect(button).not.toBeNull();
      expect(button.closest('[role="toolbar"]')).toBeNull();
      expect(button.type).toBe('button');
      expect(button.textContent?.replace(/\s+/g, ' ').trim()).toBe('P Pixel art');
      expect(button.getAttribute('aria-label')).toBe('Filtre pixel art (touche P)');
    });

    it('aria-pressed reflète l’état fourni par l’hôte (vrai par défaut)', async () => {
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
      expect(toggle().classList).toContain('view-presets-bar__button--active');
      fixture.componentRef.setInput('pixelArt', false);
      await fixture.whenStable();
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
      expect(toggle().classList).not.toContain('view-presets-bar__button--active');
    });

    it('le clic émet une demande de bascule, sans changer l’état lui-même', async () => {
      toggle().click();
      await fixture.whenStable();
      expect(toggles).toBe(1);
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
      expect(emitted).toEqual([]);
    });

    it('les touches p et P émettent la bascule et sont consommées', () => {
      expect(press('p').defaultPrevented).toBe(true);
      expect(press('P').defaultPrevented).toBe(true);
      expect(toggles).toBe(2);
      expect(emitted).toEqual([]);
    });

    it('P ignorée avec Ctrl, dans un champ de saisie ou déjà traitée', () => {
      press('p', { ctrlKey: true });
      const field = document.createElement('input');
      field.setAttribute('data-test-field', '');
      document.body.appendChild(field);
      press('p', {}, field);
      const handled = new KeyboardEvent('keydown', { key: 'p', bubbles: true, cancelable: true });
      handled.preventDefault();
      document.body.dispatchEvent(handled);
      expect(toggles).toBe(0);
    });

    it('isPixelArtKey : p et P seulement', () => {
      expect(isPixelArtKey('p')).toBe(true);
      expect(isPixelArtKey('P')).toBe(true);
      for (const key of ['o', '1', 'Pause', 'PageUp', '']) {
        expect(isPixelArtKey(key)).toBe(false);
      }
    });
  });

  describe('heure figée (#51)', () => {
    let clockToggles: number;
    beforeEach(() => {
      clockToggles = 0;
      fixture.componentInstance.clockToggled.subscribe(() => clockToggles++);
    });

    it('les touches h et H émettent la bascule de l’horloge et sont consommées', () => {
      expect(press('h').defaultPrevented).toBe(true);
      expect(press('H').defaultPrevented).toBe(true);
      expect(clockToggles).toBe(2);
      expect(emitted).toEqual([]);
    });

    it('H ignorée avec Ctrl ou dans un champ de saisie', () => {
      press('h', { ctrlKey: true });
      const field = document.createElement('input');
      field.setAttribute('data-test-field', '');
      document.body.appendChild(field);
      press('h', {}, field);
      expect(clockToggles).toBe(0);
    });

    it('isClockKey : h et H seulement', () => {
      expect(isClockKey('h')).toBe(true);
      expect(isClockKey('H')).toBe(true);
      for (const key of ['g', 'p', 'Home', '']) {
        expect(isClockKey(key)).toBe(false);
      }
    });
  });

  it('les touches 1 à 5 émettent les 5 préréglages', () => {
    for (const key of ['1', '2', '3', '4', '5']) {
      expect(press(key).defaultPrevented).toBe(true);
    }
    expect(emitted).toEqual(['top', 'bottom', 'front', 'side', 'three-quarter']);
  });

  it('ignore les autres touches', () => {
    for (const key of ['0', '6', 'a', 'Enter', ' ']) {
      expect(press(key).defaultPrevented).toBe(false);
    }
    expect(emitted).toEqual([]);
  });

  it('ignore les touches avec Ctrl, Alt ou Meta', () => {
    press('1', { ctrlKey: true });
    press('2', { altKey: true });
    press('3', { metaKey: true });
    expect(emitted).toEqual([]);
  });

  it('ignore les touches tapées dans un champ de saisie', () => {
    for (const html of [
      '<input>',
      '<textarea></textarea>',
      '<select><option>a</option></select>',
      '<div contenteditable="true"><span>texte</span></div>',
    ]) {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-test-field', '');
      wrapper.innerHTML = html;
      document.body.appendChild(wrapper);
      const field = wrapper.querySelector('span') ?? wrapper.firstElementChild!;
      expect(press('1', {}, field).defaultPrevented).toBe(false);
    }
    expect(emitted).toEqual([]);
  });

  it('ignore une touche déjà traitée ailleurs', () => {
    const event = new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true });
    event.preventDefault();
    document.body.dispatchEvent(event);
    expect(emitted).toEqual([]);
  });

  it('ne réagit plus après destruction', () => {
    fixture.destroy();
    press('1');
    expect(emitted).toEqual([]);
  });
});

describe('presetForKey / isTypingContext', () => {
  it('associe les touches 1 à 5, rien d’autre', () => {
    expect(presetForKey('1')).toBe('top');
    expect(presetForKey('5')).toBe('three-quarter');
    expect(presetForKey('')).toBeNull();
    expect(presetForKey('12')).toBeNull();
  });

  it('cible non élément (document) : pas un contexte de saisie', () => {
    const event = new KeyboardEvent('keydown', { key: '1' });
    expect(isTypingContext(event)).toBe(false);
  });

  it('contenteditable="false" : pas un contexte de saisie', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'false');
    document.body.appendChild(div);
    let result: boolean | null = null;
    div.addEventListener('keydown', (e) => (result = isTypingContext(e)));
    div.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    div.remove();
    expect(result).toBe(false);
  });
});
