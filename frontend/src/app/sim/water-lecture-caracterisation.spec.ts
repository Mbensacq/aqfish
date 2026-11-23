import { ENVIRONMENT_IDS, type EnvironmentId } from './environment';
import { readWater } from './water';

/**
 * Caractérisation de `readWater` (`sim/water.ts`), lot 4 du chantier #686 : relevée **avant**
 * le découpage de la fonction. Chaque cas part d'une eau minimale valide et change un champ
 * (absent, mauvais type, bornes comprises et dépassées), ou en combine plusieurs pour figer
 * l'ordre des contrôles (la première erreur l'emporte) et l'ordre des clés de l'eau relue
 * (il fixe le texte des sauvegardes). Le résultat attendu est le JSON exact de la sortie.
 */

const BASE = { temperature: 25, ammonia: 0, nitrite: 0, nitrate: 5, filter: 1 };

/** Eau complète : tous les champs facultatifs, dans un ordre mélangé. */
const FULL = {
  kh: 6,
  carbon: true,
  plantGrowth: { '7': 0.5, '3': 0 },
  salt: 1,
  lampOn: 9,
  cycling: true,
  algae: [0.1, 0],
  phRegulatorWait: 10,
  ...BASE,
  untreatedTap: true,
  lighting: 10,
  chlorine: 0.5,
  gh: 8,
  ammoniaBinder: 3,
  bacteriaStarter: 0.5,
  ichCure: 0.25,
  medication: 0.5,
  catappa: [0.5, 1],
  ph: 6.8,
  heater: 26,
  inconnu: 'ignoré',
};

type Case = readonly [name: string, value: unknown, environment: EnvironmentId];

/** Nom lisible d'une valeur : les textes entre guillemets (`'1'` n'est pas `1`). */
function label(value: unknown): string {
  return typeof value === 'string' ? `'${value}'` : String(value);
}

function withField(key: string, value: unknown): Record<string, unknown> {
  return { ...BASE, [key]: value };
}

function without(key: keyof typeof BASE): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...BASE };
  delete copy[key];
  return copy;
}

/** Valeurs essayées pour un champ numérique borné [min, max]. */
function numberCases(key: string, min: number, max: number): Case[] {
  const values: unknown[] = [
    min,
    max,
    (min + max) / 2,
    min - 0.01,
    max + 0.01,
    Number.NaN,
    '1',
    null,
  ];
  return values.map((v) => [`${key} = ${label(v)}`, withField(key, v), 'tropical'] as const);
}

function booleanCases(key: string): Case[] {
  return [true, false, 'true', 1].map(
    (v) => [`${key} = ${label(v)}`, withField(key, v), 'tropical'] as const,
  );
}

const inherited = Object.create(BASE) as object;

