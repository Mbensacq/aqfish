import {
  DEFAULT_CALIBRATION,
  parseCalibration,
  serializeCalibration,
  type ScreenCalibration,
} from './screen-calibration';

/**
 * Étalonnage de l'écran conservé localement (#345, ADR 0086), à part de la sauvegarde du
 * monde (schéma inchangé), comme `aqfish.filtre` et `aqfish.camera-libre`.
 *
 * Le stockage (en pratique `localStorage`) peut être absent ou lever une exception (navigation
 * privée, quota) : chaque accès est protégé, et la dernière valeur reste en mémoire pour la
 * session (repli).
 */

/** Clé de l'étalonnage dans le stockage du navigateur. */
export const CALIBRATION_STORAGE_KEY = 'aqfish.etalonnage-ecran';

/** Accès minimal au stockage (sous-ensemble de `Storage`). */
export interface CalibrationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Étalonnage mémorisé, relu une fois du stockage puis gardé en mémoire. */
export class CalibrationStore {
  private current: ScreenCalibration;

  constructor(private readonly storage: CalibrationStorage | null) {
    this.current = readStored(storage) ?? DEFAULT_CALIBRATION;
  }

  /** Étalonnage courant (mesuré, ou estimé par défaut). */
  get calibration(): ScreenCalibration {
    return this.current;
  }

  /**
   * Retient l'étalonnage mesuré `calibration` en mémoire et tente de l'écrire. Renvoie vrai si
   * l'écriture a réussi (faux : gardé en mémoire pour la session seulement).
   */
  save(calibration: ScreenCalibration): boolean {
    this.current = { pxPerMm: calibration.pxPerMm, estimated: false };
    if (this.storage === null) {
      return false;
    }
    try {
      this.storage.setItem(CALIBRATION_STORAGE_KEY, serializeCalibration(this.current));
      return true;
    } catch {
      return false;
    }
  }

  /** Oublie l'étalonnage (retour à l'estimation par défaut). Renvoie vrai si effacé du stockage. */
  reset(): boolean {
    this.current = DEFAULT_CALIBRATION;
    if (this.storage === null) {
      return false;
    }
    try {
      this.storage.removeItem(CALIBRATION_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }
}

function readStored(storage: CalibrationStorage | null): ScreenCalibration | null {
  if (storage === null) {
    return null;
  }
  try {
    return parseCalibration(storage.getItem(CALIBRATION_STORAGE_KEY));
  } catch {
    return null;
  }
}
