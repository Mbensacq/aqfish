import { speciesCatalog } from '../../sim/species-catalog';
import { SETTINGS_CATEGORIES } from './settings-categories';
import {
  buildSettingsIndex,
  normalizeSearch,
  searchDisplay,
  searchSettings,
} from './settings-index';

const index = buildSettingsIndex(SETTINGS_CATEGORIES, speciesCatalog('tropical'));
const names = (query: string) => searchSettings(index, query).map((result) => result.name);

describe('normalisation de la recherche (#723)', () => {
  it('minuscules, sans accents, espaces réduits, apostrophe droite', () => {
    expect(normalizeSearch('  Éclairage  ')).toBe('eclairage');
    expect(normalizeSearch('NÉON')).toBe('neon');
    expect(normalizeSearch('Changer   l’eau')).toBe("changer l'eau");
    expect(normalizeSearch('ça, où, è, ï')).toBe('ca, ou, e, i');
    expect(normalizeSearch('')).toBe('');
  });
});

describe('recherche des réglages (#723)', () => {
  it('casse et accents ignorés : « ECLAIRAGE », « éclairage » et « eclairage » se valent', () => {
    expect(names('ECLAIRAGE')).toEqual(names('éclairage'));
    expect(names('eclairage')[0]).toBe('Éclairage');
  });

  it('« chauffage » trouve le chauffage, dans « Eau et matériel »', () => {
    const [first] = searchSettings(index, 'chauffage');
    expect(first.name).toBe('Chauffage');
    expect(first.category).toBe('eau');
    expect(first.categoryTitle).toBe('Eau et matériel');
    expect(first.section).toBe('eau');
  });

  it('mots voisins : « température » mène au chauffage, « lumière » à l’éclairage et à l’heure', () => {
    expect(names('température')).toContain('Chauffage');
    const light = names('lumière');
    expect(light).toEqual(expect.arrayContaining(['Éclairage', 'Lampe', 'Heure']));
  });

  it('« lum » : les réglages de la lumière d’abord (mot voisin), le volume ensuite (nom qui contient)', () => {
    const results = names('lum');
    expect(results.slice(0, 3)).toEqual(['Éclairage', 'Lampe', 'Heure']);
    expect(results).toContain('Volume');
  });

  it('ordre : nom qui commence par la requête, puis mot du nom, mot voisin, nom qui la contient, explication', () => {
    // « heure » : « Heure » et « Heure automatique » commencent par elle (ordre de déclaration),
    // puis « Lampe » (« L’heure d’allumage… », explication).
    const results = names('heure');
    expect(results.slice(0, 2)).toEqual(['Heure', 'Heure automatique']);
    expect(results.indexOf('Lampe')).toBeGreaterThan(1);
    // « ph » : « pH − » et « pH + » par leur nom, avant les feuilles de catappa (mot voisin).
    const ph = names('ph');
    expect(ph.indexOf('pH −')).toBeLessThan(ph.indexOf('Feuilles de catappa'));
    expect(ph.indexOf('pH +')).toBeLessThan(ph.indexOf('Feuilles de catappa'));
  });

  it('espèces : par leur nom courant et par leur nom scientifique, dans « Population »', () => {
    const [neon] = searchSettings(index, 'néon');
    expect(neon).toMatchObject({
      kind: 'espece',
      name: 'Néon',
      species: 'neon',
      category: 'population',
      section: 'population',
      explanation: 'Paracheirodon innesi',
    });
    expect(names('neon')[0]).toBe('Néon');
    expect(searchSettings(index, 'paracheirodon')[0].species).toBe('neon');
  });

  it('explication : seulement au début d’un mot (#764) ; « lum » ne trouve plus la fiche par « volume »', () => {
    expect(names('lum')).not.toContain('Fiche de l’espèce');
    // « olume » est au milieu de « volume » : pas la fiche ; « volume », au début d'un mot : la fiche.
    expect(names('olume')).not.toContain('Fiche de l’espèce');
    expect(names('volume')).toContain('Fiche de l’espèce');
    // Après une apostrophe ou une ponctuation, et sur plusieurs mots.
    expect(names('allumage')).toContain('Lampe');
    expect(names('baisser le')).toEqual(['Changer l’eau', 'pH −']);
  });

  it('aucun résultat : liste vide ; requête vide ou blanche : aucun résultat', () => {
    expect(searchSettings(index, 'zzzz')).toEqual([]);
    expect(searchSettings(index, '')).toEqual([]);
    expect(searchSettings(index, '   ')).toEqual([]);
  });

  it('chaque réglage déclaré est trouvé par son nom (une seule source : la déclaration)', () => {
    for (const category of SETTINGS_CATEGORIES) {
      for (const control of category.controls) {
        const found = searchSettings(index, control.name);
        expect(found.some((r) => r.name === control.name && r.category === category.id)).toBe(true);
        expect(category.sections).toContain(control.section);
      }
    }
  });

  it('sans catégorie « Population » déclarée : aucune espèce indexée', () => {
    const others = SETTINGS_CATEGORIES.filter((category) => category.id !== 'population');
    const bare = buildSettingsIndex(others, speciesCatalog('tropical'));
    expect(searchSettings(bare, 'néon')).toEqual([]);
  });
});

describe('affichage d’une recherche (#723)', () => {
  it('sections des résultats ; espèces trouvées seules gardées', () => {
    const display = searchDisplay(searchSettings(index, 'néon'));
    expect([...display.sections]).toEqual(['population']);
    expect(display.species).toEqual(['neon']);
  });

  it('un réglage de la population trouvé : toutes les tuiles', () => {
    const display = searchDisplay(searchSettings(index, 'effectif'));
    expect(display.sections.has('population')).toBe(true);
    expect(display.species).toBeNull();
  });

  it('« lum » : les réglages trouvés seuls, pas les autres réglages de « eau » (#764)', () => {
    const display = searchDisplay(searchSettings(index, 'lum'));
    expect(display.sections.has('eau')).toBe(true);
    expect([...display.settings]).toEqual(expect.arrayContaining(['Éclairage', 'Lampe']));
    for (const other of ['Chauffage', 'Courant', 'Changer l’eau', 'Fiche de l’espèce']) {
      expect(display.settings.has(other), other).toBe(false);
    }
  });

  it('une espèce trouvée n’est pas un réglage : aucun nom de réglage', () => {
    expect(searchDisplay(searchSettings(index, 'néon')).settings.size).toBe(0);
  });

  it('aucun résultat : aucune section, aucune restriction des tuiles', () => {
    const display = searchDisplay([]);
    expect(display.sections.size).toBe(0);
    expect(display.species).toBeNull();
  });

  it('« lumière » : les sections « eau » et « journee »', () => {
    const display = searchDisplay(searchSettings(index, 'lumière'));
    expect([...display.sections].sort()).toEqual(['eau', 'journee']);
  });
});
