import { environmentById, environmentWater, placeEnvironment, type Place } from './environment';
import { lilyPadLayout, type LilyPad, type LilyPadSettings } from './lily-pads';
import type { Box3 } from './tank';

/** Dernière disposition calculée par `worldLilyPads`, avec ses clés (#685). */
let lilyPadMemo: {
  readonly seed: number;
  readonly water: Box3;
  readonly settings: LilyPadSettings;
  readonly pads: readonly LilyPad[];
} | null = null;

/**
 * Nénuphars du monde de graine `seed` au lieu `place` (`lilyPadLayout`), mêmes ancres que ceux
 * du rendu (même graine, même eau) : surfaces de frai du poisson rouge (#675). Liste vide sans
 * nénuphars. La dernière disposition est mémorisée (graine, eau et réglages identiques :
 * `environmentWater` renvoie le même objet pour un même lieu), donc pas de recalcul à chaque
 * ponte (#685) ; la liste rendue est gelée et partagée. Prend la graine et le lieu plutôt que
 * le monde pour ne pas dépendre de `sim/world.ts` (#700).
 */
export function worldLilyPads(seed: number, place: Place): readonly LilyPad[] {
  const settings = environmentById(placeEnvironment(place)).lilyPads;
  if (settings === null) {
    return [];
  }
  const water = environmentWater(place);
  const memo = lilyPadMemo;
  if (memo !== null && memo.seed === seed && memo.water === water && memo.settings === settings) {
    return memo.pads;
  }
  const pads = Object.freeze(lilyPadLayout(seed, water, settings));
  lilyPadMemo = { seed, water, settings, pads };
  return pads;
}
