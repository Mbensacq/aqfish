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
  let worldTime: number | null;
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
    worldTime = 3600;
    photo = new PhotoController({
      document,
      view: () => source,
      isCapture: () => capture,
      isStopped: () => stopped,
      worldTime: () => worldTime,
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

  describe('albumShot (#860)', () => {
    /** Canvas 2D factice : jsdom n'en a pas ; l'encodage rend une URL PNG connue. */
    const fakeCanvas2d = (): void => {
      const context = {
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: () => undefined,
      };
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        context as unknown as CanvasRenderingContext2D, // double minimal de jsdom
      );
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
        'data:image/png;base64,AAAA',
      );
    };

    it('image PNG de la scène et temps simulé du monde', () => {
      fakeCanvas2d();
      expect(photo.albumShot()).toEqual({ dataUrl: 'data:image/png;base64,AAAA', time: 3600 });
      expect(photo.notice()).toBeNull();
    });

    it('sans vue, sans monde ou en capture : null, aucun message', () => {
      fakeCanvas2d();
      source = null;
      expect(photo.albumShot()).toBeNull();
      source = { takePhoto: () => pixels(4, 2) };
      worldTime = null;
      expect(photo.albumShot()).toBeNull();
      worldTime = 0;
      capture = true;
      expect(photo.albumShot()).toBeNull();
      expect(photo.notice()).toBeNull();
    });

    it('relecture qui lève ou encodage impossible : null et message bref', () => {
      source = {
        takePhoto: () => {
          throw new Error('perdu');
        },
      };
      expect(photo.albumShot()).toBeNull();
      expect(photo.notice()).toBe(PHOTO_FAILED_MESSAGE);
      photo.setNotice(null);
      source = { takePhoto: () => pixels(4, 2) };
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      expect(photo.albumShot()).toBeNull();
      expect(photo.notice()).toBe(PHOTO_FAILED_MESSAGE);
    });
  });
});
