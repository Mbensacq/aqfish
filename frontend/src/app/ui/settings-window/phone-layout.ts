import { DOCUMENT, InjectionToken, inject, signal, type Signal } from '@angular/core';

import { exclusivePanelsQuery } from '../exclusive-panels/exclusive-panels';

/**
 * Vrai sur téléphone (moins de 640 px de large, même seuil que les panneaux exclusifs, #136) :
 * la fenêtre des réglages y devient un panneau qui monte du bas, liste des catégories puis
 * contenu d'une catégorie (#722, tranche 3). Suit la largeur (téléphone qu'on tourne) ; sans
 * `matchMedia` (jsdom) : jamais téléphone.
 */
export const PHONE_LAYOUT = new InjectionToken<Signal<boolean>>('PHONE_LAYOUT', {
  providedIn: 'root',
  factory: () => {
    const win = inject(DOCUMENT).defaultView;
    if (typeof win?.matchMedia !== 'function') {
      return signal(false).asReadonly();
    }
    const query = win.matchMedia(exclusivePanelsQuery());
    const phone = signal(query.matches);
    query.addEventListener('change', (event) => phone.set(event.matches));
    return phone.asReadonly();
  },
});
