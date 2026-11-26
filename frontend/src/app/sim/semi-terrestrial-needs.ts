import { sourced, type SheetField } from './sheet-field';
import type { SpeciesId } from './species';

/**
 * Besoins d'espace des amphibiens **semi-terrestres** du paludarium (issue #813, ADR 0177) :
 * sonneur oriental (`grenouille`) et triton à ventre de feu. Les fiches de soins trouvées
 * (`docs/ESPECES.md`, [67] à [70]) donnent un volume de **terrarium entier**, berge comprise :
 * ces espèces sont comptées sur le volume du milieu (litres bruts du bac), et non plus sur l'eau
 * berge déduite. L'axolotl, entièrement aquatique, reste compté sur l'eau (classe « amphibien »).
 *
 * Valeurs retenues : les plus exigeantes de chaque désaccord (ADR 0177, décision 2). 1 gallon
 * américain = 3,785 L, arrondi au dixième.
 */

/** Besoin d'espace d'une espèce comptée sur le volume du milieu. */
export interface SemiTerrestrialNeed {
  /** Volume du milieu demandé par le premier adulte, en litres. */
  readonly firstAdultLiters: SheetField<number>;
  /** Volume du milieu par adulte supplémentaire, en litres. */
  readonly extraLitersPerAdult: SheetField<number>;
  /** Volume minimal du milieu, en litres (verdict `volume-minimal`). */
  readonly minLiters: SheetField<number>;
}

/** PetMD, fiche du triton à ventre de feu rédigée par une vétérinaire ([67]). */
const PETMD_NEWT = 'https://www.petmd.com/exotic/fire-bellied-newt-care-sheet';
/** Reptiles Magazine, fiche du sonneur oriental ([69]). */
const RM_TOAD = 'https://reptilesmagazine.com/Frog-Amphibian-Species/Oriental-Fire-bellied-Toad/';
/** amphibiancare.com, fiche du sonneur ([70]), en désaccord avec [69]. */
const AC_TOAD = 'https://www.amphibiancare.com/frogs/caresheets/firebelliedtoad.html';

/** Triton : 15 gallons pour un adulte, 20 pour deux (PetMD). */
const NEWT_FIRST = sourced(56.8, `${PETMD_NEWT} (15 gallons pour un triton, milieu entier)`);
const NEWT_EXTRA = sourced(
  18.9,
  `${PETMD_NEWT} (20 gallons pour deux : 5 gallons par triton de plus, milieu entier)`,
);
/**
 * Sonneur : 10 gallons pour un couple (Reptiles Magazine), le couple étant l'unité de la
 * source : 18,9 L par adulte, dans un milieu d'au moins 37,9 L.
 */
const TOAD_DISAGREEMENT = `désaccord : 15 gallons pour cinq adultes selon ${AC_TOAD}`;
const TOAD_EACH = sourced(
  18.9,
  `${RM_TOAD} (10 gallons pour un couple, soit 18,9 L par sonneur ; ${TOAD_DISAGREEMENT})`,
);
const TOAD_MIN = sourced(37.9, `${RM_TOAD} (10 gallons pour un couple au plus, milieu entier)`);

/** Espèces comptées sur le volume du milieu et leurs besoins (ADR 0177). */
export const SEMI_TERRESTRIAL_NEEDS: Readonly<Partial<Record<SpeciesId, SemiTerrestrialNeed>>> =
  Object.freeze({
    grenouille: Object.freeze({
      firstAdultLiters: TOAD_EACH,
      extraLitersPerAdult: TOAD_EACH,
      minLiters: TOAD_MIN,
    }),
    triton: Object.freeze({
      firstAdultLiters: NEWT_FIRST,
      extraLitersPerAdult: NEWT_EXTRA,
      minLiters: NEWT_FIRST,
    }),
  });
