import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { SaveMessage, SaveStatus } from '../../core/save-storage/save-storage';
import { MAX_SAVE_LENGTH } from '../../sim/save';
import { SettingMark } from '../settings-window/settings-search-filter';

/** Texte de l'état de la sauvegarde automatique (#70). */
export function saveStatusText(status: SaveStatus | null): string {
  switch (status) {
    case 'active':
      return 'Enregistré automatiquement dans ce navigateur.';
    case 'plein':
      return 'Stockage du navigateur plein : aquarium non enregistré.';
    case 'indisponible':
      return 'Stockage du navigateur indisponible : aquarium non enregistré.';
    default:
      return 'Sauvegarde automatique désactivée.';
  }
}

/**
 * Section « Sauvegarde » du panneau « Réglages » (#70, #426 ; sortie du panneau au #697) :
 * état de la sauvegarde automatique, « Partager ce bac » et son lien, « Exporter »,
 * « Importer » (fichier refusé avant lecture s'il est trop gros) et message de l'hôte.
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  imports: [SettingMark],
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-save-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './save-section.scss',
  template: `
    <legend class="control-panel__legend control-panel__legend--row">
      <span id="panneau-sauvegarde-titre">Sauvegarde</span>
      <button
        type="button"
        class="control-panel__edit"
        appSetting="Partager ce bac"
        (click)="shareRequested.emit()"
      >
        Partager ce bac
      </button>
    </legend>
    <p class="control-panel__note" data-save-status>{{ statusText() }}</p>
    <div class="control-panel__buttons">
      <button
        type="button"
        class="control-panel__button"
        appSetting="Exporter"
        (click)="exportRequested.emit()"
      >
        Exporter
      </button>
      <button
        type="button"
        class="control-panel__button"
        appSetting="Importer"
        (click)="fileInput.click()"
      >
        Importer
      </button>
      <input
        #fileInput
        class="control-panel__file"
        type="file"
        accept="application/json,.json"
        tabindex="-1"
        aria-label="Fichier de sauvegarde à importer"
        (change)="onFile($event)"
      />
    </div>
    <!-- Lien de partage (#426) : celui du bac affiché seul, après « Partager ce bac ». -->
    @if (shareLink(); as link) {
      <input
        class="control-panel__share-link"
        type="text"
        readonly
        aria-label="Lien de partage"
        data-share-link
        [value]="link"
        (focus)="selectAll($event)"
      />
    }
    @if (saveMessage(); as message) {
      <p
        class="control-panel__message"
        [class.control-panel__message--error]="message.kind === 'erreur'"
        [attr.role]="message.kind === 'erreur' ? 'alert' : 'status'"
        data-save-message
      >
        {{ message.text }}
      </p>
    }
  `,
})
export class SaveSection {
  /** État de la sauvegarde automatique (#70). */
  readonly saveStatus = input<SaveStatus | null>(null);
  /** Dernier message de la sauvegarde : import refusé, import réussi… */
  readonly saveMessage = input<SaveMessage | null>(null);
  /** Dernier lien de partage (#426), `null` sinon. */
  readonly shareLink = input<string | null>(null);

  /** Bouton « Exporter » (#70). */
  readonly exportRequested = output<void>();
  /** Bouton « Partager ce bac » (#426). */
  readonly shareRequested = output<void>();
  /** Contenu du fichier choisi avec « Importer » (texte, pas encore validé ; #70). */
  readonly importRequested = output<string>();
  /** Fichier choisi refusé avant lecture (trop gros, illisible) : raison, en français. */
  readonly importRejected = output<string>();

  protected readonly statusText = computed(() => saveStatusText(this.saveStatus()));

  /**
   * Fichier choisi avec « Importer » : refusé avant lecture s'il dépasse `MAX_SAVE_LENGTH`
   * octets, sinon lu en texte et transmis à l'hôte (qui le valide). Le champ est vidé pour
   * qu'un même fichier puisse être choisi de nouveau.
   */
  protected async onFile(event: Event): Promise<void> {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    field.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_SAVE_LENGTH) {
      this.importRejected.emit(
        `fichier trop volumineux (${Math.ceil(file.size / 1024)} Kio, ${MAX_SAVE_LENGTH / 1024} Kio au plus)`,
      );
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      this.importRejected.emit('fichier illisible');
      return;
    }
    this.importRequested.emit(text);
  }

  /** Champ du lien de partage (#426) : tout sélectionné au focus, prêt à copier. */
  protected selectAll(event: Event): void {
    (event.target as HTMLInputElement).select();
  }
}
