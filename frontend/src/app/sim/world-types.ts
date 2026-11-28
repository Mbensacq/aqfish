import type { Anemone, AnemoneHome } from './anemones';
import type { FeederState } from './auto-feeder';
import type { CareMode } from './care-mode';
import type { CoralColony } from './corals';
import type { DayClock } from './daylight';
import type { DecorItem } from './decor';
import type { Egg } from './eggs';
import type { EnvironmentId } from './environment';
import type { FirstTankPathState } from './first-tank-path';
import type { FoodPellet } from './food';
import type { SavedJournal } from './journal';
import type { MaintenanceState } from './maintenance';
import type { DeadAnimal } from './mortality';
import type { Obstacle } from './obstacles';
import type { PondShape } from './pond-shape';
import type { Exuvia } from './shrimp-molt';
import type { SpeciesId } from './species';
import type { Fish } from './swimmer';
import type { TankDimensions } from './tank';
import type { WaterState } from './water';
import type { CurrentLevel } from './water-current';
import type { SavedWaterHistory } from './water-history';

/*
 * Types de l'état du monde (#687, chantier #686), sans aucune logique : les modules
 * qui lisent ou modifient le monde les importent d'ici (`import type`) plutôt que de
 * `sim/world.ts`, qui orchestre le pas et ne déclare plus de type.
 */

/**
 * Entité de la simulation. Seuls les poissons existent pour l'instant (`sim/swimmer.ts`).
 * Chaque entité tire son hasard de son propre sous-générateur, dérivé de la graine du
 * monde et de son identifiant (`deriveSeed`, core/random/prng.ts).
 */
export type Entity = Fish;

/** Population demandée à la création du monde. */
export interface PopulationEntry {
  readonly species: SpeciesId;
  readonly count: number;
}

/**
 * État du monde : objet de données pur, sérialisable en JSON (ADR 0003).
 * Ne jamais y placer de classe, de fonction ni d'objet Three.js.
 */
