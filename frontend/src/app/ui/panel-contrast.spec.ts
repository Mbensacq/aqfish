import { contrastRatio, over, parseHex, type Rgb } from './dashboard-frame/contrast';
import { DASHBOARD_COLORS } from './dashboard-frame/dashboard-frame';

import panelLayout from './_panel-layout.scss' with { loader: 'text' };
import beginnerGuide from './beginner-guide/beginner-guide.scss' with { loader: 'text' };
import commandsHelp from './commands-help/commands-help.scss' with { loader: 'text' };
import controlPanel from './control-panel/control-panel.scss' with { loader: 'text' };
import dayIndicator from './day-indicator/day-indicator.scss' with { loader: 'text' };
import decorEditor from './decor-editor/decor-editor.scss' with { loader: 'text' };
import freeCameraPad from './free-camera-pad/free-camera-pad.scss' with { loader: 'text' };
import speciesWiki from './species-wiki/species-wiki.scss' with { loader: 'text' };
import viewPresetsBar from './view-presets-bar/view-presets-bar.scss' with { loader: 'text' };

/**
 * Contrastes des panneaux (#407), calculés sur les valeurs écrites dans `_panel-layout.scss`
 * (lu comme texte, sans navigateur) : texte ≥ 4,5:1 et anneau de focus ≥ 3:1 (WCAG 2.2,
 * 1.4.3 et 1.4.11), sur une scène de jour comme de nuit. Les panneaux sont translucides : la
 * scène derrière compte, d'où les scènes extrêmes (blanc, noir) en plus des tons du bac.
 */

/** Scènes derrière les panneaux : jour (clair) et nuit (sombre), bornes comprises. */
const SCENES: Readonly<Record<'jour' | 'nuit', readonly string[]>> = {
  // Blanc pur, sable clair, eau de jour, ciel du bassin.
  jour: ['#ffffff', '#e8d3a8', '#3c9c8c', '#9fd3e6'],
  // Noir pur, fond de scène, eau de nuit.
  nuit: ['#000000', '#141418', '#0b1a2a'],
};

const ALL_SCENES: readonly Rgb[] = [...SCENES.jour, ...SCENES.nuit].map(parseHex);

/**
 * Variables `$nom: valeur;` d'une feuille SCSS, références `$autre` résolues.
 * @throws Error si une référence ne correspond à aucune variable.
 */
function scssVariables(source: string): ReadonlyMap<string, string> {
  const raw = new Map<string, string>();
  for (const match of source.matchAll(/^\$([\w-]+):\s*([^;]+);/gm)) {
    raw.set(match[1] ?? '', (match[2] ?? '').trim());
  }
  const resolve = (name: string, seen: readonly string[]): string => {
    const value = raw.get(name);
    if (value === undefined) {
      throw new Error(`Variable SCSS « $${name} » absente`);
    }
    if (seen.includes(name)) {
      throw new Error(`Variable SCSS « $${name} » circulaire`);
    }
    const ref = /^\$([\w-]+)$/.exec(value);
    return ref ? resolve(ref[1] ?? '', [...seen, name]) : value;
  };
  return new Map([...raw.keys()].map((name) => [name, resolve(name, [])]));
}

/** Valeur `NN%` lue en fraction de 1. @throws Error si ce n'est pas un pourcentage. */
function percent(value: string): number {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(value);
  if (!match) {
    throw new Error(`« ${value} » : pourcentage attendu`);
  }
  return Number(match[1]) / 100;
}

/** Valeur `Npx` lue en pixels. @throws Error si ce n'est pas une longueur en px. */
function pixels(value: string): number {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (!match) {
    throw new Error(`« ${value} » : longueur en px attendue`);
  }
  return Number(match[1]);
}

/** Opacités `rgb(r g b / NN%)` des déclarations `propriété:` d'une couleur donnée. */
function alphasOf(source: string, property: string, rgb: Rgb): number[] {
  const pattern = new RegExp(
    `(?:^|[\\s;{])${property}:\\s*rgb\\(${rgb[0]} ${rgb[1]} ${rgb[2]} / (\\d+(?:\\.\\d+)?)%\\)`,
    'g',
  );
  return [...source.matchAll(pattern)].map((match) => Number(match[1]) / 100);
}

