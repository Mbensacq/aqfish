import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial } from 'three';

import { FEEDER_SPOT_X, FEEDER_SPOT_Z } from '../sim/auto-feeder';
import type { TankDimensions } from '../sim/tank';
import type { SceneLayer } from './effect-layer';
import { PALETTE } from './palette';

/**
 * Distributeur de nourriture automatique (issue #583) : un petit boîtier gris posé sur le bord
 * arrière du bac, au-dessus du point de chute des rations (`feederSpot`), à gauche. Couleurs
 * plates de la palette (roche, roche sombre, noir) : discret, il se lit comme un appareil et
 * ne détourne pas l'œil des poissons. Sans distributeur, la couche est masquée : images
 * inchangées, à l'octet près.
 */

/** Boîtier : largeur, hauteur, profondeur, en mètres. */
export const FEEDER_BODY: readonly [number, number, number] = [0.07, 0.05, 0.06];
/** Débord du couvercle sur chaque côté du boîtier, et épaisseur, en mètres. */
export const FEEDER_LID_OVERHANG = 0.004;
export const FEEDER_LID_HEIGHT = 0.012;
/** Le boîtier descend de cette hauteur sous le bord du bac (il s'y accroche), en mètres. */
export const FEEDER_DROP_BELOW_RIM = 0.02;

/** Pièce du distributeur : taille, centre relatif au bas du boîtier, couleur. */
interface FeederPart {
  readonly size: readonly [number, number, number];
  readonly center: readonly [number, number, number];
  readonly color: string;
}

/** Pièces du distributeur, centrées sur l'axe du boîtier ; +z vers l'avant du bac. */
export function feederParts(): readonly FeederPart[] {
  const [w, h, d] = FEEDER_BODY;
  const o = FEEDER_LID_OVERHANG;
  return [
    { size: [w, h, d], center: [0, h / 2, 0], color: PALETTE.roche },
    {
      size: [w + 2 * o, FEEDER_LID_HEIGHT, d + 2 * o],
      center: [0, h + FEEDER_LID_HEIGHT / 2, 0],
      color: PALETTE.rocheSombre,
    },
    // Fente de sortie, sur la face avant, côté eau.
    {
      size: [w * 0.5, h * 0.2, 0.004],
      center: [0, h * 0.22, d / 2 + 0.002],
      color: PALETTE.koiNoir,
    },
  ];
}

/** Couche du distributeur automatique : quelques boîtes créées une fois, montrées ou masquées. */
export class FeederLayer implements SceneLayer {
  readonly object = new Group();
  private readonly geometries: BoxGeometry[] = [];
  private readonly materials: MeshBasicMaterial[] = [];
  private readonly baseColors: Color[] = [];
  private brightnessFactor = 1;

  /** @param dims dimensions du bac : le boîtier s'accroche à son bord arrière. */
  constructor(dims: TankDimensions) {
    this.object.name = 'distributeur';
    const x = -dims.width / 2 + FEEDER_SPOT_X * dims.width;
    // Le boîtier chevauche la vitre arrière : sa face avant est au-dessus du point de chute.
    const z = -dims.depth / 2 + FEEDER_SPOT_Z * dims.depth - FEEDER_BODY[2] / 2 + 0.005;
    const y = dims.height - FEEDER_DROP_BELOW_RIM;
    for (const part of feederParts()) {
      const geometry = new BoxGeometry(...part.size);
      const color = new Color(part.color);
      const material = new MeshBasicMaterial({ color });
      const mesh = new Mesh(geometry, material);
      mesh.position.set(x + part.center[0], y + part.center[1], z + part.center[2]);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.object.add(mesh);
      this.geometries.push(geometry);
      this.materials.push(material);
      this.baseColors.push(color.clone());
    }
    this.object.visible = false;
  }

  /** Montre ou masque le distributeur. */
  setVisible(visible: boolean): void {
    this.object.visible = visible;
  }

  /** Vrai si le distributeur est affiché (tests). */
  get visible(): boolean {
    return this.object.visible;
  }

  /**
   * Luminosité des couleurs plates (`render/night-shade.ts`) : 1, couleurs d'origine. Une
   * valeur non finie ou négative est ignorée.
   */
  setBrightness(factor: number): void {
    if (!Number.isFinite(factor) || factor < 0 || factor === this.brightnessFactor) {
      return;
    }
    this.brightnessFactor = factor;
    this.materials.forEach((material, i) => {
      material.color.copy(this.baseColors[i]).multiplyScalar(factor);
    });
  }

  /** Luminosité appliquée (tests). */
  get brightness(): number {
    return this.brightnessFactor;
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
