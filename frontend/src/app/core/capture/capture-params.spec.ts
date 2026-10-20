import {
  CAMERA_PRESETS,
  hasWorldParams,
  DEFAULT_CAPTURE_PARAMS,
  MAX_CAPTURE_FEEDINGS,
  MAX_CAPTURE_POPULATION_ENTRIES,
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
      cameraGiven: true,
      environment: null,
      time: 12.5,
      filter: null,
      hour: null,
      feedings: [],
      population: [],
    });
  });

  it('lit l’environnement : identifiant en minuscules, sinon null (#87)', () => {
    expect(parseCaptureParams('?environnement=bassin').environment).toBe('bassin');
    expect(parseCaptureParams('?environnement=recif').environment).toBe('recif');
    for (const bad of ['', 'Bassin', 'bassin2', 'bas sin', 'a'.repeat(21)]) {
      expect(parseCaptureParams(`?environnement=${encodeURIComponent(bad)}`).environment).toBe(
        null,
      );
    }
    expect(parseCaptureParams('').environment).toBe(null);
  });

  it('signale si camera= est donné et valide (sinon vue de l’environnement)', () => {
    expect(parseCaptureParams('?camera=top').cameraGiven).toBe(true);
    expect(parseCaptureParams('?camera=three-quarter').cameraGiven).toBe(true);
    expect(parseCaptureParams('?camera=diagonal').cameraGiven).toBe(false);
    expect(parseCaptureParams('').cameraGiven).toBe(false);
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

describe('nourrir= (issue #67)', () => {
  it('lit des dépôts « t » (centre du bac) et « t:x:z »', () => {
    expect(parseCaptureParams('?capture=1&nourrir=10,25.5:0.2:-0.05').feedings).toEqual([
      { time: 10, x: 0, z: 0 },
      { time: 25.5, x: 0.2, z: -0.05 },
    ]);
  });

  it('ignore les entrées invalides, garde les autres', () => {
    expect(
      parseCaptureParams('?nourrir=,abc,-1,5:1,5:1:2:3,1e3,7:0.1:x,99999,3:-0.1:0.1').feedings,
    ).toEqual([{ time: 3, x: -0.1, z: 0.1 }]);
  });

  it('absent ou vide : aucun dépôt ; au plus MAX_CAPTURE_FEEDINGS', () => {
    expect(parseCaptureParams('?capture=1').feedings).toEqual([]);
    expect(parseCaptureParams('?nourrir=').feedings).toEqual([]);
    const many = Array.from({ length: MAX_CAPTURE_FEEDINGS + 5 }, (_, i) => String(i)).join(',');
    expect(parseCaptureParams(`?nourrir=${many}`).feedings).toHaveLength(MAX_CAPTURE_FEEDINGS);
  });
});

describe('population= (issue #69)', () => {
  it('lit les effectifs dans l’ordre de l’URL', () => {
    expect(
      parseCaptureParams('?capture=1&population=neon:12,guppy:2,corydora:0').population,
    ).toEqual([
      { species: 'neon', count: 12 },
      { species: 'guppy', count: 2 },
      { species: 'corydora', count: 0 },
    ]);
  });

  it('ignore les entrées mal formées (espèce inconnue gardée : l’application la refuse)', () => {
    expect(
      parseCaptureParams(
        '?population=,neon,neon:,neon:-1,neon:1.5,neon:1e2,Neon:3,neon:3:4,guppy:1000,:4,koi:3,guppy:07',
      ).population,
    ).toEqual([
      { species: 'koi', count: 3 },
      { species: 'guppy', count: 7 },
    ]);
  });

  it('absent ou vide : aucun effectif', () => {
    expect(parseCaptureParams('?capture=1').population).toEqual([]);
    expect(parseCaptureParams('?population=').population).toEqual([]);
  });

  it(`au plus ${MAX_CAPTURE_POPULATION_ENTRIES} entrées`, () => {
    const many = Array.from({ length: 30 }, () => 'neon:1').join(',');
    expect(parseCaptureParams(`?population=${many}`).population).toHaveLength(
      MAX_CAPTURE_POPULATION_ENTRIES,
    );
  });
});

describe('hasWorldParams', () => {
  it.each([
    ['', false],
    ['?camera=top&filtre=aucun&heure=12', false],
    ['?seed=7', true],
    ['?environnement=bassin', true],
    ['?population=neon:3', true],
    ['?seed=abc', true],
  ])('%s → %s', (search, expected) => {
    expect(hasWorldParams(search)).toBe(expected);
  });
});
