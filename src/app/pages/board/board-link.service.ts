import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { Editor } from '@tiptap/core';
import { BoardMainService } from './board-main.service';

/** Coordinates the "link selected text to a board element" flow.
 *
 *  A note's editor starts a session (beginLink) capturing the selection range;
 *  BoardComponent drives target picking and calls confirm()/cancel(). On confirm
 *  the captured range gets a `boardLink` mark pointing at the chosen element. */
@Injectable({ providedIn: 'root' })
export class BoardLinkService {
  private pending: {
    editor: Editor;
    from: number;
    to: number;
    sourceId?: string;
  } | null = null;

  /** True while the board is in target-picking mode. */
  readonly picking$ = new BehaviorSubject<boolean>(false);

  constructor(private main: BoardMainService) {}

  get isPicking(): boolean {
    return this.picking$.value;
  }

  /** Start a link session for the current selection of `editor`.
   *  Blurs the editor so the user can click board elements (and hold Enter to
   *  confirm) without typing into the note — the range is kept as from/to. */
  beginLink(editor: Editor, sourceId?: string): boolean {
    const { from, to } = editor.state.selection;
    if (from === to) return false;
    this.pending = { editor, from, to, sourceId };
    try {
      editor.commands.blur();
    } catch {}
    this.picking$.next(true);
    return true;
  }

  /** Apply the link mark to the captured range and end the session. The editor
   *  is left blurred (no focus) so a still-held Enter can't type into it; the
   *  camera recenters on the source note without activating it. */
  confirm(targetId: string): void {
    const p = this.pending;
    this.reset();
    if (!p || !targetId) return;

    p.editor
      .chain()
      .setTextSelection({ from: p.from, to: p.to })
      .setBoardLink({ targetId })
      .run();
    try {
      p.editor.commands.blur();
    } catch {}

    if (p.sourceId) {
      const source = this.main.findItemById(p.sourceId);
      if (source) this.main.centerOnItem(source);
    }
  }

  cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.pending = null;
    if (this.picking$.value) this.picking$.next(false);
  }
}
