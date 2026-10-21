import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector2,
} from 'three';

import { lilyPadPose, type LilyPad, type LilyPadPose } from '../sim/lily-pads';
import { SAND_THICKNESS, WATER_LEVEL_RATIO, type TankDimensions } from '../sim/tank';
import {
  createOutlineMaterial,
  DECOR_RENDER_ORDER,
  OUTLINE_COLOR,
  OUTLINE_WIDTH_PX,
} from './decor-layer';
import {
  buildFlowerCore,
  buildLotusStalk,
  buildPetal,
  FLOWER_OFFSET_RATIO,
  LILY_FLOWER_COLORS,
  LOTUS_FLOWER_SCALE,
  LOTUS_STALK_HEIGHT,
  PETAL_RINGS,
  petalTilt,
  type PetalRing,
  type PrismData,
} from './lily-flower-model';
import {
  buildLilyPadHull,
  buildLilyPadMesh,
  buildLilyPadShadow,
  LILY_PAD_THICKNESS,
} from './lily-pad-model';
import { PALETTE } from './palette';

/**
 * Couche des nénuphars (issue #103, ADR 0029) : une feuille, sa coque de contour et son
 * ombre par élément de `lilyPadLayout`, posées à chaque image selon `lilyPadPose` au temps
 * simulé (contrat de capture).
 *
 * - Feuille et contour : comme le décor (`DECOR_RENDER_ORDER`, opacité pleine dans la file
 *   des transparents, après l'eau), donc aux couleurs exactes de la palette ; la feuille est
 *   posée juste au-dessus de la surface (`LILY_PAD_LIFT`).
 * - Ombre : disque plat sur le fond, décalé de `LILY_PAD_SHADOW_OFFSET` (à l'opposé du
 *   soleil), en couleur pleine d'eau profonde, dessinée après l'eau et avant les rides de la
 *   surface (`LILY_PAD_SHADOW_RENDER_ORDER`). Une ombre dessinée sous l'eau, comme le fond,
 *   serait ramenée par la passe palette à la même couleur que l'eau : invisible.
 * - Fleurs (issue #104) : sur les feuilles `fleur` et `lotus`, une fleur (cœur, deux
 *   couronnes de pétales, contour du décor) posée sur la feuille, du côté opposé à
 *   l'encoche ; celle d'un lotus, plus grande, au bout d'une tige. Les pétales s'inclinent
 *   selon l'ouverture (`setOpenness`, `flowerOpenness` de l'heure). Vue de dessus, une fleur
 *   grande ouverte tient dans sa feuille : elle ne cache rien que la feuille ne cache déjà.
 */

/** Hauteur du dessous de la feuille au-dessus de la surface de l'eau, en mètres. */
export const LILY_PAD_LIFT = 0.002;
/** Hauteur de l'ombre au-dessus du fond, en mètres (évite le conflit de profondeur). */
export const LILY_PAD_SHADOW_LIFT = 0.003;
/**
 * Décalage de l'ombre sur le fond, dans le repère du bac (mètres) : à l'opposé du soleil
 * (`render/aquarium-scene.ts`, en avant et un peu à droite), raccourci pour rester lisible.
 * Sa norme reste inférieure à `LILY_PAD_EDGE_MARGIN` (`sim/lily-pads.ts`) : l'ombre ne passe
 * jamais sous la margelle.
 */
export const LILY_PAD_SHADOW_OFFSET = { x: -0.009, z: -0.044 } as const;
/** Couleur de l'ombre : l'eau, plus sombre au-dessus de l'ombre. */
export const LILY_PAD_SHADOW_COLOR = PALETTE.eauProfonde;
/**
 * Ordre de rendu de l'ombre : après le volume d'eau (1), avant les rides de la surface
 * (`SURFACE_RENDER_ORDER`, 1,5), qui restent ainsi visibles par-dessus.
 */
export const LILY_PAD_SHADOW_RENDER_ORDER = 1.2;
/**
 * Ordres de rendu des fleurs (issue #104) : après les feuilles (`DECOR_RENDER_ORDER`), tous
 * les contours d'abord, sans écrire la profondeur, puis les pétales, le cœur et la tige, qui
 * recouvrent les contours intérieurs. Seule la silhouette de la fleur garde un liseré ; un
 * contour par pétale noircissait la fleur. Avant les poissons (`FISH_RENDER_ORDER`).
 */
