import {
  JOURNAL_ICON_PIXELS,
  levelIconPixels,
  MAINTENANCE_ICON_PIXELS,
  REVIEW_ICON_PIXELS,
} from './level-icons';

/** Pixels `[x, y]` en texte compact, dans l'ordre produit. */
function fingerprint(pixels: readonly (readonly [number, number])[]): string {
  return pixels.map(([x, y]) => `${x},${y}`).join(' ');
}

// Caractérisation (#667) : les pixels exacts de chaque icône, figés avant de les faire toutes
// passer par le même utilitaire de masque. Un changement ici est un changement d'apparence.
describe('icônes du bandeau : pixels exacts (#667)', () => {
  it('icônes de niveau', () => {
    expect(fingerprint(levelIconPixels('vert'))).toBe('4,1 3,2 0,3 2,3 1,4');
    expect(fingerprint(levelIconPixels('orange'))).toBe('2,0 2,1 2,2 2,4');
    expect(fingerprint(levelIconPixels('rouge'))).toBe('0,0 4,0 1,1 3,1 2,2 1,3 3,3 0,4 4,4');
  });

  it('icône du rappel d’entretien', () => {
    expect(fingerprint(MAINTENANCE_ICON_PIXELS)).toBe(
      '0,0 1,0 2,0 3,0 4,0 0,1 4,1 0,2 2,2 4,2 0,3 4,3 0,4 1,4 2,4 3,4 4,4',
    );
  });

  it('icône du bilan', () => {
    expect(fingerprint(REVIEW_ICON_PIXELS)).toBe('0,0 2,0 3,0 4,0 0,2 2,2 3,2 4,2 0,4 2,4 3,4 4,4');
  });

  it('icônes des familles du journal', () => {
    expect(fingerprint(JOURNAL_ICON_PIXELS.sante)).toBe('2,0 2,1 0,2 1,2 2,2 3,2 4,2 2,3 2,4');
    expect(fingerprint(JOURNAL_ICON_PIXELS.reproduction)).toBe(
      '2,0 1,1 2,1 3,1 0,2 1,2 2,2 3,2 4,2 0,3 1,3 2,3 3,3 4,3 1,4 2,4 3,4',
    );
    expect(fingerprint(JOURNAL_ICON_PIXELS.entretien)).toBe('0,0 1,0 2,0 3,0 4,0 2,1 2,2 2,3 2,4');
    expect(fingerprint(JOURNAL_ICON_PIXELS.alertes)).toBe(fingerprint(levelIconPixels('orange')));
  });
});
