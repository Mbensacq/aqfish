import type { SaveStatus } from '../../core/save-storage/save-storage';
import type { FeederState } from '../../sim/auto-feeder';
import type { TankFouling } from '../../sim/fouling';
import type { TreatmentReadout } from '../../sim/treatment-text';
import type { WaterReadout } from '../../sim/water-quality';
import type { World } from '../../sim/world-types';
import {
  ALERT_HIGHLIGHT_ATTRIBUTE,
  ALGAE_ATTRIBUTE,
  CAMERA_ATTRIBUTE,
  CAMERA_TARGET_ATTRIBUTE,
  CAPACITY_ATTRIBUTE,
  CARE_MODE_ATTRIBUTE,
  CARE_SESSION_ATTRIBUTE,
  CATAPPA_ATTRIBUTE,
  CURRENT_ATTRIBUTE,
  DEAD_ATTRIBUTE,
  DECOR_ATTRIBUTE,
  DECOR_COUNT_ATTRIBUTE,
  DECOR_PHYSICS_ATTRIBUTE,
  DECOR_SELECTION_ATTRIBUTE,
  EDITING_ATTRIBUTE,
  ENVIRONMENT_ATTRIBUTE,
  FEEDER_ATTRIBUTE,
  FILTER_ATTRIBUTE,
  FILTER_BACTERIA_ATTRIBUTE,
  FOOD_ATTRIBUTE,
  FOOD_STYLE_ATTRIBUTE,
  FOULING_ATTRIBUTE,
  FOULING_CELLS_ATTRIBUTE,
  FREE_CAMERA_ATTRIBUTE,
  HOUR_ATTRIBUTE,
  HOUR_FROZEN_ATTRIBUTE,
  LAMP_ATTRIBUTE,
  LIGHT_RAYS_ATTRIBUTE,
  PH_ATTRIBUTE,
  PLANTS_ATTRIBUTE,
  POPULATION_ATTRIBUTE,
  PRUNER_ATTRIBUTE,
  RAIN_ATTRIBUTE,
  REDUCED_MOTION_ATTRIBUTE,
  ROOM_ATTRIBUTE,
  ROOM_COUNT_ATTRIBUTE,
  ROOM_SELECTION_ATTRIBUTE,
  ROOM_SUPPORTS_ATTRIBUTE,
  ROOM_TANKS_ATTRIBUTE,
  SAVE_ATTRIBUTE,
  SCRAPER_ATTRIBUTE,
  SEED_ATTRIBUTE,
  SELECTED_TANK_ATTRIBUTE,
  SHAPE_ATTRIBUTE,
  SPEED_ATTRIBUTE,
  TANK_ATTRIBUTE,
  TICK_ATTRIBUTE,
  TREATMENT_ATTRIBUTE,
  WALLPAPER_ATTRIBUTE,
  WALLPAPER_PAUSED_ATTRIBUTE,
  WATER_ATTRIBUTE,
} from './aquarium-attributes';

/** État du moteur de chute de l'éditeur (#170). */
export type DecorPhysicsState = 'absent' | 'chargement' | 'pret' | 'indisponible';

/** Caméra lue par la sonde : position et cible, en mètres. */
export interface ProbeCamera {
  cameraPosition(): readonly number[];
  cameraTarget(): readonly number[];
}

/** Dimensions du bac publiées (`TANK_ATTRIBUTE`), en mètres. */
export interface ProbeTank {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/** Indice publié d'une sélection : `aucun` sans sélection. */
function selectionText(index: number | null): string {
  return index === null ? 'aucun' : String(index);
}

/** Coordonnées au millième, séparées par des virgules (`CAMERA_ATTRIBUTE`). */
function coordinatesText(v: readonly number[]): string {
  return v.map((c) => c.toFixed(3)).join(',');
}

/**
 * Sonde de l'aquarium (#693) : seule écrivaine des attributs `data-aqfish-*` de l'élément hôte,
 * publiés pour les tests de bout en bout et les captures (`aquarium-attributes.ts`). Elle ne
 * lit le monde qu'en lecture (piège du cycle 176) et ne touche ni à la vue ni aux signaux.
 * Les attributs de la boucle d'affichage (pas, granulés, heure, lampe, rayons) et ceux des
 * relevés fréquents (plantes, distributeur) ne sont réécrits que s'ils changent, sans
 * allocation quand rien ne change.
 */
export class AquariumProbe {
  private tick: number | null = null;
  private food: number | null = null;
  private lamp: string | null = null;
  private hour: string | null = null;
  private rays: string | null = null;
  private plants: string | null = null;
  private feeder: string | null = null;

