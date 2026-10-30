import exemple from '../../../../fond-ecran/aqfish-fond.json';
import { parseSaveWorlds } from '../../sim/room-save';

/**
 * Configuration d'exemple du paquet fond d'écran (`fond-ecran/aqfish-fond.json`, #279) :
 * une sauvegarde valide, relue comme un export de l'application.
 */
describe('Configuration d’exemple du fond d’écran (#279)', () => {
  it('est une sauvegarde acceptée : bac tropical en mode décor, pièce affichée', () => {
    const result = parseSaveWorlds(JSON.stringify(exemple));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.world.environment).toBe('tropical');
    expect(result.world.careMode).toBe('decor');
    expect(result.world.entities.length).toBeGreaterThan(0);
    expect(result.settings.room?.shown).toBe(true);
  });
});
