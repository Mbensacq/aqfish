import { AmbientSoundEngine, FADE_SECONDS, LIMITER } from './ambient-sound-engine';
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
