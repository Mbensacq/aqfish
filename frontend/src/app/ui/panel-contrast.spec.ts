import { contrastRatio, parseHex, type Rgb } from './dashboard-frame/contrast';
import { DASHBOARD_COLORS } from './dashboard-frame/dashboard-frame';

import panelLayout from './_panel-layout.scss' with { loader: 'text' };

/**
 * Contrastes de la charte « la salle d'aquarium » (#407, #721), calculés sur les valeurs
 * écrites dans `_panel-layout.scss` (lu comme texte, sans navigateur) : texte ≥ 4,5:1 et anneau
 * de focus ≥ 3:1 (WCAG 2.2, 1.4.3 et 1.4.11). Les panneaux sont pleins : leur contraste ne
 * dépend pas de la scène ; seul l'anneau de focus, posé aussi sur la scène, la rencontre, et
 * son halo opaque l'en sépare. L'absence de valeur en dur ailleurs : `charte-jetons.spec.ts`.
 */

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

const tokens = scssVariables(panelLayout);
const token = (name: string) => tokens.get(name) ?? '';
const hex = (name: string) => parseHex(token(name));

/** Scènes que l'anneau de focus peut rencontrer : blanc, sable, eau de jour, ciel, noir, nuit. */
const SCENES: readonly Rgb[] = [
  '#ffffff',
  '#e8d3a8',
  '#3c9c8c',
  '#9fd3e6',
  '#000000',
  '#141418',
  '#0b1a2a',
].map(parseHex);

/** Fonds sur lesquels se pose du texte : panneau, panneau élevé (choix, survol), salle. */
const BACKGROUNDS = ['panel-background', 'panel-raised', 'room'] as const;

/** Couleurs de texte de la charte, lisibles sur chacun des fonds. */
const TEXTS = [
  'panel-ink',
  'panel-ink-muted',
  'brass',
  'state-good',
  'state-watch',
  'state-danger',
] as const;

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
});

describe('jetons de la charte (#721)', () => {
  it('_panel-layout.scss déclare tous les jetons', () => {
    for (const name of [
      ...BACKGROUNDS,
      ...TEXTS,
      'panel-rule',
      'panel-border',
      'on-brass',
      'radius-control',
      'radius-window',
      'opacity-disabled',
      'opacity-band',
      'scrim',
      'font-text',
      'font-mono',
      'focus-ring-color',
      'focus-ring-width',
      'focus-halo',
      'focus-halo-width',
    ]) {
      expect(tokens.has(name), name).toBe(true);
    }
  });

  it('valeurs de la charte : salle de la scène, coins de 2 et 4 px, panneaux pleins', () => {
    // La salle est le fond de la scène (`render/palette.ts` : fondScene), inchangé.
    expect(token('room')).toBe('#141418');
    expect(token('panel-background')).toBe('#1b1f23');
    expect(token('brass')).toBe('#d1a65c');
    expect(pixels(token('radius-control'))).toBe(2);
    expect(pixels(token('radius-window'))).toBe(4);
    // Fini les fonds translucides : plus aucun jeton d'opacité de fond.
    expect(tokens.has('panel-alpha')).toBe(false);
    expect(tokens.has('panel-button-alpha')).toBe(false);
    expect(percent(token('opacity-disabled'))).toBeLessThan(1);
    expect(token('font-text')).toMatch(/^'Atkinson Hyperlegible Next Variable', /);
    expect(token('font-mono')).toMatch(/^'Atkinson Hyperlegible Mono Variable', /);
  });

  it('le tableau de bord de l’eau prend les couleurs de la charte (ADR 0059)', () => {
    expect(DASHBOARD_COLORS).toEqual({
      background: token('panel-background'),
      ink: token('panel-ink'),
      vert: token('state-good'),
      orange: token('state-watch'),
      rouge: token('state-danger'),
    });
  });
});

describe('contraste du texte ≥ 4,5:1 (#407, #721)', () => {
  it.each(BACKGROUNDS)('sur %s', (background) => {
    for (const text of TEXTS) {
      expect(contrastRatio(hex(text), hex(background)), text).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('texte posé sur le laiton', () => {
    expect(contrastRatio(hex('on-brass'), hex('brass'))).toBeGreaterThanOrEqual(4.5);
  });

  it('encre secondaire plus discrète que l’encre, mais lisible (contre-exemple : filet)', () => {
    const panel = hex('panel-background');
    expect(contrastRatio(hex('panel-ink-muted'), panel)).toBeLessThan(
      contrastRatio(hex('panel-ink'), panel),
    );
    // Les filets et bords séparent, ils ne se lisent pas : un texte de cette couleur échouerait.
    expect(contrastRatio(hex('panel-border'), panel)).toBeLessThan(4.5);
  });
});

describe('anneau de focus ≥ 3:1 (#407)', () => {
  const halo = hex('focus-halo');

  it('épaisseurs : anneau de 2 px au moins, halo présent', () => {
    expect(pixels(token('focus-ring-width'))).toBeGreaterThanOrEqual(2);
    expect(pixels(token('focus-halo-width'))).toBeGreaterThanOrEqual(1);
  });

  it('l’anneau commun est en laiton', () => {
    expect(token('focus-ring-color')).toBe(token('brass'));
  });

  it.each([
    ['anneau commun', token('focus-ring-color')],
    ['tableau de bord (eau)', DASHBOARD_COLORS.vert],
    ['tableau de bord (alertes)', DASHBOARD_COLORS.ink],
  ])('%s (%s) : contre son halo, les panneaux et la scène', (_label, color) => {
    const ring = parseHex(color);
    // Le halo opaque borde l'anneau des deux côtés : seul voisin sur la scène.
    expect(contrastRatio(ring, halo)).toBeGreaterThanOrEqual(3);
    // Et contre un panneau, plein ou élevé.
    for (const background of BACKGROUNDS) {
      expect(contrastRatio(ring, hex(background)), background).toBeGreaterThanOrEqual(3);
    }
    // Le halo lui-même se détache des scènes claires, où l'anneau seul pourrait se perdre.
    for (const scene of SCENES.slice(0, 2)) {
      expect(contrastRatio(halo, scene)).toBeGreaterThanOrEqual(3);
    }
  });

  it('un anneau trop pâle serait refusé (contre-exemple)', () => {
    expect(contrastRatio(parseHex('#2a2a30'), halo)).toBeLessThan(3);
  });
});
