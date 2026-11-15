import { TestBed } from '@angular/core/testing';

import {
  completeCareStep,
  skipCareStep,
  startCareSession,
  withCut,
  withPoured,
  withRinse,
  withSiphoned,
  type CareSession,
} from '../../sim/care-session';
import { CareSessionPanel } from './care-session';

describe('CareSessionPanel (#604)', () => {
  function render(session: CareSession | null, visibleAlgae = 0) {
    const fixture = TestBed.createComponent(CareSessionPanel);
    fixture.componentRef.setInput('session', session);
    fixture.componentRef.setInput('visibleAlgae', visibleAlgae);
    fixture.detectChanges();
    return fixture;
  }

  it('rien hors séance', () => {
    expect((render(null).nativeElement as HTMLElement).querySelector('section')).toBeNull();
  });

  it('étape « vitres » : titre, pourquoi, consigne et trois boutons', () => {
    const fixture = render(startCareSession(), 3);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toContain('Les vitres');
    expect(el.textContent).toContain('Étape 1 sur 5');
    expect(el.querySelector('[data-care-hint]')?.textContent).toContain('3 taches vertes');
    const events: string[] = [];
    fixture.componentInstance.completed.subscribe(() => events.push('fait'));
    fixture.componentInstance.skipped.subscribe(() => events.push('passe'));
    fixture.componentInstance.closed.subscribe(() => events.push('ferme'));
    (el.querySelector('[data-care-done]') as HTMLButtonElement).click();
    (el.querySelector('[data-care-skip]') as HTMLButtonElement).click();
    (el.querySelector('[data-care-close]') as HTMLButtonElement).click();
    expect(events).toEqual(['fait', 'passe', 'ferme']);
  });

  it('bac sans algues : vitres propres', () => {
    const el = render(startCareSession(), 0).nativeElement as HTMLElement;
    expect(el.querySelector('[data-care-hint]')?.textContent).toContain('rien à racler');
  });

  it('taille (#623) : consigne, « Étape terminée » après une coupe seulement', () => {
    let pruning = startCareSession();
    for (let i = 0; i < 4; i++) {
      pruning = skipCareStep(pruning);
    }
    let el = render(pruning).nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toContain('La taille');
    expect(el.querySelector('.care-session__why')?.textContent).toContain('nitrates');
    expect(el.querySelector('[data-care-hint]')?.textContent).toContain('Cliquez ou touchez');
    expect(el.querySelector('[data-care-done]')).toBeNull();
    expect(el.querySelector('[data-care-skip]')).not.toBeNull();
    el = render(withCut(pruning)).nativeElement as HTMLElement;
    expect(el.querySelector('[data-care-hint]')?.textContent).toContain('Une coupe');
    expect(el.querySelector('[data-care-done]')).not.toBeNull();
  });

  it('bilan d’un bac sans plante à tailler (#623) : pas de ligne « taille »', () => {
    let session = startCareSession();
    for (let i = 0; i < 5; i++) {
      session = skipCareStep(session);
    }
    const fixture = TestBed.createComponent(CareSessionPanel);
    fixture.componentRef.setInput('session', session);
    fixture.componentRef.setInput('prunable', false);
    fixture.detectChanges();
    const lines = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-care-summary] li'),
    ].map((li) => li.textContent?.trim());
    expect(lines).toHaveLength(4);
    expect(lines.join()).not.toContain('taille');
  });

  it('bilan : une ligne par étape, fait ou passé', () => {
    let session = completeCareStep(startCareSession());
    for (let i = 0; i < 4; i++) {
      session = skipCareStep(session);
    }
    const el = render(session).nativeElement as HTMLElement;
    const lines = [...el.querySelectorAll('[data-care-summary] li')].map((li) =>
      li.textContent?.trim(),
    );
    expect(lines).toEqual([
      'Les vitres : fait',
      'Le siphon : passé',
      'Le filtre : passé',
      'L’eau neuve : passé',
      'La taille : passé',
    ]);
    expect(el.querySelector('[data-care-skip]')).toBeNull();
    expect(el.querySelector('[data-care-close]')?.textContent).toContain('Terminer la séance');
  });

  it('siphon : jauge en pourcentage, avertissement au-delà de 50 %, terminé après un geste', () => {
    const siphon = completeCareStep(startCareSession());
    let el = render(siphon).nativeElement as HTMLElement;
    expect(el.querySelector('[data-care-siphon]')?.getAttribute('aria-valuenow')).toBe('0');
    expect(el.querySelector('[data-care-done]')).toBeNull();
    el = render(withSiphoned(siphon, 0.3)).nativeElement as HTMLElement;
    expect(el.querySelector('[data-care-siphon]')?.getAttribute('data-care-siphon')).toBe('30');
    expect(el.querySelector('[data-care-hint]')?.hasAttribute('data-warning')).toBe(false);
    expect(el.querySelector('[data-care-done]')).not.toBeNull();
    el = render(withSiphoned(siphon, 0.6)).nativeElement as HTMLElement;
    expect(el.querySelector('[data-care-hint]')?.getAttribute('data-warning')).toBe('true');
    expect(el.querySelector('[data-care-hint]')?.textContent).toContain('c’est trop');
  });

  it('eau neuve : seau, conditionneur, température et avertissements', () => {
    const water = skipCareStep(
      completeCareStep(withSiphoned(completeCareStep(startCareSession()), 0.2)),
    );
    expect(water.step).toBe('eau');
    const fixture = render(water);
    const el = fixture.nativeElement as HTMLElement;
    const events: unknown[] = [];
    fixture.componentInstance.bucketPoured.subscribe(() => events.push('seau'));
    fixture.componentInstance.conditionerChanged.subscribe((v) => events.push(v));
    fixture.componentInstance.bucketGapChanged.subscribe((v) => events.push(v));
    expect(el.querySelector('[data-care-done]')).toBeNull();
    expect(el.querySelectorAll('[data-care-warning]')).toHaveLength(0);
    (el.querySelector('[data-care-pour]') as HTMLButtonElement).click();
    const box = el.querySelector('[data-care-conditioner]') as HTMLInputElement;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    const select = el.querySelector('[data-care-bucket]') as HTMLSelectElement;
    select.value = '-6';
    select.dispatchEvent(new Event('change'));
    expect(events).toEqual(['seau', false, -6]);
    fixture.componentRef.setInput('conditioner', false);
    fixture.componentRef.setInput('bucketGap', -6);
    fixture.componentRef.setInput('session', withPoured(water, 0.2));
    fixture.detectChanges();
    const warnings = [...el.querySelectorAll('[data-care-warning]')].map((w) => w.textContent);
    expect(warnings.join(' ')).toContain('chlore');
    expect(warnings.join(' ')).toContain('plus froide que le bac de 6 °C');
    expect(el.querySelector('[data-care-poured]')?.getAttribute('data-care-poured')).toBe('20');
    expect(el.querySelector('[data-care-pour]')).toBeNull();
    expect(el.querySelector('[data-care-done]')).not.toBeNull();
  });

  it('eau neuve sans siphon : rien à remplacer', () => {
    const water = skipCareStep(skipCareStep(skipCareStep(startCareSession())));
    const el = render(water).nativeElement as HTMLElement;
    expect(el.querySelector('[data-care-hint]')?.textContent).toContain('rien à remplacer');
    expect(el.querySelector('[data-care-pour]')).toBeNull();
    expect(el.querySelector('[data-care-conditioner]')).toBeNull();
  });

  it('filtre : deux eaux de rinçage, phrase « pourquoi », terminé après un choix (#606)', () => {
    const filter = skipCareStep(skipCareStep(startCareSession()));
    const fixture = render(filter);
    fixture.componentRef.setInput('filterEfficiency', 0.5);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toContain('Le filtre');
    expect(el.querySelector('[data-care-hint]')?.textContent).toContain('50 %');
    expect(el.querySelector('[data-care-done]')).toBeNull();
    expect(el.querySelector('[data-care-rinse-why]')).toBeNull();
    const chosen: string[] = [];
    fixture.componentInstance.rinseChosen.subscribe((rinse) => chosen.push(rinse));
    (el.querySelector('[data-care-rinse="robinet"]') as HTMLButtonElement).click();
    (el.querySelector('[data-care-rinse="bac"]') as HTMLButtonElement).click();
    expect(chosen).toEqual(['robinet', 'bac']);

    fixture.componentRef.setInput('session', withRinse(filter, 'robinet'));
    fixture.detectChanges();
    const why = el.querySelector('[data-care-rinse-why]');
    expect(why?.textContent).toContain('chlore');
    expect(why?.getAttribute('data-warning')).toBe('true');
    expect(el.querySelector('[data-care-rinse="robinet"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(el.querySelector('[data-care-done]')).not.toBeNull();

    fixture.componentRef.setInput('session', withRinse(filter, 'bac'));
    fixture.detectChanges();
    expect(el.querySelector('[data-care-rinse-why]')?.textContent).toContain('pas de chlore');
    expect(el.querySelector('[data-care-rinse-why]')?.hasAttribute('data-warning')).toBe(false);
  });

  it('bilan avec avant / après (#624) : images, curseur et « Enregistrer la photo »', () => {
    let session = completeCareStep(startCareSession());
    for (let i = 0; i < 4; i++) {
      session = skipCareStep(session);
    }
    const fixture = render(session);
    const el = fixture.nativeElement as HTMLElement;
    // Sans images (séance sautée, relecture impossible) : ni comparaison ni bouton.
    expect(el.querySelector('[data-care-compare]')).toBeNull();
    expect(el.querySelector('[data-care-save-compare]')).toBeNull();

    fixture.componentRef.setInput('comparison', {
      before: 'data:image/png;base64,QVZBTlQ=',
      after: 'data:image/png;base64,QVBSRVM=',
    });
    fixture.detectChanges();
    expect(el.querySelector('[data-care-before]')?.getAttribute('src')).toContain('QVZBTlQ=');
    expect(el.querySelector('[data-care-after]')?.getAttribute('alt')).toBe(
      'Le bac après la séance',
    );
    const slider = el.querySelector('[data-care-compare] input[type="range"]') as HTMLInputElement;
    expect(slider.getAttribute('aria-label')).toBe('Curseur avant / après');
    expect(slider.getAttribute('data-care-split')).toBe('50');
    expect(slider.getAttribute('aria-valuetext')).toBe('Avant 50 %, après 50 %');
    const frames = el.querySelector('.care-session__frames') as HTMLElement;
    expect(frames.style.getPropertyValue('--care-split')).toBe('50%');

    for (const [value, text] of [
      ['0', 'Après seulement'],
      ['100', 'Avant seulement'],
      ['25', 'Avant 25 %, après 75 %'],
    ] as const) {
      slider.value = value;
      slider.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(slider.getAttribute('aria-valuetext')).toBe(text);
      expect(frames.style.getPropertyValue('--care-split')).toBe(`${value}%`);
    }

    let saved = 0;
    fixture.componentInstance.comparisonSaved.subscribe(() => saved++);
    (el.querySelector('[data-care-save-compare]') as HTMLButtonElement).click();
    expect(saved).toBe(1);

    // Nouvelle comparaison : le curseur revient au milieu.
    fixture.componentRef.setInput('comparison', { before: 'data:a', after: 'data:b' });
    fixture.detectChanges();
    expect(slider.getAttribute('data-care-split')).toBe('50');
    // Hors bilan : pas de comparaison même si des images sont données.
    fixture.componentRef.setInput('session', startCareSession());
    fixture.detectChanges();
    expect(el.querySelector('[data-care-compare]')).toBeNull();
  });
});