/** Couleurs `color: #rrggbb` d'une feuille SCSS. */
function textHexColors(source: string): string[] {
  return [...source.matchAll(/(?:^|[\s;{])color:\s*(#[0-9a-f]{6})\b/gi)].map(
    (match) => match[1] ?? '',
  );
}

const tokens = scssVariables(panelLayout);
const hex = (name: string) => parseHex(tokens.get(name) ?? '');
const background = hex('panel-background');
const ink = hex('panel-ink');
const buttonAlpha = percent(tokens.get('panel-button-alpha') ?? '');
const panelAlpha = percent(tokens.get('panel-alpha') ?? '');
const mutedAlpha = percent(tokens.get('panel-muted-alpha') ?? '');

/** Contraste minimal de `text` (opacité `textAlpha`) sur un fond d'opacité `alpha`, toutes scènes. */
function worstContrast(text: Rgb, alpha: number, textAlpha = 1): number {
  return Math.min(
    ...ALL_SCENES.map((scene) => {
      const panel = over(background, alpha, scene);
      return contrastRatio(over(text, textAlpha, panel), panel);
    }),
  );
}

/** Feuilles des panneaux sombres translucides, dont les couleurs doivent suivre les jetons. */
const PANEL_SHEETS: Readonly<Record<string, string>> = {
  'beginner-guide': beginnerGuide,
  'commands-help': commandsHelp,
  'control-panel': controlPanel,
  'day-indicator': dayIndicator,
  'decor-editor': decorEditor,
  'free-camera-pad': freeCameraPad,
  'species-wiki': speciesWiki,
  'view-presets-bar': viewPresetsBar,
};

describe('lecture des jetons SCSS (#407)', () => {
  it('lit les variables et résout les références', () => {
    const vars = scssVariables('$a: #112233;\n$b: $a;\n// $c: rouge;\n$d: 12px;\n');
    expect(vars.get('a')).toBe('#112233');
    expect(vars.get('b')).toBe('#112233');
    expect(vars.has('c')).toBe(false);
    expect(vars.get('d')).toBe('12px');
  });

  it('refuse une référence absente ou circulaire', () => {
    expect(() => scssVariables('$a: $absente;')).toThrow(/absente/);
    expect(() => scssVariables('$a: $b;\n$b: $a;')).toThrow(/circulaire/);
  });

  it('pourcentages et longueurs : valeurs attendues ou erreur', () => {
    expect(percent('72%')).toBeCloseTo(0.72);
    expect(percent('0%')).toBe(0);
    expect(() => percent('0.72')).toThrow();
    expect(pixels('2px')).toBe(2);
    expect(() => pixels('2em')).toThrow();
  });

  it('relève les opacités et les couleurs de texte déclarées', () => {
    const sheet =
      '.a {\n  background: rgb(20 20 24 / 72%);\n  color: #e8e6e3;\n}\n' +
      '.b { color: rgb(232 230 227 / 62%); border-color: #ffffff; }';
    expect(alphasOf(sheet, 'background', [20, 20, 24])).toEqual([0.72]);
    expect(alphasOf(sheet, 'color', [232, 230, 227])).toEqual([0.62]);
    expect(textHexColors(sheet)).toEqual(['#e8e6e3']);
  });

  it('_panel-layout.scss déclare tous les jetons de couleur', () => {
    for (const name of [
      'panel-background',
      'panel-button-alpha',
      'panel-alpha',
      'panel-ink',
      'panel-muted-alpha',
      'panel-accent',
      'focus-ring-color',
      'focus-ring-width',
      'focus-halo',
      'focus-halo-width',
    ]) {
      expect(tokens.has(name), name).toBe(true);
    }
    expect(buttonAlpha).toBeLessThanOrEqual(panelAlpha);
  });
});

describe('contraste du texte des panneaux ≥ 4,5:1, de jour et de nuit (#407)', () => {
  it.each(Object.entries(SCENES))('scène de %s', (_moment, scenes) => {
    for (const scene of scenes.map(parseHex)) {
      const button = over(background, buttonAlpha, scene);
      const panel = over(background, panelAlpha, scene);
      const cases: readonly [string, Rgb, Rgb][] = [
        ['encre sur bouton', ink, button],
        ['encre sur panneau', ink, panel],
        ['texte secondaire sur panneau', over(ink, mutedAlpha, panel), panel],
        ['accent sur panneau', hex('panel-accent'), panel],
      ];
      for (const [label, text, back] of cases) {
        expect(
          contrastRatio(text, back),
          `${label}, scène ${scene.join(',')}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(Object.entries(PANEL_SHEETS))(
    '%s : fonds et textes dans les bornes des jetons',
    (_name, sheet) => {
      for (const alpha of alphasOf(sheet, 'background', background)) {
        expect(alpha).toBeGreaterThanOrEqual(buttonAlpha);
      }
      for (const alpha of alphasOf(sheet, 'color', ink)) {
        expect(alpha).toBeGreaterThanOrEqual(mutedAlpha);
      }
      // Toute couleur de texte pleine : lisible sur un panneau déplié, quelle que soit la scène.
      for (const color of textHexColors(sheet)) {
        expect(worstContrast(parseHex(color), panelAlpha), color).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});

describe('anneau de focus ≥ 3:1 (#407)', () => {
  const halo = hex('focus-halo');

  it('épaisseurs : anneau de 2 px au moins, halo présent', () => {
    expect(pixels(tokens.get('focus-ring-width') ?? '')).toBeGreaterThanOrEqual(2);
    expect(pixels(tokens.get('focus-halo-width') ?? '')).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ['anneau commun', tokens.get('focus-ring-color') ?? ''],
    ['tableau de bord (eau)', DASHBOARD_COLORS.vert],
    ['tableau de bord (alertes)', DASHBOARD_COLORS.ink],
    ['mode immersif', '#f2c14e'],
  ])('%s (%s) : contre son halo et contre le fond des panneaux', (_label, color) => {
    const ring = parseHex(color);
    // Le halo opaque borde l'anneau des deux côtés : seul voisin, de jour comme de nuit.
    expect(contrastRatio(ring, halo)).toBeGreaterThanOrEqual(3);
    // Et sans halo (contrôle dans un panneau déplié), sur toute scène.
    expect(worstContrast(ring, panelAlpha)).toBeGreaterThanOrEqual(3);
  });

  it('un anneau trop pâle serait refusé (contre-exemple)', () => {
    expect(contrastRatio(parseHex('#2a2a30'), halo)).toBeLessThan(3);
  });
});
