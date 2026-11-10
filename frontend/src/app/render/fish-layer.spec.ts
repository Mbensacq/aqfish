import {
  Box3,
  Matrix4,
  Mesh,
  Object3D,
  ShaderLib,
  Vector3,
  type MeshBasicMaterial,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three';

import { CORYDORA, GUPPY, KOI, NEON, speciesVariantIndex } from '../sim/species';
import { createFish, stepFish, swimBounds, type Fish } from '../sim/swimmer';
import { DEFAULT_TANK, waterVolume } from '../sim/tank';
import { TAIL_LAG } from '../sim/undulation';
import { HEALTH_FLOOR } from '../sim/wellbeing';
import { createDefaultWorld } from '../sim/world';
import { CAMERA_FOV_DEG, framingDistance } from './camera-presets';
import {
  DULL_ATTRIBUTE,
  DULL_DARKENING,
  DULL_DESATURATION,
  FIN_ROT_ATTRIBUTE,
  FIN_ROT_EDGE,
  FIN_ROT_EDGE_COLOR,
  FIN_ROT_LOSS_SHARE,
  FIN_ROT_MIN,
  finRotFray,
  FishLayer,
  ICH_ATTRIBUTE,
  ICH_SPOT_COLOR,
  ICH_SPOT_MIN,
  ICH_SPOT_SHARE,
  ichSpots,
  interpolateFishPose,
  withDullness,
  withFinRot,
  withVelvet,
  velvetVeil,
  VELVET_ATTRIBUTE,
  VELVET_COLOR,
  VELVET_DUST_SHARE,
  VELVET_MIN,
  VELVET_VEIL,
  withIchSpots,
  type FishPose,
} from './fish-layer';
import {
  createFishGeometry,
  FRAY_ATTRIBUTE,
  SPOT_ATTRIBUTE,
  UNFRAYED_RANK,
  UNSPOTTED_RANK,
} from './fish-model';
import { FIN_ROT_MAX, FIN_ROT_VISIBLE_AT } from '../sim/fin-rot';
import { VELVET_MAX, VELVET_VISIBLE_AT } from '../sim/velvet';
import { PALETTE } from './palette';
import { ICH_AGGRAVATED_AT, ICH_VISIBLE_AT } from '../sim/disease';
import { PIXEL_SIZE } from './pixel-art';

const BOUNDS = swimBounds(NEON, waterVolume());

function fishAfterSteps(id: number, steps: number): Fish {
  const fish = createFish(42, id, 'neon', BOUNDS) as { -readonly [K in keyof Fish]: Fish[K] };
  for (let i = 0; i < steps; i++) {
    stepFish(fish, 1 / 60, BOUNDS);
  }
  return fish;
}

function pose(): FishPose {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, phase: 0 };
}

describe('interpolateFishPose', () => {
  const fish: Fish = {
    ...fishAfterSteps(0, 0),
    px: 0,
    x: 1,
    py: 2,
    y: 4,
    pz: -1,
    z: 1,
    pyaw: 3,
    yaw: -3, // passage par ±π : le plus court chemin fait ~0,28 rad, pas ~6 rad
    ppitch: 0,
    pitch: 0.2,
    pphase: 6,
    phase: 0.2, // phase repassée par 0
  };

  it('alpha = 0 : pas précédent ; alpha = 1 : pas courant', () => {
    expect(interpolateFishPose(fish, 0, pose())).toMatchObject({ x: 0, y: 2, z: -1, yaw: 3 });
    const end = interpolateFishPose(fish, 1, pose());
    expect(end.x).toBe(1);
    expect(end.y).toBe(4);
    expect(end.pitch).toBeCloseTo(0.2, 12);
  });

  it('alpha = 0,5 : milieu, angles par le plus court chemin', () => {
    const mid = interpolateFishPose(fish, 0.5, pose());
    expect(mid.x).toBeCloseTo(0.5, 12);
    expect(Math.abs(Math.abs(mid.yaw) - Math.PI)).toBeLessThan(0.15);
    expect(mid.phase).toBeGreaterThan(6);
    expect(mid.phase).toBeLessThan(2 * Math.PI + 0.2);
  });

  it('alpha hors de [0, 1] est borné', () => {
    expect(interpolateFishPose(fish, -1, pose()).x).toBe(0);
    expect(interpolateFishPose(fish, 2, pose()).x).toBe(1);
  });

  it('écrit dans out et le renvoie (aucune allocation)', () => {
    const out = pose();
    expect(interpolateFishPose(fish, 0.3, out)).toBe(out);
  });
});

