import { lightAt } from '../sim/daylight';
import { tonePenaltiesInto } from './night-shade';
import {
  ENVIRONMENT_TONE_COLORS,
  ENVIRONMENT_TONE_NAMES,
  ENVIRONMENT_TONES,
  EXTENDED_PALETTE_COLORS,
  INPUT_TONES,
  isEnvironmentToneName,
  NIGHT_TONE_COLORS,
  NIGHT_TONES,
  PALETTE,
  PALETTE_COLORS,
  TWILIGHT_TONE_COLORS,
  TWILIGHT_TONES,
} from './palette';
import { colorDistanceSq, hexToRgb, nearestPaletteIndex, type Rgb } from './pixel-art';

describe('PALETTE', () => {
  const names = Object.keys(PALETTE);

  it('déclare entre 32 et 48 couleurs', () => {
    expect(names.length).toBeGreaterThanOrEqual(32);
    expect(names.length).toBeLessThanOrEqual(48);
    expect(PALETTE_COLORS.length).toBe(names.length);
  });

  it('a des noms uniques en camelCase', () => {
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z][a-zA-Z]*$/);
    }
  });

  it('ne contient que des couleurs #rrggbb valides', () => {
    for (const hex of PALETTE_COLORS) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(() => hexToRgb(hex)).not.toThrow();
    }
  });

  it('a des couleurs distinctes, assez éloignées pour être discernées', () => {
    expect(new Set(PALETTE_COLORS).size).toBe(PALETTE_COLORS.length);
    const rgb = PALETTE_COLORS.map(hexToRgb);
    // Distance minimale : environ 8 niveaux sur 255 par composante.
    const minDistanceSq = 3 * (8 / 255) ** 2;
    for (let i = 0; i < rgb.length; i++) {
      for (let j = i + 1; j < rgb.length; j++) {
        expect(colorDistanceSq(rgb[i], rgb[j]), `${names[i]} / ${names[j]}`).toBeGreaterThan(
          minDistanceSq,
        );
      }
    }
  });

  it('reprend la palette de départ de docs/DA.md', () => {
    const fromDa = [
      '#0d3b3f', '#1b5e5a', '#2e8b7a', '#5fbfa3', '#a8e6cf',
      '#e3cf9e', '#c9b38a', '#a8916a', '#6e6a63', '#45423e',
      '#163d22', '#1f4d2b', '#2f6b3a', '#4e9a4a', '#8fd16a',
      '#d94a3a', '#f2ead8', '#1c1c22', '#f08a2c', '#f2c14e',
      '#3fa9f5', '#e63946', '#ffd166', '#f4978e',
      '#f7b2bd', '#7bc950', '#e07a2f',
      '#f06a9b', '#ffb703',
      '#141418', '#e8e6e3',
    ]; // prettier-ignore
    for (const hex of fromDa) {
      expect(PALETTE_COLORS).toContain(hex);
    }
  });

  it('garde les entrées utilisées par la scène', () => {
    expect(PALETTE.fondScene).toBe('#141418');
    expect(PALETTE.eauMoyenne).toBe('#2e8b7a');
    expect(PALETTE.sableClair).toBe('#e3cf9e');
  });
});

