import { approx, gh, sourced, type SheetField } from './sheet-field';
import type { SpeciesId } from './species';
import type { FoodKind, SpeciesEcology } from './species-ecology';

/**
 * Données d'écologie du paludarium (#786, dernière tranche de #727) : axolotl, sonneur oriental
 * et triton à ventre de feu. Mêmes champs et même règle de sourçage que `sim/species-ecology.ts`.
 *
 * **Part d'eau** : la densité d'un amphibien se compte sur l'eau du milieu, pas sur la berge.
 * `AMPHIBIAN_WATER_SHARE` donne la part du volume à remplir d'eau ; `amphibianWaterLiters`
 * en déduit le volume d'eau d'un bac, auquel s'appliquent la classe `amphibian` et le volume
 * minimal de la fiche. Aucune de ces données n'est encore lue par la simulation (#728).
 */

/** Espèces du paludarium. */
export type AmphibianId = Extract<SpeciesId, 'axolotl' | 'grenouille' | 'triton'>;

/** Fiche de soins secondaire du sonneur oriental, déjà citée par la fiche (#270). */
const ANAPSID = 'https://anapsid.org/bombina.html (secondaire)';
/**
 * Part du volume du milieu occupée par l'eau (1 : entièrement aquatique). Sonneur : « un quart
 * de berge sèche » (Anapsid). Axolotl entièrement aquatique (néoténique) et triton « très
 * aquatique, petites zones émergées » (Caudata Culture, `docs/ESPECES.md`) : parts chiffrées en
 * approximation, aucune source ne les chiffre.
 */
export const AMPHIBIAN_WATER_SHARE: Readonly<Record<AmphibianId, SheetField<number>>> =
  Object.freeze({
    axolotl: approx(1),
    grenouille: sourced(0.75, `${ANAPSID} (un quart de berge sèche environ)`),
    triton: approx(0.9),
  });

/** Volume d'eau, en litres, d'un milieu de `totalLiters` pour l'espèce `id` (berge déduite). */
export function amphibianWaterLiters(id: AmphibianId, totalLiters: number): number {
  return Math.max(0, totalLiters) * AMPHIBIAN_WATER_SHARE[id].value;
}

const NO: SheetField<boolean> = approx(false);

/** Amphibien carnivore et paisible : aucune proie ni prédateur parmi les espèces du jeu. */
function amphibian(hardness: SpeciesEcology['hardnessTolerated'], eaten: readonly FoodKind[]) {
  return Object.freeze({
    densityClass: approx('amphibian' as const),
    extraLitersPerAdult: approx(null),
    hardnessTolerated: hardness,
    // Proies vivantes (vers, insectes, crustacés) hors des espèces du jeu ; les trois vivent sans
    // poissons ni crevettes (`docs/ESPECES.md`), d'où aucune proie ni prédateur déclarés.
    foods: approx(Object.freeze([...eaten])),
    prey: approx(Object.freeze([])),
    predators: approx(Object.freeze([])),
    territorial: NO,
    finNipper: NO,
    fastSwimmer: NO,
  }) satisfies SpeciesEcology;
}

/** Données de la tranche du paludarium (#786). */
export const AMPHIBIAN_ECOLOGY: Readonly<Record<AmphibianId, SpeciesEcology>> = Object.freeze({
  // Dureté tolérée : plage conseillée de la fiche élargie de quelques degrés (approximation).
  axolotl: amphibian(approx(gh(5, 22)), ['pellets']),
  // Le sonneur ne prend que des proies vivantes : aucun aliment du bac.
  grenouille: amphibian(approx(gh(3, 18)), []),
  triton: amphibian(approx(gh(3, 18)), ['pellets']),
});
