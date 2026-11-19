import { signal } from '@angular/core';

import { isDecorMode } from '../../sim/care-mode';
import { addJournalEntry, treatmentEntry, type Journal } from '../../sim/journal';
import {
  EMPTY_PHARMACY,
  pharmacyState,
  samePharmacy,
  usedProducts,
  type PharmacyProduct,
  type PharmacyState,
} from '../../sim/pharmacy';
import type { PhRegulatorDirection } from '../../sim/ph-regulator';
import { TREATMENTS, type TreatmentKind } from '../../sim/treatment';
import {
  sameTreatment,
  treatmentReadout,
  type TreatmentNotice,
  type TreatmentReadout,
} from '../../sim/treatment-text';
import type { ConditionerKind } from '../../sim/water-conditioner';
import { waterHardness } from '../../sim/water-hardness';
import {
  sameWaterTestView,
  startWaterTest,
  WATER_TEST_TICKS,
  waterTestDone,
  waterTestView,
  type WaterKit,
  type WaterTest,
  type WaterTestSample,
  type WaterTestView,
} from '../../sim/water-test';
import {
  doseWorldBacteriaStarterInPlace,
  doseWorldConditionerInPlace,
  doseWorldPhRegulatorInPlace,
  setWorldCarbonInPlace,
  setWorldUntreatedTapInPlace,
  treatWorldInPlace,
} from '../../sim/world';
import type { MutableWorld, World } from '../../sim/world-types';

/** Ce dont les soins de l'eau ont besoin de l'hôte (#696). */
export interface WaterCarePorts {
  /** Monde affiché, `null` avant le démarrage. */
  world(): MutableWorld | null;
  /** Mode capture : aucun soin, aucun test. */
  isCapture(): boolean;
  /** Journal du bac `world` (#581), tenu par `TankRecordsController`. */
  journalOf(world: World): Journal;
  /** Relevé de l'eau après un geste. */
  refreshWater(): void;
  /** Sauvegarde automatique immédiate. */
  saveNow(): void;
  /** Demande une image. */
  scheduleFrame(): void;
}

/** Résultat d'un geste de soin, tel que les fonctions du monde le renvoient. */
interface CareOutcome {
  readonly ok: boolean;
  readonly message: string;
  readonly warning?: string | null;
}

/** Échantillon d'un test de l'eau (#564) : valeurs exactes du bac, dureté résolue. */
function testSample(world: World): WaterTestSample {
  const { ph, ammonia, nitrite, nitrate } = world.water;
  return { ph, ammonia, nitrite, nitrate, ...waterHardness(world.water, world.environment) };
}

/**
 * Soins de l'eau du bac affiché : traitement des points blancs (#361), conditionneur et eau du
 * robinet (#530), charbon actif et régulateur de pH (#531), amorce de bactéries (#529),
 * pharmacie (#533) et test de l'eau (#564). Produits utilisés et tests en cours restent hors du
 * monde : rien n'en est sauvegardé. Sorti de l'hôte au lot 10 de l'assainissement (#696), sans
 * changement de comportement.
 */
export class WaterCareController {
  /** Traitement des points blancs en cours (#361), relevé avec l'eau ; `null` : aucun. */
  readonly treatment = signal<TreatmentReadout | null>(null, { equal: sameTreatment });
  /** Produits de la pharmacie du bac affiché (#533), relevés avec l'eau. */
  readonly pharmacy = signal<PharmacyState>(EMPTY_PHARMACY, { equal: samePharmacy });
  /** Test de l'eau du bac affiché (#564), relevé avec l'eau ; `null` : aucun test lancé. */
  readonly waterTest = signal<WaterTestView | null>(null, { equal: sameWaterTestView });
  /** Message du dernier geste de soin (#361) ; `null` : aucun depuis le dernier changement de bac. */
  readonly notice = signal<TreatmentNotice | null>(null);

  /** Produits déjà utilisés dans chaque bac depuis le chargement (#533), hors du monde. */
  private readonly pharmacyUsed = new WeakMap<World, readonly PharmacyProduct[]>();
  /** Dernier test de l'eau lancé dans chaque bac (#564), hors du monde : rien n'est sauvegardé. */
  private readonly waterTests = new WeakMap<World, WaterTest>();
  /** Monde du dernier geste de soin : le message s'efface quand le bac affiché change. */
  private noticeWorld: World | null = null;

  constructor(private readonly ports: WaterCarePorts) {}

  /**
   * Geste de soin contre les points blancs (#361) : un pas du traitement `kind` (`TREATMENTS`),
   * accepté ou refusé avec un message ; accepté, journal, relevé et enregistrement. Sans effet
   * en mode capture, en mode décor, avant le démarrage ou pour un traitement inconnu.
   */
  treat(kind: TreatmentKind): void {
    const world = this.careWorld();
    if (!world || !Object.hasOwn(TREATMENTS, kind)) {
      return;
    }
    const outcome = treatWorldInPlace(world, kind, TREATMENTS[kind].step);
    if (outcome.ok) {
      addJournalEntry(this.ports.journalOf(world), treatmentEntry(world.time, kind));
    }
    this.answer(world, outcome);
  }

