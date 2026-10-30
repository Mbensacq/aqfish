import { NearestFilter, ShaderMaterial, SRGBColorSpace, type Mesh } from 'three';

import {
  ENVIRONMENT_TONE_COLORS,
  ENVIRONMENT_TONE_NAMES,
  EXTENDED_PALETTE_COLORS,
  FOOD_TONE_COLORS,
  NIGHT_TONE_COLORS,
  PALETTE_COLORS,
} from './palette';
import { TONE_PENALTY_OFF } from './night-shade';
import { environmentTonePenalties, FOOD_ALPHA_THRESHOLD, PalettePass } from './palette-pass';
import { FOOD_ALPHA_MARKER } from './food-layer';
import { PIXEL_SIZE } from './pixel-art';
import { RAIN_TONES } from './overcast';

function material(pass: PalettePass): ShaderMaterial {
  return (pass.scene.children[0] as Mesh).material as ShaderMaterial;
}

describe('PalettePass', () => {
  it('crée une cible sans lissage ni mipmaps', () => {
    const pass = new PalettePass();
    const texture = pass.target.texture;
    expect(texture.minFilter).toBe(NearestFilter);
    expect(texture.magFilter).toBe(NearestFilter);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(pass.target.samples).toBe(0);
    pass.dispose();
  });

  it('transmet toute la palette au shader : jour, nuit, crépuscule, environnement, nourriture', () => {
    const pass = new PalettePass();
    const m = material(pass);
    const size =
      EXTENDED_PALETTE_COLORS.length + ENVIRONMENT_TONE_COLORS.length + FOOD_TONE_COLORS.length;
    expect(m.defines['PALETTE_SIZE']).toBe(size);
    expect(m.defines['DAY_SIZE']).toBe(PALETTE_COLORS.length);
    expect(m.defines['TWILIGHT_START']).toBe(PALETTE_COLORS.length + NIGHT_TONE_COLORS.length);
    expect(m.defines['ENVIRONMENT_START']).toBe(EXTENDED_PALETTE_COLORS.length);
    expect(m.defines['ENVIRONMENT_PENALTY_SIZE']).toBe(ENVIRONMENT_TONE_COLORS.length);
    expect(m.defines['FOOD_START']).toBe(
      EXTENDED_PALETTE_COLORS.length + ENVIRONMENT_TONE_COLORS.length,
    );
    const data = m.uniforms['uPalette'].value as Float32Array;
    expect(data.length).toBe(size * 3);
    // Première couleur : fond de la scène #141418.
    expect(Array.from(data.slice(0, 3))).toEqual(
      [0x14 / 255, 0x14 / 255, 0x18 / 255].map(Math.fround),
    );
    pass.dispose();
  });

  it('suit la taille de l’affichage', () => {
    const pass = new PalettePass();
    expect(pass.setSize(1280, 721, 1)).toEqual({ width: 427, height: 241 });
    expect(pass.target.width).toBe(427);
    expect(pass.target.height).toBe(241);
    expect(material(pass).uniforms['uSceneSize'].value).toEqual([427, 241]);
    expect(material(pass).uniforms['uPixelScale'].value).toBe(PIXEL_SIZE);

    pass.setSize(600, 300, 2);
    expect(pass.target.width).toBe(200);
    expect(material(pass).uniforms['uPixelScale'].value).toBe(PIXEL_SIZE * 2);

    pass.setSize(0, 0, Number.NaN);
    expect([pass.target.width, pass.target.height]).toEqual([1, 1]);
    expect(material(pass).uniforms['uPixelScale'].value).toBe(PIXEL_SIZE);
    pass.dispose();
  });

  it('libère la cible, la géométrie et le matériau', () => {
    const pass = new PalettePass();
    const m = material(pass);
    const geometry = (pass.scene.children[0] as Mesh).geometry;
    const disposed: string[] = [];
    pass.target.addEventListener('dispose', () => disposed.push('cible'));
    geometry.addEventListener('dispose', () => disposed.push('geometrie'));
    m.addEventListener('dispose', () => disposed.push('materiau'));
    pass.dispose();
    expect(disposed.sort()).toEqual(['cible', 'geometrie', 'materiau']);
  });

  it('refuse une palette vide', () => {
    expect(() => new PalettePass([])).toThrow(/Palette vide/);
  });

  it('écarte les tons de nuit et du crépuscule tant que l’heure ne les appelle pas', () => {
    const pass = new PalettePass();
    expect(pass.tonePenalties).toEqual([TONE_PENALTY_OFF, TONE_PENALTY_OFF]);
    pass.setTonePenalties(0, 0.5);
    expect(pass.tonePenalties).toEqual([0, 0.5]);
    const m = material(pass);
    expect(m.uniforms['uNightPenalty'].value).toBe(0);
    expect(m.uniforms['uTwilightPenalty'].value).toBe(0.5);
    pass.dispose();
  });

  it('accepte des groupes de tons vides', () => {
    const pass = new PalettePass(['#000000', '#ffffff'], [], [], [], []);
    const m = material(pass);
    expect(m.defines['PALETTE_SIZE']).toBe(2);
    expect(m.defines['DAY_SIZE']).toBe(2);
    expect(m.defines['TWILIGHT_START']).toBe(2);
    expect(m.defines['ENVIRONMENT_START']).toBe(2);
    expect(m.defines['FOOD_START']).toBe(2);
    // Un tableau GLSL ne peut pas être vide : une case, jamais lue.
    expect(m.defines['ENVIRONMENT_PENALTY_SIZE']).toBe(1);
    expect(pass.environmentPenalties).toEqual([]);
    pass.setEnvironmentPenalties([]);
    pass.dispose();
  });

  it('tons de la nourriture : proposés aux seuls pixels marqués par un granulé (#226)', () => {
    const pass = new PalettePass();
    const m = material(pass);
    // Le marqueur reste sous le seuil, même voilé par l'eau translucide (30 %) ; un pixel
    // opaque (255) ne l'atteint jamais.
    expect(FOOD_ALPHA_MARKER).toBeLessThan(FOOD_ALPHA_THRESHOLD);
    expect(0.3 + FOOD_ALPHA_MARKER * 0.7).toBeLessThan(FOOD_ALPHA_THRESHOLD);
    expect(Math.round(FOOD_ALPHA_MARKER * 255) / 255).toBeLessThan(FOOD_ALPHA_THRESHOLD);
    expect(1).toBeGreaterThan(FOOD_ALPHA_THRESHOLD);
    expect(254 / 255).toBeLessThan(FOOD_ALPHA_THRESHOLD);
    expect(m.defines['FOOD_ALPHA_THRESHOLD']).toBe(FOOD_ALPHA_THRESHOLD.toFixed(4));
    expect(Number(m.defines['TONE_OFF'])).toBe(TONE_PENALTY_OFF);
    expect(m.fragmentShader).toMatch(
      /foodPenalty = scene\.a < FOOD_ALPHA_THRESHOLD \? 0\.0 : TONE_OFF;/,
    );
    expect(m.fragmentShader).toMatch(
      /i < FOOD_START \? uEnvironmentPenalty\[[^\]]+\] : foodPenalty/,
    );
    pass.dispose();
  });

  it('écarte les tons d’environnement tant qu’aucun environnement ne les déclare (#148)', () => {
    const pass = new PalettePass();
    expect(pass.environmentPenalties).toEqual(ENVIRONMENT_TONE_NAMES.map(() => TONE_PENALTY_OFF));
    pass.setEnvironmentPenalties(environmentTonePenalties(['eauRecifClaire']));
    const partial = [
      TONE_PENALTY_OFF,
      0,
      TONE_PENALTY_OFF,
      TONE_PENALTY_OFF,
      TONE_PENALTY_OFF,
      TONE_PENALTY_OFF,
      TONE_PENALTY_OFF,
      TONE_PENALTY_OFF,
      ...new Array<number>(RAIN_TONES.length).fill(TONE_PENALTY_OFF),
    ];
    expect(pass.environmentPenalties).toEqual(partial);
    expect(material(pass).uniforms['uEnvironmentPenalty'].value).toEqual(partial);
    pass.setEnvironmentPenalties(environmentTonePenalties([]));
    expect(pass.environmentPenalties).toEqual(ENVIRONMENT_TONE_NAMES.map(() => TONE_PENALTY_OFF));
    pass.dispose();
  });

  it('setEnvironmentPenalties refuse un nombre ou des valeurs de pénalités invalides', () => {
    const pass = new PalettePass();
    expect(() => pass.setEnvironmentPenalties([0])).toThrow(RangeError);
    expect(() => pass.setEnvironmentPenalties([0, 0, 0, 0])).toThrow(RangeError);
    expect(() => pass.setEnvironmentPenalties([0, 0, 0, 0, 0, 0, 0])).toThrow(RangeError);
    expect(() => pass.setEnvironmentPenalties(new Array<number>(14).fill(0))).toThrow(RangeError);
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        pass.setEnvironmentPenalties([0, bad, ...new Array<number>(11).fill(0)]),
      ).toThrow(RangeError);
    }
    // Un refus ne change rien.
    expect(pass.environmentPenalties).toEqual(ENVIRONMENT_TONE_NAMES.map(() => TONE_PENALTY_OFF));
    pass.dispose();
  });
});

