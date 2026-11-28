import { parseCaptureParams } from '../../core/capture/capture-params';
import { DEFAULT_ROOM } from '../../sim/room';
import { createDefaultWorld } from '../../sim/world';
import { createStartupWorld } from './startup-world';

describe('createStartupWorld (#696)', () => {
  const start = (search: string) => createStartupWorld(parseCaptureParams(search), DEFAULT_ROOM);

  it('sans paramètre : le monde par défaut, pièce inchangée', () => {
    const { world, room } = start('');
    expect(world).toEqual(createDefaultWorld(42));
    expect(room).toBe(DEFAULT_ROOM);
  });

  it('graine et environnement de l’URL ; environnement inconnu : bac tropical', () => {
    expect(start('?seed=7&environnement=bassin').world).toEqual(createDefaultWorld(7, 'bassin'));
    expect(start('?seed=7&environnement=lune').world.environment).toBe('tropical');
  });

  it('réglages de capture ignorés hors capture (eau, pièce, bac)', () => {
    const plain = start('?seed=3&eau=mauvaise&piece=1&bac=90x45x50');
    expect(plain.world).toEqual(createDefaultWorld(3));
    expect(plain.room).toBe(DEFAULT_ROOM);
  });

  it('en capture : pièce affichée de piece=1, eau d’exemple de eau=', () => {
    const captured = start('?capture=1&seed=3&piece=1&eau=mauvaise');
    expect(captured.room.shown).toBe(true);
    expect(captured.world.water).not.toEqual(createDefaultWorld(3).water);
  });

  it('maladies d’exemple appliquées hors capture aussi (points-blancs=1)', () => {
    const { world } = start('?seed=3&points-blancs=1');
    expect(world).not.toEqual(createDefaultWorld(3));
  });

  it('saison=hiver (#864) : en capture au bassin seulement, saison inconnue ignorée', () => {
    const winter = start('?capture=1&seed=7&environnement=bassin&saison=hiver').world;
    expect(winter.seasonStartDay).toBe(22);
    expect(winter.water.temperature).toBeCloseTo(4, 3);
    expect(start('?seed=7&environnement=bassin&saison=hiver').world).toEqual(
      createDefaultWorld(7, 'bassin'),
    );
    expect(start('?capture=1&seed=7&environnement=bassin&saison=canicule').world).toEqual(
      createDefaultWorld(7, 'bassin'),
    );
    expect(start('?capture=1&seed=7&saison=ete').world).toEqual(createDefaultWorld(7));
  });

  it('mort=1 : la mortalité est activée et un corps apparaît', () => {
    const { world } = start('?seed=3&mort=1');
    expect(world.dead).toBeDefined();
  });

  it('déterministe : même URL, même monde', () => {
    const search = '?capture=1&seed=9&eau=moyenne&alevins=1&catappa=2&courant=fort';
    expect(start(search)).toEqual(start(search));
  });
});