  /**
   * Lance un test de l'eau `kit` (#564) sur le bac affiché : échantillon pris maintenant,
   * résultat après `WATER_TEST_TICKS` pas de simulation. Refusé tant qu'un test court dans ce
   * bac ; sans effet en mode capture ou avant le démarrage.
   */
  startWaterTest(kit: WaterKit): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture()) {
      return;
    }
    const running = this.waterTests.get(world);
    if (running !== undefined && !waterTestDone(running, world.tick)) {
      return;
    }
    this.waterTests.set(world, startWaterTest(kit, testSample(world), world.tick));
    this.ports.refreshWater();
  }

  /**
   * Test de `test-eau=` (#564), au démarrage hors capture : lancé avant le chargement, résultat
   * déjà prêt (captures de la pharmacie reproductibles, simulation à l'arrêt).
   */
  presetWaterTest(world: World, kit: WaterKit): void {
    this.waterTests.set(
      world,
      startWaterTest(kit, testSample(world), world.tick - WATER_TEST_TICKS),
    );
  }

  /**
   * Verse une dose de conditionneur `kind` (#530), acceptée ou refusée avec un message ;
   * acceptée, relevé et enregistrement. Sans effet en mode capture, en mode décor ou avant le
   * démarrage.
   */
  doseConditioner(kind: ConditionerKind): void {
    const world = this.careWorld();
    if (!world) {
      return;
    }
    const outcome = doseWorldConditionerInPlace(world, kind);
    if (outcome.ok) {
      // Le conditionneur simple agit à l'instant : la pharmacie le garde « terminé » (#533).
      this.pharmacyUsed.set(
        world,
        usedProducts(this.pharmacyUsed.get(world) ?? [], ['conditionneur']),
      );
    }
    this.answer(world, { ok: outcome.ok, message: outcome.message });
  }

  /** Bascule l'eau du robinet entre traitée et non traitée (#530), enregistrée avec le bac. */
  toggleUntreatedTap(): void {
    const world = this.careWorld();
    if (!world) {
      return;
    }
    setWorldUntreatedTapInPlace(world, world.water.untreatedTap !== true);
    this.ports.refreshWater();
    this.ports.saveNow();
  }

  /** Place ou retire le charbon actif (#531), avec un message, enregistré avec le bac. */
  toggleCarbon(): void {
    const world = this.careWorld();
    if (!world) {
      return;
    }
    const outcome = setWorldCarbonInPlace(world, world.water.carbon !== true);
    this.answer(world, { ok: true, message: outcome.message, warning: outcome.warning });
  }

  /** Dose de régulateur de pH (#531), acceptée ou refusée avec un message. */
  dosePhRegulator(direction: PhRegulatorDirection): void {
    const world = this.careWorld();
    if (!world) {
      return;
    }
    const outcome = doseWorldPhRegulatorInPlace(world, direction);
    this.answer(world, outcome);
  }

  /**
   * Verse une dose d'amorce de bactéries (#529), acceptée ou refusée avec un message ;
   * acceptée, relevé et enregistrement. Sans effet en mode capture, en mode décor ou avant le
   * démarrage.
   */
  doseBacteriaStarter(): void {
    const world = this.careWorld();
    if (!world) {
      return;
    }
    const outcome = doseWorldBacteriaStarterInPlace(world);
    this.answer(world, { ok: outcome.ok, message: outcome.message });
  }

  /**
   * Relevé des soins de `world` avec l'eau : traitement, pharmacie et test en cours ; le message
   * du dernier geste s'efface si le bac affiché a changé. Renvoie le traitement relevé, publié
   * par l'hôte.
   */
  refresh(world: World): TreatmentReadout | null {
    const treatment = treatmentReadout(world.water);
    this.treatment.set(treatment);
    const pharmacy = pharmacyState(world.water, this.pharmacyUsed.get(world) ?? []);
    this.pharmacyUsed.set(world, pharmacy.used);
    this.pharmacy.set(pharmacy);
    const test = this.waterTests.get(world);
    this.waterTest.set(test === undefined ? null : waterTestView(test, world.tick));
    if (this.noticeWorld !== null && this.noticeWorld !== world) {
      this.noticeWorld = null;
      this.notice.set(null);
    }
    return treatment;
  }

  /** Monde soignable : démarré, hors capture et hors mode décor ; `null` sinon. */
  private careWorld(): MutableWorld | null {
    const world = this.ports.world();
    return !world || this.ports.isCapture() || isDecorMode(world) ? null : world;
  }

  /**
   * Message du geste, la mise en garde seulement s'il est accepté ; accepté, relevé,
   * enregistrement et image.
   */
  private answer(world: World, outcome: CareOutcome): void {
    this.noticeWorld = world;
    this.notice.set({
      ok: outcome.ok,
      text: outcome.message,
      warning: outcome.ok ? (outcome.warning ?? null) : null,
    });
    if (outcome.ok) {
      this.ports.refreshWater();
      this.ports.saveNow();
      this.ports.scheduleFrame();
    }
  }
}
