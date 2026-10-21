import type { Object3D } from 'three';

/**
 * Couche d'objets de la scène que la vue (`AquariumView`) ajoute à la scène et libère avec
 * elle.
 */
export interface SceneLayer {
  /** Racine de la couche, ajoutée à la scène. */
  readonly object: Object3D;
  /** Libère géométries et matériaux (la couche n'est plus utilisée ensuite). */
  dispose(): void;
}

/**
 * Couche d'effet animé (issue #125) : posée au temps simulé, tirée de la graine du monde,
 * en couleurs plates assombries la nuit (`render/night-shade.ts`). La vue les parcourt dans
 * une liste (`updateDecor`, `updateLight`, `setDecor`, `dispose`) au lieu d'appels nommés un
 * à un : un nouvel effet qui suit ce contrat n'ajoute qu'une entrée à la liste.
 *
 * Bulles et pluie le suivent. Les couches dont les signatures diffèrent restent hors liste
 * plutôt que d'être tordues pour y entrer : nénuphars (`update(time, frémissement)`,
 * `setTint`), décor (`setTint`, `setDecor`), reflets (`setDaylight`), nourriture (posée
 * d'après le monde, pas d'après le temps).
 */
export interface EffectLayer extends SceneLayer {
  /** Pose l'effet au temps simulé `time`, en secondes (jamais l'horloge murale). */
  update(time: number): void;
  /** Luminosité des couleurs plates : 1 en plein jour (couleurs d'origine, exactement). */
  setBrightness(factor: number): void;
  /** Graine du monde affiché : à appeler une fois par monde. */
  setSeed(seed: number): void;
}

/**
 * Pose au temps `time` les couches **affichées** de `layers`, dans l'ordre de la liste. Une
 * couche masquée (`object.visible` faux : bulles hors du bac tropical, pluie arrêtée) n'est
 * pas posée : elle ne calcule rien tant qu'on ne la voit pas.
 */
export function updateVisibleEffects(layers: readonly EffectLayer[], time: number): void {
  for (const layer of layers) {
    if (layer.object.visible) {
      layer.update(time);
    }
  }
}
