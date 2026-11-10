import { isDecorMode } from './care-mode';
import { findTank, placeOf, type RoomState, type RoomTank, type TankSizeId } from './room-state';
import type { EnvironmentId } from './environment';
import type { SpeciesId } from './species';
import { TREATMENTS, type TreatmentKind, type TreatmentOutcome } from './treatment';
import { cloneWorld, treatWorldInPlace } from './world';

/**
 * Bac de quarantaine (issue #547, épopée v1.16, ADR 0127) : un petit bac posé dans la pièce où
 * l'on isole un animal malade pour le soigner sans traiter le bac principal.
 *
 * Aucun état nouveau : un bac de quarantaine est un bac posé ordinaire (`addTank`), avec son
 * eau et ses animaux, comme tous les bacs de la pièce (ADR 0061 : mondes **indépendants**).
 * L'isolement vient de là : un traitement ne touche que l'eau du bac soigné (`treatTank`), et
 * la contagion d'un bac ne compte que ses propres malades (`sim/disease.ts`, `sim/velvet.ts`).
 * L'animal va en quarantaine et en revient à l'épuisette (`transferFish`), sa maladie avec lui.
 *
 * Fonctions pures et déterministes : aucun tirage, aucune graine consommée.
 */

/** Nom par défaut du bac de quarantaine. */
export const QUARANTINE_TANK_NAME = 'Quarantaine';

/** Taille du catalogue d'un bac de quarantaine : le petit bac (60 cm). */
export const QUARANTINE_TANK_SIZE: TankSizeId = 'petit';

/**
 * Durée conseillée d'une quarantaine, sourcée (`docs/SOINS.md`, § 1, ligne « Bac de quarantaine
 * / hôpital » ; § 5, koïs) : 30 jours en général, 4 à 6 semaines pour les koïs. Le jeu ne
 * l'impose pas : le temps y est compressé, l'animal revient quand on le décide.
 */
export const QUARANTINE_DURATION_TEXT =
  'Durée conseillée : 30 jours, 4 à 6 semaines pour les koïs (UC Davis ; Colombie-Britannique ; Merck). Dans le jeu, le temps est compressé : l’animal revient quand vous le décidez (approximation de jeu).';

/**
 * Rappel d'acclimatation au retour (page « L'acclimatation » de l'aide, `sim/beginner-help.ts`) :
 * l'eau de la quarantaine et celle du bac principal diffèrent.
 */
export const QUARANTINE_ACCLIMATION_REMINDER =
  'Acclimatation : mélangez lentement les deux eaux plutôt que de le verser d’un coup';

/**
 * Environnement d'un bac de quarantaine installé depuis un bac d'environnement `selected` :
 * le même (même milieu, même température de départ), ou `null` au jardin (le bassin : pas de
 * bac de la pièce à poser depuis le jardin dans ce lot).
 */
export function quarantineEnvironment(selected: EnvironmentId): EnvironmentId | null {
  return placeOf(selected) === 'piece' ? selected : null;
}

/**
 * Bacs pouvant servir de quarantaine depuis le bac sélectionné `selectedTankId` : les bacs
 * **posés** de la pièce (non sélectionnables, ADR 0075), soignés depuis la liste des bacs ; dans
 * l'ordre de la pièce.
 */
export function quarantineTanks(room: RoomState, selectedTankId: number): RoomTank[] {
  return room.tanks.filter((tank) => tank.placement !== null && tank.id !== selectedTankId);
}

/** Résultat d'un soin donné à un bac de la pièce. */
export type TankTreatmentResult =
  | { readonly ok: true; readonly room: RoomState; readonly outcome: TreatmentOutcome }
  | { readonly ok: false; readonly room: RoomState; readonly message: string };

/**
 * Un geste du traitement `kind` (`TREATMENTS`, dose d'un pas) dans le bac `tankId` **seul** :
 * le monde de ce bac est copié puis traité (`treatWorldInPlace`, mêmes contrôles et refus qu'au
 * bac affiché) ; tous les autres bacs gardent le même objet. Refus sans changement : bac
 * inconnu, bac en mode décor, traitement inconnu, geste refusé par `applyTreatmentInPlace`.
 * Fonction pure : `room` n'est pas modifiée.
 */
export function treatTank(
  room: RoomState,
  tankId: number,
  kind: TreatmentKind,
): TankTreatmentResult {
  const tank = findTank(room, tankId);
  if (tank === undefined) {
    return { ok: false, room, message: 'Bac introuvable' };
  }
  if (!Object.hasOwn(TREATMENTS, kind)) {
    return { ok: false, room, message: 'Traitement inconnu' };
  }
  if (isDecorMode(tank.world)) {
    return { ok: false, room, message: `« ${tank.name} » est en mode décor : pas de soins` };
  }
  const world = cloneWorld(tank.world);
  const outcome = treatWorldInPlace(world, kind, TREATMENTS[kind].step);
  if (!outcome.ok) {
    return { ok: false, room, message: outcome.message };
  }
  const tanks = room.tanks.map((t) => (t.id === tankId ? { ...t, world } : t));
  return { ok: true, room: { ...room, tanks }, outcome };
}

/** Nombre d'animaux malades (points blancs, velours ou pourriture des nageoires) d'un bac. */
export function sickCount(tank: Pick<RoomTank, 'world'>): number {
  return tank.world.entities.filter(
    (e) => e.ich !== undefined || e.velvet !== undefined || e.finRot !== undefined,
  ).length;
}

/** Un bac de quarantaine possible, vu par la liste des bacs (#547). */
export interface QuarantineEntry {
  readonly id: number;
  readonly name: string;
  /** Espèces présentes, sans doublon, dans l'ordre d'arrivée des animaux. */
  readonly species: readonly SpeciesId[];
  /** Animaux malades du bac (`sickCount`). */
  readonly sick: number;
}

/** Ce que la liste des bacs montre de la quarantaine (#547). */
export interface QuarantineView {
  readonly tanks: readonly QuarantineEntry[];
  /** Animaux malades du bac sélectionné : l'installation est proposée dès le premier. */
  readonly sickHere: number;
}

/** Vue vide (avant le démarrage, en capture). */
export const EMPTY_QUARANTINE: QuarantineView = { tanks: [], sickHere: 0 };

/**
 * Vue de la quarantaine depuis le bac `selectedTankId` : bacs posés (`quarantineTanks`) avec
 * leurs espèces et leurs malades, et malades du bac sélectionné (`selected` : son monde à jour,
 * celui que l'hôte avance en place).
 */
export function quarantineView(
  room: RoomState,
  selectedTankId: number,
  selected: Pick<RoomTank, 'world'>,
): QuarantineView {
  return {
    tanks: quarantineTanks(room, selectedTankId).map((tank) => ({
      id: tank.id,
      name: tank.name,
      species: [...new Set(tank.world.entities.map((e) => e.species))],
      sick: sickCount(tank),
    })),
    sickHere: sickCount(selected),
  };
}

/** Deux vues égales (signal de l'hôte : pas de nouvelle valeur à chaque relevé). */
export function sameQuarantine(a: QuarantineView, b: QuarantineView): boolean {
  return (
    a.sickHere === b.sickHere &&
    a.tanks.length === b.tanks.length &&
    a.tanks.every((t, i) => {
      const u = b.tanks[i];
      return (
        t.id === u.id &&
        t.name === u.name &&
        t.sick === u.sick &&
        t.species.length === u.species.length &&
        t.species.every((s, j) => s === u.species[j])
      );
    })
  );
}
