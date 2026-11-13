import { statusText, type FieldStatus } from './species-sheet';

/**
 * Pages transversales du wiki, lot 2/2 (issue #291, ADR 0068) : produits et traitements,
 * maladies. Textes tirés de `docs/SOINS.md` (et de `docs/ESPECES.md` pour les maladies
 * propres à une espèce), avec la référence que ces documents indiquent. Ce qui n'y est pas
 * vérifié est écrit « non vérifié », jamais complété.
 *
 * Données pures et figées. Ce n'est pas un avis vétérinaire (`CARE_DISCLAIMER`).
 */

/** Ligne d'une entrée : intitulé et texte. */
export interface GuideLine {
  readonly label: string;
  readonly text: string;
}

/** Entrée d'une page : produit ou maladie. */
export interface GuideEntry {
  /** Identifiant unique dans la page (ancre, suivi des listes). */
  readonly id: string;
  readonly name: string;
  readonly lines: readonly GuideLine[];
  readonly status: FieldStatus;
}

/** Page transversale du wiki. */
export type GuidePage = 'produits' | 'maladies' | 'entretien';

export const GUIDE_PAGES = [
  'produits',
  'maladies',
  'entretien',
] as const satisfies readonly GuidePage[];

export const GUIDE_PAGE_TITLES: Readonly<Record<GuidePage, string>> = {
  produits: 'Produits et traitements',
  maladies: 'Maladies',
  entretien: 'Entretien',
};

/** Rappel affiché en tête des deux pages (`docs/SOINS.md`, recommandation 5). */
export const CARE_DISCLAIMER =
  'Ce jeu n’est pas un avis vétérinaire : un animal réellement malade justifie un vétérinaire.';

function source(reference: string): FieldStatus {
  return Object.freeze({ kind: 'source', reference });
}

function entry(
  id: string,
  name: string,
  lines: readonly (readonly [string, string])[],
  reference: string,
): GuideEntry {
  return Object.freeze({
    id,
    name,
    lines: Object.freeze(lines.map(([label, text]) => Object.freeze({ label, text }))),
    status: source(reference),
  });
}

const S = 'docs/SOINS.md §';