export interface World {
  /** Graine du monde, entier 32 bits non signé. */
  readonly seed: number;
  /**
   * Environnement du monde (`sim/environment.ts`, ADR 0026) : son volume d'eau borne la nage
   * et les dépôts de nourriture. Fixé à la création.
   */
  readonly environment: EnvironmentId;
  /**
   * Dimensions réglées du bac (issue #171, ADR 0047), bornées à `TANK_LIMITS` ; absentes :
   * celles de l'environnement. Le monde est ainsi un lieu (`TankPlace`, `sim/environment.ts`).
   */
  readonly dimensions?: TankDimensions;
  /**
   * Forme du bassin vue de dessus (issue #190, ADR 0080, `sim/pond-shape.ts`) : `ovale` ou
   * `haricot` ; absente, rectangle (jamais enregistrée ainsi). Fixée à la création.
   */
  readonly shape?: PondShape;
  /** Nombre de pas `SIM_DT` exécutés depuis la création. */
  readonly tick: number;
  /**
   * Temps simulé écoulé, en secondes. Toujours égal à `tick * SIM_DT` tant que le monde n'a
   * avancé que par pas de `SIM_DT` (cas de l'application) : il est recalculé à partir de
   * `tick`, jamais cumulé, pour ne pas dériver (erreur flottante).
   */
  readonly time: number;
  readonly entities: readonly Entity[];
  /**
   * Obstacles du bac (rochers à venir, `sim/obstacles.ts`), immobiles : les poissons les
   * contournent (ADR 0012). Données pures, triées par identifiant.
   */
  readonly obstacles: readonly Obstacle[];
  /**
   * Éléments de décor (rochers, `sim/decor.ts`), immobiles, dans l'ordre donné. Leurs formes
   * de collision sont ajoutées à `obstacles`, après les obstacles explicites (ADR 0015), puis
   * les boîtes des coraux tirés de la graine (`sim/corals.ts`, ADR 0040).
   */
  readonly decor: readonly DecorItem[];
  /**
   * Granulés de nourriture déposés par l'utilisateur (`sim/food.ts`, ADR 0022), dans l'ordre
   * des dépôts. Vide à la création.
   */
  readonly food: readonly FoodPellet[];
  /** Identifiant du prochain granulé déposé (compteur, jamais réutilisé). */
  readonly nextFoodId: number;
  /**
   * Identifiant du prochain poisson ajouté (`sim/population.ts`, issue #69) : compteur,
   * jamais réutilisé, égal à l'effectif initial à la création.
   */
  readonly nextFishId: number;
  /**
   * État de l'eau du bac (`sim/water.ts`, issue #206, ADR 0052) : température, composés
   * azotés, filtre. Eau saine à la création ; avancé à chaque pas, après la nourriture.
   */
  readonly water: WaterState;
  /**
   * Mode du bac (#278, `sim/care-mode.ts`, ADR 0077) : absent, le mode soins d'un bac jamais
   * passé par le mode décor. En mode `decor`, l'eau, la faim et la santé sont en pause.
   */
  readonly careMode?: CareMode;
  /**
   * Force du courant (issue #460, `sim/water-current.ts`, ADR 0108) : absente, celle de
   * l'environnement (`Environment.current`, coupée partout) ; jamais enregistrée coupée.
   */
  readonly current?: Exclude<CurrentLevel, 'coupe'>;
  /**
   * Œufs collés sur les vitres et les plantes (issue #478, `sim/eggs.ts`, ADR 0111) : absents
   * tant qu'aucune ponte n'a eu lieu, et retirés quand le dernier œuf a éclos ou a été mangé.
   */
  readonly eggs?: readonly Egg[];
  /**
   * Calendrier d'entretien (issue #513, `sim/maintenance.ts`, ADR 0116) : absent tant que
   * l'application n'a pas commencé le suivi de ce bac (monde neuf, ancienne sauvegarde).
   */
  readonly maintenance?: MaintenanceState;
  /**
   * Historique de l'eau (issue #511, `sim/water-history.ts`, ADR 0118), écrit à la sauvegarde
   * seulement : la partie le tient hors du monde, aucun pas n'y touche.
   */
  readonly waterHistory?: SavedWaterHistory;
  /**
   * Journal du bac (issue #581, `sim/journal.ts`), écrit à la sauvegarde seulement : la partie
   * le tient hors du monde, aucun pas n'y touche.
   */
  readonly journal?: SavedJournal;
  /**
   * Parcours « Mon premier aquarium » (issue #512, `sim/first-tank-path.ts`, ADR 0119), écrit
   * à la sauvegarde seulement : la partie le tient hors du monde, aucun pas n'y touche.
   */
  readonly firstTankPath?: FirstTankPathState;
  /**
   * Distributeur de nourriture automatique (issue #583, `sim/auto-feeder.ts`) : absent, aucun
   * (bac par défaut, anciennes sauvegardes) ; le monde avance alors exactement comme avant.
   */
  readonly feeder?: FeederState;
  /**
   * Mortalité activée (issue #582, `sim/mortality.ts`, ADR 0137) : absente, aucun animal ne
   * meurt et le monde avance exactement comme avant ; jamais enregistrée à `false`.
   */
  readonly mortality?: true;
  /**
   * Saisons du bassin coupées (issue #864, `sim/pond-season.ts`, ADR 0186) : le bassin garde
   * alors ses 18 °C fixes (`WATER_TEMPERATURES`), sans température ambiante saisonnière.
   * Absent : saisons actives (bassin par défaut, anciennes sauvegardes) ; jamais enregistré à
   * `false`. Sans effet hors du bassin.
   */
  readonly seasonsOff?: true;
  /**
   * Jour de l'année au temps 0 du calendrier du bassin (issue #864), dans [0, 365[ : posé par
   * le paramètre de capture `saison=` seulement, jamais enregistré. Absent :
   * `START_DAY_OF_YEAR` (19 mai).
   */
  readonly seasonStartDay?: number;
  /**
   * Corps des animaux morts (issue #582), dans l'ordre des décès : ils ne nagent plus,
   * flottent ou reposent au fond et polluent l'eau jusqu'à leur retrait (`removeDeadInPlace`).
   * Absents tant qu'aucun corps n'est dans le bac.
   */
  readonly dead?: readonly DeadAnimal[];
  /**
   * Exuvies des crevettes (issue #859, `sim/shrimp-molt.ts`), dans l'ordre des mues : elles
   * reposent au sol puis se dissolvent. Absentes tant qu'aucune n'est dans le bac.
   */
  readonly exuviae?: readonly Exuvia[];
}

/** Copie de `T` sans `readonly` (premier niveau seulement). */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Monde modifiable en place, possédé par un seul propriétaire (la boucle d'affichage de
 * `ui/aquarium-host`). Un `World` fraîchement créé lui est assignable.
 */
export type MutableWorld = Mutable<World>;

/** Coraux, anémones et points d'attache tirés de la graine d'un monde (`worldFeatures`). */
export interface WorldFeatures {
  readonly corals: readonly CoralColony[];
  readonly anemones: readonly Anemone[];
  readonly homes: readonly AnemoneHome[];
}

/**
 * Horloge de journée lue par la simulation (rythme du jour, issue #209), ou `null` : plein
 * jour, nage d'avant au bit près. L'heure de chaque pas est `hourAt(clock, world.time)`.
 */
export type SimClock = DayClock | null;

/** Dépôt de nourriture à un temps simulé donné (contrat de capture, `nourrir=`). */
export interface Feeding {
  readonly time: number;
  readonly x: number;
  readonly z: number;
}

/** Résultat d'un passage de siphon (#605). */
export interface SiphonPass {
  /** Points du geste tombés dans l'eau (chacun retire un peu d'eau, `siphonedShare`). */
  readonly points: number;
  /** Granulés posés aspirés. */
  readonly food: number;
}
