/**
 * Catégories de la fenêtre « Réglages » (#722, `docs/INTERFACE.md` section 2) : la seule
 * déclaration de ce que contient chaque catégorie. La fenêtre, son inventaire et l'index de
 * la recherche (`settings-index.ts`, #723) la lisent toutes ici.
 *
 * Chaque catégorie réutilise des sections existantes du panneau (`ui/control-panel/*-section.ts`,
 * ADR 0161), désignées par leur attribut `data-section`, et liste les contrôles qu'elle porte
 * (leur nom visible ou accessible, pour l'inventaire et la recherche).
 */

/** Section du panneau, par la valeur de son attribut `data-section`. */
export type SettingsSectionKey =
  | 'environnement'
  | 'bacs-meubles'
  | 'bacs'
  | 'population'
  | 'eau'
  | 'soins'
  | 'decor'
  | 'simulation'
  | 'journee'
  | 'son'
  | 'accessibilite'
  | 'sauvegarde';

/** Groupe de catégories, dans l'ordre de la liste de gauche. */
export type SettingsGroup = 'Le bac' | 'Simulation' | 'Préférences' | 'Données';

/** Identifiant d'une catégorie (stable : il servira de préférence locale, tranche 2). */
export type SettingsCategoryId =
  | 'bac'
  | 'population'
  | 'eau'
  | 'soins'
  | 'decor'
  | 'temps'
  | 'son'
  | 'accessibilite'
  | 'sauvegarde';

/**
 * Un réglage de la fenêtre (#723) : son nom à l'écran, une phrase d'explication, des mots
 * voisins pour la recherche (« lumière » pour l'éclairage) et la section qui le porte (montrée
 * dans les résultats, pour le régler sur place).
 */
export interface SettingDeclaration {
  readonly name: string;
  readonly explanation: string;
  /** Mots voisins, cherchés comme le nom (casse et accents ignorés). */
  readonly synonyms: readonly string[];
  readonly section: SettingsSectionKey;
}

/** Une catégorie de la fenêtre. */
export interface SettingsCategory {
  readonly id: SettingsCategoryId;
  readonly group: SettingsGroup;
  /** Titre, dans la liste et en tête du contenu. */
  readonly title: string;
  /** Phrase d'explication sous le titre. */
  readonly explanation: string;
  /** Sections affichées, dans cet ordre (une section n'appartient qu'à une catégorie). */
  readonly sections: readonly SettingsSectionKey[];
  /** Réglages portés par la catégorie (inventaire et index de la recherche, #723). */
  readonly controls: readonly SettingDeclaration[];
}

/** Ordre des groupes dans la liste de gauche. */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  'Le bac',
  'Simulation',
  'Préférences',
  'Données',
];

/** Raccourci de déclaration : nom, section, explication, mots voisins. */
function setting(
  name: string,
  section: SettingsSectionKey,
  explanation: string,
  synonyms: readonly string[] = [],
): SettingDeclaration {
  return { name, section, explanation, synonyms };
}

/**
 * Catégories, dans l'ordre de la liste (tableau de `docs/INTERFACE.md`, section 2). Écarts
 * provisoires, repris aux lots suivants : « Pluie » reste dans « Temps » avec la journée tant
 * que « Affichage » n'a pas son contenu (filtre pixel art et « Masquer l'interface », lot 5) ;
 * les produits restent dans la section « Eau » jusqu'à son découpage.
 */
