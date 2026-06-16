import { BoardItem } from '../board-item/board-item.data';
import { Topic } from '../models/topic.model';
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

  // Slightly superlinear (EXP > 1) so bigger notes start with proportionally
  // bigger text. Anchored to FONT_REF_PX at a FONT_REF_SIZE-unit note.
  private static readonly FONT_REF_SIZE = 450;
  private static readonly FONT_REF_PX = 25;
  private static readonly FONT_EXP = 1.2;

  /**
   * Default text size, computed once from the note's size at creation. Frozen
   * after that — resizing the note does NOT rescale the text.
   */
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

  static fromNoteTopic(topic: Topic): BoardNote {
    const note = new BoardNote(
      topic.id,
      topic.x, topic.y,
      topic.width, topic.height,
      emptyDoc(),
      topic.content ?? emptyDoc(),
    );
    note.serverId = topic.id;
    note.fontSize = BoardNote.computeFontSize(topic.width, topic.height);
    return note;
  }
}