describe('FishLayer', () => {
  let layer: FishLayer;
  const m = new Matrix4();
  const p = new Vector3();

  beforeEach(() => (layer = new FishLayer(NEON, 4)));
  afterEach(() => layer.dispose());

  it('une instance par poisson, placée à la position interpolée', () => {
    const entities = [fishAfterSteps(0, 10), fishAfterSteps(1, 10)];
    layer.update(entities, 1);
    expect(layer.count).toBe(2);
    p.setFromMatrixPosition(layer.bodyMatrixAt(1, m));
    expect(p.x).toBeCloseTo(entities[1].x, 6);
    expect(p.y).toBeCloseTo(entities[1].y, 6);
    expect(p.z).toBeCloseTo(entities[1].z, 6);
  });

  it('orienté dans le sens de la nage (à l’ondulation près)', () => {
    const fish = {
      ...fishAfterSteps(0, 0),
      yaw: Math.PI / 2,
      pyaw: Math.PI / 2,
      pitch: 0,
      ppitch: 0,
    };
    layer.update([fish], 1);
    const forward = new Vector3(1, 0, 0).transformDirection(layer.bodyMatrixAt(0, m));
    // cap π/2 : nage vers +Z
    expect(forward.z).toBeGreaterThan(0.95);
  });

  it('la queue est accrochée à l’arrière du corps', () => {
    const fish = fishAfterSteps(0, 0);
    layer.update([fish], 1);
    const hinge = new Vector3().setFromMatrixPosition(layer.tailMatrixAt(0, m));
    const center = new Vector3(fish.x, fish.y, fish.z);
    expect(hinge.distanceTo(center)).toBeCloseTo(NEON.bodyLength / 2, 6);
  });

  it('la pose de la queue dépend de la phase (temps simulé), et elle seule', () => {
    const fish = fishAfterSteps(0, 0);
    const phaseA = { ...fish, phase: 0.5, pphase: 0.5 };
    const phaseB = { ...fish, phase: 2.5, pphase: 2.5 };
    layer.update([phaseA], 1);
    const a = layer.tailMatrixAt(0, new Matrix4());
    layer.update([phaseB], 1);
    const b = layer.tailMatrixAt(0, new Matrix4());
    layer.update([phaseA], 1);
    const again = layer.tailMatrixAt(0, new Matrix4());
    expect(b.equals(a)).toBe(false);
    expect(again.equals(a)).toBe(true);
  });

  it('aucune allocation par image : mêmes tampons d’instances, mêmes matrices à entrée égale', () => {
    const entities = [fishAfterSteps(0, 10), fishAfterSteps(1, 10)];
    layer.update(entities, 0.5);
    const bodyArray = layer.object.children.map(
      (c) => (c as unknown as { instanceMatrix: { array: Float32Array } }).instanceMatrix.array,
    );
    const first = layer.tailMatrixAt(1, new Matrix4());
    for (let i = 0; i < 100; i++) {
      layer.update(entities, i / 100);
    }
    layer.update(entities, 0.5);
    const after = layer.object.children.map(
      (c) => (c as unknown as { instanceMatrix: { array: Float32Array } }).instanceMatrix.array,
    );
    expect(after).toHaveLength(2);
    after.forEach((array, i) => expect(array).toBe(bodyArray[i]));
    expect(layer.tailMatrixAt(1, new Matrix4()).equals(first)).toBe(true);
  });

  it('ne dépasse pas sa capacité et ignore les autres espèces', () => {
    const many = Array.from({ length: 10 }, (_, i) => fishAfterSteps(i, 0));
    layer.update(many, 0);
    expect(layer.count).toBe(4);
    layer.update([{ ...many[0], species: 'autre' as Fish['species'] }], 0);
    expect(layer.count).toBe(0);
    layer.update([], 0);
    expect(layer.count).toBe(0);
  });

  it('dispose retire la couche de la scène', () => {
    const own = new FishLayer(NEON, 1);
    const scene = new Object3D();
    scene.add(own.object);
    own.dispose();
    expect(scene.children).toEqual([]);
  });
});

