import { environmentById, isEnvironmentId, type EnvironmentId } from '../../sim/environment';
import { journalDay } from '../../sim/journal';

/**
 * Album photo du bac (#860) : règles pures de l'album (plafond, ajout, suppression, légende)
 * et lecture / écriture tolérantes dans le stockage du navigateur, injecté. Les photos sont des
 * images PNG (URL `data:`) à la résolution de la scène, mémorisées à part de la sauvegarde du
 * monde : l'album appartient au navigateur, pas au bac partagé.
 */

/** Nombre maximal de photos gardées dans l'album. */
export const ALBUM_CAPACITY = 12;

/** Clé de l'album dans le stockage du navigateur. */
export const ALBUM_STORAGE_KEY = 'aqfish.album.v1';

/** Préfixe obligatoire de l'image d'une photo (PNG encodé par le canvas). */
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

/** Une photo de l'album. */
export interface AlbumPhoto {
  /** Identifiant unique dans l'album (cible des boutons et des tests). */
  readonly id: string;
  /** Image PNG à la résolution de la scène (URL `data:`). */
  readonly dataUrl: string;
  /** Temps simulé du monde à la prise de vue, en secondes (≥ 0). */
  readonly time: number;
  /** Heure de la journée affichée à la prise de vue, dans [0, 24). */
  readonly hour: number;
  /** Environnement du bac photographié. */
  readonly environment: EnvironmentId;
}

/** Résultat d'un ajout : l'album complété, ou le refus d'un album plein. */
export type AlbumAddResult =
  | { readonly ok: true; readonly photos: readonly AlbumPhoto[] }
  | { readonly ok: false; readonly error: 'plein' };

/** Sous-ensemble de `Storage` utilisé ici (remplaçable par un double dans les tests). */
export interface AlbumStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Ajoute `photo` en tête de l'album (la plus récente d'abord). Un album qui a déjà
 * `capacity` photos refuse l'ajout plutôt que d'effacer une photo sans le dire.
 */
export function addAlbumPhoto(
  photos: readonly AlbumPhoto[],
  photo: AlbumPhoto,
  capacity = ALBUM_CAPACITY,
): AlbumAddResult {
  if (photos.length >= capacity) {
    return { ok: false, error: 'plein' };
  }
  return { ok: true, photos: [photo, ...photos] };
}

/** Album sans la photo `id` (inchangé si elle n'y est pas). */
export function removeAlbumPhoto(photos: readonly AlbumPhoto[], id: string): readonly AlbumPhoto[] {
  return photos.filter((photo) => photo.id !== id);
}

/**
 * Date de jeu d'une photo : « Jour N, H h MM » (jour du journal, #581, et heure de la
 * journée). Une heure hors de [0, 24) ou non finie s'écrit « Jour N ».
 */
export function albumDate(photo: Pick<AlbumPhoto, 'time' | 'hour'>): string {
  const day = `Jour ${journalDay(photo.time)}`;
  if (!Number.isFinite(photo.hour) || photo.hour < 0 || photo.hour >= 24) {
    return day;
  }
  const totalMinutes = Math.floor(photo.hour * 60);
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${day}, ${Math.floor(totalMinutes / 60)} h ${minutes}`;
}

/** Légende complète d'une photo : date de jeu et nom de l'environnement. */
export function albumCaption(photo: AlbumPhoto): string {
  return `${albumDate(photo)} · ${environmentById(photo.environment).name}`;
}

/** Vrai si `value` a la forme d'une photo valide de l'album. */
function isAlbumPhoto(value: unknown): value is AlbumPhoto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const photo = value as Record<string, unknown>; // lu champ par champ ci-dessous
  return (
    typeof photo['id'] === 'string' &&
    photo['id'] !== '' &&
    typeof photo['dataUrl'] === 'string' &&
    photo['dataUrl'].startsWith(PNG_DATA_URL_PREFIX) &&
    typeof photo['time'] === 'number' &&
    Number.isFinite(photo['time']) &&
    photo['time'] >= 0 &&
    typeof photo['hour'] === 'number' &&
    Number.isFinite(photo['hour']) &&
    typeof photo['environment'] === 'string' &&
    isEnvironmentId(photo['environment'])
  );
}

/**
 * Album relu d'un texte JSON : les photos valides, sans doublon d'identifiant, au plus
 * `ALBUM_CAPACITY`. Texte absent, illisible ou d'une autre forme : album vide. Ne lève jamais.
 */
export function parseAlbum(text: string | null): readonly AlbumPhoto[] {
  if (text === null) {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) {
    return [];
  }
  const seen = new Set<string>();
  const photos: AlbumPhoto[] = [];
  for (const value of data) {
    if (isAlbumPhoto(value) && !seen.has(value.id) && photos.length < ALBUM_CAPACITY) {
      seen.add(value.id);
      photos.push(value);
    }
  }
  return photos;
}

/** Album mémorisé, vide si le stockage manque, lève ou contient autre chose. */
export function readStoredAlbum(storage: AlbumStorage | null): readonly AlbumPhoto[] {
  if (!storage) {
    return [];
  }
  try {
    return parseAlbum(storage.getItem(ALBUM_STORAGE_KEY));
  } catch {
    return [];
  }
}

/**
 * Mémorise l'album. Renvoie `false` si le stockage manque ou refuse l'écriture (quota
 * dépassé, navigation privée) : l'album reste alors celui de la session.
 */
export function writeStoredAlbum(
  storage: AlbumStorage | null,
  photos: readonly AlbumPhoto[],
): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(ALBUM_STORAGE_KEY, JSON.stringify(photos));
    return true;
  } catch {
    return false;
  }
}
