import { computed, Directive, ElementRef, inject, input, type Signal } from '@angular/core';

/**
 * Filtre de la recherche dans les sections montrées (#764, `docs/INTERFACE.md` section 2) :
 * fourni par le panneau « Réglages », lu par les marques des contrôles (`SettingMark`) et des
 * légendes (`SectionLegend`) des sections. Classe abstraite : jeton d'injection, le panneau
 * la fournit par `useExisting`.
 */
export abstract class SettingsSearchFilter {
  /** Noms des réglages trouvés pendant une recherche ; `null` hors recherche (tout est montré). */
  abstract readonly found: Signal<ReadonlySet<string> | null>;
  /** Titre affiché en tête du contenu (catégorie ouverte) ; `null` pendant une recherche. */
  abstract readonly heading: Signal<string | null>;
}

/**
 * Marque d'un contrôle par le nom de son réglage déclaré (`settings-categories.ts`) : pendant
 * une recherche, seul un contrôle trouvé reste visible dans sa section (« lum » montre
 * l'éclairage et la lampe, pas le chauffage). Sans filtre fourni (section isolée, tests) : rien
 * ne change. `display: none` plutôt que `hidden`, que les règles `display` des champs annulent.
 */
@Directive({
  selector: '[appSetting]',
  host: { '[attr.data-setting]': 'appSetting()', '[style.display]': 'masked() ? "none" : null' },
})
export class SettingMark {
  /** Nom du réglage, tel qu'il est déclaré. */
  readonly appSetting = input.required<string>();

  private readonly filter = inject(SettingsSearchFilter, { optional: true });
  protected readonly masked = computed(() => {
    const found = this.filter?.found() ?? null;
    return found !== null && !found.has(this.appSetting());
  });
}

/**
 * Légende d'une section, masquée à l'écran (gardée pour les lecteurs d'écran : elle nomme le
 * groupe) quand elle répète le titre de la catégorie ouverte (« Population » sous
 * « Population ») ; pendant une recherche, elle nomme la section sous les résultats.
 */
@Directive({
  selector: 'legend[appSectionLegend]',
  host: { '[class.control-panel__legend--repeated]': 'repeated()' },
})
export class SectionLegend {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly filter = inject(SettingsSearchFilter, { optional: true });
  protected readonly repeated = computed(() => {
    const heading = this.filter?.heading() ?? null;
    return heading !== null && this.element.nativeElement.textContent?.trim() === heading;
  });
}
