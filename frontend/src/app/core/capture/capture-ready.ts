/**
 * Signal « image prête » du contrat de capture.
 *
 * Le harnais Playwright attend `body[data-aqfish-ready="true"]` avant de prendre
 * la capture. L'application doit appeler `markCaptureReady()` une fois la première
 * image complète rendue (scène chargée, temps de simulation atteint), et
 * `resetCaptureReady()` si elle recharge la scène.
 *
 * Voir docs/ARCHITECTURE.md, section « Contrat de capture ».
 */

export const CAPTURE_READY_ATTRIBUTE = 'data-aqfish-ready';

export function markCaptureReady(doc: Document = document): void {
  doc.body.setAttribute(CAPTURE_READY_ATTRIBUTE, 'true');
}

export function resetCaptureReady(doc: Document = document): void {
  doc.body.removeAttribute(CAPTURE_READY_ATTRIBUTE);
}

export function isCaptureReady(doc: Document = document): boolean {
  return doc.body.getAttribute(CAPTURE_READY_ATTRIBUTE) === 'true';
}
