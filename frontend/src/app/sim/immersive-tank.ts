import { setCareModeInPlace } from './care-mode';
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
 * petites espèces nageuses d'abord. Ce n'est pas une simulation réaliste.
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

/** Espèces nageuses (ni marcheuses ni amphibiennes), de la plus petite à la plus grande. */
export function smallSwimmers(): readonly SpeciesId[] {
  return (Object.values(SPECIES) as (typeof SPECIES)[SpeciesId][])
    .filter((def) => def.walker === undefined && def.amphibian === undefined)
    .sort((a, b) => a.bodyLength - b.bodyLength || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((def) => def.id);
}

/** Effectifs du bac immersif, des plus petites espèces aux plus grandes. */
export const IMMERSIVE_COUNTS: readonly number[] = [8, 5, 3];

/** Population par défaut du bac immersif : les plus petites espèces nageuses d'abord. */
export function immersivePopulation(): readonly PopulationEntry[] {
  return smallSwimmers()
    .slice(0, IMMERSIVE_COUNTS.length)
    .map((species, i) => ({ species, count: IMMERSIVE_COUNTS[i] }));
}

/**
 * Monde du mode immersif : bac tropical aux dimensions `layout.dimensions`, sans décor, en
 * mode décor, peuplé par `immersivePopulation`. Jamais sauvegardé.
 */
export function createImmersiveWorld(seed: number, layout: ImmersiveLayout): World {
  const world = createWorld(seed, immersivePopulation(), [], [], {
    environment: 'tropical',
    dimensions: layout.dimensions,
    immersive: true,
  }) as MutableWorld;
  setCareModeInPlace(world, 'decor');
  return world;
}
