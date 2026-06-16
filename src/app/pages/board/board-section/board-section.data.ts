import { BoardItem } from '../board-item/board-item.data';
import { Topic } from '../models/topic.model';
import { docFromText, emptyDoc } from '../../../helpers/rich-text.util';
import { Theme } from '../../../theme';

/** Marker stored in Topic.note to distinguish sections from regular notes. */
export const SECTION_MARKER = '__section__';

export class BoardSection extends BoardItem {
  readonly isSection = true as const;
  // Sections default to the global translucent whitish fill.
  bgColor: string | null = Theme.defaultBg;
  borderColor: string | null = null;
  borderWidth: number = 1;

  static newSection(x: number, y: number, width: number, height: number): BoardSection {
    return new BoardSection(
      globalThis.crypto.randomUUID(),
      x, y, width, height,
      docFromText('Section'), emptyDoc(),
    );
  }

  static fromSectionTopic(topic: Topic): BoardSection {
    const section = new BoardSection(
      topic.id,
      topic.x, topic.y,
      topic.width, topic.height,
      topic.title ?? docFromText('Section'),
      emptyDoc(),
    );
    section.serverId = topic.id;
    return section;
  }
}
