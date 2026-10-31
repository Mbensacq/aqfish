import { describe, expect, it } from 'vitest';
import {
  CARD_WIDTH_MM,
  CSS_PX_PER_MM,
  DEFAULT_CALIBRATION,
  PX_PER_MM_LIMITS,
  calibrationFromCard,
  cardWidthPx,
  isValidPxPerMm,
  mmToPx,
  parseCalibration,
  pxToMm,
  screenSizeMm,
  serializeCalibration,
} from './screen-calibration';

describe('screen-calibration', () => {
  it('défaut estimé : pixel CSS de référence (96 px par pouce)', () => {
    expect(DEFAULT_CALIBRATION.estimated).toBe(true);
    expect(DEFAULT_CALIBRATION.pxPerMm).toBeCloseTo(3.779527559, 9);
    expect(mmToPx(25.4, DEFAULT_CALIBRATION)).toBeCloseTo(96, 9);
    expect(CSS_PX_PER_MM).toBe(96 / 25.4);
  });

  it('étalonnage d’après la carte ID-1 : mesuré, et la carte retrouve sa largeur', () => {
    const cal = calibrationFromCard(500);
    expect(cal.estimated).toBe(false);
    expect(cal.pxPerMm).toBeCloseTo(500 / 85.6, 12);
    expect(cardWidthPx(cal)).toBeCloseTo(500, 9);
    expect(pxToMm(500, cal)).toBeCloseTo(CARD_WIDTH_MM, 9);
  });

  it('aller-retour px → mm → px exact à 1e-9 près, valeurs extrêmes comprises', () => {
    for (const pxPerMm of [PX_PER_MM_LIMITS.min, CSS_PX_PER_MM, 6.3, PX_PER_MM_LIMITS.max]) {
      const cal = { pxPerMm, estimated: false };
      for (const px of [0, 1, 390, 2560, 1e6, -12.5]) {
        expect(mmToPx(pxToMm(px, cal), cal)).toBeCloseTo(px, 6);
      }
    }
  });

  it('refuse les largeurs de carte non finies, nulles ou négatives', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => calibrationFromCard(bad)).toThrow(RangeError);
    }
  });

  it('refuse un étalonnage hors bornes (manipulation certainement fausse)', () => {
    expect(() => calibrationFromCard(CARD_WIDTH_MM * 0.5)).toThrow(RangeError);
    expect(() => calibrationFromCard(CARD_WIDTH_MM * 25)).toThrow(RangeError);
    expect(calibrationFromCard(CARD_WIDTH_MM * PX_PER_MM_LIMITS.min).pxPerMm).toBe(1);
    expect(calibrationFromCard(CARD_WIDTH_MM * PX_PER_MM_LIMITS.max).pxPerMm).toBeCloseTo(20, 12);
  });

  it('conversions : refusent les longueurs non finies et les étalonnages invalides', () => {
    expect(() => pxToMm(Number.NaN, DEFAULT_CALIBRATION)).toThrow(RangeError);
    expect(() => mmToPx(Number.POSITIVE_INFINITY, DEFAULT_CALIBRATION)).toThrow(RangeError);
    for (const pxPerMm of [0, -3, Number.NaN, 0.5, 21]) {
      expect(() => pxToMm(10, { pxPerMm, estimated: false })).toThrow(RangeError);
    }
    expect(isValidPxPerMm('4')).toBe(false);
  });

  it('taille physique d’un écran ; refuse les dimensions vides', () => {
    const size = screenSizeMm(390, 844, { pxPerMm: 6, estimated: false });
    expect(size.width).toBeCloseTo(65, 9);
    expect(size.height).toBeCloseTo(844 / 6, 9);
    expect(() => screenSizeMm(0, 844, DEFAULT_CALIBRATION)).toThrow(RangeError);
    expect(() => screenSizeMm(390, Number.NaN, DEFAULT_CALIBRATION)).toThrow(RangeError);
  });

  it('enregistrement : aller-retour, texte invalide ignoré sans exception', () => {
    const cal = calibrationFromCard(420);
    expect(parseCalibration(serializeCalibration(cal))).toEqual(cal);
    for (const bad of [
      null,
      '',
      '{',
      'null',
      '42',
      '{"pxPerMm":"5"}',
      '{"pxPerMm":0}',
      '{"pxPerMm":1e9}',
    ]) {
      expect(parseCalibration(bad)).toBeNull();
    }
  });
});
