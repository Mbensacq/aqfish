import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import type { CareMode } from '../../sim/care-mode';
import type { PossibleSpecies } from '../../sim/possible-species';
import { possibleSpeciesCartel } from '../../sim/possible-species-text';

/**
 * Liste des espèces encore possibles pour le bac courant (issue #818, tranche 2 de #730,
 * `docs/ECOSYSTEME.md` § 3.2), dans la section « Population » : un bouton « Espèces encore
 * possibles » (disclosure, `aria-expanded`, fermé au départ) ouvre la liste triée
 * (compatibles, précautions, incompatibles), chaque espèce en cartel (`docs/INTERFACE.md`) :
 * nom en gras, nom scientifique en italique, verdict et nombre restant, puis chaque raison avec
 * sa source ou « approximation de jeu ». Masquée en mode décor (aucune contrainte).
 *
 * Le calcul est fait par l'hôte au relevé des effectifs (`possibleSpecies`) ; le composant ne
 * fait que mettre en texte (`computed`), jamais dans la boucle d'affichage.
 */
@Component({
  selector: 'app-possible-species-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './possible-species-list.scss',
  template: `
    @if (careMode() !== 'decor' && cartels().length > 0) {
      <button
        type="button"
        class="possible__toggle"
        aria-controls="especes-possibles"
        [attr.aria-expanded]="open()"
        data-possible-toggle
        (click)="open.set(!open())"
      >
        Espèces encore possibles ({{ possibleCount() }} sur {{ cartels().length }})
      </button>
      @if (open()) {
        <ul class="possible__list" id="especes-possibles" data-possible-list>
          @for (cartel of cartels(); track cartel.species) {
            <li
              class="possible__item"
              [attr.data-possible-species]="cartel.species"
              [attr.data-possible-level]="cartel.level"
            >
              <p class="possible__head">
                <b>{{ cartel.name }}</b> · <i>{{ cartel.scientificName }}</i> —
                <span class="possible__summary">{{ cartel.summary }}</span>
              </p>
              @for (reason of cartel.reasons; track $index) {
                <p class="possible__reason" data-possible-reason>{{ reason }}</p>
              }
            </li>
          }
        </ul>
      }
    }
  `,
})
export class PossibleSpeciesList {
  /** Espèces du milieu, triées par verdict (fournies par l'hôte). */
  readonly entries = input<readonly PossibleSpecies[]>([]);
  /** Mode du bac : rien à afficher en décor. */
  readonly careMode = input<CareMode>('soins');

  /** Liste ouverte (fermée au départ). */
  protected readonly open = signal(false);
  /** Cartels de la liste, recalculés seulement quand les espèces changent. */
  protected readonly cartels = computed(() => this.entries().map(possibleSpeciesCartel));
  /** Espèces qu'on peut encore ajouter : non incompatibles, avec de la place. */
  protected readonly possibleCount = computed(
    () => this.entries().filter((e) => e.level !== 'incompatible' && e.remaining > 0).length,
  );
}
