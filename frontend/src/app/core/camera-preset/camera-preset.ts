/**
 * Points de vue nommés de la caméra (dessus, dessous, face, côté, trois-quarts), dans un
 * module neutre (#97) : la simulation (`sim/environment.ts`, vue par défaut d'un
 * environnement), le contrat de capture (`core/capture`), le rendu et l'interface les
 * partagent sans que `sim/` dépende du contrat de capture.
 *
 * Ce module est volontairement pur (aucune dépendance à Angular ni à Three.js).
 */

export const CAMERA_PRESETS = ['top', 'bottom', 'front', 'side', 'three-quarter'] as const;

export type CameraPreset = (typeof CAMERA_PRESETS)[number];
