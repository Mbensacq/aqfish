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

import { CARE_MODE_LABELS, type CareMode } from '../../sim/care-mode';
import {
  unsuitableAnimals,
  unsuitableReasonText,
  unsuitableTitle,
  type UnsuitableAnimal,
} from '../../sim/care-return';
import { ALERT_SEVERITY_LABELS } from '../../sim/dashboard-alerts';
import { DEFAULT_ENVIRONMENT_ID, environmentById, type EnvironmentId } from '../../sim/environment';
import { NO_FISH, type PopulationCounts } from '../../sim/population';
import {
  EMPTY_QUARANTINE,
  QUARANTINE_DURATION_TEXT,
  type QuarantineView,
} from '../../sim/quarantine';
import { MAX_TANK_NAME_LENGTH } from '../../sim/room-state';
import type { SpeciesId } from '../../sim/species';
import { tankListDetail, tankListHint, type TankListEntry } from '../../sim/tank-list';
import { TREATMENT_KINDS, TREATMENTS, type TreatmentKind } from '../../sim/treatment';
import { DEFAULT_WATER_READOUT, type WaterReadout } from '../../sim/water-quality';
import type { TankNotice } from '../aquarium-host/aquarium-host';
import { isQuarantineShown, panelCatalog, treatmentTitle } from './panel-views';

/**
 * Section « Bacs » du panneau « Réglages » (#306, sortie du panneau au #697) : liste des bacs
 * de la pièce et sélection, mode du bac affiché et sa confirmation (#278), transfert d'un
 * animal à l'épuisette, quarantaine (#547, #553), renommage (#316) et message du dernier geste.
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau avec ses attributs
 * (`data-section`, `aria-labelledby`) : le DOM, les sélecteurs des tests et la mise en page en
 * colonnes ne changent pas (ADR 0161). Les demandes remontent au panneau, qui les relaie.
 */
