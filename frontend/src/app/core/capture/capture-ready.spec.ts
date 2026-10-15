import {
  CAPTURE_READY_ATTRIBUTE,
  isCaptureReady,
  markCaptureReady,
  resetCaptureReady,
} from './capture-ready';

describe('capture-ready', () => {
  afterEach(() => resetCaptureReady());

  it("n'est pas prêt par défaut", () => {
    expect(isCaptureReady()).toBe(false);
  });

  it("pose l'attribut attendu par le harnais", () => {
    markCaptureReady();
    expect(document.body.getAttribute(CAPTURE_READY_ATTRIBUTE)).toBe('true');
    expect(isCaptureReady()).toBe(true);
  });

  it("retire l'attribut à la réinitialisation", () => {
    markCaptureReady();
    resetCaptureReady();
    expect(isCaptureReady()).toBe(false);
  });
});
