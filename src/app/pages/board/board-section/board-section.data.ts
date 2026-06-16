import { BoardItem } from '../board-item/board-item.data';
import type { Section } from '../models/element.model';
import { docFromText, emptyDoc } from '../../../helpers/rich-text.util';
import { Theme } from '../../../theme';

export class BoardSection extends BoardItem {
  readonly isSection = true as const;
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

  static fromSectionElement(el: Section): BoardSection {
    const section = new BoardSection(
      el.id, el.x, el.y, el.width, el.height,
      el.title ?? docFromText('Section'),
      emptyDoc(),
    );
    section.hydrateBase(el);
    section.saved();
    return section;
  }
}
