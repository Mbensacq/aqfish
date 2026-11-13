import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { ALERT_TOPICS, whyTopic } from '../../sim/beginner-help';

import {
  alertAnimalsText,
  NO_ALERT_TARGETS,
  targetOfAlert,
  type AlertTargets,
} from '../../sim/alert-animals';
import {
  ALERT_SEVERITY_LABELS,
  alertsAnnouncement,
  animalCount,
  dashboardAlerts,
  shownAlerts,
  type AlertId,
  type AlertSeverity,
  type DashboardAlert,
} from '../../sim/dashboard-alerts';
import { GUIDE_PAGE_TITLES, type GuidePage } from '../../sim/care-guide';
import { mixWarnings } from '../../sim/compatibility';
import { environmentById, DEFAULT_ENVIRONMENT_ID, type EnvironmentId } from '../../sim/environment';
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import { EMPTY_HEALTH_SUMMARY, healthItems, type HealthSummary } from '../../sim/health-summary';
import { DEFAULT_WATER_SAMPLE, type GaugeLevel, type WaterSample } from '../../sim/water-dashboard';
import type { LampReadout } from '../../sim/lamp';
import type { FeederReadout } from '../../sim/auto-feeder';
import type { TreatmentReadout } from '../../sim/treatment-text';
import { DEFAULT_WATER_READOUT, type WaterReadout } from '../../sim/water-quality';
import {
  DASHBOARD_BACKGROUND_ALPHA,
  DASHBOARD_COLORS,
  DASHBOARD_MUTED_ALPHA,
  DASHBOARD_REST_OPACITY,
} from './dashboard-frame';
import { FeederPanel } from './feeder-panel';
import { BeginnerGuideState } from '../beginner-guide/beginner-guide-state';
import {
  levelIconPixels,
  LEVEL_ICON_GRID,
  MAINTENANCE_ICON_PIXELS,
  REVIEW_ICON_PIXELS,
} from './level-icons';
import type { ReviewPoint } from '../../sim/bilan';
import type { JournalLine } from '../../sim/journal';
import {
  maintenanceSummary,
  type MaintenanceReadout,
  type MaintenanceTask,
} from '../../sim/maintenance';

/** Identifiant du détail d'une alerte (cible de `aria-controls`). */
export function alertDetailId(id: AlertId): string {
  return `alerte-${id}`;
}

/** Libellé accessible du bouton « Pourquoi ? » d'une alerte (#240). */
export function alertWhyLabel(id: AlertId): string {
  return `Pourquoi ? ${whyTopic(ALERT_TOPICS[id]).title}`;
}

/** Libellé accessible du bouton « Wiki » d'une alerte (#366). */
export function alertWikiLabel(page: GuidePage): string {
  return `Ouvrir le wiki : page « ${GUIDE_PAGE_TITLES[page]} »`;
}

/**
 * Propriété CSS de la racine du document qui porte la hauteur du bandeau replié, en pixels
 * (#610) : l'aide-mémoire « Commandes », sous 1100 px, s'arrête au-dessus (commands-help.scss).
 */