/** Produits et traitements, débutant d'abord (`docs/SOINS.md` §§ 1, 6, 7 et 13). */
const PRODUCTS: readonly GuideEntry[] = [
  entry(
    'conditionneur',
    'Conditionneur au thiosulfate (déchloreur)',
    [
      ['Usage', 'neutraliser le chlore et la chloramine de l’eau du robinet'],
      ['Dose', 'selon l’étiquette'],
      [
        'Risques',
        'avec la chloramine, libère de l’ammoniaque : pic dans un bac sans biofiltre mûr',
      ],
    ],
    `${S} 1.1 (Merck)`,
  ),
  entry(
    'conditionneur-ammoniaque',
    'Conditionneur liant l’ammoniaque',
    [
      ['Usage', 'déchlorer et détoxifier temporairement l’ammoniaque et le nitrite'],
      ['Dose', '5 mL pour 200 L (étiquette reproduite par des revendeurs)'],
      ['Risques', 'fausse lecture élevée d’ammoniaque avec les tests de Nessler'],
    ],
    `${S} 1.1 (étiquette Seachem via revendeurs, secondaire ; UF/IFAS FA16)`,
  ),
  entry(
    'bacteries',
    'Bactéries nitrifiantes en bouteille',
    [
      ['Usage', 'accélérer le cyclage d’un bac neuf (6 à 8 semaines sans aide)'],
      ['Risques', 'efficacité variable, non vérifiée de façon indépendante'],
      [
        'Dans le jeu',
        'bouton « Bactéries » des réglages : 7 journées simulées (étiquette Stability), gain du filtre en approximation de jeu',
      ],
    ],
    `${S} 1.1 et § 14 (étiquettes via revendeurs, secondaire ; UF/IFAS)`,
  ),
  entry(
    'tests',
    'Tests d’eau (réactifs ou bandelettes)',
    [
      ['Usage', 'mesurer ammoniaque, nitrite, nitrate, pH, KH, GH, chlore, cuivre'],
      ['Conseil', 'pour l’ammoniaque, préférer le salicylate au Nessler'],
      ['Non vérifié', 'fiabilité comparée des bandelettes et des réactifs'],
      [
        'Dans le jeu',
        'kits pH, ammoniaque, nitrites, nitrates et dureté dans la pharmacie : résultat après 10 s simulées, arrondi aux paliers de couleur du kit (approximation de jeu)',
      ],
    ],
    `${S} 1.5 et § 6 (UF/IFAS FA16 ; Merck)`,
  ),
  entry(
    'charbon',
    'Charbon actif',
    [
      ['Usage', 'retirer médicaments, colorants, tanins et chlore'],
      ['Risques', 'à retirer du filtre pendant tout traitement : il retire le médicament'],
    ],
    `${S} 1.5 et § 6 (Merck ; PubMed 18817004)`,
  ),
  entry(
    'sel',
    'Sel non iodé',
    [
      ['Usage', 'parasites externes, stress, protection contre le nitrite'],
      ['Dose', '0,1 à 0,3 % pour un transport ; 0,5 à 1 % en bain de plusieurs heures'],
      ['Risques', 'tétras (néons) et poissons électriques le tolèrent mal ; il ne s’évapore pas'],
    ],
    `${S} 1.3 (UF/IFAS VM86 ; Merck)`,
  ),
  entry(
    'catappa',
    'Feuilles de catappa',
    [
      ['Usage', 'tanins, légère acidification, eau ambrée'],
      ['Dose', '1 à 2 feuilles pour 20 L'],
      ['Effet', 'modeste, amorti par le KH ; fort seulement en eau peu tamponnée'],
    ],
    `${S} 1.2 (Seachem ; Nugroho et al.)`,
  ),
  entry(
    'bicarbonate',
    'Bicarbonate de sodium',
    [
      ['Usage', 'remonter le KH et le pH'],
      ['Dose', 'environ 30 mg/L par degré de KH (calcul, pas une dose d’étiquette)'],
      ['Risques', 'un pH plus haut rend l’ammoniaque plus toxique'],
    ],
    `${S} 1.2 (calcul stœchiométrique)`,
  ),
  entry(
    'praziquantel',
    'Praziquantel',
    [
      ['Usage', 'vers plats des branchies et de la peau, cestodes'],
      ['Dose', '5 mg/L en bain prolongé'],
      ['Risques', 'large marge de sécurité rapportée ; sans effet sur les crustacés parasites'],
    ],
    `${S} 1.4 et § 5.5 (Merck)`,
  ),
  entry(
    'formol',
    'Formol',
    [
      ['Usage', 'protozoaires, vers plats, oomycètes'],
      ['Dose', '15 à 25 mg/L en bain prolongé ; demi-dose pour les espèces sensibles'],
      ['Risques', 'cancérogène ; consomme l’oxygène (aérer) ; jamais gardé sous 7 °C'],
    ],
    `${S} 1.4 et § 14 (Merck ; UF/IFAS FA006)`,
  ),
  entry(
    'cuivre',
    'Cuivre (sulfate de cuivre, cuivre aminé)',
    [
      ['Usage', 'points blancs et autres protozoaires'],
      [
        'Risques',
        'toxique pour invertébrés, escargots, coraux et amphibiens ; jamais en eau douce peu tamponnée (alcalinité sous 50 mg/L)',
      ],
    ],
    `${S} 1.4 et § 14 (Merck ; Texas A&M)`,
  ),
  entry(
    'antibiotiques',
    'Antibiotiques et métronidazole',
    [
      ['Usage', 'infections bactériennes, flagellés intestinaux'],
      ['Statut en France', 'sur ordonnance (règlement UE 2019/6) ; diagnostic nécessaire'],
    ],
    `${S} 1.4 et § 7 (Merck ; Vetofish)`,
  ),
  entry(
    'melaleuca',
    'Huile de mélaleuca (« antibactérien naturel »)',
    [
      ['Usage', 'vendu contre les infections'],
      ['Preuve', 'efficacité non démontrée dans les sources consultées : une croyance'],
    ],
    `${S} 1.4 (étiquette API, DailyMed)`,
  ),
];

