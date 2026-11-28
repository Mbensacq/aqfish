import { ageDays, type AgeReadout } from '../aging-text';
import type { SpeciesId } from '../species';

/**
 * Oracle de test du tampon des âges (`age-readout-buffer.spec.ts`, #875) : ce n'est pas une
 * spec, l'importer n'enregistre aucun test. Hors du build de l'application
 * (`tsconfig.app.json`) et des mutants (`stryker.config.json`).
 */

/** Vrai si deux relevés donnent les mêmes textes (même nombre de jours partout). */
export function sameAgeDays(a: AgeReadout, b: AgeReadout): boolean {
  const keys = Object.keys(a) as SpeciesId[];
  if (keys.length !== Object.keys(b).length) {
    return false;
  }
  return keys.every((id) => {
    const x = a[id];
    const y = b[id];
    return (
      x !== undefined &&
      y !== undefined &&
      ageDays(x.youngest) === ageDays(y.youngest) &&
      ageDays(x.oldest) === ageDays(y.oldest)
    );
  });
}