export const FLOWER_OUTLINE_RENDER_ORDER = DECOR_RENDER_ORDER + 0.01;
export const FLOWER_RENDER_ORDER = DECOR_RENDER_ORDER + 0.02;

const OUTLINE_VERTEX = /* glsl */ `
uniform vec2 uResolution;
uniform float uWidth;
attribute vec3 offset;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float miter = length(offset);
  if (miter > 1e-6) {
    vec3 viewDir = normalize(normalMatrix * (offset / miter));
    vec2 dir = (projectionMatrix * vec4(viewDir, 0.0)).xy;
    float len = length(dir);
    if (len > 1e-6) {
      // Décalage de uWidth · miter pixels de la cible (comme createOutlineMaterial).
      clip.xy += dir / len * uWidth * miter * 2.0 / uResolution * clip.w;
    }
  }
  gl_Position = clip;
}
`;

const OUTLINE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Contour des feuilles : coque arrière gonflée d'un pixel de la cible selon les décalages de
 * `buildLilyPadHull` (onglets aux coins de l'encoche), couleur et épaisseur du décor.
 */
export function createLilyPadOutlineMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uResolution: { value: new Vector2(1, 1) },
      uWidth: { value: OUTLINE_WIDTH_PX },
      uColor: { value: new Color(OUTLINE_COLOR) },
    },
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: BackSide,
    transparent: true,
  });
}

interface Petal {
  readonly tilt: Group;
  readonly ring: PetalRing;
}

interface PlacedPad {
  readonly pad: LilyPad;
  readonly leaf: Group;
  readonly shadow: Mesh;
}

