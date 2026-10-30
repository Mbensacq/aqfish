import { ChangeDetectionStrategy, Component, DOCUMENT, inject, viewChild } from '@angular/core';

import { parseCaptureParams } from './core/capture/capture-params';
import { readWallpaperGlobal } from './core/wallpaper/wallpaper';
import { AquariumHost } from './ui/aquarium-host/aquarium-host';
import { BeginnerGuide } from './ui/beginner-guide/beginner-guide';
import { BeginnerGuideState } from './ui/beginner-guide/beginner-guide-state';
import { CommandsHelp } from './ui/commands-help/commands-help';
import { ControlPanel } from './ui/control-panel/control-panel';
import { DashboardFrame } from './ui/dashboard-frame/dashboard-frame';
import { DashboardStatus } from './ui/dashboard-frame/dashboard-status';
import { DayIndicator } from './ui/day-indicator/day-indicator';
import { DecorBadge } from './ui/decor-badge/decor-badge';
import { DecorEditor } from './ui/decor-editor/decor-editor';
import { EXCLUSIVE_PANELS } from './ui/exclusive-panels/exclusive-panels';
import { SpeciesWiki } from './ui/species-wiki/species-wiki';
import { ViewPresetsBar } from './ui/view-presets-bar/view-presets-bar';

/**
 * Racine de l'application : le bac en 3D plein écran et, hors mode capture, l'interface
 * (barre des préréglages de vue, reliée à l'hôte du canvas, indicateur du moment de la
 * journée, tableau de bord (eau et simulation en haut, santé et alertes en bas), panneau de contrôle et aide-mémoire des commandes).
 * Sur écran étroit, « Réglages » et « Commandes » sont exclusifs : ouvrir l'un replie
 * l'autre, pour que leurs textes ne se superposent pas (#136, `EXCLUSIVE_PANELS`).
 * Le wiki des espèces (#287) est exclusif avec tous les autres panneaux, à toute largeur : il
 * occupe la droite de l'écran, comme « Commandes », et la place de « Réglages » sur téléphone.
 * À la première visite, le « Guide du débutant » s'ouvre une fois (#240, ADR 0072).
 * Le signal « prêt » du contrat de capture est émis par `AquariumHost` après la première
 * image complète (docs/ARCHITECTURE.md, « Contrat de capture »).
 */
@Component({
  selector: 'app-root',
  imports: [
    AquariumHost,
    BeginnerGuide,
    CommandsHelp,
    ControlPanel,
    DashboardFrame,
    DashboardStatus,
    DayIndicator,
    DecorBadge,
    DecorEditor,
    SpeciesWiki,
    ViewPresetsBar,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly win = inject(DOCUMENT).defaultView;
  private readonly params = parseCaptureParams(this.win?.location.search ?? '');
  /** Mode capture : interface masquée. */
  private readonly capture = this.params.capture;
  /**
   * Vue fond d'écran (#279, ADR 0079) : `fond=1` ou globale `aqfishFond` du paquet ; aucune
   * interface, seul le canvas est affiché.
   */
  private readonly wallpaper = this.params.wallpaper || readWallpaperGlobal(this.win) !== null;
  /** Interface affichée : ni en capture, ni en fond d'écran. */
  protected readonly interfaceShown = !this.capture && !this.wallpaper;

  private readonly exclusivePanels = inject(EXCLUSIVE_PANELS);
  // Requêtes par nom de référence (`#help`, `#panel`), pas par classe : une référence à
  // `ControlPanel` comme valeur le chargerait hors du bloc `@defer`.
  private readonly help = viewChild<CommandsHelp>('help');
  private readonly panel = viewChild<ControlPanel>('panel');
  private readonly aquarium = viewChild<AquariumHost>('aquarium');
  private readonly wiki = viewChild<SpeciesWiki>('wiki');

  constructor() {
    // Première visite (#240, ADR 0072) : le guide s'ouvre une fois, jamais en mode capture
    // ni en fond d'écran (#279).
    if (this.interfaceShown) {
      inject(BeginnerGuideState).showOnFirstVisit();
    }
  }

  /**
   * « Commandes » déplié : replie « Réglages » et quitte l'éditeur de décor sur écran étroit
   * (#136, #167).
   */
  protected onHelpOpened(): void {
    this.wiki()?.close();
    if (this.exclusivePanels()) {
      this.panel()?.close();
      this.aquarium()?.setDecorEditing(false);
    }
  }

  /**
   * « Réglages » déplié : quitte l'éditeur de décor, qui occupe la même place (#167), et
   * replie « Commandes » sur écran étroit (#136).
   */
  protected onPanelOpened(): void {
    this.wiki()?.close();
    this.aquarium()?.setDecorEditing(false);
    if (this.exclusivePanels()) {
      this.help()?.fold();
    }
  }

  /**
   * « Éditer le décor » (#167) : l'éditeur prend la place de « Réglages », replié, et, sur
   * écran étroit, celle de « Commandes ».
   */
  protected onEditRequested(): void {
    this.wiki()?.close();
    this.panel()?.close();
    if (this.exclusivePanels()) {
      this.help()?.fold();
    }
    this.aquarium()?.setDecorEditing(true);
  }

  /**
   * Wiki des espèces déplié (#287) : replie « Réglages » et « Commandes » (sans mémoriser ce
   * repli) et quitte l'éditeur de décor, à toute largeur.
   */
  protected onWikiOpened(): void {
    this.panel()?.close();
    this.help()?.fold();
    this.aquarium()?.setDecorEditing(false);
  }
}
