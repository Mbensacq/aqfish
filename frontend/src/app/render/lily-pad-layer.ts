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
import { DECOR_RENDER_ORDER, OUTLINE_COLOR, OUTLINE_WIDTH_PX } from './decor-layer';
import { buildLilyPadHull, buildLilyPadMesh, buildLilyPadShadow } from './lily-pad-model';
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
      const shadow = new Mesh(shadowGeometry, this.shadowMaterial);
      shadow.name = `${name}-ombre`;
      shadow.position.y = SAND_THICKNESS + LILY_PAD_SHADOW_LIFT;
      shadow.renderOrder = LILY_PAD_SHADOW_RENDER_ORDER;
      this.object.add(leaf, shadow);
      this.pads.push({ pad, leaf, shadow });
    });
    this.update(0);
  }

  /** Pose les feuilles et leurs ombres au temps simulé `time` (secondes), sans allocation. */
  update(time: number): void {
    for (const { pad, leaf, shadow } of this.pads) {
      const pose = lilyPadPose(pad, time, this.pose);
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
    (this.outlineMaterial.uniforms['uResolution'].value as Vector2).set(
      Math.max(1, width),
      Math.max(1, height),
    );
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.outlineMaterial.dispose();
    this.shadowMaterial.dispose();
  }

  private clear(): void {
    this.object.clear();
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
    this.pads = [];
  }
}