describe('environmentTonePenalties (#148, ADR 0039)', () => {
  it('pénalité nulle pour les tons déclarés, écartés sinon', () => {
    const off = TONE_PENALTY_OFF;
    // Six tons du récif, puis les deux de l'eau brun-thé (#239) et les cinq du ciel couvert
    // (#123).
    const rain = [off, off, off, off, off];
    const tea = [off, off, ...rain];
    expect(environmentTonePenalties([])).toEqual([off, off, off, off, off, off, ...tea]);
    expect(environmentTonePenalties(['eauRecif', 'eauRecifClaire'])).toEqual([
      0,
      0,
      off,
      off,
      off,
      off,
      ...tea,
    ]);
    expect(environmentTonePenalties(['eauRecif'])).toEqual([0, off, off, off, off, off, ...tea]);
    expect(environmentTonePenalties(['corailVioletClair'])).toEqual([
      off,
      off,
      off,
      0,
      off,
      off,
      ...tea,
    ]);
    expect(environmentTonePenalties(['clownOrange'])).toEqual([off, off, off, off, 0, off, ...tea]);
    expect(environmentTonePenalties(['chirurgienBleu'])).toEqual([
      off,
      off,
      off,
      off,
      off,
      0,
      ...tea,
    ]);
    expect(environmentTonePenalties(['eauThe', 'eauTheClaire'])).toEqual([
      off,
      off,
      off,
      off,
      off,
      off,
      0,
      0,
      ...rain,
    ]);
    expect(environmentTonePenalties(RAIN_TONES)).toEqual([
      off,
      off,
      off,
      off,
      off,
      off,
      off,
      off,
      0,
      0,
      0,
      0,
      0,
    ]);
    expect(environmentTonePenalties([...ENVIRONMENT_TONE_NAMES])).toEqual(
      new Array<number>(13).fill(0),
    );
  });

  it('refuse un nom qui n’est pas un ton d’environnement', () => {
    for (const bad of ['eauMoyenne', 'sableLune', 'constructor', '']) {
      expect(() => environmentTonePenalties([bad])).toThrow(RangeError);
    }
  });
});
