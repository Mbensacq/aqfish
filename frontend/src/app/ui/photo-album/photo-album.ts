import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';

import { DEFAULT_ENVIRONMENT_ID, type EnvironmentId } from '../../sim/environment';
import type { AlbumShot } from '../aquarium-host/photo-controller';
import { documentStorage } from '../aquarium-host/browser-storage';
import { trapTab } from '../settings-window/focus-trap';
import {
  ALBUM_CAPACITY,
  addAlbumPhoto,
  albumCaption,
  readStoredAlbum,
  removeAlbumPhoto,
  writeStoredAlbum,
  type AlbumPhoto,
  type AlbumStorage,
} from './photo-album-store';

/** Stockage de l'album : `localStorage` s'il est accessible, `null` sinon (tests : double). */
export const ALBUM_STORAGE = new InjectionToken<AlbumStorage | null>('ALBUM_STORAGE', {
  providedIn: 'root',
  factory: () => documentStorage(inject(DOCUMENT)),
});

/** Messages de l'album (#860), au ton de la charte (`docs/INTERFACE.md`). */
export const ALBUM_MESSAGES = {
  full: `Album plein : ${ALBUM_CAPACITY} photos au plus. Supprimez-en une pour en garder une nouvelle.`,
  failed: 'Photo impossible : le navigateur n’a pas pu relire la vue.',
  notSaved: 'Le navigateur refuse d’enregistrer l’album : il sera perdu à la fermeture de la page.',
} as const;

/** Sélecteur du bouton qui ouvre l'album (barre des vues) : le focus y revient. */
const TOGGLE_SELECTOR = '[data-album-toggle]';

/**
 * Album photo du bac (#860) : fenêtre modale qui garde jusqu'à `ALBUM_CAPACITY` photos de la
 * vue (sans interface), mémorisées dans le navigateur (`photo-album-store.ts`). Chaque
 * miniature porte la date de jeu et l'environnement ; un clic l'agrandit ; chaque photo se
 * supprime. L'image vient de l'hôte (`PhotoController.albumShot`) : l'album demande une prise
 * (`shotRequested`) et l'application lui rend le résultat (`add`).
 *
 * Clavier : le focus entre sur le titre, Tab et Maj+Tab tournent dans la fenêtre, Échap revient
 * de l'agrandissement à l'album puis ferme ; le focus retourne au bouton « Album ». Exclusif
 * avec les autres panneaux : l'application replie les autres (`opened`, `close`). Jamais
 * affiché en mode capture (l'application n'affiche pas l'interface).
 */
@Component({
  selector: 'app-photo-album',
  template: `@if (open()) {
    <div class="photo-album__backdrop" aria-hidden="true" (click)="close(true)"></div>
    <section
      class="photo-album"
      role="dialog"
      aria-modal="true"
      aria-labelledby="album-photo-titre"
      data-photo-album
      (keydown)="trap($event)"
    >
      <div class="photo-album__header">
        <h2 class="photo-album__title" id="album-photo-titre" tabindex="-1">Album photo</h2>
        <span class="photo-album__count" data-album-count
          >{{ photos().length }} / {{ capacity }}</span
        >
        <button type="button" class="photo-album__button" data-album-close (click)="close(true)">
          Fermer
        </button>
      </div>
      @if (enlarged(); as photo) {
        <figure class="photo-album__enlarged" data-album-enlarged>
          <img class="photo-album__image" [src]="photo.dataUrl" [alt]="caption(photo)" />
          <figcaption class="photo-album__caption">{{ caption(photo) }}</figcaption>
        </figure>
        <button type="button" class="photo-album__button" data-album-back (click)="enlarge(null)">
          Retour à l’album
        </button>
      } @else {
        <p class="photo-album__intro">
          Une photo garde la vue actuelle du bac, sans l’interface. Les photos restent dans ce
          navigateur.
        </p>
        <button
          type="button"
          class="photo-album__button photo-album__button--primary"
          data-album-add
          [disabled]="isFull()"
          (click)="shotRequested.emit()"
        >
          Garder la vue
        </button>
        <p class="photo-album__notice" role="status" data-album-notice>{{ notice() ?? '' }}</p>
        @if (photos().length === 0) {
          <p class="photo-album__empty" data-album-empty>Aucune photo pour l’instant.</p>
        } @else {
          <ul class="photo-album__grid">
            @for (photo of photos(); track photo.id) {
              <li class="photo-album__item" [attr.data-album-photo]="photo.id">
                <button
                  type="button"
                  class="photo-album__thumb"
                  [attr.aria-label]="'Agrandir : ' + caption(photo)"
                  data-album-open
                  (click)="enlarge(photo.id)"
                >
                  <img class="photo-album__image" [src]="photo.dataUrl" alt="" />
                </button>
                <span class="photo-album__caption">{{ caption(photo) }}</span>
                <button
                  type="button"
                  class="photo-album__link"
                  [attr.aria-label]="'Supprimer la photo : ' + caption(photo)"
                  data-album-remove
                  (click)="remove(photo.id)"
                >
                  Supprimer
                </button>
              </li>
            }
          </ul>
        }
      }
    </section>
  }`,
  styleUrl: './photo-album.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape($event)' },
})
export class PhotoAlbum {
  /** Environnement du bac affiché : légende de la prochaine photo. */
  readonly environment = input<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  /** Heure de la journée affichée : légende de la prochaine photo. */
  readonly hour = input(0);

