import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  CARE_SESSION_STEPS,
  CARE_SESSION_TEXT,
  careSessionSummary,
  glassStepHint,
  type CareSession,
} from '../../sim/care-session';
import {
  freshWaterStepHint,
  freshWaterWarnings,
  freshWaterWarningTexts,
  sharePercent,
  siphonStepHint,
  siphonWarning,
} from '../../sim/siphon';

/** Températures proposées pour le seau, en écart avec le bac (°C, #605). */
const BUCKET_GAPS = [
  { gap: -6, label: 'Froide (6 °C de moins)' },
  { gap: 0, label: 'À la température du bac' },
  { gap: 6, label: 'Chaude (6 °C de plus)' },
] as const;
import { DASHBOARD_COLORS } from '../dashboard-frame/dashboard-frame';

/**
 * Séance d'entretien guidée (#604, ADR 0138) : étape affichée (numéro, titre court, phrase
 * « pourquoi »), consigne de la raclette à l'étape « vitres », « Étape terminée » ou
 * « Passer », bilan à la fin. Non modale : le bac reste visible et manipulable derrière.
 * Siphon et eau neuve (#605) : jauges de l'eau retirée et versée, conditionneur et température
 * du seau, avertissements. Les étapes sans geste disent qu'il arrive bientôt.
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
        } @else if (current.step === 'siphon') {
          <div
            class="care-session__gauge"
            role="progressbar"
            aria-label="Eau retirée"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-valuenow]="siphonPercent()"
            [class.care-session__gauge--warning]="siphonTooMuch()"
            [attr.data-care-siphon]="siphonPercent()"
          >
            <span [style.width.%]="siphonPercent()"></span>
          </div>
          <p
            class="care-session__hint"
            data-care-hint
            aria-live="polite"
            [attr.data-warning]="siphonTooMuch() || null"
          >
            {{ siphonHint() }}
          </p>
        } @else if (current.step === 'eau') {
          <div
            class="care-session__gauge"
            role="progressbar"
            aria-label="Eau neuve versée"
            aria-valuemin="0"
            [attr.aria-valuemax]="siphonPercent()"
            [attr.aria-valuenow]="pouredPercent()"
            [attr.data-care-poured]="pouredPercent()"
          >
            <span [style.width.%]="fillPercent()"></span>
          </div>
          <p class="care-session__hint" data-care-hint aria-live="polite">{{ freshHint() }}</p>
          @if (siphonPercent() > 0) {
            <label class="care-session__field">
              <input
                type="checkbox"
                data-care-conditioner
                [checked]="conditioner()"
                (change)="conditionerChanged.emit($any($event.target).checked)"
              />
              Conditionneur versé dans le seau
            </label>
            <label class="care-session__field">
              Eau du seau
              <select data-care-bucket (change)="bucketGapChanged.emit(+$any($event.target).value)">
                @for (option of bucketGaps; track option.gap) {
                  <option [value]="option.gap" [selected]="option.gap === bucketGap()">
                    {{ option.label }}
                  </option>
                }
              </select>
            </label>
            @for (warning of freshWarnings(); track warning) {
              <p class="care-session__warning" data-care-warning>{{ warning }}</p>
            }
          }
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
            @if (current.step === 'eau' && poured() < siphoned()) {
              <button
                type="button"
                class="care-session__button"
                data-care-pour
                (click)="bucketPoured.emit()"
              >
                Verser un seau
              </button>
            }
            @if (canComplete()) {
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
    '[style.--dashboard-vert]': 'colors.vert',
    '[style.--dashboard-orange]': 'colors.orange',
  },
})
export class CareSessionPanel {
  /** Séance affichée ; `null` : rien. */
  readonly session = input<CareSession | null>(null);
  /** Plaques d'algues visibles (consigne des vitres). */
  readonly visibleAlgae = input(0);
  /** Conditionneur versé dans le seau (eau neuve, #605). */
  readonly conditioner = input(true);
  /** Écart de température du seau avec le bac, en °C (eau neuve, #605). */
  readonly bucketGap = input(0);
  /** « Verser un seau ». */
  readonly bucketPoured = output<void>();
  /** Case du conditionneur. */
  readonly conditionerChanged = output<boolean>();
  /** Choix de la température du seau (écart en °C). */
  readonly bucketGapChanged = output<number>();
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
  protected readonly bucketGaps = BUCKET_GAPS;
  protected readonly siphoned = computed(() => this.session()?.siphoned ?? 0);
  protected readonly poured = computed(() => this.session()?.poured ?? 0);
  protected readonly siphonPercent = computed(() => sharePercent(this.siphoned()));
  protected readonly pouredPercent = computed(() => sharePercent(this.poured()));
  /** Remplissage de la jauge d'eau neuve : part versée sur l'eau retirée. */
  protected readonly fillPercent = computed(() =>
    this.siphoned() > 0 ? Math.round((this.poured() / this.siphoned()) * 100) : 0,
  );
  protected readonly siphonTooMuch = computed(() => siphonWarning(this.siphoned()));
  protected readonly siphonHint = computed(() => siphonStepHint(this.siphoned()));
  protected readonly freshHint = computed(() => freshWaterStepHint(this.poured(), this.siphoned()));
  protected readonly freshWarnings = computed(() =>
    freshWaterWarningTexts(freshWaterWarnings(this.conditioner(), this.bucketGap(), 0)),
  );
  /** « Étape terminée » : vitres toujours ; siphon et eau neuve dès qu'il y a eu un geste. */
  protected readonly canComplete = computed(() => {
    switch (this.session()?.step) {
      case 'vitres':
        return true;
      case 'siphon':
        return this.siphoned() > 0;
      case 'eau':
        return this.poured() > 0;
      default:
        return false;
    }
  });
  protected readonly summary = computed(() => {
    const session = this.session();
    return session ? careSessionSummary(session) : [];
  });
}
