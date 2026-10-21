import { Group } from 'three';

import { environmentWater } from '../sim/environment';
import { BubbleLayer } from './bubble-layer';
import { type EffectLayer, updateVisibleEffects } from './effect-layer';
import { RainLayer } from './rain-layer';

/** Double d'une couche d'effet qui consigne les temps reçus par `update`. */
class RecordingEffect implements EffectLayer {
  readonly object = new Group();
  readonly times: number[] = [];
  constructor(
    name: string,
    private readonly log: string[],
  ) {
    this.object.name = name;
  }
  update(time: number): void {
    this.times.push(time);
    this.log.push(`${this.object.name} ${time}`);
  }
  setBrightness(factor: number): void {
    this.log.push(`${this.object.name} luminosité ${factor}`);
  }
  setSeed(seed: number): void {
    this.log.push(`${this.object.name} graine ${seed}`);
  }
  dispose(): void {
    this.log.push(`${this.object.name} libérée`);
  }
}

describe('EffectLayer (issue #125)', () => {
  it('pose les couches affichées dans l’ordre de la liste, au temps donné', () => {
    const log: string[] = [];
    const a = new RecordingEffect('a', log);
    const b = new RecordingEffect('b', log);
    updateVisibleEffects([a, b], 1.5);
    updateVisibleEffects([b, a], 0);
    expect(log).toEqual(['a 1.5', 'b 1.5', 'b 0', 'a 0']);
  });

  it('ne pose pas une couche masquée, la pose de nouveau une fois affichée', () => {
    const log: string[] = [];
    const hidden = new RecordingEffect('masquée', log);
    const shown = new RecordingEffect('affichée', log);
    hidden.object.visible = false;
    updateVisibleEffects([hidden, shown], 2);
    expect(hidden.times).toEqual([]);
    expect(shown.times).toEqual([2]);
    hidden.object.visible = true;
    updateVisibleEffects([hidden, shown], 3);
    expect(hidden.times).toEqual([3]);
  });

  it('liste vide : rien à faire', () => {
    expect(() => updateVisibleEffects([], 1)).not.toThrow();
  });

  it('bulles et pluie suivent le contrat commun', () => {
    const bubbles: EffectLayer = new BubbleLayer();
    const rain = new RainLayer(environmentWater('bassin'));
    const effects: readonly EffectLayer[] = [bubbles, rain];
    for (const layer of effects) {
      layer.setSeed(7);
      layer.setBrightness(0.5);
    }
    // La pluie, arrêtée, est masquée : elle n'est pas posée.
    updateVisibleEffects(effects, 10);
    expect((bubbles as BubbleLayer).count).toBeGreaterThan(0);
    expect(rain.dropCount).toBe(0);
    expect(rain.brightness).toBe(0.5);
    rain.setEnabled(true);
    updateVisibleEffects(effects, 10);
    expect(rain.dropCount).toBeGreaterThan(0);
    for (const layer of effects) {
      layer.dispose();
    }
  });
});
