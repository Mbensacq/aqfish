import { DEFAULT_DAY_CLOCK } from './daylight';
import { ENVIRONMENT_IDS, type EnvironmentId } from './environment';
import { advance, advanceToWithFeedings, createDefaultWorld } from './world';
import type { World } from './world-types';

/**
 * Non-régression de la simulation (chantier d'assainissement #686) : empreinte de l'état
 * complet du monde à plusieurs instants, pour chaque environnement, avec l'horloge de journée
 * (jour, crépuscule, nuit) et des nourrissages.
 *
 * Une refactorisation ne doit changer **aucune** empreinte : la simulation est déterministe au
 * bit près (`docs/ARCHITECTURE.md`). Si une empreinte change :
 * - pendant une refactorisation : c'est une régression, à corriger ;
 * - pour un changement de comportement voulu (nouvelle fonctionnalité, correctif) : remplacer
 *   les valeurs par celles qu'affiche l'échec, et l'expliquer dans la PR (quels environnements,
 *   pourquoi). Ne jamais les remplacer sans savoir pourquoi elles ont changé.
 */

/** Durée maximale d'un scénario (5 min simulées, rendu logiciel des machines de CI). */
const TIMEOUT_MS = 60_000;

/** Graine des empreintes, celle des captures. */
const SEED = 42;

/** Instants relevés, en pas de simulation (1/60 s) : 10 s, 1 min, 5 min. */
const CHECKPOINTS = [600, 3_600, 18_000] as const;

/** Nourrissages du scénario « nourri » : temps (s) et position (m). */
const FEEDINGS = [
  { time: 5, x: 0, z: 0 },
  { time: 40, x: 0.2, z: -0.1 },
  { time: 120, x: -0.25, z: 0.1 },
];

/**
 * Empreintes attendues : `<environnement>` (horloge de journée, sans nourrissage) et
 * `<environnement>+nourri`, une valeur par instant de `CHECKPOINTS`.
 */
const EXPECTED: Record<string, readonly string[]> = {
  tropical: ['1e09b6fc996743', '0d0bb3e99b5af4', '09fa6a703221b0'],
  'tropical+nourri': ['1f666b409b7146', '1a6769871f26a9', '1743f52eb5809d'],
  bassin: ['1a335b30286dd1', '0e41ebfbd229eb', '0f5e7b855eb0e7'],
  'bassin+nourri': ['051c3eaf632766', '0a27f29e5bfa3e', '0fbcf1b6c17a94'],
  paludarium: ['0128e00aa05cd1', '17b93813f148ef', '08d7b21b0237da'],
  'paludarium+nourri': ['0863d217fca73b', '1822e2dd3d7439', '0d987d46e9a61e'],
  recif: ['1604a58713acdb', '12292b8d19f16e', '0cd70b9bae44de'],
  'recif+nourri': ['1aec7289e9c32b', '07a7cce18f1c5c', '1aeb81e9b815dc'],
  eaufroide: ['1c71e4d35248c2', '1b900669c04dcd', '106b028680cc1c'],
  'eaufroide+nourri': ['161ea76deba631', '08643026c6ca36', '18f921f27a78e9'],
};

/**
 * Hachage cyrb53 (53 bits) en hexadécimal : rapide, sans dépendance, assez dispersé pour
 * détecter le moindre bit changé dans plusieurs centaines de kilo-octets de JSON.
 */
function cyrb53(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Empreinte d'un monde : JSON complet de l'état (objet de données simple, ARCHITECTURE). */
function fingerprint(world: World): string {
  return cyrb53(JSON.stringify(world));
}

function run(environment: EnvironmentId, fed: boolean): string[] {
  const start = createDefaultWorld(SEED, environment);
  const prints: string[] = [];
  let world = start;
  for (const tick of CHECKPOINTS) {
    world = fed
      ? advanceToWithFeedings(world, tick / 60, FEEDINGS, DEFAULT_DAY_CLOCK)
      : advance(world, tick - world.tick, DEFAULT_DAY_CLOCK);
    expect(world.tick).toBe(tick);
    prints.push(fingerprint(world));
  }
  return prints;
}

describe('non-régression de la simulation : empreintes de l’état complet', () => {
  it('cyrb53 : stable, sensible à un caractère', () => {
    expect(cyrb53('aqfish')).toBe(cyrb53('aqfish'));
    expect(cyrb53('aqfish')).not.toBe(cyrb53('aqfisH'));
    expect(cyrb53('')).toMatch(/^[0-9a-f]{14}$/);
  });

  it(
    'chaque scénario est déterministe : deux exécutions, mêmes empreintes',
    () => {
      expect(run('tropical', true)).toEqual(run('tropical', true));
    },
    TIMEOUT_MS,
  );

  for (const [name, expected] of Object.entries(EXPECTED)) {
    it(
      `${name} : empreintes enregistrées (toute différence est une régression)`,
      () => {
        const [environment, variant] = name.split('+') as [EnvironmentId, string | undefined];
        const actual = run(environment, variant === 'nourri');
        expect(
          actual,
          `Empreintes de « ${name} » changées. Si le changement de comportement est voulu, ` +
            `remplacer sa ligne de EXPECTED par : ${JSON.stringify(actual)}`,
        ).toEqual(expected);
      },
      TIMEOUT_MS,
    );
  }

  it('couvre chaque environnement, avec et sans nourrissage', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(
      ENVIRONMENT_IDS.flatMap((id) => [id, `${id}+nourri`]).sort(),
    );
  });
});
