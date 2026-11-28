import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { ALBUM_MESSAGES, ALBUM_STORAGE, PhotoAlbum } from './photo-album';
import { ALBUM_CAPACITY, ALBUM_STORAGE_KEY, type AlbumStorage } from './photo-album-store';

const SHOT = { dataUrl: 'data:image/png;base64,AAAA', time: 1200 };

describe('PhotoAlbum (#860)', () => {
  let fixture: ComponentFixture<PhotoAlbum>;
  let stored: Map<string, string>;
  let refuseWrites: boolean;
  let opened: number;
  let shots: number;

  const storage: AlbumStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => {
      if (refuseWrites) {
        throw new Error('quota dépassé');
      }
      stored.set(key, value);
    },
  };

  const album = () => fixture.componentInstance;
  const root = () => fixture.nativeElement as HTMLElement;
  const dialog = () => root().querySelector<HTMLElement>('[data-photo-album]');
  const button = (selector: string) => root().querySelector<HTMLButtonElement>(selector)!;
  const items = () => Array.from(root().querySelectorAll<HTMLElement>('[data-album-photo]'));
  const notice = () => root().querySelector('[data-album-notice]')?.textContent?.trim() ?? '';
  const escape = async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await fixture.whenStable();
  };

  async function create(options: { storage?: AlbumStorage | null } = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        { provide: ALBUM_STORAGE, useValue: 'storage' in options ? options.storage : storage },
      ],
    });
    fixture = TestBed.createComponent(PhotoAlbum);
    fixture.componentRef.setInput('environment', 'bassin');
    fixture.componentRef.setInput('hour', 14.5);
    album().opened.subscribe(() => opened++);
    album().shotRequested.subscribe(() => shots++);
    document.body.appendChild(root());
    await fixture.whenStable();
  }

  async function openAlbum(): Promise<void> {
    album().toggle();
    await fixture.whenStable();
  }

  async function addShot(): Promise<void> {
    album().add(SHOT);
    await fixture.whenStable();
  }

  beforeEach(() => {
    stored = new Map();
    refuseWrites = false;
    opened = 0;
    shots = 0;
  });

  afterEach(() => root().remove());

  it('fermé par défaut ; s’ouvre en dialogue modal, focus sur le titre, et le signale', async () => {
    await create();
    expect(dialog()).toBeNull();
    await openAlbum();
    expect(dialog()?.getAttribute('role')).toBe('dialog');
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement?.id).toBe('album-photo-titre');
    expect(opened).toBe(1);
    expect(root().querySelector('[data-album-empty]')).not.toBeNull();
  });

  it('« Garder la vue » demande une prise ; la photo porte la date de jeu et le milieu', async () => {
    await create();
    await openAlbum();
    button('[data-album-add]').click();
    expect(shots).toBe(1);
    await addShot();
    expect(items()).toHaveLength(1);
    expect(items()[0].textContent).toContain('Jour 2, 14 h 30 · Bassin');
    expect(root().querySelector('[data-album-count]')?.textContent?.trim()).toBe(
      `1 / ${ALBUM_CAPACITY}`,
    );
    expect(JSON.parse(stored.get(ALBUM_STORAGE_KEY)!)).toHaveLength(1);
  });

  it('relit l’album mémorisé à la création', async () => {
    stored.set(
      ALBUM_STORAGE_KEY,
      JSON.stringify([{ id: 'a', ...SHOT, hour: 9, environment: 'recif' }]),
    );
    await create();
    expect(
      album()
        .photos()
        .map((photo) => photo.id),
    ).toEqual(['a']);
  });

  it('agrandit au clic, Échap revient à l’album puis ferme, focus rendu au bouton « Album »', async () => {
    const toggle = document.createElement('button');
    toggle.setAttribute('data-album-toggle', '');
    document.body.appendChild(toggle);
    await create();
    await openAlbum();
    await addShot();
    button('[data-album-open]').click();
    await fixture.whenStable();
    const enlarged = root().querySelector('[data-album-enlarged]');
    expect(enlarged?.querySelector('img')?.getAttribute('alt')).toBe('Jour 2, 14 h 30 · Bassin');
    await escape();
    expect(root().querySelector('[data-album-enlarged]')).toBeNull();
    expect(dialog()).not.toBeNull();
    await escape();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(toggle);
    toggle.remove();
  });

  it('« Retour à l’album » et « Fermer » à la souris', async () => {
    await create();
    await openAlbum();
    await addShot();
    button('[data-album-open]').click();
    await fixture.whenStable();
    button('[data-album-back]').click();
    await fixture.whenStable();
    expect(items()).toHaveLength(1);
    button('[data-album-close]').click();
    await fixture.whenStable();
    expect(dialog()).toBeNull();
  });

  it('supprime une photo et la retire du stockage', async () => {
    await create();
    await openAlbum();
    await addShot();
    await addShot();
    expect(items()).toHaveLength(2);
    button('[data-album-remove]').click();
    await fixture.whenStable();
    expect(items()).toHaveLength(1);
    expect(JSON.parse(stored.get(ALBUM_STORAGE_KEY)!)).toHaveLength(1);
  });

  it('album plein : « Garder la vue » désactivé, un ajout est refusé et dit', async () => {
    await create();
    await openAlbum();
    for (let i = 0; i < ALBUM_CAPACITY; i++) {
      album().add(SHOT);
    }
    await fixture.whenStable();
    expect(button('[data-album-add]').disabled).toBe(true);
    await addShot();
    expect(items()).toHaveLength(ALBUM_CAPACITY);
    expect(notice()).toBe(ALBUM_MESSAGES.full);
  });

  it('prise impossible : message, aucune photo ajoutée', async () => {
    await create();
    await openAlbum();
    album().add(null);
    await fixture.whenStable();
    expect(items()).toHaveLength(0);
    expect(notice()).toBe(ALBUM_MESSAGES.failed);
  });

  it('stockage qui refuse l’écriture : photo gardée pour la session, refus dit', async () => {
    await create();
    await openAlbum();
    refuseWrites = true;
    await addShot();
    expect(items()).toHaveLength(1);
    expect(notice()).toBe(ALBUM_MESSAGES.notSaved);
  });

  it('sans stockage : album vide au départ, photos gardées pour la session', async () => {
    await create({ storage: null });
    await openAlbum();
    expect(items()).toHaveLength(0);
    await addShot();
    expect(items()).toHaveLength(1);
    expect(notice()).toBe(ALBUM_MESSAGES.notSaved);
  });

  it('Tab depuis le dernier bouton revient au premier (focus piégé)', async () => {
    await create();
    await openAlbum();
    await addShot();
    const last = Array.from(root().querySelectorAll<HTMLButtonElement>('button')).at(-1)!;
    last.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button('[data-album-close]'));
  });

  it('close() sur un album fermé ne fait rien', async () => {
    await create();
    album().close(true);
    await fixture.whenStable();
    expect(dialog()).toBeNull();
  });
});
