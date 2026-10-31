import type { CameraPreset } from '../capture/capture-params';

/**
 * Source unique des commandes de l'application (issue #74, ADR 0020) : chaque raccourci
 * clavier et chaque geste de la caméra orbitale est déclaré ici, une seule fois. Les
 * gestionnaires clavier (`ui/view-presets-bar`, `ui/commands-help`) lisent leurs touches
 * dans `KEY_COMMANDS`, la vue (`render/aquarium-view.ts`) règle `OrbitControls` d'après
 * `ORBIT_MOUSE_BUTTONS` et `ORBIT_TOUCHES`, et l'aide-mémoire est généré à partir de ces
 * déclarations. Module pur : ni Angular, ni Three.js.
 */

/** Groupe de l'aide-mémoire, dans l'ordre d'affichage. */
export type CommandGroupId =
  'vues' | 'camera-libre' | 'affichage' | 'heure' | 'nourriture' | 'souris' | 'tactile' | 'aide';

export interface CommandGroup {
  readonly id: CommandGroupId;
  readonly title: string;
}

/** Groupes de l'aide-mémoire, dans l'ordre d'affichage. */
export const COMMAND_GROUPS: readonly CommandGroup[] = [
  { id: 'vues', title: 'Vues' },
  { id: 'camera-libre', title: 'Caméra libre' },
  { id: 'affichage', title: 'Affichage' },
  { id: 'heure', title: 'Heure' },
  { id: 'nourriture', title: 'Nourriture' },
  { id: 'souris', title: 'Souris' },
  { id: 'tactile', title: 'Écran tactile' },
  { id: 'aide', title: 'Aide' },
];

export type KeyCommandId =
  | 'vue-dessus'
  | 'vue-dessous'
  | 'vue-face'
  | 'vue-cote'
  | 'vue-trois-quarts'
  | 'camera-libre'
  | 'pixel-art'
  | 'pluie'
  | 'horloge'
  | 'plein-jour'
  | 'nuit'
  | 'nourrir'
  | 'aide';

/** Raccourci clavier. */
export interface KeyCommand {
  readonly id: KeyCommandId;
  /**
   * Valeur de `KeyboardEvent.key` reconnue, en minuscules : la comparaison est insensible à
   * la casse (`p` et `P`).
   */
  readonly key: string;
  /** Touche telle qu'affichée à l'écran (`P`, `?`). */
  readonly display: string;
  /** Effet de la touche, en français. */
  readonly description: string;
  readonly group: CommandGroupId;
}

/** Tous les raccourcis clavier, dans l'ordre de l'aide-mémoire. */
export const KEY_COMMANDS: readonly KeyCommand[] = [
  { id: 'vue-dessus', key: '1', display: '1', description: 'Vue de dessus', group: 'vues' },
  { id: 'vue-dessous', key: '2', display: '2', description: 'Vue de dessous', group: 'vues' },
  { id: 'vue-face', key: '3', display: '3', description: 'Vue de face', group: 'vues' },
  { id: 'vue-cote', key: '4', display: '4', description: 'Vue de côté', group: 'vues' },
  {
    id: 'vue-trois-quarts',
    key: '5',
    display: '5',
    description: 'Vue trois-quarts',
    group: 'vues',
  },
  {
    id: 'camera-libre',
    key: 'l',
    display: 'L',
    description: 'Entrer en caméra libre ou revenir à l’orbite',
    group: 'camera-libre',
  },
  {
    id: 'pixel-art',
    key: 'p',
    display: 'P',
    description: 'Activer ou couper le filtre pixel art',
    group: 'affichage',
  },
  {
    id: 'pluie',
    key: 'r',
    display: 'R',
    description: 'Pluie dans le bassin : marche ou arrêt',
    group: 'affichage',
  },
  {
    id: 'horloge',
    key: 'h',
    display: 'H',
    description: 'Figer ou reprendre l’heure',
    group: 'heure',
  },
  {
    id: 'plein-jour',
    key: 'j',
    display: 'J',
    description: 'Figer en plein jour (midi)',
    group: 'heure',
  },
  { id: 'nuit', key: 'n', display: 'N', description: 'Figer la nuit (minuit)', group: 'heure' },
  {
    id: 'nourrir',
    key: 'g',
    display: 'G',
    description: 'Nourrir : granulés au centre du bac',
    group: 'nourriture',
  },
  {
    id: 'aide',
    key: '?',
    display: '?',
    description: 'Afficher ou replier cet aide-mémoire',
    group: 'aide',
  },
];

/** Raccourci déclaré pour `id` (lève une erreur si l'identifiant n'est pas déclaré). */
export function keyCommand(id: KeyCommandId): KeyCommand {
  const command = KEY_COMMANDS.find((candidate) => candidate.id === id);
  if (!command) {
    throw new Error(`Commande clavier non déclarée : ${id}`);
  }
  return command;
}

/** Touche (`KeyboardEvent.key`, en minuscules) du raccourci `id`. */
export function commandKey(id: KeyCommandId): string {
  return keyCommand(id).key;
}

