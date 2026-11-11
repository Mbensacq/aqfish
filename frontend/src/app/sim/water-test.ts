import { SIM_DT } from './constants';
import { COMPOUND_THRESHOLDS, type QualityThresholds } from './water-quality';

/**
 * Kits de test de l'eau (issue #564, ADR 0131) : le joueur lance un test depuis la pharmacie,
 * le résultat arrive après `WATER_TEST_TICKS` pas de simulation et s'affiche arrondi au palier
 * de couleur le plus proche, comme sur la carte d'un kit. Fonctions pures, sans hasard ni
 * horloge : l'échantillon est pris au lancement (comme le tube que l'on remplit), le délai se
 * compte en pas de simulation (une simulation arrêtée n'avance pas le test). Le test en cours
 * est tenu par l'hôte, hors du monde : rien n'est sauvegardé.
 *
 * **Approximations de jeu** : les paliers reprennent la forme des cartes de couleur des kits
 * en gouttes courants (`docs/SOINS.md` § 1.5 et § 6 ne donnent pas de cartes) ; ammoniaque,
 * nitrites et nitrates sont lus en **unités de jeu** (`sim/water.ts`), pas en mg/L. La dureté
 * se titre goutte à goutte : une goutte par degré allemand, comptée jusqu'au virage.
 */

/** Kits de la pharmacie, dans l'ordre affiché. */
export const WATER_KITS = ['ph', 'ammoniaque', 'nitrites', 'nitrates', 'durete'] as const;

/** Kit de test. */
export type WaterKit = (typeof WATER_KITS)[number];

/** Grandeur lue par un kit. */
export type WaterTestParameter = 'ph' | 'ammonia' | 'nitrite' | 'nitrate' | 'gh' | 'kh';

/** Ce qu'un test lit de l'eau : valeurs exactes, dureté déjà résolue (`waterHardness`). */
export interface WaterTestSample {
  readonly ph: number;
  readonly ammonia: number;
  readonly nitrite: number;
  readonly nitrate: number;
  readonly gh: number;
  readonly kh: number;
}

/** Lecture d'un kit : carte de couleurs (palier le plus proche) ou titrage (gouttes). */
export type KitReading = 'carte' | 'gouttes';

/** Description d'un kit : nom, grandeurs lues, mode de lecture, paliers. */
export interface WaterKitInfo {
  readonly label: string;
  readonly parameters: readonly WaterTestParameter[];
  readonly reading: KitReading;
  /** Paliers de la carte, croissants (lecture `carte`) ; vide pour un titrage. */
  readonly chart: readonly number[];
  /** Unité affichée après la valeur (vide pour le pH). */
  readonly unit: string;
}

/** Plafond d'un titrage : au-delà, le kit dit « au moins ». */
export const MAX_DROPS = 30;

/** Kits : approximations de jeu (voir l'en-tête). */
export const WATER_KIT_INFO: Readonly<Record<WaterKit, WaterKitInfo>> = {
  ph: {
    label: 'pH',
    parameters: ['ph'],
    reading: 'carte',
    chart: [6, 6.4, 6.6, 6.8, 7, 7.2, 7.6, 7.8, 8, 8.2, 8.4, 8.8],
    unit: '',
  },
  ammoniaque: {
    label: 'Ammoniaque',
    parameters: ['ammonia'],
    reading: 'carte',
    chart: [0, 0.25, 0.5, 1, 2, 4, 8],
    unit: 'u.',
  },
  nitrites: {
    label: 'Nitrites',
    parameters: ['nitrite'],
    reading: 'carte',
    chart: [0, 0.25, 0.5, 1, 2, 5],
    unit: 'u.',
  },
  nitrates: {
    label: 'Nitrates',
    parameters: ['nitrate'],
    reading: 'carte',
    chart: [0, 5, 10, 20, 40, 80, 160],
    unit: 'u.',
  },
  durete: {
    label: 'Dureté',
    parameters: ['gh', 'kh'],
    reading: 'gouttes',
    chart: [],
    unit: 'gouttes',
  },
};

/** Nom court de chaque grandeur. */
export const PARAMETER_LABELS: Readonly<Record<WaterTestParameter, string>> = {
  ph: 'pH',
  ammonia: 'NH₃/NH₄⁺',
  nitrite: 'NO₂⁻',
  nitrate: 'NO₃⁻',
  gh: 'GH',
  kh: 'KH',
};