export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  {
    id: 'bac',
    group: 'Le bac',
    title: 'Bac et milieu',
    explanation: 'Le milieu du bac, la pièce autour et les bacs qu’elle contient.',
    sections: ['environnement', 'bacs-meubles', 'bacs'],
    controls: [
      setting(
        'Environnement',
        'environnement',
        'Bac tropical, bassin, paludarium, récif ou eau froide.',
        ['milieu', 'aquarium', 'bassin', 'récif', 'paludarium'],
      ),
      setting('Forme du bassin', 'environnement', 'Le contour du bassin à koïs.', [
        'koï',
        'contour',
      ]),
      setting(
        'Afficher la pièce',
        'environnement',
        'La pièce autour du bac tropical, avec ses meubles.',
        ['salon', 'pièce'],
      ),
      setting(
        'Bacs et meubles',
        'bacs-meubles',
        'Poser un bac ou un meuble dans la pièce, choisir sa taille.',
        ['ajouter un bac', 'meuble', 'support', 'taille'],
      ),
      setting(
        'Liste des bacs',
        'bacs',
        'Les bacs de la pièce : passer de l’un à l’autre, en retirer un.',
        ['bacs', 'retirer'],
      ),
      setting('Renommer', 'bacs', 'Le nom du bac affiché.', ['nom du bac']),
      setting(
        'Mode soins ou décor',
        'bacs',
        'En décor, le bac ne s’entretient pas et ses animaux ne tombent pas malades.',
        ['décor', 'soins'],
      ),
      setting('Transférer à l’épuisette', 'bacs', 'Déplacer un animal d’un bac à un autre.', [
        'épuisette',
        'déplacer',
      ]),
      setting(
        'Quarantaine',
        'bacs',
        'Isoler un animal malade dans un bac à part pour le soigner.',
        ['isoler', 'malade'],
      ),
    ],
  },
  {
    id: 'population',
    group: 'Le bac',
    title: 'Population',
    explanation: 'Les animaux du bac, espèce par espèce, avec leur fiche.',
    sections: ['population'],
    controls: [
      setting(
        'Nombre par espèce',
        'population',
        'Ajouter ou retirer des animaux de chaque espèce.',
        ['poissons', 'animaux', 'effectif', 'espèces'],
      ),
      setting(
        'Fiche de l’espèce',
        'population',
        'Ce que l’espèce demande : eau, volume, compagnie.',
        ['fiche', 'wiki'],
      ),
    ],
  },
  {
    id: 'eau',
    group: 'Le bac',
    title: 'Eau et matériel',
    explanation: 'Le chauffage, la lampe, la pompe, l’eau et les produits qu’on y verse.',
    sections: ['eau'],
    controls: [
      setting('Courant', 'eau', 'La pompe : coupée, douce ou forte.', [
        'pompe',
        'débit',
        'brassage',
      ]),
      setting(
        'Changer l’eau',
        'eau',
        'Remplacer une part de l’eau pour faire baisser les nitrates.',
        ['changement d’eau', 'nitrates', 'vidange'],
      ),
      setting('Chauffage', 'eau', 'La température de consigne de l’eau, en °C.', [
        'température',
        'chauffer',
        'degrés',
      ]),
      setting(
        'Éclairage',
        'eau',
        'La durée d’éclairage par jour ; au-delà de 10 h, les algues poussent.',
        ['lumière', 'lampe', 'durée', 'algues'],
      ),
      setting('Lampe', 'eau', 'L’heure d’allumage de la lampe.', [
        'lumière',
        'allumage',
        'éclairage',
      ]),
      setting('Bactéries', 'eau', 'Une amorce de bactéries pour un filtre neuf.', [
        'filtre',
        'amorce',
        'cycle',
      ]),
      setting('Robinet', 'eau', 'Verser de l’eau du robinet, chlorée.', [
        'eau du robinet',
        'chlore',
      ]),
      setting('Déchlorer', 'eau', 'Un conditionneur qui retire le chlore de l’eau.', [
        'chlore',
        'conditionneur',
      ]),
      setting('Liant', 'eau', 'Un produit qui fixe l’ammoniaque.', ['ammoniaque', 'conditionneur']),
      setting('Charbon', 'eau', 'Le charbon actif du filtre, qui retire les produits dissous.', [
        'charbon actif',
        'filtre',
      ]),
      setting('pH −', 'eau', 'Faire baisser le pH. Effets simplifiés.', ['acide', 'ph']),
      setting('pH +', 'eau', 'Faire monter le pH. Effets simplifiés.', ['basique', 'ph']),
      setting(
        'Feuilles de catappa',
        'eau',
        'Des feuilles qui teintent l’eau et la rendent plus acide.',
        ['eau noire', 'catappa', 'ph'],
      ),
    ],
  },
  {
    id: 'soins',
    group: 'Le bac',
    title: 'Soins et produits',
    explanation:
      'Les traitements des points blancs, proposés quand un animal en montre. Effets simplifiés.',
    sections: ['soins'],
    controls: [
      setting(
        'Traitements des points blancs',
        'soins',
        'Chaleur, sel ou médicament contre les points blancs.',
        ['maladie', 'malade', 'médicament', 'sel', 'soigner'],
      ),
    ],
  },
  {
    id: 'decor',
    group: 'Le bac',
    title: 'Décor',
    explanation: 'Ce qui orne le bac et la façon dont les granulés sont dessinés.',
    sections: ['decor'],
    controls: [
      setting('Éditer le décor', 'decor', 'Déplacer les pierres, les plantes et les ornements.', [
        'plantes',
        'pierres',
        'déplacer',
      ]),
      setting('Afficher le décor', 'decor', 'Montrer ou cacher le décor du bac.', ['cacher']),
      setting('Granulés', 'decor', 'La nourriture dessinée en voxels ou en points.', [
        'nourriture',
        'voxels',
        'points',
      ]),
    ],
  },
  {
    id: 'temps',
    group: 'Simulation',
    title: 'Temps',
    explanation: 'La vitesse de la simulation et l’heure de la journée.',
    sections: ['simulation', 'journee'],
    controls: [
      setting('Vitesse de la simulation', 'simulation', 'Pause, ×0,5, ×1, ×2 ou ×4.', [
        'pause',
        'accélérer',
        'ralentir',
      ]),
      setting('Mode immersif', 'simulation', 'La vue suit le regard, à la façon d’une fenêtre.', [
        'immersion',
      ]),
      setting('Heure', 'journee', 'L’heure de la journée dans le bac.', [
        'lumière',
        'jour',
        'nuit',
        'heure de la journée',
      ]),
      setting('Heure automatique', 'journee', 'L’heure avance seule, au rythme de la simulation.', [
        'horloge',
        'jour',
        'nuit',
      ]),
      setting('Pluie', 'journee', 'La pluie sur le bassin.', ['météo', 'averse']),
    ],
  },
  {
    id: 'son',
    group: 'Préférences',
    title: 'Son',
    explanation: 'Les sons d’ambiance de la pièce et leur volume.',
    sections: ['son'],
    controls: [
      setting('Sons d’ambiance', 'son', 'Le bruit de l’eau et de la pompe.', [
        'audio',
        'bruit',
        'muet',
      ]),
      setting('Volume', 'son', 'Le volume des sons d’ambiance.', ['audio', 'fort']),
    ],
  },
  {
    id: 'accessibilite',
    group: 'Préférences',
    title: 'Accessibilité',
    explanation: 'Moins de mouvements à l’écran, pour un regard reposé.',
    sections: ['accessibilite'],
    controls: [
      setting('Réduire les mouvements', 'accessibilite', 'Moins d’animations dans l’interface.', [
        'animations',
        'mouvement',
      ]),
    ],
  },
  {
    id: 'sauvegarde',
    group: 'Données',
    title: 'Sauvegarde et partage',
    explanation: 'Le bac s’enregistre tout seul ; on peut aussi le partager ou le copier.',
    sections: ['sauvegarde'],
    controls: [
      setting('Partager ce bac', 'sauvegarde', 'Un lien qui ouvre ce bac chez quelqu’un d’autre.', [
        'lien',
        'partage',
      ]),
      setting('Exporter', 'sauvegarde', 'Enregistrer le bac dans un fichier.', [
        'fichier',
        'sauvegarder',
        'copie',
      ]),
      setting('Importer', 'sauvegarde', 'Ouvrir un bac enregistré dans un fichier.', [
        'fichier',
        'charger',
        'ouvrir',
      ]),
    ],
  },
];

