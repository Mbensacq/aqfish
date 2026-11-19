import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import { DEFAULT_ENVIRONMENT_ID, ENVIRONMENT_IDS } from '../../sim/environment';
import {
  placeOf,
  SUPPORT_CATALOG,
  SUPPORT_KINDS,
  TANK_SIZE_IDS,
  TANK_SIZES,
  type SupportKind,
  type TankSizeId,
} from '../../sim/room-state';
import { animalCountText } from '../../sim/tank-list';
import type { RoomCatalog, RoomCatalogTank } from '../aquarium-host/aquarium-host';
import { environmentName } from './panel-views';

/** Bac vide demandé au catalogue « Bacs et meubles » (#305), validé par l'hôte. */
export interface NewTankRequest {
  readonly environment: string;
  readonly size: string;
  /** Meuble support, `null` : au sol. */
  readonly supportId: number | null;
}

/**
 * Section « Bacs et meubles » du panneau « Réglages » (#305, lot 2b ; sortie du panneau au
 * #697) : ajout d'un meuble ou d'un bac vide à la première place libre, retrait d'un bac
 * (confirmation s'il est peuplé) ou d'un meuble libre. Les bacs posés restent figés.
 *
 * L'hôte est le `fieldset` de la section, posé par le panneau (ADR 0161).
 */
@Component({
  // Sélecteur d'attribut : le `fieldset` reste l'enfant direct du panneau (ADR 0161).
  selector: 'fieldset[app-room-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './room-section.scss',
  template: `
    <legend class="control-panel__legend">Bacs et meubles</legend>
    <div class="control-panel__row control-panel__row--wrap">
      @for (kind of supportKinds; track kind) {
        <button
          type="button"
          class="control-panel__button control-panel__button--compact"
          [attr.data-add-support]="kind"
          (click)="supportAdded.emit(kind)"
        >
          {{ supportName(kind) }}
        </button>
      }
    </div>
    <label class="control-panel__field">
      <span class="control-panel__label">Environnement du bac</span>
      <select
        class="control-panel__select"
        data-new-tank-environment
        (change)="newTankEnvironment.set($any($event.target).value)"
      >
        @for (id of roomEnvironmentIds; track id) {
          <option [value]="id" [selected]="id === newTankEnvironment()">
            {{ environmentName(id) }}
          </option>
        }
      </select>
    </label>
    <label class="control-panel__field">
      <span class="control-panel__label">Taille</span>
      <select
        class="control-panel__select"
        data-new-tank-size
        (change)="newTankSize.set($any($event.target).value)"
      >
        @for (size of tankSizeIds; track size) {
          <option [value]="size" [selected]="size === newTankSize()">
            {{ tankSizeName(size) }}
          </option>
        }
      </select>
    </label>
    <label class="control-panel__field">
      <span class="control-panel__label">Posé sur</span>
      <select
        class="control-panel__select"
        data-new-tank-support
        (change)="newTankSupport.set($any($event.target).value)"
      >
        <option value="sol" [selected]="newTankSupport() === 'sol'">Le sol</option>
        @for (support of roomCatalog().supports; track support.id) {
          <option [value]="support.id" [selected]="newTankSupport() === '' + support.id">
            {{ support.name }}
          </option>
        }
      </select>
    </label>
    <button type="button" class="control-panel__button" data-add-tank (click)="onAddTank()">
      Ajouter le bac
    </button>
    @if (roomCatalog().message; as message) {
      <p class="control-panel__message control-panel__message--error" role="status">
        {{ message }}
      </p>
    }
    <ul class="control-panel__sheet-list" aria-label="Bacs de la pièce">
      @for (tank of roomCatalog().tanks; track tank.id) {
        <li class="control-panel__sheet-row" [attr.data-room-tank]="tank.id">
          <span>
            {{ tank.name }}
            <span class="control-panel__sheet-status">{{ tankStatus(tank) }}</span>
          </span>
          @if (!tank.shown) {
            @if (confirmTank() === tank.id) {
              <span class="control-panel__row" role="group" aria-label="Confirmer le retrait">
                <button
                  type="button"
                  class="control-panel__button control-panel__button--compact"
                  data-confirm-remove
                  (click)="removeTank(tank.id)"
                >
                  Retirer avec {{ tank.animals }} animaux
                </button>
                <button
                  type="button"
                  class="control-panel__button control-panel__button--compact"
                  (click)="confirmTank.set(null)"
                >
                  Garder
                </button>
              </span>
            } @else {
              <button
                type="button"
                class="control-panel__button control-panel__button--compact"
                data-remove-tank
                [attr.aria-label]="'Retirer ' + tank.name"
                (click)="onRemoveTank(tank)"
              >
                Retirer
              </button>
            }
          }
        </li>
      }
      @for (support of roomCatalog().supports; track support.id) {
        <li class="control-panel__sheet-row" [attr.data-room-support]="support.id">
          <span>{{ support.name }}</span>
          <button
            type="button"
            class="control-panel__button control-panel__button--compact"
            data-remove-support
            [attr.aria-label]="'Retirer ' + support.name"
            [attr.aria-disabled]="support.occupied"
            (click)="support.occupied || supportRemoved.emit(support.id)"
          >
            Retirer
          </button>
        </li>
      }
    </ul>
  `,
})
export class RoomSection {
  /** Bacs et meubles supports de la pièce (#305). */
  readonly roomCatalog = input<RoomCatalog>({ tanks: [], supports: [], message: null });