export class LilyPadLayer {
  readonly object = new Group();
  /**
   * Feuilles : rapprochées de la caméra dans le tampon de profondeur (`polygonOffset`). La
   * feuille n'a que `LILY_PAD_THICKNESS` d'épaisseur : vu en biais et de loin, le dessous de
   * la coque du contour et le dessus de la feuille tombent sur la même profondeur quantifiée,
   * et le contour noircissait la moitié lointaine de la feuille.
   */
  private readonly material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  private readonly outlineMaterial = createLilyPadOutlineMaterial();
  private readonly shadowMaterial = new MeshBasicMaterial({
    color: LILY_PAD_SHADOW_COLOR,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  private readonly shadowBase = new Color(LILY_PAD_SHADOW_COLOR);
  /** Fleurs : géométries et matériaux partagés par toutes les fleurs (couleurs pleines). */
  private readonly flowerOutlineMaterial = withoutDepthWrite(createOutlineMaterial());
  private readonly petalMaterial = flatMaterial(LILY_FLOWER_COLORS.petal);
  private readonly coreMaterial = flatMaterial(LILY_FLOWER_COLORS.core);
  private readonly stalkMaterial = flatMaterial(LILY_FLOWER_COLORS.stalk);
  private readonly flowerBases: readonly [MeshBasicMaterial, Color][] = [
    [this.petalMaterial, new Color(LILY_FLOWER_COLORS.petal)],
    [this.coreMaterial, new Color(LILY_FLOWER_COLORS.core)],
    [this.stalkMaterial, new Color(LILY_FLOWER_COLORS.stalk)],
  ];
  private readonly petalGeometries = PETAL_RINGS.map((ring) => toGeometry(buildPetal(ring)));
  private readonly coreGeometry = toGeometry(buildFlowerCore());
  private readonly stalkGeometry = toGeometry(buildLotusStalk());
  private petals: Petal[] = [];
  private flowers = 0;
  private openness = 1;
  private readonly surfaceY: number;
  private geometries: BufferGeometry[] = [];
  private pads: PlacedPad[] = [];
  private readonly pose: LilyPadPose = { x: 0, z: 0, rotation: 0 };

  constructor(dims: TankDimensions) {
    this.object.name = 'nenuphars';
    this.surfaceY = Math.max(dims.height * WATER_LEVEL_RATIO, SAND_THICKNESS);
  }

  /** Remplace les feuilles affichées (`lilyPadLayout`), posées à t = 0. */
  setPads(pads: readonly LilyPad[]): void {
    this.clear();
    pads.forEach((pad, n) => {
      const mesh = buildLilyPadMesh(pad.radius, pad.notch);
      const leafGeometry = new BufferGeometry();
      leafGeometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
      leafGeometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
      leafGeometry.setAttribute('color', new BufferAttribute(mesh.colors, 3));
      const hull = buildLilyPadHull(pad.radius, pad.notch);
      const hullGeometry = new BufferGeometry();
      hullGeometry.setAttribute('position', new BufferAttribute(hull.positions, 3));
      hullGeometry.setAttribute('offset', new BufferAttribute(hull.offsets, 3));
      const shadowGeometry = new BufferGeometry();
      shadowGeometry.setAttribute(
        'position',
        new BufferAttribute(buildLilyPadShadow(pad.radius, pad.notch), 3),
      );
      for (const g of [leafGeometry, hullGeometry, shadowGeometry]) {
        g.computeBoundingSphere();
      }
      this.geometries.push(leafGeometry, hullGeometry, shadowGeometry);

      const name = `nenuphar-${n}`;
      const leaf = new Group();
      leaf.name = name;
      leaf.position.y = this.surfaceY + LILY_PAD_LIFT;
      const outline = new Mesh(hullGeometry, this.outlineMaterial);
      outline.name = `${name}-contour`;
      const body = new Mesh(leafGeometry, this.material);
      body.name = `${name}-feuille`;
      for (const m of [outline, body]) {
        m.renderOrder = DECOR_RENDER_ORDER;
        leaf.add(m);
      }
      if (pad.kind !== 'feuille') {
        leaf.add(this.buildFlower(pad, name));
      }
      const shadow = new Mesh(shadowGeometry, this.shadowMaterial);
      shadow.name = `${name}-ombre`;
      shadow.position.y = SAND_THICKNESS + LILY_PAD_SHADOW_LIFT;
      shadow.renderOrder = LILY_PAD_SHADOW_RENDER_ORDER;
      this.object.add(leaf, shadow);
      this.pads.push({ pad, leaf, shadow });
    });
    this.update(0);
    this.setOpenness(this.openness);
  }

  /**
   * Ouvre les fleurs : 0 fermées (boutons), 1 grandes ouvertes (`flowerOpenness` de l'heure,
   * `sim/lily-pads.ts`). Conservée par `setPads`. Sans allocation.
   * @throws RangeError si `openness` n'est pas dans [0, 1].
   */
  setOpenness(openness: number): void {
    const tilts = PETAL_RINGS.map((ring) => petalTilt(ring, openness));
    this.openness = openness;
    for (const { tilt, ring } of this.petals) {
      // Rotation autour de Z négative : le pétale (le long de +Y) penche vers l'extérieur (+X).
      tilt.rotation.z = -tilts[PETAL_RINGS.indexOf(ring)];
    }
  }

  /** Ouverture courante des fleurs (tests). */
  get flowerOpenness(): number {
    return this.openness;
  }

  /** Nombre de fleurs affichées (nénuphars fleuris et lotus). */
  get flowerCount(): number {
    return this.flowers;
  }

  /** Fleur de la feuille `pad`, dans le repère de la feuille. */
  private buildFlower(pad: LilyPad, name: string): Group {
    const lotus = pad.kind === 'lotus';
    const root = new Group();
    root.name = `${name}-fleur`;
    root.position.set(-FLOWER_OFFSET_RATIO * pad.radius, LILY_PAD_THICKNESS, 0);
    if (lotus) {
      this.addOutlined(root, this.stalkGeometry, this.stalkMaterial, `${name}-tige`);
    }
    const flower = new Group();
    flower.position.y = lotus ? LOTUS_STALK_HEIGHT : 0;
    flower.rotation.y = pad.flowerTwist;
    flower.scale.setScalar(lotus ? LOTUS_FLOWER_SCALE : 1);
    this.addOutlined(flower, this.coreGeometry, this.coreMaterial, `${name}-coeur`);
    PETAL_RINGS.forEach((ring, r) => {
      for (let i = 0; i < ring.count; i++) {
        const pivot = new Group();
        pivot.rotation.y = ring.phase + (2 * Math.PI * i) / ring.count;
        const tilt = new Group();
        tilt.position.x = ring.baseRadius;
        this.addOutlined(tilt, this.petalGeometries[r], this.petalMaterial, `${name}-petale`);
        pivot.add(tilt);
        flower.add(pivot);
        this.petals.push({ tilt, ring });
      }
    });
    root.add(flower);
    this.flowers++;
    return root;
  }

  /** Ajoute à `parent` le contour puis le maillage de `geometry` (ordres des fleurs). */
  private addOutlined(
    parent: Group,
    geometry: BufferGeometry,
    material: MeshBasicMaterial,
    name: string,
  ): void {
    const outline = new Mesh(geometry, this.flowerOutlineMaterial);
    outline.name = `${name}-contour`;
    outline.renderOrder = FLOWER_OUTLINE_RENDER_ORDER;
    const body = new Mesh(geometry, material);
    body.name = name;
    body.renderOrder = FLOWER_RENDER_ORDER;
    parent.add(outline, body);
  }

  /**
   * Pose les feuilles et leurs ombres au temps simulé `time` (secondes), sans allocation.
   * `shiver` : frémissement sous la pluie, de 0 (aucun) à 1 (`lilyPadPose`, issue #106).
   */
  update(time: number, shiver = 0): void {
    for (const { pad, leaf, shadow } of this.pads) {
      const pose = lilyPadPose(pad, time, this.pose, shiver);
      leaf.position.x = pose.x;
      leaf.position.z = pose.z;
      leaf.rotation.y = pose.rotation;
      shadow.position.x = pose.x + LILY_PAD_SHADOW_OFFSET.x;
      shadow.position.z = pose.z + LILY_PAD_SHADOW_OFFSET.z;
      shadow.rotation.y = pose.rotation;
    }
  }

  /**
   * Teinte (facteur linéaire par canal, comme `DecorLayer.setTint`) : multiplie les couleurs
   * des feuilles et de l'ombre. Blanc en plein jour : couleurs d'origine.
   */
  setTint(tint: readonly [number, number, number]): void {
    this.material.color.setRGB(tint[0], tint[1], tint[2]);
    this.shadowMaterial.color.copy(this.shadowBase);
    this.shadowMaterial.color.r *= tint[0];
    this.shadowMaterial.color.g *= tint[1];
    this.shadowMaterial.color.b *= tint[2];
    for (const [material, base] of this.flowerBases) {
      material.color.setRGB(base.r * tint[0], base.g * tint[1], base.b * tint[2]);
    }
  }

  /** Teinte courante des pétales (couleur affichée avant la passe palette, tests). */
  get petalColor(): Color {
    return this.petalMaterial.color;
  }

  /** Teinte courante des feuilles (tests). */
  get tint(): readonly [number, number, number] {
    const c = this.material.color;
    return [c.r, c.g, c.b];
  }

  /** Nombre de feuilles affichées. */
  get count(): number {
    return this.pads.length;
  }

  /** Résolution de la surface de rendu, en pixels (épaisseur constante du contour). */
  setResolution(width: number, height: number): void {
    for (const material of [this.outlineMaterial, this.flowerOutlineMaterial]) {
      (material.uniforms['uResolution'].value as Vector2).set(
        Math.max(1, width),
        Math.max(1, height),
      );
    }
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.outlineMaterial.dispose();
    this.shadowMaterial.dispose();
    this.flowerOutlineMaterial.dispose();
    for (const [material] of this.flowerBases) {
      material.dispose();
    }
    for (const g of [...this.petalGeometries, this.coreGeometry, this.stalkGeometry]) {
      g.dispose();
    }
  }

  private clear(): void {
    this.object.clear();
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
    this.pads = [];
    this.petals = [];
    this.flowers = 0;
  }
}

/** `material`, sans écriture dans le tampon de profondeur. */
function withoutDepthWrite<T extends ShaderMaterial>(material: T): T {
  material.depthWrite = false;
  return material;
}

/** Matériau plat du décor (opacité pleine, file des transparents) de couleur `color`. */
function flatMaterial(color: string): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity: 1 });
}

/** Géométrie indexée d'un prisme, normales lissées (coque du contour d'un pixel). */
function toGeometry(prism: PrismData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(prism.positions, 3));
  geometry.setIndex(new BufferAttribute(prism.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
