import type { SpeciesId } from './species';

/**
 * Statut légal en France et liste d'exclusion (issue #269, ADR 0062).
 *
 * Données pures, sans rendu ni hasard. Le droit a été lu à partir de `docs/ESPECES.md`
 * (arrêté du 8 octobre 2018 modifié par l'arrêté du 5 septembre 2025, sans la version
 * consolidée de Légifrance) : tant qu'un statut n'est pas confirmé à la source consolidée
 * (`confirmed: false`), l'affichage dit « à vérifier auprès de la DDPP ». Ce n'est pas un avis
 * juridique.
 */

/** Régime de détention d'un particulier en France. */
export type LegalRegime =
  'sans-formalite' | 'declaration' | 'certificat' | 'interdit' | 'a-verifier';

/** Niveau de confiance d'une information (`docs/ESPECES.md`, « Comment l'utiliser »). */
export type Confidence = 'elevee' | 'moyenne' | 'faible' | 'non-verifie';

/** Statut légal d'une espèce du jeu. */
export interface LegalStatus {
  readonly regime: LegalRegime;
  /**
   * Effectif détenu sans formalité au plus (régime `sans-formalite`), `null` si le texte n'en
   * fixe pas ou si le régime est autre.
   */
  readonly maxWithoutFormality: number | null;
  readonly confidence: Confidence;
  /** Vrai seulement si le statut a été confirmé sur la version consolidée du texte. */
  readonly confirmed: boolean;
  /** Référence consultable (texte, base, document du dépôt), jamais vide. */
  readonly reference: string;
  /** Précision affichée sous le régime (vide si aucune). */
  readonly note: string;
}

/** Arrêté de 2018 modifié, tel que résumé par `docs/ESPECES.md` (version consolidée non lue). */
const ARRETE_2018 =
  'arrêté du 8 octobre 2018 modifié le 5 septembre 2025, annexe 2 (via docs/ESPECES.md)';
const ESPECES = 'docs/ESPECES.md';

function legal(
  regime: LegalRegime,
  confidence: Confidence,
  reference: string,
  note = '',
  maxWithoutFormality: number | null = null,
): LegalStatus {
  return Object.freeze({
    regime,
    maxWithoutFormality: regime === 'sans-formalite' ? maxWithoutFormality : null,
    confidence,
    confirmed: false,
    reference,
    note,
  });
}

/**
 * Statut légal de chaque espèce ; le type impose une entrée pour toute nouvelle espèce.
 * Aucun statut n'est confirmé à la source consolidée pendant les cycles 84 et 86 (ADR 0062,
 * ADR 0064).
 */
export const LEGAL_STATUS: Readonly<Record<SpeciesId, LegalStatus>> = {
  neon: legal('a-verifier', 'non-verifie', ESPECES, 'aucune ligne de l’annexe 2 vérifiée'),
  guppy: legal('a-verifier', 'non-verifie', ESPECES, 'aucune ligne de l’annexe 2 vérifiée'),
  corydora: legal('a-verifier', 'non-verifie', ESPECES, 'aucune ligne de l’annexe 2 vérifiée'),
  koi: legal('a-verifier', 'non-verifie', ESPECES, 'statut de la forme domestique non vérifié'),
  axolotl: legal(
    'sans-formalite',
    'moyenne',
    `${ARRETE_2018} : « Autres Caudata »`,
    'certificat de capacité au-delà ; ne jamais relâcher',
    40,
  ),
  // Bombina orientalis (#270, ADR 0064) : ligne « Autres Anoures » de docs/ESPECES.md
  // appliquée à une espèce exotique, hors CITES et hors protection française ; cette lecture
  // n'a pas été confirmée sur le texte consolidé, d'où la confiance faible.
  grenouille: legal(
    'sans-formalite',
    'faible',
    `${ARRETE_2018} : « Autres Anoures » (application à Bombina orientalis non vérifiée)`,
    'certificat de capacité au-delà ; Bombina variegata (indigène) exclu ; ne jamais relâcher',
    40,
  ),
  triton: legal(
    'sans-formalite',
    'moyenne',
    `${ARRETE_2018} : « Autres Caudata »`,
    'certificat de capacité au-delà ; préférer les sujets nés en captivité ; ne jamais relâcher',
    40,
  ),
  clown: legal('a-verifier', 'non-verifie', ESPECES, 'aucune ligne de l’annexe 2 vérifiée'),
  chirurgien: legal('a-verifier', 'non-verifie', ESPECES, 'aucune ligne de l’annexe 2 vérifiée'),
  // Lot 1 d'eau douce (#238, ADR 0070) : aucune ligne de l'annexe 2 lue pour ces espèces.
  rasbora: legal('a-verifier', 'non-verifie', ESPECES, 'aucune ligne de l’annexe 2 vérifiée'),
  tetra: legal('a-verifier', 'non-verifie', ESPECES, 'aucune ligne de l’annexe 2 vérifiée'),
  kuhli: legal('a-verifier', 'non-verifie', ESPECES, 'aucune ligne de l’annexe 2 vérifiée'),
  gourami: legal('a-verifier', 'non-verifie', ESPECES, 'aucune ligne de l’annexe 2 vérifiée'),
};

/** Statut légal de l'espèce `id` (figé, partagé). */
export function legalStatus(id: SpeciesId): LegalStatus {
  return LEGAL_STATUS[id];
}

