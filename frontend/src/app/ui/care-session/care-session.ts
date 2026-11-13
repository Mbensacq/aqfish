import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  CARE_SESSION_STEPS,
  CARE_SESSION_TEXT,
  careSessionSummary,
  glassStepHint,
  type CareSession,
} from '../../sim/care-session';
import { DASHBOARD_COLORS } from '../dashboard-frame/dashboard-frame';

/**
 * Séance d'entretien guidée (#604, ADR 0138) : étape affichée (numéro, titre court, phrase
 * « pourquoi »), consigne de la raclette à l'étape « vitres », « Étape terminée » ou
 * « Passer », bilan à la fin. Non modale : le bac reste visible et manipulable derrière.
 * Lot 1 : les étapes sans geste disent qu'il arrive bientôt.
 */
@Component({
  selector: 'app-care-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session(); as current) {
      <section
        class="care-session"
        role="dialog"
        aria-modal="false"
        aria-labelledby="care-session-title"
        data-care-session
        [attr.data-step]="current.step"
      >
        <p class="care-session__count">{{ count() }}</p>
        <h2 id="care-session-title" class="care-session__title">{{ text().title }}</h2>
        <p class="care-session__why">{{ text().why }}</p>
        @if (current.step === 'vitres') {
          <p class="care-session__hint" data-care-hint aria-live="polite">{{ hint() }}</p>
        } @else if (current.step === 'bilan') {
          <ul class="care-session__summary" data-care-summary>
            @for (line of summary(); track line.step) {
              <li [attr.data-outcome]="line.outcome">
                {{ line.title }} : {{ line.outcome === 'fait' ? 'fait' : 'passé' }}
              </li>
            }
          </ul>
        } @else {
          <p class="care-session__hint">Ce geste arrive bientôt : passez cette étape.</p>
        }
        <div class="care-session__buttons">
          @if (current.step === 'bilan') {
            <button
              type="button"
              class="care-session__button"
              data-care-close
              (click)="closed.emit()"
            >
              Terminer la séance
            </button>
          } @else {
            @if (current.step === 'vitres') {
              <button
                type="button"
                class="care-session__button"
                data-care-done
                (click)="completed.emit()"
              >
                Étape terminée
              </button>
            }
            <button
              type="button"
              class="care-session__button"
              data-care-skip
              (click)="skipped.emit()"
            >
              Passer
            </button>
            <button
              type="button"
              class="care-session__button care-session__button--quiet"
              data-care-close
              aria-label="Interrompre la séance (elle reprendra à cette étape)"
              (click)="closed.emit()"
            >
              Plus tard
            </button>
          }
        </div>
      </section>
    }
  `,
  styleUrl: './care-session.scss',
  host: {
    '[style.--dashboard-background]': 'colors.background',
    '[style.--dashboard-ink]': 'colors.ink',
  },
})
export class CareSessionPanel {
  /** Séance affichée ; `null` : rien. */
  readonly session = input<CareSession | null>(null);
  /** Plaques d'algues visibles (consigne des vitres). */
  readonly visibleAlgae = input(0);
  /** « Étape terminée ». */
  readonly completed = output<void>();
  /** « Passer ». */
  readonly skipped = output<void>();
  /** « Plus tard » (interruption) ou « Terminer la séance » (bilan). */
  readonly closed = output<void>();

  protected readonly colors = DASHBOARD_COLORS;
  protected readonly text = computed(() => CARE_SESSION_TEXT[this.session()?.step ?? 'vitres']);
  protected readonly count = computed(() => {
    const step = this.session()?.step ?? 'vitres';
    const index = CARE_SESSION_STEPS.indexOf(step);
    return step === 'bilan'
      ? 'Séance terminée'
      : `Étape ${index + 1} sur ${CARE_SESSION_STEPS.length - 1}`;
  });
  protected readonly hint = computed(() => glassStepHint(this.visibleAlgae()));
  protected readonly summary = computed(() => {
    const session = this.session();
    return session ? careSessionSummary(session) : [];
  });
}
