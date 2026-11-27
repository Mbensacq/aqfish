import { createAquariumScene, type AquariumScene } from './aquarium-scene';
import { SPECIES, speciesVariants } from '../sim/species';
import { bubbleSourceFor } from '../sim/bubbles';
import { environmentDataWater, type Environment } from '../sim/environment';
import { BubbleLayer } from './bubble-layer';
import { AlertHighlightLayer } from './alert-highlight-layer';
import { AlgaeLayer } from './algae-layer';
import { FoulingLayer } from './fouling-layer';
import { CatappaLayer } from './catappa-layer';
import { FeederLayer } from './feeder-layer';
import { DecorLayer } from './decor-layer';
import type { EffectLayer, SceneLayer } from './effect-layer';
import { CurrentIndicatorLayer } from './current-indicator-layer';
import { FloatingLeafLayer } from './floating-leaf-layer';
import { FishLayer, MAX_FISH_PER_SPECIES } from './fish-layer';
import { EggLayer } from './egg-layer';
import { ExuviaLayer } from './exuvia-layer';
import type { Egg } from '../sim/eggs';
import type { FoodPellet } from '../sim/food';
import type { Exuvia } from '../sim/shrimp-molt';
import { FoodLayer } from './food-layer';
import { LilyPadLayer } from './lily-pad-layer';
import { RainLayer } from './rain-layer';
import { RoomLayer } from './room-layer';
import { WaterLightLayer } from './water-light';
import { LightRaysLayer, LIGHT_RAY_ENVIRONMENTS } from './light-rays-layer';

/** Ce que pose `AquariumView.updateGround` : granulés, œufs et exuvies du monde au temps `time`. */
export interface GroundFrame {
  readonly food: readonly FoodPellet[];
  readonly eggs: readonly Egg[] | undefined;
  /** Durée d'incubation des œufs (teinte des œufs mûrs). */
  readonly hatchTime: number;
  readonly exuviae: readonly Exuvia[] | undefined;
  readonly time: number;
}

/**
 * Scène statique d'un environnement et toutes les couches de `AquariumView` (#698), créées
 * dans un ordre fixe : décor, pièce, nourriture, œufs, algues, voile et repères d'alerte
 * d'abord, puis la scène, les poissons et les effets. Les identifiants de Three.js suivent
 * cet ordre et départagent le tri des objets opaques : le changer peut changer le rendu.
 */
export class ViewLayers {
  /** Décor du monde (rochers), fixé par `setDecor`. */
  readonly decor = new DecorLayer();
  /** Pièce autour du bac (#187), masquée par défaut. */
  readonly room = new RoomLayer();
  /** Granulés de nourriture (issue #67), posés par `updateGround`. */
  readonly food = new FoodLayer();
  /** Œufs des corydoras (issue #478) : masqués tant qu'il n'y en a aucun. */
  readonly eggs = new EggLayer();
  /** Plaques d'algues sur les vitres (issue #476). */
  readonly algae = new AlgaeLayer();
  readonly fouling = new FoulingLayer();
  /** Repères des animaux désignés par une alerte (#483), masqués par défaut. */
  readonly alertHighlight = new AlertHighlightLayer();
  readonly world: AquariumScene;
  /**
   * Une couche par apparence de chaque espèce de `SPECIES` (`speciesVariants`), dans l'ordre
   * de déclaration (aucun champ par espèce).
   */
  readonly fish: readonly FishLayer[];
  /** Bulles du diffuseur (ADR 0017), selon la graine fixée par `setDecor`. */
  readonly bubbles: BubbleLayer;
  /** Caustiques sur le sable et reflet de surface (ADR 0017). */
  readonly waterLight: WaterLightLayer;
  /** Rayons de lumière dans l'eau (issue #567, ADR 0134). */
  readonly lightRays: LightRaysLayer;
  /** Nénuphars (issue #103), tirés de la graine fixée par `setDecor`. */
  readonly lilyPads: LilyPadLayer;
  /** Pluie (issue #106), possible dans un environnement qui en a (`Environment.rain`). */
  readonly rain: RainLayer;
  /** Feuilles mortes flottantes (issue #107), dans un environnement qui en a. */
  readonly floatingLeaves: FloatingLeafLayer;
  /** Repère du sens du courant (issue #460), masqué courant coupé. */
  readonly current: CurrentIndicatorLayer;
  /** Feuilles de catappa sur le sol (issue #239). */
  readonly catappa: CatappaLayer;
  /** Distributeur de nourriture automatique, sur le bord du bac (issue #583). */
  readonly feeder: FeederLayer;
  /**
   * Effets animés au contrat commun `EffectLayer` (issue #125) : bulles, pluie, feuilles
   * mortes, puis repère du courant.
   */
  readonly effects: readonly EffectLayer[];
  /**
   * Exuvies des crevettes (#859) : créées en dernier, ajoutées en dernier à la scène, pour que les
   * identifiants des couches antérieures, et donc le tri des objets opaques, ne changent pas.
   */
  readonly exuviae: ExuviaLayer;
  /** Toutes les couches, dans l'ordre d'ajout à la scène (et de libération). */
  readonly all: readonly SceneLayer[];

