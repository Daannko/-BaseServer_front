import { BoardItem, BoardItemSnapshot } from '../board-item/board-item.data';
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

  /** Deep copy with a fresh id, offset by (dx, dy). Used by copy/paste. */
  clone(dx = 0, dy = 0): BoardSection {
    const s = new BoardSection(
      globalThis.crypto.randomUUID(),
      this.x + dx, this.y + dy, this.width, this.height,
      structuredClone(this.name), emptyDoc(),
    );
    s.bgColor = this.bgColor;
    s.borderColor = this.borderColor;
    s.borderWidth = this.borderWidth;
    s.zIndex = this.zIndex;
    return s;
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

  override toSnapshot(): BoardItemSnapshot {
    // The section title lives in the base `name` doc, already captured by
    // baseSnapshot(); only the discriminator needs overriding.
    return { ...this.baseSnapshot(), type: 'section' };
  }

  static fromSnapshot(s: BoardItemSnapshot): BoardSection {
    const section = new BoardSection(
      s.id, s.x, s.y, s.width, s.height, s.name, s.content,
    );
    section.hydrateFromSnapshot(s);
    return section;
  }
}
