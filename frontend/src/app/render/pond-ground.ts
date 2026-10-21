import { BoxGeometry, Color, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D } from 'three';

import { createPrng } from '../core/random/prng';
import type { TankDimensions } from '../sim/tank';
import { NIGHT_TONES, PALETTE } from './palette';
import type { PondSide } from './pond-cutaway';
import { STONE_BORDER_THICKNESS } from './stone-border';

/**
 * Sol autour du bassin (issue #105, ADR 0031) : le bassin est enterré. Un anneau de terre
 * entoure la margelle, du fond du bassin jusqu'un peu sous son bord, couvert d'une couche
 * d'herbe ; seule une margelle basse dépasse. Décor purement visuel : la simulation (bornes
 * de nage, murs invisibles) n'en sait rien.
 */

/** Largeur du sol au-delà de la margelle, de chaque côté, en mètres. */
export const POND_GROUND_MARGIN = 0.45;
/** Hauteur du dessus du sol sous le bord du bassin (`dims.height`), en mètres. */
export const POND_GROUND_BELOW_RIM = 0.01;
/** Épaisseur de la couche d'herbe, au-dessus de la terre, en mètres. */
export const POND_GRASS_THICKNESS = 0.035;
/**
 * Recouvrement du sol sous la margelle, en mètres : le bord intérieur du sol entre un peu
 * dans les pierres, pour qu'aucune fente ne s'ouvre entre les deux à l'écran.
 */
export const POND_GROUND_OVERLAP = 0.004;
/**
 * Descente du dessous du sol sous le fond du bassin (y = 0), en mètres : vu de dessous, le
 * dessous du sol passe devant celui des pierres sur la bande de recouvrement, au lieu de se
 * disputer la même profondeur.
 */
export const POND_GROUND_SINK = 0.002;

/** Couche du sol : herbe en surface, terre en dessous. */
export type GroundLayer = 'herbe' | 'terre';

/** Dalle du sol : boîte alignée sur les axes (centre et tailles, en mètres). */
export interface GroundSlab {
  readonly layer: GroundLayer;
  /** Côté du bassin (les coins sont couverts par deux dalles, de deux côtés). */
  readonly side: PondSide;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/** Hauteur du dessus du sol autour d'un bassin `dims` (niveau de la coupe, `pond-cutaway.ts`). */
export function pondGroundTop(dims: TankDimensions): number {
  return dims.height - POND_GROUND_BELOW_RIM;
}

/**
 * Dalles du sol autour d'un bassin `dims` (centré en X et Z, fond sur y = 0) : pour chaque
 * couche, quatre dalles en anneau autour de la margelle, qui se recouvrent aux coins. Aucune
 * dalle n'entre dans le volume d'eau ni ne dépasse le bord.
 * @throws RangeError si une dimension n'est pas un réel strictement positif.
 */
export function pondGroundSlabs(dims: TankDimensions): GroundSlab[] {
  for (const value of [dims.width, dims.height, dims.depth]) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new RangeError(`dimensions invalides : ${JSON.stringify(dims)}`);
    }
  }
  const top = pondGroundTop(dims);
  // Bassin très peu profond : l'herbe occupe au plus la moitié de la hauteur du sol.
  const grass = Math.min(POND_GRASS_THICKNESS, (top + POND_GROUND_SINK) / 2);
  const inner = {
    x: dims.width / 2 + STONE_BORDER_THICKNESS - POND_GROUND_OVERLAP,
    z: dims.depth / 2 + STONE_BORDER_THICKNESS - POND_GROUND_OVERLAP,
  };
  const outer = {
    x: dims.width / 2 + STONE_BORDER_THICKNESS + POND_GROUND_MARGIN,
    z: dims.depth / 2 + STONE_BORDER_THICKNESS + POND_GROUND_MARGIN,
  };
  return [
    ...ring('terre', inner, outer, -POND_GROUND_SINK, top - grass),
    ...ring('herbe', inner, outer, top - grass, top),
  ];
}

interface HalfSize {
  readonly x: number;
  readonly z: number;
}

