/**
 * Feuilles de catappa (issue #239, ADR 0071) : soin simple déposé dans le bac depuis la
 * section « Eau ». Chaque feuille porte sa **réserve** dans [0, 1] (1 : feuille neuve, 0 :
 * décomposée, sans plus d'effet) ; la réserve baisse linéairement en
 * `CATAPPA_DECAY_SECONDS`. Tant qu'il reste de la réserve, l'eau tire vers un pH plancher,
 * se teinte de brun-thé (une seule teinte, `catappaTint`) et les espèces qui aiment l'eau
 * acide voient leur santé plancher légèrement relevée (`sim/wellbeing.ts`).
 *
 * **Approximation de jeu**, pas de chimie : les tanins ne sont pas un paramètre à part
 * entière ; leur effet est résumé par une approche exponentielle du pH vers
 * `CATAPPA_PH_FLOOR`, de taux proportionnel à la réserve totale et inversement proportionnel
 * au volume d'eau. Aucune valeur n'est tirée d'une source consultée : ordres de grandeur
 * choisis pour être lents, bornés et lisibles en jeu.
 *
 * Fonctions pures, sans hasard ni horloge ; `stepCatappaInPlace` n'alloue rien.
 */

/** Nombre maximal de feuilles dans un bac. */
export const MAX_CATAPPA_LEAVES = 5;

/**
 * Durée de décomposition d'une feuille, en secondes simulées. **Valeur de jeu** : deux heures
 * simulées, soit six journées de 20 min ; la feuille reste ensuite au fond, sans effet, tant
 * qu'on ne la retire pas.
 */
export const CATAPPA_DECAY_SECONDS = 7200;

/**
 * pH plancher vers lequel tirent les feuilles. **Valeur de jeu** : eau douce acide ; les
 * feuilles ne font jamais descendre le pH en dessous (la dérive organique, elle, le peut).
 */
export const CATAPPA_PH_FLOOR = 6;

/**
 * Taux d'approche du plancher pour une feuille neuve dans `CATAPPA_REFERENCE_LITERS` litres,
 * en s⁻¹. **Valeur de jeu** : une feuille seule, sur toute sa décomposition, rapproche le pH
 * du bac tropical par défaut d'environ 40 % de l'écart au plancher (7,0 → 6,6) ; cinq
 * feuilles l'amènent près du plancher.
 */
export const CATAPPA_PH_RATE = 1 / 7200;

/** Volume de référence du taux, en litres : le bac tropical par défaut (288 L). */
export const CATAPPA_REFERENCE_LITERS = 288;

/** Réserve totale des feuilles `leaves` (0 sans feuille ; valeurs non finies ignorées). */
export function catappaStrength(leaves: readonly number[] | undefined): number {
  if (leaves === undefined) {
    return 0;
  }
  let total = 0;
  for (const reserve of leaves) {
    if (reserve > 0 && Number.isFinite(reserve)) {
      total += reserve;
    }
  }
  return total;
}

/** Vrai si au moins une feuille agit encore (réserve non nulle). */
export function catappaActive(leaves: readonly number[] | undefined): boolean {
  return catappaStrength(leaves) > 0;
}

/**
 * Fait décomposer les feuilles `leaves` de `dt` secondes **en les modifiant** : chaque
 * réserve baisse de `dt / CATAPPA_DECAY_SECONDS`, bornée à 0 (une réserve non finie, état
 * corrompu, devient 0). `dt` est supposé validé par l'appelant (`stepWaterInPlace`).
 */
export function stepCatappaInPlace(leaves: number[], dt: number): void {
  const loss = dt / CATAPPA_DECAY_SECONDS;
  for (let i = 0; i < leaves.length; i++) {
    const next = leaves[i] - loss;
    leaves[i] = next > 0 ? next : 0;
  }
}

/**
 * pH après `dt` secondes avec la réserve `strength` (`catappaStrength`) dans `liters` litres :
 * `plancher + (pH − plancher) · e^(−k·dt)`, `k = CATAPPA_PH_RATE · strength ·
 * CATAPPA_REFERENCE_LITERS / liters`. Inchangé sans réserve ou déjà au plancher ou en
 * dessous : les feuilles n'acidifient jamais au-delà du plancher. `dt` et `liters` sont
 * supposés validés par l'appelant.
 */
export function catappaPh(ph: number, strength: number, liters: number, dt: number): number {
  if (!(strength > 0) || !(ph > CATAPPA_PH_FLOOR)) {
    return ph;
  }
  const k = (CATAPPA_PH_RATE * strength * CATAPPA_REFERENCE_LITERS) / liters;
  return CATAPPA_PH_FLOOR + (ph - CATAPPA_PH_FLOOR) * Math.exp(-k * dt);
}

/**
 * Teinte brun-thé de l'eau rendue, 0 ou 1 : un seul palier (`docs/PIEGES.md`, « Opacité
 * partielle et passe palette ») ; 1 dès qu'une feuille agit encore.
 */
export function catappaTint(leaves: readonly number[] | undefined): number {
  return catappaActive(leaves) ? 1 : 0;
}

/**
 * Feuilles après réglage du nombre à `count` (entier dans [0, `MAX_CATAPPA_LEAVES`]) : on
 * ajoute des feuilles neuves (réserve 1) ou on retire d'abord les plus décomposées (réserve
 * la plus basse). Nouveau tableau, dans l'ordre des réserves décroissantes ; `leaves` n'est
 * jamais modifié.
 * @throws RangeError si `count` n'est pas un entier dans [0, `MAX_CATAPPA_LEAVES`].
 */
export function withCatappaCount(leaves: readonly number[] | undefined, count: number): number[] {
  if (!Number.isInteger(count) || count < 0 || count > MAX_CATAPPA_LEAVES) {
    throw new RangeError(
      `nombre de feuilles de catappa dans [0, ${MAX_CATAPPA_LEAVES}] attendu (reçu : ${count})`,
    );
  }
  const sorted = [...(leaves ?? [])].sort((a, b) => b - a);
  while (sorted.length < count) {
    sorted.unshift(1);
  }
  return sorted.slice(0, count);
}

/** Résultat de `readCatappa`. */
export type ReadCatappaResult =
  | { readonly ok: true; readonly leaves: readonly number[] }
  | { readonly ok: false; readonly error: string };

/**
 * Relit les feuilles d'une sauvegarde : tableau d'au plus `MAX_CATAPPA_LEAVES` réserves,
 * nombres finis dans [0, 1]. Renvoie une copie, ou la raison du refus. Ne lève jamais.
 */
export function readCatappa(value: unknown): ReadCatappaResult {
  if (!Array.isArray(value) || value.length > MAX_CATAPPA_LEAVES) {
    return {
      ok: false,
      error: `eau : catappa doit être une liste d'au plus ${MAX_CATAPPA_LEAVES} réserves`,
    };
  }
  for (const reserve of value) {
    if (typeof reserve !== 'number' || !(reserve >= 0 && reserve <= 1)) {
      return { ok: false, error: 'eau : réserve de catappa dans [0, 1] attendue' };
    }
  }
  return { ok: true, leaves: [...(value as number[])] };
}