  constructor(private readonly element: HTMLElement) {}

  private set(attribute: string, value: string): void {
    this.element.setAttribute(attribute, value);
  }

  /** Pose `attribute` à `value`, ou le retire si `value` est `null`. */
  private setOrRemove(attribute: string, value: string | null): void {
    if (value === null) {
      this.element.removeAttribute(attribute);
    } else {
      this.element.setAttribute(attribute, value);
    }
  }

  /** `world.tick` (`TICK_ATTRIBUTE`), seulement quand il change ; rien sans monde. */
  publishTick(world: World | null): void {
    if (!world || world.tick === this.tick) {
      return;
    }
    this.tick = world.tick;
    this.set(TICK_ATTRIBUTE, String(world.tick));
  }

  /** Nombre de granulés (`FOOD_ATTRIBUTE`), seulement quand il change ; rien sans monde. */
  publishFood(world: World | null): void {
    if (!world || world.food.length === this.food) {
      return;
    }
    this.food = world.food.length;
    this.set(FOOD_ATTRIBUTE, String(world.food.length));
  }

  /** Rayons (#567) : force au centième et temps à la seconde entière, s'ils changent. */
  publishLightRays(strength: number, time: number): void {
    const text = `${strength.toFixed(2)};${Math.floor(time)}`;
    if (text !== this.rays) {
      this.rays = text;
      this.set(LIGHT_RAYS_ATTRIBUTE, text);
    }
  }

  /** Intensité de la lampe (#584) au centième, si elle change. */
  publishLamp(lamp: number): void {
    const text = lamp.toFixed(2);
    if (text !== this.lamp) {
      this.lamp = text;
      this.set(LAMP_ATTRIBUTE, text);
    }
  }

  /** Heure affichée au centième, si elle change ; « 24.00 » (23,999 arrondie) devient « 0.00 ». */
  publishHour(hour: number): void {
    const rounded = hour.toFixed(2);
    const text = rounded === '24.00' ? '0.00' : rounded;
    if (text !== this.hour) {
      this.hour = text;
      this.set(HOUR_ATTRIBUTE, text);
    }
  }

  /** Pousse des plantes à tige (#477, `growths` déjà mis en forme) et lumière du fond en %. */
  publishPlants(growths: string, shade: number): void {
    const text = `${growths};${Math.round(shade * 100)}`;
    if (text !== this.plants) {
      this.plants = text;
      this.set(PLANTS_ATTRIBUTE, text);
    }
  }

  /** Distributeur (#583) : `aucun` ou `réserve;heures`. Vrai s'il a changé depuis la dernière publication. */
  publishFeeder(feeder: FeederState | undefined): boolean {
    const text = feeder === undefined ? 'aucun' : `${feeder.stock};${feeder.hours.join(',')}`;
    if (text === this.feeder) {
      return false;
    }
    this.feeder = text;
    this.set(FEEDER_ATTRIBUTE, text);
    return true;
  }

  /** Relevé de l'eau (#207), pH (#236) et catappa (#239). */
  publishWater(readout: WaterReadout): void {
    const { quality, temperature, target, ammonia, nitrite, nitrate } = readout;
    this.set(WATER_ATTRIBUTE, [quality, temperature, target, ammonia, nitrite, nitrate].join(';'));
    this.set(PH_ATTRIBUTE, `${readout.ph};${readout.phZone}`);
    this.set(CATAPPA_ATTRIBUTE, `${readout.catappa};${readout.tea}`);
  }