/** Maladies : symptômes, causes, gestes (`docs/SOINS.md` § 5, `docs/ESPECES.md`). */
const DISEASES: readonly GuideEntry[] = [
  entry(
    'points-blancs',
    'Points blancs (Ichthyophthirius)',
    [
      ['Symptômes', 'points blancs sur la peau et les nageoires ; mortalité soudaine élevée'],
      ['Cause', 'protozoaire ; un traitement ne tue que les formes libres'],
      [
        'Gestes',
        'traitements répétés (formol, ou sel 5 g/L une semaine à 24 °C au moins si l’espèce le tolère) ; ne pas arrêter dès que les points disparaissent',
      ],
    ],
    `${S} 5.1 et § 14 (Merck ; Texas A&M CIR920 ; UF/IFAS FA006)`,
  ),
  entry(
    'velours',
    'Velours (Oodinium)',
    [
      [
        'Symptômes',
        'voile fin doré ou poussière dorée sur la peau et les nageoires (description d’usage, non vérifiée)',
      ],
      ['Cause', 'parasite (dinoflagellé), contagieux ; favorisé par le stress'],
      [
        'Dans le jeu',
        'apparaît dans une eau instable et passe lentement d’un poisson à l’autre ; seul le médicament le fait reculer, le sel et la chaleur des points blancs n’y font rien ; délais : approximation de jeu',
      ],
      [
        'Gestes',
        'en mer : cuivre libre 0,15 à 0,20 mg/L ; en eau douce : traitements spécifiques non vérifiés, suivre la notice d’un produit contre le velours',
      ],
    ],
    `${S} 5.2 (UF/IFAS FA165)`,
  ),
  entry(
    'protozoaires',
    'Costia, Chilodonella, Trichodina',
    [
      [
        'Symptômes',
        'respiration rapide, bouche en surface, excès de mucus, frottements, amaigrissement',
      ],
      ['Cause', 'protozoaires externes'],
      [
        'Gestes',
        'formol ou sulfate de cuivre en eau douce ; sel 0,5 à 1 % en bain de plusieurs heures',
      ],
    ],
    `${S} 5.3 (Merck ; UF/IFAS)`,
  ),
  entry(
    'vers-plats',
    'Vers plats (Dactylogyrus, Gyrodactylus)',
    [
      ['Symptômes', 'excès de mucus, frottements, amaigrissement ; koïs prédisposées'],
      ['Cause', 'vers parasites des branchies et de la peau'],
      ['Gestes', 'praziquantel 5 mg/L en bain prolongé ; formol en alternative'],
    ],
    `${S} 5.4 (Merck)`,
  ),
  entry(
    'crustaces',
    'Vers de l’ancre et poux (Lernaea, Argulus)',
    [
      ['Symptômes', 'non vérifié'],
      ['Cause', 'crustacés parasites à stades libres'],
      [
        'Gestes',
        'lufénuron (cas clinique chez la koï), qui tue aussi les crevettes ; le praziquantel n’agit pas',
      ],
    ],
    `${S} 5.5 (Merck ; Mayer et al. 2013)`,
  ),
  entry(
    'champignons',
    'Champignons (Saprolegnia)',
    [
      [
        'Symptômes',
        'touffes blanches cotonneuses sur la peau ou les nageoires (description d’usage, non vérifiée)',
      ],
      [
        'Cause',
        'oomycètes opportunistes : peau abîmée, animal affaibli ; favorisés par une température basse ou inadaptée',
      ],
      [
        'Dans le jeu',
        'jamais sur un animal sain : seulement sur un animal blessé (points blancs, nageoires effilochées, velours) ou affaibli ; le médicament dans une eau propre les fait reculer, le sel et la chaleur n’y font rien ; délais : approximation de jeu',
      ],
      [
        'Gestes',
        'formol (une certaine efficacité) ; acriflavine ; soigner la cause (eau, blessure)',
      ],
    ],
    `${S} 5.6 et § 5.12 (Merck ; notice Sera)`,
  ),
  entry(
    'aeromonas',
    'Aeromonas, pourriture des nageoires',
    [
      [
        'Symptômes',
        'taches de sang, ulcères, abdomen gonflé (écailles en pomme de pin), nageoires effilochées, yeux exorbités',
      ],
      ['Cause', 'bactérie la plus courante en eau douce ; stress et mauvaise eau'],
      [
        'Dans le jeu',
        'nageoires effilochées quand l’ammoniaque ou les nitrites restent trop hauts ; elles repoussent une fois l’eau corrigée, sans médicament ; délais : approximation de jeu',
      ],
      [
        'Gestes',
        'corriger l’eau d’abord (changements d’eau, moins de nourriture) ; antibiotique choisi par un vétérinaire après un test, sur ordonnance dans l’UE ; hydropisie avancée : pronostic réservé',
      ],
    ],
    `${S} 5.7 (Merck)`,
  ),
  entry(
    'hydropisie',
    'Hydropisie',
    [
      [
        'Symptômes',
        'abdomen gonflé, puis écailles hérissées « en pomme de pin » ; signe d’une infection interne (Aeromonas le plus souvent)',
      ],
      ['Cause', 'stress et mauvaise eau : un poisson affaibli, pas une contagion'],
      [
        'Dans le jeu',
        'seulement chez un poisson affaibli dans une eau où l’ammoniaque ou les nitrites restent trop hauts ; ventre gonflé, puis écailles hérissées ; prise tôt, une eau propre la fait reculer lentement ; au stade avancé, plus de recul ; sel, chaleur et médicament n’y font rien ; délais : approximation de jeu',
      ],
      [
        'Gestes',
        'isoler en quarantaine et corriger l’eau ; vrai traitement par un vétérinaire (antibiotique sur ordonnance dans l’UE) ; stade avancé : pronostic réservé, l’euthanasie sans souffrance se décide avec un vétérinaire',
      ],
    ],
    `${S} 5.7 (Merck)`,
  ),
  entry(
    'columnaris',
    'Columnaris',
    [
      ['Symptômes', 'lésions cotonneuses ou visqueuses, « dos de selle »'],
      ['Cause', 'Flavobacterium columnare ; charge organique, blessures'],
      ['Gestes', 'au début : permanganate ou peroxyde d’hydrogène ; si généralisé : vétérinaire'],
    ],
    `${S} 5.7 (Merck)`,
  ),
  entry(
    'yeux',
    'Exophtalmie, yeux troubles',
    [
      ['Symptômes', 'œil exorbité ou cornée trouble'],
      ['Causes', 'infection, mauvaise eau, sursaturation gazeuse, choc, chlore chronique'],
      [
        'Gestes',
        'selon la cause : aérer, corriger l’eau, vétérinaire ; il n’existe pas de collyre standard pour poissons',
      ],
    ],
    `${S} 5.8 (Merck)`,
  ),
  entry(
    'ammoniaque',
    'Intoxication à l’ammoniaque',
    [
      ['Symptômes', 'léthargie, perte d’appétit, nage convulsive, poisson assombri'],
      ['Cause', 'NH₃ au-delà de 1 mg/L, pH au-dessus de 8 ; bac non cyclé'],
      ['Gestes', 'changer 25 à 50 % de l’eau ; ne pas remonter brutalement le pH'],
    ],
    `${S} 5.11 et § 14 (Merck ; UF/IFAS)`,
  ),
  entry(
    'nitrite',
    'Intoxication au nitrite',
    [
      ['Symptômes', 'bouche en surface, branchies et sang brun foncé'],
      ['Cause', 'nitrite au-delà de 0,1 mg/L'],
      ['Gestes', 'sel (chlorure) et changement d’eau'],
    ],
    `${S} 5.11 (Merck)`,
  ),
  entry(
    'maladie-du-neon',
    'Maladie du néon (microsporidiose)',
    [
      ['Symptômes', 'non vérifié'],
      ['Cause', 'microsporidie ; souche commerciale affaiblie par des années d’élevage'],
      ['Gestes', 'quasi incurable une fois avancée'],
    ],
    'docs/ESPECES.md (néon, Seriously Fish)',
  ),
  entry(
    'khv',
    'Herpèsvirus de la koï (KHV)',
    [
      ['Symptômes', 'fortes mortalités'],
      ['Cause', 'virus dont la koï est porteuse et vectrice'],
      ['Gestes', 'aucun traitement : quarantaine de 4 à 6 semaines avant toute introduction'],
    ],
    'docs/ESPECES.md (koï, USGS) ; docs/SOINS.md § 14 (UC Davis)',
  ),
];

