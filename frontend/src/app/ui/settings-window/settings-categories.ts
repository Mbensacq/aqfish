/**
 * Catégories de la fenêtre « Réglages » (#722, `docs/INTERFACE.md` section 2) : la seule
 * déclaration de ce que contient chaque catégorie. La fenêtre, son inventaire et, au lot 3,
 * l'index de la recherche la lisent toutes ici.
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
  /** Contrôles portés par la catégorie, par leur nom à l'écran (inventaire, recherche). */
  readonly controls: readonly string[];
}

/** Ordre des groupes dans la liste de gauche. */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  'Le bac',
  'Simulation',
  'Préférences',
  'Données',
];

/**
 * Catégories, dans l'ordre de la liste (tableau de `docs/INTERFACE.md`, section 2). Écarts
 * provisoires, repris aux lots suivants : « Pluie » reste dans « Temps » avec la journée tant
 * que « Affichage » n'a pas son contenu (filtre pixel art et « Masquer l'interface », lot 5) ;
 * les produits restent dans la section « Eau » jusqu'à son découpage ; raclette et sécateur
 * passent dans la barre du bas à la tranche 2.
 */
export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  {
    id: 'bac',
    group: 'Le bac',
    title: 'Bac et milieu',
    explanation: 'Le milieu du bac, la pièce autour et les bacs qu’elle contient.',
    sections: ['environnement', 'bacs-meubles', 'bacs'],
    controls: [
      'Environnement',
      'Forme du bassin',
      'Afficher la pièce',
      'Bacs et meubles',
      'Liste des bacs',
      'Renommer',
      'Mode soins ou décor',
      'Transférer à l’épuisette',
      'Quarantaine',
    ],
  },
  {
    id: 'population',
    group: 'Le bac',
    title: 'Population',
    explanation: 'Les animaux du bac, espèce par espèce, avec leur fiche.',
    sections: ['population'],
    controls: ['Nombre par espèce', 'Fiche de l’espèce'],
  },
  {
    id: 'eau',
    group: 'Le bac',
    title: 'Eau et matériel',
    explanation: 'Le chauffage, la lampe, la pompe, l’eau et les produits qu’on y verse.',
    sections: ['eau'],
    controls: [
      'Courant',
      'Changer l’eau',
      'Chauffage',
      'Éclairage',
      'Lampe',
      'Raclette',
      'Sécateur',
      'Bactéries',
      'Robinet',
      'Déchlorer',
      'Liant',
      'Charbon',
      'pH −',
      'pH +',
      'Feuilles de catappa',
    ],
  },
  {
    id: 'soins',
    group: 'Le bac',
    title: 'Soins et produits',
    explanation:
      'Les traitements des points blancs, proposés quand un animal en montre. Effets simplifiés.',
    sections: ['soins'],
    controls: ['Traitements des points blancs'],
  },
  {
    id: 'decor',
    group: 'Le bac',
    title: 'Décor',
    explanation: 'Ce qui orne le bac et la façon dont les granulés sont dessinés.',
    sections: ['decor'],
    controls: ['Éditer le décor', 'Afficher le décor', 'Granulés'],
  },
  {
    id: 'temps',
    group: 'Simulation',
    title: 'Temps',
    explanation: 'La vitesse de la simulation et l’heure de la journée.',
    sections: ['simulation', 'journee'],
    controls: ['Vitesse de la simulation', 'Mode immersif', 'Heure', 'Heure automatique', 'Pluie'],
  },
  {
    id: 'son',
    group: 'Préférences',
    title: 'Son',
    explanation: 'Les sons d’ambiance de la pièce et leur volume.',
    sections: ['son'],
    controls: ['Sons d’ambiance', 'Volume'],
  },
  {
    id: 'accessibilite',
    group: 'Préférences',
    title: 'Accessibilité',
    explanation: 'Moins de mouvements à l’écran, pour un regard reposé.',
    sections: ['accessibilite'],
    controls: ['Réduire les mouvements'],
  },
  {
    id: 'sauvegarde',
    group: 'Données',
    title: 'Sauvegarde et partage',
    explanation: 'Le bac s’enregistre tout seul ; on peut aussi le partager ou le copier.',
    sections: ['sauvegarde'],
    controls: ['Partager ce bac', 'Exporter', 'Importer'],
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
