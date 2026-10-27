import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  signal,
} from '@angular/core';

import { dashboardAlerts } from '../../sim/dashboard-alerts';
import { DEFAULT_START_HOUR, formatHour, type DayPhase } from '../../sim/daylight';
import { EMPTY_HEALTH_SUMMARY, type HealthSummary } from '../../sim/health-summary';
import { DEFAULT_SIM_SPEED, speedLabel } from '../../sim/sim-speed';
import { MAX_HEATER_TEMPERATURE, MIN_HEATER_TEMPERATURE } from '../../sim/water';
import {
  DEFAULT_WATER_SAMPLE,
  EMPTY_TREND_STATE,
  QUALITY_LEVELS,
  dashboardGauges,
  gaugeTrends,
  nextTrendState,
  type DashboardGaugeId,
  type GaugeLevel,
  type Trend,
  type TrendState,
  type WaterSample,
} from '../../sim/water-dashboard';
import { MAX_PH, MIN_PH, type PhBands } from '../../sim/water-ph';
import { DAY_PHASE_LABELS, dayIconPixels, DAY_ICON_GRID } from '../day-indicator/day-indicator';
import { DashboardStatus } from './dashboard-status';
import { LEVEL_ICON_GRID, levelIconPixels } from './level-icons';
import {
  DEFAULT_WATER_READOUT,
  GAUGE_MAX,
  WATER_QUALITY_LABELS,
  type WaterReadout,
} from '../../sim/water-quality';

export { LEVEL_ICON_GRID, levelIconPixels } from './level-icons';

/** Identifiant de la liste des jauges (cible de `aria-controls`). */
export const DASHBOARD_GAUGES_ID = 'tableau-de-bord-jauges';

/**
 * Couleurs du cadre (docs/DA.md, « Interface ») : fond sombre translucide, texte clair,
 * couleurs de niveau de l'indicateur de qualité (ADR 0053). Posées en variables CSS par le
 * composant, pour que le test de contraste porte sur les valeurs réellement affichées.
 */
export const DASHBOARD_COLORS = {
  background: '#141418',
  ink: '#e8e6e3',
  vert: '#a8e6cf',
  orange: '#f0d68a',
  rouge: '#f2a39a',
} as const satisfies Record<'background' | 'ink' | GaugeLevel, string>;

/** Opacité du fond du cadre. */
export const DASHBOARD_BACKGROUND_ALPHA = 0.88;
/** Opacité des noms de jauge, plus discrets que les valeurs. */
export const DASHBOARD_MUTED_ALPHA = 0.78;
/** Opacité du cadre au repos (ni survol ni focus) ; 1 au survol et au focus. */
export const DASHBOARD_REST_OPACITY = 0.85;

/** Flèche affichée de chaque tendance (le texte lu est dans `aria-valuetext`). */
export const TREND_ARROWS: Readonly<Record<Trend, string>> = {
  hausse: '↑',
  stable: '→',
  baisse: '↓',
};

/** Bornes lues de chaque jauge (`aria-valuemin`, `aria-valuemax`). */
export const GAUGE_BOUNDS: Readonly<
  Record<DashboardGaugeId, { readonly min: number; readonly max: number }>
> = {
  temperature: { min: MIN_HEATER_TEMPERATURE, max: MAX_HEATER_TEMPERATURE },
  ammonia: { min: 0, max: GAUGE_MAX.ammonia },
  nitrite: { min: 0, max: GAUGE_MAX.nitrite },
  nitrate: { min: 0, max: GAUGE_MAX.nitrate },
  ph: { min: MIN_PH, max: MAX_PH },
};

/** Couleurs des zones de la jauge pH (#236), celles des niveaux du cadre. */
export const PH_ZONE_COLORS = {
  ideal: DASHBOARD_COLORS.vert,
  tolere: DASHBOARD_COLORS.orange,
  horsPlage: DASHBOARD_COLORS.rouge,
} as const;

/** Position d'un pH sur la jauge, en pourcentage de [`MIN_PH`, `MAX_PH`], bornée à [0, 100]. */
export function phPercent(ph: number): number {
  if (!Number.isFinite(ph)) {
    return 0;
  }
  const ratio = (ph - MIN_PH) / (MAX_PH - MIN_PH);
  return Math.round(Math.min(1, Math.max(0, ratio)) * 1000) / 10;
}

/**
 * Fond de la jauge pH (#236, ADR 0057) : dégradé à paliers nets, rouge hors de la plage
 * tolérée commune aux espèces présentes, orange entre tolérée et idéale, vert dans l'idéale.
 * Plage vide : tout rouge (tolérée) ou sans vert (idéale).
 */
