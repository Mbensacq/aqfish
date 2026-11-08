import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  DEFAULT_WATER_SAMPLE,
  GAUGE_NAMES,
  GAUGE_UNITS,
  formatTenth,
  type DashboardGaugeId,
  type WaterSample,
} from '../../sim/water-dashboard';
import {
  WATER_HISTORY_CAPACITY,
  toleratedRange,
  type WaterHistoryView,
} from '../../sim/water-history';
import type { PhBands } from '../../sim/water-ph';
import { DEFAULT_WATER_READOUT } from '../../sim/water-quality';

/** Hauteur de la courbe, en pixels de la grille (largeur : un pixel par relevé). */
export const CURVE_HEIGHT = 24;

/** Écart minimal de l'échelle verticale, pour qu'une eau stable ne dessine pas de faux relief. */
export const CURVE_MIN_SPAN: Readonly<Record<DashboardGaugeId, number>> = {
  temperature: 2,
  ammonia: 1,
  nitrite: 1,
  nitrate: 5,
  ph: 0.5,
};

/** Une colonne de la courbe, en pixels de la grille. */
export interface CurveColumn {
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

/** Courbe prête à dessiner. Objet de données pur. */
export interface CurveGeometry {
  readonly columns: readonly CurveColumn[];
  readonly marks: readonly number[];
  /** Plage tolérée, rognée à l'échelle ; `null` : hors de l'échelle ou aucune. */
  readonly band: { readonly y: number; readonly height: number } | null;
  readonly min: number;
  readonly max: number;
  /** Valeurs extrêmes de la série ; `null` si elle n'a aucune valeur finie. */
  readonly range: { readonly min: number; readonly max: number } | null;
}

/**
 * Géométrie de la courbe : le relevé le plus récent à droite, un pixel par relevé, échelle
 * calée sur les valeurs (au moins `minSpan`). Une colonne relie sa valeur à la précédente, un
 * trou (valeur non finie) coupe la courbe.
 */
export function curveGeometry(
  values: readonly number[],
  marks: readonly number[],
  band: { readonly min: number; readonly max: number } | null,
  minSpan: number,
): CurveGeometry {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return { columns: [], marks: [], band: null, min: 0, max: 0, range: null };
  }
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const center = (low + high) / 2;
  const span = Math.max(high - low, minSpan);
  const min = center - span / 2;
  const max = center + span / 2;
  const rowOf = (value: number): number =>
    Math.min(
      CURVE_HEIGHT - 1,
      Math.max(0, Math.round(((max - value) / (max - min)) * (CURVE_HEIGHT - 1))),
    );
  const offset = WATER_HISTORY_CAPACITY - values.length;
  const columns: CurveColumn[] = [];
  let previous: number | null = null;
  values.forEach((value, rank) => {
    if (!Number.isFinite(value)) {
      previous = null;
      return;
    }
    const row = rowOf(value);
    const top = previous === null ? row : Math.min(row, previous);
    const bottom = previous === null ? row : Math.max(row, previous);
    columns.push({ x: offset + rank, y: top, height: bottom - top + 1 });
    previous = row;
  });
  return {
    columns,
    marks: marks.map((rank) => offset + rank),
    band: clippedBand(band, min, max),
    min,
    max,
    range: { min: low, max: high },
  };
}

function clippedBand(
  band: { readonly min: number; readonly max: number } | null,
  min: number,
  max: number,
): CurveGeometry['band'] {
  if (band === null || band.max < min || band.min > max) {
    return null;
  }
  const y = Math.round(((max - Math.min(band.max, max)) / (max - min)) * CURVE_HEIGHT);
  const bottom = Math.round(((max - Math.max(band.min, min)) / (max - min)) * CURVE_HEIGHT);
  return bottom > y ? { y, height: bottom - y } : null;
}

/** Valeur lue, avec son unité parlée (« 12,5 unités de jeu »). */
function spokenValue(value: number, id: DashboardGaugeId): string {
  const unit = GAUGE_UNITS[id].spoken;
  return unit === '' ? formatTenth(value) : `${formatTenth(value)} ${unit}`;
}

/** Valeur affichée, avec son unité courte (« 12,5 u. »). */
function shownValue(value: number, id: DashboardGaugeId): string {
  const unit = GAUGE_UNITS[id].short;
  return unit === '' ? formatTenth(value) : `${formatTenth(value)} ${unit}`;
}

