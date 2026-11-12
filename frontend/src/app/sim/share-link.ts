import {
  compressionSupported,
  compressText,
  decompressText,
} from '../core/share-codec/share-codec';
import { roomAnimalCount, ROOM_ANIMAL_CAP } from './room-limits';
import { parseSaveWorlds } from './room-save';
import {
  isRecord,
  MAX_SAVE_LENGTH,
  own,
  SAVE_FORMAT,
  SAVE_SCHEMA_1,
  serializeWorld,
  type SaveSettings,
} from './save';
import type { World } from './world';

/**
 * Partage d'un bac par lien (issue #426, ADR 0105), sans serveur.
 *
 * Contenu : la sauvegarde au schéma 1 du **seul** bac affiché (`serializeWorld`, sans
 * `others`), avec les réglages. Relu par le validateur complet des sauvegardes
 * (`parseSaveWorlds` : schéma, bornes, espèces connues, effectifs), puis par le plafond
 * d'animaux de la pièce (#392).
 *
 * Fragment : `partage=<version>.<codage>.<données>`, où `version` vaut `1`, `codage` vaut `z`
 * (`deflate-raw`, `CompressionStream`) ou `j` (texte JSON brut, repli sans l'API), et
 * `données` est l'encodage base64url (RFC 4648 § 5, sans `=`) des octets. Le fragment n'est
 * jamais envoyé au serveur.
 *
 * Longueur : un lien de plus de `MAX_SHARE_LINK_LENGTH` caractères n'est pas proposé (repli
 * sur le fichier `.json`) ; un fragment plus long est refusé avant tout décodage. Rien ici ne
 * lève : un contenu invalide donne un message en français.
 */

/** Clé du fragment d'un lien partagé (`#partage=…`). */
export const SHARE_KEY = 'partage';

/** Version du format du fragment. */
export const SHARE_VERSION = 1;

/** Codage des données : `z` compressé (`deflate-raw`), `j` JSON brut. */
export type ShareCodec = 'z' | 'j';

/**
 * Longueur maximale d'un lien partagé, en caractères (adresse complète). 32 000 : sous les
 * limites des navigateurs courants (Chromium, Firefox, Safari acceptent bien davantage dans
 * le fragment) tout en restant collable dans une messagerie. Un bac par défaut tient en
 * quelques milliers de caractères (`share-link.spec.ts`).
 */
export const MAX_SHARE_LINK_LENGTH = 32_000;

/** Préfixe du fragment, sans `#`. */
const PREFIX = `${SHARE_KEY}=${SHARE_VERSION}.`;

/** Alphabet base64url. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const DATA_PATTERN = /^[A-Za-z0-9_-]*$/;

/** Encode des octets en base64url, sans remplissage. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]!;
  }
  return out;
}

/** Décode du base64url sans remplissage ; `null` si le texte n'en est pas. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (!DATA_PATTERN.test(text) || text.length % 4 === 1) {
    return null;
  }
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let j = 0;
  for (const char of text) {
    buffer = ((buffer << 6) | ALPHABET.indexOf(char)) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[j++] = (buffer >> bits) & 0xff;
    }
  }
  // Bits de remplissage non nuls : encodage non canonique, refusé.
  if ((buffer & ((1 << bits) - 1)) !== 0) {
    return null;
  }
  return bytes;
}

/** Fragment (sans `#`) pour des octets déjà codés. */
export function shareFragment(codec: ShareCodec, bytes: Uint8Array): string {
  return `${PREFIX}${codec}.${toBase64Url(bytes)}`;
}

/** Vrai si `hash` (avec ou sans `#`) porte un lien partagé, valide ou non. */
export function hasShareFragment(hash: string): boolean {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  return text.startsWith(`${SHARE_KEY}=`);
}

/** Fragment découpé : codage et octets, ou la raison du refus. */
export type SplitShareResult =
  | { readonly ok: true; readonly codec: ShareCodec; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly error: string };

/** Découpe et décode un fragment (avec ou sans `#`). Ne lève jamais. */
export function splitShareFragment(hash: string): SplitShareResult {
  if (typeof hash !== 'string') {
    return refusal('lien de partage illisible');
  }
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (text.length > MAX_SHARE_LINK_LENGTH) {
    return refusal(`lien trop long (${text.length} caractères, ${MAX_SHARE_LINK_LENGTH} au plus)`);
  }
  if (!text.startsWith(`${SHARE_KEY}=`)) {
    return refusal('ce lien ne contient pas d’aquarium partagé');
  }
  const parts = text.slice(SHARE_KEY.length + 1).split('.');
  // Version d'abord (#431) : un préfixe inconnu (`v1.…`, `9`, `2.z`) vient d'une autre version
  // de l'application, même si la suite n'a pas trois parties ; seul un fragment vide
  // (`partage=`) reste « tronqué ».
  const version = parts[0] as string;
  const empty = parts.length === 1 && version === '';
  if (!empty && version !== String(SHARE_VERSION)) {
    return refusal(
      `version de lien inconnue (${version.slice(0, 8) || 'vide'}, version ${SHARE_VERSION} attendue) : mettez l’application à jour`,
    );
  }
  if (parts.length !== 3) {
    return refusal('lien de partage tronqué ou mal formé');
  }
  const [, codec, data] = parts as [string, string, string];
  if (codec !== 'z' && codec !== 'j') {
    return refusal(`codage de lien inconnu (${codec.slice(0, 8) || 'vide'})`);
  }
  if (data.length === 0) {
    return refusal('lien de partage tronqué (aucune donnée)');
  }
  const bytes = fromBase64Url(data);
  if (bytes === null) {
    return refusal('lien de partage corrompu (caractères invalides)');
  }
  return { ok: true, codec, bytes };
}

