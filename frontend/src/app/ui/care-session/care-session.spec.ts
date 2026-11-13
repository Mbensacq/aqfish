import { TestBed } from '@angular/core/testing';

import {
  completeCareStep,
  skipCareStep,
  startCareSession,
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

  it('étape sans geste : seulement « Passer » et « Plus tard »', () => {
    const el = render(completeCareStep(startCareSession())).nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toContain('Le siphon');
    expect(el.querySelector('[data-care-done]')).toBeNull();
    expect(el.querySelector('[data-care-skip]')).not.toBeNull();
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
});
