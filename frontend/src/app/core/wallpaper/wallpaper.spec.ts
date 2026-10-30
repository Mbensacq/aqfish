import {
  chooseWallpaperConfig,
  clampWallpaperFps,
  DEFAULT_WALLPAPER_FPS,
  frameDue,
  type FrameLimiter,
  parseWallpaperFps,
  readWallpaperGlobal,
  wallpaperGlobalText,
  wallpaperOrbitAngle,
  WALLPAPER_ORBIT_AMPLITUDE,
  WALLPAPER_ORBIT_PERIOD_SECONDS,
} from './wallpaper';

describe('Fond d’écran (#279)', () => {
  describe('parseWallpaperFps', () => {
    it('lit un entier et le borne à [15, 60]', () => {
      expect(parseWallpaperFps('30')).toBe(30);
      expect(parseWallpaperFps('15')).toBe(15);
      expect(parseWallpaperFps('60')).toBe(60);
      expect(parseWallpaperFps('0')).toBe(15);
      expect(parseWallpaperFps('5')).toBe(15);
      expect(parseWallpaperFps('144')).toBe(60);
      expect(parseWallpaperFps('999')).toBe(60);
    });

    it('ignore une valeur absente ou mal formée', () => {
      for (const raw of [null, '', '30.5', '-30', ' 30', '1e2', 'abc', '1000']) {
        expect(parseWallpaperFps(raw)).toBeNull();
      }
    });
  });

  it('clampWallpaperFps : arrondi, bornes, non fini → défaut', () => {
    expect(clampWallpaperFps(24.4)).toBe(24);
    expect(clampWallpaperFps(-1)).toBe(15);
    expect(clampWallpaperFps(1e9)).toBe(60);
    expect(clampWallpaperFps(Number.NaN)).toBe(DEFAULT_WALLPAPER_FPS);
    expect(clampWallpaperFps(Number.POSITIVE_INFINITY)).toBe(DEFAULT_WALLPAPER_FPS);
  });

  describe('readWallpaperGlobal', () => {
    it('absent : null', () => {
      expect(readWallpaperGlobal(null)).toBeNull();
      expect(readWallpaperGlobal(undefined)).toBeNull();
      expect(readWallpaperGlobal({})).toBeNull();
      expect(readWallpaperGlobal({ aqfishFond: null })).toBeNull();
    });

    it('présent : configuration et images par seconde', () => {
      expect(readWallpaperGlobal({ aqfishFond: { config: { a: 1 }, fps: 24 } })).toEqual({
        config: { a: 1 },
        fps: 24,
      });
      expect(readWallpaperGlobal({ aqfishFond: {} })).toEqual({ config: null, fps: null });
      expect(readWallpaperGlobal({ aqfishFond: { fps: '24' } })).toEqual({
        config: null,
        fps: null,
      });
      expect(readWallpaperGlobal({ aqfishFond: true })).toEqual({ config: null, fps: null });
    });

    it('un accès qui lève : null', () => {
      const win = Object.defineProperty({}, 'aqfishFond', {
        get() {
          throw new Error('refusé');
        },
      });
      expect(readWallpaperGlobal(win)).toBeNull();
    });
  });

  it('wallpaperGlobalText : texte tel quel, objet sérialisé, absent ou circulaire → null', () => {
    expect(wallpaperGlobalText(null)).toBeNull();
    expect(wallpaperGlobalText({ config: null, fps: null })).toBeNull();
    expect(wallpaperGlobalText({ config: '{"x":1}', fps: null })).toBe('{"x":1}');
    expect(wallpaperGlobalText({ config: { x: 1 }, fps: null })).toBe('{"x":1}');
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(wallpaperGlobalText({ config: circular, fps: null })).toBeNull();
  });

  describe('chooseWallpaperConfig', () => {
    const parse = (text: string) =>
      text.startsWith('ok:')
        ? ({ ok: true, value: text.slice(3) } as const)
        : ({ ok: false, error: 'illisible' } as const);

    it('prend le fichier en premier', () => {
      const choice = chooseWallpaperConfig(
        [
          { source: 'fichier', text: 'ok:fichier' },
          { source: 'script', text: 'ok:script' },
          { source: 'sauvegarde', text: 'ok:sauvegarde' },
        ],
        parse,
      );
      expect(choice).toEqual({ source: 'fichier', value: 'fichier', rejected: [] });
    });

    it('fichier absent : le script, puis la sauvegarde locale', () => {
      expect(
        chooseWallpaperConfig(
          [
            { source: 'fichier', text: null },
            { source: 'script', text: 'ok:script' },
            { source: 'sauvegarde', text: 'ok:sauvegarde' },
          ],
          parse,
        ).source,
      ).toBe('script');
      expect(
        chooseWallpaperConfig(
          [
            { source: 'fichier', text: null },
            { source: 'script', text: null },
            { source: 'sauvegarde', text: 'ok:sauvegarde' },
          ],
          parse,
        ).source,
      ).toBe('sauvegarde');
    });

    it('fichier invalide : ignoré avec sa raison, repli sur la suite', () => {
      const choice = chooseWallpaperConfig(
        [
          { source: 'fichier', text: '<html>404</html>' },
          { source: 'sauvegarde', text: 'ok:sauvegarde' },
        ],
        parse,
      );
      expect(choice).toEqual({
        source: 'sauvegarde',
        value: 'sauvegarde',
        rejected: ['fichier : illisible'],
      });
    });

    it('rien d’utilisable : scène par défaut', () => {
      expect(chooseWallpaperConfig([], parse)).toEqual({
        source: 'defaut',
        value: null,
        rejected: [],
      });
      const choice = chooseWallpaperConfig(
        [
          { source: 'fichier', text: 'faux' },
          { source: 'script', text: null },
          { source: 'sauvegarde', text: '' },
        ],
        parse,
      );
      expect(choice.source).toBe('defaut');
      expect(choice.rejected).toEqual(['fichier : illisible', 'sauvegarde : illisible']);
    });
  });

  describe('frameDue', () => {
    /** Nombre d'images rendues sur `seconds` secondes d'un écran à `hz` hertz. */
    function rendered(hz: number, fps: number, seconds: number): number {
      const limiter: FrameLimiter = { next: null };
      let count = 0;
      const frames = Math.round(hz * seconds);
      for (let i = 0; i < frames; i++) {
        if (frameDue(limiter, (i * 1000) / hz, fps)) {
          count++;
        }
      }
      return count;
    }

    it('tient la cadence demandée sur des écrans de fréquences diverses', () => {
      expect(rendered(60, 30, 10)).toBe(300);
      expect(rendered(60, 60, 10)).toBe(600);
      expect(Math.abs(rendered(144, 60, 10) - 600)).toBeLessThanOrEqual(10);
      expect(Math.abs(rendered(144, 30, 10) - 300)).toBeLessThanOrEqual(5);
      expect(Math.abs(rendered(75, 24, 10) - 240)).toBeLessThanOrEqual(5);
    });

    it('jamais plus d’images que l’écran n’en propose', () => {
      expect(rendered(30, 60, 10)).toBe(300);
    });

    it('fps hors bornes : borné (0 → 15, 1000 → 60)', () => {
      expect(rendered(60, 0, 10)).toBe(150);
      expect(rendered(120, 1000, 10)).toBe(600);
    });

    it('après une longue pause, repart de l’instant courant sans rafale', () => {
      const limiter: FrameLimiter = { next: null };
      expect(frameDue(limiter, 0, 30)).toBe(true);
      expect(frameDue(limiter, 60_000, 30)).toBe(true);
      expect(frameDue(limiter, 60_016, 30)).toBe(false);
      expect(frameDue(limiter, 60_034, 30)).toBe(true);
    });
  });

  describe('wallpaperOrbitAngle', () => {
    it('part de la vue trois-quarts et balance lentement, sans fin', () => {
      expect(wallpaperOrbitAngle(0)).toBe(0);
      expect(wallpaperOrbitAngle(WALLPAPER_ORBIT_PERIOD_SECONDS / 4)).toBeCloseTo(
        WALLPAPER_ORBIT_AMPLITUDE,
        12,
      );
      expect(wallpaperOrbitAngle((3 * WALLPAPER_ORBIT_PERIOD_SECONDS) / 4)).toBeCloseTo(
        -WALLPAPER_ORBIT_AMPLITUDE,
        12,
      );
      // Périodique, même après des heures.
      expect(wallpaperOrbitAngle(10 * 3600 + 7)).toBeCloseTo(wallpaperOrbitAngle(7), 9);
      expect(wallpaperOrbitAngle(10)).not.toBe(wallpaperOrbitAngle(20));
    });

    it('borné et lent : au plus 0,05 rad par seconde', () => {
      let previous = wallpaperOrbitAngle(0);
      for (let t = 0.5; t <= 200; t += 0.5) {
        const angle = wallpaperOrbitAngle(t);
        expect(Math.abs(angle)).toBeLessThanOrEqual(WALLPAPER_ORBIT_AMPLITUDE);
        expect(Math.abs(angle - previous)).toBeLessThanOrEqual(0.025);
        previous = angle;
      }
    });

    it('temps négatif ou non fini : 0', () => {
      expect(wallpaperOrbitAngle(-5)).toBe(0);
      expect(wallpaperOrbitAngle(Number.NaN)).toBe(0);
      expect(wallpaperOrbitAngle(Number.POSITIVE_INFINITY)).toBe(0);
    });
  });
});
