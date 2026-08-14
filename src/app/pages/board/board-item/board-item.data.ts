import type { JSONContent } from '@tiptap/core';
import { docFromText } from '../../../helpers/rich-text.util';
import type { ElementBase } from '../models/element.model';

export class BoardItem {
  readonly id: string;
  serverId?: string;
  private _x!: number;
  private _y!: number;
  private _width!: number;
  private _height!: number;
  private _name: JSONContent = docFromText('Name');
  private _content: JSONContent = docFromText('Content');
  zIndex: number = 1;
  forceToRender: boolean = false;
  /** Near the viewport (small overscan): the component is DISPLAYED.
   *  Also feeds snap candidates and drag peer-outlines. */
  inView = false;
  /** Within the (much wider) mount range: the component exists in the DOM,
   *  hidden via display:none when not inView — so scrolling it back in is a
   *  style flip, not a component re-creation. */
  mounted = false;
  positionUpdated = false;
  sizeUpdated = false;
  contentUpdated = false;
  nameUpdated = false;

  /** Where this item stands relative to the server:
   *  - `local`  : has unsaved changes (or never saved)
   *  - `syncing`: a save request is in flight
   *  - `synced` : matches what's in the DB
   *  - `error`  : last save attempt failed (see `lastSyncError`) */
  syncState: 'local' | 'syncing' | 'synced' | 'error' = 'local';
  lastSyncError: string | null = null;

  /** Called by every dirty setter: a synced item that changes has diverged
   *  from the DB and is once again local-only. */
  private markDiverged() {
    if (this.syncState === 'synced') this.syncState = 'local';
  }

  constructor(
    id: string,
    realX: number,
    realY: number,
    realWidth: number,
    realHeight: number,
    name: JSONContent,
    content: JSONContent,
  ) {
    this.id = id;
    this._x = realX;
    this._y = realY;
    this._width = realWidth;
    this._height = realHeight;
    this.name = name;
    this.content = content;
  }

  set x(x: number) { if (x === this._x) return; this.positionUpdated = true; this._x = x; this.markDiverged(); }
  set y(y: number) { if (y === this._y) return; this.positionUpdated = true; this._y = y; this.markDiverged(); }
  set width(w: number) { if (w === this._width) return; this.sizeUpdated = true; this._width = w; this.markDiverged(); }
  set height(h: number) { if (h === this._height) return; this.sizeUpdated = true; this._height = h; this.markDiverged(); }
  get x() { return this._x; }
  get y() { return this._y; }
  get width() { return this._width; }
  get height() { return this._height; }

  getCenterX() { return this.x + this._width / 2; }
  getCenterY() { return this.y + this.height / 2; }

  set content(value: JSONContent) { if (value === this._content) return; this.contentUpdated = true; this._content = value; this.markDiverged(); }
  set name(value: JSONContent) { if (value === this._name) return; this.nameUpdated = true; this._name = value; this.markDiverged(); }
  get content() { return this._content; }
  get name() { return this._name; }

  updatePosition(x: number, y: number) { this.positionUpdated = true; this.x = x; this.y = y; }
  updateSize(width: number, height: number) { this.sizeUpdated = true; this.width = width; this.height = height; }

  /** Hydrate shared fields from a persisted element response. Call from
   *  subclass `from*Element` factories, then set subclass-specific fields. */
  protected hydrateBase(el: ElementBase): void {
    this.serverId = el.id;
    this.zIndex = el.zIndex ?? 1;
    (this as any).bgColor = el.bgColor;
    (this as any).borderColor = el.borderColor;
    (this as any).borderWidth = el.borderWidth ?? 1;
    this.syncState = 'synced';
  }

  /** Shared fields for the local-persistence snapshot. Subclasses spread this
   *  and add their own type-specific fields in `toSnapshot()`. */
  protected baseSnapshot(): BoardItemSnapshot {
    const s = this as any;
    return {
      type: 'item',
      id: this.id,
      serverId: this.serverId,
      x: this._x, y: this._y, width: this._width, height: this._height,
      zIndex: this.zIndex,
      bgColor: s.bgColor ?? null,
      borderColor: s.borderColor ?? null,
      borderWidth: s.borderWidth ?? 1,
      name: this._name,
      content: this._content,
      positionUpdated: this.positionUpdated,
      sizeUpdated: this.sizeUpdated,
      contentUpdated: this.contentUpdated,
      nameUpdated: this.nameUpdated,
      syncState: this.syncState,
    };
  }

  /** Restore the shared fields persisted by `baseSnapshot()` onto an item that
   *  a subclass `fromSnapshot()` has already constructed. */
  protected hydrateFromSnapshot(s: BoardItemSnapshot): void {
    this.serverId = s.serverId;
    this.zIndex = s.zIndex;
    (this as any).bgColor = s.bgColor;
    (this as any).borderColor = s.borderColor;
    (this as any).borderWidth = s.borderWidth;
    this.positionUpdated = s.positionUpdated;
    this.sizeUpdated = s.sizeUpdated;
    this.contentUpdated = s.contentUpdated;
    this.nameUpdated = s.nameUpdated;
    this.syncState = s.syncState;
  }

  /** Each subclass overrides this to emit a fully serializable snapshot. */
  toSnapshot(): BoardItemSnapshot {
    return this.baseSnapshot();
  }

  toBeUpdated(): boolean {
    return (
      this.contentUpdated ||
      this.nameUpdated ||
      this.positionUpdated ||
      this.sizeUpdated
    );
  }

  saved() {
    this.positionUpdated = false;
    this.sizeUpdated = false;
    this.contentUpdated = false;
    this.nameUpdated = false;
    this.syncState = 'synced';
    this.lastSyncError = null;
  }
}

/** Serializable snapshot of a BoardItem written to localStorage so unsaved
 *  work survives refresh / browser close. `type` discriminates the subclass. */
export interface BoardItemSnapshot {
  type: 'item' | 'note' | 'section' | 'image' | 'drawing';
  id: string;
  serverId?: string;
  x: number; y: number; width: number; height: number;
  zIndex: number;
  bgColor: string | null;
  borderColor: string | null;
  borderWidth: number;
  name: JSONContent;
  content: JSONContent;
  positionUpdated: boolean;
  sizeUpdated: boolean;
  contentUpdated: boolean;
  nameUpdated: boolean;
  syncState: 'local' | 'syncing' | 'synced' | 'error';
  // ── type-specific (present on the matching `type`) ──
  fontSize?: number;
  padding?: number | null;
  src?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  strokes?: Array<{ color: string; width: number; points: { x: number; y: number }[] }>;
}