describe('FishLayer : lisibilité du battement de queue (capture top)', () => {
  /**
   * Taille d'un pixel de scène dans le plan du fond, vue `top` du contrat de capture
   * (1280 × 720) : le plan le plus éloigné de la caméra, donc le pire cas.
   */
  const aspect = 1280 / 720;
  const distance = framingDistance(DEFAULT_TANK, CAMERA_FOV_DEG, aspect) + DEFAULT_TANK.height / 2;
  const scenePixel =
    (2 * distance * Math.tan((CAMERA_FOV_DEG * Math.PI) / 360)) / (720 / PIXEL_SIZE);

  const tailGeometry = createFishGeometry(NEON, 'tail');
  tailGeometry.computeBoundingBox();
  const tailTip = new Vector3((tailGeometry.boundingBox as Box3).min.x, 0, 0);
  tailGeometry.dispose();

  let layer: FishLayer;
  const m = new Matrix4();

  beforeEach(() => (layer = new FishLayer(NEON, 32)));
  afterEach(() => layer.dispose());

  /** Poisson au centre, cap 0 (nage vers +X), à plat. */
  function still(phase: number, speed: number): Fish {
    return {
      ...fishAfterSteps(0, 0),
      x: 0,
      px: 0,
      y: 0.2,
      py: 0.2,
      z: 0,
      pz: 0,
      yaw: 0,
      pyaw: 0,
      pitch: 0,
      ppitch: 0,
      phase,
      pphase: phase,
      speed,
    };
  }

  /** Décalage latéral (selon Z, vu de dessus) du bout de la queue de l'instance `index`. */
  function tipOffset(index: number): number {
    return tailTip.clone().applyMatrix4(layer.tailMatrixAt(index, m)).z;
  }

  function peakToPeak(speed: number): number {
    // Battement maximal de la queue d'un côté, puis de l'autre.
    layer.update([still(Math.PI / 2 + TAIL_LAG, speed), still(-Math.PI / 2 + TAIL_LAG, speed)], 1);
    return Math.abs(tipOffset(0) - tipOffset(1));
  }

  it('le pixel de scène de référence est plausible (quelques millimètres)', () => {
    expect(scenePixel).toBeGreaterThan(0.004);
    expect(scenePixel).toBeLessThan(0.012);
  });

  it('bout de queue : ≥ 2 pixels de scène d’un extrême à l’autre à la vitesse de croisière', () => {
    expect(peakToPeak(NEON.cruiseSpeed)).toBeGreaterThanOrEqual(2 * scenePixel);
  });

  it('bout de queue : ≥ 1 pixel de scène même à la vitesse minimale', () => {
    expect(peakToPeak(NEON.minSpeed)).toBeGreaterThanOrEqual(scenePixel);
  });

  it('battement plus ample à vitesse maximale qu’à vitesse minimale', () => {
    expect(peakToPeak(NEON.maxSpeed)).toBeGreaterThan(peakToPeak(NEON.minSpeed));
  });

  it('à pose égale, la queue est décalée selon l’individu (déphasage tiré à la graine)', () => {
    // Néons du monde par défaut (la couche testée est celle du néon).
    const neons = createDefaultWorld(42).entities.filter((f) => f.species === 'neon');
    const aligned = neons.map((f) => ({ ...still(f.phase, f.speed), id: f.id }));
    layer.update(aligned, 1);
    const offsets = aligned.map((_, i) => tipOffset(i));
    expect(new Set(offsets.map((o) => o.toFixed(6))).size).toBe(offsets.length);
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThanOrEqual(scenePixel);
  });
});

