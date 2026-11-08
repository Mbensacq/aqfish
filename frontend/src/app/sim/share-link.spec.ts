import { compressText } from '../core/share-codec/share-codec';
import { createDayClock } from './daylight';
import { ENVIRONMENT_IDS } from './environment';
import { MAX_TOTAL_FISH } from './population';
import { roomAnimalCount } from './room-limits';
import { DEFAULT_SAVE_SETTINGS, MAX_SAVE_LENGTH, serializeWorld, type SaveSettings } from './save';
import {
  createShare,
  fromBase64Url,
  hasShareFragment,
  MAX_SHARE_LINK_LENGTH,
  parseSharedText,
  readShare,
  shareFragment,
  shareOutcome,
  sharedAnimalCount,
  sharedText,
  splitShareFragment,
  toBase64Url,
  type ShareOutcome,
} from './share-link';
import { advance, createDefaultWorld, type World } from './world';
import { createWaterHistory, markWaterChange, savedWaterHistory } from './water-history';

const BASE = 'https://exemple.test/aqfish/';
const SETTINGS: SaveSettings = {
  ...DEFAULT_SAVE_SETTINGS,
  clock: createDayClock(9.5, 1200, true),
};

function fragmentOf(outcome: ShareOutcome): string {
  if (outcome.kind !== 'lien') {
    throw new Error(`lien attendu, reçu ${outcome.kind}`);
  }
  return outcome.url.slice(outcome.url.indexOf('#'));
}

async function zFragment(text: string): Promise<string> {
  return `#${shareFragment('z', await compressText(text))}`;
}

function jFragment(text: string): string {
  return `#${shareFragment('j', new TextEncoder().encode(text))}`;
}

async function expectRefused(hash: string, pattern: RegExp): Promise<void> {
  const result = await readShare(hash);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toMatch(pattern);
  }
}

describe('base64url (#426)', () => {
  it('aller-retour exact pour toutes les longueurs de reste et tous les octets', () => {
    for (let length = 0; length <= 7; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 97 + 255) & 0xff);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    const text = toBase64Url(all);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(text)).toEqual(all);
  });

  it('refuse les caractères hors alphabet, une longueur impossible et un remplissage non nul', () => {
    expect(fromBase64Url('ab+c')).toBeNull();
    expect(fromBase64Url('ab=c')).toBeNull();
    expect(fromBase64Url('abcde')).toBeNull();
    // « AB » code 0x00 avec 4 bits de remplissage nuls ; « AF » a des bits de remplissage à 1.
    expect(fromBase64Url('AA')).toEqual(new Uint8Array([0]));
    expect(fromBase64Url('AF')).toBeNull();
    expect(fromBase64Url('')).toEqual(new Uint8Array(0));
  });
});

describe('lien de partage : aller-retour (#426)', () => {
  it.each(ENVIRONMENT_IDS)(
    'état → lien → état exact, puis même avenir, pour l’environnement %s',
    async (environment) => {
      const world = advance(createDefaultWorld(1234, environment), 90);
      const outcome = await createShare(BASE, world, SETTINGS);
      expect(outcome.kind).toBe('lien');
      const url = (outcome as { url: string }).url;
      expect(url.startsWith(`${BASE}#partage=1.z.`)).toBe(true);
      expect(url.length).toBeLessThanOrEqual(MAX_SHARE_LINK_LENGTH);

      const read = await readShare(fragmentOf(outcome));
      expect(read.ok).toBe(true);
      if (!read.ok) {
        return;
      }
      expect(read.room.tanks).toHaveLength(1);
      expect(read.others).toEqual([]);
      expect(read.settings).toEqual(SETTINGS);
      // Même état au bit près : même texte de sauvegarde, et même avenir.
      expect(serializeWorld(read.world, read.settings)).toBe(sharedText(world, SETTINGS));
      expect(serializeWorld(advance(read.world, 60))).toBe(serializeWorld(advance(world, 60)));
    },
  );

  it('graines différentes : liens différents, chacun fidèle à son monde', async () => {
    const a = advance(createDefaultWorld(1), 30);
    const b = advance(createDefaultWorld(2), 30);
    const linkA = await createShare(BASE, a, SETTINGS);
    const linkB = await createShare(BASE, b, SETTINGS);
    expect(linkA).not.toEqual(linkB);
    const readB = await readShare(fragmentOf(linkB));
    expect(readB.ok && readB.world.seed).toBe(2);
  });

  it('repli sans compression (API absente) : codage « j », même aller-retour', async () => {
    const world = createDefaultWorld(77, 'bassin');
    const outcome = await createShare(BASE, world, SETTINGS, false);
    const fragment = fragmentOf(outcome);
    expect(fragment.startsWith('#partage=1.j.')).toBe(true);
    const read = await readShare(fragment);
    expect(read.ok && serializeWorld(read.world, read.settings)).toBe(sharedText(world, SETTINGS));
  });

  it('un bac par défaut tient largement dans la longueur maximale', async () => {
    const outcome = await createShare(BASE, createDefaultWorld(5), DEFAULT_SAVE_SETTINGS);
    expect(outcome.kind).toBe('lien');
    expect((outcome as { url: string }).url.length).toBeLessThan(MAX_SHARE_LINK_LENGTH / 2);
  });

  it('décompte du bandeau : celui du plafond de la pièce (#431)', async () => {
    for (const environment of ['tropical', 'paludarium'] as const) {
      const world = createDefaultWorld(9, environment);
      const read = await readShare(fragmentOf(await createShare(BASE, world, SETTINGS)));
      expect(read.ok).toBe(true);
      if (read.ok) {
        expect(sharedAnimalCount(read)).toBe(roomAnimalCount(read.room));
        expect(sharedAnimalCount(read)).toBe(world.entities.length);
        expect(sharedAnimalCount(read)).toBeGreaterThan(0);
      }
    }
  });

  it('accepte le fragment avec ou sans « # »', async () => {
    const fragment = fragmentOf(await createShare(BASE, createDefaultWorld(3), SETTINGS));
    expect(hasShareFragment(fragment)).toBe(true);
    expect(hasShareFragment(fragment.slice(1))).toBe(true);
    expect((await readShare(fragment.slice(1))).ok).toBe(true);
    expect(hasShareFragment('#autre=1')).toBe(false);
    expect(hasShareFragment('')).toBe(false);
  });
});

