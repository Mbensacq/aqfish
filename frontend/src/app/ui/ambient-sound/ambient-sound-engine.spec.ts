import { AmbientSoundEngine, FADE_SECONDS, LIMITER } from './ambient-sound-engine';
import { CARE_SOUNDS } from '../../core/care-sound/care-sound';
import { FakeAudioContext, FakeGain, FakeTimer } from './fake-audio-context';
import { SILENT_LEVELS, type AmbientLevels } from '../../core/ambient-sound/ambient-sound';

const LEVELS: AmbientLevels = { water: 0.3, bubbles: 0.4, bubbleRate: 2.5, rain: 0.6 };

function setup(): { ctx: FakeAudioContext; timer: FakeTimer; engine: AmbientSoundEngine } {
  const ctx = new FakeAudioContext();
  const timer = new FakeTimer();
  return { ctx, timer, engine: new AmbientSoundEngine(ctx, timer) };
}

describe('AmbientSoundEngine (#411)', () => {
  it('graphe : gain général vers la sortie par le limiteur, eau en passe-bas, pluie en passe-haut', () => {
    const { ctx } = setup();
    const master = ctx.gains[0];
    expect(ctx.destination.outputs).toEqual([]);
    expect(ctx.compressors).toHaveLength(1);
    const [limiter] = ctx.compressors;
    expect(master.outputs).toEqual([limiter]);
    expect(limiter.outputs).toEqual([ctx.destination]);
    expect(ctx.filters.map((filter) => filter.type)).toEqual(['lowpass', 'highpass']);
    expect(ctx.filters[0].frequency.value).toBeLessThan(ctx.filters[1].frequency.value);
    // Deux sources de bruit en boucle, sur un même tampon, à deux endroits différents.
    expect(ctx.bufferSources).toHaveLength(2);
    expect(ctx.bufferSources.every((source) => source.loop && source.started === 0)).toBe(true);
    expect(ctx.bufferSources[0].buffer).toBe(ctx.bufferSources[1].buffer);
    expect(ctx.bufferSources[0].offset).not.toBe(ctx.bufferSources[1].offset);
  });

  it('limiteur doux (#413) : seuil -3 dB, ratio modéré, attaque brève', () => {
    const { ctx } = setup();
    const [limiter] = ctx.compressors;
    expect(limiter.threshold.value).toBe(-3);
    expect(limiter.knee.value).toBe(LIMITER.knee);
    expect(limiter.ratio.value).toBe(4);
    expect(limiter.attack.value).toBeLessThanOrEqual(0.01);
    expect(limiter.release.value).toBe(LIMITER.release);
    expect(Object.isFrozen(LIMITER)).toBe(true);
  });

  it('démarre muet : toutes les couches à 0, fondu d’entrée du gain général', () => {
    const { ctx, engine } = setup();
    expect(engine.current).toBe(SILENT_LEVELS);
    const [master, ...layers] = ctx.gains;
    expect(master.gain.target).toBe(1);
    for (const layer of layers) {
      expect(layer.gain.value).toBe(0);
      expect(layer.gain.target).toBeNull();
    }
  });

  it('bruit synthétisé : le tampon est rempli, pas de fichier audio', () => {
    const { ctx } = setup();
    const buffer = ctx.bufferSources[0].buffer as { data: Float32Array };
    expect(buffer.data.length).toBe(ctx.sampleRate * 2);
    expect(buffer.data.some((value) => value !== 0)).toBe(true);
  });

  it('setLevels : chaque couche vise son niveau par fondu court', () => {
    const { ctx, engine } = setup();
    ctx.currentTime = 12;
    engine.setLevels(LEVELS);
    expect(engine.current).toBe(LEVELS);
    const targets = ctx.gains.map((gain) => gain.gain.target);
    expect(targets).toContain(LEVELS.water);
    expect(targets).toContain(LEVELS.rain);
    expect(targets).toContain(LEVELS.bubbles);
    const water = ctx.gains.find((gain) => gain.gain.target === LEVELS.water) as FakeGain;
    expect(water.gain.events.at(-1)).toBe(`target ${LEVELS.water}@12/${FADE_SECONDS}`);
  });

  it('bulles : un « blop » par rappel de la minuterie quand le rythme est positif', () => {
    const { ctx, timer, engine } = setup();
    expect(timer.pending.size).toBe(1);
    timer.run();
    // Silence : pas de « blop », mais la minuterie continue (rythme relu à chaque fois).
    expect(ctx.oscillators).toHaveLength(1); // le LFO seul
    expect(timer.pending.size).toBe(1);
    engine.setLevels(LEVELS);
    timer.run();
    expect(ctx.oscillators).toHaveLength(2);
    const blop = ctx.oscillators[1];
    expect(blop.started).toBe(ctx.currentTime);
    expect(blop.stopped).toBeGreaterThan(ctx.currentTime);
    expect(blop.frequency.events[0]).toMatch(/^set /);
    expect(blop.frequency.events[1]).toMatch(/^exp /);
    // Fin du « blop » : ses nœuds sont débranchés.
    blop.onended?.();
    expect(blop.disconnected).toBe(true);
    // Délai planifié tiré du générateur du son : au moins 120 ms.
    const [next] = [...timer.pending.values()];
    expect(next.ms).toBeGreaterThanOrEqual(120);
  });

  it('pas de « blop » si le gain des bulles est nul', () => {
    const { ctx, timer, engine } = setup();
    engine.setLevels({ ...LEVELS, bubbles: 0 });
    timer.run();
    expect(ctx.oscillators).toHaveLength(1);
  });

  it('close : arrête les sources, annule la minuterie, ferme le contexte, une seule fois', async () => {
    const { ctx, timer, engine } = setup();
    await engine.close();
    await engine.close();
    expect(engine.isClosed).toBe(true);
    expect(ctx.closed).toBe(1);
    expect(timer.pending.size).toBe(0);
    expect(ctx.bufferSources.every((source) => source.stopped !== null)).toBe(true);
    expect(ctx.oscillators[0].stopped).not.toBeNull();
    expect(ctx.gains[0].disconnected).toBe(true);
    expect(ctx.compressors[0].disconnected).toBe(true);
    // Une fois fermé, plus rien ne bouge.
    engine.setLevels(LEVELS);
    expect(engine.current).toBe(SILENT_LEVELS);
  });

  it('close tolère un contexte qui refuse de se fermer et une source jamais démarrée', async () => {
    const { ctx, engine } = setup();
    ctx.close = () => Promise.reject(new Error('InvalidStateError'));
    ctx.bufferSources[0].started = null;
    await expect(engine.close()).resolves.toBeUndefined();
    expect(engine.isClosed).toBe(true);
  });

  it('rappel de bulle arrivé après la fermeture : sans effet', async () => {
    const { ctx, timer, engine } = setup();
    const [pending] = [...timer.pending.values()];
    await engine.close();
    pending.callback();
    expect(ctx.oscillators).toHaveLength(1);
    expect(timer.pending.size).toBe(0);
  });
});

