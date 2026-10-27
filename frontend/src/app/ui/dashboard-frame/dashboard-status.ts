import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import {
  ALERT_SEVERITY_LABELS,
  alertsAnnouncement,
  dashboardAlerts,
  shownAlerts,
  type AlertId,
  type AlertSeverity,
  type DashboardAlert,
} from '../../sim/dashboard-alerts';
import { EMPTY_HEALTH_SUMMARY, healthItems, type HealthSummary } from '../../sim/health-summary';
import { DEFAULT_WATER_SAMPLE, type GaugeLevel, type WaterSample } from '../../sim/water-dashboard';
import { DEFAULT_WATER_READOUT, type WaterReadout } from '../../sim/water-quality';
import {
  DASHBOARD_BACKGROUND_ALPHA,
  DASHBOARD_COLORS,
  DASHBOARD_MUTED_ALPHA,
  DASHBOARD_REST_OPACITY,
} from './dashboard-frame';
import { levelIconPixels, LEVEL_ICON_GRID } from './level-icons';

/** Identifiant du détail d'une alerte (cible de `aria-controls`). */
export function alertDetailId(id: AlertId): string {
  return `alerte-${id}`;
}

/** Niveau (icône et couleur) de chaque gravité d'alerte. */
export const SEVERITY_LEVELS: Readonly<Record<AlertSeverity, GaugeLevel>> = {
  critique: 'rouge',
  attention: 'orange',
};

const ICONS: Readonly<Record<GaugeLevel, readonly (readonly [number, number])[]>> = {
  vert: levelIconPixels('vert'),
  orange: levelIconPixels('orange'),
  rouge: levelIconPixels('rouge'),
};

/**
 * Bandeau bas du tableau de bord (issue #260, addendum de l'ADR 0059) : synthèse de la santé
 * des animaux (santé et faim moyennes, malades, détresse) et alertes de l'eau et des
 * animaux, au-dessus de la barre des vues, jamais au centre du bac. Chaque alerte porte une
 * icône, sa gravité en texte et un message ; elle se déplie (souris, clavier) sur sa cause
 * probable et l'action conseillée. Au plus trois alertes, les autres comptées (« +N »).
 * Une région `role="status"` annonce les alertes ; son texte ne change qu'avec elles (sujets
 * et gravités), donc rien n'est relu à chaque relevé. Aucune logique de simulation : il lit
 * les relevés de l'hôte (eau, santé) et en dérive les alertes par fonctions pures
 * (`sim/health-summary.ts`, `sim/dashboard-alerts.ts`). Mêmes couleurs que le cadre haut.
 */
