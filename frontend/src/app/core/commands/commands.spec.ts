import { CAMERA_PRESETS } from '../capture/capture-params';
import {
  COMMAND_GROUPS,
  FREE_MOVE_COMMANDS,
  GESTURE_COMMANDS,
  KEY_COMMANDS,
  ORBIT_MOUSE_BUTTONS,
  VIEW_COMMAND_PRESETS,
  commandKey,
  freeMoveAxes,
  freeMoveFor,
  helpSections,
  keyCommand,
  keyCommandFor,
  orbitGestures,
  type KeyCommandId,
} from './commands';

describe('commandes (#74)', () => {
  it('déclare chaque raccourci attendu, une seule fois, avec sa touche', () => {
    expect(KEY_COMMANDS.map((command) => [command.id, command.key])).toEqual([
      ['vue-dessus', '1'],
      ['vue-dessous', '2'],
      ['vue-face', '3'],
      ['vue-cote', '4'],
      ['vue-trois-quarts', '5'],
      ['camera-libre', 'l'],
      ['pixel-art', 'p'],
      ['pluie', 'r'],
      ['horloge', 'h'],
      ['plein-jour', 'j'],
      ['nuit', 'n'],
      ['nourrir', 'g'],
      ['aide', '?'],
    ]);
  });

  it('identifiants et touches uniques ; touches en minuscules, une seule touche chacune', () => {
    const ids = KEY_COMMANDS.map((command) => command.id);
    const keys = KEY_COMMANDS.map((command) => command.key);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keys).size).toBe(keys.length);
    for (const command of KEY_COMMANDS) {
      expect(command.key).toBe(command.key.toLowerCase());
      expect([...command.key]).toHaveLength(1);
      expect(command.display.toLowerCase()).toBe(command.key);
      expect(command.description.trim()).not.toBe('');
    }
  });

  it('jamais deux commandes sur la même touche : P reste le pixel art, R la pluie (#106)', () => {
    const byKey = new Map<string, string[]>();
    for (const command of KEY_COMMANDS) {
      byKey.set(command.key, [...(byKey.get(command.key) ?? []), command.id]);
    }
    const shared = [...byKey].filter(([, ids]) => ids.length > 1);
    expect(shared).toEqual([]);
    expect(keyCommandFor('P')?.id).toBe('pixel-art');
    expect(keyCommandFor('r')?.id).toBe('pluie');
    expect(keyCommandFor('R')?.group).toBe('affichage');
  });

  it('chaque commande appartient à un groupe déclaré ; aucun groupe orphelin', () => {
    const groups = new Set(COMMAND_GROUPS.map((group) => group.id));
    expect(groups.size).toBe(COMMAND_GROUPS.length);
    for (const command of [...KEY_COMMANDS, ...GESTURE_COMMANDS]) {
      expect(groups.has(command.group)).toBe(true);
    }
    expect(helpSections().map((section) => section.id)).toEqual(
      COMMAND_GROUPS.map((group) => group.id),
    );
  });

  it('keyCommandFor : insensible à la casse, null pour une touche non déclarée', () => {
    expect(keyCommandFor('p')?.id).toBe('pixel-art');
    expect(keyCommandFor('P')?.id).toBe('pixel-art');
    expect(keyCommandFor('N')?.id).toBe('nuit');
    expect(keyCommandFor('?')?.id).toBe('aide');
    expect(keyCommandFor('3')?.id).toBe('vue-face');
    for (const key of ['', 'x', '6', '0', ',', 'Escape', 'F1', 'pp', ' ']) {
      expect(keyCommandFor(key)).toBeNull();
    }
  });

  it('keyCommand / commandKey : lève une erreur pour un identifiant non déclaré', () => {
    expect(commandKey('horloge')).toBe('h');
    expect(keyCommand('aide').display).toBe('?');
    expect(() => keyCommand('inconnue' as KeyCommandId)).toThrow(/non déclarée/);
  });

  it('les 5 vues couvrent exactement les préréglages du contrat de capture', () => {
    expect(Object.values(VIEW_COMMAND_PRESETS).sort()).toEqual([...CAMERA_PRESETS].sort());
    for (const id of Object.keys(VIEW_COMMAND_PRESETS)) {
      expect(keyCommand(id as KeyCommandId).group).toBe('vues');
    }
  });

  describe('gestes de la caméra orbitale', () => {
    it('réglage actuel : gauche tourne, molette (milieu) zoome, droit déplace', () => {
      expect(ORBIT_MOUSE_BUTTONS).toEqual({ left: 'rotate', middle: 'dolly', right: 'pan' });
      const byId = new Map(GESTURE_COMMANDS.map((gesture) => [gesture.id, gesture]));
      expect(byId.get('souris-gauche')?.description).toBe('Tourner autour du bac');
      expect(byId.get('souris-molette')?.description).toBe('Zoomer');
      expect(byId.get('souris-droit')?.description).toBe('Déplacer la vue');
      expect(byId.get('souris-milieu')?.description).toBe('Rapprocher ou éloigner la vue');
      expect(byId.get('souris-maj')?.description).toBe('Déplacer la vue');
      expect(byId.get('tactile-un-doigt')?.description).toBe('Tourner autour du bac');
      expect(byId.get('tactile-deux-doigts')?.description).toMatch(/zoomer.*déplacer/);
    });

    it('nourrissage (#67) : un clic ou un toucher sur l’eau dépose des granulés, touche G', () => {
      const byId = new Map(GESTURE_COMMANDS.map((gesture) => [gesture.id, gesture]));
      expect(byId.get('souris-clic')?.description).toMatch(/granulés/);
      expect(byId.get('tactile-toucher')?.description).toMatch(/granulés/);
      expect(keyCommandFor('G')?.id).toBe('nourrir');
      expect(keyCommand('nourrir').group).toBe('nourriture');
    });

    it('les libellés suivent le réglage des boutons (pas de description en dur)', () => {
      const swapped = orbitGestures(
        { left: 'pan', middle: 'dolly', right: 'rotate' },
        { one: 'pan', two: 'dolly-rotate' },
      );
      const byId = new Map(swapped.map((gesture) => [gesture.id, gesture]));
      expect(byId.get('souris-gauche')?.description).toBe('Déplacer la vue');
      expect(byId.get('souris-droit')?.description).toBe('Tourner autour du bac');
      expect(byId.has('souris-maj')).toBe(false);
      expect(byId.get('tactile-un-doigt')?.description).toBe('Déplacer la vue');
      expect(byId.get('tactile-deux-doigts')?.description).toMatch(/tourner/);
    });

    it('identifiants uniques, gestes non vides', () => {
      const ids = GESTURE_COMMANDS.map((gesture) => gesture.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const gesture of GESTURE_COMMANDS) {
        expect(gesture.gesture.trim()).not.toBe('');
      }
    });
  });

  describe('caméra libre (#343)', () => {
    it('touche L, groupe « Caméra libre » avec ses déplacements et l’orientation', () => {
      expect(keyCommandFor('L')?.id).toBe('camera-libre');
      const section = helpSections().find((candidate) => candidate.id === 'camera-libre');
      expect(section?.entries.map((entry) => entry.label)).toEqual([
        'L',
        'Z / W / ↑',
        'S / ↓',
        'Q / A / ←',
        'D / →',
        'E / Page ↑',
        'C / Page ↓',
        'Glisser',
      ]);
    });

    it('déplacements : AZERTY, QWERTY et flèches, insensibles à la casse', () => {
      expect(freeMoveFor('z')).toBe('avancer');
      expect(freeMoveFor('W')).toBe('avancer');
      expect(freeMoveFor('ArrowUp')).toBe('avancer');
      expect(freeMoveFor('q')).toBe('gauche');
      expect(freeMoveFor('A')).toBe('gauche');
      expect(freeMoveFor('ArrowRight')).toBe('droite');
      expect(freeMoveFor('PageUp')).toBe('monter');
      expect(freeMoveFor('c')).toBe('descendre');
      for (const key of ['', 'x', 'l', 'p', ' ', 'Escape', 'zz']) {
        expect(freeMoveFor(key)).toBeNull();
      }
    });

    it('aucune touche de déplacement ne reprend un raccourci, ni deux déplacements une touche', () => {
      const moveKeys = FREE_MOVE_COMMANDS.flatMap((command) => command.keys);
      expect(new Set(moveKeys).size).toBe(moveKeys.length);
      for (const key of moveKeys) {
        expect(key).toBe(key.toLowerCase());
        expect(keyCommandFor(key), key).toBeNull();
      }
    });

    it('freeMoveAxes : chaque axe, sens opposés annulés, aucune touche au repos', () => {
      expect(freeMoveAxes(new Set())).toEqual({ forward: 0, strafe: 0, vertical: 0 });
      expect(freeMoveAxes(new Set(['avancer', 'droite', 'descendre']))).toEqual({
        forward: 1,
        strafe: 1,
        vertical: -1,
      });
      expect(freeMoveAxes(new Set(['reculer', 'gauche', 'monter']))).toEqual({
        forward: -1,
        strafe: -1,
        vertical: 1,
      });
      expect(freeMoveAxes(new Set(['avancer', 'reculer']))).toEqual({
        forward: 0,
        strafe: 0,
        vertical: 0,
      });
    });
  });

  describe('helpSections', () => {
    it('contient chaque touche et chaque geste exactement une fois', () => {
      const entries = helpSections().flatMap((section) => section.entries);
      expect(entries.filter((entry) => entry.kind === 'touche').map((entry) => entry.id)).toEqual(
        KEY_COMMANDS.map((command) => command.id),
      );
      expect(entries.filter((entry) => entry.kind === 'geste').map((entry) => entry.id)).toEqual(
        GESTURE_COMMANDS.map((gesture) => gesture.id),
      );
    });

    it('affiche la touche telle que déclarée (majuscule) et l’ordre des groupes', () => {
      const sections = helpSections();
      expect(sections.map((section) => section.title)).toEqual([
        'Vues',
        'Caméra libre',
        'Affichage',
        'Heure',
        'Nourriture',
        'Souris',
        'Écran tactile',
        'Aide',
      ]);
      expect(sections[3].entries.map((entry) => entry.label)).toEqual(['H', 'J', 'N']);
    });

    it('omet les groupes vides', () => {
      expect(helpSections([], [])).toEqual([]);
      expect(helpSections([keyCommand('aide')], []).map((section) => section.id)).toEqual(['aide']);
    });
  });
});