  /** Meuble support à ajouter. */
  readonly supportAdded = output<string>();
  /** Bac vide à ajouter (environnement, taille, meuble ou sol). */
  readonly tankAdded = output<NewTankRequest>();
  /** Bac à retirer (confirmé s'il est peuplé). */
  readonly tankRemoved = output<number>();
  /** Meuble support libre à retirer. */
  readonly supportRemoved = output<number>();

  protected readonly supportKinds = SUPPORT_KINDS;
  protected readonly tankSizeIds = TANK_SIZE_IDS;
  protected readonly environmentName = environmentName;
  /** Environnements d'un bac de la pièce (le bassin est au jardin). */
  protected readonly roomEnvironmentIds = ENVIRONMENT_IDS.filter((id) => placeOf(id) === 'piece');
  /** Choix du prochain bac ajouté (#305). */
  protected readonly newTankEnvironment = signal<string>(DEFAULT_ENVIRONMENT_ID);
  protected readonly newTankSize = signal<string>('moyen');
  protected readonly newTankSupport = signal<string>('sol');
  /** Bac peuplé dont le retrait attend confirmation (#305), `null` sinon. */
  protected readonly confirmTank = signal<number | null>(null);

  protected supportName(kind: SupportKind): string {
    return SUPPORT_CATALOG[kind].name;
  }

  protected tankSizeName(size: TankSizeId): string {
    return TANK_SIZES[size].name;
  }

  /** Ligne secondaire d'un bac : où il est, et ses animaux. */
  protected tankStatus(tank: RoomCatalogTank): string {
    const where = tank.shown ? 'affiché' : tank.on === null ? 'rangé' : `posé sur ${tank.on}`;
    return `${where}, ${animalCountText(tank.animals)}`;
  }

  protected onAddTank(): void {
    const support = this.newTankSupport();
    this.tankAdded.emit({
      environment: this.newTankEnvironment(),
      size: this.newTankSize(),
      supportId: support === 'sol' ? null : Number(support),
    });
  }

  /** « Retirer » : aussitôt si le bac est vide, après confirmation s'il est peuplé (#305). */
  protected onRemoveTank(tank: RoomCatalogTank): void {
    if (tank.animals > 0) {
      this.confirmTank.set(tank.id);
    } else {
      this.removeTank(tank.id);
    }
  }

  protected removeTank(id: number): void {
    this.confirmTank.set(null);
    this.tankRemoved.emit(id);
  }
}
