import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { BoardItem } from './board-item/board-item.data';
import { BoardHistoryService } from './board-history.service';

/**
 * Shared multi-selection for every board element (note / image / section /
 * drawing). Elements are selected with Ctrl/Cmd+click; while a multi-selection
 * is dragged, the whole group moves together. The actual "what to do with a
 * selection" logic lives in BoardComponent — this service only owns membership
 * and the group-move bookkeeping.
 */
@Injectable({ providedIn: 'root' })
export class BoardSelectionService {
  private _items: BoardItem[] = [];
  private readonly changed = new BehaviorSubject<BoardItem[]>([]);
  readonly changed$ = this.changed.asObservable();

  constructor(private history: BoardHistoryService) {}

  get items(): BoardItem[] { return this._items; }
  get size(): number { return this._items.length; }
  isSelected(item: BoardItem): boolean { return this._items.includes(item); }

  toggle(item: BoardItem, additive: boolean): void {
    if (additive) {
      const i = this._items.indexOf(item);
      if (i >= 0) this._items.splice(i, 1);
      else this._items.push(item);
    } else {
      this._items = [item];
    }
    this.emit();
  }

  set(items: BoardItem[]): void {
    this._items = items.slice();
    this.emit();
  }

  clear(): void {
    if (!this._items.length) return;
    this._items = [];
    this.emit();
  }

  private emit(): void {
    this.changed.next(this._items.slice());
  }

  // ── Group move ──────────────────────────────────────────────────────────────
  private moving = false;
  private anchor: BoardItem | null = null;
  private starts = new Map<BoardItem, { x: number; y: number }>();

  /** Begin a group move if `anchor` is part of a multi-selection. Returns true
   *  when the drag should move the whole group rather than just the anchor. */
  beginGroupMove(anchor: BoardItem): boolean {
    if (!this.isSelected(anchor) || this._items.length < 2) {
      this.moving = false;
      this.anchor = null;
      return false;
    }
    this.moving = true;
    this.anchor = anchor;
    this.starts.clear();
    for (const it of this._items) this.starts.set(it, { x: it.x, y: it.y });
    return true;
  }

  isGroupMoving(anchor: BoardItem): boolean {
    return this.moving && this.anchor === anchor;
  }

  /** Translate the whole group so the anchor lands at (x, y). */
  moveGroupTo(anchor: BoardItem, x: number, y: number): void {
    const a = this.starts.get(anchor);
    if (!a) return;
    const dx = x - a.x;
    const dy = y - a.y;
    for (const it of this._items) {
      const s = this.starts.get(it);
      if (!s) continue;
      it.x = s.x + dx;
      it.y = s.y + dy;
    }
  }

  /** Finish a group move and record a single undo step for all moved items. */
  endGroupMove(): void {
    if (!this.moving) return;
    this.moving = false;
    this.anchor = null;

    const moves: Array<{
      item: BoardItem;
      before: { x: number; y: number };
      after: { x: number; y: number };
    }> = [];
    for (const [item, before] of this.starts) {
      const after = { x: item.x, y: item.y };
      if (before.x !== after.x || before.y !== after.y) {
        moves.push({ item, before, after });
      }
    }
    this.starts.clear();
    if (!moves.length) return;

    this.history.pushGroupMove(
      moves.map((m) => ({
        id: m.item.id,
        bx: m.before.x,
        by: m.before.y,
        ax: m.after.x,
        ay: m.after.y,
      })),
    );
  }
}