@Component({
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-tanks-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tanks-section.scss',
  template: `
    <!-- Mode du bac affiché (#278) : sur la ligne du titre, sans ligne de plus (#316). -->
    <legend class="control-panel__legend control-panel__legend--row">
      <span id="panneau-bacs-titre">Bacs</span>
      <button
        type="button"
        class="control-panel__edit"
        data-care-mode-toggle
        [attr.data-mode]="careMode()"
        [attr.aria-label]="
          'Mode du bac affiché : ' + careModeLabels[careMode()].toLowerCase() + '. Changer de mode'
        "
        (click)="onToggleCareMode()"
      >
        Mode : {{ careModeLabels[careMode()].toLowerCase() }}
      </button>
    </legend>
    @if (confirmMode(); as mode) {
      <!-- Confirmation (#278) : posée au-dessus du panneau, sans en changer la mise en
           page (les colonnes à 1280 × 720 n'ont plus de place). -->
      <div
        class="control-panel__confirm"
        role="alertdialog"
        aria-labelledby="care-mode-title"
        aria-describedby="care-mode-text"
        data-care-mode-confirm
        (keydown.escape)="confirmMode.set(null); $event.stopPropagation()"
      >
        <p id="care-mode-title" class="control-panel__legend">
          {{ mode === 'decor' ? 'Passer en mode décor ?' : 'Revenir au mode soins ?' }}
        </p>
        <p id="care-mode-text" class="control-panel__note">
          @if (mode === 'decor') {
            « {{ shownTankName() }} » devient un aquarium purement graphique : l’eau, la faim et la
            santé sont mises en pause, pas effacées, et reprendront au retour en mode soins. Toute
            espèce peut y être ajoutée, sans alerte.
          } @else if (unsuitable().length === 0) {
            « {{ shownTankName() }} » redevient une simulation : l’eau, la faim et la santé
            reprennent où elles en étaient.
          } @else {
            « {{ shownTankName() }} » redevient une simulation : l’eau, la faim et la santé
            reprennent où elles en étaient. Ces animaux ne conviennent pas à ce bac : les retirer,
            ou les garder avec les avertissements habituels.
          }
        </p>
        <!-- Animaux inadaptés au retour en soins (#278, lot 2) : espèce et raison. -->
        @if (mode === 'soins' && unsuitable().length > 0) {
          <ul class="control-panel__tanks" aria-label="Animaux inadaptés à ce bac">
            @for (animal of unsuitable(); track animal.species) {
              <li [attr.data-unsuitable]="animal.species">
                <strong>{{ unsuitableTitle(animal) }}</strong>
                <span class="control-panel__warning">{{ unsuitableReasonText(animal) }}</span>
              </li>
            }
          </ul>
        }
        <div class="control-panel__buttons">
          @if (mode === 'soins' && unsuitable().length > 0) {
            <button
              type="button"
              class="control-panel__button"
              data-care-mode-remove
              (click)="onRemoveUnsuitable()"
            >
              Tout retirer
            </button>
          }
          <button
            type="button"
            class="control-panel__button"
            data-care-mode-confirm-yes
            (click)="onConfirmCareMode()"
          >
            {{
              mode === 'decor'
                ? 'Passer en mode décor'
                : unsuitable().length > 0
                  ? 'Tout garder'
                  : 'Revenir au mode soins'
            }}
          </button>
          <button type="button" class="control-panel__button" (click)="confirmMode.set(null)">
            Annuler
          </button>
        </div>
      </div>
    }
    <ul class="control-panel__tanks" aria-label="Liste des bacs">
      @for (tank of tankList(); track tank.id) {
        <li
          [attr.data-tank]="tank.id"
          [attr.data-tank-alert]="tank.worst ?? 'aucune'"
          [attr.data-tank-hunger]="tank.hunger ?? 'aucune'"
        >
          <button
            type="button"
            class="control-panel__tank"
            [attr.aria-pressed]="tank.selected"
            [attr.aria-disabled]="!tank.selectable"
            [attr.aria-label]="tankLabel(tank)"
            [attr.title]="tankHint(tank)"
            (click)="tank.selectable && !tank.selected && tankSelected.emit(tank.id)"
          >
            <span class="control-panel__tank-name">{{ tank.name }}</span>
            @if (tank.worst; as worst) {
              <span class="control-panel__tank-alert" [attr.data-level]="worst">{{
                severityLabels[worst]
              }}</span>
            }
            <span class="control-panel__sheet-status">{{ tankDetail(tank) }}</span>
          </button>
        </li>
      }
    </ul>
    @if (transferTargets().length > 0 && transferSpecies().length > 0) {
      <div class="control-panel__row" role="group" aria-label="Transférer un animal">
        <label class="control-panel__field">
          <span class="control-panel__label">Animal</span>
          <select
            class="control-panel__select"
            data-transfer-species
            (change)="transferChoice.set($any($event.target).value)"
          >
            @for (id of transferSpecies(); track id) {
              <option [value]="id" [selected]="id === transferSpeciesChoice()">
                {{ speciesName(id) }}
              </option>
            }
          </select>
        </label>
        <label class="control-panel__field">
          <span class="control-panel__label">Vers</span>
          <select
            class="control-panel__select"
            data-transfer-target
            (change)="transferTarget.set(+$any($event.target).value)"
          >
            @for (tank of transferTargets(); track tank.id) {
              <option [value]="tank.id" [selected]="tank.id === transferTargetChoice()">
                {{ tank.name }}
              </option>
            }
          </select>
        </label>
      </div>
      <button type="button" class="control-panel__button" data-transfer (click)="onTransfer()">
        Transférer à l’épuisette
      </button>
    }
    @if (quarantineOffered()) {
      <!-- Quarantaine (#547) : proposée dès un malade dans le bac affiché ; la durée
           sourcée est la description du bouton. Libellé court : il ne passe pas à la
           ligne et doit tenir à 320 px avec DejaVu Sans (CI). -->
      <button
        type="button"
        class="control-panel__button"
        data-quarantine-install
        aria-label="Installer un bac de quarantaine"
        [attr.title]="quarantineDuration"
        (click)="onQuarantineInstall()"
      >
        Isoler en quarantaine
      </button>
    }
    @if (quarantineShown()) {
      <!-- Bac de quarantaine (#547) : un bac posé soigné à part, puis retour au bac affiché. -->
      <div class="control-panel__quarantine" role="group" aria-label="Quarantaine" data-quarantine>
        @if (quarantineChoice(); as chosen) {
          <label class="control-panel__field">
            <span class="control-panel__label">Bac de quarantaine</span>
            <select
              class="control-panel__select"
              data-quarantine-tank
              (change)="quarantineTarget.set(+$any($event.target).value)"
            >
              @for (tank of quarantine().tanks; track tank.id) {
                <option [value]="tank.id" [selected]="tank.id === chosen.id">
                  {{ tank.name
                  }}{{
                    tank.sick > 0
                      ? ' (' + tank.sick + ' malade' + (tank.sick > 1 ? 's' : '') + ')'
                      : ''
                  }}
                </option>
              }
            </select>
          </label>
          <div class="control-panel__row" role="group" aria-label="Soigner la quarantaine">
            @for (kind of treatmentKinds; track kind) {
              <button
                type="button"
                class="control-panel__button control-panel__button--compact"
                [attr.data-quarantine-treatment]="kind"
                [attr.aria-label]="'Quarantaine : ' + treatments[kind].aria"
                [attr.title]="treatmentTitle(kind)"
                (click)="quarantineTreated.emit({ id: chosen.id, kind })"
              >
                {{ treatments[kind].button }}
              </button>
            }
          </div>
          @if (chosen.filter !== null) {
            <!-- Filtre neuf du bac posé (#553, #538) : l'amorce de bactéries s'y verse
                 d'ici, le bac posé n'étant pas sélectionnable (ADR 0075). Une ligne, tant
                 que le filtre n'est pas mûr. -->
            <div class="control-panel__row" role="group" aria-label="Filtre de la quarantaine">
              <button
                type="button"
                class="control-panel__button control-panel__button--compact"
                data-quarantine-starter
                [attr.aria-label]="
                  chosen.name + ' : verser une dose d’amorce de bactéries nitrifiantes'
                "
                title="Source : docs/SOINS.md § 1.1 (étiquette Stability, secondaire) ; gain du filtre : approximation de jeu."
                (click)="quarantineStarter.emit(chosen.id)"
              >
                Bactéries
              </button>
              <span class="control-panel__note" data-quarantine-filter>
                Filtre neuf : efficace à {{ chosen.filter }} %
              </span>
            </div>
          }
          @if (chosen.species.length > 0) {
            <label class="control-panel__field">
              <span class="control-panel__label">Animal à ramener</span>
              <select
                class="control-panel__select"
                data-quarantine-species
                (change)="quarantineSpecies.set($any($event.target).value)"
              >
                @for (id of chosen.species; track id) {
                  <option [value]="id" [selected]="id === quarantineSpeciesChoice()">
                    {{ speciesName(id) }}
                  </option>
                }
              </select>
            </label>
            <button
              type="button"
              class="control-panel__button"
              data-quarantine-return
              (click)="onQuarantineReturn(chosen.id)"
            >
              Ramener au bac affiché
            </button>
          }
        }
        <p class="control-panel__note" data-quarantine-duration>{{ quarantineDuration }}</p>
      </div>
    }
    @if (tankList().length > 1) {
      <!-- Renommer un bac (#316) : le bac sélectionné par défaut, nom borné. Dès deux
           bacs seulement : avec un seul, le panneau tient en deux colonnes à 1280 × 720
           (e2e/cadrage-panneaux.spec.ts). -->
      <div
        class="control-panel__row control-panel__row--halves"
        role="group"
        aria-label="Renommer un bac"
      >
        <label class="control-panel__field">
          <span class="control-panel__label">Bac</span>
          <select
            class="control-panel__select"
            data-rename-tank
            (change)="renameTarget.set(+$any($event.target).value)"
          >
            @for (tank of tankList(); track tank.id) {
              <option [value]="tank.id" [selected]="tank.id === renameTargetChoice()">
                {{ tank.name }}
              </option>
            }
          </select>
        </label>
        <label class="control-panel__field">
          <span class="control-panel__label">Nouveau nom</span>
          <input
            #renameInput
            type="text"
            class="control-panel__select"
            data-rename-name
            autocomplete="off"
            [attr.maxlength]="maxTankName"
            [value]="renameTargetName()"
            (keydown.enter)="onRename(renameInput.value)"
          />
        </label>
      </div>
      <button
        type="button"
        class="control-panel__button"
        data-rename
        (click)="onRename(renameInput.value)"
      >
        Renommer
      </button>
    }
    @if (tankNotice(); as notice) {
      <p
        class="control-panel__message"
        [class.control-panel__message--error]="notice.kind === 'erreur'"
        role="status"
        data-transfer-notice
      >
        {{ notice.text }}
      </p>
    }
  `,
})
export class TanksSection {
  /** Environnement du bac affiché. */
  readonly environment = input<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  /** Mode du bac affiché (#278). */
  readonly careMode = input<CareMode>('soins');
  /** Liste des bacs de la pièce (#306). */
  readonly tankList = input<readonly TankListEntry[]>([]);
  /** Litres d'eau du bac affiché ; `null` : inconnus. */
  readonly tankLiters = input<number | null>(null);
  /** Effectif de chaque espèce du bac affiché. */
  readonly population = input<PopulationCounts>(NO_FISH);
  /** Relevé de l'eau du bac affiché (température du retour en soins). */
  readonly water = input<WaterReadout>(DEFAULT_WATER_READOUT);
  /** Bacs de quarantaine possibles, leurs espèces et leurs malades (#547). */
  readonly quarantine = input<QuarantineView>(EMPTY_QUARANTINE);
  /** Message du dernier transfert d'animal (#306). */
  readonly tankNotice = input<TankNotice | null>(null);

