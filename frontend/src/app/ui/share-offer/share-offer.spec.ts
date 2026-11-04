import { TestBed } from '@angular/core/testing';

import { shareBase, type ShareOffer as ShareOfferData } from '../aquarium-host/aquarium-host';
import { ShareOffer, shareOfferText } from './share-offer';

describe('shareOfferText (#426)', () => {
  it('nomme l’environnement, compte les animaux et prévient du remplacement', () => {
    expect(shareOfferText({ kind: 'offre', environment: 'Bassin', animals: 7, tanks: 1 })).toBe(
      'Aquarium partagé : Bassin, 7 animaux. L’importer remplace votre bac actuel ; exportez-le d’abord pour le garder.',
    );
    const text = shareOfferText({ kind: 'offre', environment: 'Récif', animals: 1, tanks: 3 });
    expect(text).toContain('1 animal.');
    expect(text).toContain('vos 3 bacs actuels ; exportez-les d’abord pour les garder.');
    expect(shareOfferText({ kind: 'offre', environment: 'Bac', animals: 0, tanks: 1 })).toContain(
      '0 animaux',
    );
  });
});

describe('shareBase (#426)', () => {
  it('retire la requête et le fragment', () => {
    expect(shareBase('https://a.test/aqfish/?seed=3#partage=1.z.AA')).toBe(
      'https://a.test/aqfish/',
    );
    expect(shareBase('https://a.test/#x?y')).toBe('https://a.test/');
    expect(shareBase('file:///tmp/index.html')).toBe('file:///tmp/index.html');
  });
});

describe('ShareOffer (#426)', () => {
  function render(offer: ShareOfferData | null) {
    const fixture = TestBed.createComponent(ShareOffer);
    fixture.componentRef.setInput('offer', offer);
    fixture.detectChanges();
    return fixture;
  }

  it('rien sans lien reçu', () => {
    const el = render(null).nativeElement as HTMLElement;
    expect(el.querySelector('section')).toBeNull();
  });

  it('proposition : deux boutons, émissions distinctes', () => {
    const fixture = render({ kind: 'offre', environment: 'Paludarium', animals: 5, tanks: 2 });
    const el = fixture.nativeElement as HTMLElement;
    const dialog = el.querySelector('[data-share-offer]');
    expect(dialog?.getAttribute('role')).toBe('alertdialog');
    expect(dialog?.textContent).toContain('Paludarium, 5 animaux');
    let accepted = 0;
    let dismissed = 0;
    fixture.componentInstance.accepted.subscribe(() => accepted++);
    fixture.componentInstance.dismissed.subscribe(() => dismissed++);
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Importer cet aquarium', 'Ignorer']);
    buttons[0]!.click();
    buttons[1]!.click();
    expect([accepted, dismissed]).toEqual([1, 1]);
  });

  it('refus : texte d’erreur en alerte, « Fermer » ; le texte n’est jamais interprété en HTML', () => {
    const fixture = render({ kind: 'erreur', text: 'Lien refusé : <img src=x onerror=alert(1)>' });
    const el = fixture.nativeElement as HTMLElement;
    const alert = el.querySelector('[data-share-error]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.querySelector('img')).toBeNull();
    expect(alert?.textContent).toContain('<img src=x onerror=alert(1)>');
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => dismissed++);
    el.querySelector('button')!.click();
    expect(dismissed).toBe(1);
  });
});
