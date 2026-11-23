import {
  approx,
  gh,
  kh,
  range,
  sourced,
  type HardnessRange,
  type SheetField,
  type ValueRange,
} from './sheet-field';
import type { SpeciesId } from './species';

/**
 * Données d'écologie des espèces (issue #784, première tranche de #727, `docs/ECOSYSTEME.md`
 * § 2 et § 3.1) : ce qu'il faut pour décider combien d'animaux tient un bac, qui mange qui et
 * qui nettoie quoi. **Aucune n'est encore utilisée par la simulation** (#728 et suivantes).
 *
 * Les champs déjà portés par la fiche (`sim/species-sheet.ts` : taille adulte, températures,
 * pH, groupe minimal, volume minimal, dureté conseillée) sont réutilisés, pas recopiés : on
 * n'ajoute ici que ce qui manque. Même règle de sourçage que les fiches (`sim/sheet-field.ts`) ;
 * un désaccord entre sources est écrit dans la référence (« désaccord ») et noté dans
 * `docs/ESPECES.md`, jamais arbitré en silence.
 *
 * Tranche du c280 (#784) : les 18 espèces d'eau douce tropicale (et la crevette nettoyeuse,
 * rangée dans la tranche par l'issue). Tranche du c281 (#785) : mer et eau froide. Les
 * amphibiens suivent au c283 ; la dernière tranche rendra ces données obligatoires.
 */

/**
 * Classe de densité : litres par cm de poisson adulte (`docs/ECOSYSTEME.md` § 3.1). `tropical`
 * et `coldwater` viennent de la RSPCA ; `invertebrate` et `marine` sont à sourcer.
 */
export type DensityClass = 'tropical' | 'coldwater' | 'invertebrate' | 'marine';

/** Ce qu'une espèce mange dans le bac, en plus des proies vivantes. */
export type FoodKind = 'algae' | 'biofilm' | 'leftovers' | 'pellets';

/** Stade de la proie qu'un prédateur mange : les adultes, ou seulement les jeunes. */
export type PreyStage = 'adult' | 'young';

/** Proie connue d'une espèce. */
export interface Prey {
  readonly species: SpeciesId;
  readonly stage: PreyStage;
}

/** Données d'écologie d'une espèce. */
export interface SpeciesEcology {
  readonly densityClass: SheetField<DensityClass>;
  /**
   * Volume par adulte supplémentaire, en litres, quand une source le donne ; `null` : aucune
   * source n'en donne, la classe de densité s'applique.
   */
  readonly extraLitersPerAdult: SheetField<number | null>;
  /** Dureté tolérée, de même nature que la dureté conseillée de la fiche, qu'elle contient. */
  readonly hardnessTolerated: SheetField<HardnessRange>;
  /** Régime détaillé : algues, biofilm, restes de nourriture, granulés et flocons. */
  readonly foods: SheetField<readonly FoodKind[]>;
  /** Proies connues parmi les espèces du jeu. */
  readonly prey: SheetField<readonly Prey[]>;
  /** Prédateurs connus parmi les espèces du jeu. */
  readonly predators: SheetField<readonly SpeciesId[]>;
  /** Défend un territoire contre ses congénères ou ses voisins. */
  readonly territorial: SheetField<boolean>;
  /** Mordille les nageoires des autres poissons. */
  readonly finNipper: SheetField<boolean>;
  /** Nageur rapide et très actif, qui gêne les nageurs lents. */
  readonly fastSwimmer: SheetField<boolean>;
}

/** RSPCA, « Choosing an aquarium » (`docs/ECOSYSTEME.md` § 2). */
const RSPCA = 'https://www.rspca.org.uk/adviceandwelfare/pets/fish/environment';
/** Practical Fishkeeping, « What can I keep with shrimp? » (`docs/ECOSYSTEME.md` § 2). */
const PF_SHRIMP = 'https://www.practicalfishkeeping.co.uk/features/what-can-i-keep-with-shrimp/';
/** Garnelio, crevettes et escargots nettoyeurs (`docs/ECOSYSTEME.md` § 2). */
const GARNELIO =
  'https://www.garnelio.de/en/blog/invertebrates/the-invertebrate-algae-police-shrimp-and-snails-as-a-cleanup-crew';
/** Aquarium Breeder, néritines (`docs/ECOSYSTEME.md` § 2). */
const AB_NERITE =
  'https://aquariumbreeder.com/nerite-snails-detailed-guide-care-diet-and-breeding/';