export const STATUS_HEIGHT_PROPERTY = '--aqfish-status-height';

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
 * probable, l'action conseillée et un bouton « Pourquoi ? » qui ouvre le guide du débutant
 * sur l'explication liée (#240) ; une alerte qui renvoie au wiki (points blancs, #366) y
 * ajoute un bouton vers la page concernée (`wikiPageRequested`). Au plus trois alertes, les autres comptées (« +N »).
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
      @if (maintenance(); as calendar) {
        <li class="status__item status__maintenance-item">
          <button
            type="button"
            class="status__chip status__maintenance"
            data-maintenance
            [attr.data-maintenance-due]="calendar.due.length"
            [attr.aria-controls]="maintenanceOpen() ? 'entretien-detail' : null"
            [attr.aria-expanded]="maintenanceOpen()"
            (click)="toggleMaintenance()"
          >
            <svg
              class="status__icon"
              aria-hidden="true"
              [attr.viewBox]="'0 0 ' + iconGrid + ' ' + iconGrid"
              shape-rendering="crispEdges"
            >
              @for (pixel of maintenanceIcon; track $index) {
                <rect [attr.x]="pixel[0]" [attr.y]="pixel[1]" width="1" height="1" />
              }
            </svg>
            <span class="status__maintenance-name">Entretien :</span>
            <span class="status__message" data-maintenance-summary>{{ summary(calendar) }}</span>
            @if (calendar.due.length > 0) {
              <span class="status__maintenance-count" aria-hidden="true">{{
                calendar.due.length
              }}</span>
            }
          </button>
        </li>
      }
      @if (reviewOf()) {
        <li class="status__item status__review-item">
          <button
            type="button"
            class="status__chip status__review"
            data-review
            [attr.aria-controls]="reviewOpen() ? 'bilan-detail' : null"
            [attr.aria-expanded]="reviewOpen()"
            (click)="toggleReview()"
          >
            <svg
              class="status__icon"
              aria-hidden="true"
              [attr.viewBox]="'0 0 ' + iconGrid + ' ' + iconGrid"
              shape-rendering="crispEdges"
            >
              @for (pixel of reviewIcon; track $index) {
                <rect [attr.x]="pixel[0]" [attr.y]="pixel[1]" width="1" height="1" />
              }
            </svg>
            <span class="status__review-name">Bilan du bac</span>
          </button>
        </li>
      }
    </ul>
    <p class="visually-hidden" role="status" data-alerts-announcement>{{ announcement() }}</p>
    <p class="visually-hidden" aria-live="polite" data-alert-highlight-announcement>
      {{ highlightAnnouncement() }}
    </p>
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
    @if (maintenanceDetail(); as calendar) {
      <div class="status__calendar" id="entretien-detail" data-maintenance-detail>
        <ul class="status__tasks" aria-label="Tâches d’entretien">
          @for (item of calendar.items; track item.task) {
            <li [attr.data-maintenance-task]="item.task" [attr.data-overdue]="item.overdue">
              <span
                >{{ item.label }} : <b>{{ item.text }}</b></span
              >
              @if (manual(item.task)) {
                <button
                  type="button"
                  class="status__why"
                  [attr.aria-label]="item.label + ' : marquer comme fait'"
                  [attr.data-maintenance-done]="item.task"
                  (click)="maintenanceDone.emit(item.task)"
                >
                  Fait
                </button>
              }
            </li>
          }
        </ul>
        @if (lamp(); as l) {
          <p class="status__lamp" data-lamp [attr.data-lamp-advice]="l.advice">
            Lampe : <b>{{ l.hours }} h par jour</b>, {{ l.schedule }} — {{ l.text }}
          </p>
        }
        @if (feederAvailable()) {
          <!-- Distributeur automatique (#583) : réserve, heures des rations, remplissage. -->
          <app-feeder-panel
            class="status__feeder"
            role="group"
            aria-label="Distributeur automatique"
            data-feeder-panel
            [feeder]="feeder()"
            (changed)="feederChanged.emit($event)"
            (refilled)="feederRefilled.emit()"
          />
        }
        <div>
          <b>Dernières actions</b>
          @if (calendar.log.length > 0) {
            <ol class="status__log" data-maintenance-log>
              @for (line of calendar.log; track $index) {
                <li>Jour {{ line.day }} : {{ line.label }}</li>
              }
            </ol>
          } @else {
            <p class="status__log" data-maintenance-log>Aucune action pour l’instant</p>
          }
        </div>
      </div>
    }
    @if (review(); as points) {
      <div
        class="status__review-detail"
        id="bilan-detail"
        role="group"
        [attr.aria-label]="journalShown() === null ? 'Bilan du bac' : 'Journal du bac'"
        data-review-detail
      >
        @if (journal() !== null) {
          <p class="status__tabs">
            <button
              type="button"
              class="status__why"
              data-review-tab
              [attr.aria-pressed]="journalShown() === null"
              (click)="journalTab.set(false)"
            >
              Bilan
            </button>
            <button
              type="button"
              class="status__why"
              data-journal
              [attr.aria-pressed]="journalShown() !== null"
              (click)="journalTab.set(true)"
            >
              Journal
            </button>
          </p>
        }
        @if (journalShown(); as lines) {
          <div data-journal-detail>
            @if (lines.length > 0) {
              <!-- Sans numéro (#592) : la liste va du plus récent au plus ancien, le jour date. -->
              <ul class="status__review-list status__journal-list">
                @for (line of lines; track $index) {
                  <li [attr.data-journal-kind]="line.kind">
                    <b>Jour {{ line.day }} :</b> {{ line.text }}
                  </li>
                }
              </ul>
            } @else {
              <p class="status__review-empty" data-journal-empty>Aucun événement pour l’instant.</p>
            }
          </div>
        } @else if (points.length > 0) {
          <ol class="status__review-list">
            @for (point of points; track point.id) {
              <li [attr.data-review-point]="point.id" [attr.data-severity]="point.severity">
                <b>{{ severityLabels[point.severity] }} : {{ point.title }}.</b>
                {{ point.measure }}. <b>À faire :</b> {{ point.action }}.
              </li>
            }
          </ol>
        } @else {
          <p class="status__review-empty" data-review-empty>Rien à améliorer pour l’instant.</p>
        }
      </div>
    }
    @if (detail(); as open) {
      <p class="status__detail" [id]="detailId(open.id)" [attr.data-alert-detail]="open.id">
        <span><b>Cause probable :</b> {{ open.cause }}.</span>
        <span><b>À faire :</b> {{ open.action }}.</span>
        @if (openTarget(); as target) {
          <span [attr.data-alert-animals]="open.id"
            ><b>Animaux concernés :</b> {{ animalsText(target.groups) }}.</span
          >
          @if (target.ids.length > 0) {
            <button
              type="button"
              class="status__why"
              [attr.data-alert-show]="open.id"
              (click)="showAnimalsRequested.emit(target.ids)"
            >
              Montrer les animaux
            </button>
          }
        }
        <button
          type="button"
          class="status__why"
          aria-haspopup="dialog"
          [attr.aria-label]="whyLabel(open.id)"
          [attr.data-alert-why]="open.id"
          (click)="guide.show(alertTopics[open.id])"
        >
          Pourquoi ?
        </button>
        @if (open.wiki; as page) {
          <button
            type="button"
            class="status__why"
            [attr.aria-label]="wikiLabel(page)"
            [attr.data-alert-wiki]="page"
            (click)="wikiPageRequested.emit(page)"
          >
            Wiki : {{ pageTitles[page] }}
          </button>
        }
      </p>
    }
  </section>`,
  imports: [FeederPanel],
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
  /** Environnement affiché (fourni par l'hôte) : ordre de ses espèces pour les mélanges. */
  readonly environment = input<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  /** Effectif de chaque espèce (fourni par l'hôte) : mélanges déconseillés (#271). */
  readonly population = input<PopulationCounts>(NO_FISH);
  /** Traitement des points blancs en cours (fourni par l'hôte, #361) ; `null` : aucun. */
  readonly treatment = input<TreatmentReadout | null>(null);

  /** Animaux désignés par chaque alerte (fournis par l'hôte, #483). */
  readonly targets = input<AlertTargets>(NO_ALERT_TARGETS);
  /** Nombre d'animaux mis en évidence dans la scène (fourni par l'hôte, #483). */
  readonly highlighted = input(0);

  /** Bouton « Montrer les animaux » (#483) : l'application les met en évidence dans la scène. */
  readonly showAnimalsRequested = output<readonly number[]>();

  /** Bouton « Wiki » d'une alerte (#366) : l'application ouvre le wiki sur cette page. */
  readonly wikiPageRequested = output<GuidePage>();

  /** Calendrier d'entretien du bac (fourni par l'hôte, #513) ; `null` : pas de rappel. */
  readonly maintenance = input<MaintenanceReadout | null>(null);

  /**
   * Lampe du bac (fournie par l'hôte, #584) : durée, plage et avis, lus dans le calendrier
   * d'entretien déplié ; `null` : bac sans lampe réglable.
   */
  readonly lamp = input<LampReadout | null>(null);

  /** Distributeur automatique du bac (fourni par l'hôte, #583) ; `null` : aucun posé. */
  readonly feeder = input<FeederReadout | null>(null);
  /** Vrai si un distributeur peut être posé dans ce bac (#583) : sinon, rien n'est affiché. */
  readonly feederAvailable = input(false);
  /** Pose (heures), change les heures ou retire (`null`) le distributeur (#583). */
  readonly feederChanged = output<readonly number[] | null>();
  /** Bouton « Remplir » du distributeur (#583). */
  readonly feederRefilled = output<void>();

  /** Bouton « Fait » d'une tâche sans geste dans le jeu (filtre, test de l'eau, #513). */
  readonly maintenanceDone = output<MaintenanceTask>();

  /** Calendrier d'entretien déplié (#513) ; une alerte dépliée le replie, et inversement. */
  readonly maintenanceOpen = signal(false);

  /** Bilan du bac (fourni par l'hôte, #514), lu à la demande ; `null` : pas de bilan. */
  readonly reviewOf = input<(() => readonly ReviewPoint[]) | null>(null);

  /** Bilan déplié (#514) : il n'apparaît jamais sans demande. */
  readonly reviewOpen = signal(false);

  /**
   * Journal du bac affiché (fourni par l'hôte, #581), du plus récent au plus ancien, lu dans le
   * bilan déplié (bouton « Journal ») ; `null` : pas de journal. Pas de bouton de plus dans le
   * bandeau : il s'allongerait sur le bac, là où l'on clique (docs/PIEGES.md).
   */
  readonly journal = input<readonly JournalLine[] | null>(null);

  /** Journal affiché dans le bilan déplié au lieu de ses points (#581). */
  readonly journalTab = signal(false);

  /** Alerte dépliée (une à la fois), `null` : aucune. */
  readonly expanded = signal<AlertId | null>(null);

  protected readonly iconGrid = LEVEL_ICON_GRID;
  protected readonly maintenanceIcon = MAINTENANCE_ICON_PIXELS;
  protected readonly reviewIcon = REVIEW_ICON_PIXELS;
  /** Lignes du journal déplié ; `null` : replié ou sans journal. */
  protected readonly journalShown = computed(() =>
    this.reviewOpen() && this.journalTab() && this.reviewOf() !== null ? this.journal() : null,
  );
  protected readonly summary = maintenanceSummary;
  /** Points du bilan déplié, relus à chaque relevé de l'eau ; `null` : replié. */
  protected readonly review = computed(() => {
    this.sample();
    const source = this.reviewOf();
    return this.reviewOpen() && source !== null ? source() : null;
  });
  /** Calendrier affiché s'il est déplié et disponible. */
  protected readonly maintenanceDetail = computed(() =>
    this.maintenanceOpen() ? this.maintenance() : null,
  );
  protected readonly icons = ICONS;
  protected readonly levels = SEVERITY_LEVELS;
  protected readonly severityLabels = ALERT_SEVERITY_LABELS;
  protected readonly detailId = alertDetailId;
  protected readonly alertTopics = ALERT_TOPICS;
  protected readonly whyLabel = alertWhyLabel;
  protected readonly wikiLabel = alertWikiLabel;
  protected readonly pageTitles = GUIDE_PAGE_TITLES;
  /** « Pourquoi ? » sous une alerte : ouvre le guide sur l'explication liée (#240). */
  protected readonly guide = inject(BeginnerGuideState);
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
      mixes: mixWarnings(environmentById(this.environment()).species, this.population()),
      treatment: this.treatment(),
      feederEmpty: this.feeder()?.empty === true,
    }),
  );

  protected readonly items = computed(() => healthItems(this.health()));
  protected readonly visible = computed(() => shownAlerts(this.alerts()));
  protected readonly announcement = computed(() => alertsAnnouncement(this.alerts()));
  /** Alerte dépliée encore affichée (une alerte disparue referme son détail). */
  protected readonly detail = computed(
    () => this.visible().shown.find((alert) => alert.id === this.expanded()) ?? null,
  );
  /**
   * Vrai si un détail est déplié (alerte, calendrier d'entretien ou bilan) : le bandeau monte
   * alors sur la bordure gauche et l'application masque la languette du parcours (#592).
   */
  readonly detailOpen = computed(
    () => this.detail() !== null || this.maintenanceDetail() !== null || this.review() !== null,
  );
  protected readonly animalsText = alertAnimalsText;
  /** Animaux désignés par l'alerte dépliée ; `null` si elle n'en désigne jamais (#483). */
  protected readonly openTarget = computed(() => {
    const open = this.detail();
    return open === null ? null : targetOfAlert(this.targets(), open.id);
  });
  /** Annonce de la mise en évidence ; vide une fois terminée (#483). */
  protected readonly highlightAnnouncement = computed(() => {
    const count = this.highlighted();
    return count > 0 ? `${animalCount(count)} mis en évidence dans le bac.` : '';
  });
  protected readonly hiddenLabel = computed(() => {
    const hidden = this.visible().hidden;
    return `${hidden} ${hidden > 1 ? 'autres alertes' : 'autre alerte'}`;
  });

  constructor() {
    // Hauteur du bandeau publiée à la racine (#610) : elle varie avec la largeur (une à trois
    // lignes entre 640 et 1099 px) et la police, que le CSS de l'aide-mémoire ne connaît pas.
    // Un détail déplié (alerte, bilan, calendrier) n'est pas compté : il passe sous les
    // panneaux, comme ailleurs, et l'aide-mémoire ne rétrécit pas à chaque dépliage.
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const root = inject(DOCUMENT).documentElement;
    let observer: ResizeObserver | null = null;
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      observer = new ResizeObserver(() => {
        if (!this.detailOpen()) {
          root.style.setProperty(
            STATUS_HEIGHT_PROPERTY,
            `${host.getBoundingClientRect().height}px`,
          );
        }
      });
      observer.observe(host);
    });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      root.style.removeProperty(STATUS_HEIGHT_PROPERTY);
    });
  }

  /** Déplie l'alerte `id` (repliant l'autre), ou la replie si elle l'était. */
  toggle(id: AlertId): void {
    this.expanded.update((open) => (open === id ? null : id));
    this.maintenanceOpen.set(false);
    this.reviewOpen.set(false);
  }

  /** Déplie ou replie le calendrier d'entretien. */
  toggleMaintenance(): void {
    this.maintenanceOpen.update((open) => !open);
    this.expanded.set(null);
    this.reviewOpen.set(false);
  }

  /** Déplie ou replie le bilan du bac (#514). */
  toggleReview(): void {
    this.reviewOpen.update((open) => !open);
    this.journalTab.set(false);
    this.expanded.set(null);
    this.maintenanceOpen.set(false);
  }

  /** Vrai pour une tâche sans geste dans le jeu, marquée à la main (#513). */
  protected manual(task: MaintenanceTask): boolean {
    return task === 'filter' || task === 'waterTest';
  }
}
