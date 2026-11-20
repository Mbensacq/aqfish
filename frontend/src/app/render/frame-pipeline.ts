import type { Camera, Scene, WebGLRenderTarget } from 'three';

import type { RenderFilter } from '../core/render-filter/render-filter';
import { DirectPass } from './direct-pass';
import { PalettePass } from './palette-pass';
import type { PhotoPixels } from './photo-capture';
import { PIXEL_SIZE, type Size } from './pixel-art';

/**
 * Sous-ensemble de `WebGLRenderer` utilisé par la vue. Permet de remplacer le renderer
 * par un double dans les tests unitaires (jsdom n'a pas WebGL, voir docs/PIEGES.md).
 */
export interface AquariumRenderer {
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setRenderTarget(target: WebGLRenderTarget | null): void;
  render(scene: Scene, camera: Camera): void;
  /**
   * Relit les pixels d'une cible (photo, #479). Facultatif : un double de test peut s'en
   * passer, la photo est alors refusée.
   */
  readRenderTargetPixels?(
    target: WebGLRenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Uint8Array,
  ): void;
  dispose(): void;
}

/** Ce que la chaîne de passes rend : la scène, sa caméra et les réglages qui en dépendent. */
export interface FrameScene {
  readonly scene: Scene;
  readonly camera: Camera;
  /** Réglages de la scène qui dépendent de la caméra, avant chaque image et chaque photo. */
  prepare(): void;
  /** Taille de la surface de rendu (pixels) des couches dont les traits en dépendent. */
  setResolution(width: number, height: number): void;
  /** Échelle des points (bulles, granulés). */
  setPointScale(scale: number): void;
}

/**
 * Chaîne de passes de la vue (ADR 0002, #698) : taille du canvas, cible basse résolution et
 * passe palette du pixel art, cible pleine résolution du filtre `aucun` (ADR 0010, ADR 0101),
 * photo (#479). La caméra et la scène restent à la vue.
 */
export class FramePipeline {
  /** Passe palette du pixel art : cible basse résolution et tons proposés. */
  readonly palette: PalettePass;
  /** Cible pleine résolution du mode sans filtre (#40, ADR 0101). */
  private readonly direct = new DirectPass();
  private width = 0;
  private height = 0;
  /** Taille de la cible basse résolution (tenue à jour dans les deux modes). */
  private target: Size = { width: 1, height: 1 };

  constructor(
    private readonly renderer: AquariumRenderer,
    private readonly pixelRatio: number,
    private currentFilter: RenderFilter,
  ) {
    renderer.setPixelRatio(pixelRatio);
    this.palette = new PalettePass();
  }

  /** Filtre de rendu courant. */
  get filter(): RenderFilter {
    return this.currentFilter;
  }

  /** Change le filtre ; renvoie `true` s'il a changé. */
  setFilter(filter: RenderFilter): boolean {
    if (filter === this.currentFilter) {
      return false;
    }
    this.currentFilter = filter;
    return true;
  }

  /** Taille de la cible basse résolution. */
  get targetSize(): Size {
    return this.target;
  }

  /**
   * Adapte le renderer et les cibles à la taille du canvas (pixels CSS, tronqués, au moins 0).
   * Renvoie `true` si la taille a changé.
   */
  resize(width: number, height: number): boolean {
    const w = Math.max(0, Math.floor(width));
    const h = Math.max(0, Math.floor(height));
    if (w === this.width && h === this.height) {
      return false;
    }
    this.width = w;
    this.height = h;
    if (this.hasSize()) {
      this.renderer.setSize(w, h, false);
      this.target = this.palette.setSize(w, h, this.pixelRatio);
    }
    return true;
  }

  /** Taille non nulle : une image rendue maintenant est une image complète. */
  hasSize(): boolean {
    return this.width > 0 && this.height > 0;
  }

  /**
   * Taille dont la caméra prend le rapport d'aspect : la cible en pixel art (arrondie au pixel
   * de scène, pour ne pas déformer l'image), le canvas sans filtre.
   */
  aspectSize(): Size {
    return this.currentFilter === 'pixel'
      ? this.target
      : { width: this.width, height: this.height };
  }

  /** Rend une image de `frame` à l'écran. Renvoie `false` sans taille. */
  render(frame: FrameScene): boolean {
    if (!this.hasSize()) {
      return false;
    }
    frame.prepare();
    if (this.currentFilter === 'aucun') {
      frame.setResolution(this.width * this.pixelRatio, this.height * this.pixelRatio);
      // Sans filtre, une bulle garde la taille d'un pixel de scène du mode pixel art.
      frame.setPointScale(PIXEL_SIZE * this.pixelRatio);
      // Translucides mélangés en linéaire dans une cible, comme en pixel art (#40).
      this.direct.setSize(this.width, this.height, this.pixelRatio);
      this.renderer.setRenderTarget(this.direct.target);
      this.renderer.render(frame.scene, frame.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.direct.scene, this.direct.camera);
      return true;
    }
    this.renderPixelScene(frame);
    this.renderPalette();
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.palette.upscaleScene, this.palette.camera);
    return true;
  }

  /**
   * Photo (#479, ADR 0112) : `frame` rendue dans la cible basse résolution et ramenée à la
   * palette, pixels relus lignes de bas en haut. `null` sans taille ou si le renderer ne sait
   * pas relire.
   */
  takePhoto(frame: FrameScene): PhotoPixels | null {
    if (!this.hasSize() || !this.renderer.readRenderTargetPixels) {
      return null;
    }
    frame.prepare();
    // Une erreur du rendu ou de la relecture (#503) ne doit pas laisser une cible branchée :
    // l'image suivante serait dessinée hors de l'écran.
    try {
      this.renderPixelScene(frame);
      this.renderPalette();
      const { width, height } = this.target;
      const data = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(this.palette.paletteTarget, 0, 0, width, height, data);
      return { width, height, data };
    } finally {
      this.renderer.setRenderTarget(null);
    }
  }

  /** Libère les cibles des passes, puis le renderer. */
  dispose(): void {
    this.palette.dispose();
    this.direct.dispose();
    this.renderer.dispose();
  }

  /** Rend la scène dans la cible basse résolution du pixel art (sans la passe palette). */
  private renderPixelScene(frame: FrameScene): void {
    frame.setResolution(this.target.width, this.target.height);
    frame.setPointScale(1);
    this.renderer.setRenderTarget(this.palette.target);
    this.renderer.render(frame.scene, frame.camera);
  }

  /** Ramène l'image de la cible basse résolution à la palette, dans `paletteTarget`. */
  private renderPalette(): void {
    this.renderer.setRenderTarget(this.palette.paletteTarget);
    this.renderer.render(this.palette.scene, this.palette.camera);
  }
}