/** Fiches déjà citées par `sim/species-sheet.ts` (Seriously Fish, FishBase, FishKeeper). */
const SF = 'https://www.seriouslyfish.com/species/';
const FB_XIPHO = 'https://www.fishbase.org/summary/3231';
const FK_XIPHO = 'https://fishkeeper.co.uk/fish/freshwater/livebearers/swordtail';
const FK_CERISE = 'https://www.fishkeeper.co.uk/fish/freshwater/miscellaneous/cherry-shrimp';
const FK_NERITINE = 'https://www.fishkeeper.co.uk/fish/freshwater/miscellaneous/zebra-snail';
/** Fiches déjà citées par `sim/species-sheet.ts` pour la mer et l'eau froide (#785). */
const FB = 'https://www.fishbase.se/summary/';
const WP = 'https://en.wikipedia.org/wiki/';
const OATA_ROUGE =
  'https://ornamentalfish.org/what-we-do/advice-information/care-sheets/caresheets-coldwater-fish/how-to-look-after-goldfish-in-an-aquarium-fishtank/';
const FK_ROUGE = 'https://www.fishkeeper.co.uk/fish/freshwater/pond-fish/goldfish-';

/**
 * Litres par cm de poisson adulte, par classe : `min` est le plafond (au-delà, le bac est
 * surpeuplé), `max` le conseillé. Poisson rouge : 2 L par 0,5 cm selon la RSPCA, soit 4 L/cm.
 */
export const DENSITY_LITERS_PER_CM: Readonly<Record<DensityClass, SheetField<ValueRange>>> =
  Object.freeze({
    tropical: sourced(range(1.5, 2), `${RSPCA} (1,5 à 2 L par cm de poisson tropical)`),
    coldwater: sourced(range(4, 4), `${RSPCA} (2 L par 0,5 cm de poisson rouge)`),
    invertebrate: approx(range(1, 1.5)),
    marine: approx(range(2, 3)),
  });

const TROPICAL: SheetField<DensityClass> = sourced(
  'tropical',
  `${RSPCA} (poisson tropical d’eau douce)`,
);
const INVERTEBRATE: SheetField<DensityClass> = approx('invertebrate');
/** Aucune source ne range les poissons de récif dans une classe de densité (à sourcer). */
const MARINE: SheetField<DensityClass> = approx('marine');
const NO_EXTRA: SheetField<number | null> = approx(null);
const NO: SheetField<boolean> = approx(false);
const NO_PREY: SheetField<readonly Prey[]> = approx(Object.freeze([]));
const NO_PREDATOR: SheetField<readonly SpeciesId[]> = approx(Object.freeze([]));

function foods(...kinds: FoodKind[]): readonly FoodKind[] {
  return Object.freeze(kinds);
}

function young(...species: SpeciesId[]): readonly Prey[] {
  return Object.freeze(
    species.map((id) => Object.freeze({ species: id, stage: 'young' as const })),
  );
}

function ids(...species: SpeciesId[]): readonly SpeciesId[] {
  return Object.freeze(species);
}

/** Petit poisson tropical paisible, aux données d'écologie non sourcées sauf la classe. */
function peacefulTropical(
  hardnessTolerated: HardnessRange,
  eaten: SheetField<readonly FoodKind[]> = approx(foods('pellets')),
): SpeciesEcology {
  return Object.freeze({
    densityClass: TROPICAL,
    extraLitersPerAdult: NO_EXTRA,
    hardnessTolerated: approx(hardnessTolerated),
    foods: eaten,
    prey: NO_PREY,
    predators: NO_PREDATOR,
    territorial: NO,
    finNipper: NO,
    fastSwimmer: NO,
  });
}

/** Mange au moins les jeunes crevettes cerises, selon `reference` (ou approximation). */
function shrimpletEater(reference?: string): SheetField<readonly Prey[]> {
  return reference ? sourced(young('cerise'), reference) : approx(young('cerise'));
}

/**
 * Poisson de récif aux données non sourcées sauf celles passées dans `overrides` : dureté
 * tolérée (KH) élargie autour de l'alcalinité du récif de la fiche (KH 7–11).
 */
function reefFish(overrides: Partial<SpeciesEcology> = {}): SpeciesEcology {
  return Object.freeze({
    densityClass: MARINE,
    extraLitersPerAdult: NO_EXTRA,
    hardnessTolerated: approx(kh(6, 12)),
    foods: approx(foods('pellets')),
    prey: NO_PREY,
    predators: NO_PREDATOR,
    territorial: NO,
    finNipper: NO,
    fastSwimmer: NO,
    ...overrides,
  });
}

