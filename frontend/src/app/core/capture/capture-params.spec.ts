import {
  CAMERA_PRESETS,
  DEFAULT_CAPTURE_PARAMS,
  MAX_CAPTURE_TIME_SECONDS,
  parseCaptureParams,
} from './capture-params';

describe('parseCaptureParams', () => {
  it('renvoie les valeurs par défaut pour une URL sans paramètre', () => {
    expect(parseCaptureParams('')).toEqual(DEFAULT_CAPTURE_PARAMS);
  });

  it('lit une URL de capture complète', () => {
    expect(parseCaptureParams('?capture=1&seed=7&camera=bottom&time=12.5')).toEqual({
      capture: true,
      seed: 7,
      camera: 'bottom',
      time: 12.5,
    });
  });

  it.each(CAMERA_PRESETS)('accepte le préréglage de caméra « %s »', (preset) => {
    expect(parseCaptureParams(`?camera=${preset}`).camera).toBe(preset);
  });

  it('ignore un préréglage de caméra inconnu', () => {
    expect(parseCaptureParams('?camera=diagonal').camera).toBe(DEFAULT_CAPTURE_PARAMS.camera);
  });

  it.each(['-1', '1.5', 'abc', '4294967296', ''])('rejette la graine invalide « %s »', (seed) => {
    expect(parseCaptureParams(`?seed=${seed}`).seed).toBe(DEFAULT_CAPTURE_PARAMS.seed);
  });

  it('accepte la graine maximale sur 32 bits', () => {
    expect(parseCaptureParams('?seed=4294967295').seed).toBe(4294967295);
  });

  it.each(['-3', 'NaN', 'Infinity', 'x', ' '])('rejette le temps invalide « %s »', (time) => {
    expect(parseCaptureParams(`?time=${encodeURIComponent(time)}`).time).toBe(
      DEFAULT_CAPTURE_PARAMS.time,
    );
  });

  it('plafonne le temps de simulation', () => {
    expect(parseCaptureParams('?time=999999').time).toBe(MAX_CAPTURE_TIME_SECONDS);
  });

  it("n'active le mode capture que pour capture=1", () => {
    expect(parseCaptureParams('?capture=true').capture).toBe(false);
    expect(parseCaptureParams('?capture=0').capture).toBe(false);
    expect(parseCaptureParams('?capture=1').capture).toBe(true);
  });
});
