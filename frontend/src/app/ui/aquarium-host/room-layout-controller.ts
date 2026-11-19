import { signal } from '@angular/core';

import type { CaptureLayoutEntry } from '../../core/capture/capture-params';
import { isEnvironmentId, placeDimensions, type EnvironmentId } from '../../sim/environment';
import type { Room } from '../../sim/room';
import { roomArea, roomItemBox } from '../../sim/room-furniture';
import { findSupportSpot, findTankSpot, type FloorRect } from '../../sim/room-layout';
import { roomTankCapRefusal } from '../../sim/room-limits';
import {
  addSupport,
  addTank,
  findTank,
  placementLevel,
  removeSupport,
  removeTank,
  SUPPORT_CATALOG,
  SUPPORT_KINDS,
  TANK_SIZE_IDS,
  tankAnimalCount,
  type RoomLayoutRefusal,
  type RoomState,
  type RoomSupport,
  type SupportKind,
  type TankSizeId,
} from '../../sim/room-state';
import type { World } from '../../sim/world-types';

/** Bac de la pièce vu par le catalogue « Bacs et meubles » (#305). */
export interface RoomCatalogTank {
  readonly id: number;
  readonly name: string;
  readonly animals: number;
  /**
   * Bac affiché (non retirable). Calculé depuis le bac sélectionné (`selectedTankId`) : c'est
   * la même notion, le bac sélectionné de la pièce est toujours celui du monde affiché (#313).
   */
  readonly shown: boolean;
  /** Support du bac posé (nom), « sol », ou `null` : position historique. */
  readonly on: string | null;
}

/** Meuble support vu par le catalogue « Bacs et meubles » (#305). */
export interface RoomCatalogSupport {
  readonly id: number;
  readonly name: string;
  /** Vrai si un bac repose dessus (non retirable). */
  readonly occupied: boolean;
}

/** Contenu de la pièce de N bacs pour le catalogue « Bacs et meubles » (#305). */
export interface RoomCatalog {
  readonly tanks: readonly RoomCatalogTank[];
  readonly supports: readonly RoomCatalogSupport[];
  /** Dernier refus, en clair ; `null` après une action acceptée. */
  readonly message: string | null;
}

/** Messages des refus du catalogue « Bacs et meubles » (#305). */
export const ROOM_LAYOUT_MESSAGES: Readonly<Record<RoomLayoutRefusal | 'aucune-place', string>> = {
  'aucune-place': 'Aucune place libre pour cet élément.',
  'piece-pleine': 'La pièce est pleine.',
  'bac-inconnu': 'Ce bac n’existe plus.',
  'meuble-inconnu': 'Ce meuble n’existe plus.',
  'hors-piece': 'Hors de la pièce.',
  'hors-support': 'Le bac dépasse du meuble.',
  chevauchement: 'Un meuble ou un bac occupe déjà la place.',
  'support-occupe': 'Un bac repose sur ce meuble.',
  'trop-haut': 'Le bac est trop haut pour cette place.',
  jardin: 'Le bassin se trouve au jardin.',
  'dernier-bac': 'La pièce garde au moins un bac.',
  'position-invalide': 'Choix invalide.',
};

/**
 * Place d'un bac posé sur `support`, pour le catalogue « Bacs et meubles » : nom et rang du
 * meuble, et le niveau (compté depuis 1) pour un meuble à plusieurs niveaux (ADR 0102).
 */
export function supportPlaceLabel(support: RoomSupport, level: number): string {
  const model = SUPPORT_CATALOG[support.kind];
  const name = `${model.name} ${support.id + 1}`;
  return model.levels.length > 1 ? `${name}, niveau ${level + 1}` : name;
}

/**
 * Ports du catalogue « Bacs et meubles » (#305, contrôleur #695) : ce que l'hôte lui prête,
 * sans que le contrôleur connaisse l'hôte. La pièce de N bacs (`RoomState`) reste à l'hôte,
 * qui la resynchronise avec le monde affiché et les mondes rangés.
 */
