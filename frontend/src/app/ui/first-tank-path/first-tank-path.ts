import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import type { GuidePage } from '../../sim/care-guide';
import type { FirstTankLink, FirstTankPathView } from '../../sim/first-tank-path';
import { BeginnerGuideState } from '../beginner-guide/beginner-guide-state';
import { FirstTankPathPrefs } from './first-tank-path-prefs';

/**
 * Panneau d'étape du parcours « Mon premier aquarium » (#512, ADR 0119), en bordure gauche :
 * une languette repliable, sans voile ni focus imposé, donc jamais bloquante. L'étape en cours
 * vient de `sim/first-tank-path.ts` ; chaque étape renvoie au wiki ou au guide du débutant.
 * « Masquer » désactive le parcours ; on le reprend depuis le guide du débutant.
 */
@Component({
  selector: 'app-first-tank-path',
  template: `@if (shown(); as path) {
    <aside
      class="path"
      data-first-tank-path
      [attr.data-step]="path.current?.id ?? 'fin'"
      [attr.data-done]="path.doneCount"
      aria-label="Parcours guidé : mon premier aquarium"
    >
      <button
        type="button"
        class="path__toggle"
        data-first-tank-toggle
        [attr.aria-expanded]="expanded()"
        (click)="toggle()"
      >
        <span aria-hidden="true">{{ expanded() ? '▾' : '▸' }}</span>
        Mon premier aquarium
        <span class="path__count">{{ path.doneCount }}/{{ path.total }}</span>
      </button>
      @if (expanded()) {
        <div class="path__body" data-first-tank-body aria-live="polite">
          @if (path.current; as step) {
            <h2 class="path__title">{{ path.currentNumber }}. {{ step.title }}</h2>
            <p>{{ step.action }}</p>
            <p class="path__why"><b>Pourquoi ?</b> {{ step.why }}</p>
            <button
              type="button"
              class="path__link"
              data-first-tank-link
              (click)="follow(step.link)"
            >
              {{ step.link.label }}
            </button>
          } @else {
            <h2 class="path__title">Parcours terminé</h2>
            <p>
              Bravo : votre bac tourne, et vous savez l’entretenir. Le calendrier prend le relais.
            </p>
          }
          <button type="button" class="path__hide" data-first-tank-hide (click)="hide()">
            Masquer le parcours
          </button>
        </div>
      }
    </aside>
  }`,
  styleUrl: './first-tank-path.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirstTankPath {
  private readonly prefs = inject(FirstTankPathPrefs);
  private readonly guide = inject(BeginnerGuideState);

  /** Parcours du bac affiché (`null` : non proposé pour ce bac). */
  readonly view = input<FirstTankPathView | null>(null);
  /** Renvoi vers une page du wiki. */
  readonly wikiPageRequested = output<GuidePage>();

  /** Parcours à afficher : rien s'il n'est pas proposé ou s'il a été masqué. */
  protected readonly shown = computed(() => (this.prefs.mode() === 'masque' ? null : this.view()));
  protected readonly expanded = computed(() => this.prefs.mode() === 'ouvert');

  protected toggle(): void {
    this.prefs.setMode(this.expanded() ? 'replie' : 'ouvert');
  }

  protected hide(): void {
    this.prefs.setMode('masque');
  }

  protected follow(link: FirstTankLink): void {
    if (link.kind === 'wiki') {
      this.wikiPageRequested.emit(link.page);
    } else {
      this.guide.show(link.topic);
    }
  }
}
