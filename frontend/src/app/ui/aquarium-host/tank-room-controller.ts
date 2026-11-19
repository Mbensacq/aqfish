import { signal } from '@angular/core';

import type { AlertSeverity } from '../../sim/dashboard-alerts';
import type { DayClock } from '../../sim/daylight';
import type { EnvironmentId } from '../../sim/environment';
import { stashedList, stashFromList, type StashedWorlds } from '../../sim/environment-worlds';
import { tankWorldPairs } from '../../sim/journal';
import { isSpeciesId } from '../../sim/population';
import {
  EMPTY_QUARANTINE,
  QUARANTINE_ACCLIMATION_REMINDER,
  QUARANTINE_TANK_NAME,
  QUARANTINE_TANK_SIZE,
  doseTankStarter,
  quarantineEnvironment,
  quarantineView,
  sameQuarantine,
  treatTank as treatRoomTank,
  type QuarantineView,
} from '../../sim/quarantine';
import { findTankSpot, type FloorRect } from '../../sim/room-layout';
import { roomTankCapRefusal } from '../../sim/room-limits';
import {
  addTank,
  findTank,
  MAX_TANK_NAME_LENGTH,
  renameTank,
  stepRoom,
  syncRoom,
  type RoomState,
  type RoomTank,
} from '../../sim/room-state';
import { SPECIES_LABELS } from '../../sim/species-catalog';
import { addWarningText } from '../../sim/species-sheet';
import { tankList, worstAlert, type TankListEntry } from '../../sim/tank-list';
import { transferFish } from '../../sim/tank-transfer';
import type { TreatmentKind } from '../../sim/treatment';
import { treatedWaterWarning } from '../../sim/treatment-text';
import { waterProducts } from '../../sim/water';
import type { Entity, MutableWorld, World } from '../../sim/world-types';
import type { TankRecordsController } from './tank-records-controller';

/**
 * Message du dernier geste sur un bac (#306) : transfert d'animal ou renommage (#316), réussite
 * ou refus. Nommé pour les deux depuis #318 (`transferNotice` auparavant).
 */
export interface TankNotice {
  readonly kind: 'info' | 'erreur';
  readonly text: string;
}

/** Ce dont les bacs de la pièce ont besoin de l'hôte (#696). */
export interface TankRoomPorts {
  /** Monde affiché, avancé en place par la boucle ; `null` avant le démarrage. */
  world(): MutableWorld | null;
  /** Vrai une fois la vue créée. */
  hasView(): boolean;
  /** Mode capture : aucun bac rattrapé, listé ni modifié. */
  isCapture(): boolean;
  /** Horloge du jour du bac affiché, suivie par les bacs rattrapés. */
  dayClock(): DayClock;
  /** Suivi du bac affiché : journal reporté, suivis inscrits avant de changer de bac. */
  readonly records: Pick<
    TankRecordsController,
    'carryJournalWatches' | 'keepWaterHistory' | 'keepJournal' | 'keepFirstTankPath'
  >;
  /** Catalogue « Bacs et meubles » (`RoomLayoutController`). */
  readonly layout: {
    /** Relit le catalogue en gardant son message. */
    refresh(): void;
    /** Sol libre de la pièce autour du bac affiché. */
    floor(world: World): { area: FloorRect; obstacles: FloorRect[] };
    /** Installe une pièce changée par le catalogue. */
    commit(room: RoomState): void;
  };
  /** Publie le bac sélectionné (`data-aqfish-selected-tank`). */
  publishSelectedTank(id: number): void;
  /** Termine une chute de décor en cours avant tout changement du monde affiché. */
  finishDrop(): void;
  /** Affiche le bac rangé de l'environnement `id` (`AquariumHost.setEnvironment`). */
  showEnvironment(id: EnvironmentId): void;
  refreshPopulation(): void;
  refreshWater(): void;
  saveNow(): void;
  scheduleFrame(): void;
}

/**
 * Bacs de la pièce de N bacs vus du bac affiché (#264, #306, #316, #547, ADR 0069, ADR 0076) :
 * état de la pièce et mondes rangés, rattrapage des bacs non affichés, liste des bacs et vue
 * de la quarantaine, renommage, sélection, transferts à l'épuisette, soins et amorce dans un
 * bac posé seul. Le monde affiché reste à l'hôte (même objet, avancé en place). Sorti de
 * l'hôte au lot 10 de l'assainissement (#696), sans changement de comportement.
 */
