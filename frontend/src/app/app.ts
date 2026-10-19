import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from '@angular/core';

import { parseCaptureParams } from './core/capture/capture-params';
import { AquariumHost } from './ui/aquarium-host/aquarium-host';
import { CommandsHelp } from './ui/commands-help/commands-help';
import { ViewPresetsBar } from './ui/view-presets-bar/view-presets-bar';

/**
 * Racine de l'application : le bac en 3D plein écran et, hors mode capture, l'interface
 * (barre des préréglages de vue, reliée à l'hôte du canvas, et aide-mémoire des commandes).
 * Le signal « prêt » du contrat de capture est émis par `AquariumHost` après la première
 * image complète (docs/ARCHITECTURE.md, « Contrat de capture »).
 */
@Component({
  selector: 'app-root',
  imports: [AquariumHost, CommandsHelp, ViewPresetsBar],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  /** Mode capture : interface masquée. */
  protected readonly capture = parseCaptureParams(
    inject(DOCUMENT).defaultView?.location.search ?? '',
  ).capture;
}
