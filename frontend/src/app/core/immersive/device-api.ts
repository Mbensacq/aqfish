/**
 * Accès protégés aux API d'appareil du mode immersif (#346, ADR 0087) : orientation, plein
 * écran, verrou d'éveil de l'écran (Wake Lock) et limite d'images par seconde.
 *
 * Chaque API peut manquer (ordinateur, navigateur ancien, contexte non sécurisé) ou lever
 * une exception (refus, absence de geste de l'utilisateur, page masquée) : aucune fonction
 * de ce module ne lève ni ne rejette, l'échec se traduit par `false` ou `null`. Les
 * paramètres sont des sous-ensembles structurels des objets du navigateur, remplaçables dans
 * les tests.
 */

/** Disponibilité de l'orientation de l'appareil. */
export type OrientationSupport = 'unavailable' | 'needs-permission' | 'available';

/** Sous-ensemble de `DeviceOrientationEvent` (constructeur), avec l'autorisation optionnelle. */
export interface OrientationEventConstructor {
  requestPermission?: () => Promise<string>;
}

/** Sous-ensemble de `window` utile ici. */
export interface DeviceWindow {
  readonly DeviceOrientationEvent?: OrientationEventConstructor;
}

/**
 * Orientation absente, à autoriser (`DeviceOrientationEvent.requestPermission`, exigée par
 * Safari sur iOS et iPadOS), ou disponible sans autorisation.
 */
export function orientationSupport(win: DeviceWindow | null | undefined): OrientationSupport {
  try {
    const ctor: unknown = win?.DeviceOrientationEvent;
    if (typeof ctor !== 'function') {
      return 'unavailable';
    }
    const { requestPermission } = ctor as OrientationEventConstructor;
    return typeof requestPermission === 'function' ? 'needs-permission' : 'available';
  } catch {
    return 'unavailable';
  }
}

/**
 * Demande l'autorisation d'orientation ; à appeler pendant un geste de l'utilisateur.
 * Vrai si l'orientation est utilisable (accordée, ou disponible sans autorisation).
 */
export async function requestOrientationPermission(
  win: DeviceWindow | null | undefined,
): Promise<boolean> {
  const support = orientationSupport(win);
  if (support !== 'needs-permission') {
    return support === 'available';
  }
  try {
    return (await win!.DeviceOrientationEvent!.requestPermission!()) === 'granted';
  } catch {
    return false;
  }
}

/** Sous-ensemble d'un élément pouvant passer en plein écran. */
export interface FullscreenElement {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => void;
}

/** Sous-ensemble de `document` pour le plein écran. */
export interface FullscreenDocument {
  readonly fullscreenElement?: unknown;
  exitFullscreen?: () => Promise<void>;
}

/** Demande le plein écran pour `element` ; faux si l'API manque ou refuse. */
export async function enterFullscreen(element: FullscreenElement | null): Promise<boolean> {
  try {
    if (typeof element?.requestFullscreen === 'function') {
      await element.requestFullscreen();
      return true;
    }
    if (typeof element?.webkitRequestFullscreen === 'function') {
      element.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // Refus (pas de geste, iframe sans autorisation…) : on reste en fenêtre.
  }
  return false;
}

/** Quitte le plein écran s'il est actif ; sans effet sinon. */
export async function leaveFullscreen(doc: FullscreenDocument | null): Promise<void> {
  try {
    if (doc?.fullscreenElement && typeof doc.exitFullscreen === 'function') {
      await doc.exitFullscreen();
    }
  } catch {
    // Déjà sorti : rien à faire.
  }
}

/** Sous-ensemble de `WakeLockSentinel`. */
export interface WakeLockHandle {
  readonly released?: boolean;
  release(): Promise<void>;
}

/** Sous-ensemble de `navigator` pour le Wake Lock. */
export interface WakeLockNavigator {
  readonly wakeLock?: { request(type: 'screen'): Promise<WakeLockHandle> };
}

/**
 * Verrou d'éveil de l'écran : le navigateur le libère quand la page est masquée, il faut
 * donc le redemander quand elle redevient visible (`acquire` à chaque retour).
 */
export class WakeLockGuard {
  private handle: WakeLockHandle | null = null;
  private wanted = false;
  private pending = false;

  constructor(private readonly nav: WakeLockNavigator | null | undefined) {}

  /** Vrai si le verrou est tenu. */
  get held(): boolean {
    return this.handle !== null && this.handle.released !== true;
  }

  /** Demande le verrou (une seule demande à la fois) ; faux si l'API manque ou refuse. */
  async acquire(): Promise<boolean> {
    this.wanted = true;
    if (this.held) {
      return true;
    }
    if (this.pending) {
      return false;
    }
    let wakeLock: WakeLockNavigator['wakeLock'];
    try {
      wakeLock = this.nav?.wakeLock;
    } catch {
      return false;
    }
    if (typeof wakeLock?.request !== 'function') {
      return false;
    }
    this.pending = true;
    try {
      const handle = await wakeLock.request('screen');
      if (!this.wanted) {
        // Relâché pendant la demande : ne pas garder l'écran allumé.
        await handle.release().catch(() => undefined);
        return false;
      }
      this.handle = handle;
      return true;
    } catch {
      return false;
    } finally {
      this.pending = false;
    }
  }

  /** Relâche le verrou (sortie du mode) ; sans effet s'il n'est pas tenu. */
  async release(): Promise<void> {
    this.wanted = false;
    const handle = this.handle;
    this.handle = null;
    if (handle !== null) {
      await handle.release().catch(() => undefined);
    }
  }
}

/**
 * Limite d'images par seconde : `shouldRender(time)` dit si l'image de `requestAnimationFrame`
 * à l'instant `time` (ms) doit être rendue. Une marge d'un quart d'intervalle absorbe la gigue
 * des rappels (60 Hz limité à 30 : une image sur deux, pas une sur trois).
 */
export class FrameLimiter {
  private last: number | null = null;
  private readonly interval: number;

  constructor(maxFps: number) {
    this.interval = Number.isFinite(maxFps) && maxFps > 0 ? 1000 / maxFps : 0;
  }

  shouldRender(time: number): boolean {
    if (!Number.isFinite(time)) {
      return false;
    }
    if (this.last === null || time < this.last || time - this.last >= this.interval * 0.75) {
      this.last = time;
      return true;
    }
    return false;
  }

  /** Oublie la dernière image (retour de page masquée : la suivante est rendue). */
  reset(): void {
    this.last = null;
  }
}