  /** Vrai si un relevé de l'eau a déjà été publié. */
  hasWater(): boolean {
    return this.element.hasAttribute(WATER_ATTRIBUTE);
  }

  /** Traitement en cours (#361) : `jours restants;jours avant de redoser` ; retiré sans traitement. */
  publishTreatment(treatment: TreatmentReadout | null): void {
    this.setOrRemove(
      TREATMENT_ATTRIBUTE,
      treatment === null ? null : `${treatment.remainingDays};${treatment.medicationDays ?? ''}`,
    );
  }

  /** Bactéries du filtre (#606), en pour cent entier. */
  publishFilterBacteria(percent: number): void {
    this.set(FILTER_BACTERIA_ATTRIBUTE, String(percent));
  }

  /** Algues (#476) : plaques visibles, couverture en %, éclairage en heures. */
  publishAlgae(visible: number, percent: number, hours: number): void {
    this.set(ALGAE_ATTRIBUTE, `${visible};${percent};${hours}`);
  }

  /** Encrassement (#607) en % (vitres, sol) et cases du voile réellement dessinées. */
  publishFouling(fouling: TankFouling, cells: TankFouling): void {
    this.set(
      FOULING_ATTRIBUTE,
      `${Math.round(fouling.glass * 100)};${Math.round(fouling.floor * 100)}`,
    );
    this.set(FOULING_CELLS_ATTRIBUTE, `${cells.glass};${cells.floor}`);
  }

  /** Corps dans le bac (#582) ; attribut retiré sans corps. */
  publishDead(count: number): void {
    this.setOrRemove(DEAD_ATTRIBUTE, count === 0 ? null : String(count));
  }

  /** Effectifs déjà mis en forme (`formatPopulation`, #69). */
  publishPopulation(text: string): void {
    this.set(POPULATION_ATTRIBUTE, text);
  }

  /** Mode du bac (soins ou décor). */
  publishCareMode(mode: string): void {
    this.set(CARE_MODE_ATTRIBUTE, mode);
  }

  /** Occupation du bac (#809), fraction de sa capacité : pourcentage entier ou `inf`. */
  publishCapacity(occupation: number): void {
    this.set(
      CAPACITY_ATTRIBUTE,
      Number.isFinite(occupation) ? String(Math.round(occupation * 100)) : 'inf',
    );
  }

  /** Force du courant (#460). */
  publishCurrent(level: string): void {
    this.set(CURRENT_ATTRIBUTE, level);
  }

  /** Animaux mis en évidence (#483) ; attribut retiré à 0. */
  publishAlertHighlight(count: number): void {
    this.setOrRemove(ALERT_HIGHLIGHT_ATTRIBUTE, count === 0 ? null : String(count));
  }

  /** Environnement affiché (#87). */
  publishEnvironment(id: string): void {
    this.set(ENVIRONMENT_ATTRIBUTE, id);
  }

  /** Forme du bassin et dimensions du bac (`largeur:hauteur:profondeur`). */
  publishTank(shape: string, dims: ProbeTank): void {
    this.set(SHAPE_ATTRIBUTE, shape);
    this.set(TANK_ATTRIBUTE, `${dims.width}:${dims.height}:${dims.depth}`);
  }

  /** Graine du monde, fixée au démarrage. */
  publishSeed(seed: number): void {
    this.set(SEED_ATTRIBUTE, String(seed));
  }

  /** Vitesse de simulation (#52). */
  publishSpeed(speed: number): void {
    this.set(SPEED_ATTRIBUTE, String(speed));
  }

  /** Décor affiché ou masqué (#52). */
  publishDecorVisible(visible: boolean): void {
    this.set(DECOR_ATTRIBUTE, String(visible));
  }

  /** Caméra libre dans la pièce (#343). */
  publishFreeCamera(active: boolean): void {
    this.set(FREE_CAMERA_ATTRIBUTE, String(active));
  }

  /** Mouvements décoratifs réduits (#406). */
  publishReducedMotion(reduced: boolean): void {
    this.set(REDUCED_MOTION_ATTRIBUTE, String(reduced));
  }

