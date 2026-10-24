import { createPrng } from '../core/random/prng';

/**
 * Bois flotté à branches (issue #169, ADR 0045) : modèle voxel tiré d'une graine, pur et
 * déterministe, sans Three.js (ADR 0003).
 *
 * Le bois est un **squelette** de tronçons (capsules à rayon dégressif) : un tronc couché
 * sur le sable, une extrémité relevée, d'où partent deux ou trois branches qui montent en
 * s'écartant de part et d'autre, l'une parfois fourchue. Les voxels sont ceux dont le centre
 * est dans une capsule ; la forme de collision est une union de sphères posées le long des
 * tronçons, dont chaque rayon couvre exactement les voxels qui lui sont rattachés : elle suit
 * les branches, contient tous les voxels, et laisse ouverts les creux entre deux branches.
 */

/** Arête d'un voxel de bois à l'échelle 1, en mètres. */
export const WOOD_VOXEL_SIZE = 0.01;

/** Enfoncement de la base dans le sable, en fraction de voxel (comme un rocher). */
export const WOOD_SINK_RATIO = 0.25;

/** Budget de sphères de collision d'un bois (coût de l'évitement). */
export const MAX_WOOD_SPHERES = 40;

/** Écart minimal entre deux sphères voisines d'un tronçon, en voxels. */
export const WOOD_SPHERE_SPACING = 2;

/** Tronçon du squelette, en voxels (Y = 0 à la base) ; rayon `ra` en A, `rb` en B. */
export interface WoodSegment {
  readonly ax: number;
  readonly ay: number;
  readonly az: number;
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
  readonly ra: number;
  readonly rb: number;
  /** 0 : tronc ; 1, 2… : branches (une fourche porte son propre numéro). */
  readonly branch: number;
}

/** Sphère de collision dans le repère local, en voxels. */
export interface WoodSphere {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
  /** Branche du tronçon qui porte la sphère (0 : tronc). */
  readonly branch: number;
}

/** Voxel plein : occupe [i, i + 1] × [j, j + 1] × [k, k + 1] ; `branch` : 0 pour le tronc. */
export interface WoodCell {
  readonly i: number;
  readonly j: number;
  readonly k: number;
  readonly branch: number;
}

/** Modèle d'un bois flotté, dans son repère local (avant rotation et translation). */
export interface WoodModel {
  /** Arête d'un voxel, en mètres (`WOOD_VOXEL_SIZE · scale`). */
  readonly voxelSize: number;
  readonly segments: readonly WoodSegment[];
  /** Au plus `MAX_WOOD_SPHERES` sphères ; chacune contient les voxels qui lui sont rattachés. */
  readonly spheres: readonly WoodSphere[];
  /** Voxels pleins, triés par (j, i, k), sans doublon ; `j ≥ 0`. */
  readonly cells: readonly WoodCell[];
}

/**
 * Squelette d'un bois tiré de sa graine : tronc de 3 tronçons le long de X (de 24 à 32
 * voxels, posé à gauche, relevé à droite), puis 2 ou 3 branches de 2 tronçons, alternées de
 * part et d'autre (±Z), penchées vers le bout relevé ; une branche sur deux graines porte une
 * fourche qui s'écarte encore.
 */