  /** Ouvert par l'utilisateur : l'application replie les autres panneaux. */
  readonly opened = output<void>();
  /** « Garder la vue » : l'application demande l'image à l'hôte et la rend par `add`. */
  readonly shotRequested = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly storage = inject(ALBUM_STORAGE);
  /** Numéro des photos de la session : identifiants uniques même à la même milliseconde. */
  private shots = 0;

  /** Album ouvert (fermé par défaut : captures et premier regard inchangés). */
  readonly open = signal(false);
  /** Photos de l'album, la plus récente d'abord. */
  readonly photos = signal<readonly AlbumPhoto[]>(readStoredAlbum(this.storage));
  /** Message bref : album plein, prise impossible, stockage refusé ; `null` : rien. */
  readonly notice = signal<string | null>(null);
  /** Photo agrandie, `null` : la grille. */
  private readonly enlargedId = signal<string | null>(null);
  protected readonly enlarged = computed(
    () => this.photos().find((photo) => photo.id === this.enlargedId()) ?? null,
  );
  protected readonly isFull = computed(() => this.photos().length >= ALBUM_CAPACITY);
  protected readonly capacity = ALBUM_CAPACITY;
  protected readonly caption = albumCaption;

  /** Ouvre l'album s'il est fermé, le ferme sinon (bouton « Album »). */
  toggle(): void {
    if (this.open()) {
      this.close(true);
      return;
    }
    this.notice.set(null);
    this.enlargedId.set(null);
    this.open.set(true);
    this.opened.emit();
    this.focus('#album-photo-titre');
  }

  /** Ferme l'album ; `focusToggle` rend le focus au bouton « Album ». */
  close(focusToggle = false): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.enlargedId.set(null);
    if (focusToggle) {
      afterNextRender(
        () =>
          this.host.nativeElement.ownerDocument
            .querySelector<HTMLElement>(TOGGLE_SELECTOR)
            ?.focus({ preventScroll: true }),
        { injector: this.injector },
      );
    }
  }

  /**
   * Garde l'image prise par l'hôte (`null` : prise impossible) avec la date de jeu et
   * l'environnement courants. Album plein : refus dit, aucune photo effacée.
   */
  add(shot: AlbumShot | null): void {
    if (shot === null) {
      this.notice.set(ALBUM_MESSAGES.failed);
      return;
    }
    this.shots += 1;
    const photo: AlbumPhoto = {
      id: `${Date.now().toString(36)}-${this.shots}`,
      dataUrl: shot.dataUrl,
      time: shot.time,
      hour: this.hour(),
      environment: this.environment(),
    };
    const result = addAlbumPhoto(this.photos(), photo);
    if (!result.ok) {
      this.notice.set(ALBUM_MESSAGES.full);
      return;
    }
    this.store(result.photos);
  }

  /** Supprime la photo `id` (et revient à la grille si elle était agrandie). */
  remove(id: string): void {
    if (this.enlargedId() === id) {
      this.enlargedId.set(null);
    }
    this.store(removeAlbumPhoto(this.photos(), id));
    this.focus('#album-photo-titre');
  }

  /** Agrandit la photo `id`, ou revient à la grille (`null`). */
  protected enlarge(id: string | null): void {
    this.enlargedId.set(id);
    this.focus(id === null ? '#album-photo-titre' : '[data-album-back]');
  }

  /** Tab et Maj+Tab tournent en boucle dans la fenêtre. */
  protected trap(event: KeyboardEvent): void {
    const dialog = this.host.nativeElement.querySelector<HTMLElement>('[data-photo-album]');
    if (dialog !== null) {
      trapTab(event, dialog);
    }
  }

  /** Échap : de l'agrandissement à la grille, puis fermeture (focus rendu au bouton). */
  protected onEscape(event: Event): void {
    if (!this.open() || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    if (this.enlargedId() !== null) {
      this.enlarge(null);
      return;
    }
    this.close(true);
  }

  /** Remplace l'album et le mémorise ; un refus du stockage est dit, l'album reste en session. */
  private store(photos: readonly AlbumPhoto[]): void {
    this.photos.set(photos);
    this.notice.set(writeStoredAlbum(this.storage, photos) ? null : ALBUM_MESSAGES.notSaved);
  }

  /** Donne le focus au premier élément `selector` de l'album, une fois la vue à jour. */
  private focus(selector: string): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(selector)
          ?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }
}
