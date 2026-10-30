import {
  BoxGeometry,
  Color,
  ExtrudeGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Path,
  Shape,
} from 'three';

import {
  shapeContour,
  shapeNormal,
  shapeOutline,
  type PondShape,
  type ShapeOutline,
} from '../sim/pond-shape';
import { waterVolume, type TankDimensions } from '../sim/tank';
import { PALETTE } from './palette';
import {
  GROUND_NIGHT_GLOW,
  POND_GRASS_THICKNESS,
  POND_GROUND_SINK,
  pondGroundTop,
} from './pond-ground';
import {
  STONE_BLOCK_LENGTH,
  STONE_BORDER_THICKNESS,
  STONE_JOINT,
  STONE_NIGHT_GLOW,
  STONE_RISE,
} from './stone-border';

/**
 * Berge d'un bassin ovale ou haricot (issue #190, ADR 0080). La boîte d'eau reste
 * rectangulaire ; une berge de terre couverte d'herbe comble l'espace entre la forme et le
 * rectangle de la margelle, jusqu'au niveau du sol (`pondGroundTop`), et une margelle de
 * pierres suit le contour. Vue de dessus et de trois-quarts, l'eau a la forme du bassin.
 * Décor purement visuel : la simulation borne la nage par la même forme (`sim/pond-shape.ts`).
 */

/** Points du contour échantillonnés pour la berge et la margelle. */
export const POND_SHAPE_CONTOUR_POINTS = 192;
/** Variations de hauteur des pierres le long du contour (mètres), comme la margelle droite. */
const HEIGHT_PATTERN = [0, 0.012, -0.006, 0.018, 0.004, -0.01, 0.009] as const;
/** Allongement des pierres le long d'un contour courbe (fraction du pas). */
const CURVE_OVERLAP = 1.15;

/** Pierre de la margelle courbe : boîte tournée autour de Y (centre, tailles, angle). */
export interface CurvedStone {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Longueur le long du contour. */
  readonly length: number;
  readonly height: number;
  /** Épaisseur vers l'extérieur. */
  readonly thickness: number;
  /** Rotation autour de Y (radians) : la longueur suit la tangente du contour. */
  readonly angle: number;
  readonly index: number;
}

/** Contour du bassin de forme `shape` dans un volume `dims` (boîte d'eau entière en X et Z). */
export function pondShapeOutline(dims: TankDimensions, shape: PondShape): ShapeOutline {
  return shapeOutline(shape, waterVolume(dims));
}

/**
 * Pierres de la margelle le long du contour : longueur visée `STONE_BLOCK_LENGTH`, divisant
 * exactement le périmètre, séparées d'un joint ; chaque pierre est posée juste à l'extérieur
 * du contour (normale sortante en son milieu), du sol jusqu'un peu au-dessus du bord. Pur et
 * déterministe.
 * @throws RangeError si une dimension n'est pas un réel strictement positif.
 */
export function curvedStones(dims: TankDimensions, shape: PondShape): CurvedStone[] {
  assertDims(dims);
  const outline = pondShapeOutline(dims, shape);
  const pts = shapeContour(outline, POND_SHAPE_CONTOUR_POINTS);
  const n = pts.length / 2;
  const cumulative = [0];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    cumulative.push(
      cumulative[i] + Math.hypot(pts[2 * j] - pts[2 * i], pts[2 * j + 1] - pts[2 * i + 1]),
    );
  }
  const perimeter = cumulative[n];
  const count = Math.max(3, Math.round(perimeter / STONE_BLOCK_LENGTH));
  const step = perimeter / count;
  const t = STONE_BORDER_THICKNESS;
  const normal = { x: 0, z: 0 };
  const stones: CurvedStone[] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const s = (k + 0.5) * step;
    while (cumulative[seg + 1] < s) {
      seg += 1;
    }
    const j = (seg + 1) % n;
    const f = (s - cumulative[seg]) / Math.max(cumulative[seg + 1] - cumulative[seg], 1e-12);
    const x = pts[2 * seg] + (pts[2 * j] - pts[2 * seg]) * f;
    const z = pts[2 * seg + 1] + (pts[2 * j + 1] - pts[2 * seg + 1]) * f;
    shapeNormal(outline, x, z, normal);
    const height = dims.height + STONE_RISE + HEIGHT_PATTERN[k % HEIGHT_PATTERN.length];
    stones.push({
      x: x - (normal.x * t) / 2,
      y: height / 2,
      z: z - (normal.z * t) / 2,
      // Allongée de la part qui s'ouvrirait à l'extérieur des courbes (`CURVE_OVERLAP`) : les
      // joints restent étroits au lieu de s'ouvrir en coins sur l'herbe.
      length: Math.max(step * CURVE_OVERLAP - STONE_JOINT, step / 2),
      height,
      thickness: t,
      // Rotation `θ` autour de Y : l'axe Z local (épaisseur) va sur la normale (sin θ, cos θ),
      // l'axe X local (longueur) sur la tangente.
      angle: Math.atan2(normal.x, normal.z),
      index: k,
    });
  }
  return stones;
}

/** Berge ajoutée à la scène, avec sa teinte selon l'heure. */
export interface PondShapeBank {
  readonly object: Object3D;
  /** Intensité du jour dans [0, 1] : lueurs de nuit du sol et des pierres, nulles à midi. */
  setDaylight(intensity: number): void;
  /**
   * Vue en coupe (`pond-cutaway.ts`) : la berge entière est masquée dès qu'un côté l'est
   * (caméra sous le niveau du sol), pour laisser voir l'eau.
   */
  setCutaway(active: boolean): void;
}

