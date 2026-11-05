import { expect } from 'vitest';

import { type WalkerGround } from '../axolotl';
import { environmentWater, PALUDARIUM } from '../environment';
import { frogModeOf, type FrogMode } from '../frog';
import { advanceInPlace, type MutableWorld } from '../world';

/**
 * Aide de test partagée par `frog.spec.ts` et `triton.spec.ts` (#235). Ce n'est pas une
 * spec : l'importer n'enregistre aucun test. Hors du build de l'application
 * (`tsconfig.app.json`) et des mutants (`stryker.config.json`).
 */

/** Sol du paludarium, où vivent grenouilles et tritons. */
const GROUND: WalkerGround = { water: environmentWater('paludarium'), terrain: PALUDARIUM.terrain };

/**
 * Suit chaque individu de `world` pendant `steps` pas et vérifie l'inclinaison à la sortie de
 * l'eau (#233) : de la reprise de la berge (`nage` → `sortie`) jusqu'à la fin du premier saut
 * qui suit la sortie (`posee` → `saut` ou `entree`), la variation par pas reste sous
 * `maxStep`, l'animal arrive à plat sur la berge et le premier saut part à plat. Rend le
 * nombre de sorties suivies jusqu'au bout.
 */
export function followExits(world: MutableWorld, steps: number, maxStep: number): number {
  type Stage = 'sortie' | 'posee' | 'saut';
  const stage = new Map<number, Stage>();
  const previous = new Map<number, FrogMode>();
  let completed = 0;
  for (let t = 0; t < steps; t++) {
    advanceInPlace(world, 1);
    for (const f of world.entities) {
      const mode = frogModeOf(f, world.seed, world.time, GROUND);
      const before = previous.get(f.id);
      previous.set(f.id, mode);
      if (before === 'nage' && mode === 'sortie') {
        stage.set(f.id, 'sortie');
      }
      const current = stage.get(f.id);
      if (current === undefined) {
        continue;
      }
      expect(Math.abs(f.pitch - f.ppitch)).toBeLessThanOrEqual(maxStep);
      if (current === 'sortie' && mode === 'posee') {
        // Arrivée sur la berge : à plat, comme pendant toute la nage de sortie.
        expect(f.pitch).toBe(0);
        stage.set(f.id, 'posee');
      } else if (current === 'posee' && (mode === 'saut' || mode === 'entree')) {
        // Premier saut : part à plat, puis s'incline d'au plus `maxStep` par pas.
        expect(f.ppitch).toBe(0);
        stage.set(f.id, 'saut');
      } else if (current === 'saut' && f.ascent === 0) {
        completed += 1;
        stage.delete(f.id);
      } else if (current === 'sortie' && mode === 'nage') {
        // Le milieu voulu a de nouveau basculé vers l'eau avant la berge : sortie abandonnée.
        stage.delete(f.id);
      }
    }
  }
  return completed;
}
