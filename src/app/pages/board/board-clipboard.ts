import type { BoardItemSnapshot } from './board-item/board-item.data';
import { environment } from '../../../environments/environment';

/** Board items on the system clipboard. Other apps ignore this custom type and
 *  take the text/plain or text/html copy written next to it. */
export const BOARD_ITEMS_MIME = 'application/x-baseserver-items';

interface BoardClipboardPayload {
  format: 'baseserver-items';
  version: 1;
  items: BoardItemSnapshot[];
}

const ITEM_TYPES = new Set(['note', 'section', 'image', 'drawing']);

export function writeBoardItems(data: DataTransfer, items: BoardItemSnapshot[]): void {
  const payload: BoardClipboardPayload = { format: 'baseserver-items', version: 1, items };
  data.setData(BOARD_ITEMS_MIME, JSON.stringify(payload));
}

/** Board items from a paste, or null when the clipboard holds none. Any page
 *  can put this type on the clipboard, so the shape is checked and images may
 *  only point at this app or carry their own data. */
export function readBoardItems(data: DataTransfer | null): BoardItemSnapshot[] | null {
  const raw = data?.getData(BOARD_ITEMS_MIME);
  if (!raw) return null;
  let payload: BoardClipboardPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (payload?.format !== 'baseserver-items' || !Array.isArray(payload.items)) return null;
  const items = payload.items.filter(
    (s) =>
      s &&
      ITEM_TYPES.has(s.type) &&
      [s.x, s.y, s.width, s.height].every(Number.isFinite) &&
      (s.type !== 'image' || isOwnImage(s.src)),
  );
  return items.length ? items : null;
}

function isOwnImage(src: unknown): boolean {
  if (typeof src !== 'string') return false;
  if (src.startsWith('data:image/')) return true;
  try {
    const origin = new URL(src, location.href).origin;
    return origin === location.origin || origin === new URL(environment.apiUrl, location.href).origin;
  } catch {
    return false;
  }
}

/** Top to bottom, then left to right: the order text is read in. */
export function readingOrder<T extends { x: number; y: number }>(items: T[]): T[] {
  return items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
}
