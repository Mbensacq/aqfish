import { publicReference } from './species-sheet';
import { SPECIES_LABELS } from './species-catalog';
import { SPECIES, type SpeciesId } from './species';
import { verdict, type VerdictCause, type VerdictLevel, type VerdictReason } from './verdict';

/**
 * Matrice des verdicts de toutes les paires (issue #816, ADR 0174), en Markdown, pour
 * `docs/ESPECES.md` et la PR. Générée depuis `frontend/` par (`tsx` ponctuel, comme `jscpd`
 * dans `docs/CONVENTIONS.md`) :
 *
 * ```bash
 * npx -y tsx@4.20.6 -e "import('./src/app/sim/verdict-matrix.ts').then((m) => console.log((m.verdictMatrixMarkdown ?? m.default.verdictMatrixMarkdown)()))"
 * ```
 */

/** Symbole de chaque niveau dans la grille. */
export const LEVEL_SYMBOLS: Readonly<Record<VerdictLevel, string>> = {
  compatible: '✅',
  precautions: '⚠️',
  incompatible: '❌',
};

/** Texte de chaque cause, du point de vue de l'espèce qui agit quand il y en a une. */
export const CAUSE_TEXT: Readonly<Record<VerdictCause, string>> = {
  salinite: 'eau douce et eau de mer',
  'classe-thermique': 'eau froide et eau tropicale',
  temperature: 'température',
  ph: 'pH',
  durete: 'dureté',
  'mange-adultes': 'mange les adultes',
  'mange-jeunes': 'mange les jeunes',
  taille: 'mange les plus petits (taille)',
  territoriaux: 'deux espèces territoriales',
  nageoires: 'mordille les longues nageoires',
  vitesse: 'nageur rapide face à un lent',
  'sans-poissons': 'vit sans poissons',
};

/** Paire d'espèces `(i, j)`, `i < j`, dans l'ordre de `SPECIES`. */
export interface MatrixPair {
  readonly first: SpeciesId;
  readonly second: SpeciesId;
}

/** Toutes les paires d'espèces différentes, dans l'ordre de `SPECIES`. */
export function allPairs(): readonly MatrixPair[] {
  const ids = Object.keys(SPECIES) as SpeciesId[]; // clés de `SPECIES` = `SpeciesId`
  const pairs: MatrixPair[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push({ first: ids[i], second: ids[j] });
    }
  }
  return pairs;
}

/** Texte d'une raison : « néon : mange les jeunes (précautions) ». */
export function reasonText(reason: VerdictReason): string {
  const who = reason.actor === null ? '' : `${SPECIES_LABELS[reason.actor].singular} : `;
  const level = reason.level === 'incompatible' ? 'incompatible' : 'précautions';
  return `${who}${CAUSE_TEXT[reason.cause]} (${level})`;
}

/** Source d'une raison, lisible hors du dépôt (« approximation de jeu » sinon). */
export function reasonSource(reason: VerdictReason): string {
  return reason.status.kind === 'source'
    ? publicReference(reason.status.reference)
    : 'approximation de jeu';
}

function label(id: SpeciesId): string {
  return SPECIES_LABELS[id].singular;
}

function grid(ids: readonly SpeciesId[]): string[] {
  const header = `| | ${ids.map((_, k) => String(k + 1)).join(' | ')} |`;
  const rule = `|---|${ids.map(() => '---').join('|')}|`;
  const rows = ids.map((a, k) => {
    const cells = ids.map((b) => (a === b ? '—' : LEVEL_SYMBOLS[verdict(a, b).level]));
    return `| ${k + 1}. ${label(a)} | ${cells.join(' | ')} |`;
  });
  return [header, rule, ...rows];
}

function isClassMismatch(reasons: readonly VerdictReason[]): boolean {
  return reasons.some((r) => r.cause === 'salinite' || r.cause === 'classe-thermique');
}

/** Paires dont une raison cite un désaccord entre sources (« désaccord » dans sa référence). */
function disagreements(pairs: readonly MatrixPair[]): string[] {
  const lines: string[] = [];
  for (const { first, second } of pairs) {
    const cited = verdict(first, second).reasons.filter((r) =>
      reasonSource(r).includes('désaccord'),
    );
    for (const r of cited) {
      lines.push(`- ${label(first)} et ${label(second)} : ${reasonText(r)} [${reasonSource(r)}]`);
    }
  }
  return lines;
}

function detail(pairs: readonly MatrixPair[]): string[] {
  const lines = ['| Paire | Verdict | Raisons et sources |', '|---|---|---|'];
  for (const { first, second } of pairs) {
    const { level, reasons } = verdict(first, second);
    if (level === 'compatible' || isClassMismatch(reasons)) {
      continue;
    }
    const texts = reasons.map((r) => `${reasonText(r)} [${reasonSource(r)}]`);
    lines.push(
      `| ${label(first)} et ${label(second)} | ${LEVEL_SYMBOLS[level]} | ${texts.join(' ; ')} |`,
    );
  }
  return lines;
}

/**
 * Matrice en Markdown : grille des niveaux (espèces numérotées dans l'ordre de `SPECIES`), puis
 * détail de chaque paire défavorable de même classe d'eau, avec ses raisons et leurs sources.
 * Les paires de classes différentes sont incompatibles par la classe seule (approximation de
 * jeu) et ne sont pas détaillées. Enfin, les raisons dont la source cite un désaccord.
 */
export function verdictMatrixMarkdown(): string {
  const ids = Object.keys(SPECIES) as SpeciesId[]; // clés de `SPECIES` = `SpeciesId`
  const pairs = allPairs();
  return [
    ...grid(ids),
    '',
    ...detail(pairs),
    '',
    'Désaccords entre sources :',
    '',
    ...disagreements(pairs),
  ].join('\n');
}