describe('Tons de nuit et du crépuscule (issue #73, ADR 0021)', () => {
  const extended = EXTENDED_PALETTE_COLORS.map(hexToRgb);
  const day = PALETTE_COLORS.map(hexToRgb);
  const allNames = [
    ...Object.keys(PALETTE),
    ...Object.keys(NIGHT_TONES),
    ...Object.keys(TWILIGHT_TONES),
  ];

  /** Pénalités par couleur de la palette étendue pour l'heure `hour`. */
  function penaltiesAt(hour: number): number[] {
    const p = tonePenaltiesInto(lightAt(hour).intensity, { night: 0, twilight: 0 });
    return [
      ...PALETTE_COLORS.map(() => 0),
      ...NIGHT_TONE_COLORS.map(() => p.night),
      ...TWILIGHT_TONE_COLORS.map(() => p.twilight),
    ];
  }
  const nameAt = (color: Rgb, hour: number) =>
    allNames[nearestPaletteIndex(color, extended, penaltiesAt(hour))];

  it('palette étendue : jour, puis nuit, puis crépuscule ; noms uniques, couleurs valides', () => {
    expect(EXTENDED_PALETTE_COLORS).toEqual([
      ...PALETTE_COLORS,
      ...NIGHT_TONE_COLORS,
      ...TWILIGHT_TONE_COLORS,
    ]);
    expect(new Set(allNames).size).toBe(allNames.length);
    for (const hex of EXTENDED_PALETTE_COLORS) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('toutes les couleurs de la palette étendue sont distinctes et discernables', () => {
    const minDistanceSq = 3 * (8 / 255) ** 2;
    for (let i = 0; i < extended.length; i++) {
      for (let j = i + 1; j < extended.length; j++) {
        expect(
          colorDistanceSq(extended[i], extended[j]),
          `${allNames[i]} / ${allNames[j]}`,
        ).toBeGreaterThan(minDistanceSq);
      }
    }
  });

  it('à midi, aucune couleur ne bascule sur un ton ajouté (balayage de tout l’espace RVB)', () => {
    const noon = penaltiesAt(12);
    const step = 15;
    for (let r = 0; r <= 255; r += step) {
      for (let g = 0; g <= 255; g += step) {
        for (let b = 0; b <= 255; b += step) {
          const c: Rgb = [r / 255, g / 255, b / 255];
          expect(nearestPaletteIndex(c, extended, noon)).toBe(nearestPaletteIndex(c, day));
        }
      }
    }
  });

  it('le sable de minuit n’est plus la roche grise : il devient sableLune', () => {
    // Sable du dessus avant quantification, mesuré au cycle 23 (dessus, puis vu de dessous).
    for (const hex of ['#4a6485', '#4c697d']) {
      const sand = hexToRgb(hex);
      expect(nameAt(sand, 0)).toBe('sableLune');
      expect(nameAt(sand, 2)).toBe('sableLune');
    }
    // Avec la palette de jour seule, le sable de minuit (#486068, ADR 0019) était la roche.
    expect(Object.keys(PALETTE)[nearestPaletteIndex(hexToRgb('#486068'), day)]).toBe('roche');
  });

  it('la nuit, plantes vert-bleu et eau bleue ; au crépuscule, sable chaud', () => {
    // Couleurs mesurées avant quantification (passe court-circuitée), cycle 23.
    expect(nameAt(hexToRgb('#1c4d40'), 0)).toBe('vegetationLune');
    expect(nameAt(hexToRgb('#385471'), 0)).toBe('eauLune');
    // Bleu néon × NIGHT_FLAT_BRIGHTNESS : les néons restent bleu vif.
    expect(nameAt(hexToRgb('#3086c3'), 0)).toBe('neonBleuNuit');
    expect(nameAt(hexToRgb('#9c837a'), 18)).toBe('sableCrepuscule');
    expect(nameAt(hexToRgb('#75717e'), 19)).toBe('sableCrepusculeMauve');
    // En pleine nuit, les tons du crépuscule sont écartés.
    expect(nameAt(hexToRgb('#9c837a'), 0)).not.toBe('sableCrepuscule');
  });

  it('crépuscule de 19 h : sable et rochers mauves ou chauds, pas de gris neutre (#81)', () => {
    // Couleurs mesurées avant quantification (passe court-circuitée), cycle 62, vue
    // trois-quarts à 19 h : dessus et côté du sable, faces de rocher éclairées.
    expect(nameAt(hexToRgb('#756a7c'), 19)).toBe('sableCrepusculeMauve');
    expect(nameAt(hexToRgb('#5e5853'), 19)).toBe('sableCrepusculeOmbre');
    expect(nameAt(hexToRgb('#615062'), 19)).toBe('rocheCrepuscule');
    // À 18 h, faces de rocher éclairées et à l'ombre.
    expect(nameAt(hexToRgb('#6a535d'), 18)).toBe('rocheCrepuscule');
    expect(nameAt(hexToRgb('#42333a'), 18)).toBe('rocheCrepusculeSombre');
    // Côté du sable à 18 h : brun rosé, pas la roche grise.
    expect(nameAt(hexToRgb('#7d6054'), 18)).toBe('sableCrepusculeOmbre');
    // Les tons du sable de 19 h sont saturés : plus d'écart entre canaux que la roche grise.
    const spread = (hex: string) => {
      const [r, g, b] = hexToRgb(hex);
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    expect(spread(TWILIGHT_TONES.sableCrepusculeMauve)).toBeGreaterThan(2 * spread(PALETTE.roche));
    expect(spread(TWILIGHT_TONES.rocheCrepuscule)).toBeGreaterThan(2 * spread(PALETTE.roche));
  });

  it('chaque ton est capté par lui-même à son heure', () => {
    for (const [name, hex] of Object.entries(NIGHT_TONES)) {
      expect(nameAt(hexToRgb(hex), 0)).toBe(name);
    }
    for (const [name, hex] of Object.entries(TWILIGHT_TONES)) {
      expect(nameAt(hexToRgb(hex), 18)).toBe(name);
    }
  });
});

describe('Tons d’environnement (#148, ADR 0039)', () => {
  const others = [
    ...Object.keys(PALETTE),
    ...Object.keys(NIGHT_TONES),
    ...Object.keys(TWILIGHT_TONES),
  ];

  it('tons du récif (eau, #148 ; coraux violets, #149 ; clown, #150 ; chirurgien, #151), valides, hors de la palette étendue', () => {
    expect(ENVIRONMENT_TONE_NAMES).toEqual([
      'eauRecif',
      'eauRecifClaire',
      'corailViolet',
      'corailVioletClair',
      'clownOrange',
      'chirurgienBleu',
    ]);
    expect(ENVIRONMENT_TONE_COLORS).toEqual(Object.values(ENVIRONMENT_TONES));
    for (const name of ENVIRONMENT_TONE_NAMES) {
      expect(others).not.toContain(name);
      expect(isEnvironmentToneName(name)).toBe(true);
    }
    for (const hex of ENVIRONMENT_TONE_COLORS) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(EXTENDED_PALETTE_COLORS).not.toContain(hex);
    }
    for (const bad of ['eauMoyenne', 'constructor', 'toString', '']) {
      expect(isEnvironmentToneName(bad)).toBe(false);
    }
  });

  it('discernables entre eux et de toute couleur de la palette étendue', () => {
    const minDistanceSq = 3 * (8 / 255) ** 2;
    const tones = ENVIRONMENT_TONE_COLORS.map(hexToRgb);
    const all = [...EXTENDED_PALETTE_COLORS.map(hexToRgb), ...tones];
    for (const tone of tones) {
      for (const other of all) {
        if (other !== tone) {
          expect(colorDistanceSq(tone, other)).toBeGreaterThan(minDistanceSq);
        }
      }
    }
  });

  it('bleus : le ton de la surface est plus clair que celui du volume', () => {
    const [body, surface] = [ENVIRONMENT_TONES.eauRecif, ENVIRONMENT_TONES.eauRecifClaire].map(
      hexToRgb,
    );
    for (const [r, g, b] of [body, surface]) {
      expect(b).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(r);
    }
    const sum = (c: Rgb) => c[0] + c[1] + c[2];
    expect(sum(surface)).toBeGreaterThan(sum(body));
  });
});

describe('Tons d’entrée (#81)', () => {
  it('sont des couleurs valides, absentes de la passe palette (jamais affichées telles quelles)', () => {
    for (const hex of Object.values(INPUT_TONES)) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(EXTENDED_PALETTE_COLORS).not.toContain(hex);
      expect(ENVIRONMENT_TONE_COLORS).not.toContain(hex);
    }
  });
});