export function phGaugeBackground(bands: PhBands): string {
  const { ideal, tolere, horsPlage } = PH_ZONE_COLORS;
  const stops: string[] = [];
  const band = (color: string, from: number, to: number) =>
    stops.push(`${color} ${phPercent(from)}%`, `${color} ${phPercent(to)}%`);
  if (bands.tolerated === null) {
    band(horsPlage, MIN_PH, MAX_PH);
  } else {
    band(horsPlage, MIN_PH, bands.tolerated.min);
    if (bands.ideal === null) {
      band(tolere, bands.tolerated.min, bands.tolerated.max);
    } else {
      band(tolere, bands.tolerated.min, bands.ideal.min);
      band(ideal, bands.ideal.min, bands.ideal.max);
      band(tolere, bands.ideal.max, bands.tolerated.max);
    }
    band(horsPlage, bands.tolerated.max, MAX_PH);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

const ICONS: Readonly<Record<GaugeLevel, readonly (readonly [number, number])[]>> = {
  vert: levelIconPixels('vert'),
  orange: levelIconPixels('orange'),
  rouge: levelIconPixels('rouge'),
};

/**
 * Cadre du tableau de bord (issue #256, ADR 0059) : barre haute sur bureau, bandeau sous
 * les boutons sur tablette et téléphone, qui affiche en permanence les jauges de l'eau
 * (température, ammoniaque, nitrites, nitrates, pH), chacune avec son niveau en texte et en
 * icône et sa tendance. Repliable (bouton « Eau », `aria-expanded`), estompé hors survol et
 * focus. Aucune logique de simulation : il lit les relevés que l'hôte lui donne (au plus
 * 4 fois par seconde) ; seule la mémoire de la tendance vit ici, dérivée de ces relevés.
 * Absent en mode capture (c'est l'application qui ne l'affiche pas).
 */
@Component({
  selector: 'app-dashboard-frame',
  template: `<section
      class="dashboard"
      [class.dashboard--folded]="!expanded()"
      aria-label="Tableau de bord de l’eau"
      data-dashboard
    >
      <button
        type="button"
        class="dashboard__toggle"
        [attr.aria-expanded]="expanded()"
        [attr.aria-controls]="gaugesId"
        [attr.aria-label]="toggleLabel()"
        [attr.data-water-quality]="readout().quality"
        (click)="toggle()"
      >
        <span class="dashboard__title"
          >Eau
          <span class="dashboard__chevron" aria-hidden="true">{{
            expanded() ? '▴' : '▾'
          }}</span></span
        >
        <span class="dashboard__quality" [attr.data-level]="qualityLevel()">
          <svg
            class="dashboard__icon"
            aria-hidden="true"
            [attr.viewBox]="'0 0 ' + iconGrid + ' ' + iconGrid"
            shape-rendering="crispEdges"
          >
            @for (pixel of icons[qualityLevel()]; track $index) {
              <rect [attr.x]="pixel[0]" [attr.y]="pixel[1]" width="1" height="1" />
            }
          </svg>
          {{ qualityText() }}
        </span>
      </button>
      @if (expanded()) {
        <ul class="dashboard__gauges" [id]="gaugesId">
          @for (gauge of gauges(); track gauge.id) {
            <li
              class="dashboard__gauge"
              [attr.data-gauge]="gauge.id"
              [attr.data-level]="gauge.level"
              [attr.data-trend]="gauge.trend"
              [attr.title]="gauge.spoken"
            >
              <span class="dashboard__name" aria-hidden="true">{{ gauge.label }}</span>
              <span class="dashboard__reading" aria-hidden="true">
                <span class="dashboard__value" [attr.data-gauge-value]="gauge.id">{{
                  gauge.value
                }}</span>
                @if (gauge.unit) {
                  <span class="dashboard__unit">{{ gauge.unit }}</span>
                }
                <span class="dashboard__trend" [attr.data-trend-arrow]="gauge.trend">{{
                  arrows[gauge.trend]
                }}</span>
              </span>
              <span
                class="dashboard__bar"
                role="meter"
                [attr.aria-label]="gauge.name"
                [attr.aria-valuemin]="bounds[gauge.id].min"
                [attr.aria-valuemax]="bounds[gauge.id].max"
                [attr.aria-valuenow]="valueNow(gauge.id)"
                [attr.aria-valuetext]="gauge.spoken"
              >
                @if (gauge.id === 'ph') {
                  <!-- Zones des espèces présentes et repère de la valeur (ADR 0057). -->
                  <span class="dashboard__zones" [style.background]="phBackground()"></span>
                  <span class="dashboard__mark" [style.left.%]="gauge.fill * 100"></span>
                } @else {
                  <span class="dashboard__fill" [style.width.%]="gauge.fill * 100"></span>
                }
              </span>
              <span
                class="dashboard__level"
                [attr.data-level-label]="gauge.level"
                aria-hidden="true"
              >
                <svg
                  class="dashboard__icon"
                  [attr.viewBox]="'0 0 ' + iconGrid + ' ' + iconGrid"
                  shape-rendering="crispEdges"
                >
                  @for (pixel of icons[gauge.level]; track $index) {
                    <rect [attr.x]="pixel[0]" [attr.y]="pixel[1]" width="1" height="1" />
                  }
                </svg>
                {{ gauge.levelLabel }}
              </span>
            </li>
          }
        </ul>
      }
      <p
        class="dashboard__sim"
        data-dashboard-sim
        [attr.data-phase]="phase()"
        [attr.title]="simSpoken()"
      >
        <svg
          class="dashboard__day"
          aria-hidden="true"
          [attr.viewBox]="'0 0 ' + dayGrid + ' ' + dayGrid"
          shape-rendering="crispEdges"
        >
          @for (pixel of dayPixels(); track $index) {
            <rect
              [attr.x]="pixel.x"
              [attr.y]="pixel.y"
              width="1"
              height="1"
              [attr.fill]="pixel.color"
            />
          }
        </svg>
        <span class="dashboard__phase">{{ phaseText() }}</span>
        <span class="dashboard__clock" data-dashboard-hour>{{ hourText() }}</span>
        <span class="dashboard__speed" data-dashboard-speed
          ><span class="dashboard__name">Vitesse</span> {{ speedText() }}</span
        >
      </p>
    </section>
    <app-dashboard-status [health]="health()" [alerts]="alerts()" />`,
  styleUrl: './dashboard-frame.scss',
  imports: [DashboardStatus],
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
export class DashboardFrame {
  /** Relevé exact de l'eau (fourni par l'hôte, au plus 4 fois par seconde). */
  readonly sample = input<WaterSample>(DEFAULT_WATER_SAMPLE);
  /** Relevé arrondi de l'eau (fourni par l'hôte) : indicateur global et zone du pH. */
  readonly readout = input<WaterReadout>(DEFAULT_WATER_READOUT);

  /** Synthèse de la santé des animaux (fournie par l'hôte, au rythme des relevés de l'eau). */
  readonly health = input<HealthSummary>(EMPTY_HEALTH_SUMMARY);
  /** Moment de la journée (indicateur du jour, #73). */
  readonly phase = input<DayPhase>('jour');
  /** Heure de la journée simulée, arrondie au quart d'heure par l'hôte. */
  readonly hour = input<number>(DEFAULT_START_HOUR);
  /** Vitesse de simulation. */
  readonly speed = input<number>(DEFAULT_SIM_SPEED);

  /** Jauges dépliées (oui au départ : le cadre est fait pour être vu). */
  readonly expanded = signal(true);

  protected readonly gaugesId = DASHBOARD_GAUGES_ID;
  protected readonly iconGrid = LEVEL_ICON_GRID;
  protected readonly icons = ICONS;
  protected readonly arrows = TREND_ARROWS;
  protected readonly bounds = GAUGE_BOUNDS;
  protected readonly colors = DASHBOARD_COLORS;
  protected readonly backgroundAlpha = DASHBOARD_BACKGROUND_ALPHA;
  protected readonly mutedAlpha = DASHBOARD_MUTED_ALPHA;
  protected readonly restOpacity = DASHBOARD_REST_OPACITY;

  /** Mémoire de la tendance, avancée à chaque nouveau relevé (`nextTrendState`). */
  private readonly trendState = linkedSignal<WaterSample, TrendState>({
    source: this.sample,
    computation: (sample, previous) => nextTrendState(previous?.value ?? EMPTY_TREND_STATE, sample),
  });

  protected readonly gauges = computed(() =>
    dashboardGauges(this.sample(), this.readout(), gaugeTrends(this.trendState(), this.sample())),
  );
  protected readonly phBackground = computed(() => phGaugeBackground(this.readout().phBands));
  protected readonly qualityLevel = computed(() => QUALITY_LEVELS[this.readout().quality]);
  protected readonly qualityText = computed(() => WATER_QUALITY_LABELS[this.readout().quality]);
  protected readonly toggleLabel = computed(
    () =>
      `Eau : ${this.qualityText().toLowerCase()}. ${this.expanded() ? 'Replier' : 'Déplier'} les jauges`,
  );

  protected readonly dayGrid = DAY_ICON_GRID;
  protected readonly dayPixels = computed(() => dayIconPixels(this.phase()));
  protected readonly phaseText = computed(() => capitalize(DAY_PHASE_LABELS[this.phase()]));
  protected readonly hourText = computed(() =>
    Number.isFinite(this.hour()) ? formatHour(this.hour()) : '–',
  );
  protected readonly speedText = computed(() => speedLabel(this.speed()));
  protected readonly simSpoken = computed(
    () =>
      `Simulation : ${DAY_PHASE_LABELS[this.phase()]}, ${this.hourText()}, ${
        this.speed() === 0 ? 'en pause' : `vitesse ${this.speedText()}`
      }`,
  );
  /** Alertes de l'eau et des animaux (`sim/dashboard-alerts.ts`), recalculées à chaque relevé. */
  protected readonly alerts = computed(() =>
    dashboardAlerts({
      sample: this.sample(),
      phBands: this.readout().phBands,
      health: this.health(),
    }),
  );

  /** Replie ou déplie les jauges. */
  toggle(): void {
    this.expanded.update((open) => !open);
  }

  /** Valeur exacte lue d'une jauge (`aria-valuenow`), absente si elle n'est pas finie. */
  protected valueNow(id: DashboardGaugeId): number | null {
    const value = this.sample()[id];
    return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
  }
}

/** Première lettre en capitale (« nuit » → « Nuit »). */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