export class TankRoomController {
  /**
   * Liste des bacs (#306) : nom, environnement, litres, animaux, faim, mode, pire
   * gravité d'alerte de chaque bac, bac sélectionné compris (relevé à chaque relevé de l'eau).
   */
  readonly tankList = signal<readonly TankListEntry[]>([]);
  /** Bacs de quarantaine possibles et malades du bac affiché (#547), relevés avec la liste. */
  readonly quarantine = signal<QuarantineView>(EMPTY_QUARANTINE, { equal: sameQuarantine });
  /** Message du dernier transfert ou renommage (#306, #318), `null` avant tout geste. */
  readonly notice = signal<TankNotice | null>(null);

  /**
   * Mondes des autres environnements visités, figés tant qu'ils ne sont pas affichés (#277,
   * ADR 0063).
   */
  private stashed: StashedWorlds = new Map();
  /**
   * Pièce de N bacs (#264, lot 1, ADR 0069) : identifiants, noms et graine des bacs,
   * resynchronisée avec le monde affiché et les mondes rangés à chaque sauvegarde
   * (`sync`) ; `null` tant qu'aucune sauvegarde n'a été lue ni écrite.
   */
  private room: RoomState | null = null;
  /** Bac sélectionné de la pièce : celui du monde affiché (réglage d'interface). */
  private selected = 0;
  /**
   * Pire gravité d'alerte des bacs non affichés, par monde (#306) : un monde ne change pas
   * entre deux rattrapages (`advanceBackground`), qui en créent de nouveaux.
   */
  private readonly frozenWorst = new WeakMap<World, AlertSeverity | null>();
  /**
   * Rattrapage des bacs non affichés (#316, ADR 0076) : monde affiché et son `tick` au dernier
   * rattrapage. Un autre monde affiché (changement de bac, import) repart de zéro.
   */
  private backgroundWorld: World | null = null;
  private backgroundTick = 0;

  constructor(private readonly ports: TankRoomPorts) {}

  /** Pièce de N bacs, `null` tant qu'aucune sauvegarde n'a été lue ni écrite. */
  get roomState(): RoomState | null {
    return this.room;
  }

  /** Identifiant du bac affiché dans la pièce. */
  get selectedTankId(): number {
    return this.selected;
  }

  /** Mondes rangés des autres environnements. */
  get stash(): StashedWorlds {
    return this.stashed;
  }

  /** Remplace la pièce (catalogue, arrêt de l'hôte) sans resynchroniser. */
  setRoomState(room: RoomState | null): void {
    this.room = room;
  }

  /** Reprend la pièce et le bac sélectionné d'une sauvegarde relue (démarrage, import). */
  restore(room: RoomState | null, selectedTankId: number): void {
    this.room = room;
    this.selected = selectedTankId;
  }

  /** Remplace les mondes rangés (changement d'environnement). */
  setStash(stash: StashedWorlds): void {
    this.stashed = stash;
  }

  /** Range les mondes `others`, sans celui de l'environnement affiché `shown`. */
  stashOthers(others: readonly World[], shown: EnvironmentId): void {
    this.stashed = stashFromList(others, shown);
  }

  /** Oublie le monde rangé de `environment` (bac retiré de la pièce). */
  forgetStashed(environment: EnvironmentId): void {
    const stash = new Map(this.stashed);
    stash.delete(environment);
    this.stashed = stash;
  }

  /** Resynchronise la pièce avec le monde affiché et les mondes rangés (`syncRoom`). */
  sync(world: World): RoomState {
    const synced = syncRoom(this.room, world, stashedList(this.stashed, world.environment));
    this.room = synced.room;
    this.selected = synced.selectedTankId;
    this.ports.layout.refresh();
    this.refreshList();
    return synced.room;
  }

