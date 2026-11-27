import { Color, Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { EXUVIA_LIFETIME_SECONDS, MAX_EXUVIAE, type Exuvia } from '../sim/shrimp-molt';
import { SPECIES } from '../sim/species';
import { EXUVIA_COLOR, EXUVIA_LENGTH_RATIO, EXUVIA_OLD_COLOR, ExuviaLayer } from './exuvia-layer';

const shell = (overrides: Partial<Exuvia> = {}): Exuvia => ({
  species: 'cerise',
  x: 0.1,
  y: 0.03,
  z: -0.05,
  yaw: 0,
  size: 1,
  time: 100,
  ...overrides,
});

describe('couche des exuvies (#859)', () => {
  it('masquée et vide sans exuvie ; visible avec une instance par exuvie', () => {
    const layer = new ExuviaLayer();
    expect(layer.object.visible).toBe(false);
    layer.update(undefined, 0);
    expect(layer.count).toBe(0);

    layer.update([shell(), shell({ x: -0.1 })], 100);
    expect(layer.count).toBe(2);
    expect(layer.object.visible).toBe(true);

    layer.update([], 200);
    expect(layer.count).toBe(0);
    expect(layer.object.visible).toBe(false);
    layer.dispose();
  });

  it('allongée dans l’axe de la crevette, à sa taille, plafonnée à MAX_EXUVIAE', () => {
    const layer = new ExuviaLayer();
    layer.update([shell({ yaw: Math.PI / 2, size: 0.5 })], 100);
    const m = new Matrix4();
    layer.mesh.getMatrixAt(0, m);
    const position = new Vector3();
    const scale = new Vector3();
    m.decompose(position, new Quaternion(), scale);
    // Cap de π/2 : la longueur suit l'axe Z du monde.
    const along = new Vector3(1, 0, 0).applyMatrix4(m.clone().setPosition(0, 0, 0));
    expect(position.x).toBeCloseTo(0.1);
    expect(position.y).toBeCloseTo(0.03);
    expect(position.z).toBeCloseTo(-0.05);
    expect(scale.x).toBeCloseTo(SPECIES.cerise.bodyLength * 0.5 * EXUVIA_LENGTH_RATIO);
    expect(Math.abs(along.z)).toBeGreaterThan(Math.abs(along.x));

    layer.update(
      Array.from({ length: MAX_EXUVIAE + 5 }, () => shell()),
      100,
    );
    expect(layer.count).toBe(MAX_EXUVIAE);
    layer.dispose();
  });

  it('deux teintes : fraîche, puis passée à la seconde moitié de sa vie', () => {
    const layer = new ExuviaLayer();
    const color = new Color();
    layer.update([shell()], 100 + EXUVIA_LIFETIME_SECONDS * 0.4);
    layer.mesh.getColorAt(0, color);
    expect(color.getHexString()).toBe(new Color(EXUVIA_COLOR).getHexString());
    layer.update([shell()], 100 + EXUVIA_LIFETIME_SECONDS * 0.6);
    layer.mesh.getColorAt(0, color);
    expect(color.getHexString()).toBe(new Color(EXUVIA_OLD_COLOR).getHexString());
    layer.dispose();
  });

  it('luminosité des couleurs plates', () => {
    const layer = new ExuviaLayer();
    layer.setBrightness(0.5);
    expect(layer.brightness).toBe(0.5);
    layer.setBrightness(-1);
    expect(layer.brightness).toBe(0.5);
    layer.dispose();
  });
});