function ring(
  layer: GroundLayer,
  inner: HalfSize,
  outer: HalfSize,
  bottom: number,
  top: number,
): GroundSlab[] {
  const y = (bottom + top) / 2;
  const height = top - bottom;
  // Chaque bande va jusqu'au bord extérieur du sol : aux coins, les bandes se recouvrent
  // (mêmes matériaux, même plan) au lieu de se toucher, sans fente possible entre elles.
  const along = (side: '-z' | '+z', sign: number): GroundSlab => ({
    layer,
    side,
    x: 0,
    y,
    z: (sign * (inner.z + outer.z)) / 2,
    width: 2 * outer.x,
    height,
    depth: outer.z - inner.z,
  });
  const across = (side: '-x' | '+x', sign: number): GroundSlab => ({
    layer,
    side,
    x: (sign * (inner.x + outer.x)) / 2,
    y,
    z: 0,
    width: outer.x - inner.x,
    height,
    depth: 2 * outer.z,
  });
  return [along('-z', -1), along('+z', 1), across('-x', -1), across('+x', 1)];
}

/** Nombre de touffes d'herbe semées sur le sol. */
export const POND_TUFT_COUNT = 70;
/** Côté et hauteur d'une touffe d'herbe (un ou deux pixels de scène), en mètres. */
export const POND_TUFT_SIZE = 0.022;
export const POND_TUFT_HEIGHT = 0.012;
/** Graine fixe des touffes : le sol est le même quelle que soit la graine du monde. */
const TUFT_SEED = 105;

/** Touffe d'herbe : petite boîte posée sur le sol (centre du pied, en mètres). */
export interface GrassTuft {
  readonly x: number;
  readonly z: number;
  /** Ton de la touffe : 0 clair, 1 sombre. */
  readonly tone: 0 | 1;
  /** Côté du sol qui la porte (coins : côtés selon X, `±z`). */
  readonly side: PondSide;
}

/**
 * Touffes d'herbe semées sur le sol autour d'un bassin `dims` (graine fixe, rendu
 * déterministe) : entièrement sur le sol, hors de la margelle, à une demi-touffe au moins des
 * bords. Elles cassent l'aplat vert du sol vu de dessus et de trois-quarts.
 * @throws RangeError si une dimension n'est pas un réel strictement positif.
 */
export function pondGrassTufts(dims: TankDimensions): GrassTuft[] {
  pondGroundSlabs(dims); // validation des dimensions
  const half = POND_TUFT_SIZE / 2;
  const inner = {
    x: dims.width / 2 + STONE_BORDER_THICKNESS + half,
    z: dims.depth / 2 + STONE_BORDER_THICKNESS + half,
  };
  const outer = {
    x: dims.width / 2 + STONE_BORDER_THICKNESS + POND_GROUND_MARGIN - half,
    z: dims.depth / 2 + STONE_BORDER_THICKNESS + POND_GROUND_MARGIN - half,
  };
  const prng = createPrng(TUFT_SEED);
  const tufts: GrassTuft[] = [];
  // Tirage dans le rectangle extérieur, rejet dans le trou : au plus 50 essais par touffe.
  for (
    let attempt = 0;
    tufts.length < POND_TUFT_COUNT && attempt < 50 * POND_TUFT_COUNT;
    attempt++
  ) {
    const x = (prng.next() * 2 - 1) * outer.x;
    const z = (prng.next() * 2 - 1) * outer.z;
    const tone = prng.next() < 0.6 ? 0 : 1;
    if (Math.abs(x) < inner.x && Math.abs(z) < inner.z) {
      continue;
    }
    const side: PondSide = Math.abs(z) >= inner.z ? (z > 0 ? '+z' : '-z') : x > 0 ? '+x' : '-x';
    tufts.push({ x, z, tone, side });
  }
  return tufts;
}

/**
 * Lueurs du sol en pleine nuit (comme la margelle, ADR 0026) : sans elles, l'herbe et la
 * terre, peu éclairées par la lune, se confondraient avec le fond de la scène. Nulles à midi.
 */
export const GROUND_NIGHT_GLOW = {
  herbe: NIGHT_TONES.vegetationLuneSombre,
  terre: NIGHT_TONES.rocheLuneSombre,
} as const;