export interface RoomLayoutPorts {
  /** Monde affiché, `null` avant le démarrage. */
  world(): World | null;
  /** Vrai en mode capture : aucun geste du catalogue. */
  isCapture(): boolean;
  /** Vrai si la pièce est dessinée, donc modifiable (#188). */
  editable(): boolean;
  /** Pièce de N bacs, `null` tant qu'aucune sauvegarde n'a été lue ni écrite. */
  roomState(): RoomState | null;
  /** Installe la pièce de N bacs modifiée. */
  setRoomState(room: RoomState): void;
  /** Resynchronise la pièce avec le monde affiché et les mondes rangés, et la renvoie. */
  syncRoomState(world: World): RoomState;
  /** Identifiant du bac affiché. */
  selectedTankId(): number;
  /** Oublie le monde rangé de l'environnement `environment` (bac rangé retiré). */
  forgetStashed(environment: EnvironmentId): void;
  /** Pièce graphique affichée (#187). */
  room(): Room;
  /** Redessine la pièce (meubles supports et bacs posés compris). */
  redrawRoom(): void;
  readonly probe: { publishRoomCatalog(tanks: number, supports: number): void };
  saveNow(): void;
  scheduleFrame(): void;
}

/** Pose d'un meuble ou d'un bac : pièce obtenue, ou refus. */
type LayoutResult = { ok: true; room: RoomState } | { ok: false; reason: RoomLayoutRefusal };

/**
 * Catalogue « Bacs et meubles » de la pièce de N bacs (#305, #313 ; contrôleur #695) : ajout
 * à la première place libre et retrait des meubles supports et des bacs, refus en clair,
 * disposition `bacs=` des captures.
 */
export class RoomLayoutController {
  /** Bacs et meubles supports de la pièce de N bacs (#305), pour le catalogue. */
  readonly catalog = signal<RoomCatalog>({ tanks: [], supports: [], message: null });

  constructor(private readonly ports: RoomLayoutPorts) {}

  /** Expose les bacs et meubles de la pièce (catalogue et attributs, #305). */
  refreshCatalog(message: string | null): void {
    const room = this.ports.roomState();
    const supports = room?.furniture ?? [];
    const tanks = (room?.tanks ?? []).map((tank): RoomCatalogTank => {
      const supportId = tank.placement?.supportId;
      const support = supports.find((item) => item.id === supportId);
      return {
        id: tank.id,
        name: tank.name,
        animals: tankAnimalCount(tank),
        shown: tank.id === this.ports.selectedTankId(),
        on:
          tank.placement === null
            ? null
            : support === undefined
              ? 'sol'
              : supportPlaceLabel(support, placementLevel(tank.placement)),
      };
    });
    this.catalog.set({
      tanks,
      supports: supports.map((item) => ({
        id: item.id,
        name: `${SUPPORT_CATALOG[item.kind].name} ${item.id + 1}`,
        occupied: (room?.tanks ?? []).some((tank) => tank.placement?.supportId === item.id),
      })),
      message,
    });
    this.ports.probe.publishRoomCatalog(tanks.length, supports.length);
  }

  /**
   * Aire libre de la pièce graphique autour du bac affiché et obstacles (meubles de la pièce
   * graphique, ADR 0073, et passage devant la porte, #363) : la pose automatique du
   * catalogue (#305) y cherche une place.
   */
  floor(world: World): { area: FloorRect; obstacles: FloorRect[] } {
    const area = roomArea(placeDimensions(world));
    const items = (this.ports.room().items ?? []).map((item) => roomItemBox(item));
    return { area, obstacles: [area.door, ...items] };
  }

  /** Affiche le refus `reason` dans le catalogue. */
  refuse(reason: RoomLayoutRefusal | 'aucune-place'): void {
    this.refreshCatalog(ROOM_LAYOUT_MESSAGES[reason]);
  }

  /** Installe la pièce modifiée (ou affiche le refus), redessine et enregistre aussitôt. */
  commit(room: RoomState | null, reason: RoomLayoutRefusal | null): void {
    if (room === null) {
      return this.refuse(reason ?? 'position-invalide');
    }
    this.ports.setRoomState(room);
    this.refreshCatalog(null);
    this.ports.redrawRoom();
    this.ports.saveNow();
    this.ports.scheduleFrame();
  }

