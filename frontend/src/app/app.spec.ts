import { TestBed } from '@angular/core/testing';

import { App } from './app';
import { isCaptureReady, resetCaptureReady } from './core/capture/capture-ready';
import type { AquariumRenderer } from './render/aquarium-view';
import { AQUARIUM_RENDERER_FACTORY } from './ui/aquarium-host/aquarium-host';
import { COMMANDS_HELP_STORE, createFallbackStore } from './ui/commands-help/commands-help-store';
import { EXCLUSIVE_PANELS } from './ui/exclusive-panels/exclusive-panels';

/** jsdom n'a pas WebGL : renderer factice (docs/PIEGES.md). */
const fakeRendererFactory = (): AquariumRenderer => ({
  setPixelRatio: () => undefined,
  setSize: () => undefined,
  setRenderTarget: () => undefined,
  render: () => undefined,
  dispose: () => undefined,
});

describe('App', () => {
  let frames: FrameRequestCallback[];

  beforeEach(async () => {
    resetCaptureReady();
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: AQUARIUM_RENDERER_FACTORY, useValue: fakeRendererFactory }],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCaptureReady();
  });

  it("crée l'application", () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('affiche le nom du projet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('aqfish');
  });

  it("contient l'hôte du canvas 3D", async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-aquarium-host canvas'),
    ).not.toBeNull();
  });

  it("ne signale « prêt » au harnais de capture qu'après la première image 3D", async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    // Le premier rendu Angular ne suffit plus : aucune image 3D n'a encore été produite.
    expect(isCaptureReady()).toBe(false);

    const canvas = (fixture.nativeElement as HTMLElement).querySelector('canvas')!;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 480 });
    frames.splice(0).forEach((cb) => cb(0)); // première image rendue
    frames.splice(0).forEach((cb) => cb(0)); // image suivante : signal
    expect(isCaptureReady()).toBe(true);
  });

  it('affiche la barre des préréglages, reliée à la caméra', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const host = root.querySelector('app-aquarium-host')!;
    const canvas = host.querySelector('canvas')!;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 480 });
    frames.splice(0).forEach((cb) => cb(0));
    const before = host.getAttribute('data-aqfish-camera');

    const buttons = root.querySelectorAll('app-view-presets-bar [role="toolbar"] button');
    expect(buttons).toHaveLength(5);
    (root.querySelector('button[data-preset="top"]') as HTMLButtonElement).click();
    frames.splice(0).forEach((cb) => cb(10_000)); // au-delà de la transition
    const after = host.getAttribute('data-aqfish-camera');
    expect(after).not.toBe(before);
    expect(Number(after!.split(',')[1])).toBeGreaterThan(0.6);
  });

  it('le bouton « Pixel art » bascule le filtre de l’hôte et reflète son état (#33)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const host = root.querySelector('app-aquarium-host')!;
    const toggle = root.querySelector(
      'app-view-presets-bar button[aria-keyshortcuts="P"]',
    ) as HTMLButtonElement;
    expect(host.getAttribute('data-aqfish-filter')).toBe('pixel');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    try {
      toggle.click();
      await fixture.whenStable();
      expect(host.getAttribute('data-aqfish-filter')).toBe('aucun');
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
    } finally {
      window.localStorage.removeItem('aqfish.filtre');
    }
  });

  it('affiche l’aide-mémoire des commandes hors mode capture (#74)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-commands-help'),
    ).not.toBeNull();
  });

  it('masque la barre et l’aide-mémoire en mode capture', async () => {
    window.history.replaceState(null, '', '/?capture=1');
    try {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('app-aquarium-host')).not.toBeNull();
      expect(root.querySelector('app-view-presets-bar')).toBeNull();
      expect(root.querySelector('app-commands-help')).toBeNull();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  /** Interface de `App` : aucun composant d'interface ni bouton, seul l'hôte du canvas. */
  async function expectCanvasOnly(): Promise<void> {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-aquarium-host canvas')).not.toBeNull();
    for (const selector of [
      'h1',
      'button',
      'app-view-presets-bar',
      'app-commands-help',
      'app-beginner-guide',
      'app-control-panel',
      'app-dashboard-frame',
      'app-dashboard-status',
      'app-day-indicator',
      'app-species-wiki',
    ]) {
      expect(root.querySelector(selector), selector).toBeNull();
    }
  }

  it('vue fond d’écran (fond=1, #279) : aucune interface, seul le canvas', async () => {
    window.history.replaceState(null, '', '/?fond=1');
    try {
      await expectCanvasOnly();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('vue fond d’écran par la globale aqfishFond du paquet, sans paramètre (#279)', async () => {
    (window as unknown as Record<string, unknown>)['aqfishFond'] = { config: null, fps: null };
    try {
      await expectCanvasOnly();
    } finally {
      delete (window as unknown as Record<string, unknown>)['aqfishFond'];
    }
  });

  describe('« Réglages » et « Commandes » (#136)', () => {
    let narrow: boolean;

    async function render() {
      narrow = true;
      TestBed.overrideProvider(EXCLUSIVE_PANELS, { useValue: () => narrow });
      TestBed.overrideProvider(COMMANDS_HELP_STORE, { useValue: createFallbackStore(null) });
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      const settingsButton = () => root.querySelector<HTMLButtonElement>('.control-panel__toggle')!;
      const helpButton = () => root.querySelector<HTMLButtonElement>('.commands-help__toggle')!;
      const settings = () => root.querySelector('.control-panel');
      const help = () => root.querySelector('#aide-commandes');
      const click = async (button: HTMLButtonElement) => {
        button.click();
        await fixture.whenStable();
      };
      const settle = () => fixture.whenStable();
      return { root, settingsButton, helpButton, settings, help, click, settle };
    }

    it('écran étroit : ouvrir l’un replie l’autre, dans les deux sens', async () => {
      const ui = await render();
      expect(ui.help()).not.toBeNull(); // déplié par défaut sans matchMedia (jsdom)
      await ui.click(ui.settingsButton());
      expect(ui.settings()).not.toBeNull();
      expect(ui.help()).toBeNull();
      await ui.click(ui.helpButton());
      expect(ui.help()).not.toBeNull();
      expect(ui.settings()).toBeNull();
      await ui.click(ui.settingsButton());
      expect(ui.settings()).not.toBeNull();
      expect(ui.help()).toBeNull();
    });

    it('écran large : la fenêtre des réglages replie « Commandes » le temps d’être ouverte (#722)', async () => {
      const ui = await render();
      narrow = false;
      expect(ui.help()).not.toBeNull();
      await ui.click(ui.settingsButton());
      expect(ui.settings()).not.toBeNull();
      expect(ui.help()).toBeNull();
      // Refermée par l'utilisateur : « Commandes » revient, comme avant l'ouverture.
      await ui.click(ui.settingsButton());
      expect(ui.settings()).toBeNull();
      expect(ui.help()).not.toBeNull();
    });

    it('écran large : « Commandes » replié avant, il le reste à la fermeture (#722)', async () => {
      const ui = await render();
      narrow = false;
      await ui.click(ui.helpButton()); // replie « Commandes »
      expect(ui.help()).toBeNull();
      await ui.click(ui.settingsButton());
      await ui.click(ui.settingsButton());
      expect(ui.settings()).toBeNull();
      expect(ui.help()).toBeNull();
    });

    it('écran large : « Commandes » ouvert (touche ?) referme la fenêtre des réglages (#722)', async () => {
      const ui = await render();
      narrow = false;
      await ui.click(ui.settingsButton());
      expect(ui.help()).toBeNull();
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }),
      );
      await ui.settle();
      expect(ui.help()).not.toBeNull();
      expect(ui.settings()).toBeNull();
    });

    it('la languette du parcours se masque avec « Réglages » ouvert et revient (#527)', async () => {
      const ui = await render();
      const path = () => ui.root.querySelector('app-first-tank-path');
      expect(path()).not.toBeNull();
      await ui.click(ui.settingsButton());
      expect(ui.settings()).not.toBeNull();
      expect(path()).toBeNull();
      await ui.click(ui.settingsButton());
      expect(ui.settings()).toBeNull();
      expect(path()).not.toBeNull();
    });

    it('replier l’un ne touche pas à l’autre', async () => {
      const ui = await render();
      await ui.click(ui.settingsButton()); // replie « Commandes »
      await ui.click(ui.settingsButton()); // replie « Réglages »
      expect(ui.settings()).toBeNull();
      expect(ui.help()).toBeNull();
    });
  });

  describe('wiki des espèces (#287)', () => {
    it('exclusif avec « Réglages » et « Commandes », même sur écran large', async () => {
      TestBed.overrideProvider(EXCLUSIVE_PANELS, { useValue: () => false });
      TestBed.overrideProvider(COMMANDS_HELP_STORE, { useValue: createFallbackStore(null) });
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      const click = async (selector: string) => {
        root.querySelector<HTMLButtonElement>(selector)!.click();
        await fixture.whenStable();
      };
      const wiki = () => root.querySelector('#wiki-especes');
      const settings = () => root.querySelector('.control-panel');
      const help = () => root.querySelector('#aide-commandes');
      await click('.control-panel__toggle');
      expect(settings()).not.toBeNull();
      // Fenêtre des réglages : « Commandes » replié le temps qu'elle soit ouverte (#722).
      expect(help()).toBeNull();
      await click('[data-wiki-toggle]');
      expect(wiki()).not.toBeNull();
      expect(settings()).toBeNull();
      expect(help()).toBeNull();
      await click('.commands-help__toggle');
      expect(help()).not.toBeNull();
      expect(wiki()).toBeNull();
      await click('[data-wiki-toggle]');
      await click('.control-panel__toggle');
      expect(settings()).not.toBeNull();
      expect(wiki()).toBeNull();
    });
  });

  describe('« Masquer l’interface » (#725)', () => {
    const press = (key: string) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );

    it('I masque (classe et attribut de la racine, indication), Échap réaffiche', async () => {
      TestBed.overrideProvider(COMMANDS_HELP_STORE, { useValue: createFallbackStore(null) });
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.getAttribute('data-interface-hidden')).toBe('false');
      press('i');
      await fixture.whenStable();
      expect(root.classList.contains('app--ui-hidden')).toBe(true);
      expect(root.getAttribute('data-interface-hidden')).toBe('true');
      expect(root.querySelector('[data-hidden-interface-hint]')?.textContent?.trim()).toBe(
        'I ou Échap pour revenir',
      );
      // Les composants restent créés : leur état est gardé, leurs raccourcis marchent.
      expect(root.querySelector('app-view-presets-bar')).not.toBeNull();
      press('Escape');
      await fixture.whenStable();
      expect(root.classList.contains('app--ui-hidden')).toBe(false);
      expect(root.querySelector('[data-hidden-interface-hint]')).toBeNull();
    });

    it('l’interrupteur d’« Affichage » masque et referme la fenêtre des réglages', async () => {
      TestBed.overrideProvider(COMMANDS_HELP_STORE, { useValue: createFallbackStore(null) });
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.control-panel__toggle')!.click();
      await fixture.whenStable();
      const box = root.querySelector<HTMLInputElement>('[data-hide-interface] input')!;
      expect(box.checked).toBe(false);
      box.click();
      await fixture.whenStable();
      expect(root.getAttribute('data-interface-hidden')).toBe('true');
      expect(root.querySelector('.control-panel')).toBeNull();
      press('I');
      await fixture.whenStable();
      expect(root.getAttribute('data-interface-hidden')).toBe('false');
    });

    it('mode capture : I sans effet', async () => {
      window.history.replaceState(null, '', '/?capture=1');
      try {
        const fixture = TestBed.createComponent(App);
        await fixture.whenStable();
        press('i');
        await fixture.whenStable();
        expect((fixture.nativeElement as HTMLElement).classList).not.toContain('app--ui-hidden');
      } finally {
        window.history.replaceState(null, '', '/');
      }
    });

    it('un étalonnage enregistré par l’ancien mode immersif est ignoré sans erreur', async () => {
      // Clé de l'étalonnage du mode immersif retiré (#345) : plus jamais lue.
      localStorage.setItem(
        'aqfish.etalonnage-ecran',
        JSON.stringify({ pxPerMm: 4.2, eyeDistanceMm: 400, measured: true }),
      );
      try {
        const fixture = TestBed.createComponent(App);
        await fixture.whenStable();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelector('app-aquarium-host canvas')).not.toBeNull();
        expect(root.querySelector('[data-immersive-open]')).toBeNull();
        expect(localStorage.getItem('aqfish.etalonnage-ecran')).not.toBeNull();
      } finally {
        localStorage.removeItem('aqfish.etalonnage-ecran');
      }
    });
  });
});