export function woodSkeleton(seed: number): WoodSegment[] {
  const rng = createPrng(seed);
  const segments: WoodSegment[] = [];
  const length = 24 + rng.next() * 8;
  const r0 = 1.7 + rng.next() * 0.4;
  const r1 = r0 * 0.65;
  const lift = 3 + rng.next() * 4;
  const bend = (rng.next() - 0.5) * 6;
  // Tronc : 4 points de x = −L/2 à L/2, couché à gauche, relevé à droite, un peu cintré en Z.
  const trunk: [number, number, number, number][] = [];
  for (let n = 0; n <= 3; n++) {
    const t = n / 3;
    const r = r0 + (r1 - r0) * t;
    trunk.push([-length / 2 + length * t, r + lift * t * t, bend * Math.sin(Math.PI * t), r]);
  }
  for (let n = 0; n < 3; n++) {
    const [ax, ay, az, ra] = trunk[n];
    const [bx, by, bz, rb] = trunk[n + 1];
    segments.push({ ax, ay, az, bx, by, bz, ra, rb, branch: 0 });
  }
  const trunkAt = (t: number): [number, number, number, number] => {
    const u = Math.min(t * 3, 2.999);
    const n = Math.floor(u);
    const f = u - n;
    const a = trunk[n];
    const b = trunk[n + 1];
    return [0, 1, 2, 3].map((c) => a[c] + (b[c] - a[c]) * f) as [number, number, number, number];
  };
  const count = 2 + Math.floor(rng.next() * 2);
  const side0 = rng.next() < 0.5 ? 1 : -1;
  const forked = Math.floor(rng.next() * count);
  const fork = rng.next() < 0.5;
  let branch = 1;
  for (let b = 0; b < count; b++) {
    const t = 0.2 + ((b + 0.25 + rng.next() * 0.5) * 0.65) / count;
    const [sx, sy, sz, sr] = trunkAt(t);
    const side = b % 2 === 0 ? side0 : -side0;
    const elevation = 0.75 + rng.next() * 0.45; // ~43° à ~69°
    const azimuth = side * (0.9 + rng.next() * 0.45); // écart à +X vers ±Z
    const len = 11 + rng.next() * 6;
    const kink = (rng.next() - 0.5) * 0.5;
    const ra = Math.min(sr * 0.75, 1.3);
    const rm = ra * 0.8;
    const rt = 0.7;
    const dir = (el: number, az: number): [number, number, number] => [
      Math.cos(el) * Math.cos(az),
      Math.sin(el),
      Math.cos(el) * Math.sin(az),
    ];
    const d1 = dir(elevation, azimuth);
    const d2 = dir(elevation + kink, azimuth + side * 0.2);
    const half = len / 2;
    const mx = sx + d1[0] * half;
    const my = sy + d1[1] * half;
    const mz = sz + d1[2] * half;
    const ex = mx + d2[0] * half;
    const ey = my + d2[1] * half;
    const ez = mz + d2[2] * half;
    segments.push({ ax: sx, ay: sy, az: sz, bx: mx, by: my, bz: mz, ra, rb: rm, branch });
    segments.push({ ax: mx, ay: my, az: mz, bx: ex, by: ey, bz: ez, ra: rm, rb: rt, branch });
    branch++;
    if (fork && b === forked) {
      const fl = 6 + rng.next() * 3;
      const d3 = dir(elevation - 0.35, azimuth + side * 0.75);
      segments.push({
        ax: mx,
        ay: my,
        az: mz,
        bx: mx + d3[0] * fl,
        by: Math.max(my + d3[1] * fl, rt),
        bz: mz + d3[2] * fl,
        ra: rm * 0.85,
        rb: rt,
        branch,
      });
      branch++;
    }
  }
  return segments;
}

/**
 * Modèle voxel d'un bois flotté : voxels dont le centre est dans une capsule du squelette
 * (`woodSkeleton`), puis sphères de collision le long des tronçons (au plus
 * `MAX_WOOD_SPHERES`, écart d'au moins `WOOD_SPHERE_SPACING`). Chaque voxel est rattaché à la
 * sphère la plus proche de son tronçon, dont le rayon couvre son coin le plus éloigné : un
 * poisson hors de l'union de sphères n'est jamais dans un voxel.
 * @throws RangeError si la graine est invalide ou si l'échelle n'est pas un réel
 * strictement positif.
 */
export function woodModel(seed: number, scale: number): WoodModel {
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new RangeError(`scale doit être un réel strictement positif (reçu : ${scale})`);
  }
  const key = `${seed}:${scale}`;
  const cached = MODELS.get(key);
  if (cached) {
    return cached;
  }
  const model = buildWoodModel(seed, scale);
  if (MODELS.size >= MAX_CACHED_MODELS) {
    MODELS.delete(MODELS.keys().next().value as string);
  }
  MODELS.set(key, model);
  return model;
}

/**
 * Modèles déjà calculés (données immuables) : l'éditeur, la nourriture et le rendu
 * redemandent le même bois à chaque geste. Taille bornée, le plus ancien sort en premier.
 */
const MODELS = new Map<string, WoodModel>();
const MAX_CACHED_MODELS = 32;