/**
 * Délai d'un test, en pas de simulation : 10 s simulées (600 pas de `SIM_DT`). Approximation
 * de jeu : un vrai kit en gouttes demande quelques minutes, raccourcies pour rester jouables.
 */
export const WATER_TEST_TICKS = 600;

/** Position d'une valeur par rapport aux bornes du kit. */
export type ReadingBound = 'dedans' | 'au-dessous' | 'au-dessus';

/** Valeur lue par un kit : palier (ou nombre de gouttes) et position par rapport aux bornes. */
export interface KitValue {
  readonly parameter: WaterTestParameter;
  readonly value: number;
  readonly bound: ReadingBound;
}

/**
 * Palier de `chart` le plus proche de `value`. À égale distance, le palier du dessus (lecture
 * prudente). Hors des bornes : le palier extrême, marqué `au-dessous` ou `au-dessus`. Une
 * valeur non finie lit le dernier palier, `au-dessus` : un kit ne doit jamais rassurer à tort.
 *
 * @throws RangeError si `chart` est vide.
 */
export function roundToChart(value: number, chart: readonly number[]): Omit<KitValue, 'parameter'> {
  if (chart.length === 0) {
    throw new RangeError('Carte de couleurs vide');
  }
  const last = chart[chart.length - 1];
  if (!Number.isFinite(value) || value > last) {
    return { value: last, bound: 'au-dessus' };
  }
  if (value < chart[0]) {
    return { value: chart[0], bound: 'au-dessous' };
  }
  let best = chart[0];
  for (const step of chart) {
    // Écart arrondi au millionième : 0,375 doit être à égale distance de 0,25 et de 0,5.
    if (Math.round((Math.abs(value - step) - Math.abs(value - best)) * 1e6) <= 0) {
      best = step;
    }
  }
  return { value: best, bound: 'dedans' };
}

/**
 * Gouttes d'un titrage de dureté `value` (°d) : une goutte par degré, comptées jusqu'au virage
 * de couleur, donc arrondi au degré supérieur, au moins une goutte (l'eau osmosée vire dès la
 * première). Au-delà de `MAX_DROPS`, ou valeur non finie : `MAX_DROPS`, `au-dessus`.
 */
export function dropCount(value: number): Omit<KitValue, 'parameter'> {
  if (!Number.isFinite(value) || value > MAX_DROPS) {
    return { value: MAX_DROPS, bound: 'au-dessus' };
  }
  // Tolérance au millionième : 7,0000001 (bruit des flottants) reste 7 gouttes.
  return { value: Math.max(1, Math.ceil(value - 1e-6)), bound: 'dedans' };
}

/** Valeurs lues par `kit` dans `sample`, dans l'ordre de `WATER_KIT_INFO[kit].parameters`. */
export function readKit(kit: WaterKit, sample: WaterTestSample): readonly KitValue[] {
  const info = WATER_KIT_INFO[kit];
  return info.parameters.map((parameter) => ({
    parameter,
    ...(info.reading === 'gouttes'
      ? dropCount(sample[parameter])
      : roundToChart(sample[parameter], info.chart)),
  }));
}

/** Test lancé : kit, pas de départ, valeurs lues dans l'échantillon pris au lancement. */
export interface WaterTest {
  readonly kit: WaterKit;
  readonly startTick: number;
  readonly values: readonly KitValue[];
}

/** Lance un test de `kit` au pas `tick` sur l'échantillon `sample`. */
export function startWaterTest(kit: WaterKit, sample: WaterTestSample, tick: number): WaterTest {
  return { kit, startTick: tick, values: readKit(kit, sample) };
}

/** Pas restants avant le résultat de `test` au pas `tick`, dans [0, `WATER_TEST_TICKS`]. */
export function waterTestRemainingTicks(test: WaterTest, tick: number): number {
  const elapsed = tick - test.startTick;
  if (!Number.isFinite(elapsed)) {
    return WATER_TEST_TICKS;
  }
  return Math.min(WATER_TEST_TICKS, Math.max(0, WATER_TEST_TICKS - elapsed));
}

/** Vrai si le résultat de `test` est prêt au pas `tick`. */
export function waterTestDone(test: WaterTest, tick: number): boolean {
  return waterTestRemainingTicks(test, tick) === 0;
}

