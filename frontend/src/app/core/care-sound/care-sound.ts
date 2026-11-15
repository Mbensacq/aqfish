/**
 * Bruitages de la séance d'entretien (#625, ADR 0144) : logique pure des sons courts joués
 * pendant les gestes de la séance (raclette sur la vitre, eau du siphon, eau du seau, clic de
 * fin d'étape), synthétisés par le moteur des sons d'ambiance (ADR 0100), sans fichier audio.
 *
 * Chaque bruitage est décrit par ses paramètres (durée, hauteur de départ et d'arrivée, part
 * de bruit, filtre, niveau) ; une légère variation de hauteur est tirée d'un générateur à
 * graine propre aux bruitages, jamais de celui du monde. Module pur (ni Angular, ni Web Audio) ;
 * rien n'est importé de `sim/` (étapes et issues arrivent sous forme de chaînes).
 */

import { clampVolume } from '../ambient-sound/ambient-sound';
import { createPrng, type Prng } from '../random/prng';

/** Bruitages de la séance. */
export type CareSoundKind = 'raclette' | 'siphon' | 'seau' | 'clic';

/** Liste des bruitages. */
export const CARE_SOUND_KINDS: readonly CareSoundKind[] = ['raclette', 'siphon', 'seau', 'clic'];

/** Paramètres d'un bruitage (une source de bruit filtré et une sinusoïde, même enveloppe). */
export interface CareSoundSpec {
  /** Durée totale (s), attaque comprise. */
  readonly duration: number;
  /** Attaque (s) : montée du niveau, puis chute exponentielle jusqu'à la fin. */
  readonly attack: number;
  /** Hauteur de la sinusoïde au départ et à la fin (Hz). */
  readonly pitchStart: number;
  readonly pitchEnd: number;
  /** Part du bruit dans [0, 1] (le reste : la sinusoïde). */
  readonly noise: number;
  /** Filtre du bruit. */
  readonly filter: 'lowpass' | 'bandpass' | 'highpass';
  /** Fréquence du filtre (Hz). */
  readonly filterFrequency: number;
  /** Niveau de crête dans [0, 1], avant le volume. */
  readonly gain: number;
}

/**
 * Table des bruitages : raclette (frottement aigu et bref), siphon (gargouillis grave), seau
 * (eau versée, bruit plus large et plus long), clic (sinusoïde brève, presque sans bruit).
 * Niveaux bas : les bruitages restent en retrait du fond sonore.
 */
export const CARE_SOUNDS: Readonly<Record<CareSoundKind, CareSoundSpec>> = Object.freeze({
  raclette: Object.freeze({
    duration: 0.12,
    attack: 0.01,
    pitchStart: 1800,
    pitchEnd: 1400,
    noise: 0.85,
    filter: 'bandpass',
    filterFrequency: 2600,
    gain: 0.25,
  }),
  siphon: Object.freeze({
    duration: 0.35,
    attack: 0.04,
    pitchStart: 180,
    pitchEnd: 260,
    noise: 0.7,
    filter: 'lowpass',
    filterFrequency: 700,
    gain: 0.35,
  }),
  seau: Object.freeze({
    duration: 0.8,
    attack: 0.08,
    pitchStart: 240,
    pitchEnd: 160,
    noise: 0.9,
    filter: 'bandpass',
    filterFrequency: 1100,
    gain: 0.4,
  }),
  clic: Object.freeze({
    duration: 0.06,
    attack: 0.003,
    pitchStart: 1320,
    pitchEnd: 990,
    noise: 0.05,
    filter: 'highpass',
    filterFrequency: 2000,
    gain: 0.3,
  }),
});

/** Variation de hauteur maximale d'un bruitage à l'autre (± 6 %). */
export const CARE_SOUND_DETUNE = 0.06;

/**
 * Délai minimal entre deux bruitages de même nature (s) : un geste continu (raclette, siphon)
 * produit beaucoup d'événements, on n'en fait sonner qu'une partie.
 */
export const CARE_SOUND_MIN_GAP: Readonly<Record<CareSoundKind, number>> = Object.freeze({
  raclette: 0.09,
  siphon: 0.3,
  seau: 0.5,
  clic: 0.05,
});

/** Graine fixe des bruitages, sans lien avec la graine du monde ni celle du fond sonore. */
export const CARE_SOUND_SEED = 0xc1a55e;

/** Générateur des bruitages, à graine fixe (`CARE_SOUND_SEED`). */
export function createCareSoundPrng(): Prng {
  return createPrng(CARE_SOUND_SEED);
}

/**
 * Paramètres du bruitage `kind` pour un tirage `jitter` dans [0, 1) : hauteurs décalées d'au
 * plus `CARE_SOUND_DETUNE` (0,5 : aucune variation). Un tirage hors de [0, 1] ou non fini est
 * ramené à 0,5. Fonction pure.
 */
export function careSoundSpec(kind: CareSoundKind, jitter = 0.5): CareSoundSpec {
  const base = CARE_SOUNDS[kind];
  const u = typeof jitter === 'number' && jitter >= 0 && jitter <= 1 ? jitter : 0.5;
  const factor = 1 + (u * 2 - 1) * CARE_SOUND_DETUNE;
  return { ...base, pitchStart: base.pitchStart * factor, pitchEnd: base.pitchEnd * factor };
}

/**
 * Niveau de crête du bruitage `spec` selon le réglage du son : 0 si le son n'est pas activé
 * (`enabled` différent de `true`, réglage absent compris), sinon le niveau du bruitage
 * multiplié par le volume (borné à [0, 1], `clampVolume`). Fonction pure.
 */
export function careSoundLevel(spec: CareSoundSpec, enabled: unknown, volume: unknown): number {
  if (enabled !== true) {
    return 0;
  }
  return spec.gain * clampVolume(volume);
}

/**
 * Vrai si un bruitage `kind` peut sonner à l'instant `now` (s), le précédent de même nature
 * ayant sonné à `last` (`null` : jamais). Un instant non fini ne sonne pas.
 */
export function careSoundDue(kind: CareSoundKind, last: number | null, now: number): boolean {
  if (!Number.isFinite(now)) {
    return false;
  }
  return last === null || !Number.isFinite(last) || now - last >= CARE_SOUND_MIN_GAP[kind];
}

/**
 * Bruitage joué quand l'étape `step` de la séance se termine avec l'issue `outcome` : le clic
 * pour une étape faite ; rien pour une étape sautée, absente de la séance (`present` faux,
 * comme la taille d'un bac sans plante à tailler), pour le bilan ou une étape inconnue.
 */
export function careStepSound(step: string, outcome: string, present = true): CareSoundKind | null {
  if (!present || outcome !== 'fait') {
    return null;
  }
  return CARE_STEPS_WITH_CLICK.has(step) ? 'clic' : null;
}

const CARE_STEPS_WITH_CLICK: ReadonlySet<string> = new Set([
  'vitres',
  'siphon',
  'filtre',
  'eau',
  'taille',
]);