  /**
   * Rattrapage des bacs non affichés (#316, ADR 0076, fin du gel des ADR 0063 et 0074) : ils
   * avancent, par `stepRoom`, d'autant de pas que le bac affiché depuis le rattrapage
   * précédent, avec la même horloge du jour. Appelé au rythme des relevés de l'eau (au plus
   * 4 fois par seconde de temps réel), et avant tout ce qui lit ou change les autres bacs
   * (changement de bac, transfert, sauvegarde) : aucune allocation par image. Le bac affiché
   * n'est pas touché (même objet, avancé en place par la boucle). Sans effet en capture.
   */
  advanceBackground(): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture()) {
      return;
    }
    const pending = this.backgroundWorld === world ? world.tick - this.backgroundTick : 0;
    this.backgroundWorld = world;
    this.backgroundTick = world.tick;
    if (pending <= 0) {
      return;
    }
    const synced = syncRoom(this.room, world, stashedList(this.stashed, world.environment));
    const room = stepRoom(synced.room, pending, this.ports.dayClock(), synced.selectedTankId);
    // Le bac rangé garde sa dernière observation du journal sous son nouveau monde (#592).
    this.ports.records.carryJournalWatches(tankWorldPairs(synced.room.tanks, room.tanks));
    this.stashed = stashFromList(
      room.tanks
        .filter((tank) => tank.placement === null && tank.id !== synced.selectedTankId)
        .map((tank) => tank.world),
      world.environment,
    );
    this.room = { ...room, tick: world.tick };
    this.selected = synced.selectedTankId;
  }

  /**
   * Liste des bacs (#306) : le bac sélectionné est relu à chaque appel (son monde avance en
   * place) ; les autres bacs gardent leur gravité en cache par monde, recalculée après chaque
   * rattrapage (#316). Rien en capture (aucune interface).
   */
  refreshList(): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture()) {
      return;
    }
    const room = this.room ?? this.sync(world);
    const selected = this.selected;
    const entries = tankList(room.tanks, selected, (tank) => {
      if (tank.id === selected) {
        // Le monde affiché change en place : sa gravité en cache, d'avant son affichage, ne
        // vaut plus quand il sera de nouveau rangé.
        this.frozenWorst.delete(world);
        return worstAlert(world);
      }
      let worst = this.frozenWorst.get(tank.world);
      if (worst === undefined) {
        worst = worstAlert(tank.world);
        this.frozenWorst.set(tank.world, worst);
      }
      return worst;
    });
    // Le bac sélectionné est décrit par le monde affiché, même avant resynchronisation.
    this.tankList.set(
      entries.map((entry) =>
        entry.selected ? { ...entry, animals: world.entities.length } : entry,
      ),
    );
    this.quarantine.set(quarantineView(room, selected, { world }));
    this.ports.publishSelectedTank(selected);
  }

  /**
   * Renomme le bac `id` de la liste (#316, `renameTank`) : nom normalisé, non vide, de
   * `MAX_TANK_NAME_LENGTH` caractères au plus ; enregistré aussitôt. Refus : message dans
   * `notice`, nom inchangé. Sans effet en capture ou avant le démarrage.
   */
  rename(id: number, name: string): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture()) {
      return;
    }
    const renamed = renameTank(this.sync(world), id, name);
    if (renamed === null) {
      this.notice.set({
        kind: 'erreur',
        text: `Nom refusé : de 1 à ${MAX_TANK_NAME_LENGTH} caractères`,
      });
      this.refreshList();
      return;
    }
    this.room = renamed;
    this.notice.set(null);
    this.sync(world);
    this.ports.saveNow();
  }

  /**
   * Sélectionne le bac `id` de la liste (#306) : tableau de bord, fiches et wiki décrivent
   * alors ce bac. Lot 3a : un bac à la position historique (un par environnement) se
   * sélectionne en changeant d'environnement ; un bac posé (lot 3c) n'est pas encore
   * sélectionnable (ADR 0075). Sans effet en capture ou avant le démarrage.
   */
  select(id: number): void {
    const world = this.ports.world();
    if (!world || !this.ports.hasView() || this.ports.isCapture()) {
      return;
    }
    const tank = findTank(this.sync(world), id);
    if (tank === undefined || tank.id === this.selected) {
      return;
    }
    if (tank.placement !== null) {
      this.notice.set({
        kind: 'erreur',
        text: `« ${tank.name} » est posé dans la pièce : pas encore sélectionnable`,
      });
      return;
    }
    this.notice.set(null);
    this.ports.records.keepWaterHistory(world);
    this.ports.records.keepJournal(world);
    this.ports.records.keepFirstTankPath(world);
    this.ports.showEnvironment(tank.world.environment);
  }

  /**
   * Transfère à l'épuisette un animal de l'espèce `species` du bac sélectionné vers le bac
   * `toId` (#306, `transferFish`) : le plus récent de cette espèce, comme le retrait de la
   * population. Le bac affiché perd l'animal en place ; le bac d'arrivée (rangé ou posé)
   * reçoit le nouvel animal, avec sa faim et sa santé. Refus (milieu, température, bac plein)
   * ou réussite : message dans `notice`. Enregistré aussitôt. Sans effet en capture ou avant
   * le démarrage.
   */
  transferAnimal(species: string, toId: number): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture() || !isSpeciesId(species)) {
      return;
    }
    // Le bac d'arrivée est d'abord mis à l'heure du bac affiché (#316).
    this.advanceBackground();
    const room = this.sync(world);
    let index = world.entities.length - 1;
    while (index >= 0 && world.entities[index].species !== species) {
      index -= 1;
    }
    const fish = world.entities[index];
    if (fish === undefined) {
      this.notice.set({ kind: 'erreur', text: 'Aucun animal de cette espèce ici' });
      return;
    }
    const result = transferFish(room, this.selected, toId, fish.id);
    if (!result.ok) {
      this.notice.set({ kind: 'erreur', text: result.message });
      return;
    }
    // Une chute en cours se termine d'abord, comme avant tout changement du monde affiché.
    this.ports.finishDrop();
    (world.entities as Entity[]).splice(index, 1);
    const arrival = findTank(result.room, toId) as RoomTank;
    const departure = findTank(room, toId);
    if (departure !== undefined) {
      this.ports.records.carryJournalWatches([[departure.world, arrival.world]]);
    }
    if (arrival.placement === null) {
      const stash = new Map(this.stashed);
      stash.set(arrival.world.environment, arrival.world);
      this.stashed = stash;
    }
    this.room = {
      ...result.room,
      tanks: result.room.tanks.map((tank) =>
        tank.id === this.selected ? { ...tank, world } : tank,
      ),
    };
    this.sync(world);
    const { singular, feminine } = SPECIES_LABELS[species];
    const moved = `${singular.charAt(0).toUpperCase()}${singular.slice(1)} transféré${feminine ? 'e' : ''}`;
    const warnings = result.warnings.map(addWarningText);
    // Amphibien transféré dans une eau déjà traitée (#374) : le produit lui est toxique.
    const treated = treatedWaterWarning(species, waterProducts(arrival.world.water));
    if (treated !== null) {
      warnings.push(treated);
    }
    this.notice.set({
      kind: 'info',
      text: [`${moved} dans « ${arrival.name} »`, ...warnings].join('. '),
    });
    this.ports.refreshPopulation();
    this.ports.refreshWater();
    this.ports.saveNow();
    this.ports.scheduleFrame();
  }

  /**
   * Installe un bac de quarantaine (#547) : petit bac vide de l'environnement du bac affiché,
   * nommé « Quarantaine », posé au sol à la première place libre (comme le catalogue « Bacs et
   * meubles », la pièce peut rester masquée). Refus (jardin, plafond, aucune place) : message
   * dans `notice`. Sans effet en capture ou avant le démarrage.
   */
  installQuarantine(): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture()) {
      return;
    }
    const environment = quarantineEnvironment(world.environment);
    if (environment === null) {
      this.notice.set({
        kind: 'erreur',
        text: 'Le bassin est au jardin : installez la quarantaine depuis un bac de la pièce',
      });
      return;
    }
    const room = this.sync(world);
    const capped = roomTankCapRefusal(room);
    const { area, obstacles } = this.ports.layout.floor(world);
    const placement =
      capped === null
        ? findTankSpot(room, environment, QUARANTINE_TANK_SIZE, null, area, obstacles)
        : null;
    const result =
      placement === null
        ? null
        : addTank(room, {
            environment,
            size: QUARANTINE_TANK_SIZE,
            placement,
            name: QUARANTINE_TANK_NAME,
          });
    if (result === null || !result.ok) {
      this.notice.set({
        kind: 'erreur',
        text: capped ?? 'Aucune place libre au sol pour la quarantaine',
      });
      return;
    }
    this.notice.set({
      kind: 'info',
      text: `Bac « ${QUARANTINE_TANK_NAME} » installé : laissez mûrir son filtre avant d’y mettre un animal`,
    });
    this.ports.layout.commit(result.room);
    this.sync(world);
  }

  /**
   * Soigne un bac posé de la liste (#547, quarantaine) : un geste du traitement `kind` dans ce
   * bac **seul** (`treatTank`), le bac affiché n'est pas touché. Le bac est d'abord mis à
   * l'heure (#316). Réussite ou refus : message dans `notice`. Sans effet en capture, avant le
   * démarrage, pour le bac affiché ou un bac à la position historique.
   */
  treatPlacedTank(id: number, kind: TreatmentKind): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture() || id === this.selected) {
      return;
    }
    this.advanceBackground();
    const room = this.sync(world);
    const tank = findTank(room, id);
    if (tank === undefined || tank.placement === null) {
      return;
    }
    const result = treatRoomTank(room, id, kind);
    if (!result.ok) {
      this.notice.set({ kind: 'erreur', text: result.message });
      return;
    }
    this.room = result.room;
    this.sync(world);
    const { message, warning } = result.outcome;
    this.notice.set({
      kind: 'info',
      text: [`« ${tank.name} » : ${message}`, warning].filter((t) => t !== undefined).join(' '),
    });
    this.ports.saveNow();
  }

  /**
   * Verse une dose d'amorce de bactéries dans le bac posé `id` (#553) : son filtre neuf (#538)
   * mûrit plus vite, le bac affiché n'est pas touché (`doseTankStarter`). Le bac est d'abord
   * mis à l'heure (#316). Réussite ou refus : message dans `notice`. Sans effet en capture,
   * avant le démarrage, pour le bac affiché ou un bac à la position historique.
   */
  doseStarterInPlacedTank(id: number): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture() || id === this.selected) {
      return;
    }
    this.advanceBackground();
    const room = this.sync(world);
    const tank = findTank(room, id);
    if (tank === undefined || tank.placement === null) {
      return;
    }
    const result = doseTankStarter(room, id);
    if (!result.ok) {
      this.notice.set({ kind: 'erreur', text: `« ${tank.name} » : ${result.message}` });
      return;
    }
    this.room = result.room;
    this.sync(world);
    this.notice.set({ kind: 'info', text: `« ${tank.name} » : ${result.outcome.message}` });
    this.ports.saveNow();
  }

  /**
   * Ramène à l'épuisette un animal de l'espèce `species` du bac posé `fromId` dans le bac
   * affiché (#547, retour de quarantaine) : le plus récent de cette espèce, faim, santé et
   * maladies gardées (`transferFish`). Le bac affiché gagne l'animal en place ; message avec le
   * rappel d'acclimatation. Refus (milieu, température, bac plein) : message dans `notice`.
   */
  returnAnimal(fromId: number, species: string): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture() || !isSpeciesId(species) || fromId === this.selected) {
      return;
    }
    this.advanceBackground();
    const room = this.sync(world);
    const from = findTank(room, fromId);
    const fish = from?.world.entities.filter((entity) => entity.species === species).pop();
    if (from === undefined || from.placement === null || fish === undefined) {
      this.notice.set({ kind: 'erreur', text: 'Aucun animal de cette espèce ici' });
      return;
    }
    const result = transferFish(room, fromId, this.selected, fish.id);
    if (!result.ok) {
      this.notice.set({ kind: 'erreur', text: result.message });
      return;
    }
    this.ports.finishDrop();
    // Le bac affiché reste le même objet (avancé en place par la boucle) : il reçoit l'animal
    // créé par le transfert et le compteur d'identifiants.
    const arrival = (findTank(result.room, this.selected) as RoomTank).world;
    (world.entities as Entity[]).push(arrival.entities[arrival.entities.length - 1]);
    world.nextFishId = arrival.nextFishId;
    this.room = {
      ...result.room,
      tanks: result.room.tanks.map((tank) =>
        tank.id === this.selected ? { ...tank, world } : tank,
      ),
    };
    this.sync(world);
    const { singular, feminine } = SPECIES_LABELS[species];
    const moved = `${singular.charAt(0).toUpperCase()}${singular.slice(1)} ramené${feminine ? 'e' : ''}`;
    const name = findTank(this.room, this.selected)?.name ?? 'ce bac';
    this.notice.set({
      kind: 'info',
      text: [
        `${moved} dans « ${name} »`,
        QUARANTINE_ACCLIMATION_REMINDER,
        ...result.warnings.map(addWarningText),
      ].join('. '),
    });
    this.ports.refreshPopulation();
    this.ports.refreshWater();
    this.ports.saveNow();
    this.ports.scheduleFrame();
  }
}
