/**
 * Piège du focus d'une fenêtre modale (#722) : Tab et Maj+Tab tournent en boucle sur les
 * éléments focalisables de `container`. Module sans Angular (seulement le DOM).
 */

/** Éléments qui peuvent recevoir le focus au clavier. */
const FOCUSABLE = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Éléments focalisables de `container`, dans l'ordre du document. */
export function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.tabIndex >= 0,
  );
}

/**
 * Garde le focus dans `container` à l'appui de Tab : du dernier élément au premier (Tab), du
 * premier au dernier (Maj+Tab), ou vers le premier si le focus en est sorti. Les autres
 * touches sont ignorées. Vrai si le focus a été déplacé (l'événement est alors annulé).
 */
export function trapTab(event: KeyboardEvent, container: HTMLElement): boolean {
  if (event.key !== 'Tab') {
    return false;
  }
  const focusable = focusableIn(container);
  if (focusable.length === 0) {
    event.preventDefault();
    return true;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = container.ownerDocument.activeElement;
  const outside = !(active instanceof HTMLElement) || !container.contains(active);
  const edge = event.shiftKey ? first : last;
  if (!outside && active !== edge) {
    return false;
  }
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
  return true;
}
