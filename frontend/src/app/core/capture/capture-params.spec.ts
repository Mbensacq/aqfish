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
      filter: null,
      hour: null,
    });
  });

  it.each(['pixel', 'aucun'] as const)('lit le filtre de rendu filtre=%s', (filter) => {
    expect(parseCaptureParams(`?capture=1&camera=three-quarter&filtre=${filter}`).filter).toBe(
      filter,
    );
  });

  it.each(['', 'none', 'AUCUN', 'pixel art', '1'])(
    'ignore le filtre invalide « %s » (null : choix par défaut)',
    (filter) => {
      expect(parseCaptureParams(`?filtre=${encodeURIComponent(filter)}`).filter).toBeNull();
    },
  );

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

  it.each([
    ['0', 0],
    ['12', 12],
    ['6.5', 6.5],
    ['23.99', 23.99],
    ['07', 7],
  ])('lit l’heure figée heure=%s', (raw, hour) => {
    expect(parseCaptureParams(`?capture=1&heure=${raw}`).hour).toBe(hour);
  });

  it.each(['', '24', '25', '-1', 'midi', '12h', '1e1', ' 12', '12.', '.5', 'NaN', '100'])(
    'ignore l’heure invalide « %s » (null : midi en capture)',
    (raw) => {
      expect(parseCaptureParams(`?capture=1&heure=${encodeURIComponent(raw)}`).hour).toBeNull();
    },
  );

  it('sans heure= : null', () => {
    expect(parseCaptureParams('?capture=1&camera=top').hour).toBeNull();
  });
});
