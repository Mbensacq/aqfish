import { afterNextRender, ChangeDetectionStrategy, Component } from '@angular/core';

import { markCaptureReady } from './core/capture/capture-ready';

/**
 * Coquille de l'application (socle).
 *
 * La scène 3D n'existe pas encore : elle sera construite par l'équipe d'agents
 * (voir docs/ROADMAP.md). En attendant, la coquille respecte déjà le contrat de
 * capture en signalant qu'elle est prête après son premier rendu.
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    afterNextRender(() => markCaptureReady());
  }
}