  constructor(environment: Environment | undefined) {
    this.world = createAquariumScene(environment);
    const { dimensions, environment: env } = this.world;
    const water = environmentDataWater(env);
    this.fish = Object.values(SPECIES).flatMap((species) =>
      speciesVariants(species).map(
        (_, index) => new FishLayer(species, MAX_FISH_PER_SPECIES, index),
      ),
    );
    // Bulles et diffuseur : seulement dans un environnement qui en a (bac tropical). Masquées,
    // elles ne sont pas posées (`updateVisibleEffects`).
    // Diffuseur à l'échelle du bac (issue #171), comme les bulles de la simulation.
    this.bubbles = new BubbleLayer(bubbleSourceFor(dimensions), water);
    this.bubbles.object.visible = env.bubbles;
    this.waterLight = new WaterLightLayer(dimensions, env.caustics, water.maxY);
    this.lightRays = new LightRaysLayer(
      dimensions,
      LIGHT_RAY_ENVIRONMENTS.includes(env.id),
      water.maxY,
    );
    this.lilyPads = new LilyPadLayer(dimensions, water.maxY);
    this.rain = new RainLayer(water);
    this.floatingLeaves = new FloatingLeafLayer(water);
    this.floatingLeaves.object.visible = env.floatingLeaves;
    this.current = new CurrentIndicatorLayer(water);
    this.effects = [this.bubbles, this.rain, this.floatingLeaves, this.current];
    this.catappa = new CatappaLayer(water);
    this.feeder = new FeederLayer(dimensions);
    this.exuviae = new ExuviaLayer();
    this.all = this.sceneOrder();
    for (const layer of this.all) {
      this.world.scene.add(layer.object);
    }
  }

  /** Couches dans l'ordre d'ajout à la scène. */
  private sceneOrder(): readonly SceneLayer[] {
    return [
      ...this.fish,
      this.decor,
      this.bubbles,
      this.food,
      this.eggs,
      this.waterLight,
      this.lightRays,
      this.lilyPads,
      this.rain,
      this.floatingLeaves,
      this.current,
      this.catappa,
      this.feeder,
      this.algae,
      this.fouling,
      this.alertHighlight,
      this.room,
      this.exuviae,
    ];
  }

  /**
   * Luminosité des couleurs plates (poissons, effets, granulés, œufs, feuilles, distributeur,
   * algues et voile, ADR 0019).
   */
  setFlatBrightness(brightness: number): void {
    for (const layer of this.fish) {
      layer.setBrightness(brightness);
    }
    for (const layer of this.effects) {
      layer.setBrightness(brightness);
    }
    this.food.setBrightness(brightness);
    this.eggs.setBrightness(brightness);
    this.exuviae.setBrightness(brightness);
    this.catappa.setBrightness(brightness);
    this.feeder.setBrightness(brightness);
    this.algae.setBrightness(brightness);
    this.fouling.setBrightness(brightness);
  }

  /** Taille de la surface de rendu (pixels) des couches dont les traits en dépendent. */
  setResolution(width: number, height: number): void {
    this.decor.setResolution(width, height);
    this.room.setResolution(width, height);
    this.lilyPads.setResolution(width, height);
    this.floatingLeaves.setResolution(width, height);
  }

  /** Échelle des points (bulles, granulés) : 1 en pixel art, un pixel de scène sans filtre. */
  setPointScale(scale: number): void {
    this.bubbles.setPointScale(scale);
    this.food.setPointScale(scale);
  }

  /** Libère toutes les couches, puis la scène. */
  dispose(): void {
    for (const layer of this.all) {
      layer.dispose();
    }
    this.world.dispose();
  }
}
