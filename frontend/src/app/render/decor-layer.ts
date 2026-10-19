import {
  BackSide,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector2,
} from 'three';

import { rockBaseY, rockModel, type DecorItem } from '../sim/decor';
import { FISH_RENDER_ORDER } from './fish-layer';
import { PALETTE } from './palette';
import { buildRockMesh, createOutlineGeometry, createRockGeometry } from './rock-model';

/**
 * Couleur du contour du décor (docs/DA.md, règle 4) : la couleur la plus sombre de la
 * palette après le fond de la scène.
 */
export const OUTLINE_COLOR = PALETTE.koiNoir;

/** Épaisseur du contour, en pixels de la cible de rendu (un pixel de scène en pixel art). */
export const OUTLINE_WIDTH_PX = 1;

/**
 * Ordre de rendu du décor : dans la file des transparents (opacité pleine), après l'eau et
 * le verre, juste avant les poissons. Comme les poissons (ADR 0009), les rochers gardent
 * ainsi les couleurs exactes de la palette, sans teinte d'eau.
 */
export const DECOR_RENDER_ORDER = FISH_RENDER_ORDER - 0.1;

const OUTLINE_VERTEX = /* glsl */ `
uniform vec2 uResolution;
uniform float uWidth;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec3 viewNormal = normalize(normalMatrix * normal);
  vec2 dir = (projectionMatrix * vec4(viewNormal, 0.0)).xy;
  float len = length(dir);
  if (len > 1e-6) {
    // Décalage constant en pixels de la cible : 2 / résolution par pixel en coordonnées
    // normalisées, multiplié par w pour annuler la division perspective.
    clip.xy += dir / len * uWidth * 2.0 / uResolution * clip.w;
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
 * Coque de contour (« inverted hull ») : faces arrière du modèle, gonflées d'un pixel de la
 * cible le long des normales lissées projetées à l'écran. Seul le liseré qui dépasse de la
 * silhouette reste visible, d'un pixel quel que soit le zoom ; l'eau, qui n'a pas de coque,
 * n'a jamais de contour.
 */
export function createOutlineMaterial(): ShaderMaterial {
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

/**
 * Couche du décor : un maillage voxel et une coque de contour par élément de `World.decor`,
 * placés selon ses données (même transformation que `decorToTank` côté simulation).
 */
export class DecorLayer {
  readonly object = new Group();
  private readonly material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
  });
  private readonly outlineMaterial = createOutlineMaterial();
  private geometries: BufferGeometry[] = [];

  constructor() {
    this.object.name = 'decor';
  }

  /** Remplace le décor affiché. */
  setDecor(items: readonly DecorItem[]): void {
    this.clear();
    items.forEach((item, n) => {
      const model = rockModel(item.seed, item.scale);
      const data = buildRockMesh(model, item.seed);
      const geometry = createRockGeometry(data);
      const outline = createOutlineGeometry(data);
      this.geometries.push(geometry, outline);
      const group = new Group();
      group.name = `rocher-${n}`;
      group.position.set(item.x, rockBaseY(model.voxelSize), item.z);
      group.rotation.y = item.rotation;
      const mesh = new Mesh(geometry, this.material);
      mesh.name = `rocher-${n}-voxels`;
      const hull = new Mesh(outline, this.outlineMaterial);
      hull.name = `rocher-${n}-contour`;
      for (const m of [hull, mesh]) {
        m.renderOrder = DECOR_RENDER_ORDER;
        group.add(m);
      }
      this.object.add(group);
    });
  }

  /** Nombre d'éléments affichés. */
  get count(): number {
    return this.object.children.length;
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
  }

  private clear(): void {
    this.object.clear();
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
  }
}
