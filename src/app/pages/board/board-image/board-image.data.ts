import type { JSONContent } from '@tiptap/core';
import { BoardItem } from '../board-item/board-item.data';
import type { Image } from '../models/element.model';
import { emptyDoc } from '../../../helpers/rich-text.util';

/** The image src (a URL into the blob store) is persisted as `src` on the API Image object.
 *  BoardImage keeps a legacy `content` doc for internal compatibility but the API field is `src`. */
function imageDoc(src: string): JSONContent {
  return { type: 'image', attrs: { src } } as JSONContent;
}

export class BoardImage extends BoardItem {
  readonly isImage = true as const;
  src: string;
  bgColor: string | null = null;
  borderColor: string | null = null;
  borderWidth: number = 1;
  /** Original dimensions of the source image; used by "Reset ratio". */
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

  static fromImageElement(el: Image): BoardImage {
    const image = new BoardImage(
      el.id, el.x, el.y, el.width, el.height,
      el.src ?? '',
    );
    image.hydrateBase(el);
    image.setNatural(el.naturalWidth ?? 0, el.naturalHeight ?? 0);
    image.saved();
    return image;
  }
}
