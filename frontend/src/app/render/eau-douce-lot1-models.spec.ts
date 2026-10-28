import { GOURAMI, KUHLI, RASBORA, SPECIES, TETRA, type SpeciesId } from '../sim/species';
import {
  buildVoxelMesh,
  GOURAMI_FISH,
  KUHLI_FISH,
  RASBORA_FISH,
  SILHOUETTES,
  TETRA_FISH,
  voxelSize,
  type FishTemplate,
} from './fish-model';
import { PALETTE, PALETTE_COLORS } from './palette';

/** Modèles voxel du lot 1 d'eau douce (#238) : lisibles et distincts à l'échelle des captures. */
const NEW: readonly SpeciesId[] = ['rasbora', 'tetra', 'kuhli', 'gourami'];

function count(template: FishTemplate, char: string): number {
  return template.body.join('').split(char).length - 1;
}

function width(template: FishTemplate): number {
  return template.body[0].length;
}

describe('modèles du lot 1 d’eau douce (#238)', () => {
  it('chaque espèce a son gabarit, rangées de même largeur, maillage non vide', () => {
    const templates = [RASBORA_FISH, TETRA_FISH, KUHLI_FISH, GOURAMI_FISH];
    expect(NEW.map((id) => SILHOUETTES[SPECIES[id].silhouette])).toEqual(templates);
    for (const [index, template] of templates.entries()) {
      const def = SPECIES[NEW[index]];
      for (const row of template.body) {
        expect(row.length, def.id).toBe(width(template));
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
      // Un œil à la tête (dernière colonne).
      expect(
        template.body.some((row) => row.endsWith('e')),
        def.id,
      ).toBe(true);
    }
  });

  it('couleurs prises dans la palette commune (aucune couleur ajoutée)', () => {
    for (const id of NEW) {
      for (const color of Object.values(SPECIES[id].colors)) {
        expect(PALETTE_COLORS, `${id} ${color}`).toContain(color);
      }
    }
  });

  it('silhouettes distinctes : loche longue et basse, gourami haut, tétra en losange', () => {
    const aspect = (t: FishTemplate) => width(t) / t.body.length;
    expect(aspect(KUHLI_FISH)).toBeGreaterThanOrEqual(5);
    for (const t of [RASBORA_FISH, TETRA_FISH, GOURAMI_FISH]) {
      expect(aspect(t)).toBeLessThan(3);
    }
    expect(GOURAMI_FISH.body.length).toBeGreaterThan(TETRA_FISH.body.length);
    expect(TETRA_FISH.body.length).toBeGreaterThan(RASBORA_FISH.body.length);
  });

  it('motifs : triangle noir du rasbora à l’arrière, bandes de la loche, barres du gourami', () => {
    // Rasbora : le noir est dans la moitié arrière (côté queue) du corps.
    const half = width(RASBORA_FISH) / 2;
    let rear = 0;
    let front = 0;
    for (const row of RASBORA_FISH.body) {
      [...row].forEach((c, col) => {
        if (c === 'a' && col < half) {
          rear++;
        } else if (c === 'a') {
          front++;
        }
      });
    }
    expect(RASBORA.colors.accent).toBe(PALETTE.koiNoir);
    expect(rear).toBeGreaterThan(2 * front);
    // Loche : au moins quatre bandes sombres le long du flanc (deux voxels chacune, lisibles).
    const flank = KUHLI_FISH.body[1];
    expect(flank.match(/a+/g)?.length).toBeGreaterThanOrEqual(4);
    expect(KUHLI.colors.accent).toBe(PALETTE.rocheSombre);
    // Gourami : barres bleues sur le rouge, filaments sous le ventre.
    expect(GOURAMI.colors.stripe).toBe(PALETTE.koiRouge);
    expect(GOURAMI.colors.accent).toBe(PALETTE.neonBleu);
    expect(count(GOURAMI_FISH, 'a')).toBeGreaterThanOrEqual(8);
    expect(GOURAMI_FISH.body.slice(-3).join('')).toMatch(/^[.f]+$/);
    // Tétra : dorsale et anale bordées de noir, œil rouge.
    expect(TETRA_FISH.body[0]).toContain('a');
    expect(TETRA_FISH.body.at(-1)).toContain('a');
    expect(TETRA.colors.eye).toBe(PALETTE.koiRouge);
  });

  it('aucune n’emprunte le rouge des néons (mesures du banc sur image)', () => {
    for (const id of NEW) {
      expect(Object.values(SPECIES[id].colors), id).not.toContain(PALETTE.neonRouge);
    }
  });
});
