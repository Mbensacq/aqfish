// Mesure du coût d'une pièce de N bacs et M animaux (#392, lot 4 de #264, ADR 0096).
//
// Usage : node --expose-gc scripts/mesure-piece.mjs [--repetitions=5] [--pas=120] [--json]
//
// Ce que le script mesure, dans Node (pas dans le navigateur) :
// - coût déterministe d'un pas de simulation : paires de congénères examinées par le banc
//   (O(n²) par espèce et par bac, `sim/room-limits.ts`, `roomSimulationCost`) ;
// - temps d'un pas de toute la pièce (`stepRoom`), médiane de plusieurs répétitions ;
// - mémoire du tas après construction de la pièce (avec --expose-gc, sinon « n/d ») ;
// - taille de la sauvegarde (`serializeRoom`) ;
// - blocs statiques des bacs posés (`roomLayoutBlocks`), seul coût d'image ajouté par un bac
//   non affiché (ses animaux ne sont pas dessinés).
//
// Ce qu'il ne mesure PAS : le temps d'image (WebGL en rendu logiciel dans l'environnement des
// agents, docs/PIEGES.md) ni le coût sur téléphone. Les temps sont des ordres de grandeur,
// qui varient d'une machine à l'autre : ce script n'est pas un test de CI.
import { build } from 'esbuild';
import { join } from 'node:path';

const SIM = join(import.meta.dirname, '..', 'src', 'app', 'sim');

const ENTRY = `
export { createRoom, stepRoom, addTank, addSupport } from './room-state';
export { serializeRoom } from './room-save';
export { setPopulationInPlace } from './population';
export { environmentById } from './environment';
export { roomLayoutBlocks } from './room-layout';
export { roomAnimalCount, roomSimulationCost, ROOM_TANK_CAP, ROOM_ANIMAL_CAP } from './room-limits';
`;

function option(name, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (arg === undefined) {
    return fallback;
  }
  const value = Number(arg.slice(name.length + 3));
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`mesure-piece : --${name} doit être un entier strictement positif`);
    process.exit(1);
  }
  return value;
}

async function loadSim() {
  const result = await build({
    stdin: { contents: ENTRY, resolveDir: SIM, loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function heapUsed() {
  if (typeof globalThis.gc !== 'function') {
    return null;
  }
  globalThis.gc();
  return process.memoryUsage().heapUsed;
}

/**
 * Pièce de `tanks` bacs tropicaux, `perTank` animaux dans chacun (animaux de départ retirés),
 * répartis sur les `speciesPerTank` premières espèces tropicales (néon, guppy, corydora…),
 * chacune bornée par son plafond d'espèce.
 */
function makeRoom(sim, tanks, perTank, speciesPerTank) {
  const room = sim.createRoom(42, Array(tanks).fill('tropical'));
  const all = sim.environmentById('tropical').species;
  const species = all.slice(0, speciesPerTank);
  for (const tank of room.tanks) {
    for (const s of all) {
      sim.setPopulationInPlace(tank.world, s, 0);
    }
    let left = perTank;
    species.forEach((s, i) => {
      const count = Math.ceil(left / (species.length - i));
      sim.setPopulationInPlace(tank.world, s, count);
      left -= count;
    });
  }
  return room;
}

function measure(sim, tanks, perTank, speciesPerTank, steps, repetitions) {
  const before = heapUsed();
  let room = makeRoom(sim, tanks, perTank, speciesPerTank);
  const after = heapUsed();
  const animals = sim.roomAnimalCount(room);
  const cost = sim.roomSimulationCost(room);
  room = sim.stepRoom(room, 10); // chauffe
  const times = [];
  for (let r = 0; r < repetitions; r++) {
    const start = process.hrtime.bigint();
    room = sim.stepRoom(room, steps);
    times.push(Number(process.hrtime.bigint() - start) / 1e6 / steps);
  }
  const save = sim.serializeRoom(room, room.tanks[0].id).length;
  return {
    tanks,
    perTank,
    speciesPerTank,
    animals,
    cost,
    msPerStep: median(times),
    heapKiB: before === null || after === null ? null : Math.round((after - before) / 1024),
    saveKiB: Math.ceil(save / 1024),
  };
}

const repetitions = option('repetitions', 5);
const steps = option('pas', 120);
const sim = await loadSim();

const rows = [];
for (const tanks of [1, 4, 8, 16, 32]) {
  for (const perTank of [10, 30, 60]) {
    rows.push(measure(sim, tanks, perTank, 3, steps, repetitions));
  }
}

// Blocs statiques des bacs posés : le bac seul n'en a aucun ; chaque bac posé en ajoute.
const blocks = [];
{
  let room = sim.createRoom(42);
  const wanted = [1, 4, 8, 15];
  // Petits bacs au sol, sur une grille de 80 × 60 cm (positions en mètres, au centimètre).
  for (let zi = -9; zi <= 9 && wanted.length > 0; zi++) {
    for (let xi = -9; xi <= 9 && wanted.length > 0; xi++) {
      const result = sim.addTank(room, {
        environment: 'tropical',
        size: 'petit',
        placement: { supportId: null, x: (xi * 40) / 100, z: (zi * 30) / 100, quarter: 0 },
      });
      if (!result.ok) {
        continue;
      }
      room = result.room;
      const posed = room.tanks.length - 1;
      if (posed === wanted[0]) {
        wanted.shift();
        blocks.push({ posed, blocks: sim.roomLayoutBlocks(room, 0.75).length });
      }
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ steps, repetitions, rows, blocks }, null, 2));
} else {
  console.log(
    `Pièce : plafonds ${sim.ROOM_TANK_CAP} bacs, ${sim.ROOM_ANIMAL_CAP} animaux ; ${repetitions} répétitions de ${steps} pas, médiane.`,
  );
  console.log(
    '| Bacs | Animaux/bac | Espèces/bac | Animaux | Paires/pas | ms/pas | ms/s (60 pas) | Tas (Kio) | Sauvegarde (Kio) |',
  );
  console.log('|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    console.log(
      `| ${r.tanks} | ${r.perTank} | ${r.speciesPerTank} | ${r.animals} | ${r.cost} | ${r.msPerStep.toFixed(3)} | ${(r.msPerStep * 60).toFixed(1)} | ${r.heapKiB ?? 'n/d'} | ${r.saveKiB} |`,
    );
  }
  console.log('');
  console.log('| Bacs posés | Blocs statiques |');
  console.log('|---:|---:|');
  for (const b of blocks) {
    console.log(`| ${b.posed} | ${b.blocks} |`);
  }
  console.log('');
  console.log(
    'Non mesuré ici : temps d’image (WebGL logiciel), téléphone. Ordres de grandeur seulement.',
  );
}
