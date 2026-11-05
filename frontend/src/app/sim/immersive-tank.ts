import { setCareModeInPlace } from './care-mode';
import { isImmersiveEnvironment, livesIn, type ImmersiveEnvironmentId } from './environment';
import { SPECIES, type SpeciesId } from './species';
import { IMMERSIVE_LIMITS, clampImmersiveDimensions, type TankDimensions } from './tank';
import { createWorld, type MutableWorld, type PopulationEntry, type World } from './world';

/**
 * Bac du mode immersif (#345, ADR 0086) : le bac prend les proportions exactes de l'écran,
 * dont la vitre avant est la face visible. L'échelle est la plus proche du réel que permet la
 * nage (`IMMERSIVE_LIMITS`) : sur un petit écran, le bac simulé est agrandi uniformément, et
 * la vue (distance de l'œil comprise) l'est d'autant ; l'image est la même qu'à l'échelle 1.
 *
 * Contenu : mode décor (#278, ADR 0077), sans eau à entretenir ni alerte, avec les plus
 * petites espèces nageuses de l'environnement choisi d'abord (bac tropical ou récif, #375,
 * ADR 0094). Ce n'est pas une simulation réaliste.
 */

/** Profondeur physique du bac immersif, en millimètres : bornes. */
export const IMMERSIVE_DEPTH_MM = { min: 20, max: 600 } as const;

/** Part du petit côté de l'écran prise comme profondeur par défaut. */
export const DEFAULT_DEPTH_RATIO = 0.6;

/** Taille physique d'un écran, en millimètres. */
export interface ScreenMm {
  readonly width: number;
  readonly height: number;
}

/** Disposition du bac immersif. */
export interface ImmersiveLayout {
  /** Dimensions du bac simulé, en mètres (vitre avant : `width` × `height`). */
  readonly dimensions: TankDimensions;
  /**
   * Mètres simulés par mètre réel (≥ 1 sauf écran géant) : multiplier une longueur physique
   * (distance de l'œil) par `scale` donne sa longueur dans la scène.
   */
  readonly scale: number;
  /** Vrai si les proportions de l'écran sortent des bornes (vitre et écran diffèrent). */
  readonly aspectClamped: boolean;
}

/** Profondeur physique par défaut, en millimètres, pour un écran `screen`. */
export function defaultDepthMm(screen: ScreenMm): number {
  return clampDepthMm(DEFAULT_DEPTH_RATIO * Math.min(screen.width, screen.height));
}

/** Profondeur `mm` ramenée à `IMMERSIVE_DEPTH_MM` ; non finie : le minimum. */
export function clampDepthMm(mm: number): number {
  return Number.isFinite(mm)
    ? Math.min(IMMERSIVE_DEPTH_MM.max, Math.max(IMMERSIVE_DEPTH_MM.min, mm))
    : IMMERSIVE_DEPTH_MM.min;
}

/**
 * Bac aux proportions de l'écran `screen` (mm), profond de `depthMm` (borné).
 * @throws RangeError si une dimension de l'écran n'est pas un réel strictement positif.
 */
export function immersiveLayout(screen: ScreenMm, depthMm: number): ImmersiveLayout {
  if (
    !Number.isFinite(screen.width) ||
    !Number.isFinite(screen.height) ||
    screen.width <= 0 ||
    screen.height <= 0
  ) {
    throw new RangeError(`écran invalide : ${screen.width} × ${screen.height} mm`);
  }
  const w = screen.width / 1000;
  const h = screen.height / 1000;
  const { width: lw, height: lh } = IMMERSIVE_LIMITS;
  // Plus petit agrandissement qui atteint les minimums, sans dépasser les maximums.
  let scale = Math.max(1, lw.min / w, lh.min / h);
  scale = Math.min(scale, lw.max / w, lh.max / h);
  const raw = {
    width: w * scale,
    height: h * scale,
    depth: (clampDepthMm(depthMm) / 1000) * scale,
  };
  const dimensions = clampImmersiveDimensions(raw);
  const aspectClamped =
    Math.abs(dimensions.width / dimensions.height - w / h) > 1e-9 * Math.max(1, w / h);
  return { dimensions, scale, aspectClamped };
}