describe('FishLayer : apparences (guppy mâle et femelle)', () => {
  const world = createDefaultWorld(42);
  const layers: FishLayer[] = [];
  afterEach(() => layers.splice(0).forEach((l) => l.dispose()));

  function layerOf(species = NEON, variantIndex = 0): FishLayer {
    const layer = new FishLayer(species, 64, variantIndex);
    layers.push(layer);
    return layer;
  }

  it('chaque couche ne place que les individus de son espèce et de son apparence', () => {
    const neon = layerOf(NEON);
    const male = layerOf(GUPPY, 0);
    const female = layerOf(GUPPY, 1);
    for (const layer of [neon, male, female]) {
      layer.update(world.entities, 1);
    }
    const guppies = world.entities.filter((e) => e.species === 'guppy');
    const males = guppies.filter((e) => speciesVariantIndex(GUPPY, e.id) === 0);
    expect(neon.count).toBe(NEON.defaultPopulation);
    expect(male.count).toBe(males.length);
    expect(female.count).toBe(guppies.length - males.length);
    expect(male.count).toBeGreaterThan(0);
    expect(female.count).toBeGreaterThan(0);
  });

  it('robes des koïs (#88) : réparties selon la graine du monde passée à update', () => {
    const pond = createDefaultWorld(42, 'bassin');
    const robes = [0, 1, 2].map((i) => layerOf(KOI, i));
    for (const layer of robes) {
      layer.update(pond.entities, 1, pond.seed);
    }
    const expected = [0, 1, 2].map(
      (i) => pond.entities.filter((e) => speciesVariantIndex(KOI, e.id, pond.seed) === i).length,
    );
    expect(robes.map((l) => l.count)).toEqual(expected);
    expect(expected.every((n) => n > 0)).toBe(true);
    expect(expected.reduce((a, b) => a + b, 0)).toBe(KOI.defaultPopulation);
    expect(robes.map((l) => l.object.name)).toEqual([
      'poissons-koi-kohaku',
      'poissons-koi-orenji',
      'poissons-koi-sanke',
    ]);
  });

  it('noms : historique pour une apparence unique, suffixé sinon', () => {
    expect(layerOf(NEON).object.name).toBe('poissons-neon');
    expect(layerOf(GUPPY, 0).object.name).toBe('poissons-guppy-male');
    expect(layerOf(GUPPY, 1).object.name).toBe('poissons-guppy-femelle');
    expect(layerOf(GUPPY, 1).variant.id).toBe('femelle');
  });

  it.each([-1, 1.5, 2])('refuse l’apparence %s', (index) => {
    expect(() => new FishLayer(GUPPY, 8, index)).toThrow(RangeError);
  });

  it('la queue du mâle s’accroche à l’arrière de son corps réduit', () => {
    const male = layerOf(GUPPY, 0);
    const fish = world.entities.find(
      (e) => e.species === 'guppy' && speciesVariantIndex(GUPPY, e.id) === 0,
    ) as Fish;
    const flat = { ...fish, yaw: 0, pyaw: 0, pitch: 0, ppitch: 0, speed: 0 };
    male.update([flat], 1);
    const body = new Vector3().setFromMatrixPosition(male.bodyMatrixAt(0, new Matrix4()));
    const hinge = new Vector3().setFromMatrixPosition(male.tailMatrixAt(0, new Matrix4()));
    const scale = (GUPPY.variants ?? [])[0].scale;
    expect(body.distanceTo(hinge)).toBeCloseTo((GUPPY.bodyLength * scale) / 2, 6);
  });

  it('luminosité : facteur sur la couleur du matériau, exactement blanc à 1 ; valeurs invalides ignorées', () => {
    const layer = new FishLayer(NEON, 4);
    const material = (layer.object.children[0] as Mesh).material as MeshBasicMaterial;
    expect(layer.brightness).toBe(1);
    expect(material.color.getHex()).toBe(0xffffff);
    layer.setBrightness(0.6);
    expect(layer.brightness).toBe(0.6);
    layer.setBrightness(Number.NaN);
    layer.setBrightness(-1);
    expect(layer.brightness).toBe(0.6);
    layer.setBrightness(1);
    expect(material.color.getHex()).toBe(0xffffff);
    layer.dispose();
  });
});

