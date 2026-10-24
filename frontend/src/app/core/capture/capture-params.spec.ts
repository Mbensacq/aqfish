import {
  MAX_CAPTURE_FURNITURE,
  CAMERA_PRESETS,
  hasWorldParams,
  DEFAULT_CAPTURE_PARAMS,
  MAX_CAPTURE_FEEDINGS,
  MAX_CAPTURE_POPULATION_ENTRIES,
  MAX_CAPTURE_TIME_SECONDS,
  MAX_CAPTURE_WOODS,
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
      foodStyle: null,
      rain: false,
      room: false,
      editSelection: null,
      woods: [],
      tank: null,
      furniture: [],
    });
  });

  it('lit les éléments de la pièce : meubles=type:x:z:quart (#188)', () => {
    expect(
      parseCaptureParams('?capture=1&meubles=etagere:-1.25:-0.17:0,plante-pot:-1.4:-0.17:3')
        .furniture,
    ).toEqual([
      { kind: 'etagere', x: -1.25, z: -0.17, quarter: 0 },
      { kind: 'plante-pot', x: -1.4, z: -0.17, quarter: 3 },
    ]);
    // Entrées mal formées ignorées ; type inconnu gardé (vérifié par l'application).
    expect(
      parseCaptureParams(
        '?meubles=etagere:1:2,etagere:a:0:0,etagere:0:0:4,ETAGERE:0:0:0,:0:0:0,lit:0.5:-1:1',
      ).furniture,
    ).toEqual([{ kind: 'lit', x: 0.5, z: -1, quarter: 1 }]);
    const many = Array.from({ length: MAX_CAPTURE_FURNITURE + 3 }, () => 'canape:0:0:0');
    expect(parseCaptureParams(`?meubles=${many.join(',')}`).furniture).toHaveLength(
      MAX_CAPTURE_FURNITURE,
    );
    expect(parseCaptureParams('').furniture).toEqual([]);
  });

  it('lit les bois flottés ajoutés : bois=x:z:rotation:echelle:graine (#169)', () => {
    expect(parseCaptureParams('?capture=1&bois=0.05:-0.02:0.3:1.5:7').woods).toEqual([
      { x: 0.05, z: -0.02, rotation: 0.3, scale: 1.5, seed: 7 },
    ]);
    expect(parseCaptureParams('?bois=0:0:0:1:1,0.2:0.1:1:2:4294967295').woods).toEqual([
      { x: 0, z: 0, rotation: 0, scale: 1, seed: 1 },
      { x: 0.2, z: 0.1, rotation: 1, scale: 2, seed: 4294967295 },
    ]);
    expect(parseCaptureParams('').woods).toEqual([]);
    expect(DEFAULT_CAPTURE_PARAMS.woods).toEqual([]);
  });

  it('bac= (#171) : trois réels positifs longueur:hauteur:profondeur, sinon null', () => {
    expect(parseCaptureParams('?bac=0.8:0.45:0.35').tank).toEqual({
      width: 0.8,
      height: 0.45,
      depth: 0.35,
    });
    expect(parseCaptureParams('?bac=2:1:1').tank).toEqual({ width: 2, height: 1, depth: 1 });
    for (const bad of ['', '0.8:0.45', '0.8:0.45:0.35:1', '-0.8:0.45:0.35', 'a:b:c', '1e3:1:1']) {
      expect(parseCaptureParams(`?bac=${bad}`).tank).toBeNull();
    }
    expect(DEFAULT_CAPTURE_PARAMS.tank).toBeNull();
    // Entrées mal formées ignorées, les autres gardées.
    for (const bad of [
      '',
      '0:0:0:1',
      '0:0:0:1:1:1',
      'a:0:0:1:1',
      '0:0:0:1:1.5',
      '0:0:0:1:-1',
      '0:0:0:1e1:1',
    ]) {
      expect(parseCaptureParams(`?bois=${encodeURIComponent(`${bad},0:0:0:1:3`)}`).woods).toEqual([
        { x: 0, z: 0, rotation: 0, scale: 1, seed: 3 },
      ]);
    }
    // Au plus MAX_CAPTURE_WOODS bois.
    const many = Array.from({ length: MAX_CAPTURE_WOODS + 2 }, (_, n) => `0:0:0:1:${n}`).join(',');
    expect(parseCaptureParams(`?bois=${many}`).woods).toHaveLength(MAX_CAPTURE_WOODS);
  });

  it('lit l’élément sélectionné en édition : edition=<indice> (#167)', () => {
    expect(parseCaptureParams('?capture=1&edition=2').editSelection).toBe(2);
    expect(parseCaptureParams('?edition=0').editSelection).toBe(0);
    expect(parseCaptureParams('?edition=999').editSelection).toBe(999);
    expect(parseCaptureParams('').editSelection).toBeNull();
    for (const bad of ['', '-1', '1.5', '1000', 'a', ' 2', '0x2']) {
      expect(parseCaptureParams(`?edition=${encodeURIComponent(bad)}`).editSelection).toBeNull();
    }
  });

  it('lit la pluie : pluie=1 seulement, sinon pas de pluie (#106)', () => {
    expect(parseCaptureParams('?pluie=1').rain).toBe(true);
    expect(parseCaptureParams('?capture=1&environnement=bassin&pluie=1').rain).toBe(true);
    for (const bad of ['', '0', 'oui', 'true', '1 ', '01', '2']) {
      expect(parseCaptureParams(`?pluie=${encodeURIComponent(bad)}`).rain).toBe(false);
    }
    expect(parseCaptureParams('?capture=1').rain).toBe(false);
    expect(DEFAULT_CAPTURE_PARAMS.rain).toBe(false);
  });

  it('lit la pièce : piece=1 seulement, sinon pièce masquée (#187)', () => {
    expect(parseCaptureParams('?capture=1&piece=1').room).toBe(true);
    for (const bad of ['', '0', 'oui', 'true', '1 ', '01', '2']) {
      expect(parseCaptureParams(`?capture=1&piece=${encodeURIComponent(bad)}`).room).toBe(false);
    }
    expect(parseCaptureParams('?capture=1').room).toBe(false);
    expect(DEFAULT_CAPTURE_PARAMS.room).toBe(false);
  });

  it('lit le rendu des granulés : points ou voxels, sinon null (#117)', () => {
    expect(parseCaptureParams('?granules=voxels').foodStyle).toBe('voxels');
    expect(parseCaptureParams('?granules=points').foodStyle).toBe('points');
    for (const bad of ['', 'Voxels', 'cubes', 'voxels ']) {
      expect(parseCaptureParams(`?granules=${encodeURIComponent(bad)}`).foodStyle).toBeNull();
    }
    expect(parseCaptureParams('?capture=1').foodStyle).toBeNull();
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
