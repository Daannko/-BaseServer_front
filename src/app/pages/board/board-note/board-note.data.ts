import { BoardConnector } from '../board-connector/board-connector';
import { BoardTile } from '../board-tile/board-tile.data';
import { Topic } from '../models/topic.model';
import { emptyDoc } from '../../../helpers/rich-text.util';

export const NOTE_MARKER = '__note__';

export interface NoteOptions {
  padding?: number | null; // px; null/undefined = auto-scaled
  // future: borderColor, fontScale, opacity, etc.
}

export const DEFAULT_NOTE_OPTIONS: NoteOptions = {};

export class BoardNote extends BoardTile {
  readonly isNote = true as const;
  bgColor: string | null = null;
  borderColor: string | null = null;
  borderWidth: number = 1;
  options: NoteOptions = { ...DEFAULT_NOTE_OPTIONS };

  static newNote(x: number, y: number, width: number, height: number): BoardNote {
    return new BoardNote(
      globalThis.crypto.randomUUID(),
      x, y, width, height,
      new Set<BoardConnector>(), 0,
      emptyDoc(), emptyDoc(),
    );
  }

  static fromNoteTopic(topic: Topic): BoardNote {
    const note = new BoardNote(
      topic.id,
      topic.x, topic.y,
      topic.width, topic.height,
      new Set<BoardConnector>(), 0,
      emptyDoc(),
      topic.content ?? emptyDoc(),
    );
    note.serverId = topic.id;
    return note;
  }
}