/** Phrase lue aux lecteurs d'écran : valeur actuelle, extrêmes, changements d'eau. */
export function curveSummary(
  id: DashboardGaugeId,
  current: number,
  geometry: CurveGeometry,
  waterChanges: number,
): string {
  const name = GAUGE_NAMES[id].full;
  if (geometry.range === null) {
    return `${name} : pas encore de relevé sur les dernières 24 h.`;
  }
  const changes =
    waterChanges === 0
      ? 'aucun changement d’eau'
      : `${waterChanges} changement${waterChanges > 1 ? 's' : ''} d’eau`;
  return `${name} sur les dernières 24 h : ${spokenValue(current, id)} maintenant, minimum ${spokenValue(geometry.range.min, id)}, maximum ${spokenValue(geometry.range.max, id)}, ${changes}.`;
}

/**
 * Mini-courbe pixel art d'une jauge d'eau sur les dernières 24 h de jeu (issue #511,
 * ADR 0118). La lecture ne repose pas sur la couleur : plage tolérée en motif tramé, valeur
 * actuelle et extrêmes en texte, changements d'eau en traits pleins. Aucune logique de
 * simulation : elle dessine la vue que lui donne l'hôte.
 */
@Component({
  selector: 'app-water-history-chart',
  template: `<section
    class="curve"
    role="group"
    [attr.aria-label]="'Courbe sur 24 h : ' + name()"
    tabindex="-1"
    data-water-curve
    [attr.data-gauge]="gauge()"
    [attr.data-points]="geometry().columns.length"
    [attr.data-marks]="geometry().marks.length"
  >
    <p class="curve__head">
      <span class="curve__name">{{ name() }}</span>
      <span class="curve__now" data-water-curve-now>{{ now() }}</span>
    </p>
    <svg
      class="curve__plot"
      role="img"
      [attr.aria-label]="summary()"
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      preserveAspectRatio="none"
      shape-rendering="crispEdges"
    >
      <defs>
        <pattern id="curve-trame" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill="currentColor" />
          <rect x="1" y="1" width="1" height="1" fill="currentColor" />
        </pattern>
      </defs>
      @if (geometry().band; as band) {
        <rect
          class="curve__band"
          data-water-curve-band
          x="0"
          [attr.y]="band.y"
          [attr.width]="width"
          [attr.height]="band.height"
          fill="url(#curve-trame)"
        />
      }
      @for (x of geometry().marks; track x) {
        <rect
          class="curve__mark"
          data-water-curve-mark
          [attr.x]="x"
          y="0"
          width="1"
          [attr.height]="height"
        />
      }
      @for (column of geometry().columns; track column.x) {
        <rect
          class="curve__line"
          [attr.x]="column.x"
          [attr.y]="column.y"
          width="1"
          [attr.height]="column.height"
        />
      }
    </svg>
    <p class="curve__scale" aria-hidden="true">
      <span>−24 h</span>
      <span>{{ extremes() }}</span>
      <span>maintenant</span>
    </p>
    <p class="curve__legend" aria-hidden="true">Trame : plage tolérée · Trait : changement d’eau</p>
  </section>`,
  styleUrl: './water-history-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaterHistoryChart {
  readonly gauge = input.required<DashboardGaugeId>();
  readonly history = input<WaterHistoryView | null>(null);
  readonly sample = input<WaterSample>(DEFAULT_WATER_SAMPLE);
  readonly bands = input<PhBands>(DEFAULT_WATER_READOUT.phBands);

  protected readonly width = WATER_HISTORY_CAPACITY;
  protected readonly height = CURVE_HEIGHT;

  protected readonly name = computed(() => GAUGE_NAMES[this.gauge()].full);
  protected readonly geometry = computed(() => {
    const id = this.gauge();
    const history = this.history();
    return curveGeometry(
      history?.series[id] ?? [],
      history?.marks ?? [],
      toleratedRange(id, this.sample().environment, this.bands()),
      CURVE_MIN_SPAN[id],
    );
  });
  protected readonly now = computed(() => shownValue(this.sample()[this.gauge()], this.gauge()));
  protected readonly extremes = computed(() => {
    const range = this.geometry().range;
    return range === null
      ? 'pas encore de relevé'
      : `min ${formatTenth(range.min)} · max ${formatTenth(range.max)}`;
  });
  protected readonly summary = computed(() =>
    curveSummary(
      this.gauge(),
      this.sample()[this.gauge()],
      this.geometry(),
      this.geometry().marks.length,
    ),
  );
}