const PF_YOUNG = `${PF_SHRIMP} (mange au moins les jeunes crevettes)`;

/**
 * Fige chaque entrée et la table (#788) : les entrées écrites par décomposition
 * (`{ ...peacefulTropical(…), prey }`) ne le seraient pas sinon.
 */
function frozenTable(
  table: Partial<Record<SpeciesId, SpeciesEcology>>,
): Readonly<Partial<Record<SpeciesId, SpeciesEcology>>> {
  for (const ecology of Object.values(table)) {
    Object.freeze(ecology);
  }
  return Object.freeze(table);
}

/** Données des tranches d'eau douce tropicale (#784), de mer et d'eau froide (#785). */
export const SPECIES_ECOLOGY: Readonly<Partial<Record<SpeciesId, SpeciesEcology>>> = frozenTable({
  neon: peacefulTropical(gh(0, 15)),
  guppy: {
    ...peacefulTropical(gh(5, 35), approx(foods('algae', 'pellets'))),
    prey: shrimpletEater(PF_YOUNG),
  },
  corydora: {
    ...peacefulTropical(gh(0, 15), approx(foods('leftovers', 'pellets'))),
    prey: shrimpletEater(PF_YOUNG),
  },
  rasbora: { ...peacefulTropical(gh(1, 15)), prey: shrimpletEater(PF_YOUNG) },
  tetra: { ...peacefulTropical(gh(2, 15)), prey: shrimpletEater() },
  kuhli: {
    ...peacefulTropical(gh(1, 12), approx(foods('leftovers', 'pellets'))),
    prey: shrimpletEater(PF_YOUNG),
  },
  gourami: {
    ...peacefulTropical(gh(2, 18)),
    // Practical Fishkeeping parle des « grands gouramis » : le gourami nain est une approximation.
    prey: shrimpletEater(),
    territorial: sourced(true, `${SF}trichogaster-lalius (mâle parfois agressif)`),
  },
  platy: {
    ...peacefulTropical(gh(8, 30), approx(foods('algae', 'pellets'))),
    prey: shrimpletEater(),
  },
  danio: {
    ...peacefulTropical(gh(3, 22)),
    prey: shrimpletEater(`${PF_SHRIMP} (petits danios : au moins les jeunes crevettes)`),
    fastSwimmer: sourced(true, `${SF}danio-rerio (espèce très active)`),
  },
  ancistrus: {
    ...peacefulTropical(
      gh(2, 20),
      sourced(
        foods('algae', 'biofilm', 'leftovers', 'pellets'),
        `${SF}ancistrus-cf-cirrhosus (algues, mais régime varié indispensable)`,
      ),
    ),
    territorial: sourced(true, `${SF}ancistrus-cf-cirrhosus (envers ses congénères)`),
  },
  otocinclus: peacefulTropical(
    gh(1, 15),
    sourced(foods('algae', 'biofilm'), `${SF}otocinclus-macrospilus (surtout végétal, biofilm)`),
  ),
  braise: peacefulTropical(gh(1, 15)),
  molly: {
    ...peacefulTropical(
      gh(12, 35),
      sourced(foods('algae', 'pellets'), `${SF}poecilia-sphenops (part végétale importante)`),
    ),
    prey: shrimpletEater(),
  },
  miel: peacefulTropical(gh(2, 18)),
  xipho: {
    ...peacefulTropical(
      gh(5, 25),
      sourced(foods('algae', 'pellets'), `${FB_XIPHO} (vers, crustacés, insectes et végétaux)`),
    ),
    prey: shrimpletEater(`${FK_XIPHO} (mange alevins et crevettes naines)`),
    territorial: sourced(true, `${FK_XIPHO} (les mâles se disputent)`),
  },
  cerise: {
    densityClass: INVERTEBRATE,
    extraLitersPerAdult: NO_EXTRA,
    hardnessTolerated: approx(gh(3, 18)),
    foods: sourced(
      foods('algae', 'biofilm', 'leftovers', 'pellets'),
      `${GARNELIO} (biofilm, jeunes algues, restes) ; ${FK_CERISE} (flocons)`,
    ),
    prey: NO_PREY,
    // Approximation (#788) : la liste mêle prédateurs sourcés et approximations. La source de
    // chacun est portée par le champ `prey` du prédateur : Practical Fishkeeping pour guppy,
    // corydora, rasbora, kuhli, danio et poisson rouge (les adultes), FishKeeper pour le xipho ;
    // tétra, gourami nain, platy et molly sont des approximations (`docs/ESPECES.md`, point 17).
    predators: approx(
      ids(
        'guppy',
        'corydora',
        'rasbora',
        'tetra',
        'kuhli',
        'gourami',
        'platy',
        'danio',
        'molly',
        'xipho',
        'rouge',
      ),
    ),
    territorial: NO,
    finNipper: NO,
    fastSwimmer: NO,
  },
  // Crevette nettoyeuse de récif (Lysmata amboinensis), rangée dans la tranche par l'issue.
  crevette: {
    densityClass: MARINE,
    extraLitersPerAdult: NO_EXTRA,
    hardnessTolerated: approx(kh(6, 12)),
    foods: approx(foods('leftovers', 'pellets')),
    prey: NO_PREY,
    predators: NO_PREDATOR,
    territorial: NO,
    finNipper: NO,
    fastSwimmer: NO,
  },
  // Mer (#785) : FishBase et Wikipédia (secondaire), sources déjà citées par les fiches.
  clown: reefFish({
    foods: approx(foods('algae', 'pellets')),
    // Défend son anémone ou son coin de roche : comportement connu, non sourcé ici.
    territorial: approx(true),
  }),
  chirurgien: reefFish({
    foods: approx(foods('algae', 'pellets')),
    territorial: approx(true),
    fastSwimmer: approx(true),
  }),
  chromis: reefFish({
    foods: sourced(
      foods('algae', 'pellets'),
      `${WP}Chromis_viridis (secondaire : phytoplancton, zooplancton, algues ; granulés : approximation)`,
    ),
    fastSwimmer: approx(true),
  }),
  gobie: reefFish({
    // Régime non donné par FishBase : proies congelées et granulés en bac.
    foods: approx(foods('leftovers', 'pellets')),
  }),
  gramma: reefFish({
    foods: sourced(
      foods('pellets'),
      `${WP}Royal_gramma (secondaire : planctonophage, zooplancton et crustacés)`,
    ),
    territorial: sourced(true, `${WP}Royal_gramma (secondaire : territorial dans les roches)`),
  }),
  blennie: reefFish({
    foods: sourced(
      foods('algae', 'pellets'),
      `${FB}6033 (niveau trophique 2,0 : algues ; granulés : approximation)`,
    ),
    territorial: approx(true),
  }),
  // Eau froide (#785) : OATA et FishKeeper pour le poisson rouge ; koï non vérifiée.
  koi: {
    densityClass: approx('coldwater'),
    // Volume du bassin : aucune source consultable (`docs/ESPECES.md`, point 3) ; la fiche
    // garde 800 L en approximation et aucun volume par adulte supplémentaire.
    extraLitersPerAdult: NO_EXTRA,
    hardnessTolerated: approx(gh(4, 25)),
    foods: approx(foods('algae', 'leftovers', 'pellets')),
    prey: NO_PREY,
    predators: NO_PREDATOR,
    territorial: NO,
    finNipper: NO,
    fastSwimmer: NO,
  },
  rouge: {
    densityClass: sourced('coldwater', `${RSPCA} (poisson rouge : 2 L par 0,5 cm)`),
    extraLitersPerAdult: sourced(
      50,
      `${OATA_ROUGE} (100 L pour le premier adulte, puis 50 L par adulte en plus) ; désaccord : RSPCA, au moins 60 L chacun (${RSPCA}) ; le jeu garde l’OATA, plus stricte jusqu’à 4 adultes seulement (égalité à 5, RSPCA plus stricte au-delà)`,
    ),
    hardnessTolerated: approx(gh(4, 22)),
    foods: sourced(foods('pellets'), `${FK_ROUGE} (granulés, flocons, aliments congelés)`),
    prey: sourced(
      Object.freeze([Object.freeze({ species: 'cerise', stage: 'adult' as const })]),
      `${PF_SHRIMP} (les poissons rouges mangent les crevettes « tôt ou tard »)`,
    ),
    predators: NO_PREDATOR,
    territorial: NO,
    finNipper: NO,
    fastSwimmer: NO,
  },
  neritine: {
    densityClass: INVERTEBRATE,
    extraLitersPerAdult: sourced(
      40,
      `${AB_NERITE} (1 pour 20 à 40 L, désaccord interne : le jeu garde la borne stricte)`,
    ),
    hardnessTolerated: approx(gh(6, 22)),
    foods: sourced(
      foods('algae', 'biofilm', 'pellets'),
      `${AB_NERITE} ; ${FK_NERITINE} (pastilles d’algues)`,
    ),
    prey: NO_PREY,
    predators: NO_PREDATOR,
    territorial: NO,
    finNipper: NO,
    fastSwimmer: NO,
  },
});