  /** Bac à sélectionner (#306). */
  readonly tankSelected = output<number>();
  /** « Renommer » (#316) : bac et nom saisi. */
  readonly tankRenamed = output<{ readonly id: number; readonly name: string }>();
  /** Mode demandé pour le bac affiché (#278), après confirmation. */
  readonly careModeChanged = output<CareMode>();
  /** « Tout retirer » au retour en soins (#278, lot 2) : espèces inadaptées à retirer. */
  readonly careReturned = output<readonly SpeciesId[]>();
  /** « Transférer à l'épuisette » (#306) : espèce du bac sélectionné et bac d'arrivée. */
  readonly animalTransferred = output<{ readonly species: SpeciesId; readonly toId: number }>();
  /** « Installer un bac de quarantaine » (#547). */
  readonly quarantineInstalled = output<void>();
  /** Un geste de soin dans le bac de quarantaine `id` seul (#547). */
  readonly quarantineTreated = output<{ readonly id: number; readonly kind: TreatmentKind }>();
  /** Dose d'amorce de bactéries dans le bac posé choisi (#553). */
  readonly quarantineStarter = output<number>();
  /** « Ramener au bac affiché » (#547) : bac de quarantaine et espèce. */
  readonly quarantineReturned = output<{ readonly fromId: number; readonly species: SpeciesId }>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly treatmentKinds = TREATMENT_KINDS;
  protected readonly treatments = TREATMENTS;
  protected readonly treatmentTitle = treatmentTitle;
  protected readonly severityLabels = ALERT_SEVERITY_LABELS;
  protected readonly careModeLabels = CARE_MODE_LABELS;
  protected readonly unsuitableTitle = unsuitableTitle;
  protected readonly unsuitableReasonText = unsuitableReasonText;
  /** Longueur maximale d'un nom de bac (#316), aussi bornée par l'hôte. */
  protected readonly maxTankName = MAX_TANK_NAME_LENGTH;
  protected readonly quarantineDuration = QUARANTINE_DURATION_TEXT;

