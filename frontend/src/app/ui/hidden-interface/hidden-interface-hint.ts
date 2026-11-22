import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { keyCommand } from '../../core/commands/commands';
import { ReducedMotionState } from '../reduced-motion/reduced-motion-state';
import { HiddenInterfaceState } from './hidden-interface-state';

/**
 * Indication « I ou Échap pour revenir » (#725, `docs/INTERFACE.md` section 3), au masquage de
 * l'interface, « Appui long pour revenir » au doigt (#775, `HiddenInterfaceState.touch`) : seule chose visible hors du bac, elle s'efface en fondu à la fin de ses 3 s ;
 * avec « Réduire les mouvements », elle reste 3 s puis disparaît sans fondu.
 */
@Component({
  selector: 'app-hidden-interface-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './hidden-interface-hint.scss',
  template: `
    @if (state.hintShown()) {
      <p
        class="hidden-interface-hint"
        [class.hidden-interface-hint--still]="motion.reduced()"
        role="status"
        data-hidden-interface-hint
      >
        @if (state.touch()) {
          Appui long pour revenir
        } @else {
          {{ key }} ou Échap pour revenir
        }
      </p>
    }
  `,
})
export class HiddenInterfaceHint {
  protected readonly state = inject(HiddenInterfaceState);
  protected readonly motion = inject(ReducedMotionState);
  /** Touche du raccourci, telle qu'affichée (`I`). */
  protected readonly key = keyCommand('masquer-interface').display;
}
