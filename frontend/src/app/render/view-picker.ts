import { Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three';

import { environmentDataWater } from '../sim/environment';
import type { Room } from '../sim/room';
import { terrainAt } from '../sim/terrain';
import type { Vec3 } from './camera-presets';
import { planePoint, sandHit, type DecorPick } from './decor-pick';
import { toNormalizedDevice, waterSurfacePoint } from './food-pick';
import { pickRoom } from './room-pick';
import type { ViewLayers } from './view-layers';

/** Rayon de la caméra dans le repère du bac (`pickRay`). */
export interface PickedRay {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

/**
 * Lancers de rayon de la vue sous un point de l'écran (pixels CSS, #698) : surface de l'eau,
 * décor, sable et pièce, plan horizontal, rayon brut. `null` hors du canvas.
 */
export class ViewPicker {
  /** Lancer de rayon de `pickDecor` et `planeAt`, réutilisé. */
  private readonly raycaster = new Raycaster();
  /** Point visé en coordonnées normalisées, réutilisé par chaque lancer de rayon (#178). */
  private readonly pointerNdc = new Vector2();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: PerspectiveCamera,
    private readonly layers: ViewLayers,
    private readonly room: () => Room,
  ) {}

  /** Point (x, z) de la surface de l'eau visé ; `null` hors du bac ou sur la terre émergée. */
  pickWaterSurface(clientX: number, clientY: number): { x: number; z: number } | null {
    const ndc = toNormalizedDevice(clientX, clientY, this.canvas.getBoundingClientRect());
    if (!ndc) {
      return null;
    }
    const origin = this.camera.position;
    const direction = new Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera).sub(origin);
    const { environment: env, dimensions } = this.layers.world;
    const water = environmentDataWater(env);
    const point = waterSurfacePoint(
      [origin.x, origin.y, origin.z],
      [direction.x, direction.y, direction.z],
      dimensions,
      water,
    );
    if (point && env.terrain && !terrainAt(point.x, point.z, env.terrain, water).submerged) {
      return null;
    }
    return point;
  }

  /** Élément du décor, élément ou parquet de la pièce, sinon point du sable visé (#167, #188). */
  pickDecor(clientX: number, clientY: number): DecorPick {
    if (!this.castFrom(clientX, clientY)) {
      return null;
    }
    const index = this.layers.decor.pickItem(this.raycaster);
    if (index !== null) {
      return { kind: 'item', index };
    }
    const { origin: o, direction: d } = this.raycaster.ray;
    const origin: Vec3 = [o.x, o.y, o.z];
    const direction: Vec3 = [d.x, d.y, d.z];
    const dimensions = this.layers.world.dimensions;
    const point = sandHit(origin, direction, dimensions);
    // Pièce (#188) : élément ou parquet visé, sauf derrière le sable du bac.
    const room = this.layers.room.built
      ? pickRoom(origin, direction, dimensions, this.room())
      : null;
    if (room && room.distance < (point?.distance ?? Infinity)) {
      return room.kind === 'floor'
        ? { kind: 'floor', x: room.x, z: room.z }
        : { kind: 'room-item', index: room.index, x: room.x, z: room.z };
    }
    return point ? { kind: 'sand', x: point.x, z: point.z } : null;
  }

  /**
   * Point du plan horizontal Y = `y` (non borné) sous le point de l'écran, `null` hors du
   * canvas : plan du sable pour le décor, de la base de l'élément pour la pièce.
   */
  planeAt(clientX: number, clientY: number, y: number): { x: number; z: number } | null {
    if (!this.castFrom(clientX, clientY)) {
      return null;
    }
    const { origin, direction } = this.raycaster.ray;
    const o: Vec3 = [origin.x, origin.y, origin.z];
    const d: Vec3 = [direction.x, direction.y, direction.z];
    return planePoint(o, d, y);
  }

  /** Origine et direction du rayon de la caméra sous le point de l'écran (raclette, #476). */
  pickRay(clientX: number, clientY: number): PickedRay | null {
    const ndc = toNormalizedDevice(clientX, clientY, this.canvas.getBoundingClientRect());
    if (!ndc) {
      return null;
    }
    const origin = this.camera.position;
    const direction = new Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera).sub(origin);
    return {
      origin: [origin.x, origin.y, origin.z],
      direction: [direction.x, direction.y, direction.z],
    };
  }

  /** Oriente `raycaster` depuis la caméra vers le point de l'écran ; faux hors du canvas. */
  private castFrom(clientX: number, clientY: number): boolean {
    const ndc = toNormalizedDevice(clientX, clientY, this.canvas.getBoundingClientRect());
    if (!ndc) {
      return false;
    }
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointerNdc.set(ndc.x, ndc.y), this.camera);
    return true;
  }
}