/** Aquarium relu d'un lien : comme `parseSaveWorlds`, ou la raison du refus. */
export type ParseShareResult = ReturnType<typeof parseSaveWorlds>;

/**
 * Relit le texte JSON d'un lien : une sauvegarde au schéma 1 d'un seul bac (sans `others`),
 * validée en entier, puis bornée par le plafond d'animaux de la pièce. Ne lève jamais.
 */
export function parseSharedText(text: string): ParseShareResult {
  if (typeof text !== 'string' || text.length > MAX_SAVE_LENGTH) {
    return refusal(`contenu trop volumineux (${MAX_SAVE_LENGTH / 1024} Kio au plus)`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return refusal('lien corrompu (contenu JSON invalide)');
  }
  if (!isRecord(value) || own(value, 'format') !== SAVE_FORMAT) {
    return refusal('ce lien ne contient pas d’aquarium aqfish');
  }
  if (own(value, 'schema') !== SAVE_SCHEMA_1) {
    return refusal(
      `version de contenu inconnue (version ${SAVE_SCHEMA_1} attendue) : mettez l’application à jour`,
    );
  }
  if (own(value, 'others') !== undefined) {
    return refusal('un lien ne partage qu’un seul bac');
  }
  const result = parseSaveWorlds(text);
  if (!result.ok) {
    return result;
  }
  const animals = roomAnimalCount(result.room);
  if (animals > ROOM_ANIMAL_CAP) {
    return refusal(`trop d’animaux (${animals}, ${ROOM_ANIMAL_CAP} au plus)`);
  }
  return result;
}

/**
 * Nombre d'animaux d'un aquarium reçu (#431) : le décompte du plafond (`roomAnimalCount`),
 * pour que le bandeau d'offre et le refus « trop d'animaux » comptent la même chose.
 */
export function sharedAnimalCount(result: Extract<ParseShareResult, { ok: true }>): number {
  return roomAnimalCount(result.room);
}

/**
 * Texte partagé du bac `world` : sa sauvegarde au schéma 1, seul, avec `settings`, sans
 * l'historique de l'eau (#524) : ces ~3 Kio ne disent rien à celui qui reçoit le bac et
 * rapprocheraient le lien de `MAX_SHARE_LINK_LENGTH`.
 */
export function sharedText(world: World, settings: SaveSettings): string {
  return serializeWorld({ ...world, waterHistory: undefined, journal: undefined }, settings);
}

/** Issue d'une demande de partage. */
export type ShareOutcome =
  | { readonly kind: 'lien'; readonly url: string }
  | { readonly kind: 'fichier'; readonly length: number; readonly reason: string };

/**
 * Lien complet `base#fragment`, ou repli sur le fichier s'il dépasse `MAX_SHARE_LINK_LENGTH`.
 * `base` est l'adresse de la page sans fragment.
 */
export function shareOutcome(base: string, fragment: string): ShareOutcome {
  const url = `${base}#${fragment}`;
  if (url.length > MAX_SHARE_LINK_LENGTH) {
    return {
      kind: 'fichier',
      length: url.length,
      reason: `lien trop long (${url.length} caractères, ${MAX_SHARE_LINK_LENGTH} au plus)`,
    };
  }
  return { kind: 'lien', url };
}

/**
 * Partage du bac `world` : fragment compressé si l'API existe (`compress`), sinon JSON brut,
 * puis lien ou repli sur le fichier (`shareOutcome`).
 * @throws RangeError comme `serializeWorld` (monde non enregistrable).
 */
export async function createShare(
  base: string,
  world: World,
  settings: SaveSettings,
  compress: boolean = compressionSupported(),
): Promise<ShareOutcome> {
  const text = sharedText(world, settings);
  const fragment = compress
    ? shareFragment('z', await compressText(text))
    : shareFragment('j', new TextEncoder().encode(text));
  return shareOutcome(base, fragment);
}

/**
 * Relit un fragment partagé (avec ou sans `#`) : découpe, décompression bornée à
 * `MAX_SAVE_LENGTH` octets, puis validation complète (`parseSharedText`). Ne lève jamais.
 */
export async function readShare(hash: string): Promise<ParseShareResult> {
  const split = splitShareFragment(hash);
  if (!split.ok) {
    return split;
  }
  let text: string;
  if (split.codec === 'z') {
    const inflated = await decompressText(split.bytes, MAX_SAVE_LENGTH);
    if (!inflated.ok) {
      return inflated;
    }
    text = inflated.text;
  } else {
    if (split.bytes.length > MAX_SAVE_LENGTH) {
      return refusal(`contenu trop volumineux (${MAX_SAVE_LENGTH / 1024} Kio au plus)`);
    }
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(split.bytes);
    } catch {
      return refusal('lien corrompu (texte illisible)');
    }
  }
  return parseSharedText(text);
}

function refusal(error: string): { readonly ok: false; readonly error: string } {
  return { ok: false, error };
}
