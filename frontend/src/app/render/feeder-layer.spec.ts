import { Mesh, MeshBasicMaterial } from 'three';

import { FEEDER_BODY, FEEDER_DROP_BELOW_RIM, FeederLayer, feederParts } from './feeder-layer';
import { feederSpot } from '../sim/auto-feeder';
import { DEFAULT_TANK, waterVolume } from '../sim/tank';
import { PALETTE_COLORS } from './palette';

describe('FeederLayer (#583)', () => {
  it('masquée par défaut (bac sans distributeur : images inchangées)', () => {
    const layer = new FeederLayer(DEFAULT_TANK);
    expect(layer.visible).toBe(false);
    layer.setVisible(true);
    expect(layer.visible).toBe(true);
    layer.setVisible(false);
    expect(layer.object.visible).toBe(false);
    layer.dispose();
  });

  it('accrochée au bord arrière, au-dessus du point de chute des rations', () => {
    const layer = new FeederLayer(DEFAULT_TANK);
    const spot = feederSpot(waterVolume(DEFAULT_TANK));
    const body = layer.object.children[0] as Mesh;
    const [w, h, d] = FEEDER_BODY;
    expect(Math.abs(body.position.x - spot.x)).toBeLessThan(w / 2);
    // Le boîtier chevauche la vitre arrière et sa face avant est au-dessus du point de chute.
    expect(body.position.z - d / 2).toBeLessThan(-DEFAULT_TANK.depth / 2);
    expect(body.position.z + d / 2).toBeGreaterThan(spot.z);
    expect(body.position.y - h / 2).toBeCloseTo(DEFAULT_TANK.height - FEEDER_DROP_BELOW_RIM, 12);
    layer.dispose();
  });

  it('couleurs de la palette seulement, assombries la nuit', () => {
    for (const part of feederParts()) {
      expect(PALETTE_COLORS).toContain(part.color);
    }
    const layer = new FeederLayer(DEFAULT_TANK);
    const material = (layer.object.children[0] as Mesh).material as MeshBasicMaterial;
    const day = material.color.r;
    layer.setBrightness(0.5);
    expect(layer.brightness).toBe(0.5);
    expect(material.color.r).toBeCloseTo(day * 0.5, 6);
    layer.setBrightness(Number.NaN);
    expect(layer.brightness).toBe(0.5);
    layer.dispose();
  });
});
