import { BoardItem } from '../board-item/board-item.data';
import type { Note } from '../models/element.model';
import { emptyDoc } from '../../../helpers/rich-text.util';

export interface NoteOptions {
  padding?: number | null;
}

export const DEFAULT_NOTE_OPTIONS: NoteOptions = {};

export class BoardNote extends BoardItem {
  readonly isNote = true as const;
  bgColor: string | null = null;
  borderColor: string | null = null;
  borderWidth: number = 1;
  options: NoteOptions = { ...DEFAULT_NOTE_OPTIONS };

  private static readonly FONT_REF_SIZE = 450;
  private static readonly FONT_REF_PX = 25;
  private static readonly FONT_EXP = 1.2;

  /** Default text size, computed once from the note's size at creation. Frozen
   *  after that — resizing the note does NOT rescale the text. */
  fontSize: number = BoardNote.FONT_REF_PX;

  static computeFontSize(width: number, height: number): number {
    const m = Math.min(width, height);
    return BoardNote.FONT_REF_PX * Math.pow(m / BoardNote.FONT_REF_SIZE, BoardNote.FONT_EXP);
  }

  static newNote(x: number, y: number, width: number, height: number): BoardNote {
    const note = new BoardNote(
      globalThis.crypto.randomUUID(),
      x, y, width, height,
      emptyDoc(), emptyDoc(),
    );
    note.fontSize = BoardNote.computeFontSize(width, height);
    return note;
  }

  static fromNoteElement(el: Note): BoardNote {
    const note = new BoardNote(
      el.id, el.x, el.y, el.width, el.height,
      emptyDoc(),
      el.content ?? emptyDoc(),
    );
    note.hydrateBase(el);
    note.fontSize = el.fontSize ?? BoardNote.FONT_REF_PX;
    note.options.padding = el.padding ?? null;
    note.saved();
    return note;
  }
}