function buildWoodModel(seed: number, scale: number): WoodModel {
  const segments = woodSkeleton(seed);
  // Centres des sphères : le long de chaque tronçon, écart commun élargi jusqu'au budget.
  const lengths = segments.map((s) => Math.hypot(s.bx - s.ax, s.by - s.ay, s.bz - s.az));
  const steps = (spacing: number): number[] =>
    lengths.map((l) => Math.max(1, Math.ceil(l / spacing)));
  let spacing = WOOD_SPHERE_SPACING;
  while (steps(spacing).reduce((sum, n) => sum + n + 1, 0) > MAX_WOOD_SPHERES) {
    spacing += 0.25;
  }
  const perSegment = steps(spacing);
  const centers: { x: number; y: number; z: number; r: number; branch: number }[][] = segments.map(
    (s, n) => {
      const list = [];
      for (let m = 0; m <= perSegment[n]; m++) {
        const t = m / perSegment[n];
        list.push({
          x: s.ax + (s.bx - s.ax) * t,
          y: s.ay + (s.by - s.ay) * t,
          z: s.az + (s.bz - s.az) * t,
          r: s.ra + (s.rb - s.ra) * t,
          branch: s.branch,
        });
      }
      return list;
    },
  );
  // Voxels : centre dans une capsule ; rattaché au tronçon le plus « profond » (distance
  // relative au rayon local la plus faible, le premier à égalité), puis à la sphère la plus
  // proche de ce tronçon. Chaque tronçon ne parcourt que sa boîte englobante.
  const owners = new Map<
    string,
    { i: number; j: number; k: number; owner: number; depth: number }
  >();
  segments.forEach((s, n) => {
    const r = Math.max(s.ra, s.rb);
    const maxJ = Math.ceil(Math.max(s.ay, s.by) + r);
    const maxI = Math.ceil(Math.max(s.ax, s.bx) + r);
    const maxK = Math.ceil(Math.max(s.az, s.bz) + r);
    for (let j = Math.max(0, Math.floor(Math.min(s.ay, s.by) - r)); j < maxJ; j++) {
      for (let i = Math.floor(Math.min(s.ax, s.bx) - r); i < maxI; i++) {
        for (let k = Math.floor(Math.min(s.az, s.bz) - r); k < maxK; k++) {
          const depth = capsuleDepth(s, i + 0.5, j + 0.5, k + 0.5);
          if (depth > 1) {
            continue;
          }
          const key = `${i},${j},${k}`;
          const known = owners.get(key);
          if (!known || depth < known.depth) {
            owners.set(key, { i, j, k, owner: n, depth });
          }
        }
      }
    }
  });
  const sorted = [...owners.values()].sort((a, b) => a.j - b.j || a.i - b.i || a.k - b.k);
  const reach = centers.map((list) => list.map(() => 0));
  const cells: WoodCell[] = sorted.map(({ i, j, k, owner }) => {
    const list = centers[owner];
    let best = 0;
    let bestD2 = Infinity;
    list.forEach((c, m) => {
      const d2 = (i + 0.5 - c.x) ** 2 + (j + 0.5 - c.y) ** 2 + (k + 0.5 - c.z) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = m;
      }
    });
    const c = list[best];
    const dx = Math.max(Math.abs(i - c.x), Math.abs(i + 1 - c.x));
    const dy = Math.max(Math.abs(j - c.y), Math.abs(j + 1 - c.y));
    const dz = Math.max(Math.abs(k - c.z), Math.abs(k + 1 - c.z));
    reach[owner][best] = Math.max(reach[owner][best], Math.hypot(dx, dy, dz));
    return { i, j, k, branch: segments[owner].branch };
  });
  // Sphères : rayon couvrant leurs voxels, au moins le rayon local de la capsule. Les
  // jonctions (fin d'un tronçon, début du suivant) donnent deux centres confondus : fusionnés.
  const spheres: WoodSphere[] = [];
  centers.forEach((list, n) =>
    list.forEach((c, m) => {
      const r = Math.max(reach[n][m], c.r);
      const twin = spheres.findIndex(
        (s) =>
          Math.abs(s.x - c.x) < 1e-9 && Math.abs(s.y - c.y) < 1e-9 && Math.abs(s.z - c.z) < 1e-9,
      );
      if (twin < 0) {
        spheres.push({ x: c.x, y: c.y, z: c.z, r, branch: c.branch });
      } else if (r > spheres[twin].r) {
        spheres[twin] = { ...spheres[twin], r };
      }
    }),
  );
  return { voxelSize: WOOD_VOXEL_SIZE * scale, segments, spheres, cells };
}

/**
 * Distance du point à l'axe du tronçon, rapportée au rayon local (interpolé) : ≤ 1 dans la
 * capsule.
 */
function capsuleDepth(s: WoodSegment, x: number, y: number, z: number): number {
  const ux = s.bx - s.ax;
  const uy = s.by - s.ay;
  const uz = s.bz - s.az;
  const len2 = ux * ux + uy * uy + uz * uz;
  const t =
    len2 === 0
      ? 0
      : Math.min(1, Math.max(0, ((x - s.ax) * ux + (y - s.ay) * uy + (z - s.az) * uz) / len2));
  const dx = x - (s.ax + ux * t);
  const dy = y - (s.ay + uy * t);
  const dz = z - (s.az + uz * t);
  return Math.hypot(dx, dy, dz) / (s.ra + (s.rb - s.ra) * t);
}
