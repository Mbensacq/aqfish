import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  untracked,
} from '@angular/core';

import { GUIDE_STEPS, helpStatusText, whyTopics, type WhyTopicId } from '../../sim/beginner-help';
import { BeginnerGuideState } from './beginner-guide-state';

/** Identifiant du titre du dialogue (cible de `aria-labelledby`). */
export const BEGINNER_GUIDE_TITLE_ID = 'guide-debutant-titre';

/** Identifiant du texte d'une explication (cible de `aria-controls`). */
export function whyTextId(id: WhyTopicId): string {
  return `pourquoi-${id}`;
}

/** Éléments qui peuvent recevoir le focus au clavier. */
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex="0"]';

/**
 * « Guide du débutant » (issue #240, ADR 0072) : dialogue modal (rôle `dialog`,
 * `aria-modal`, titre par `aria-labelledby`) avec les cinq étapes et les explications
 * « Pourquoi ? » (`sim/beginner-help.ts`), chacune dépliable (`aria-expanded`).
 *
 * Clavier : le focus entre dans le dialogue à l'ouverture (sur l'explication demandée, sinon
 * sur le dialogue), Tab et Maj+Tab y tournent en boucle, Échap ferme ; le focus revient alors
 * à l'élément qui l'avait ouvert (`BeginnerGuideState`). Les touches frappées dans le
 * dialogue ne vont pas aux raccourcis de l'application. Un clic sur le voile ferme aussi.
 *
 * Ouvert par le wiki, par « Pourquoi ? » sous une alerte, et une fois à la première visite
 * (c'est l'application qui le demande, jamais en mode capture, où l'interface est absente).
 */
@Component({
  selector: 'app-beginner-guide',
  template: `@if (state.open()) {
    <div class="guide__backdrop" data-guide-backdrop aria-hidden="true"></div>
    <div
      class="guide"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="titleId"
      tabindex="-1"
      data-beginner-guide
      (keydown)="onKeydown($event)"
    >
      <div class="guide__header">
        <h2 class="guide__title" [id]="titleId">Guide du débutant</h2>
        <button type="button" class="guide__button" data-guide-close (click)="state.hide()">
          Fermer
        </button>
      </div>
      <p class="guide__intro">
        Cinq étapes pour un bac en bonne santé. « Pourquoi ? » explique chaque notion.
      </p>
      <ol class="guide__steps">
        @for (step of steps; track step.id) {
          <li class="guide__step" [attr.data-guide-step]="step.id">
            <h3 class="guide__step-title">{{ step.title }}</h3>
            <p>{{ step.text }}</p>
            <p class="guide__in-game"><b>Dans le jeu :</b> {{ step.inGame }}</p>
            <small class="guide__status">{{ statusText(step.status) }}</small>
          </li>
        }
      </ol>
      <h3 class="guide__group">Pourquoi ?</h3>
      <ul class="guide__topics">
        @for (topic of topics; track topic.id) {
          <li [attr.data-why]="topic.id">
            <button
              type="button"
              class="guide__why"
              [attr.aria-expanded]="expanded() === topic.id"
              [attr.aria-controls]="textId(topic.id)"
              [attr.data-why-toggle]="topic.id"
              (click)="toggle(topic.id)"
            >
              <span class="guide__chevron" aria-hidden="true">{{
                expanded() === topic.id ? '▾' : '▸'
              }}</span>
              {{ topic.title }}
            </button>
            @if (expanded() === topic.id) {
              <div class="guide__why-text" [id]="textId(topic.id)" data-why-text>
                @for (paragraph of topic.paragraphs; track $index) {
                  <p>{{ paragraph }}</p>
                }
                <small class="guide__status">{{ statusText(topic.status) }}</small>
              </div>
            }
          </li>
        }
      </ul>
      <p class="guide__disclaimer">
        Ce jeu n’est pas un avis vétérinaire : un animal réellement malade justifie un vétérinaire.
      </p>
    </div>
  }`,
  styleUrl: './beginner-guide.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onDocumentEscape($event)',
    '(click)': 'onClick($event)',
  },
})
export class BeginnerGuide {
  protected readonly state = inject(BeginnerGuideState);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly titleId = BEGINNER_GUIDE_TITLE_ID;
  protected readonly textId = whyTextId;
  protected readonly statusText = helpStatusText;
  protected readonly steps = GUIDE_STEPS;
  protected readonly topics = whyTopics();

  /** Explication dépliée (une à la fois) : celle demandée à l'ouverture, puis au choix. */
  readonly expanded = linkedSignal<WhyTopicId | null>(() => this.state.topic());

  constructor() {
    effect(() => {
      if (this.state.open()) {
        const topic = untracked(() => this.state.topic());
        this.focusOnOpen(topic);
      }
    });
  }

  /** Déplie l'explication `id`, ou la replie si elle l'était. */
  toggle(id: WhyTopicId): void {
    this.expanded.update((open) => (open === id ? null : id));
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Dialogue modal : aucune touche ne va aux raccourcis de l'application (vues, `?`, Échap
    // du wiki), qui écoutent le document.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.state.hide();
    } else if (event.key === 'Tab') {
      this.trapTab(event);
    }
  }

  /** Clic sur le voile (hors du dialogue) : ferme le guide. */
  protected onClick(event: Event): void {
    if (event.target instanceof HTMLElement && event.target.hasAttribute('data-guide-backdrop')) {
      this.state.hide();
    }
  }

  /** Échap alors que le focus a quitté le dialogue (rare : il y est gardé) : ferme aussi. */
  protected onDocumentEscape(event: Event): void {
    if (this.state.open() && !event.defaultPrevented) {
      event.preventDefault();
      this.state.hide();
    }
  }

  /** Tab sur le dernier élément revient au premier, Maj+Tab sur le premier va au dernier. */
  private trapTab(event: KeyboardEvent): void {
    const dialog = this.dialog();
    if (dialog === null) {
      return;
    }
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.host.nativeElement.ownerDocument.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  private dialog(): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>('[data-beginner-guide]');
  }

  /**
   * Focus sur l'explication demandée, déroulée en haut du dialogue pour que son texte se lise
   * sans défiler (téléphone), sinon sur le dialogue.
   */
  private focusOnOpen(topic: WhyTopicId | null): void {
    afterNextRender(
      () => {
        const target =
          topic === null
            ? this.dialog()
            : this.host.nativeElement.querySelector<HTMLElement>(`[data-why-toggle="${topic}"]`);
        target?.focus({ preventScroll: topic === null });
        if (topic !== null) {
          // `scrollIntoView` manque à jsdom.
          target?.scrollIntoView?.({ block: 'start' });
        }
      },
      { injector: this.injector },
    );
  }
}