/** Environnement du bac immersif à l'ouverture du mode. */
export const DEFAULT_IMMERSIVE_ENVIRONMENT: ImmersiveEnvironmentId = 'tropical';

/**
 * Espèces nageuses (ni marcheuses ni amphibiennes) qui vivent dans `environment`
 * (`livesIn`), de la plus petite à la plus grande.
 * @throws RangeError si `environment` n'est pas proposé au mode immersif.
 */
export function smallSwimmers(
  environment: ImmersiveEnvironmentId = DEFAULT_IMMERSIVE_ENVIRONMENT,
): readonly SpeciesId[] {
  assertImmersiveEnvironment(environment);
  return (Object.values(SPECIES) as (typeof SPECIES)[SpeciesId][])
    .filter(
      (def) =>
        def.walker === undefined && def.amphibian === undefined && livesIn(environment, def.id),
    )
    .sort((a, b) => a.bodyLength - b.bodyLength || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((def) => def.id);
}

/** Effectifs du bac immersif, des plus petites espèces aux plus grandes (au plus). */
export const IMMERSIVE_COUNTS: readonly number[] = [8, 5, 3];

/**
 * Surface de vitre avant laissée à chaque poisson, en carrés de sa longueur (#390) : sur un
 * petit écran (téléphone), les espèces plus grandes du récif sont moins nombreuses, pour ne
 * pas s'entasser. Les petites espèces du bac tropical gardent leurs effectifs dès le plus
 * petit bac immersif (`IMMERSIVE_LIMITS`).
 */
export const IMMERSIVE_FRONT_AREA_PER_FISH = 6;

/**
 * Effectif de `species` au rang `rank` dans un bac `dimensions` : `IMMERSIVE_COUNTS[rank]`
 * au plus, autant que la vitre avant en loge (`IMMERSIVE_FRONT_AREA_PER_FISH`), 1 au moins.
 */
export function immersiveCount(
  species: SpeciesId,
  rank: number,
  dimensions?: TankDimensions,
): number {
  const max = IMMERSIVE_COUNTS[rank];
  if (!dimensions) {
    return max;
  }
  const length = SPECIES[species].bodyLength;
  const room =
    (dimensions.width * dimensions.height) / (IMMERSIVE_FRONT_AREA_PER_FISH * length ** 2);
  const fits = Number.isFinite(room) ? Math.floor(room + 1e-9) : max;
  return Math.max(1, Math.min(max, fits));
}

/**
 * Population par défaut du bac immersif de `environment` : ses plus petites espèces
 * nageuses d'abord, au plus `IMMERSIVE_COUNTS.length` espèces. Avec `dimensions` (bac de
 * l'écran), les effectifs sont limités à ce que la vitre avant loge (`immersiveCount`).
 * @throws RangeError si `environment` n'est pas proposé au mode immersif.
 */
export function immersivePopulation(
  environment: ImmersiveEnvironmentId = DEFAULT_IMMERSIVE_ENVIRONMENT,
  dimensions?: TankDimensions,
): readonly PopulationEntry[] {
  return smallSwimmers(environment)
    .slice(0, IMMERSIVE_COUNTS.length)
    .map((species, i) => ({ species, count: immersiveCount(species, i, dimensions) }));
}

/**
 * Monde du mode immersif : bac de `environment` aux dimensions `layout.dimensions`, sans
 * décor posé, en mode décor, peuplé par `immersivePopulation` à ces dimensions. Jamais sauvegardé. Au récif,
 * coraux et anémones sont tirés de la graine dans ces dimensions, comme pour tout récif.
 * @throws RangeError si `environment` n'est pas proposé au mode immersif.
 */
export function createImmersiveWorld(
  seed: number,
  layout: ImmersiveLayout,
  environment: ImmersiveEnvironmentId = DEFAULT_IMMERSIVE_ENVIRONMENT,
): World {
  const world = createWorld(seed, immersivePopulation(environment, layout.dimensions), [], [], {
    environment,
    dimensions: layout.dimensions,
    immersive: true,
  }) as MutableWorld;
  setCareModeInPlace(world, 'decor');
  return world;
}

function assertImmersiveEnvironment(environment: unknown): void {
  if (!isImmersiveEnvironment(environment)) {
    throw new RangeError(`pas de bac immersif dans l’environnement ${String(environment)}`);
  }
}
