import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

/**
 * Configuration de l'application. Sans routeur (#279, ADR 0079) : l'application n'a qu'une
 * page, et le routeur, à la navigation initiale, réécrivait l'URL (`history.replaceState`),
 * ce qu'un document ouvert en `file://` refuse (paquet fond d'écran).
 */
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners()],
};
