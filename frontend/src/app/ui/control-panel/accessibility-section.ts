import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ReducedMotionState } from '../reduced-motion/reduced-motion-state';

/**
 * Section « Accessibilité » du panneau « Réglages » (#406 ; sortie du panneau au #697) :
 * « Réduire les mouvements », initialisée sur la préférence système, choix mémorisé dans
 * l'état partagé avec l'aquarium et le mode immersif.
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-accessibility-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './accessibility-section.scss',
  template: `
    <legend class="control-panel__legend">Accessibilité</legend>
    <label class="control-panel__check" data-reduced-motion>
      <input type="checkbox" [checked]="reducedMotion()" (change)="onReducedMotion($event)" />
      Réduire les mouvements
    </label>
  `,
})
export class AccessibilitySection {
  private readonly motionState = inject(ReducedMotionState);
  /** État effectif de l'option (choix des réglages, sinon préférence système). */
  protected readonly reducedMotion = this.motionState.reduced;

  /** Case « Réduire les mouvements » (#406) : réglée et mémorisée dans l'état partagé. */
  protected onReducedMotion(event: Event): void {
    this.motionState.setReduced((event.target as HTMLInputElement).checked);
  }
}
