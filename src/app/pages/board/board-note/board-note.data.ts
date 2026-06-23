import { BoardItem, BoardItemSnapshot } from '../board-item/board-item.data';
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

  private static readonly FONT_REF_PX = 25;

  /** Base text size for runs that carry no explicit fontSize mark (i.e. an
   *  empty note). Set at creation from the user's last-used size — NOT derived
   *  from the note's dimensions. Resizing the note does NOT rescale the text. */
  fontSize: number = BoardNote.FONT_REF_PX;

  static newNote(
    x: number, y: number, width: number, height: number,
    fontSize: number = BoardNote.FONT_REF_PX,
  ): BoardNote {
    const note = new BoardNote(
      globalThis.crypto.randomUUID(),
      x, y, width, height,
      emptyDoc(), emptyDoc(),
    );
    note.fontSize = fontSize;
    return note;
  }

  /** Deep copy with a fresh id, offset by (dx, dy). Used by copy/paste. */
  clone(dx = 0, dy = 0): BoardNote {
    const n = new BoardNote(
      globalThis.crypto.randomUUID(),
      this.x + dx, this.y + dy, this.width, this.height,
      structuredClone(this.name), structuredClone(this.content),
    );
    n.fontSize = this.fontSize;
    n.bgColor = this.bgColor;
    n.borderColor = this.borderColor;
    n.borderWidth = this.borderWidth;
    n.options = { ...this.options };
    n.zIndex = this.zIndex;
    return n;
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

  override toSnapshot(): BoardItemSnapshot {
    return {
      ...this.baseSnapshot(),
      type: 'note',
      fontSize: this.fontSize,
      padding: this.options.padding ?? null,
    };
  }

  static fromSnapshot(s: BoardItemSnapshot): BoardNote {
    const note = new BoardNote(
      s.id, s.x, s.y, s.width, s.height, s.name, s.content,
    );
    note.fontSize = s.fontSize ?? BoardNote.FONT_REF_PX;
    note.options.padding = s.padding ?? null;
    note.hydrateFromSnapshot(s);
    return note;
  }
}