  /** Catalogue des espèces du bac affiché : noms des listes « Animal ». */
  private readonly catalog = computed(() => panelCatalog(this.environment(), this.careMode()));
  /** Bac à renommer (#316) ; `null` : le bac sélectionné. */
  protected readonly renameTarget = signal<number | null>(null);
  protected readonly renameTargetChoice = computed(() => {
    const list = this.tankList();
    const wanted = this.renameTarget();
    return (
      list.find((tank) => tank.id === wanted) ??
      list.find((tank) => tank.selected) ??
      list[0]
    )?.id;
  });
  /** Nom actuel du bac à renommer : valeur de départ du champ. */
  protected readonly renameTargetName = computed(
    () => this.tankList().find((tank) => tank.id === this.renameTargetChoice())?.name ?? '',
  );
  /** Choix d'espèce et de bac d'arrivée du transfert (#306) ; `null` : premier de la liste. */
  protected readonly transferChoice = signal<string | null>(null);
  protected readonly transferTarget = signal<number | null>(null);
  /** Espèces présentes dans le bac sélectionné, dans l'ordre du catalogue. */
  protected readonly transferSpecies = computed(() =>
    environmentById(this.environment()).species.filter((id) => this.population()[id] > 0),
  );
  /** Bacs d'arrivée possibles : tous sauf le bac sélectionné. */
  protected readonly transferTargets = computed(() =>
    this.tankList().filter((tank) => !tank.selected),
  );
  protected readonly transferSpeciesChoice = computed(() => {
    const list = this.transferSpecies();
    const wanted = this.transferChoice();
    return list.find((id) => id === wanted) ?? list[0] ?? null;
  });
  protected readonly transferTargetChoice = computed(() => {
    const list = this.transferTargets();
    const wanted = this.transferTarget();
    return (list.find((tank) => tank.id === wanted) ?? list[0])?.id ?? null;
  });

