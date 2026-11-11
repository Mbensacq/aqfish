import { catchesIch, ICH_AGGRAVATED_AT, isIchAge } from './disease';
import type { EnvironmentId } from './environment';
import { catchesDropsy, DROPSY_MAX, isDropsyProgress } from './dropsy';
import { catchesFinRot, FIN_ROT_MAX, isFinRotProgress } from './fin-rot';
import { catchesFungus, FUNGUS_MAX, isFungusProgress } from './fungus';
import type { SpeciesId } from './species';
import type { Fish } from './swimmer';
import { catchesVelvet, isVelvetProgress, VELVET_MAX } from './velvet';

/**
 * Table des maladies simulées (issue #562, ADR 0129) : ce que les maladies ont en
 * commun côté état (champ facultatif de `Fish`, progression bornée, espèces touchées), pour
 * que sauvegarde, transfert entre bacs et comptage des malades parcourent une seule liste.
 *
 * Ce qui diffère d'une maladie à l'autre (stades, signes, poids santé, rendu, alertes,
 * traitements) reste dans son module (`sim/disease.ts`, `sim/fin-rot.ts`, `sim/velvet.ts`,
 * `sim/fungus.ts`, `sim/dropsy.ts`).
 */

/** Champ de `Fish` porté par un animal malade (absent : sain). */
export type DiseaseField = 'ich' | 'finRot' | 'velvet' | 'fungus' | 'dropsy';

/** Une maladie de la table. */
export interface DiseaseDef {
  /** Champ facultatif de `Fish` (et nom de la clé dans la sauvegarde). */
  readonly field: DiseaseField;
  /** Borne haute de la progression (secondes simulées), pour le message d'erreur. */
  readonly max: number;
  /** Valeur de progression valide (nombre fini dans [0, `max`]). */
  readonly isProgress: (value: unknown) => value is number;
  /** L'espèce peut-elle l'attraper dans cet environnement ? */
  readonly catches: (species: SpeciesId, environment: EnvironmentId) => boolean;
}

/**
 * Les maladies, dans l'ordre d'écriture de la sauvegarde (points blancs #360, pourriture des
 * nageoires #485, velours #532, champignons #548, hydropisie #565) : ne pas le changer, il
 * fixe l'ordre des clés du JSON.
 */
export const DISEASES: readonly DiseaseDef[] = [
  { field: 'ich', max: ICH_AGGRAVATED_AT, isProgress: isIchAge, catches: catchesIch },
  { field: 'finRot', max: FIN_ROT_MAX, isProgress: isFinRotProgress, catches: catchesFinRot },
  { field: 'velvet', max: VELVET_MAX, isProgress: isVelvetProgress, catches: catchesVelvet },
  { field: 'fungus', max: FUNGUS_MAX, isProgress: isFungusProgress, catches: catchesFungus },
  { field: 'dropsy', max: DROPSY_MAX, isProgress: isDropsyProgress, catches: catchesDropsy },
];

/** Maladies portées, avec leur avancement. */
export type CarriedDiseases = Pick<Fish, DiseaseField>;

/**
 * Maladies portées par l'animal, avec leur avancement ; un animal sain n'en porte aucune
 * (aucun champ ajouté). Sert au transfert entre bacs (#547).
 */
export function diseasesOf(fish: CarriedDiseases): CarriedDiseases {
  const carried: Partial<Record<DiseaseField, number>> = {};
  for (const { field } of DISEASES) {
    const value = fish[field];
    if (value !== undefined) {
      carried[field] = value;
    }
  }
  return carried;
}

/** L'animal porte-t-il au moins une maladie (quel qu'en soit le stade) ? */
export function isSick(fish: CarriedDiseases): boolean {
  return DISEASES.some(({ field }) => fish[field] !== undefined);
}
