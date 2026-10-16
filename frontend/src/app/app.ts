import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from '@angular/core';

import { parseCaptureParams } from './core/capture/capture-params';
import { AquariumHost } from './ui/aquarium-host/aquarium-host';

/**
 * Racine de l'application : le bac en 3D plein écran et, hors mode capture, l'interface.
 * Le signal « prêt » du contrat de capture est émis par `AquariumHost` après la première
 * image complète (docs/ARCHITECTURE.md, « Contrat de capture »).
 */
@Component({
  selector: 'app-root',
  imports: [AquariumHost],
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