/** Catégorie ouverte à la première ouverture de la fenêtre. */
export const DEFAULT_SETTINGS_CATEGORY: SettingsCategoryId = 'bac';

/** Catégorie d'identifiant `id` (toujours déclarée : le type le garantit). */
export function settingsCategory(id: SettingsCategoryId): SettingsCategory {
  const category = SETTINGS_CATEGORIES.find((entry) => entry.id === id);
  if (category === undefined) {
    throw new RangeError(`Catégorie de réglages inconnue : ${String(id)}`);
  }
  return category;
}

/** Catégories d'un groupe, dans l'ordre de la liste. */
export function categoriesOf(group: SettingsGroup): readonly SettingsCategory[] {
  return SETTINGS_CATEGORIES.filter((category) => category.group === group);
}

/**
 * Catégorie voisine dans la liste (flèches haut et bas) : `delta` = −1 ou +1, en boucle d'un
 * bout à l'autre, groupes enchaînés.
 */
export function neighbourCategory(id: SettingsCategoryId, delta: -1 | 1): SettingsCategoryId {
  const index = SETTINGS_CATEGORIES.findIndex((category) => category.id === id);
  const count = SETTINGS_CATEGORIES.length;
  return SETTINGS_CATEGORIES[(index + delta + count) % count].id;
}
