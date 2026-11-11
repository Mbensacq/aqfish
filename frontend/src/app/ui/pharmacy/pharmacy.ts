import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';

import { guideEntries, type GuidePage } from '../../sim/care-guide';
import { mixWarnings } from '../../sim/compatibility';
import { dashboardAlerts } from '../../sim/dashboard-alerts';
import { DEFAULT_ENVIRONMENT_ID, environmentById, type EnvironmentId } from '../../sim/environment';
import { EMPTY_HEALTH_SUMMARY, type HealthSummary } from '../../sim/health-summary';
import {
  EMPTY_PHARMACY,
  PHARMACY_INFO,
  PHARMACY_PRODUCTS,
  PHARMACY_STATUS_LABELS,
  pharmacyAdvice,
  productStatus,
  type PharmacyProduct,
  type PharmacyState,
} from '../../sim/pharmacy';
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import { sideEffectWarning } from '../../sim/side-effects';
import type { TreatmentReadout } from '../../sim/treatment-text';
import { DEFAULT_WATER_SAMPLE, type WaterSample } from '../../sim/water-dashboard';
import { DEFAULT_WATER_READOUT, type WaterReadout } from '../../sim/water-quality';
import {
  WATER_KIT_INFO,
  WATER_KITS,
  type WaterKit,
  type WaterTestView,
} from '../../sim/water-test';

/** Identifiant du panneau (cible de `aria-controls`). */
export const PHARMACY_ID = 'pharmacie-bac';

/** Avertissement de chaque produit, ou `null` sans effet secondaire (#549). */
const WARNINGS = Object.fromEntries(
  PHARMACY_PRODUCTS.map((product) => [product, sideEffectWarning(product)]),
) as Readonly<Record<PharmacyProduct, string | null>>;

/** Conseil du wiki sur les tests d'eau (`sim/care-guide.ts`, entrée « tests »), lu une fois. */
const TEST_GUIDE_ADVICE =
  guideEntries('produits')
    .find((entry) => entry.id === 'tests')
    ?.lines.find((line) => line.label === 'Conseil')?.text ?? null;

/** Éléments qui peuvent recevoir le focus au clavier (piège du focus). */
const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Pharmacie du bac (issue #533, ADR 0125) : bouton discret à côté de « Wiki », panneau (rôle
 * `dialog`) qui liste les produits existants et leur état dans le bac affiché, et conseille
 * celui qui répond à l'alerte la plus grave (`sim/pharmacy.ts`, mêmes alertes que le tableau
 * de bord). Elle n'agit sur rien : les gestes restent dans « Réglages » ; un lien ouvre la page
 * « Produits et traitements » du wiki. Les effets secondaires d'un produit (#549) sont écrits
 * sous son nom et sous le conseil ; le conseil décrit le panneau (`aria-describedby`), lu à
 * l'ouverture.
 *
 * Clavier : le focus entre sur le titre du panneau à l'ouverture, Tab et Maj+Tab y tournent en
 * boucle, Échap ferme ; le focus revient alors au bouton « Pharmacie ». Exclusive avec les
 * autres panneaux : c'est l'application qui replie les autres (`opened`, `close`).
 */
