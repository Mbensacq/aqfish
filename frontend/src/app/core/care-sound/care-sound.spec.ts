import {
  CARE_SOUND_DETUNE,
  CARE_SOUND_KINDS,
  CARE_SOUND_MIN_GAP,
  CARE_SOUNDS,
  careSoundDue,
  careSoundLevel,
  careSoundSpec,
  careStepSound,
  createCareSoundPrng,
} from './care-sound';
import { DEFAULT_AMBIENT_VOLUME } from '../ambient-sound/ambient-sound';

describe('bruitages de la séance (#625)', () => {
  it('table : chaque bruitage a une durée brève, des hauteurs positives, un niveau discret', () => {
    expect(CARE_SOUND_KINDS).toEqual(['raclette', 'siphon', 'seau', 'clic']);
    for (const kind of CARE_SOUND_KINDS) {
      const spec = CARE_SOUNDS[kind];
      expect(spec.duration).toBeGreaterThan(0);
      expect(spec.duration).toBeLessThanOrEqual(1);
      expect(spec.attack).toBeGreaterThan(0);
      expect(spec.attack).toBeLessThan(spec.duration);
      expect(spec.pitchStart).toBeGreaterThan(0);
      expect(spec.pitchEnd).toBeGreaterThan(0);
      expect(spec.noise).toBeGreaterThanOrEqual(0);
      expect(spec.noise).toBeLessThanOrEqual(1);
      expect(spec.gain).toBeGreaterThan(0);
      expect(spec.gain).toBeLessThanOrEqual(0.5);
      expect(Object.isFrozen(spec)).toBe(true);
    }
    expect(Object.isFrozen(CARE_SOUNDS)).toBe(true);
  });

  it('caractère : raclette aiguë et bruitée, siphon grave, seau le plus long, clic presque pur', () => {
    const { raclette, siphon, seau, clic } = CARE_SOUNDS;
    expect(raclette.filterFrequency).toBeGreaterThan(siphon.filterFrequency);
    expect(raclette.noise).toBeGreaterThan(0.5);
    expect(siphon.filter).toBe('lowpass');
    expect(siphon.pitchStart).toBeLessThan(raclette.pitchStart);
    expect(seau.duration).toBe(Math.max(...CARE_SOUND_KINDS.map((k) => CARE_SOUNDS[k].duration)));
    expect(clic.duration).toBe(Math.min(...CARE_SOUND_KINDS.map((k) => CARE_SOUNDS[k].duration)));
    expect(clic.noise).toBeLessThan(0.1);
  });

  it('careSoundSpec : fonction pure, 0,5 sans variation, bornes à ± CARE_SOUND_DETUNE', () => {
    const base = CARE_SOUNDS.raclette;
    expect(careSoundSpec('raclette')).toEqual(base);
    expect(careSoundSpec('raclette', 0.5)).toEqual(base);
    expect(careSoundSpec('raclette', 0.3)).toEqual(careSoundSpec('raclette', 0.3));
    const low = careSoundSpec('raclette', 0);
    const high = careSoundSpec('raclette', 1);
    expect(low.pitchStart).toBeCloseTo(base.pitchStart * (1 - CARE_SOUND_DETUNE));
    expect(high.pitchEnd).toBeCloseTo(base.pitchEnd * (1 + CARE_SOUND_DETUNE));
    // Durée, bruit, filtre et niveau ne varient pas.
    expect({ ...low, pitchStart: 0, pitchEnd: 0 }).toEqual({ ...base, pitchStart: 0, pitchEnd: 0 });
    // La table n'est pas modifiée.
    expect(CARE_SOUNDS.raclette).toBe(base);
  });

  it('careSoundSpec : tirage hors bornes ou non fini ramené à 0,5', () => {
    for (const jitter of [-1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(careSoundSpec('seau', jitter)).toEqual(CARE_SOUNDS.seau);
    }
    expect(careSoundSpec('seau', undefined as unknown as number)).toEqual(CARE_SOUNDS.seau);
  });

  it('careSoundLevel : son coupé ou réglage absent : 0', () => {
    const spec = CARE_SOUNDS.clic;
    expect(careSoundLevel(spec, false, 1)).toBe(0);
    expect(careSoundLevel(spec, undefined, 1)).toBe(0);
    expect(careSoundLevel(spec, null, 1)).toBe(0);
    expect(careSoundLevel(spec, 'actif', 1)).toBe(0);
  });

  it('careSoundLevel : niveau du bruitage multiplié par le volume, borné', () => {
    const spec = CARE_SOUNDS.siphon;
    expect(careSoundLevel(spec, true, 1)).toBe(spec.gain);
    expect(careSoundLevel(spec, true, 0.5)).toBe(spec.gain * 0.5);
    expect(careSoundLevel(spec, true, 0)).toBe(0);
    expect(careSoundLevel(spec, true, 3)).toBe(spec.gain);
    expect(careSoundLevel(spec, true, -1)).toBe(0);
    expect(careSoundLevel(spec, true, Number.NaN)).toBe(spec.gain * DEFAULT_AMBIENT_VOLUME);
    expect(careSoundLevel(spec, true, undefined)).toBe(spec.gain * DEFAULT_AMBIENT_VOLUME);
  });

  it('careSoundDue : premier bruitage toujours dû, puis délai minimal par nature', () => {
    for (const kind of CARE_SOUND_KINDS) {
      const gap = CARE_SOUND_MIN_GAP[kind];
      expect(gap).toBeGreaterThan(0);
      expect(careSoundDue(kind, null, 0)).toBe(true);
      expect(careSoundDue(kind, 1, 1)).toBe(false);
      expect(careSoundDue(kind, 1, 1 + gap / 2)).toBe(false);
      expect(careSoundDue(kind, 1, 1 + gap)).toBe(true);
    }
  });

  it('careSoundDue : instant non fini ne sonne pas ; précédent non fini oublié', () => {
    expect(careSoundDue('clic', null, Number.NaN)).toBe(false);
    expect(careSoundDue('clic', 0, Number.POSITIVE_INFINITY)).toBe(false);
    expect(careSoundDue('clic', Number.NaN, 0)).toBe(true);
  });

  it('careStepSound : clic pour une étape faite, rien si sautée, absente, bilan ou inconnue', () => {
    for (const step of ['vitres', 'siphon', 'filtre', 'eau', 'taille']) {
      expect(careStepSound(step, 'fait')).toBe('clic');
      expect(careStepSound(step, 'saute')).toBeNull();
      expect(careStepSound(step, 'fait', false)).toBeNull();
    }
    expect(careStepSound('bilan', 'fait')).toBeNull();
    expect(careStepSound('inconnue', 'fait')).toBeNull();
    expect(careStepSound('vitres', '')).toBeNull();
  });

  it('générateur propre aux bruitages : même graine, même suite', () => {
    const a = createCareSoundPrng();
    const b = createCareSoundPrng();
    const draws = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(draws);
    expect(draws.every((u) => u >= 0 && u < 1)).toBe(true);
  });
});