describe('FishLayer : couleurs ternies par la santé (#208)', () => {
  it('ternissement par instance : 0 à santé pleine, 1 au plancher, dans l’ordre des instances', () => {
    const layer = new FishLayer(NEON, 4);
    const healthy = fishAfterSteps(0, 1);
    const sick: Fish = { ...fishAfterSteps(1, 1), health: HEALTH_FLOOR };
    const half: Fish = { ...fishAfterSteps(2, 1), health: (1 + HEALTH_FLOOR) / 2 };
    layer.update([healthy, sick, half], 1);
    expect(layer.dullnessAt(0)).toBe(0);
    expect(layer.dullnessAt(1)).toBe(1);
    expect(layer.dullnessAt(2)).toBeCloseTo(0.5, 6);
    layer.update([sick, healthy], 1);
    expect(layer.dullnessAt(0)).toBe(1);
    expect(layer.dullnessAt(1)).toBe(0);
    layer.dispose();
  });

  it('corps et queue partagent l’attribut de ternissement', () => {
    const layer = new FishLayer(NEON, 4);
    const [body, tail] = layer.object.children as Mesh[];
    expect(body.geometry.getAttribute(DULL_ATTRIBUTE)).toBe(
      tail.geometry.getAttribute(DULL_ATTRIBUTE),
    );
    expect(body.geometry.getAttribute(DULL_ATTRIBUTE).count).toBe(4);
    layer.dispose();
  });

  it('le matériau ajoute le ternissement à la compilation, après le calcul de vColor', () => {
    const layer = new FishLayer(NEON, 4);
    const material = (layer.object.children[0] as Mesh).material as MeshBasicMaterial;
    const shader = {
      vertexShader: ShaderLib.basic.vertexShader,
    } as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, null as unknown as WebGLRenderer);
    expect(shader.vertexShader).toBe(
      withDullness(withIchSpots(withVelvet(withFinRot(ShaderLib.basic.vertexShader)))),
    );
    expect(shader.vertexShader).toContain(`attribute float ${DULL_ATTRIBUTE};`);
    const color = shader.vertexShader.indexOf('#include <color_vertex>');
    expect(shader.vertexShader.indexOf('vColor.xyz = mix(', color)).toBeGreaterThan(color);
    expect(shader.vertexShader).toContain(DULL_DESATURATION.toFixed(4));
    expect(shader.vertexShader).toContain(DULL_DARKENING.toFixed(4));
    layer.dispose();
  });

  it('withDullness refuse un shader sans point d’insertion', () => {
    expect(() => withDullness('void main() {}')).toThrow(/color_vertex/);
  });
});

describe('FishLayer : points blancs (#366)', () => {
  it('intensité : 0 sain, en incubation ou invalide ; du minimum à 1 pendant le stade visible', () => {
    for (const ich of [undefined, 0, ICH_VISIBLE_AT - 1, Number.NaN, -5, ICH_AGGRAVATED_AT + 1]) {
      expect(ichSpots(ich), `ich = ${ich}`).toBe(0);
    }
    expect(ichSpots(ICH_VISIBLE_AT)).toBe(ICH_SPOT_MIN);
    expect(ichSpots(ICH_AGGRAVATED_AT)).toBe(1);
    const mid = ichSpots((ICH_VISIBLE_AT + ICH_AGGRAVATED_AT) / 2);
    expect(mid).toBeCloseTo((1 + ICH_SPOT_MIN) / 2, 9);
  });

  it('intensité par instance, dans l’ordre des instances ; 0 pour un poisson sain', () => {
    const layer = new FishLayer(NEON, 4);
    const healthy = fishAfterSteps(0, 1);
    const sick: Fish = { ...fishAfterSteps(1, 1), ich: ICH_AGGRAVATED_AT };
    layer.update([healthy, sick], 1);
    expect(layer.ichSpotsAt(0)).toBe(0);
    expect(layer.ichSpotsAt(1)).toBe(1);
    layer.update([sick, healthy], 1);
    expect(layer.ichSpotsAt(0)).toBe(1);
    expect(layer.ichSpotsAt(1)).toBe(0);
    layer.dispose();
  });

  it('corps et queue partagent l’attribut d’instance et portent le rang de taché des voxels', () => {
    const layer = new FishLayer(NEON, 4);
    const [body, tail] = layer.object.children as Mesh[];
    expect(body.geometry.getAttribute(ICH_ATTRIBUTE)).toBe(
      tail.geometry.getAttribute(ICH_ATTRIBUTE),
    );
    for (const mesh of [body, tail]) {
      const spots = mesh.geometry.getAttribute(SPOT_ATTRIBUTE);
      expect(spots.count).toBe(mesh.geometry.getAttribute('position').count);
    }
    layer.dispose();
  });

  it('shader : points après le ternissement, couleur de la palette, part des voxels', () => {
    const shader = withDullness(withIchSpots(ShaderLib.basic.vertexShader));
    expect(shader).toContain(`attribute float ${ICH_ATTRIBUTE};`);
    expect(shader).toContain(`attribute float ${SPOT_ATTRIBUTE};`);
    const dull = shader.indexOf('vColor.xyz = mix(');
    const spots = shader.indexOf(`if ( ${SPOT_ATTRIBUTE} <`);
    expect(dull).toBeGreaterThan(0);
    expect(spots).toBeGreaterThan(dull);
    expect(shader).toContain(ICH_SPOT_SHARE.toFixed(4));
    expect(() => withIchSpots('void main() {}')).toThrow(/color_vertex/);
  });

  it('un voxel trop pâle n’est jamais taché, même à intensité maximale (#386)', () => {
    // Rang `UNSPOTTED_RANK` contre le seuil `1 × ICH_SPOT_SHARE` : strictement au-dessus.
    expect(ICH_SPOT_SHARE).toBeGreaterThan(0);
    expect(ICH_SPOT_SHARE).toBeLessThan(UNSPOTTED_RANK);
  });
});

