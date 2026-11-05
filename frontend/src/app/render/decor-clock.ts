/**
 * Horloge décorative à vitesse réglable (#409) : temps propre d'un effet (eau, pluie) qui
 * avance au rythme du temps simulé multiplié par un facteur, sans saut de phase quand le
 * facteur change (option « Réduire les mouvements », #406).
 *
 * Le temps rendu vaut `base + (time − from) · rate` : changer de vitesse au temps `t`
 * reprend la valeur atteinte en `t` comme nouvelle base. Tant que la vitesse n'a jamais
 * changé (`base = from = 0`), le temps rendu vaut exactement `time · rate`, donc `time`
 * pour une vitesse de 1 (captures inchangées à l'octet). Module pur, sans Three.js.
 */
export class DecorClock {
  private base = 0;
  private from = 0;

  constructor(private rate = 1) {}

  /** Temps décoratif au temps simulé `time`, en secondes. */
  at(time: number): number {
    return this.base === 0 && this.from === 0
      ? time * this.rate
      : this.base + (time - this.from) * this.rate;
  }

  /** Vitesse courante (multiplicateur du temps simulé). */
  get speed(): number {
    return this.rate;
  }

  /**
   * Change la vitesse au temps simulé `time` (le dernier temps rendu) : la valeur atteinte
   * en `time` est conservée, la suite avance à la nouvelle vitesse. Sans effet si la
   * vitesse ne change pas.
   */
  setRate(rate: number, time: number): void {
    if (rate === this.rate) {
      return;
    }
    this.base = this.at(time);
    this.from = time;
    this.rate = rate;
  }
}