/**
 * Entretien courant (issue #476, `docs/SOINS.md` § 12, « Algues dans le jeu ») : les règles
 * du jeu sont des approximations, dites comme telles.
 */
const MAINTENANCE: readonly GuideEntry[] = [
  entry(
    'algues',
    'Algues vertes sur les vitres',
    [
      ['Causes', 'éclairage trop long (plus de 10 h par jour dans le jeu) ou nitrates élevés'],
      [
        'Gestes',
        'passer la raclette sur les vitres, réduire l’éclairage, changer l’eau pour baisser les nitrates',
      ],
      [
        'Dans le jeu',
        'approximation de jeu : sans lumière, aucune pousse ; la plaque ne recule qu’à la raclette',
      ],
    ],
    `${S} 12 (approximation de jeu ; durée d’éclairage non vérifiée)`,
  ),
  entry(
    'animal-mort',
    'Animal mort',
    [
      [
        'Causes',
        'avec l’option « Mortalité », un animal resté longtemps très affaibli : maladie non soignée, faim, ammoniaque ou nitrites trop hauts',
      ],
      [
        'Éviter',
        'soigner dès les premiers signes, nourrir peu mais régulièrement, garder l’eau propre',
      ],
      [
        'Gestes',
        'retirer le corps à l’épuisette (un clic dessus) : laissé dans l’eau, il fait monter l’ammoniaque',
      ],
    ],
    'approximation de jeu (délais et pollution non vérifiés dans docs/SOINS.md)',
  ),
];

const PAGES: Readonly<Record<GuidePage, readonly GuideEntry[]>> = Object.freeze({
  produits: Object.freeze(PRODUCTS),
  maladies: Object.freeze(DISEASES),
  entretien: Object.freeze(MAINTENANCE),
});

/** Entrées de la page `page`, dans l'ordre d'affichage. */
export function guideEntries(page: GuidePage): readonly GuideEntry[] {
  return PAGES[page];
}

/** Entrée affichée : statut mis en texte. */
export interface GuideView {
  readonly id: string;
  readonly name: string;
  readonly lines: readonly GuideLine[];
  readonly status: string;
}

/** Modèle de vue de la page `page`. */
export function guideView(page: GuidePage): readonly GuideView[] {
  return PAGES[page].map(({ id, name, lines, status }) => ({
    id,
    name,
    lines,
    status: statusText(status),
  }));
}