const CASES: readonly Case[] = [
  ['null', null, 'tropical'],
  ['nombre', 3, 'tropical'],
  ['texte', 'eau', 'tropical'],
  ['tableau', [], 'tropical'],
  ['indéfini', undefined, 'tropical'],
  ['champs hérités', inherited, 'tropical'],
  ...ENVIRONMENT_IDS.map((env) => [`base ${env}`, BASE, env] as const),
  ...ENVIRONMENT_IDS.map((env) => [`complète ${env}`, FULL, env] as const),
  ...(['temperature', 'ammonia', 'nitrite', 'nitrate', 'filter'] as const).map(
    (key) => [`sans ${key}`, without(key), 'tropical'] as const,
  ),
  ...numberCases('temperature', 0, 40),
  ...numberCases('ammonia', 0, 100),
  ...numberCases('nitrite', 0, 100),
  ['ammonia = 50.01', withField('ammonia', 50.01), 'tropical'],
  ['nitrite = 12.5', withField('nitrite', 12.5), 'tropical'],
  ['nitrite = 12.51', withField('nitrite', 12.51), 'tropical'],
  ...numberCases('nitrate', 0, 100),
  ...numberCases('filter', 0, 1),
  ...numberCases('heater', 16, 32),
  ...numberCases('ph', 4, 9.5),
  ...numberCases('lighting', 0, 24),
  ['lighting = 12.5', withField('lighting', 12.5), 'tropical'],
  ...numberCases('lampOn', 0, 23),
  ['lampOn = 24', withField('lampOn', 24), 'tropical'],
  ...numberCases('gh', 0, 400),
  ...numberCases('kh', 0, 400),
  ...numberCases('salt', 0, 5),
  ...numberCases('medication', 0, 1.5),
  ...numberCases('ichCure', 0, 1),
  ['ichCure = 0.999', withField('ichCure', 0.999), 'tropical'],
  ...numberCases('bacteriaStarter', 0, 1),
  ...numberCases('chlorine', 0, 2),
  ...numberCases('ammoniaBinder', 0, 1e9),
  ...numberCases('phRegulatorWait', 0, 1e9),
  ...booleanCases('untreatedTap'),
  ...booleanCases('cycling'),
  ...booleanCases('carbon'),
  ['catappa vide', withField('catappa', []), 'tropical'],
  ['catappa', withField('catappa', [0, 0.5, 1]), 'tropical'],
  ['catappa texte', withField('catappa', 'feuille'), 'tropical'],
  ['catappa hors bornes', withField('catappa', [0.5, 2]), 'tropical'],
  ['catappa trop longue', withField('catappa', [0, 0, 0, 0, 0, 0, 0, 0]), 'tropical'],
  ['algae nulles', withField('algae', [0, 0, 0]), 'tropical'],
  ['algae vides', withField('algae', []), 'tropical'],
  ['algae', withField('algae', [0.2, 0, 1]), 'tropical'],
  ['algae texte', withField('algae', 'vert'), 'tropical'],
  ['algae hors bornes', withField('algae', [1.5]), 'tropical'],
  ['plantGrowth vide', withField('plantGrowth', {}), 'tropical'],
  ['plantGrowth nulle', withField('plantGrowth', { '12': 0 }), 'tropical'],
  ['plantGrowth', withField('plantGrowth', { '12': 0.5, '4': 0 }), 'tropical'],
  ['plantGrowth tableau', withField('plantGrowth', []), 'tropical'],
  ['plantGrowth clé invalide', withField('plantGrowth', { a: 0.5 }), 'tropical'],
  ['ordre : température avant heater', { ...without('temperature'), heater: 99 }, 'tropical'],
  ['ordre : heater avant ph', { ...BASE, heater: 99, ph: 99 }, 'tropical'],
  ['ordre : ph avant catappa', { ...BASE, ph: 99, catappa: 'x' }, 'tropical'],
  ['ordre : catappa avant lighting', { ...BASE, catappa: 'x', lighting: 99 }, 'tropical'],
  ['ordre : lighting avant lampOn', { ...BASE, lighting: 99, lampOn: 99 }, 'tropical'],
  ['ordre : lampOn avant algae', { ...BASE, lampOn: 99, algae: 'x' }, 'tropical'],
  ['ordre : algae avant plantGrowth', { ...BASE, algae: 'x', plantGrowth: [] }, 'tropical'],
  ['ordre : plantGrowth avant gh', { ...BASE, plantGrowth: [], gh: -1 }, 'tropical'],
  ['ordre : gh avant kh', { ...BASE, gh: -1, kh: -1 }, 'tropical'],
  ['ordre : kh avant salt', { ...BASE, kh: -1, salt: -1 }, 'tropical'],
  ['ordre : salt avant phRegulatorWait', { ...BASE, phRegulatorWait: -1, salt: -1 }, 'tropical'],
  [
    'ordre : phRegulatorWait avant untreatedTap',
    { ...BASE, phRegulatorWait: -1, untreatedTap: 1 },
    'tropical',
  ],
  ['ordre : untreatedTap avant cycling', { ...BASE, untreatedTap: 1, cycling: 1 }, 'tropical'],
  ['ordre : cycling avant carbon', { ...BASE, carbon: 1, cycling: 1 }, 'tropical'],
];