describe('FishLayer : pourriture des nageoires (#485)', () => {
  it('intensité : 0 sain, au début ou invalide ; du minimum à 1 ensuite', () => {
    for (const finRot of [undefined, 0, FIN_ROT_VISIBLE_AT - 1, Number.NaN, -5, FIN_ROT_MAX + 1]) {
      expect(finRotFray(finRot), `finRot = ${finRot}`).toBe(0);
    }
    expect(finRotFray(FIN_ROT_VISIBLE_AT)).toBe(FIN_ROT_MIN);
    expect(finRotFray(FIN_ROT_MAX)).toBe(1);
  });

  it('intensité par instance, partagée par le corps et la queue', () => {
    const layer = new FishLayer(NEON, 4);
    const healthy = fishAfterSteps(0, 1);
    const sick: Fish = { ...fishAfterSteps(1, 1), finRot: FIN_ROT_MAX };
    layer.update([healthy, sick], 1);
    expect(layer.finRotFrayAt(0)).toBe(0);
    expect(layer.finRotFrayAt(1)).toBe(1);
    const [body, tail] = layer.object.children as Mesh[];
    expect(body.geometry.getAttribute(FIN_ROT_ATTRIBUTE)).toBe(
      tail.geometry.getAttribute(FIN_ROT_ATTRIBUTE),
    );
    layer.dispose();
  });

  it('rangs d’effilochage : la caudale s’effiloche, le corps hors nageoires jamais', () => {
    const tail = createFishGeometry(NEON, 'tail').getAttribute(FRAY_ATTRIBUTE);
    const body = createFishGeometry(NEON, 'body').getAttribute(FRAY_ATTRIBUTE);
    const tailRanks = Array.from({ length: tail.count }, (_, i) => tail.getX(i));
    const bodyRanks = Array.from({ length: body.count }, (_, i) => body.getX(i));
    // Une part de la caudale disparaît au maximum, pas toute.
    expect(tailRanks.some((r) => r < FIN_ROT_LOSS_SHARE)).toBe(true);
    expect(tailRanks.some((r) => r >= FIN_ROT_LOSS_SHARE)).toBe(true);
    // Le néon n'a pas de voxel `f` dans le corps : aucun voxel du corps ne disparaît.
    expect(bodyRanks.every((r) => r === UNFRAYED_RANK)).toBe(true);
    // Un voxel jamais effiloché reste hors du seuil du liseré, même au maximum.
    expect(FIN_ROT_LOSS_SHARE + FIN_ROT_EDGE).toBeLessThan(UNFRAYED_RANK);
  });

  it('au maximum, le liseré touche aussi le bord des nageoires du corps (#509)', () => {
    // Corydora : voxels de nageoire (`f`) au bord du profil du corps.
    const body = createFishGeometry(CORYDORA, 'body').getAttribute(FRAY_ATTRIBUTE);
    const ranks = Array.from({ length: body.count }, (_, i) => body.getX(i));
    const edge = FIN_ROT_LOSS_SHARE + FIN_ROT_EDGE;
    expect(ranks.some((r) => r < edge)).toBe(true);
    // Le corps n'est jamais troué : la plupart des voxels du corps restent hors du seuil.
    expect(ranks.filter((r) => r < FIN_ROT_LOSS_SHARE).length).toBeLessThan(ranks.length / 10);
  });

  it('shader : voxels perdus et liseré gardés par une intensité non nulle, couleur de la palette', () => {
    const shader = withFinRot(ShaderLib.basic.vertexShader);
    expect(shader).toContain(`attribute float ${FIN_ROT_ATTRIBUTE};`);
    expect(shader).toContain(`attribute float ${FRAY_ATTRIBUTE};`);
    const begin = shader.indexOf('#include <begin_vertex>');
    expect(shader.indexOf('transformed = vec3( 0.0 )', begin)).toBeGreaterThan(begin);
    expect(shader.match(new RegExp(`${FIN_ROT_ATTRIBUTE} > 0\\.0`, 'g'))?.length).toBe(2);
    expect(shader).toContain(FIN_ROT_LOSS_SHARE.toFixed(4));
    expect(FIN_ROT_EDGE_COLOR).toBe(PALETTE.sableClair);
    expect(() => withFinRot('#include <color_vertex>')).toThrow(/begin_vertex/);
    expect(() => withFinRot('#include <begin_vertex>')).toThrow(/color_vertex/);
  });
});

