import { SIM_DT } from '../../sim/constants';
import { RenderLoop } from './render-loop';

describe('RenderLoop (#696)', () => {
  let requested: FrameRequestCallback[];
  let cancelled: number[];
  let frames: number[];
  let renderable: boolean;
  let win: Window | null;
  let loop: RenderLoop;

  beforeEach(() => {
    requested = [];
    cancelled = [];
    frames = [];
    renderable = true;
    win = {
      requestAnimationFrame: (callback: FrameRequestCallback) => requested.push(callback),
      cancelAnimationFrame: (id: number) => cancelled.push(id),
    } as unknown as Window; // Double minimal : seules ces deux méthodes sont lues.
    loop = new RenderLoop({
      window: () => win,
      canRender: () => renderable,
      frame: (timestamp) => frames.push(timestamp),
    });
  });

  it('demande une seule image à la fois, puis une nouvelle après l’image', () => {
    loop.schedule();
    loop.schedule();
    expect(requested).toHaveLength(1);
    requested[0]!(16);
    expect(frames).toEqual([16]);
    loop.schedule();
    expect(requested).toHaveLength(2);
  });

  it('aucune image sans fenêtre ni vue', () => {
    renderable = false;
    loop.schedule();
    win = null;
    renderable = true;
    loop.schedule();
    expect(requested).toHaveLength(0);
  });

  it('page masquée (fond d’écran) : aucune image ; visible, la cadence repart de zéro', () => {
    loop.schedule();
    loop.setHidden(true);
    expect(cancelled).toEqual([1]);
    loop.schedule();
    expect(requested).toHaveLength(1);
    expect(loop.throttled(0, 10)).toBe(false);
    expect(loop.throttled(50, 10)).toBe(true);
    loop.setHidden(false);
    expect(requested).toHaveLength(2);
    expect(loop.throttled(60, 10)).toBe(false);
  });

  it('pas fixe : temps réel × vitesse, aucun pas à la première image, état réécrit en place', () => {
    const clock = loop.clock;
    expect(loop.advance(0, 1)).toBe(0);
    expect(clock.steps).toBe(0);
    const realDt = loop.advance(SIM_DT * 3 * 1000, 2);
    expect(realDt).toBeCloseTo(SIM_DT * 3);
    expect(clock.steps).toBe(6);
    expect(loop.clock).toBe(clock);
    expect(loop.alpha).toBe(clock.alpha);
  });

  it('vitesse 0 : le monde ne bouge pas ; resetClock oublie le temps accumulé', () => {
    loop.advance(0, 0);
    loop.advance(5000, 0);
    expect(loop.clock.steps).toBe(0);
    loop.advance(5000 + SIM_DT * 500, 1);
    expect(loop.clock.alpha).toBeGreaterThan(0);
    loop.resetClock();
    expect(loop.clock.accumulator).toBe(0);
    expect(loop.alpha).toBe(0);
  });
});