/** Sortie attendue de chaque cas (JSON exact), relevée avant le découpage. */
const EXPECTED: Readonly<Record<string, string>> = {
  null: '{"ok":false,"error":"eau : doit être un objet"}',
  nombre: '{"ok":false,"error":"eau : doit être un objet"}',
  texte: '{"ok":false,"error":"eau : doit être un objet"}',
  tableau: '{"ok":false,"error":"eau : doit être un objet"}',
  indéfini: '{"ok":false,"error":"eau : doit être un objet"}',
  'champs hérités': '{"ok":false,"error":"eau : temperature doit être un nombre dans [0, 40]"}',
  'base tropical':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  'base bassin':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7.5}}',
  'base paludarium':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7.2}}',
  'base recif':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":8.2}}',
  'base eaufroide':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7.5}}',
  'complète tropical':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":6.8,"heater":26,"catappa":[0.5,1],"salt":1,"medication":0.5,"ichCure":0.25,"bacteriaStarter":0.5,"chlorine":0.5,"ammoniaBinder":3,"phRegulatorWait":10,"untreatedTap":true,"carbon":true,"cycling":true,"lighting":10,"lampOn":9,"algae":[0.1,0],"plantGrowth":{"7":0.5},"gh":8,"kh":6}}',
  'complète bassin':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":6.8,"heater":26,"catappa":[0.5,1],"salt":1,"medication":0.5,"ichCure":0.25,"bacteriaStarter":0.5,"chlorine":0.5,"ammoniaBinder":3,"phRegulatorWait":10,"untreatedTap":true,"carbon":true,"cycling":true,"lighting":10,"lampOn":9,"algae":[0.1,0],"plantGrowth":{"7":0.5},"gh":8,"kh":6}}',
  'complète paludarium':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":6.8,"heater":26,"catappa":[0.5,1],"salt":1,"medication":0.5,"ichCure":0.25,"bacteriaStarter":0.5,"chlorine":0.5,"ammoniaBinder":3,"phRegulatorWait":10,"untreatedTap":true,"carbon":true,"cycling":true,"lighting":10,"lampOn":9,"algae":[0.1,0],"plantGrowth":{"7":0.5},"gh":8,"kh":6}}',
  'complète recif':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":6.8,"heater":26,"catappa":[0.5,1],"salt":1,"medication":0.5,"ichCure":0.25,"bacteriaStarter":0.5,"chlorine":0.5,"ammoniaBinder":3,"phRegulatorWait":10,"untreatedTap":true,"carbon":true,"cycling":true,"lighting":10,"lampOn":9,"algae":[0.1,0],"plantGrowth":{"7":0.5},"gh":8,"kh":6}}',
  'complète eaufroide':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":6.8,"heater":26,"catappa":[0.5,1],"salt":1,"medication":0.5,"ichCure":0.25,"bacteriaStarter":0.5,"chlorine":0.5,"ammoniaBinder":3,"phRegulatorWait":10,"untreatedTap":true,"carbon":true,"cycling":true,"lighting":10,"lampOn":9,"algae":[0.1,0],"plantGrowth":{"7":0.5},"gh":8,"kh":6}}',
  'sans temperature': '{"ok":false,"error":"eau : temperature doit être un nombre dans [0, 40]"}',
  'sans ammonia': '{"ok":false,"error":"eau : ammonia doit être un nombre dans [0, 50]"}',
  'sans nitrite': '{"ok":false,"error":"eau : nitrite doit être un nombre dans [0, 12.5]"}',
  'sans nitrate': '{"ok":false,"error":"eau : nitrate doit être un nombre dans [0, 100]"}',
  'sans filter': '{"ok":false,"error":"eau : filter doit être un nombre dans [0, 1]"}',
  'temperature = 0':
    '{"ok":true,"water":{"temperature":0,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  'temperature = 40':
    '{"ok":true,"water":{"temperature":40,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  'temperature = 20':
    '{"ok":true,"water":{"temperature":20,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  'temperature = -0.01':
    '{"ok":false,"error":"eau : temperature doit être un nombre dans [0, 40]"}',
  'temperature = 40.01':
    '{"ok":false,"error":"eau : temperature doit être un nombre dans [0, 40]"}',
  'temperature = NaN': '{"ok":false,"error":"eau : temperature doit être un nombre dans [0, 40]"}',
  "temperature = '1'": '{"ok":false,"error":"eau : temperature doit être un nombre dans [0, 40]"}',
  'temperature = null': '{"ok":false,"error":"eau : temperature doit être un nombre dans [0, 40]"}',
  'ammonia = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  'ammonia = 100': '{"ok":false,"error":"eau : ammonia doit être un nombre dans [0, 50]"}',
  'ammonia = 50':
    '{"ok":true,"water":{"temperature":25,"ammonia":50,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  'ammonia = -0.01': '{"ok":false,"error":"eau : ammonia doit être un nombre dans [0, 50]"}',
  'ammonia = 100.01': '{"ok":false,"error":"eau : ammonia doit être un nombre dans [0, 50]"}',
  'ammonia = NaN': '{"ok":false,"error":"eau : ammonia doit être un nombre dans [0, 50]"}',
  "ammonia = '1'": '{"ok":false,"error":"eau : ammonia doit être un nombre dans [0, 50]"}',
  'ammonia = null': '{"ok":false,"error":"eau : ammonia doit être un nombre dans [0, 50]"}',
  'nitrite = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  'nitrite = 100': '{"ok":false,"error":"eau : nitrite doit être un nombre dans [0, 12.5]"}',
  'nitrite = 50': '{"ok":false,"error":"eau : nitrite doit être un nombre dans [0, 12.5]"}',
  'nitrite = -0.01': '{"ok":false,"error":"eau : nitrite doit être un nombre dans [0, 12.5]"}',
  'nitrite = 100.01': '{"ok":false,"error":"eau : nitrite doit être un nombre dans [0, 12.5]"}',
  'nitrite = NaN': '{"ok":false,"error":"eau : nitrite doit être un nombre dans [0, 12.5]"}',
  "nitrite = '1'": '{"ok":false,"error":"eau : nitrite doit être un nombre dans [0, 12.5]"}',
  'ammonia = 50.01': '{"ok":false,"error":"eau : ammonia doit être un nombre dans [0, 50]"}',
  'nitrite = 12.5':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":12.5,"nitrate":5,"filter":1,"ph":7}}',
  'nitrite = 12.51': '{"ok":false,"error":"eau : nitrite doit être un nombre dans [0, 12.5]"}',
  'nitrite = null': '{"ok":false,"error":"eau : nitrite doit être un nombre dans [0, 12.5]"}',
  'nitrate = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":0,"filter":1,"ph":7}}',
  'nitrate = 100':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":100,"filter":1,"ph":7}}',
  'nitrate = 50':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":50,"filter":1,"ph":7}}',
  'nitrate = -0.01': '{"ok":false,"error":"eau : nitrate doit être un nombre dans [0, 100]"}',
  'nitrate = 100.01': '{"ok":false,"error":"eau : nitrate doit être un nombre dans [0, 100]"}',
  'nitrate = NaN': '{"ok":false,"error":"eau : nitrate doit être un nombre dans [0, 100]"}',
  "nitrate = '1'": '{"ok":false,"error":"eau : nitrate doit être un nombre dans [0, 100]"}',
  'nitrate = null': '{"ok":false,"error":"eau : nitrate doit être un nombre dans [0, 100]"}',
  'filter = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":0,"ph":7}}',
  'filter = 1':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  'filter = 0.5':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":0.5,"ph":7}}',
  'filter = -0.01': '{"ok":false,"error":"eau : filter doit être un nombre dans [0, 1]"}',
  'filter = 1.01': '{"ok":false,"error":"eau : filter doit être un nombre dans [0, 1]"}',
  'filter = NaN': '{"ok":false,"error":"eau : filter doit être un nombre dans [0, 1]"}',
  "filter = '1'": '{"ok":false,"error":"eau : filter doit être un nombre dans [0, 1]"}',
  'filter = null': '{"ok":false,"error":"eau : filter doit être un nombre dans [0, 1]"}',
  'heater = 16':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"heater":16}}',
  'heater = 32':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"heater":32}}',
  'heater = 24':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"heater":24}}',
  'heater = 15.99': '{"ok":false,"error":"eau : heater doit être un nombre dans [16, 32]"}',
  'heater = 32.01': '{"ok":false,"error":"eau : heater doit être un nombre dans [16, 32]"}',
  'heater = NaN': '{"ok":false,"error":"eau : heater doit être un nombre dans [16, 32]"}',
  "heater = '1'": '{"ok":false,"error":"eau : heater doit être un nombre dans [16, 32]"}',
  'heater = null': '{"ok":false,"error":"eau : heater doit être un nombre dans [16, 32]"}',
  'ph = 4':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":4}}',
  'ph = 9.5':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":9.5}}',
  'ph = 6.75':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":6.75}}',
  'ph = 3.99': '{"ok":false,"error":"eau : ph doit être un nombre dans [4, 9.5]"}',
  'ph = 9.51': '{"ok":false,"error":"eau : ph doit être un nombre dans [4, 9.5]"}',
  'ph = NaN': '{"ok":false,"error":"eau : ph doit être un nombre dans [4, 9.5]"}',
  "ph = '1'": '{"ok":false,"error":"eau : ph doit être un nombre dans [4, 9.5]"}',
  'ph = null': '{"ok":false,"error":"eau : ph doit être un nombre dans [4, 9.5]"}',
  'lighting = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"lighting":0}}',
  'lighting = 24':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"lighting":24}}',
  'lighting = 12':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"lighting":12}}',
  'lighting = -0.01': '{"ok":false,"error":"eau : lighting doit être un entier dans [0, 24]"}',
  'lighting = 24.01': '{"ok":false,"error":"eau : lighting doit être un entier dans [0, 24]"}',
  'lighting = NaN': '{"ok":false,"error":"eau : lighting doit être un entier dans [0, 24]"}',
  "lighting = '1'": '{"ok":false,"error":"eau : lighting doit être un entier dans [0, 24]"}',
  'lighting = null': '{"ok":false,"error":"eau : lighting doit être un entier dans [0, 24]"}',
  'lighting = 12.5': '{"ok":false,"error":"eau : lighting doit être un entier dans [0, 24]"}',
  'lampOn = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"lampOn":0}}',
  'lampOn = 23':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"lampOn":23}}',
  'lampOn = 11.5': '{"ok":false,"error":"eau : lampOn doit être un entier dans [0, 23]"}',
  'lampOn = -0.01': '{"ok":false,"error":"eau : lampOn doit être un entier dans [0, 23]"}',
  'lampOn = 23.01': '{"ok":false,"error":"eau : lampOn doit être un entier dans [0, 23]"}',
  'lampOn = NaN': '{"ok":false,"error":"eau : lampOn doit être un entier dans [0, 23]"}',
  "lampOn = '1'": '{"ok":false,"error":"eau : lampOn doit être un entier dans [0, 23]"}',
  'lampOn = null': '{"ok":false,"error":"eau : lampOn doit être un entier dans [0, 23]"}',
  'lampOn = 24': '{"ok":false,"error":"eau : lampOn doit être un entier dans [0, 23]"}',
  'gh = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"gh":0}}',
  'gh = 400':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"gh":400}}',
  'gh = 200':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"gh":200}}',
  'gh = -0.01': '{"ok":false,"error":"eau : gh doit être un nombre dans [0, 400]"}',
  'gh = 400.01': '{"ok":false,"error":"eau : gh doit être un nombre dans [0, 400]"}',
  'gh = NaN': '{"ok":false,"error":"eau : gh doit être un nombre dans [0, 400]"}',
  "gh = '1'": '{"ok":false,"error":"eau : gh doit être un nombre dans [0, 400]"}',
  'gh = null': '{"ok":false,"error":"eau : gh doit être un nombre dans [0, 400]"}',
  'kh = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"kh":0}}',
  'kh = 400':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"kh":400}}',
  'kh = 200':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"kh":200}}',
  'kh = -0.01': '{"ok":false,"error":"eau : kh doit être un nombre dans [0, 400]"}',
  'kh = 400.01': '{"ok":false,"error":"eau : kh doit être un nombre dans [0, 400]"}',
  'kh = NaN': '{"ok":false,"error":"eau : kh doit être un nombre dans [0, 400]"}',
  "kh = '1'": '{"ok":false,"error":"eau : kh doit être un nombre dans [0, 400]"}',
  'kh = null': '{"ok":false,"error":"eau : kh doit être un nombre dans [0, 400]"}',
  'salt = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"salt":0}}',
  'salt = 5':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"salt":5}}',
  'salt = 2.5':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"salt":2.5}}',
  'salt = -0.01': '{"ok":false,"error":"eau : salt doit être un nombre dans [0, 5]"}',
  'salt = 5.01': '{"ok":false,"error":"eau : salt doit être un nombre dans [0, 5]"}',
  'salt = NaN': '{"ok":false,"error":"eau : salt doit être un nombre dans [0, 5]"}',
  "salt = '1'": '{"ok":false,"error":"eau : salt doit être un nombre dans [0, 5]"}',
  'salt = null': '{"ok":false,"error":"eau : salt doit être un nombre dans [0, 5]"}',
  'medication = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"medication":0}}',
  'medication = 1.5':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"medication":1.5}}',
  'medication = 0.75':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"medication":0.75}}',
  'medication = -0.01': '{"ok":false,"error":"eau : medication doit être un nombre dans [0, 1.5]"}',
  'medication = 1.51': '{"ok":false,"error":"eau : medication doit être un nombre dans [0, 1.5]"}',
  'medication = NaN': '{"ok":false,"error":"eau : medication doit être un nombre dans [0, 1.5]"}',
  "medication = '1'": '{"ok":false,"error":"eau : medication doit être un nombre dans [0, 1.5]"}',
  'medication = null': '{"ok":false,"error":"eau : medication doit être un nombre dans [0, 1.5]"}',
  'ichCure = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"ichCure":0}}',
  'ichCure = 1': '{"ok":false,"error":"eau : ichCure doit être un nombre dans [0, 1["}',
  'ichCure = 0.5':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"ichCure":0.5}}',
  'ichCure = -0.01': '{"ok":false,"error":"eau : ichCure doit être un nombre dans [0, 1["}',
  'ichCure = 1.01': '{"ok":false,"error":"eau : ichCure doit être un nombre dans [0, 1["}',
  'ichCure = NaN': '{"ok":false,"error":"eau : ichCure doit être un nombre dans [0, 1["}',
  "ichCure = '1'": '{"ok":false,"error":"eau : ichCure doit être un nombre dans [0, 1["}',
  'ichCure = null': '{"ok":false,"error":"eau : ichCure doit être un nombre dans [0, 1["}',
  'ichCure = 0.999':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"ichCure":0.999}}',
  'bacteriaStarter = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"bacteriaStarter":0}}',
  'bacteriaStarter = 1':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"bacteriaStarter":1}}',
  'bacteriaStarter = 0.5':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"bacteriaStarter":0.5}}',
  'bacteriaStarter = -0.01':
    '{"ok":false,"error":"eau : bacteriaStarter doit être un nombre dans [0, 1]"}',
  'bacteriaStarter = 1.01':
    '{"ok":false,"error":"eau : bacteriaStarter doit être un nombre dans [0, 1]"}',
  'bacteriaStarter = NaN':
    '{"ok":false,"error":"eau : bacteriaStarter doit être un nombre dans [0, 1]"}',
  "bacteriaStarter = '1'":
    '{"ok":false,"error":"eau : bacteriaStarter doit être un nombre dans [0, 1]"}',
  'bacteriaStarter = null':
    '{"ok":false,"error":"eau : bacteriaStarter doit être un nombre dans [0, 1]"}',
  'chlorine = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"chlorine":0}}',
  'chlorine = 2':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"chlorine":2}}',
  'chlorine = 1':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"chlorine":1}}',
  'chlorine = -0.01': '{"ok":false,"error":"eau : chlorine doit être un nombre dans [0, 2]"}',
  'chlorine = 2.01': '{"ok":false,"error":"eau : chlorine doit être un nombre dans [0, 2]"}',
  'chlorine = NaN': '{"ok":false,"error":"eau : chlorine doit être un nombre dans [0, 2]"}',
  "chlorine = '1'": '{"ok":false,"error":"eau : chlorine doit être un nombre dans [0, 2]"}',
  'chlorine = null': '{"ok":false,"error":"eau : chlorine doit être un nombre dans [0, 2]"}',
  'ammoniaBinder = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"ammoniaBinder":0}}',
  'ammoniaBinder = 1000000000':
    '{"ok":false,"error":"eau : ammoniaBinder doit être un nombre dans [0, 2400]"}',
  'ammoniaBinder = 500000000':
    '{"ok":false,"error":"eau : ammoniaBinder doit être un nombre dans [0, 2400]"}',
  'ammoniaBinder = -0.01':
    '{"ok":false,"error":"eau : ammoniaBinder doit être un nombre dans [0, 2400]"}',
  'ammoniaBinder = 1000000000.01':
    '{"ok":false,"error":"eau : ammoniaBinder doit être un nombre dans [0, 2400]"}',
  'ammoniaBinder = NaN':
    '{"ok":false,"error":"eau : ammoniaBinder doit être un nombre dans [0, 2400]"}',
  "ammoniaBinder = '1'":
    '{"ok":false,"error":"eau : ammoniaBinder doit être un nombre dans [0, 2400]"}',
  'ammoniaBinder = null':
    '{"ok":false,"error":"eau : ammoniaBinder doit être un nombre dans [0, 2400]"}',
  'phRegulatorWait = 0':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"phRegulatorWait":0}}',
  'phRegulatorWait = 1000000000':
    '{"ok":false,"error":"eau : phRegulatorWait doit être un nombre dans [0, 400]"}',
  'phRegulatorWait = 500000000':
    '{"ok":false,"error":"eau : phRegulatorWait doit être un nombre dans [0, 400]"}',
  'phRegulatorWait = -0.01':
    '{"ok":false,"error":"eau : phRegulatorWait doit être un nombre dans [0, 400]"}',
  'phRegulatorWait = 1000000000.01':
    '{"ok":false,"error":"eau : phRegulatorWait doit être un nombre dans [0, 400]"}',
  'phRegulatorWait = NaN':
    '{"ok":false,"error":"eau : phRegulatorWait doit être un nombre dans [0, 400]"}',
  "phRegulatorWait = '1'":
    '{"ok":false,"error":"eau : phRegulatorWait doit être un nombre dans [0, 400]"}',
  'phRegulatorWait = null':
    '{"ok":false,"error":"eau : phRegulatorWait doit être un nombre dans [0, 400]"}',
  'untreatedTap = true':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"untreatedTap":true}}',
  'untreatedTap = false':
    '{"ok":false,"error":"eau : untreatedTap doit valoir true ou être absent"}',
  "untreatedTap = 'true'":
    '{"ok":false,"error":"eau : untreatedTap doit valoir true ou être absent"}',
  'untreatedTap = 1': '{"ok":false,"error":"eau : untreatedTap doit valoir true ou être absent"}',
  'cycling = true':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"cycling":true}}',
  'cycling = false': '{"ok":false,"error":"eau : cycling doit valoir true ou être absent"}',
  "cycling = 'true'": '{"ok":false,"error":"eau : cycling doit valoir true ou être absent"}',
  'cycling = 1': '{"ok":false,"error":"eau : cycling doit valoir true ou être absent"}',
  'carbon = true':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"carbon":true}}',
  'carbon = false': '{"ok":false,"error":"eau : carbon doit valoir true ou être absent"}',
  "carbon = 'true'": '{"ok":false,"error":"eau : carbon doit valoir true ou être absent"}',
  'carbon = 1': '{"ok":false,"error":"eau : carbon doit valoir true ou être absent"}',
  'catappa vide':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  catappa:
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"catappa":[0,0.5,1]}}',
  'catappa texte': '{"ok":false,"error":"eau : catappa doit être une liste d\'au plus 5 réserves"}',
  'catappa hors bornes': '{"ok":false,"error":"eau : réserve de catappa dans [0, 1] attendue"}',
  'catappa trop longue':
    '{"ok":false,"error":"eau : catappa doit être une liste d\'au plus 5 réserves"}',
  'algae nulles':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  'algae vides':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  algae:
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"algae":[0.2,0,1]}}',
  'algae texte':
    '{"ok":false,"error":"eau : algae doit être une liste d’au plus 8 nombres dans [0, 1]"}',
  'algae hors bornes':
    '{"ok":false,"error":"eau : algae doit être une liste d’au plus 8 nombres dans [0, 1]"}',
  'plantGrowth vide':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  'plantGrowth nulle':
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7}}',
  plantGrowth:
    '{"ok":true,"water":{"temperature":25,"ammonia":0,"nitrite":0,"nitrate":5,"filter":1,"ph":7,"plantGrowth":{"12":0.5}}}',
  'plantGrowth tableau':
    '{"ok":false,"error":"eau : plantGrowth doit associer des graines à des nombres dans [0, 1000]"}',
  'plantGrowth clé invalide':
    '{"ok":false,"error":"eau : plantGrowth doit associer des graines à des nombres dans [0, 1000]"}',
  'ordre : température avant heater':
    '{"ok":false,"error":"eau : temperature doit être un nombre dans [0, 40]"}',
  'ordre : heater avant ph':
    '{"ok":false,"error":"eau : heater doit être un nombre dans [16, 32]"}',
  'ordre : ph avant catappa': '{"ok":false,"error":"eau : ph doit être un nombre dans [4, 9.5]"}',
  'ordre : catappa avant lighting':
    '{"ok":false,"error":"eau : catappa doit être une liste d\'au plus 5 réserves"}',
  'ordre : lighting avant lampOn':
    '{"ok":false,"error":"eau : lighting doit être un entier dans [0, 24]"}',
  'ordre : lampOn avant algae':
    '{"ok":false,"error":"eau : lampOn doit être un entier dans [0, 23]"}',
  'ordre : algae avant plantGrowth':
    '{"ok":false,"error":"eau : algae doit être une liste d’au plus 8 nombres dans [0, 1]"}',
  'ordre : plantGrowth avant gh':
    '{"ok":false,"error":"eau : plantGrowth doit associer des graines à des nombres dans [0, 1000]"}',
  'ordre : gh avant kh': '{"ok":false,"error":"eau : gh doit être un nombre dans [0, 400]"}',
  'ordre : kh avant salt': '{"ok":false,"error":"eau : kh doit être un nombre dans [0, 400]"}',
  'ordre : salt avant phRegulatorWait':
    '{"ok":false,"error":"eau : salt doit être un nombre dans [0, 5]"}',
  'ordre : phRegulatorWait avant untreatedTap':
    '{"ok":false,"error":"eau : phRegulatorWait doit être un nombre dans [0, 400]"}',
  'ordre : untreatedTap avant cycling':
    '{"ok":false,"error":"eau : untreatedTap doit valoir true ou être absent"}',
  'ordre : cycling avant carbon':
    '{"ok":false,"error":"eau : cycling doit valoir true ou être absent"}',
};

describe('caractérisation de readWater (#686, lot 4)', () => {
  it('chaque cas a un nom unique', () => {
    expect(new Set(CASES.map(([name]) => name)).size).toBe(CASES.length);
  });

  it('sorties identiques, ordre des clés compris', () => {
    const actual: Record<string, string> = {};
    for (const [name, value, environment] of CASES) {
      actual[name] = JSON.stringify(readWater(value, environment));
    }
    expect(actual).toEqual(EXPECTED);
  });

  it('les listes relues sont des copies', () => {
    const catappa = [0.5];
    const algae = [0.5];
    const result = readWater({ ...BASE, catappa, algae }, 'tropical');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.water.catappa).not.toBe(catappa);
      expect(result.water.algae).not.toBe(algae);
    }
  });
});
