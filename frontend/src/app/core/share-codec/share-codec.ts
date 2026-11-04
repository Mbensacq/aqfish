/**
 * Compression du lien de partage (issue #426, ADR 0105) : `deflate-raw` par l'API
 * `CompressionStream` du navigateur, sans dépendance. Le module ne connaît pas le format de
 * l'aquarium : il transforme un texte en octets et inversement.
 *
 * Gardes : l'API peut manquer (navigateur ancien) ; `compressionSupported` le dit et
 * l'appelant se replie sur le texte non compressé. La décompression s'arrête dès que le texte
 * dépasse `maxBytes` (contenu hostile : « bombe » de décompression) et ne lève jamais.
 */

/** Algorithme de `CompressionStream` utilisé (RFC 1951, sans en-tête). */
export const SHARE_COMPRESSION = 'deflate-raw';

/** Vrai si `CompressionStream` et `DecompressionStream` existent dans cet environnement. */
export function compressionSupported(scope: object = globalThis): boolean {
  const api = scope as { CompressionStream?: unknown; DecompressionStream?: unknown };
  return (
    typeof api.CompressionStream === 'function' && typeof api.DecompressionStream === 'function'
  );
}

/**
 * Compresse `text` (UTF-8) en `deflate-raw`.
 * @throws Error si l'API est absente (vérifier `compressionSupported` avant).
 */
export async function compressText(text: string): Promise<Uint8Array> {
  const stream = streamOf(new TextEncoder().encode(text)).pipeThrough(
    new CompressionStream(SHARE_COMPRESSION),
  );
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return concat(chunks);
    }
    chunks.push(value);
  }
}

/**
 * Flux d'un seul morceau (`ReadableStream`, pas `Blob.stream()` : absent de certains
 * environnements de test).
 */
function streamOf(bytes: Uint8Array): ReadableStream<BufferSource> {
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes as Uint8Array<ArrayBuffer>);
      controller.close();
    },
  });
}

/** Concatène des morceaux d'octets. */
function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const all = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return all;
}

/** Résultat de `decompressText`. */
export type DecompressResult =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };

/**
 * Décompresse des octets `deflate-raw` en texte UTF-8, au plus `maxBytes` octets décompressés.
 * Ne lève jamais : données corrompues, texte trop long ou API absente donnent un refus lisible.
 */
export async function decompressText(
  bytes: Uint8Array,
  maxBytes: number,
): Promise<DecompressResult> {
  if (!compressionSupported()) {
    return { ok: false, error: 'lien compressé illisible dans ce navigateur' };
  }
  try {
    const stream = streamOf(bytes).pipeThrough(new DecompressionStream(SHARE_COMPRESSION));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return {
          ok: false,
          error: `contenu trop volumineux (plus de ${Math.ceil(maxBytes / 1024)} Kio)`,
        };
      }
      chunks.push(value);
    }
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(concat(chunks)) };
  } catch {
    return { ok: false, error: 'lien corrompu (données compressées illisibles)' };
  }
}
