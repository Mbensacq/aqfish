import { signal } from '@angular/core';

import {
  PHOTO_FAILED_MESSAGE,
  PHOTO_NOTICE_MS,
  photoFileName,
  photoScale,
  upscalePhoto,
  type PhotoImage,
  type PhotoPixels,
} from '../../render/photo-capture';

/** Vue relue par la photo : la cible pixel art de la scène, `null` si illisible. */
export interface PhotoSource {
  takePhoto(): PhotoPixels | null;
}

/** Ce dont la photo a besoin de l'hôte (#696). */
export interface PhotoPorts {
  /** Document de la page : canvas d'encodage, lien de téléchargement, fenêtre. */
  readonly document: Document;
  /** Vue courante, `null` avant le démarrage. */
  view(): PhotoSource | null;
  /** Mode capture : aucune photo. */
  isCapture(): boolean;
  /** Vrai après la destruction de l'hôte : plus aucun message. */
  isStopped(): boolean;
  /** Temps simulé du monde affiché (s), `null` avant le démarrage (album, #860). */
  worldTime(): number | null;
}

/** Image de l'album (#860) : PNG à la résolution de la scène et temps simulé de la prise. */
export interface AlbumShot {
  readonly dataUrl: string;
  readonly time: number;
}

/**
 * Photo PNG du bac (bouton « Photo », #479, ADR 0112) et ses images pour la séance d'entretien
 * (avant / après, #624) : relecture de la vue, agrandissement sans lissage, encodage par un
 * canvas 2D hors du document, téléchargement, et message bref en cas d'échec (#503). Sorti de
 * l'hôte au lot 10 de l'assainissement (#696), sans changement de comportement.
 */
export class PhotoController {
  /** Message bref de la photo (#503) : effacé à la photo suivante ou après `PHOTO_NOTICE_MS`. */
  readonly notice = signal<string | null>(null);
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly ports: PhotoPorts) {}

  /**
   * Télécharge une photo PNG du bac dans la vue courante : cible pixel art relue par la vue,
   * agrandie par un facteur entier sans lissage (`render/photo-capture.ts`), encodée par un
   * canvas 2D hors du document, sans interface ni curseur. Le monde et l'horloge ne bougent
   * pas. Renvoie `true` si la photo a été produite (le téléchargement suit, asynchrone) ; sans
   * effet en mode capture, avant le démarrage ou si le navigateur ne sait pas relire ou
   * encoder l'image. Ne lève jamais ; un échec (relecture, canvas 2D ou encodage) affiche un
   * message bref (`notice`, #503).
   */
  take(): boolean {
    const view = this.ports.view();
    const win = this.ports.document.defaultView;
    if (!view || !win || this.ports.isCapture()) {
      return false;
    }
    this.setNotice(null);
    try {
      const pixels = view.takePhoto();
      if (!pixels) {
        this.failed();
        return false;
      }
      const image = upscalePhoto(pixels, photoScale(pixels.width, pixels.height));
      return this.download(image, photoFileName(new Date()));
    } catch {
      this.failed();
      return false;
    }
  }

  /**
   * Image de la vue courante pour l'album photo (#860) : PNG à la résolution de la scène, sans
   * interface, et temps simulé de la prise. `null` en mode capture, avant le démarrage ou si
   * l'image n'a pas pu être relue ou encodée (message bref dans ce dernier cas). Ne lève jamais.
   */
  albumShot(): AlbumShot | null {
    const view = this.ports.view();
    const time = this.ports.worldTime();
    if (!view || time === null || this.ports.isCapture()) {
      return null;
    }
    this.setNotice(null);
    const dataUrl = this.readDataUrl(view);
    if (dataUrl === null) {
      this.failed();
      return null;
    }
    return { dataUrl, time };
  }

  /** Image PNG de la vue à la résolution de la scène, `null` si la relecture échoue ou lève. */
  private readDataUrl(view: PhotoSource): string | null {
    try {
      const pixels = view.takePhoto();
      return pixels ? this.dataUrl(pixels) : null;
    } catch {
      return null;
    }
  }

  /** Image PNG (URL `data:`) d'un relevé à la résolution de la scène, `null` en cas d'échec. */
  dataUrl(pixels: PhotoPixels): string | null {
    try {
      return this.canvas(upscalePhoto(pixels, 1))?.toDataURL('image/png') ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Encode `image` en PNG et la télécharge sous `name` (photo #479, avant / après #624) ;
   * `false` et message bref sans canvas 2D, message bref si l'encodage échoue ensuite.
   */
  download(image: PhotoImage, name: string): boolean {
    const doc = this.ports.document;
    const win = doc.defaultView;
    const canvas = this.canvas(image);
    if (!win || !canvas) {
      this.failed();
      return false;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        // Encodage refusé (mémoire, canvas trop grand…) : le dire plutôt que rien (#503).
        this.failed();
        return;
      }
      const url = win.URL.createObjectURL(blob);
      const link = doc.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 0);
    }, 'image/png');
    return true;
  }

  /** Affiche l'échec de la photo (#503), effacé après `PHOTO_NOTICE_MS`. */
  failed(): void {
    if (this.ports.isStopped()) {
      return;
    }
    this.setNotice(PHOTO_FAILED_MESSAGE);
    this.noticeTimer = setTimeout(() => this.setNotice(null), PHOTO_NOTICE_MS);
  }

  /** Remplace le message (et annule son effacement programmé). */
  setNotice(message: string | null): void {
    this.cancelTimer();
    this.notice.set(message);
  }

  /** Destruction de l'hôte : plus aucun effacement programmé. */
  dispose(): void {
    this.cancelTimer();
  }

  private cancelTimer(): void {
    if (this.noticeTimer !== null) {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
  }

  /** Canvas 2D hors du document contenant `image`, `null` sans canvas 2D. */
  private canvas(image: PhotoImage): HTMLCanvasElement | null {
    const canvas = this.ports.document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    const imageData = context.createImageData(image.width, image.height);
    imageData.data.set(image.data);
    context.putImageData(imageData, 0, 0);
    return canvas;
  }
}
