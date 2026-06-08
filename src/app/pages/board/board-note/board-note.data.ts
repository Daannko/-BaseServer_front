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

  static newNote(x: number, y: number, width: number, height: number): BoardNote {
    return new BoardNote(
      globalThis.crypto.randomUUID(),
      x, y, width, height,
      emptyDoc(), emptyDoc(),
    );
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
    return note;
  }
}
