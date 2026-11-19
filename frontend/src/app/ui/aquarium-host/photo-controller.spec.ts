import {
  PHOTO_FAILED_MESSAGE,
  PHOTO_NOTICE_MS,
  type PhotoPixels,
} from '../../render/photo-capture';
import { PhotoController, type PhotoSource } from './photo-controller';

describe('PhotoController (#696)', () => {
  let source: PhotoSource | null;
  let capture: boolean;
  let stopped: boolean;
  let photo: PhotoController;

  const pixels = (width: number, height: number): PhotoPixels => ({
    width,
    height,
    data: new Uint8Array(width * height * 4).fill(128),
  });

  beforeEach(() => {
    source = { takePhoto: () => pixels(4, 2) };
    capture = false;
    stopped = false;
    photo = new PhotoController({
      document,
      view: () => source,
      isCapture: () => capture,
      isStopped: () => stopped,
    });
  });

  afterEach(() => {
    photo.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sans vue ou en capture : aucune photo, aucun message', () => {
    source = null;
    expect(photo.take()).toBe(false);
    source = { takePhoto: () => pixels(4, 2) };
    capture = true;
    expect(photo.take()).toBe(false);
    expect(photo.notice()).toBeNull();
  });

  it('relecture impossible : message bref, effacé après PHOTO_NOTICE_MS', () => {
    vi.useFakeTimers();
    source = { takePhoto: () => null };
    expect(photo.take()).toBe(false);
    expect(photo.notice()).toBe(PHOTO_FAILED_MESSAGE);
    vi.advanceTimersByTime(PHOTO_NOTICE_MS);
    expect(photo.notice()).toBeNull();
  });

  it('vue qui lève : message bref, jamais d’exception', () => {
    source = {
      takePhoto: () => {
        throw new Error('perdu');
      },
    };
    expect(photo.take()).toBe(false);
    expect(photo.notice()).toBe(PHOTO_FAILED_MESSAGE);
  });

  it('sans canvas 2D (jsdom) : échec signalé, et aucune image data:', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(photo.take()).toBe(false);
    expect(photo.notice()).toBe(PHOTO_FAILED_MESSAGE);
    expect(photo.dataUrl(pixels(2, 2))).toBeNull();
  });

  it('après la destruction : plus de message ; setNotice remplace et annule l’effacement', () => {
    vi.useFakeTimers();
    photo.failed();
    photo.setNotice('autre');
    vi.advanceTimersByTime(PHOTO_NOTICE_MS);
    expect(photo.notice()).toBe('autre');
    photo.setNotice(null);
    stopped = true;
    photo.failed();
    expect(photo.notice()).toBeNull();
  });
});
