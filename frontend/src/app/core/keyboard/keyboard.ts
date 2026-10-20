/**
 * Clavier : règles communes aux gestionnaires de raccourcis de l'interface
 * (`ui/view-presets-bar`, `ui/commands-help`, issue #79). Module pur : ni Angular, ni
 * Three.js (seulement les types DOM des événements).
 */

/**
 * Vrai si la touche doit être laissée au navigateur : touche de modification enfoncée, ou
 * focus dans un champ de saisie (`input`, `textarea`, `select`, élément éditable).
 */
export function isTypingContext(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return true;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) {
    return true;
  }
  // `isContentEditable` peut manquer (jsdom) : comparaison stricte.
  return target instanceof HTMLElement && target.isContentEditable === true;
}