/** Raccourci associé à une valeur de `KeyboardEvent.key` (insensible à la casse), `null` sinon. */
export function keyCommandFor(key: string): KeyCommand | null {
  const normalized = key.toLowerCase();
  return KEY_COMMANDS.find((command) => command.key === normalized) ?? null;
}

/** Préréglage de vue de chaque raccourci de vue (touches `1` à `5`). */
export const VIEW_COMMAND_PRESETS: Readonly<
  Record<'vue-dessus' | 'vue-dessous' | 'vue-face' | 'vue-cote' | 'vue-trois-quarts', CameraPreset>
> = {
  'vue-dessus': 'top',
  'vue-dessous': 'bottom',
  'vue-face': 'front',
  'vue-cote': 'side',
  'vue-trois-quarts': 'three-quarter',
};

/** Action de la caméra orbitale (`OrbitControls`). */
export type OrbitAction = 'rotate' | 'dolly' | 'pan';

/** Action de chaque bouton de la souris (appliquée telle quelle par `AquariumView`). */
export const ORBIT_MOUSE_BUTTONS: Readonly<Record<'left' | 'middle' | 'right', OrbitAction>> = {
  left: 'rotate',
  middle: 'dolly',
  right: 'pan',
};

/** Action tactile à un doigt et à deux doigts (appliquée telle quelle par `AquariumView`). */
export const ORBIT_TOUCHES: Readonly<{ one: 'rotate' | 'pan'; two: 'dolly-pan' | 'dolly-rotate' }> =
  {
    one: 'rotate',
    two: 'dolly-pan',
  };

const ORBIT_ACTION_DESCRIPTIONS: Readonly<Record<OrbitAction, string>> = {
  rotate: 'Tourner autour du bac',
  dolly: 'Rapprocher ou éloigner la vue',
  pan: 'Déplacer la vue',
};

const TOUCH_DESCRIPTIONS: Readonly<
  Record<'rotate' | 'pan' | 'dolly-pan' | 'dolly-rotate', string>
> = {
  rotate: ORBIT_ACTION_DESCRIPTIONS.rotate,
  pan: ORBIT_ACTION_DESCRIPTIONS.pan,
  'dolly-pan': 'Pincer pour zoomer, glisser pour déplacer',
  'dolly-rotate': 'Pincer pour zoomer, glisser pour tourner',
};

/** Clic (ou toucher) sans glisser sur l'eau : nourrissage (issue #67, `AquariumView`). */
const FEED_DESCRIPTION = 'Déposer des granulés à cet endroit';

/** Geste de la souris ou de l'écran tactile, tel qu'affiché dans l'aide-mémoire. */
export interface GestureCommand {
  readonly id: string;
  /** Geste, en français (`Molette`, `Clic droit + glisser`). */
  readonly gesture: string;
  readonly description: string;
  readonly group: 'souris' | 'tactile' | 'camera-libre';
}

/** Axe de déplacement de la caméra libre (#343) et sens. */
export type FreeMoveId = 'avancer' | 'reculer' | 'gauche' | 'droite' | 'monter' | 'descendre';

/** Touches de déplacement de la caméra libre, actives seulement dans ce mode (#343). */
export interface FreeMoveCommand {
  readonly id: FreeMoveId;
  /** Valeurs de `KeyboardEvent.key` reconnues, en minuscules (AZERTY, QWERTY, flèches). */
  readonly keys: readonly string[];
}

/** Déplacements de la caméra libre (affichés par `FREE_CAMERA_GESTURES`). */
export const FREE_MOVE_COMMANDS: readonly FreeMoveCommand[] = [
  { id: 'avancer', keys: ['z', 'w', 'arrowup'] },
  { id: 'reculer', keys: ['s', 'arrowdown'] },
  { id: 'gauche', keys: ['q', 'a', 'arrowleft'] },
  { id: 'droite', keys: ['d', 'arrowright'] },
  { id: 'monter', keys: ['e', 'pageup'] },
  { id: 'descendre', keys: ['c', 'pagedown'] },
];

/** Déplacement de la caméra libre associé à une valeur de `KeyboardEvent.key`, `null` sinon. */
export function freeMoveFor(key: string): FreeMoveId | null {
  const normalized = key.toLowerCase();
  return FREE_MOVE_COMMANDS.find((command) => command.keys.includes(normalized))?.id ?? null;
}

/** Consigne de la caméra libre, chaque axe dans [−1, 1] (`render/free-camera.ts`). */
export interface FreeMoveAxes {
  readonly forward: number;
  readonly strafe: number;
  readonly vertical: number;
}

/**
 * Consigne de la caméra libre pour les déplacements enfoncés : deux sens opposés s'annulent.
 * Fonction pure.
 */
export function freeMoveAxes(pressed: ReadonlySet<FreeMoveId>): FreeMoveAxes {
  const axis = (plus: FreeMoveId, minus: FreeMoveId): number =>
    (pressed.has(plus) ? 1 : 0) - (pressed.has(minus) ? 1 : 0);
  return {
    forward: axis('avancer', 'reculer'),
    strafe: axis('droite', 'gauche'),
    vertical: axis('monter', 'descendre'),
  };
}

