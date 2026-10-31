import {
  FrameLimiter,
  WakeLockGuard,
  enterFullscreen,
  leaveFullscreen,
  orientationSupport,
  requestOrientationPermission,
  type DeviceWindow,
  type WakeLockHandle,
  type WakeLockNavigator,
} from './device-api';

/** Constructeur factice de `DeviceOrientationEvent`, avec autorisation optionnelle. */
function orientationWindow(permission?: () => Promise<string>): DeviceWindow {
  const ctor = function DeviceOrientationEvent() {
    /* factice */
  } as unknown as { requestPermission?: () => Promise<string> };
  if (permission) {
    ctor.requestPermission = permission;
  }
  return { DeviceOrientationEvent: ctor };
}

describe('API d’appareil du mode immersif (#346)', () => {
  describe('orientation', () => {
    it('absente (ordinateur ancien, pas de fenêtre) : indisponible, repli sans parallaxe', async () => {
      expect(orientationSupport(null)).toBe('unavailable');
      expect(orientationSupport(undefined)).toBe('unavailable');
      expect(orientationSupport({})).toBe('unavailable');
      expect(await requestOrientationPermission({})).toBe(false);
      expect(await requestOrientationPermission(null)).toBe(false);
    });

    it('accès qui lève : indisponible', () => {
      const win = {
        get DeviceOrientationEvent(): never {
          throw new Error('refusé');
        },
      } as DeviceWindow;
      expect(orientationSupport(win)).toBe('unavailable');
    });

    it('sans autorisation exigée (Android, Chromium) : disponible', async () => {
      const win = orientationWindow();
      expect(orientationSupport(win)).toBe('available');
      expect(await requestOrientationPermission(win)).toBe(true);
    });

    it('autorisation exigée (Safari iOS) : accordée, refusée, ou rejetée', async () => {
      expect(orientationSupport(orientationWindow(async () => 'granted'))).toBe('needs-permission');
      expect(await requestOrientationPermission(orientationWindow(async () => 'granted'))).toBe(
        true,
      );
      expect(await requestOrientationPermission(orientationWindow(async () => 'denied'))).toBe(
        false,
      );
      expect(
        await requestOrientationPermission(
          orientationWindow(() => Promise.reject(new Error('NotAllowedError'))),
        ),
      ).toBe(false);
      expect(
        await requestOrientationPermission(
          orientationWindow(() => {
            throw new Error('synchrone');
          }),
        ),
      ).toBe(false);
    });
  });

  describe('plein écran', () => {
    it('API absente : faux, sans exception', async () => {
      expect(await enterFullscreen(null)).toBe(false);
      expect(await enterFullscreen({})).toBe(false);
      await expect(leaveFullscreen(null)).resolves.toBeUndefined();
      await expect(leaveFullscreen({})).resolves.toBeUndefined();
    });

    it('accordé, refusé, ou préfixé (WebKit)', async () => {
      expect(await enterFullscreen({ requestFullscreen: async () => undefined })).toBe(true);
      expect(
        await enterFullscreen({ requestFullscreen: () => Promise.reject(new TypeError('geste')) }),
      ).toBe(false);
      let webkit = 0;
      expect(await enterFullscreen({ webkitRequestFullscreen: () => void webkit++ })).toBe(true);
      expect(webkit).toBe(1);
    });

    it('sortie seulement si le plein écran est actif ; un rejet est absorbé', async () => {
      let exits = 0;
      await leaveFullscreen({ fullscreenElement: null, exitFullscreen: async () => void exits++ });
      expect(exits).toBe(0);
      await leaveFullscreen({ fullscreenElement: {}, exitFullscreen: async () => void exits++ });
      expect(exits).toBe(1);
      await expect(
        leaveFullscreen({
          fullscreenElement: {},
          exitFullscreen: () => Promise.reject(new Error()),
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('verrou d’éveil (Wake Lock)', () => {
    function lockNavigator(): {
      nav: WakeLockNavigator;
      requests: number;
      handles: (WakeLockHandle & { released: boolean })[];
    } {
      const box = {
        requests: 0,
        handles: [] as (WakeLockHandle & { released: boolean })[],
        nav: null as unknown as WakeLockNavigator,
      };
      box.nav = {
        wakeLock: {
          request: async () => {
            box.requests++;
            const handle = {
              released: false,
              release: async () => void (handle.released = true),
            };
            box.handles.push(handle);
            return handle;
          },
        },
      };
      return box;
    }

    it('API absente ou qui lève : faux, sans exception', async () => {
      expect(await new WakeLockGuard(undefined).acquire()).toBe(false);
      expect(await new WakeLockGuard({}).acquire()).toBe(false);
      const throwing = {
        get wakeLock(): never {
          throw new Error('contexte non sécurisé');
        },
      } as WakeLockNavigator;
      expect(await new WakeLockGuard(throwing).acquire()).toBe(false);
      const rejecting: WakeLockNavigator = {
        wakeLock: { request: () => Promise.reject(new Error('NotAllowedError')) },
      };
      const guard = new WakeLockGuard(rejecting);
      expect(await guard.acquire()).toBe(false);
      expect(guard.held).toBe(false);
      await expect(guard.release()).resolves.toBeUndefined();
    });

    it('tenu puis relâché ; redemandé après une libération par le navigateur', async () => {
      const box = lockNavigator();
      const guard = new WakeLockGuard(box.nav);
      expect(await guard.acquire()).toBe(true);
      expect(guard.held).toBe(true);
      // Déjà tenu : pas de seconde demande.
      expect(await guard.acquire()).toBe(true);
      expect(box.requests).toBe(1);
      // Page masquée : le navigateur relâche le verrou ; au retour, nouvelle demande.
      box.handles[0].released = true;
      expect(guard.held).toBe(false);
      expect(await guard.acquire()).toBe(true);
      expect(box.requests).toBe(2);
      await guard.release();
      expect(guard.held).toBe(false);
      expect(box.handles[1].released).toBe(true);
    });

    it('relâché pendant la demande : le verrou obtenu est rendu aussitôt', async () => {
      const box = lockNavigator();
      const guard = new WakeLockGuard(box.nav);
      const pending = guard.acquire();
      // Une seconde demande simultanée ne double pas la requête.
      const second = guard.acquire();
      await guard.release();
      expect(await second).toBe(false);
      expect(await pending).toBe(false);
      expect(box.requests).toBe(1);
      expect(box.handles[0].released).toBe(true);
      expect(guard.held).toBe(false);
    });
  });

  describe('limite d’images', () => {
    it('60 Hz limité à 30 : une image sur deux', () => {
      const limiter = new FrameLimiter(30);
      const rendered = [];
      for (let i = 0; i < 60; i++) {
        if (limiter.shouldRender(i * (1000 / 60))) {
          rendered.push(i);
        }
      }
      expect(rendered.length).toBe(30);
      expect(rendered.slice(0, 3)).toEqual([0, 2, 4]);
    });

    it('cadence inférieure à la limite : toutes les images', () => {
      const limiter = new FrameLimiter(30);
      let count = 0;
      for (let i = 0; i < 20; i++) {
        count += limiter.shouldRender(i * 50) ? 1 : 0;
      }
      expect(count).toBe(20);
    });

    it('temps non fini refusé, retour en arrière accepté, reset : image suivante rendue', () => {
      const limiter = new FrameLimiter(30);
      expect(limiter.shouldRender(NaN)).toBe(false);
      expect(limiter.shouldRender(1000)).toBe(true);
      expect(limiter.shouldRender(1010)).toBe(false);
      expect(limiter.shouldRender(10)).toBe(true);
      limiter.reset();
      expect(limiter.shouldRender(12)).toBe(true);
    });

    it('limite invalide : aucune limite', () => {
      const limiter = new FrameLimiter(0);
      expect(limiter.shouldRender(0)).toBe(true);
      expect(limiter.shouldRender(1)).toBe(true);
      expect(new FrameLimiter(NaN).shouldRender(0)).toBe(true);
    });
  });
});