@Component({
  selector: 'app-pharmacy',
  template: `<button
      type="button"
      class="pharmacy__toggle"
      [class.pharmacy__toggle--open]="open()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="panelId"
      aria-label="Pharmacie du bac"
      data-pharmacy-toggle
      (click)="toggle()"
    >
      Pharmacie
    </button>
    @if (open()) {
      <section
        class="pharmacy"
        [id]="panelId"
        role="dialog"
        aria-labelledby="pharmacie-bac-titre"
        aria-describedby="pharmacie-bac-conseil"
        (keydown)="trap($event)"
      >
        <div class="pharmacy__header">
          <h2 class="pharmacy__title" id="pharmacie-bac-titre" tabindex="-1">Pharmacie du bac</h2>
          <button type="button" class="pharmacy__button" data-pharmacy-close (click)="close(true)">
            Fermer
          </button>
        </div>
        <div
          class="pharmacy__advice"
          id="pharmacie-bac-conseil"
          data-pharmacy-advice
          [attr.data-product]="advice()?.product"
        >
          @if (advice(); as view) {
            <p class="pharmacy__alert">
              Alerte : <strong>{{ view.message }}</strong>
            </p>
            <p>
              @if (view.product !== null) {
                Conseil : <strong>{{ info[view.product].label }}</strong>
                @if (view.inProgress) {
                  <small class="pharmacy__status">(en cours)</small>
                }
                <br />
              }
              {{ view.text }}
            </p>
            @if (view.product !== null && warnings[view.product]; as warning) {
              <!-- Effets secondaires du produit conseillé, lus à l'ouverture (#549). -->
              <p class="pharmacy__warning" data-pharmacy-advice-warning>{{ warning }}</p>
            }
          } @else {
            <p>Aucune alerte : aucun produit à verser.</p>
          }
        </div>
        <h3 class="pharmacy__section">Tests de l’eau</h3>
        <div class="pharmacy__kits" role="group" aria-label="Lancer un test de l’eau">
          @for (kit of kits; track kit) {
            <button
              type="button"
              class="pharmacy__button pharmacy__kit"
              [attr.data-water-kit]="kit"
              [disabled]="testRunning()"
              (click)="waterTestRequested.emit(kit)"
            >
              {{ kitInfo[kit].label }}
            </button>
          }
        </div>
        <div
          class="pharmacy__test"
          data-water-test
          [attr.data-state]="
            waterTest() === null ? 'aucun' : waterTest()!.done ? 'termine' : 'en-cours'
          "
          [attr.data-kit]="waterTest()?.kit"
          aria-live="polite"
        >
          @if (waterTest(); as test) {
            @if (test.done) {
              <p>
                Test {{ kitInfo[test.kit].label }} :
                @for (result of test.results; track result.label) {
                  <strong class="pharmacy__result" data-water-result
                    >{{ result.label }} ≈ {{ result.text }}</strong
                  >
                }
              </p>
              <p data-water-test-advice>{{ test.advice }}</p>
            } @else {
              <p>
                Test {{ kitInfo[test.kit].label }} en cours : résultat dans
                {{ test.remainingSeconds }} s.
              </p>
            }
          } @else {
            <p>Choisir un kit : le résultat arrive après quelques secondes de simulation.</p>
          }
          @if (testGuideAdvice !== null) {
            <small class="pharmacy__use" data-water-test-guide
              >Wiki : {{ testGuideAdvice }}. Lecture arrondie aux paliers de couleur du kit
              (approximation de jeu).</small
            >
          }
        </div>
        <h3 class="pharmacy__section">Produits</h3>
        <ul class="pharmacy__list">
          @for (row of rows(); track row.product) {
            <li
              class="pharmacy__item"
              [class.pharmacy__item--advised]="row.product === advice()?.product"
              [attr.data-pharmacy-product]="row.product"
              [attr.data-status]="row.status"
            >
              <span class="pharmacy__name">{{ row.label }}</span>
              <small class="pharmacy__state" [attr.data-state]="row.status">{{
                row.statusLabel
              }}</small>
              <small class="pharmacy__use">{{ row.use }} ; {{ row.where }}</small>
              @if (row.warning !== null) {
                <small class="pharmacy__warning" data-pharmacy-warning>{{ row.warning }}</small>
              }
            </li>
          }
        </ul>
        <button
          type="button"
          class="pharmacy__button pharmacy__button--wide"
          data-pharmacy-wiki
          (click)="wikiPageRequested.emit('produits')"
        >
          Produits et traitements (wiki)
        </button>
      </section>
    }`,
  styleUrl: './pharmacy.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape($event)' },
})
export class Pharmacy {
  readonly sample = input<WaterSample>(DEFAULT_WATER_SAMPLE);
  readonly readout = input<WaterReadout>(DEFAULT_WATER_READOUT);
  readonly health = input<HealthSummary>(EMPTY_HEALTH_SUMMARY);
  readonly environment = input<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  readonly population = input<PopulationCounts>(NO_FISH);
  readonly treatment = input<TreatmentReadout | null>(null);
  /** Produits du bac affiché (`pharmacyState`, relevé par l'hôte). */
  readonly products = input<PharmacyState>(EMPTY_PHARMACY);
  /** Test de l'eau du bac affiché (#564), relevé par l'hôte ; `null` : aucun. */
  readonly waterTest = input<WaterTestView | null>(null);