describe('AmbientSoundEngine : bruitages de la séance (#625)', () => {
  it('bruitage : bruit filtré et sinusoïde sous une enveloppe, branchée sur le gain général', () => {
    const { ctx, engine } = setup();
    const gains = ctx.gains.length;
    const filters = ctx.filters.length;
    const sources = ctx.bufferSources.length;
    const oscillators = ctx.oscillators.length;
    ctx.currentTime = 2;
    const spec = CARE_SOUNDS.raclette;
    engine.playCareSound(spec, 0.2);
    const master = ctx.gains[0];
    const [envelope, noiseGain, toneGain] = ctx.gains.slice(gains);
    expect(ctx.gains.length - gains).toBe(3);
    expect(envelope.outputs).toEqual([master]);
    expect(envelope.gain.events).toEqual([
      'set 0@2',
      `lin 0.2@${2 + spec.attack}`,
      `exp 0.0001@${2 + spec.duration}`,
    ]);
    const filter = ctx.filters[filters];
    expect(filter.type).toBe('bandpass');
    expect(filter.frequency.value).toBe(spec.filterFrequency);
    expect(noiseGain.gain.value).toBe(spec.noise);
    expect(toneGain.gain.value).toBeCloseTo(1 - spec.noise);
    const noise = ctx.bufferSources[sources];
    expect(noise.buffer).toBe(ctx.bufferSources[0].buffer);
    expect(noise.loop).toBe(false);
    expect(noise.outputs).toEqual([filter]);
    expect(filter.outputs).toEqual([noiseGain]);
    expect(noiseGain.outputs).toEqual([envelope]);
    const tone = ctx.oscillators[oscillators];
    expect(tone.frequency.events).toEqual([
      `set ${spec.pitchStart}@2`,
      `exp ${spec.pitchEnd}@${2 + spec.duration}`,
    ]);
    expect(tone.outputs).toEqual([toneGain]);
    expect(toneGain.outputs).toEqual([envelope]);
    expect(noise.started).toBe(2);
    expect(tone.started).toBe(2);
    expect(noise.stopped).toBeGreaterThan(2 + spec.duration);
    expect(tone.stopped).toBeGreaterThan(2 + spec.duration);
  });

  it('fin du bruitage : tous ses nœuds débranchés, le fond sonore intact', () => {
    const { ctx, engine } = setup();
    const gains = ctx.gains.length;
    engine.playCareSound(CARE_SOUNDS.seau, 0.1);
    ctx.oscillators.at(-1)!.onended?.();
    expect(ctx.gains.slice(gains).every((gain) => gain.disconnected)).toBe(true);
    expect(ctx.filters.at(-1)!.disconnected).toBe(true);
    expect(ctx.bufferSources.at(-1)!.disconnected).toBe(true);
    expect(ctx.gains[0].disconnected).toBe(false);
    expect(ctx.filters[0].disconnected).toBe(false);
  });

  it('niveau nul, négatif ou non fini, ou moteur fermé : aucun nœud créé', async () => {
    const { ctx, engine } = setup();
    const counts = (): number[] => [
      ctx.gains.length,
      ctx.filters.length,
      ctx.bufferSources.length,
      ctx.oscillators.length,
    ];
    const before = counts();
    for (const level of [0, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      engine.playCareSound(CARE_SOUNDS.clic, level);
    }
    expect(counts()).toEqual(before);
    await engine.close();
    engine.playCareSound(CARE_SOUNDS.clic, 0.3);
    expect(counts()).toEqual(before);
  });

  it('horloge : celle du contexte audio', () => {
    const { ctx, engine } = setup();
    ctx.currentTime = 4.5;
    expect(engine.time).toBe(4.5);
  });
});