@Component({
  selector: 'app-dashboard-status',
  template: `<section
    class="status"
    aria-label="Santé des animaux et alertes"
    data-dashboard-status
  >
    <ul class="status__health" aria-label="Santé des animaux">
      @for (item of items(); track item.id) {
        <li
          class="status__item"
          [attr.data-health]="item.id"
          [attr.data-level]="item.level"
          [attr.title]="item.spoken"
        >
          <svg
            class="status__icon"
            aria-hidden="true"
            [attr.viewBox]="'0 0 ' + iconGrid + ' ' + iconGrid"
            shape-rendering="crispEdges"
          >
            @for (pixel of icons[item.level]; track $index) {
              <rect [attr.x]="pixel[0]" [attr.y]="pixel[1]" width="1" height="1" />
            }
          </svg>
          <span class="status__name" aria-hidden="true">{{ item.label }}</span>
          <span class="status__value" aria-hidden="true" [attr.data-health-value]="item.id">{{
            item.value
          }}</span>
          <span class="visually-hidden">{{ item.spoken }}</span>
        </li>
      }
    </ul>
    <p class="visually-hidden" role="status" data-alerts-announcement>{{ announcement() }}</p>
    <ul class="status__alerts" aria-label="Alertes">
      @for (alert of visible().shown; track alert.id) {
        <li
          class="status__alert"
          [attr.data-alert]="alert.id"
          [attr.data-severity]="alert.severity"
        >
          <button
            type="button"
            class="status__chip"
            [attr.data-level]="levels[alert.severity]"
            [attr.aria-expanded]="expanded() === alert.id"
            [attr.aria-controls]="expanded() === alert.id ? detailId(alert.id) : null"
            (click)="toggle(alert.id)"
          >
            <svg
              class="status__icon"
              aria-hidden="true"
              [attr.viewBox]="'0 0 ' + iconGrid + ' ' + iconGrid"
              shape-rendering="crispEdges"
            >
              @for (pixel of icons[levels[alert.severity]]; track $index) {
                <rect [attr.x]="pixel[0]" [attr.y]="pixel[1]" width="1" height="1" />
              }
            </svg>
            <span class="status__severity">{{ severityLabels[alert.severity] }}</span>
            <span class="status__message">{{ alert.message }}</span>
          </button>
        </li>
      } @empty {
        <li class="status__alert status__none" data-level="vert" data-alert-none>
          <svg
            class="status__icon"
            aria-hidden="true"
            [attr.viewBox]="'0 0 ' + iconGrid + ' ' + iconGrid"
            shape-rendering="crispEdges"
          >
            @for (pixel of icons.vert; track $index) {
              <rect [attr.x]="pixel[0]" [attr.y]="pixel[1]" width="1" height="1" />
            }
          </svg>
          Aucune alerte
        </li>
      }
      @if (visible().hidden > 0) {
        <li class="status__more" data-alerts-more [attr.title]="hiddenLabel()">
          <span aria-hidden="true">+{{ visible().hidden }}</span>
          <span class="visually-hidden">{{ hiddenLabel() }}</span>
        </li>
      }
    </ul>
    @if (detail(); as open) {
      <p class="status__detail" [id]="detailId(open.id)" [attr.data-alert-detail]="open.id">
        <span><b>Cause probable :</b> {{ open.cause }}.</span>
        <span><b>À faire :</b> {{ open.action }}.</span>
      </p>
    }
  </section>`,
  styleUrl: './dashboard-status.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--dashboard-background]': 'colors.background',
    '[style.--dashboard-ink]': 'colors.ink',
    '[style.--dashboard-vert]': 'colors.vert',
    '[style.--dashboard-orange]': 'colors.orange',
    '[style.--dashboard-rouge]': 'colors.rouge',
    '[style.--dashboard-background-alpha]': 'backgroundAlpha',
    '[style.--dashboard-muted-alpha]': 'mutedAlpha',
    '[style.--dashboard-rest-opacity]': 'restOpacity',
  },
})
export class DashboardStatus {
  /** Relevé exact de l'eau (fourni par l'hôte, au plus 4 fois par seconde). */
  readonly sample = input<WaterSample>(DEFAULT_WATER_SAMPLE);
  /** Relevé arrondi de l'eau (fourni par l'hôte) : zones du pH des espèces présentes. */
  readonly readout = input<WaterReadout>(DEFAULT_WATER_READOUT);
  /** Synthèse de la santé des animaux (fournie par l'hôte, au rythme des relevés de l'eau). */
  readonly health = input<HealthSummary>(EMPTY_HEALTH_SUMMARY);

  /** Alerte dépliée (une à la fois), `null` : aucune. */
  readonly expanded = signal<AlertId | null>(null);

  protected readonly iconGrid = LEVEL_ICON_GRID;
  protected readonly icons = ICONS;
  protected readonly levels = SEVERITY_LEVELS;
  protected readonly severityLabels = ALERT_SEVERITY_LABELS;
  protected readonly detailId = alertDetailId;
  protected readonly colors = DASHBOARD_COLORS;
  protected readonly backgroundAlpha = DASHBOARD_BACKGROUND_ALPHA;
  protected readonly mutedAlpha = DASHBOARD_MUTED_ALPHA;
  protected readonly restOpacity = DASHBOARD_REST_OPACITY;

  /** Alertes de l'eau et des animaux, ordonnées par gravité, recalculées à chaque relevé. */
  readonly alerts = computed<readonly DashboardAlert[]>(() =>
    dashboardAlerts({
      sample: this.sample(),
      phBands: this.readout().phBands,
      health: this.health(),
    }),
  );

  protected readonly items = computed(() => healthItems(this.health()));
  protected readonly visible = computed(() => shownAlerts(this.alerts()));
  protected readonly announcement = computed(() => alertsAnnouncement(this.alerts()));
  /** Alerte dépliée encore affichée (une alerte disparue referme son détail). */
  protected readonly detail = computed(
    () => this.visible().shown.find((alert) => alert.id === this.expanded()) ?? null,
  );
  protected readonly hiddenLabel = computed(() => {
    const hidden = this.visible().hidden;
    return `${hidden} ${hidden > 1 ? 'autres alertes' : 'autre alerte'}`;
  });

  /** Déplie l'alerte `id` (repliant l'autre), ou la replie si elle l'était. */
  toggle(id: AlertId): void {
    this.expanded.update((open) => (open === id ? null : id));
  }
}