  /** Ouverte par l'utilisateur : l'application replie les autres panneaux. */
  readonly opened = output<void>();
  /** Lien « Produits et traitements » : l'application ouvre le wiki sur cette page. */
  readonly wikiPageRequested = output<GuidePage>();
  /** Kit choisi : l'hôte lance le test (`startWaterTest`). */
  readonly waterTestRequested = output<WaterKit>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Pharmacie ouverte (fermée par défaut : captures et premier regard inchangés). */
  readonly open = signal(false);
  protected readonly panelId = PHARMACY_ID;
  protected readonly info = PHARMACY_INFO;
  /** Effets secondaires déclarés de chaque produit (`sim/side-effects.ts`, #549). */
  protected readonly warnings = WARNINGS;
  protected readonly kits = WATER_KITS;
  protected readonly kitInfo = WATER_KIT_INFO;
  protected readonly testGuideAdvice = TEST_GUIDE_ADVICE;
  /** Un test court : les kits attendent son résultat. */
  protected readonly testRunning = computed(() => {
    const test = this.waterTest();
    return test !== null && !test.done;
  });

  /** Conseil pour l'alerte la plus grave (mêmes alertes que le tableau de bord). */
  protected readonly advice = computed(() =>
    pharmacyAdvice(
      dashboardAlerts({
        sample: this.sample(),
        phBands: this.readout().phBands,
        health: this.health(),
        mixes: mixWarnings(environmentById(this.environment()).species, this.population()),
        treatment: this.treatment(),
      }),
      this.products(),
    ),
  );

  /** Lignes de la liste : nom, état, usage et emplacement de chaque produit. */
  protected readonly rows = computed(() => {
    const { active, used } = this.products();
    return PHARMACY_PRODUCTS.map((product) => {
      const status = productStatus(product, active, used);
      return {
        product,
        ...PHARMACY_INFO[product],
        status,
        statusLabel: PHARMACY_STATUS_LABELS[status],
        warning: WARNINGS[product],
      };
    });
  });

  toggle(): void {
    if (this.open()) {
      this.close(true);
    } else {
      this.open.set(true);
      this.opened.emit();
      this.focus('#pharmacie-bac-titre');
    }
  }

  /** Ferme la pharmacie ; `focusToggle` rend le focus au bouton « Pharmacie ». */
  close(focusToggle = false): void {
    this.open.set(false);
    if (focusToggle) {
      this.focus('[data-pharmacy-toggle]');
    }
  }

  /** Tab et Maj+Tab tournent en boucle dans le panneau. */
  protected trap(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }
    const panel = this.host.nativeElement.querySelector<HTMLElement>(`#${PHARMACY_ID}`);
    if (panel === null) {
      return;
    }
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.host.nativeElement.ownerDocument.activeElement;
    const backward = event.shiftKey;
    if (backward && (active === first || !focusable.includes(active as HTMLElement))) {
      event.preventDefault();
      last.focus();
    } else if (!backward && (active === last || !panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Échap, écouté sur le document : ferme la pharmacie, focus rendu au bouton. */
  protected onEscape(event: Event): void {
    if (!this.open() || event.defaultPrevented) {
      return;
    }
    this.close(true);
  }

  /** Donne le focus au premier élément `selector`, une fois la vue à jour. */
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