/** Sol ajouté à la scène, avec sa teinte selon l'heure. */
export interface PondGround {
  readonly object: Object3D;
  /** Intensité du jour dans [0, 1] : à 1 (midi), aucune lueur ; à 0, `GROUND_NIGHT_GLOW`. */
  setDaylight(intensity: number): void;
  /** Masque les dalles des côtés `hidden` (vue en coupe, `pond-cutaway.ts`), montre les autres. */
  setHiddenSides(hidden: ReadonlySet<PondSide>): void;
}

/**
 * Sol prêt à ajouter à la scène : un `Mesh` par dalle et par touffe. Herbe : dessus
 * `vegetationClaire`, tranche `vegetationOmbre`, touffes `vegetationLumineuse` ou
 * `vegetationOmbre` (aucune couleur des feuilles de nénuphar, qui restent lisibles et
 * comptables sur les captures) ; terre : tranche `sableSombre`, dessous `sableOmbre` (non
 * éclairé, distinct du fond du bassin vu de dessous). Matériaux partagés.
 */
export function createPondGround(dims: TankDimensions): PondGround {
  const object = new Object3D();
  object.name = 'sol-bassin';
  const grassTop = new MeshLambertMaterial({ color: PALETTE.vegetationClaire });
  const grassSide = new MeshLambertMaterial({ color: PALETTE.vegetationOmbre });
  const earthSide = new MeshLambertMaterial({ color: PALETTE.sableSombre });
  const underside = new MeshBasicMaterial({ color: PALETTE.sableOmbre });
  const tuftMaterials = [
    new MeshLambertMaterial({ color: PALETTE.vegetationLumineuse }),
    new MeshLambertMaterial({ color: PALETTE.vegetationOmbre }),
  ] as const;
  const lit = { herbe: [grassTop, grassSide, ...tuftMaterials], terre: [earthSide] } as const;
  const meshes: { readonly mesh: Mesh; readonly side: PondSide }[] = [];
  for (const [index, slab] of pondGroundSlabs(dims).entries()) {
    const side = slab.layer === 'herbe' ? grassSide : earthSide;
    const top = slab.layer === 'herbe' ? grassTop : earthSide;
    // Ordre des faces d'une BoxGeometry : +X, -X, +Y, -Y, +Z, -Z.
    const mesh = new Mesh(new BoxGeometry(slab.width, slab.height, slab.depth), [
      side,
      side,
      top,
      underside,
      side,
      side,
    ]);
    mesh.name = `sol-${slab.layer}-${index}`;
    mesh.position.set(slab.x, slab.y, slab.z);
    object.add(mesh);
    meshes.push({ mesh, side: slab.side });
  }
  const tuftGeometry = new BoxGeometry(POND_TUFT_SIZE, POND_TUFT_HEIGHT, POND_TUFT_SIZE);
  const groundTop = pondGroundTop(dims);
  for (const [index, tuft] of pondGrassTufts(dims).entries()) {
    const mesh = new Mesh(tuftGeometry, tuftMaterials[tuft.tone]);
    mesh.name = `touffe-${index}`;
    mesh.position.set(tuft.x, groundTop + POND_TUFT_HEIGHT / 2, tuft.z);
    object.add(mesh);
    meshes.push({ mesh, side: tuft.side });
  }
  const black = new Color(0, 0, 0);
  const glows = {
    herbe: new Color(GROUND_NIGHT_GLOW.herbe),
    terre: new Color(GROUND_NIGHT_GLOW.terre),
  };
  return {
    object,
    setDaylight: (intensity) => {
      const day = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 1));
      for (const layer of ['herbe', 'terre'] as const) {
        for (const material of lit[layer]) {
          // `lerpColors(a, b, 0)` vaut exactement `a` : noir (aucune lueur) à midi.
          material.emissive.lerpColors(black, glows[layer], 1 - day);
        }
      }
    },
    setHiddenSides: (hidden) => {
      for (const { mesh, side } of meshes) {
        mesh.visible = !hidden.has(side);
      }
    },
  };
}
