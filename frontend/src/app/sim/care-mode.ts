import { livesIn, type EnvironmentId } from './environment';
import { SPECIES, type SpeciesId } from './species';
import type { MutableWorld, World } from './world';

/**
 * Mode d'un bac (#278, ADR 0077) : « Soins », la simulation complète (eau, faim, santé,
 * alertes, espèces de l'environnement), ou « Décor », un aquarium purement graphique.
 *
 * En mode décor, l'eau, la faim et la santé ne changent pas (`stepInPlace`, `sim/world.ts`) :
 * l'état de soin est **mis en pause**, pas effacé, et reprend tel quel au retour en mode
 * soins. Aucune alerte n'est calculée (`worstAlert`) et toute espèce du catalogue s'ajoute,
 * quel que soit le milieu (`acceptsSpecies`).
 *
 * Le mode est un champ du monde du bac (`World.careMode`) : la boucle d'affichage avance le
 * bac affiché en place et ne connaît que son monde. Absent, c'est le mode soins d'un bac qui
 * n'est jamais passé par le mode décor (anciennes sauvegardes, captures à l'octet).
 */

/** Modes d'un bac, dans l'ordre du sélecteur. */
export const CARE_MODES = ['soins', 'decor'] as const;

/** Mode d'un bac. */
export type CareMode = (typeof CARE_MODES)[number];

/** Libellés affichés des modes. */
export const CARE_MODE_LABELS: Readonly<Record<CareMode, string>> = {
  soins: 'Soins',
  decor: 'Décor',
};

/** Texte du badge permanent d'un bac en mode décor (#278). */
export const DECOR_BADGE_TEXT = 'Mode décor : pas une simulation réaliste';

/** Vrai si `value` est un mode de bac. */
export function isCareMode(value: unknown): value is CareMode {
  return value === 'soins' || value === 'decor';
}

/** Mode du bac de `world` : `soins` si le champ est absent. */
export function careModeOf(world: Pick<World, 'careMode'>): CareMode {
  return world.careMode ?? 'soins';
}

/** Vrai si le bac de `world` est en mode décor. */
export function isDecorMode(world: Pick<World, 'careMode'>): boolean {
  return world.careMode === 'decor';
}

/**
 * Règle le mode du bac, **en modifiant** `world`. L'état de soin (eau, faim, santé) n'est
 * pas touché : il est seulement mis en pause en mode décor. Un bac jamais passé par le mode
 * décor reste sans champ en mode soins (sauvegardes et captures inchangées) ; ensuite, le
 * mode est toujours écrit (`soins` explicite : le bac peut garder des animaux d'un autre
 * milieu, voir `acceptsSavedSpecies`).
 * @throws RangeError si le mode est inconnu (monde inchangé).
 */
export function setCareModeInPlace(world: MutableWorld, mode: CareMode): void {
  if (!isCareMode(mode)) {
    throw new RangeError(`mode de bac inconnu : ${String(mode)}`);
  }
  if (mode === 'soins' && world.careMode === undefined) {
    return;
  }
  world.careMode = mode;
}

/**
 * Vrai si l'on peut **ajouter** l'espèce `species` au bac de `world` : toute espèce en mode
 * décor (milieu, volume et compatibilité ignorés), celles de l'environnement en mode soins.
 */
export function acceptsSpecies(
  world: Pick<World, 'environment' | 'careMode'>,
  species: SpeciesId,
): boolean {
  return isDecorMode(world) || livesIn(world.environment, species);
}

/**
 * Vrai si une sauvegarde peut contenir l'espèce `species` dans un bac de l'environnement
 * `environment` au mode enregistré `careMode` : toute espèce dès que le mode est écrit (bac
 * passé par le mode décor, dont les animaux d'un autre milieu sont gardés au retour en mode
 * soins, lot 1), celles de l'environnement sinon (anciennes sauvegardes, validation stricte).
 */
export function acceptsSavedSpecies(
  environment: EnvironmentId,
  careMode: CareMode | undefined,
  species: SpeciesId,
): boolean {
  return careMode !== undefined || livesIn(environment, species);
}

/**
 * Espèces décrites par le bac : celles de son environnement, dans leur ordre, puis celles
 * d'un autre milieu présentes dans le bac (mode décor), dans l'ordre de `SPECIES`. Sans
 * animal d'un autre milieu, exactement `Environment.species`.
 */
export function speciesShownIn(
  environmentSpecies: readonly SpeciesId[],
  present: Readonly<Record<SpeciesId, number>>,
): readonly SpeciesId[] {
  const extra = (Object.keys(SPECIES) as SpeciesId[]).filter(
    (id) => !environmentSpecies.includes(id) && (present[id] ?? 0) > 0,
  );
  return extra.length === 0 ? environmentSpecies : [...environmentSpecies, ...extra];
}