const CONFIDENCE_LABELS: Readonly<Record<Confidence, string>> = {
  elevee: 'confiance élevée',
  moyenne: 'confiance moyenne',
  faible: 'confiance faible',
  'non-verifie': 'non vérifié',
};

/** Texte du niveau de confiance (« confiance moyenne », « non vérifié »). */
export function confidenceText(confidence: Confidence): string {
  return CONFIDENCE_LABELS[confidence];
}

/** Phrase de prudence tant qu'un statut n'est pas confirmé. */
export const DDPP_NOTICE = 'à vérifier auprès de la DDPP';

/** Texte affiché d'un statut légal : régime, précision, puis la prudence s'il n'est pas confirmé. */
export function legalText(status: LegalStatus): string {
  const parts: string[] = [];
  switch (status.regime) {
    case 'sans-formalite':
      parts.push(
        status.maxWithoutFormality === null
          ? 'sans formalité'
          : `sans formalité jusqu’à ${status.maxWithoutFormality} individus`,
      );
      break;
    case 'declaration':
      parts.push('déclaration avant l’acquisition');
      break;
    case 'certificat':
      parts.push('certificat de capacité dès le premier individu');
      break;
    case 'interdit':
      parts.push('détention interdite');
      break;
    case 'a-verifier':
      parts.push('statut non établi');
      break;
  }
  if (status.note !== '') {
    parts.push(status.note);
  }
  if (!status.confirmed) {
    parts.push(DDPP_NOTICE);
  }
  return parts.join(' ; ');
}

/** Motif d'exclusion du catalogue. */
export type ExclusionReason =
  'interdit' | 'liste-union' | 'certificat-des-un' | 'indigene-protegee';

/** Taxon que le jeu ne propose jamais. */
export interface Exclusion {
  /** Nom scientifique : « Genre espèce », ou « Genre » pour tout un genre. */
  readonly taxon: string;
  readonly reason: ExclusionReason;
  readonly reference: string;
}

const UNION =
  'règlement (UE) 1143/2014, liste de l’Union (règlement d’exécution 2016/1141 et suivants)';
const INDIGENES =
  'arrêté du 8 janvier 2021 (amphibiens et reptiles protégés de métropole, via docs/ESPECES.md)';

/**
 * Liste d'exclusion : un taxon y figure s'il est interdit de détention, inscrit sur la liste
 * de l'Union, soumis à certificat de capacité dès le premier individu, ou indigène protégé.
 * Liste de précaution, non exhaustive : une espèce absente n'est pas pour autant autorisée.
 */
export const EXCLUSIONS: readonly Exclusion[] = Object.freeze(
  (
    [
      {
        taxon: 'Xenopus laevis',
        reason: 'interdit',
        reference: `arrêté du 14 février 2018 ; ${UNION} (règlement d’exécution 2022/1203)`,
      },
      { taxon: 'Xenopus', reason: 'certificat-des-un', reference: `${ARRETE_2018} : Pipidae` },
      {
        taxon: 'Hymenochirus',
        reason: 'certificat-des-un',
        reference: `${ARRETE_2018} : Pipidae (lecture littérale non confirmée)`,
      },
      { taxon: 'Triturus', reason: 'certificat-des-un', reference: ARRETE_2018 },
      { taxon: 'Pseudorasbora parva', reason: 'liste-union', reference: UNION },
      { taxon: 'Procambarus clarkii', reason: 'liste-union', reference: UNION },
      { taxon: 'Trachemys scripta', reason: 'liste-union', reference: UNION },
      { taxon: 'Lithobates catesbeianus', reason: 'liste-union', reference: UNION },
      { taxon: 'Salamandra salamandra', reason: 'indigene-protegee', reference: INDIGENES },
      { taxon: 'Lissotriton helveticus', reason: 'indigene-protegee', reference: INDIGENES },
      { taxon: 'Ichthyosaura alpestris', reason: 'indigene-protegee', reference: INDIGENES },
      { taxon: 'Hyla arborea', reason: 'indigene-protegee', reference: INDIGENES },
      { taxon: 'Bombina variegata', reason: 'indigene-protegee', reference: INDIGENES },
      { taxon: 'Bufo bufo', reason: 'indigene-protegee', reference: INDIGENES },
    ] satisfies Exclusion[]
  ).map((entry) => Object.freeze(entry)),
);

/** Nom scientifique normalisé : espaces réduits, minuscules, sans auteur ni parenthèses. */
function normalized(name: string): string[] {
  return name
    .replace(/\(.*?\)/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
}

/**
 * Exclusion qui frappe le nom scientifique `scientificName` (« Genre espèce » ; sous-espèce,
 * auteur et casse ignorés), ou `null`. Une exclusion d'espèce prime sur celle de son genre.
 */
export function exclusionOf(scientificName: string): Exclusion | null {
  const words = normalized(scientificName);
  if (words.length === 0) {
    return null;
  }
  const [genus, species] = words;
  let byGenus: Exclusion | null = null;
  for (const entry of EXCLUSIONS) {
    const [g, s] = normalized(entry.taxon);
    if (g !== genus) {
      continue;
    }
    if (s === undefined) {
      byGenus ??= entry;
    } else if (s === species) {
      return entry;
    }
  }
  return byGenus;
}

/** Vrai si le jeu ne doit jamais proposer `scientificName`. */
export function isExcluded(scientificName: string): boolean {
  return exclusionOf(scientificName) !== null;
}
