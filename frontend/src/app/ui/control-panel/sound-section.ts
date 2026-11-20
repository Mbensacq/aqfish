import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { AmbientSoundState } from '../ambient-sound/ambient-sound-state';

/**
 * Section « Son » du panneau « Réglages » (#411, ADR 0100 ; sortie du panneau au #697) :
 * case « Sons d'ambiance » et volume sur une seule ligne, désactivés par défaut ; sans Web
 * Audio, ils restent atteignables au clavier (`aria-disabled`) avec une explication.
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-sound-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sound-section.scss',
  template: `
    <legend class="control-panel__legend">Son</legend>
    <div class="control-panel__row">
      <label class="control-panel__check" data-ambient-sound>
        <input
          type="checkbox"
          [checked]="soundEnabled()"
          [attr.aria-disabled]="soundAvailable() ? null : 'true'"
          [attr.aria-describedby]="soundAvailable() ? null : 'panneau-son-indisponible'"
          (click)="onAmbientSoundClick($event)"
          (change)="onAmbientSound($event)"
        />
        Sons d'ambiance
      </label>
      <input
        class="control-panel__range control-panel__count-range"
        type="range"
        min="0"
        max="100"
        step="5"
        aria-label="Volume des sons d'ambiance"
        data-ambient-volume
        [value]="soundVolume()"
        [attr.aria-valuetext]="soundVolume() + ' %'"
        [attr.aria-disabled]="soundAvailable() ? null : 'true'"
        [attr.aria-describedby]="soundAvailable() ? null : 'panneau-son-indisponible'"
        (input)="onAmbientVolume($event)"
      />
    </div>
    @if (!soundAvailable()) {
      <p class="control-panel__message" id="panneau-son-indisponible">
        @if (soundRefused()) {
          Sons indisponibles : le navigateur a refusé de démarrer l'audio. Recharger la page pour
          réessayer.
        } @else {
          Sons indisponibles : ce navigateur ne prend pas en charge Web Audio.
        }
      </p>
    }
  `,
})
export class SoundSection {
  /** Sons d'ambiance (#411), partagés avec l'hôte de l'aquarium qui fournit la scène. */
  private readonly sound = inject(AmbientSoundState);
  /** Case « Sons d'ambiance » cochée. */
  protected readonly soundEnabled = this.sound.enabled;
  /** Web Audio utilisable ; sinon case et curseur désactivés, avec une explication. */
  protected readonly soundAvailable = this.sound.available;
  /** Web Audio présent mais création du contexte refusée (#413) : autre explication. */
  protected readonly soundRefused = this.sound.refused;
  /** Volume en pour cent, pour le curseur. */
  protected readonly soundVolume = computed(() => Math.round(this.sound.volume() * 100));

  /**
   * Sans Web Audio, la case reste atteignable au clavier (`aria-disabled`, comme « Éditer le
   * décor ») mais ne se coche pas : le clic est annulé.
   */
  protected onAmbientSoundClick(event: Event): void {
    if (!this.soundAvailable()) {
      event.preventDefault();
    }
  }

  /** Case « Sons d'ambiance » (#411) : le `change` est un geste, le contexte audio peut naître. */
  protected onAmbientSound(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.sound.setEnabled(input.checked);
    // Démarrage refusé (#413) : `enabled` repasse à faux dans le même geste, sans changer de
    // valeur pour la liaison `[checked]` ; la case est donc recalée à la main.
    input.checked = this.sound.enabled();
  }

  /** Curseur du volume (#411), en pour cent ; sans Web Audio, il revient à sa valeur. */
  protected onAmbientVolume(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.soundAvailable()) {
      input.value = String(this.soundVolume());
      return;
    }
    this.sound.setVolume(Number(input.value) / 100);
  }
}
