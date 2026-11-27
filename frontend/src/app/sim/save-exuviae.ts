import { environmentWater, type Place } from './environment';
import { isSpeciesId } from './population';
import {
  describe,
  field,
  firstProblemOf,
  insideBox,
  isNumberIn,
  isRecord,
  own,
  readList,
  type FieldRule,
  type ListRule,
} from './save-schema';
import { MAX_EXUVIAE, moltsShell, type Exuvia } from './shrimp-molt';
import type { SpeciesId } from './species';
import type { Box3 } from './tank';

/**
 * Exuvies d'une sauvegarde (issue #859, `sim/shrimp-molt.ts`) : absentes, aucune ; présentes,
 * une liste d'au plus `MAX_EXUVIAE` carapaces d'une espèce qui mue, dans l'eau, de cap, de taille
 * dans ]0, 1] et de temps de mue réels. Seuls les champs connus sont copiés.
 */
export function parseExuviaList(value: unknown, place: Place, problems: string[]): Exuvia[] {
  if (value === undefined) {
    return [];
  }
  const items = readList(value, EXUVIA_LIST, problems);
  if (items === null) {
    return [];
  }
  const rules = exuviaRules(environmentWater(place));
  const shells: Exuvia[] = [];
  items.forEach((item: unknown, i) => {
    const problem = isRecord(item) ? firstProblemOf(item, rules) : 'doit être un objet';
    if (problem !== null) {
      problems.push(`exuvie ${i} : ${problem}`);
      return;
    }
    const shell = item as Record<string, unknown>;
    shells.push({
      species: own(shell, 'species') as SpeciesId,
      x: own(shell, 'x') as number,
      y: own(shell, 'y') as number,
      z: own(shell, 'z') as number,
      yaw: own(shell, 'yaw') as number,
      size: own(shell, 'size') as number,
      time: own(shell, 'time') as number,
    });
  });
  return shells;
}

const EXUVIA_LIST: ListRule = {
  key: 'exuviae',
  max: MAX_EXUVIAE,
  countMessage: (count) => `trop d’exuvies (${count}, ${MAX_EXUVIAE} au plus)`,
};

const finite = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);

function exuviaRules(water: Box3): readonly FieldRule[] {
  return [
    field(
      'species',
      (v) => isSpeciesId(v) && moltsShell(v),
      (v) => `espèce sans mue (${describe(v)})`,
    ),
    {
      valid: (shell) => {
        const [x, y, z] = [own(shell, 'x'), own(shell, 'y'), own(shell, 'z')];
        return (
          finite(x) &&
          finite(y) &&
          finite(z) &&
          insideBox(water, x as number, y as number, z as number)
        );
      },
      message: 'position hors de l’eau',
    },
    field('yaw', finite, 'cap invalide'),
    field('size', (v) => isNumberIn(v, Number.MIN_VALUE, 1), 'taille hors de ]0, 1]'),
    field('time', (v) => isNumberIn(v, 0, Number.MAX_VALUE), 'temps de mue invalide'),
  ];
}