/**
 * Lignes de l'aide-mémoire de la caméra libre, regroupées pour tenir dans le panneau sans
 * défilement à 1280 × 720 : déplacements dans le plan, hauteur, puis orientation à la souris.
 * Chaque touche de `FREE_MOVE_COMMANDS` y figure (test de `commands.spec.ts`).
 */
export const FREE_CAMERA_GESTURES: readonly GestureCommand[] = [
  {
    id: 'libre-plan',
    gesture: 'ZQSD / ↑↓←→',
    description: 'Avancer, reculer, côtés (WASD aussi)',
    group: 'camera-libre',
  },
  {
    id: 'libre-hauteur',
    gesture: 'E / C',
    description: 'Monter, descendre (Page ↑ / ↓ aussi)',
    group: 'camera-libre',
  },
  {
    id: 'libre-souris',
    gesture: 'Glisser',
    description: 'Orienter la vue',
    group: 'camera-libre',
  },
];

/**
 * Gestes réellement gérés par la caméra orbitale, déduits de `ORBIT_MOUSE_BUTTONS` et
 * `ORBIT_TOUCHES`. La molette zoome toujours. `OrbitControls` transforme en déplacement un
 * glisser de rotation fait avec Maj, Ctrl ou Cmd enfoncée : ce geste n'est listé que si le
 * clic gauche tourne.
 */
export function orbitGestures(
  buttons: typeof ORBIT_MOUSE_BUTTONS = ORBIT_MOUSE_BUTTONS,
  touches: typeof ORBIT_TOUCHES = ORBIT_TOUCHES,
): readonly GestureCommand[] {
  const mouse: GestureCommand[] = [
    {
      id: 'souris-gauche',
      gesture: 'Glisser',
      description: ORBIT_ACTION_DESCRIPTIONS[buttons.left],
      group: 'souris',
    },
    {
      id: 'souris-molette',
      gesture: 'Molette',
      description: 'Zoomer',
      group: 'souris',
    },
    {
      id: 'souris-droit',
      gesture: 'Clic droit + glisser',
      description: ORBIT_ACTION_DESCRIPTIONS[buttons.right],
      group: 'souris',
    },
    {
      id: 'souris-milieu',
      gesture: 'Clic milieu + glisser',
      description: ORBIT_ACTION_DESCRIPTIONS[buttons.middle],
      group: 'souris',
    },
  ];
  if (buttons.left === 'rotate') {
    mouse.push({
      id: 'souris-maj',
      gesture: 'Maj + glisser',
      description: ORBIT_ACTION_DESCRIPTIONS.pan,
      group: 'souris',
    });
  }
  mouse.push({
    id: 'souris-clic',
    gesture: 'Clic sur l’eau',
    description: FEED_DESCRIPTION,
    group: 'souris',
  });
  return [
    ...mouse,
    {
      id: 'tactile-toucher',
      gesture: 'Toucher l’eau',
      description: FEED_DESCRIPTION,
      group: 'tactile',
    },
    {
      id: 'tactile-un-doigt',
      gesture: 'Un doigt',
      description: TOUCH_DESCRIPTIONS[touches.one],
      group: 'tactile',
    },
    {
      id: 'tactile-deux-doigts',
      gesture: 'Deux doigts',
      description: TOUCH_DESCRIPTIONS[touches.two],
      group: 'tactile',
    },
  ];
}

/**
 * Lignes de la caméra libre (#343, groupe affiché juste après les vues), puis gestes de la
 * caméra orbitale telle que réglée par `AquariumView` : l'ordre de l'aide-mémoire.
 */
export const GESTURE_COMMANDS: readonly GestureCommand[] = [
  ...FREE_CAMERA_GESTURES,
  ...orbitGestures(),
];

/** Ligne de l'aide-mémoire : touche ou geste, et son effet. */
export interface HelpEntry {
  readonly id: string;
  readonly kind: 'touche' | 'geste';
  readonly label: string;
  readonly description: string;
}

/** Section de l'aide-mémoire. */
export interface HelpSection {
  readonly id: CommandGroupId;
  readonly title: string;
  readonly entries: readonly HelpEntry[];
}

/**
 * Aide-mémoire complet : les groupes dans l'ordre de `COMMAND_GROUPS`, chacun avec ses
 * touches puis ses gestes ; les groupes vides sont omis.
 */
export function helpSections(
  keys: readonly KeyCommand[] = KEY_COMMANDS,
  gestures: readonly GestureCommand[] = GESTURE_COMMANDS,
): readonly HelpSection[] {
  return COMMAND_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    entries: [
      ...keys
        .filter((command) => command.group === group.id)
        .map((command): HelpEntry => ({
          id: command.id,
          kind: 'touche',
          label: command.display,
          description: command.description,
        })),
      ...gestures
        .filter((gesture) => gesture.group === group.id)
        .map((gesture): HelpEntry => ({
          id: gesture.id,
          kind: 'geste',
          label: gesture.gesture,
          description: gesture.description,
        })),
    ],
  })).filter((section) => section.entries.length > 0);
}