describe('lien de partage : sans historique de l’eau (#524)', () => {
  const withHistory = (): World => {
    const world = advance(createDefaultWorld(11), 20);
    const history = createWaterHistory();
    markWaterChange(history, world.water, 0);
    return { ...world, waterHistory: savedWaterHistory(history) };
  };

  it('le texte partagé ne contient pas l’historique, la sauvegarde si', () => {
    const world = withHistory();
    expect(serializeWorld(world, SETTINGS)).toContain('waterHistory');
    expect(sharedText(world, SETTINGS)).not.toContain('waterHistory');
    expect(world.waterHistory).toBeDefined();
  });

  it('le lien a la même longueur avec ou sans historique', async () => {
    const world = withHistory();
    const bare: World = { ...world, waterHistory: undefined };
    const [a, b] = await Promise.all([
      createShare(BASE, world, SETTINGS, false),
      createShare(BASE, bare, SETTINGS, false),
    ]);
    expect(a).toEqual(b);
    expect(sharedText(world, SETTINGS).length).toBe(sharedText(bare, SETTINGS).length);
  });
});

describe('lien de partage : repli sur le fichier (#426)', () => {
  it('au-delà de la longueur maximale, propose le fichier', () => {
    const exact = 'x'.repeat(MAX_SHARE_LINK_LENGTH - BASE.length - 1);
    expect(shareOutcome(BASE, exact)).toEqual({ kind: 'lien', url: `${BASE}#${exact}` });
    const over = shareOutcome(BASE, `${exact}x`);
    expect(over.kind).toBe('fichier');
    expect(over).toMatchObject({ length: MAX_SHARE_LINK_LENGTH + 1 });
    expect((over as { reason: string }).reason).toMatch(/lien trop long/);
  });

  it('un bac plein non compressé dépasse la limite : repli sur le fichier', async () => {
    let world: World = createDefaultWorld(9);
    world = advance(world, 10);
    const full = await import('./population').then(({ setPopulation }) =>
      setPopulation(world, 'neon', MAX_TOTAL_FISH),
    );
    const outcome = await createShare(BASE, full, SETTINGS, false);
    expect(outcome.kind).toBe('fichier');
  });
});