describe('FishLayer : velours (#532)', () => {
  it('intensité : 0 sain, en incubation ou invalide ; du minimum à 1 ensuite', () => {
    for (const velvet of [undefined, 0, VELVET_VISIBLE_AT - 1, Number.NaN, -5, VELVET_MAX + 1]) {
      expect(velvetVeil(velvet), `velvet = ${velvet}`).toBe(0);
    }
    expect(velvetVeil(VELVET_VISIBLE_AT)).toBe(VELVET_MIN);
    expect(velvetVeil(VELVET_MAX)).toBe(1);
  });

  it('intensité par instance, partagée par le corps et la queue', () => {
    const layer = new FishLayer(NEON, 4);
    const healthy = fishAfterSteps(0, 1);
    const sick: Fish = { ...fishAfterSteps(1, 1), velvet: VELVET_MAX };
    layer.update([healthy, sick], 1);
    expect(layer.velvetVeilAt(0)).toBe(0);
    expect(layer.velvetVeilAt(1)).toBe(1);
    const [body, tail] = layer.object.children as Mesh[];
    expect(body.geometry.getAttribute(VELVET_ATTRIBUTE)).toBe(
      tail.geometry.getAttribute(VELVET_ATTRIBUTE),
    );
    layer.dispose();
  });

  it('shader : voile gardé par une intensité non nulle, rang de taché déclaré une seule fois', () => {
    const shader = withVelvet(ShaderLib.basic.vertexShader);
    expect(shader).toContain(`attribute float ${VELVET_ATTRIBUTE};`);
    expect(shader.match(new RegExp(`${VELVET_ATTRIBUTE} > 0\\.0`, 'g'))?.length).toBe(1);
    expect(shader).toContain(VELVET_VEIL.toFixed(4));
    expect(shader).toContain(VELVET_DUST_SHARE.toFixed(4));
    const both = withIchSpots(withVelvet(ShaderLib.basic.vertexShader));
    expect(both.match(new RegExp(`attribute float ${SPOT_ATTRIBUTE};`, 'g'))?.length).toBe(1);
    expect(() => withVelvet('void main() {}')).toThrow(/color_vertex/);
  });

  it('poussière dorée à l’autre bout du rang que les points blancs ; couleur distincte', () => {
    expect(ICH_SPOT_SHARE).toBeLessThanOrEqual(1 - VELVET_DUST_SHARE);
    expect(VELVET_COLOR).toBe(PALETTE.koiOr);
    expect(VELVET_COLOR).not.toBe(ICH_SPOT_COLOR);
    expect(VELVET_COLOR).not.toBe(FIN_ROT_EDGE_COLOR);
  });
});
