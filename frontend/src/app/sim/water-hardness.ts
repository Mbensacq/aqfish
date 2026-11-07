import type { EnvironmentId } from './environment';

/**
 * Dureté de l'eau (issue #484, ADR 0113) : dureté générale (GH, en °dGH) et carbonatée (KH,
 * en °dKH) de chaque bac, valeur de l'eau du robinet du jeu pour chaque environnement, retour
 * vers elle au changement d'eau. Fonctions pures, sans hasard ni allocation par pas.
 *
 * Modèle d'affichage : la dureté ne dérive pas pendant la partie et n'agit ni sur la santé ni
 * sur le pH (pouvoir tampon hors périmètre). Un bac dont la dureté n'est pas écrite dans
 * l'eau (`WaterState.gh`, `WaterState.kh` absents) a celle de l'eau du robinet de son
 * environnement : une sauvegarde antérieure se relit donc sans changement.
 */

/** Dureté d'une eau : générale (GH) et carbonatée (KH). */
export interface Hardness {
  /** Dureté générale, en °dGH (1 °dGH = 17,8 mg/L de CaCO₃, `docs/SOINS.md` § 3). */
  readonly gh: number;
  /** Dureté carbonatée, en °dKH (1 °dKH = 17,8 mg/L de CaCO₃). */
  readonly kh: number;
}

/** Dureté la plus basse acceptée (eau osmosée). */
export const MIN_HARDNESS = 0;
/**
 * Dureté la plus haute acceptée, en degrés allemands : au-dessus de la GH de l'eau de mer du
 * jeu (`TAP_HARDNESS.recif`), pour qu'une sauvegarde de récif se relise.
 */
export const MAX_HARDNESS = 400;

/**
 * Écart à l'eau du robinet en deçà duquel la dureté est considérée comme revenue à celle-ci :
 * le champ disparaît de l'eau (même convention que les traces de sel, `sim/water.ts`).
 */
export const HARDNESS_TRACE = 0.05;

/**
 * Dureté de l'eau du robinet du jeu (et de l'eau neuve d'un bac) dans chaque environnement.
 * **Approximations de jeu** (ADR 0113), sauf le KH du récif : eau du robinet moyennement dure
 * pour le bac tropical (GH 10, dans les plages du guppy, 9–19 dH, FishBase, et du corydoras,
 * 0–12 dGH, Seriously Fish, `docs/SOINS.md` § 11 ; le néon sauvage, dH 1–2, la voudrait bien
 * plus douce), un peu plus dure pour le bassin et le bac d'eau froide, plus douce pour le
 * paludarium. Récif : eau de mer reconstituée, KH 8 dans les 7–11 dKH de Holmes-Farley
 * (`docs/SOINS.md` § 3) ; sa GH, ordre de grandeur du calcium et du magnésium de l'eau de mer
 * (environ 420 et 1 280 mg/L), n'a pas de sens pour les espèces de récif, comparées sur le KH
 * (`sim/species-sheet.ts`). Le type impose une entrée pour tout nouvel environnement.
 */
export const TAP_HARDNESS: Readonly<Record<EnvironmentId, Hardness>> = {
  tropical: Object.freeze({ gh: 10, kh: 6 }),
  bassin: Object.freeze({ gh: 12, kh: 8 }),
  paludarium: Object.freeze({ gh: 8, kh: 5 }),
  recif: Object.freeze({ gh: 350, kh: 8 }),
  eaufroide: Object.freeze({ gh: 14, kh: 8 }),
};

/** Dureté de l'eau du robinet de l'environnement `environment` (objet figé, partagé). */
export function tapHardness(environment: EnvironmentId): Hardness {
  return TAP_HARDNESS[environment];
}

/**
 * Dureté de `water`, bac de l'environnement `environment` : les champs écrits dans l'eau, ou
 * à défaut ceux de l'eau du robinet. Un champ non fini ou hors de [`MIN_HARDNESS`,
 * `MAX_HARDNESS`] (état corrompu) est remplacé par celui de l'eau du robinet.
 */
export function waterHardness(
  water: { readonly gh?: number; readonly kh?: number },
  environment: EnvironmentId,
): Hardness {
  const tap = TAP_HARDNESS[environment];
  const gh = water.gh;
  const kh = water.kh;
  return {
    gh: isHardness(gh) ? gh : tap.gh,
    kh: isHardness(kh) ? kh : tap.kh,
  };
}

/**
 * Dureté après un changement d'eau qui remplace la part `share` (dans [0, 1]) par de l'eau du
 * robinet de dureté `tap` : `value + share · (tap − value)`, bornée à [`MIN_HARDNESS`,
 * `MAX_HARDNESS`] (une valeur non finie devient `tap`).
 */
export function hardnessAfterWaterChange(value: number, tap: number, share: number): number {
  if (!Number.isFinite(value)) {
    return tap;
  }
  const next = value + share * (tap - value);
  return next >= MIN_HARDNESS ? (next <= MAX_HARDNESS ? next : MAX_HARDNESS) : MIN_HARDNESS;
}

/** Vrai si `value` est une dureté acceptée : réel fini dans [`MIN_HARDNESS`, `MAX_HARDNESS`]. */
export function isHardness(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_HARDNESS &&
    value <= MAX_HARDNESS
  );
}
