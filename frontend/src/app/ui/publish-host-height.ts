import { afterNextRender, DestroyRef, DOCUMENT, ElementRef, inject } from '@angular/core';

/**
 * Publie la hauteur de l'hôte du composant courant, en pixels, dans la propriété CSS
 * `property` de la racine du document, et la retire à sa destruction (#610, #773). Les
 * panneaux posés au-dessus ou au-dessous s'y calent en CSS sans connaître la largeur, la
 * police ni le nombre de lignes du composant mesuré.
 *
 * À appeler dans un contexte d'injection (constructeur). Sans `ResizeObserver` (jsdom),
 * rien n'est publié. Tant que `frozen()` est vrai, la dernière valeur publiée est gardée
 * (un détail déplié qui ne doit pas déplacer les voisins).
 */
export function publishHostHeight(property: string, frozen: () => boolean = () => false): void {
  const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const root = inject(DOCUMENT).documentElement;
  let observer: ResizeObserver | null = null;
  afterNextRender(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    observer = new ResizeObserver(() => {
      if (!frozen()) {
        root.style.setProperty(property, `${host.getBoundingClientRect().height}px`);
      }
    });
    observer.observe(host);
  });
  inject(DestroyRef).onDestroy(() => {
    observer?.disconnect();
    root.style.removeProperty(property);
  });
}