/** Valeur affichée : « 7,2 », « ≥ 8 u. », « 7 gouttes ». */
export function formatKitValue(kit: WaterKit, value: KitValue): string {
  const unit = WATER_KIT_INFO[kit].unit;
  const prefix = value.bound === 'au-dessus' ? '≥ ' : value.bound === 'au-dessous' ? '≤ ' : '';
  // pH à une décimale, comme sur la carte (« 7,0 ») ; les autres paliers tels quels.
  const number = (kit === 'ph' ? value.value.toFixed(1) : String(value.value)).replace('.', ',');
  const suffix =
    unit === 'gouttes' ? ` goutte${value.value > 1 ? 's' : ''}` : unit === '' ? '' : ` ${unit}`;
  return `${prefix}${number}${suffix}`;
}

const WATER_CHANGE = 'changer une partie de l’eau (Réglages, Eau)';

function compoundAdvice(
  value: KitValue,
  thresholds: QualityThresholds,
  remedy: string,
): string | null {
  if (value.bound === 'au-dessus' || value.value >= thresholds.bad) {
    return `trop haut : ${remedy}.`;
  }
  return value.value >= thresholds.watch ? `à surveiller : ${remedy}.` : null;
}

/**
 * Conseil d'un résultat, en une phrase : ce que le palier lu demande. Lu sur le palier (le
 * joueur ne voit que lui) avec les seuils du tableau de bord (`COMPOUND_THRESHOLDS`).
 */
export function kitAdvice(kit: WaterKit, values: readonly KitValue[]): string {
  const first = values[0];
  switch (kit) {
    case 'ph':
      return 'Comparer à la plage des espèces (fiches du wiki) ; corriger pas à pas (régulateur de pH, catappa pour acidifier doucement).';
    case 'ammoniaque':
    case 'nitrites': {
      const advice =
        first === undefined
          ? null
          : compoundAdvice(
              first,
              COMPOUND_THRESHOLDS[kit === 'ammoniaque' ? 'ammonia' : 'nitrite'],
              `${WATER_CHANGE}, nourrir moins ; filtre jeune : amorce de bactéries`,
            );
      return advice === null ? 'Rien à signaler : le filtre suit.' : `Valeur ${advice}`;
    }
    case 'nitrates': {
      const advice =
        first === undefined
          ? null
          : compoundAdvice(first, COMPOUND_THRESHOLDS.nitrate, WATER_CHANGE);
      return advice === null ? 'Rien à signaler.' : `Valeur ${advice}`;
    }
    case 'durete':
      return 'Dureté de l’eau du robinet : seul le changement d’eau la fait bouger.';
  }
}

/** Vue d'un test pour la pharmacie. */
export interface WaterTestView {
  readonly kit: WaterKit;
  readonly startTick: number;
  readonly done: boolean;
  /** Secondes simulées restantes, arrondies au-dessus (0 une fois prêt). */
  readonly remainingSeconds: number;
  /** Valeurs affichées (`formatKitValue`), avec leur grandeur ; vide tant que le test court. */
  readonly results: readonly { readonly label: string; readonly text: string }[];
  /** Conseil du résultat (`kitAdvice`) ; `null` tant que le test court. */
  readonly advice: string | null;
}

/** Vue de `test` au pas `tick`. */
export function waterTestView(test: WaterTest, tick: number): WaterTestView {
  const remaining = waterTestRemainingTicks(test, tick);
  const done = remaining === 0;
  return {
    kit: test.kit,
    startTick: test.startTick,
    done,
    // Arrondi au millionième avant le plafond : 600 × (1/60) vaut 10,000000000000002.
    remainingSeconds: Math.ceil(Math.round(remaining * SIM_DT * 1e6) / 1e6),
    results: done
      ? test.values.map((value) => ({
          label: PARAMETER_LABELS[value.parameter],
          text: formatKitValue(test.kit, value),
        }))
      : [],
    advice: done ? kitAdvice(test.kit, test.values) : null,
  };
}

/** Vrai si `a` et `b` affichent le même test. */
export function sameWaterTestView(a: WaterTestView | null, b: WaterTestView | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.kit === b.kit &&
    a.startTick === b.startTick &&
    a.done === b.done &&
    a.remainingSeconds === b.remainingSeconds
  );
}

/** Vrai si `value` est un kit de `WATER_KITS`. */
export function isWaterKit(value: unknown): value is WaterKit {
  return WATER_KITS.some((kit) => kit === value);
}