  /** Groupe « Quarantaine » (#547) : dès qu'un bac posé existe. */
  protected readonly quarantineShown = computed(() =>
    isQuarantineShown(this.careMode(), this.quarantine()),
  );
  /** « Installer un bac de quarantaine » : un malade ici, et aucun bac posé (#547). */
  protected readonly quarantineOffered = computed(
    () =>
      this.careMode() !== 'decor' &&
      this.quarantine().sickHere > 0 &&
      this.quarantine().tanks.length === 0,
  );
  protected readonly quarantineTarget = signal<number | null>(null);
  protected readonly quarantineSpecies = signal<string | null>(null);
  /** Bac de quarantaine choisi : le dernier choix s'il existe encore, sinon le dernier posé. */
  protected readonly quarantineChoice = computed(() => {
    const tanks = this.quarantine().tanks;
    const wanted = this.quarantineTarget();
    return tanks.find((tank) => tank.id === wanted) ?? tanks[tanks.length - 1] ?? null;
  });
  protected readonly quarantineSpeciesChoice = computed(() => {
    const list = this.quarantineChoice()?.species ?? [];
    const wanted = this.quarantineSpecies();
    return list.find((id) => id === wanted) ?? list[0] ?? null;
  });

  /** Confirmation du changement de mode en cours (#278) : mode demandé, ou `null`. */
  protected readonly confirmMode = signal<CareMode | null>(null);
  /** Nom du bac affiché, pour le texte de la confirmation. */
  protected readonly shownTankName = computed(
    () => this.tankList().find((tank) => tank.selected)?.name ?? 'ce bac',
  );
  /**
   * Animaux du bac affiché inadaptés au mode soins (#278, lot 2) : milieu, température,
   * volume, groupe, compatibilité (`unsuitableAnimals`). Volume inconnu : pas de contrôle de
   * volume.
   */
  protected readonly unsuitable = computed<readonly UnsuitableAnimal[]>(() =>
    unsuitableAnimals({
      environment: this.environment(),
      counts: this.population(),
      liters: this.tankLiters() ?? Number.NaN,
      temperature: this.water().temperature,
    }),
  );