  /** Pluie (#106). */
  publishRain(raining: boolean): void {
    this.set(RAIN_ATTRIBUTE, String(raining));
  }

  /** Pièce autour du bac affichée (#187). */
  publishRoomShown(shown: boolean): void {
    this.set(ROOM_ATTRIBUTE, String(shown));
  }

  /** Nombre d'éléments de la pièce graphique (#188). */
  publishRoomCount(count: number): void {
    this.set(ROOM_COUNT_ATTRIBUTE, String(count));
  }

  /** Bacs et meubles du catalogue de la pièce (#305). */
  publishRoomCatalog(tanks: number, supports: number): void {
    this.set(ROOM_TANKS_ATTRIBUTE, String(tanks));
    this.set(ROOM_SUPPORTS_ATTRIBUTE, String(supports));
  }

  /** Bac sélectionné dans la liste (#306). */
  publishSelectedTank(id: number): void {
    this.set(SELECTED_TANK_ATTRIBUTE, String(id));
  }

  /** Rendu des granulés (#117). */
  publishFoodStyle(style: string): void {
    this.set(FOOD_STYLE_ATTRIBUTE, style);
  }

  /** Raclette en main (#476). */
  publishScraper(held: boolean): void {
    this.set(SCRAPER_ATTRIBUTE, String(held));
  }

  /** Sécateur en main (#477). */
  publishPruner(held: boolean): void {
    this.set(PRUNER_ATTRIBUTE, String(held));
  }

  /** Étape de la séance d'entretien (#604) ; attribut retiré hors séance. */
  publishCareSession(step: string | null): void {
    this.setOrRemove(CARE_SESSION_ATTRIBUTE, step);
  }

  /** État du moteur de chute de l'éditeur (#170). */
  publishDecorPhysics(state: DecorPhysicsState): void {
    this.set(DECOR_PHYSICS_ATTRIBUTE, state);
  }

  /** Mode édition du décor (#167). */
  publishEditing(editing: boolean): void {
    this.set(EDITING_ATTRIBUTE, String(editing));
  }

  /** Nombre d'éléments du décor (#167). */
  publishDecorCount(count: number): void {
    this.set(DECOR_COUNT_ATTRIBUTE, String(count));
  }

  /** Élément de décor sélectionné (#167). */
  publishDecorSelection(index: number | null): void {
    this.set(DECOR_SELECTION_ATTRIBUTE, selectionText(index));
  }

  /** Élément de la pièce sélectionné (#188). */
  publishRoomSelection(index: number | null): void {
    this.set(ROOM_SELECTION_ATTRIBUTE, selectionText(index));
  }

  /** État de la sauvegarde automatique (#70) ; inchangé sans état (mode capture). */
  publishSave(status: SaveStatus | null): void {
    if (status !== null) {
      this.set(SAVE_ATTRIBUTE, status);
    }
  }

  /** Heure figée ou non. */
  publishHourFrozen(frozen: boolean): void {
    this.set(HOUR_FROZEN_ATTRIBUTE, String(frozen));
  }

  /** Filtre de rendu (`pixel` ou `aucun`). */
  publishFilter(filter: string): void {
    this.set(FILTER_ATTRIBUTE, filter);
  }

  /** Position et cible de la caméra au millième ; rien sans vue. */
  publishCamera(camera: ProbeCamera | null): void {
    if (!camera) {
      return;
    }
    this.set(CAMERA_ATTRIBUTE, coordinatesText(camera.cameraPosition()));
    this.set(CAMERA_TARGET_ATTRIBUTE, coordinatesText(camera.cameraTarget()));
  }

  /** Source du fond d'écran animé choisie. */
  publishWallpaper(source: string): void {
    this.set(WALLPAPER_ATTRIBUTE, source);
  }

  /** Fond d'écran en pause (fenêtre masquée) : `1`, sinon `0`. */
  publishWallpaperPaused(hidden: boolean): void {
    this.set(WALLPAPER_PAUSED_ATTRIBUTE, hidden ? '1' : '0');
  }
}