/**
 * Berge prête à ajouter à la scène : terre (paroi `rocheSombre`, dessous `sableOmbre`) et herbe
 * (`vegetationClaire` dessus, `vegetationOmbre` tranche) extrudées entre le contour et le
 * rectangle extérieur de la margelle droite, et pierres de la margelle courbe (dessus `roche`
 * et `sableOmbre` en alternance, côtés `rocheSombre`). Matériaux partagés.
 * @throws RangeError si une dimension n'est pas un réel strictement positif.
 */
export function createPondShapeBank(dims: TankDimensions, shape: PondShape): PondShapeBank {
  assertDims(dims);
  const object = new Object3D();
  object.name = 'berge-forme';
  const top = pondGroundTop(dims);
  const grass = Math.min(POND_GRASS_THICKNESS, (top + POND_GROUND_SINK) / 2);
  const grassTop = new MeshLambertMaterial({ color: PALETTE.vegetationClaire });
  const grassSide = new MeshLambertMaterial({ color: PALETTE.vegetationOmbre });
  // Paroi de terre sous la margelle, vue à travers l'eau : sombre comme les côtés des pierres
  // de la margelle droite, pour que l'eau garde sa teinte (une terre claire la grisait).
  const earthSide = new MeshLambertMaterial({ color: PALETTE.rocheSombre });
  const underside = new MeshBasicMaterial({ color: PALETTE.sableOmbre });
  const outline = pondShapeOutline(dims, shape);
  const contour = shapeContour(outline, POND_SHAPE_CONTOUR_POINTS);
  const earth = bankLayer(dims, contour, -POND_GROUND_SINK, top - grass, [underside, earthSide]);
  earth.name = 'berge-terre';
  const turf = bankLayer(dims, contour, top - grass, top, [grassTop, grassSide]);
  turf.name = 'berge-herbe';
  object.add(earth, turf);

  const stoneTops = [PALETTE.roche, PALETTE.sableOmbre].map(
    (color) => new MeshLambertMaterial({ color }),
  );
  const stoneSide = new MeshLambertMaterial({ color: PALETTE.rocheSombre });
  for (const stone of curvedStones(dims, shape)) {
    // Ordre des faces d'une BoxGeometry : +X, -X, +Y, -Y, +Z, -Z.
    const mesh = new Mesh(new BoxGeometry(stone.length, stone.height, stone.thickness), [
      stoneSide,
      stoneSide,
      stoneTops[stone.index % stoneTops.length],
      stoneSide,
      stoneSide,
      stoneSide,
    ]);
    mesh.name = `pierre-courbe-${stone.index}`;
    mesh.position.set(stone.x, stone.y, stone.z);
    mesh.rotation.y = stone.angle;
    object.add(mesh);
  }
  const black = new Color(0, 0, 0);
  const glows: readonly [MeshLambertMaterial, Color][] = [
    [grassTop, new Color(GROUND_NIGHT_GLOW.herbe)],
    [grassSide, new Color(GROUND_NIGHT_GLOW.herbe)],
    [earthSide, new Color(GROUND_NIGHT_GLOW.terre)],
    ...stoneTops.map((m) => [m, new Color(STONE_NIGHT_GLOW)] as [MeshLambertMaterial, Color]),
    [stoneSide, new Color(STONE_NIGHT_GLOW)],
  ];
  return {
    object,
    setDaylight: (intensity) => {
      const day = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 1));
      for (const [material, glow] of glows) {
        material.emissive.lerpColors(black, glow, 1 - day);
      }
    },
    setCutaway: (active) => {
      object.visible = !active;
    },
  };
}

/**
 * Couche de la berge : rectangle extérieur de la margelle droite percé du contour, extrudé
 * de `bottom` à `top` (Y). Groupes de matériaux d'`ExtrudeGeometry` : faces planes (dessus et
 * dessous), puis tranches.
 */
function bankLayer(
  dims: TankDimensions,
  contour: readonly number[],
  bottom: number,
  top: number,
  materials: [MeshBasicMaterial | MeshLambertMaterial, MeshLambertMaterial],
): Mesh {
  const hx = dims.width / 2 + STONE_BORDER_THICKNESS;
  const hz = dims.depth / 2 + STONE_BORDER_THICKNESS;
  // Plan de la forme (x, y) → monde (x, −z) après la rotation de −π/2 autour de X.
  const outer = new Shape();
  outer.moveTo(-hx, -hz);
  outer.lineTo(hx, -hz);
  outer.lineTo(hx, hz);
  outer.lineTo(-hx, hz);
  outer.closePath();
  const hole = new Path();
  hole.moveTo(contour[0], -contour[1]);
  for (let i = 2; i < contour.length; i += 2) {
    hole.lineTo(contour[i], -contour[i + 1]);
  }
  hole.closePath();
  outer.holes.push(hole);
  const geometry = new ExtrudeGeometry(outer, {
    depth: Math.max(top - bottom, 0.001),
    bevelEnabled: false,
  });
  const mesh = new Mesh(geometry, materials);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = bottom;
  return mesh;
}

function assertDims(dims: TankDimensions): void {
  for (const value of [dims.width, dims.height, dims.depth]) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new RangeError(`dimensions invalides : ${JSON.stringify(dims)}`);
    }
  }
}
