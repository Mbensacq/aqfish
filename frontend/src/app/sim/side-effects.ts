import type { PharmacyProduct } from './pharmacy';
import type { WaterState } from './water';

/**
 * Effets secondaires des produits de la pharmacie (issue #549, ADR 0126) : chaque produit
 * déclare ce qu'il abîme (plantes, invertébrés, filtre biologique), affiché avant le geste,
 * et la simulation l'applique. Pur et déterministe : aucun hasard, aucune horloge.
 *
 * Effets simulés (`docs/SOINS.md` § 12) :
 * - **sel → plantes** : la pousse des plantes à tige ralentit de `SALT_PLANT_SLOWDOWN` par g/L
 *   (moitié moins vite à 5 g/L). La sensibilité des plantes au sel vient de sources amateurs,
 *   non vérifiée ; le chiffre est une **approximation de jeu** ;
 * - **médicament → filtre** : un filtre encore jeune (en maturation) mûrit
 *   `MEDICATION_FILTER_SLOWDOWN` moins vite tant que le médicament est dans l'eau. Le Merck
 *   juge l'effet du formol à dose de traitement minime : ralentissement modéré, **approximation
 *   de jeu** ; un filtre déjà mûr n'est pas touché ;
 * - **sel et médicament → invertébrés** : refusés quand le bac en compte (`sim/treatment.ts`,
 *   prudence, non vérifié).
 *
 * Sans effet déclaré (conditionneur, amorce, charbon, régulateur de pH, catappa), rien ne
 * change ; sans sel ni médicament dans l'eau, les facteurs valent exactement 1.
 */

/** Élément du bac que peut abîmer un produit. */
export type SideEffectTarget = 'plantes' | 'invertebres' | 'filtre';

/** Libellé affiché de chaque élément. */
export const SIDE_EFFECT_TARGET_LABELS: Readonly<Record<SideEffectTarget, string>> = {
  plantes: 'Plantes',
  invertebres: 'Invertébrés',
  filtre: 'Filtre',
};

/** Effet secondaire déclaré d'un produit. */
export interface SideEffect {
  readonly target: SideEffectTarget;
  /** Effet en clair, court (« pousse ralentie »). */
  readonly text: string;
  /** Source consultable ; `null` : approximation de jeu. */
  readonly source: string | null;
}

/** Ralentissement de la pousse des plantes par g/L de sel. Approximation de jeu. */
export const SALT_PLANT_SLOWDOWN = 0.1;
/** Ralentissement de la maturation du filtre avec du médicament dans l'eau. Approximation de jeu. */
export const MEDICATION_FILTER_SLOWDOWN = 0.25;

const INVERTEBRATES_REFUSED: SideEffect = {
  target: 'invertebres',
  text: 'toxique, refusé si le bac en compte',
  source: 'prudence, non vérifié : docs/SOINS.md § 12',
};

/** Effets secondaires déclarés, par produit ; un produit absent n'en a pas. */
export const SIDE_EFFECTS: Readonly<Partial<Record<PharmacyProduct, readonly SideEffect[]>>> = {
  medicament: [
    { target: 'filtre', text: 'un filtre jeune mûrit 25 % moins vite', source: null },
    INVERTEBRATES_REFUSED,
  ],
  sel: [
    { target: 'plantes', text: 'pousse ralentie de 10 % par g/L', source: null },
    INVERTEBRATES_REFUSED,
  ],
};

/** Effets secondaires de `product` (liste vide s'il n'en déclare pas). */
export function sideEffectsOf(product: PharmacyProduct): readonly SideEffect[] {
  return SIDE_EFFECTS[product] ?? [];
}

/** Un effet en une ligne : « Filtre : un filtre jeune mûrit 25 % moins vite (approximation de jeu) ». */
export function sideEffectText(effect: SideEffect): string {
  const source = effect.source ?? 'approximation de jeu';
  return `${SIDE_EFFECT_TARGET_LABELS[effect.target]} : ${effect.text} (${source})`;
}

/** Avertissement d'un produit en une phrase, ou `null` s'il n'a pas d'effet secondaire. */
export function sideEffectWarning(product: PharmacyProduct): string | null {
  const effects = sideEffectsOf(product);
  if (effects.length === 0) {
    return null;
  }
  return `Effets secondaires : ${effects.map(sideEffectText).join(' ; ')}.`;
}

/** Facteur de pousse des plantes dans `water` (1 sans sel, jamais négatif). */
export function plantGrowthFactor(water: Pick<WaterState, 'salt'>): number {
  const salt = water.salt ?? 0;
  if (!(salt > 0)) {
    return 1;
  }
  return Math.max(0, 1 - SALT_PLANT_SLOWDOWN * salt);
}

/** Facteur de maturation du filtre dans `water` (1 sans médicament). */
export function filterMaturationFactor(water: Pick<WaterState, 'medication'>): number {
  const medication = water.medication ?? 0;
  return medication > 0 ? 1 - MEDICATION_FILTER_SLOWDOWN : 1;
}