describe('lien de partage : contenus refusés sans exception (#426)', () => {
  const valid = () => sharedText(advance(createDefaultWorld(11), 20), SETTINGS);

  it('lien tronqué', async () => {
    const fragment = await zFragment(valid());
    await expectRefused(fragment.slice(0, fragment.length - 40), /corrompu|tronqué/);
    await expectRefused('#partage=1.z.', /tronqué/);
    await expectRefused('#partage=1.z', /tronqué|mal formé/);
    await expectRefused('#partage=', /tronqué|mal formé/);
    await expectRefused(jFragment(valid()).slice(0, 200), /corrompu|JSON/);
  });

  it('lien corrompu', async () => {
    await expectRefused('#partage=1.z.!!!!', /corrompu/);
    await expectRefused('#partage=1.z.AAAAAAAA', /corrompu/);
    await expectRefused('#partage=1.q.AAAA', /codage de lien inconnu/);
    await expectRefused(jFragment('{"format":"aqfish"'), /JSON invalide/);
    await expectRefused(jFragment('[1,2,3]'), /pas d’aquarium aqfish/);
    await expectRefused(
      `#partage=1.j.${toBase64Url(new Uint8Array([0xff, 0xfe, 0xfd]))}`,
      /texte illisible/,
    );
    await expectRefused('#ailleurs=1', /ne contient pas/);
  });

  it('préfixe de version inconnu, quel que soit le découpage (#431)', async () => {
    for (const hash of [
      '#partage=v1.z.AAAA',
      '#partage=9',
      '#partage=2.z',
      '#partage=v1',
      '#partage=1x.z.AAAA',
      '#partage=0.z.AAAA.BBBB',
    ]) {
      await expectRefused(hash, /version de lien inconnue/);
    }
    const split = splitShareFragment('#partage=v1.z');
    expect(split.ok).toBe(false);
    expect(!split.ok && split.error).toContain('(v1, version 1 attendue)');
    await expectRefused('#partage=.z.AAAA', /version de lien inconnue \(vide,/);
    await expectRefused('#partage=.', /version de lien inconnue \(vide,/);
    // Bonne version ou fragment vide : le découpage décide.
    await expectRefused('#partage=', /tronqué ou mal formé/);
    await expectRefused('#partage=1.z.AAAA.BBBB', /tronqué ou mal formé/);
    await expectRefused('#partage=1', /tronqué ou mal formé/);
  });

  it('schéma futur (lien ou contenu) et sauvegarde de pièce', async () => {
    await expectRefused('#partage=2.z.AAAA', /version de lien inconnue/);
    const future = JSON.stringify({ ...JSON.parse(valid()), schema: 3 });
    await expectRefused(await zFragment(future), /version de contenu inconnue/);
    const room = JSON.stringify({ ...JSON.parse(valid()), schema: 2 });
    await expectRefused(await zFragment(room), /version de contenu inconnue/);
    const withOthers = JSON.stringify({ ...JSON.parse(valid()), others: [] });
    await expectRefused(await zFragment(withOthers), /un seul bac/);
  });

  it('hors bornes et espèce inconnue', async () => {
    const data = JSON.parse(valid());
    const outOfBounds = { ...data, fish: [{ ...data.fish[0], y: 1e6 }, ...data.fish.slice(1)] };
    expect(parseSharedText(JSON.stringify(outOfBounds)).ok).toBe(false);
    await expectRefused(await zFragment(JSON.stringify(outOfBounds)), /.+/);
    const unknown = {
      ...data,
      fish: [{ ...data.fish[0], species: 'requin-blanc' }, ...data.fish.slice(1)],
    };
    await expectRefused(await zFragment(JSON.stringify(unknown)), /requin-blanc|espèce/);
    const tooMany = {
      ...data,
      fish: Array.from({ length: MAX_TOTAL_FISH + 1 }, () => data.fish[0]),
    };
    await expectRefused(await zFragment(JSON.stringify(tooMany)), /trop de poissons/);
    await expectRefused(await zFragment(JSON.stringify({ ...data, seed: -1 })), /seed/);
  });

  it('contenu hostile : bombe de décompression et lien trop long', async () => {
    // 1 Mio d'espaces compressés en quelques Kio : arrêt dès MAX_SAVE_LENGTH dépassé.
    const bomb = await compressText(' '.repeat(4 * MAX_SAVE_LENGTH));
    const fragment = `#${shareFragment('z', bomb)}`;
    expect(fragment.length).toBeLessThan(MAX_SHARE_LINK_LENGTH);
    await expectRefused(fragment, /trop volumineux/);
    await expectRefused(`#partage=1.j.${'A'.repeat(MAX_SHARE_LINK_LENGTH)}`, /lien trop long/);
    expect(parseSharedText('x'.repeat(MAX_SAVE_LENGTH + 1)).ok).toBe(false);
    const proto = valid().replace('{', '{"__proto__":{"schema":9},');
    expect((await readShare(await zFragment(proto))).ok).toBe(true);
  });

  it('découpe : entrée non textuelle refusée', () => {
    expect(splitShareFragment(42 as unknown as string).ok).toBe(false);
    expect(parseSharedText(null as unknown as string).ok).toBe(false);
  });
});