  protected onRename(name: string): void {
    const id = this.renameTargetChoice();
    if (id !== undefined) {
      this.tankRenamed.emit({ id, name });
    }
  }

  /**
   * « Isoler en quarantaine » (#547) : le bouton disparaît une fois le bac posé ; le focus va
   * au choix du bac de quarantaine, ce qui l'amène à l'écran quand le panneau passe sur une
   * colonne qui défile (#571).
   */
  protected onQuarantineInstall(): void {
    this.quarantineInstalled.emit();
    afterNextRender(
      () =>
        this.host.nativeElement.querySelector<HTMLSelectElement>('[data-quarantine-tank]')?.focus(),
      { injector: this.injector },
    );
  }

  protected onQuarantineReturn(fromId: number): void {
    const species = this.quarantineSpeciesChoice();
    if (species !== null) {
      this.quarantineReturned.emit({ fromId, species });
    }
  }

  protected onTransfer(): void {
    const species = this.transferSpeciesChoice();
    const toId = this.transferTargetChoice();
    if (species !== null && toId !== null) {
      this.animalTransferred.emit({ species, toId });
    }
  }

  /** Nom d'espèce du catalogue de l'environnement affiché. */
  protected speciesName(id: SpeciesId): string {
    return this.catalog().find((entry) => entry.species === id)?.name ?? id;
  }

  /** Sous-titre d'une ligne : environnement (s'il diffère du nom), contenu, bac posé. */
  protected tankDetail(tank: TankListEntry): string {
    return [
      tank.environmentName === tank.name ? null : tank.environmentName,
      tankListDetail(tank),
      tank.mode === 'decor' ? 'décor' : null,
      tank.selectable ? null : 'posé',
    ]
      .filter((part) => part !== null)
      .join(' · ');
  }

  /** Infobulle d'une ligne (#492) : absence de faim ou faim partielle expliquée. */
  protected tankHint(tank: TankListEntry): string | null {
    return tankListHint(tank);
  }

  /** Nom accessible d'une ligne : nom, sélection, alerte, contenu. */
  protected tankLabel(tank: TankListEntry): string {
    return [
      tank.name,
      tank.selected ? 'bac sélectionné' : null,
      tank.worst === null
        ? 'aucune alerte'
        : `alerte ${ALERT_SEVERITY_LABELS[tank.worst].toLowerCase()}`,
      `${tank.environmentName}, ${tankListDetail(tank)}`,
      tank.mode === 'decor' ? 'mode décor' : null,
      tank.selectable ? null : 'posé, pas encore sélectionnable',
    ]
      .filter((part) => part !== null)
      .join(', ');
  }

  /** « Tout retirer » : retire les animaux listés et repasse en mode soins. */
  protected onRemoveUnsuitable(): void {
    const species = this.unsuitable().map((animal) => animal.species);
    this.confirmMode.set(null);
    this.careReturned.emit(species);
  }

  /** Demande le passage à l'autre mode : la confirmation explique la conséquence. */
  protected onToggleCareMode(): void {
    this.confirmMode.set(this.careMode() === 'decor' ? 'soins' : 'decor');
  }

  /** Confirme le changement de mode demandé. */
  protected onConfirmCareMode(): void {
    const mode = this.confirmMode();
    this.confirmMode.set(null);
    if (mode !== null) {
      this.careModeChanged.emit(mode);
    }
  }
}
