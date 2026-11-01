import { ANCISTRUS, DANIO, OTOCINCLUS, PLATY, SPECIES, type SpeciesId } from '../sim/species';
import {
  ANCISTRUS_FISH,
  buildVoxelMesh,
  DANIO_FISH,
  OTOCINCLUS_FISH,
  PLATY_FISH,
  SILHOUETTES,
  voxelSize,
  type FishTemplate,
} from './fish-model';
import { PALETTE, PALETTE_COLORS } from './palette';

/** Modèles voxel du lot 2 d'eau douce (#362) : lisibles et distincts à l'échelle des captures. */
const NEW: readonly SpeciesId[] = ['platy', 'danio', 'ancistrus', 'otocinclus'];
const TEMPLATES = [PLATY_FISH, DANIO_FISH, ANCISTRUS_FISH, OTOCINCLUS_FISH];

function width(template: FishTemplate): number {
  return template.body[0].length;
}

describe('modèles du lot 2 d’eau douce (#362)', () => {
  it('chaque espèce a son gabarit, rangées de même largeur, maillage non vide, œil à la tête', () => {
    expect(NEW.map((id) => SILHOUETTES[SPECIES[id].silhouette])).toEqual(TEMPLATES);
    for (const [index, template] of TEMPLATES.entries()) {
      const def = SPECIES[NEW[index]];
      for (const layer of [template.body, ...(template.paired ?? [])]) {
        expect(layer.length, def.id).toBe(template.body.length);
        for (const row of layer) {
          expect(row.length, def.id).toBe(width(template));
        }
      }
      const mesh = buildVoxelMesh(
        template.body,
        template.bodyDepth,
        def.colors,
        voxelSize(def, template),
        'center',
        template.bodyColumnDepths,
      );
      expect(mesh.quads, def.id).toBeGreaterThan(0);
      expect(
        template.body.some((row) => row.endsWith('e')),
        def.id,
      ).toBe(true);
    }
  });

  it('couleurs prises dans la palette commune, jamais le rouge des néons', () => {
    for (const id of NEW) {
      for (const color of Object.values(SPECIES[id].colors)) {
        expect(PALETTE_COLORS, `${id} ${color}`).toContain(color);
        expect(color, id).not.toBe(PALETTE.neonRouge);
      }
    }
  });

  it('silhouettes distinctes : platy haut, danio long, ancistrus large vu de dessus', () => {
    const aspect = (t: FishTemplate) => width(t) / t.body.length;
    expect(aspect(PLATY_FISH)).toBeLessThan(2);
    expect(aspect(DANIO_FISH)).toBeGreaterThan(aspect(PLATY_FISH));
    // Ancistrus : seul des quatre plus épais que deux voxels, effilé vers la queue.
    expect(ANCISTRUS_FISH.bodyDepth).toBeGreaterThanOrEqual(6);
    for (const t of [PLATY_FISH, DANIO_FISH, OTOCINCLUS_FISH]) {
      expect(t.bodyDepth).toBe(2);
    }
    const depths = ANCISTRUS_FISH.bodyColumnDepths ?? [];
    expect(depths.length).toBe(width(ANCISTRUS_FISH));
    expect(depths[0]).toBeLessThan(depths.at(-1) ?? 0);
    expect(ANCISTRUS_FISH.paired?.[0].join('')).toContain('f');
  });

  it('motifs : nageoires noires du platy, bandes du danio, points de l’ancistrus, bande de l’oto', () => {
    expect(PLATY.colors.fin).toBe(PALETTE.koiNoir);
    expect(PLATY.colors.stripe).toBe(PALETTE.koiRouge);
    expect(PLATY_FISH.body[0]).toMatch(/f/);
    // Danio : bandes bleues de part et d'autre d'une bande claire, sur toute la longueur.
    expect(DANIO.colors.stripe).toBe(PALETTE.neonBleu);
    expect(DANIO_FISH.body[1]).toMatch(/^s{10,}e$/);
    expect(DANIO_FISH.body[2]).toMatch(/^a{10,}/);
    expect(DANIO_FISH.body[3]).toMatch(/^s{10,}/);
    // Ancistrus : points clairs sur le dos sombre.
    expect(ANCISTRUS.colors.back).toBe(PALETTE.rocheSombre);
    expect(ANCISTRUS_FISH.body[1].split('a').length - 1).toBeGreaterThanOrEqual(3);
    // Otocinclus : bande noire du pédoncule au museau.
    expect(OTOCINCLUS.colors.stripe).toBe(PALETTE.koiNoir);
    expect(OTOCINCLUS_FISH.body[1]).toMatch(/^s+e$/);
  });
});
