import { isTypingContext } from './keyboard';

/** Résultat de `isTypingContext` pour un appui envoyé depuis `element` (attaché au document). */
function typingFrom(element: HTMLElement, init: KeyboardEventInit = {}): boolean | null {
  document.body.appendChild(element);
  let result: boolean | null = null;
  element.addEventListener('keydown', (e) => (result = isTypingContext(e)));
  element.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, ...init }));
  element.remove();
  return result;
}

describe('isTypingContext', () => {
  it('cible non élément (document) : pas un contexte de saisie', () => {
    const event = new KeyboardEvent('keydown', { key: '1' });
    expect(isTypingContext(event)).toBe(false);
  });

  it('contenteditable="false" : pas un contexte de saisie', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'false');
    document.body.appendChild(div);
    let result: boolean | null = null;
    div.addEventListener('keydown', (e) => (result = isTypingContext(e)));
    div.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    div.remove();
    expect(result).toBe(false);
  });

  it.each(['input', 'textarea', 'select'])('focus dans un %s : contexte de saisie', (tag) => {
    expect(typingFrom(document.createElement(tag))).toBe(true);
  });

  it('élément dans un contenteditable : contexte de saisie', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editable.appendChild(child);
    document.body.appendChild(editable);
    let result: boolean | null = null;
    child.addEventListener('keydown', (e) => (result = isTypingContext(e)));
    child.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    editable.remove();
    expect(result).toBe(true);
  });

  it.each(['ctrlKey', 'altKey', 'metaKey'] as const)(
    'touche de modification (%s) : laissée au navigateur, même hors champ',
    (modifier) => {
      expect(typingFrom(document.createElement('div'), { [modifier]: true })).toBe(true);
    },
  );

  it('Maj seule hors champ : pas un contexte de saisie (« ? » s’obtient avec Maj)', () => {
    expect(typingFrom(document.createElement('div'), { shiftKey: true })).toBe(false);
  });

  it('bouton ordinaire : pas un contexte de saisie', () => {
    expect(typingFrom(document.createElement('button'))).toBe(false);
  });
});
