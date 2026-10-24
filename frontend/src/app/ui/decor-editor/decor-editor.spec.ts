import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { MAX_DECOR_ITEMS, type DecorTool } from '../../sim/decor-edit';
import { DECOR_TOOLS, DecorEditor, decorEditorHint } from './decor-editor';

describe('decorEditorHint', () => {
  it('dit ce que fera un clic, selon l’outil et la sélection', () => {
    expect(decorEditorHint('rock', null, false)).toBe('Cliquez sur le sable pour poser : rocher.');
    expect(decorEditorHint('tuft', null, false)).toContain('touffe');
    expect(decorEditorHint('select', null, false)).toContain('sélectionner');
    expect(decorEditorHint('rock', 0, false)).toContain('Suppr');
    expect(decorEditorHint('rock', null, true)).toContain(String(MAX_DECOR_ITEMS));
    expect(decorEditorHint('rock', 0, false)).toContain('Glissez');
  });

  it('dit pourquoi une pose a été refusée, avant tout le reste', () => {
    expect(decorEditorHint('rock', 2, false, true)).toContain('refusée');
    expect(decorEditorHint('select', null, true, true)).toContain('chevaucherait');
  });

  it('dit qu’un élément a été posé sans chute faute de moteur (#170), après un refus', () => {
    expect(decorEditorHint('rock', 3, false, false, true)).toContain('posé sur le sable');
    expect(decorEditorHint('rock', 3, false, true, true)).toContain('refusée');
  });

  it('propose la sélection puis chaque type du catalogue', () => {
    expect(DECOR_TOOLS.map((t) => t.id)).toEqual(['select', 'rock', 'wood', 'tall', 'tuft']);
  });
});

@Component({
  imports: [DecorEditor],
  template: `<app-decor-editor
      [tool]="tool()"
      [selection]="selection()"
      [count]="count()"
      [refused]="refused()"
      (rotateRequested)="rotations.push($event)"
      (scaleRequested)="scales.push($event)"
      (toolChanged)="tools.push($event)"
      (deleteRequested)="deletes = deletes + 1"
      (deselectRequested)="deselects = deselects + 1"
      (closed)="closes = closes + 1"
    />
    <input aria-label="champ" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestHost {
  readonly tool = signal<DecorTool>('rock');
  readonly selection = signal<number | null>(null);
  readonly count = signal(10);
  readonly refused = signal(false);
  readonly tools: DecorTool[] = [];
  readonly rotations: number[] = [];
  readonly scales: number[] = [];
  deletes = 0;
  deselects = 0;
  closes = 0;
}

describe('DecorEditor', () => {
  let fixture: ComponentFixture<TestHost>;
  const root = () => fixture.nativeElement as HTMLElement;
  const host = () => fixture.componentInstance;
  const button = (text: string) =>
    [...root().querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === text,
    )!;
  const key = (k: string, target: EventTarget = document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  beforeEach(async () => {
    fixture = TestBed.createComponent(TestHost);
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  it('affiche les outils, l’outil courant coché, et émet le choix', async () => {
    const radios = [...root().querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.map((r) => r.textContent?.trim())).toEqual([
      'Sélection',
      'Rocher',
      'Bois flotté',
      'Grande plante',
      'Touffe',
    ]);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
    ]);
    button('Touffe').click();
    expect(host().tools).toEqual(['tuft']);
    host().tool.set('tuft');
    await fixture.whenStable();
    expect(button('Touffe').getAttribute('aria-checked')).toBe('true');
    expect(root().querySelector('[data-decor-count]')?.textContent?.trim()).toBe(
      `10 / ${MAX_DECOR_ITEMS} éléments`,
    );
  });

  it('« Supprimer » et Suppr : seulement avec une sélection', async () => {
    button('Supprimer').click();
    key('Delete');
    expect(host().deletes).toBe(0);
    expect(button('Supprimer').getAttribute('aria-disabled')).toBe('true');
    host().selection.set(3);
    await fixture.whenStable();
    expect(button('Supprimer').getAttribute('aria-disabled')).toBe('false');
    button('Supprimer').click();
    key('Delete');
    key('Backspace');
    expect(host().deletes).toBe(3);
  });

  it('tourner et redimensionner : boutons et touches, seulement avec une sélection', async () => {
    const pose = (id: string) => root().querySelector<HTMLButtonElement>(`[data-pose="${id}"]`)!;
    expect(
      [...root().querySelectorAll('[data-pose]')].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Tourner de −15°', 'Tourner de +15°', 'Réduire', 'Agrandir']);
    pose('droite').click();
    key('ArrowLeft');
    key('+');
    expect(host().rotations).toEqual([]);
    expect(host().scales).toEqual([]);
    expect(pose('agrandir').getAttribute('aria-disabled')).toBe('true');
    host().selection.set(0);
    await fixture.whenStable();
    expect(pose('agrandir').getAttribute('aria-disabled')).toBe('false');
    pose('gauche').click();
    pose('droite').click();
    pose('reduire').click();
    pose('agrandir').click();
    key('ArrowRight');
    key('ArrowLeft');
    key('-');
    key('+');
    key('=');
    expect(host().rotations).toEqual([-1, 1, 1, -1]);
    expect(host().scales).toEqual([-1, 1, -1, 1, 1]);
    // Avec Ctrl (zoom du navigateur) : ignoré.
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true }),
    );
    expect(host().scales.length).toBe(5);
    key('ArrowRight', root().querySelector('input')!);
    expect(host().rotations.length).toBe(4);
  });

  it('affiche le refus d’une pose', async () => {
    host().selection.set(0);
    host().refused.set(true);
    await fixture.whenStable();
    expect(root().querySelector('[data-decor-hint]')?.textContent).toContain('refusée');
  });

  it('Échap désélectionne, puis termine ; « Terminer » termine', async () => {
    host().selection.set(1);
    await fixture.whenStable();
    key('Escape');
    expect(host().deselects).toBe(1);
    expect(host().closes).toBe(0);
    host().selection.set(null);
    await fixture.whenStable();
    key('Escape');
    expect(host().closes).toBe(1);
    button('Terminer').click();
    expect(host().closes).toBe(2);
  });

  it('ignore les touches tapées dans un champ, et n’écoute plus une fois détruit', async () => {
    host().selection.set(0);
    await fixture.whenStable();
    key('Delete', root().querySelector('input')!);
    expect(host().deletes).toBe(0);
    fixture.destroy();
    key('Delete');
    expect(host().deletes).toBe(0);
  });
});