  /**
   * Ajoute un meuble support du catalogue (#305) à la première place libre de la pièce
   * affichée. Refus (aucune place, pièce pleine) : message dans le catalogue. Sans effet en
   * capture, avant le démarrage ou pièce masquée.
   */
  addSupport(kind: string): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture() || !this.ports.editable()) {
      return;
    }
    if (!(SUPPORT_KINDS as readonly string[]).includes(kind)) {
      return this.refuse('position-invalide');
    }
    const room = this.ports.syncRoomState(world);
    const { area, obstacles } = this.floor(world);
    const spot = findSupportSpot(room, kind as SupportKind, area, obstacles);
    if (spot === null) {
      return this.refuse('aucune-place');
    }
    this.commitResult(addSupport(room, kind as SupportKind, spot.x, spot.z, 0));
  }

  /**
   * Ajoute un bac vide de l'environnement `environment` et de la taille `size` (#305), posé à
   * la première place libre du meuble `supportId` ou du sol (`null`).
   */
  addTank(environment: string, size: string, supportId: number | null): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture() || !this.ports.editable()) {
      return;
    }
    if (!isEnvironmentId(environment) || !(TANK_SIZE_IDS as readonly string[]).includes(size)) {
      return this.refuse('position-invalide');
    }
    const room = this.ports.syncRoomState(world);
    // Plafond de bacs (#392, ADR 0096) : message explicite plutôt que « pièce pleine ».
    const capped = roomTankCapRefusal(room);
    if (capped !== null) {
      return this.refreshCatalog(capped);
    }
    const { area, obstacles } = this.floor(world);
    const tankSize = size as TankSizeId;
    const placement = findTankSpot(room, environment, tankSize, supportId, area, obstacles);
    if (placement === null) {
      return this.refuse(
        supportId !== null && !room.furniture.some((item) => item.id === supportId)
          ? 'meuble-inconnu'
          : 'aucune-place',
      );
    }
    this.commitResult(addTank(room, { environment, size: tankSize, placement }));
  }

  /**
   * Retire le bac `id` de la pièce (#305), ses animaux avec lui ; un bac rangé (autre
   * environnement) quitte aussi les mondes rangés. Le bac affiché ne se retire pas.
   */
  removeTank(id: number): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture()) {
      return;
    }
    const room = this.ports.syncRoomState(world);
    const tank = findTank(room, id);
    if (tank === undefined || id === this.ports.selectedTankId()) {
      return this.refuse(tank === undefined ? 'bac-inconnu' : 'position-invalide');
    }
    const result = removeTank(room, id);
    if (result.ok && tank.placement === null) {
      this.ports.forgetStashed(tank.world.environment);
    }
    this.commitResult(result);
  }

  /** Retire le meuble support `id` (#305) ; refusé si un bac repose dessus. */
  removeSupport(id: number): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture()) {
      return;
    }
    this.commitResult(removeSupport(this.ports.syncRoomState(world), id));
  }

  /**
   * Meubles et bacs de `bacs=` (#305), en capture : chacun à la première place libre, dans
   * l'ordre de l'URL ; type, taille, rang de meuble ou pose refusés : entrée ignorée.
   */
  applyCaptureLayout(world: World, entries: readonly CaptureLayoutEntry[]): void {
    let room = this.ports.syncRoomState(world);
    const { area, obstacles } = this.floor(world);
    const supportIds: number[] = [];
    for (const entry of entries) {
      if ('kind' in entry) {
        const kind = entry.kind as SupportKind;
        const spot = SUPPORT_KINDS.includes(kind)
          ? findSupportSpot(room, kind, area, obstacles)
          : null;
        const result = spot === null ? null : addSupport(room, kind, spot.x, spot.z, 0);
        if (result?.ok) {
          room = result.room;
          supportIds.push(result.id);
        }
        continue;
      }
      const size = entry.size as TankSizeId;
      const supportId = entry.on === null ? null : supportIds[entry.on];
      if (!TANK_SIZE_IDS.includes(size) || supportId === undefined) {
        continue;
      }
      const placement = findTankSpot(room, 'tropical', size, supportId, area, obstacles);
      const result =
        placement === null ? null : addTank(room, { environment: 'tropical', size, placement });
      if (result?.ok) {
        room = result.room;
      }
    }
    this.ports.setRoomState(room);
    this.refreshCatalog(null);
  }

  private commitResult(result: LayoutResult): void {
    this.commit(result.ok ? result.room : null, result.ok ? null : result.reason);
  }
}
