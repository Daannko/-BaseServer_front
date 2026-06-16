import type { JSONContent } from '@tiptap/core';
import { BoardItem } from '../board-item/board-item.data';
import { Topic } from '../models/topic.model';
import { emptyDoc } from '../../../helpers/rich-text.util';

/** Marker stored in Topic.note to distinguish images from notes/sections. */
export const IMAGE_MARKER = '__image__';

/** The image src (data URL or remote URL) is persisted inside Topic.content. */
function imageDoc(src: string): JSONContent {
  return { type: 'image', attrs: { src } } as JSONContent;
}

function srcFromContent(content: unknown): string {
  const c = content as any;
  return c?.attrs?.src ?? c?.src ?? '';
}

export class BoardImage extends BoardItem {
  readonly isImage = true as const;
  src: string;
  bgColor: string | null = null;
  borderColor: string | null = null;
  borderWidth: number = 1;
  /** Original width/height ratio of the source image; used by "Reset ratio".
   *  Set once the image's natural size is known (on paste or on <img> load). */
  naturalRatio: number = 1;
  naturalWidth: number = 0;
  naturalHeight: number = 0;

  setNatural(width: number, height: number): void {
    if (width > 0 && height > 0) {
      this.naturalWidth = width;
      this.naturalHeight = height;
      this.naturalRatio = width / height;
    }
  }

  constructor(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    src: string,
  ) {
    super(id, x, y, width, height, emptyDoc(), imageDoc(src));
    this.src = src;
  }

  static newImage(
    x: number,
    y: number,
    width: number,
    height: number,
    src: string,
  ): BoardImage {
    return new BoardImage(globalThis.crypto.randomUUID(), x, y, width, height, src);
  }

  static fromImageTopic(topic: Topic): BoardImage {
    const image = new BoardImage(
      topic.id,
      topic.x,
      topic.y,
      topic.width,
      topic.height,
      srcFromContent(topic.content),
    );
    image.serverId = topic.id;
    // Content/name came from the server — clear dirty flags so saveBoard()
    // doesn't re-PATCH the (potentially large) data URL on every save.
    image.saved();
    return image;
  }
}
