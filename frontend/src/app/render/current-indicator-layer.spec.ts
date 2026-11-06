import { waterVolume } from '../sim/tank';
import {
  CHEVRON_COUNTS,
  CHEVRON_SLIDE,
  CHEVRON_SLIDE_PERIOD,
  CurrentIndicatorLayer,
  INDICATOR_FRONT_INSET,
} from './current-indicator-layer';

describe('repère du courant (#460)', () => {
  const water = waterVolume();

  it('est masqué à la création et courant coupé', () => {
    const layer = new CurrentIndicatorLayer(water);
    expect(layer.object.visible).toBe(false);
    expect(layer.count).toBe(0);
    layer.setCurrent(0, 0);
    expect(layer.count).toBe(0);
    layer.dispose();
  });

  it('montre deux chevrons au courant doux, trois au fort, bornés', () => {
    const layer = new CurrentIndicatorLayer(water);
    layer.setCurrent(0, CHEVRON_COUNTS.doux);
    expect(layer.count).toBe(2);
    layer.setCurrent(0, CHEVRON_COUNTS.fort);
    expect(layer.count).toBe(3);
    layer.setCurrent(0, 99);
    expect(layer.count).toBe(3);
    layer.setCurrent(0, -1);
    expect(layer.count).toBe(0);
    layer.dispose();
  });

  it('pointe vers l’aval, le long de la vitre avant', () => {
    const layer = new CurrentIndicatorLayer(water);
    layer.setCurrent(Math.PI / 2, 2);
    const arrow = layer.object.children[0];
    expect(arrow.rotation.y).toBeCloseTo(-Math.PI / 2, 12);
    expect(arrow.position.z).toBeCloseTo(water.maxZ - INDICATOR_FRONT_INSET, 12);
    layer.dispose();
  });

  it('glisse au temps simulé, périodiquement ; immobile en mouvements réduits', () => {
    const layer = new CurrentIndicatorLayer(water);
    layer.setCurrent(0, 3);
    layer.update(0);
    const start = layer.firstOffset;
    layer.update(CHEVRON_SLIDE_PERIOD / 2);
    expect(layer.firstOffset - start).toBeCloseTo(CHEVRON_SLIDE / 2, 12);
    layer.update(CHEVRON_SLIDE_PERIOD);
    expect(layer.firstOffset).toBeCloseTo(start, 12);
    layer.setStill(true);
    layer.update(CHEVRON_SLIDE_PERIOD / 2);
    expect(layer.firstOffset).toBeCloseTo(start, 12);
    layer.dispose();
  });

  it('s’assombrit avec la lumière, ignore les facteurs invalides', () => {
    const layer = new CurrentIndicatorLayer(water);
    layer.setBrightness(0.5);
    layer.setBrightness(Number.NaN);
    layer.setBrightness(-1);
    layer.setSeed();
    expect(layer.object.name).toBe('courant');
    layer.dispose();
  });
});
