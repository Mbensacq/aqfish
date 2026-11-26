import { createDayLight, type DayLight } from '../sim/daylight';
import { createLightRays, lightRaysInto } from '../sim/light-rays';
import {
  decorTintInto,
  flatBrightness,
  type MutableTint,
  tonePenaltiesInto,
  type TonePenalties,
} from './night-shade';
import { overcastBrightness, RAIN_OVERCAST_BRIGHTNESS, RAIN_TONES, stepOvercast } from './overcast';
import { environmentTonePenalties, type PalettePass } from './palette-pass';
import type { ViewLayers } from './view-layers';

/** Tons d'environnement de l'eau teintée par les feuilles de catappa (issue #239). */
export const TEA_TONES: readonly string[] = ['eauThe', 'eauTheClaire'];

/**
 * Lumière de la vue (#698) : lumière du jour (ADR 0018), ciel couvert de la pluie (ADR 0082)
 * et son fondu (#338), rayons de lumière (#567), ombre des plantes hautes (#477) et tons
 * proposés à la passe palette (ADR 0021, ADR 0039). Aucune allocation par image.
 */
export class SceneLighting {
  /** Tampons réutilisés par `applyLight` (aucune allocation). */
  private readonly decorTint: MutableTint = [1, 1, 1];
  private readonly penalties: TonePenalties = { night: 0, twilight: 0 };
  /** Dernière lumière du jour appliquée (`update`), réappliquée quand la pluie change. */
  private readonly light = createDayLight();
  /** Heure des rayons (`updateLightRays`) et tampon des rayons, réutilisé. */
  private raysHour = 12;
  private readonly rays = createLightRays();
  /**
   * Facteur de ciel couvert appliqué (ADR 0082) : `overcastBrightness` de la pluie courante,
   * ou en route vers lui pendant un fondu (`setRain(…, true)`, `stepOvercast`, issue #338).
   */
  private overcast = 1;
  /** Lumière gardée au fond sous les plantes hautes (issue #477, `plantShade`), 1 sans ombre. */
  private plantShade = 1;

  constructor(
    private readonly layers: ViewLayers,
    private readonly palette: PalettePass,
  ) {}

  /** Facteur de ciel couvert appliqué (1 hors pluie et fondu terminé). */
  get overcastFactor(): number {
    return this.overcast;
  }

  /** Applique la lumière du jour `light` (copiée) et le ciel couvert courant. */
  update(light: DayLight): void {
    this.light.intensity = light.intensity;
    for (let k = 0; k < 3; k++) {
      this.light.tint[k] = light.tint[k];
      this.light.sky[k] = light.sky[k];
    }
    this.applyLight();
  }

  /** Oriente les rayons de lumière selon l'heure `hour` (`sim/light-rays.ts`). */
  updateLightRays(hour: number): void {
    lightRaysInto(hour, 0, this.rays);
    this.raysHour = hour;
    this.applyLightRays();
  }

  /**
   * Pluie `enabled` (sans effet dans un environnement sans pluie) : ciel couvert d'un coup,
   * ou en fondu avancé par `stepOvercastFade` si `fade`. Renvoie l'état appliqué.
   */
  setRain(enabled: boolean, fade: boolean): boolean {
    const rain = this.layers.rain;
    if (this.layers.world.environment.rain) {
      const changed = rain.isEnabled !== enabled;
      rain.setEnabled(enabled);
      const overcastBefore = this.overcast;
      if (!fade) {
        this.overcast = overcastBrightness(enabled);
      }
      if (changed || this.overcast !== overcastBefore) {
        this.applyLight();
        this.applyTonePenalties();
      }
    }
    return rain.isEnabled;
  }

  /** Avance le fondu du ciel couvert de `dtSeconds` ; `true` si le facteur a changé. */
  stepOvercastFade(dtSeconds: number): boolean {
    const target = overcastBrightness(this.layers.rain.isEnabled);
    if (this.overcast === target) {
      return false;
    }
    const next = stepOvercast(this.overcast, target, dtSeconds);
    if (next === this.overcast) {
      return false;
    }
    this.overcast = next;
    this.applyLight();
    return true;
  }

  /** Lumière gardée au fond sous les plantes hautes, dans ]0, 1] ; ignorée sinon. */
  setPlantShade(shade: number): void {
    if (shade !== this.plantShade && shade > 0 && shade <= 1) {
      this.plantShade = shade;
      this.applyLight();
    }
  }

  /** Teinte brun-thé de l'eau (`AquariumScene.setTea`) et tons qui l'accompagnent. */
  setWaterTea(tea: number): void {
    if (tea !== this.layers.world.tea) {
      this.layers.world.setTea(tea);
      this.applyTonePenalties();
    }
  }

  /**
   * Tons d'environnement proposés à la passe (ADR 0039) : ceux de l'environnement, plus les
   * tons de l'eau brun-thé (`TEA_TONES`) quand elle est teintée (issue #239), et ceux du ciel
   * couvert (`RAIN_TONES`) sous la pluie (issue #123).
   */
  applyTonePenalties(): void {
    const world = this.layers.world;
    const tones = [...world.environment.tones];
    if (world.tea > 0) {
      tones.push(...TEA_TONES);
    }
    if (this.layers.rain.isEnabled) {
      tones.push(...RAIN_TONES);
    }
    this.palette.setEnvironmentPenalties(environmentTonePenalties(tones));
  }

  /** Applique `this.light` et le ciel couvert de la pluie courante. */
  private applyLight(): void {
    const { light, overcast, layers } = this;
    layers.world.setOvercast(overcast);
    layers.world.setDaylight(light);
    layers.waterLight.setDaylight(light.intensity);
    this.applyLightRays();
    // Poissons, bulles, gouttes et granulés (couleurs plates) gardent leur clarté : vus à
    // travers l'eau assombrie, et des koïs ou des gouttes assombris changeraient de couleur.
    layers.setFlatBrightness(flatBrightness(light.intensity));
    const tint = decorTintInto(light.intensity, this.decorTint);
    for (let k = 0; k < 3; k++) {
      tint[k] *= overcast;
    }
    // Ombre des plantes hautes (#477, #494) : sur tout le décor posé au fond (plantes, rochers,
    // bois, une seule matière), ni sur les animaux ni sur l'eau ; × 1 sans ombre.
    layers.decor.setTint(tint, this.plantShade, light.intensity, overcast);
    layers.lilyPads.setTint(tint, light.intensity, overcast);
    layers.room.setDaylight(light, overcast);
    // Pénalités tirées de la seule intensité du jour : jamais de tons du soir à midi.
    const penalties = tonePenaltiesInto(light.intensity, this.penalties);
    this.palette.setTonePenalties(penalties.night, penalties.twilight);
  }

  /** Rayons de l'heure `raysHour` sous le ciel couvert courant (1 − facteur, ramené à [0, 1]). */
  private applyLightRays(): void {
    const cloudiness = (1 - this.overcast) / (1 - RAIN_OVERCAST_BRIGHTNESS);
    lightRaysInto(this.raysHour, cloudiness, this.rays);
    this.layers.lightRays.setRays(this.rays.strength, this.rays.tilt);
  }
}
