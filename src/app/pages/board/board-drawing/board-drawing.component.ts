import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { merge, Subscription } from 'rxjs';
import { BoardDrawing, SubStroke } from '../board-draw.data';
import { ItemMoveDirective, Position } from '../board-item/item.move.directive';
import { BoardSnapService } from '../board-snap.service';
import { BoardHistoryService } from '../board-history.service';
import { BoardSelectionService } from '../board-selection.service';
import { BoardMainService } from '../board-main.service';
import { SvgIconComponent } from '../../../helpers/svg-icon/svg-icon.component';

/**
 * A freehand stroke as a movable/deletable board element. Positioned at the
 * stroke's bounding box; the path is drawn in local coordinates so moving the
 * element only updates x/y (the vector data never changes). No resize — a
 * stroke is its own intrinsic size.
 */
@Component({
  selector: 'app-board-drawing',
  standalone: true,
  imports: [CommonModule, ItemMoveDirective, SvgIconComponent],
  templateUrl: './board-drawing.component.html',
  styleUrl: './board-drawing.component.scss',
  // OnPush — external mutations arrive via main.itemsChanged$ /
  // selection.changed$ → markForCheck (see constructor).
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardDrawingComponent implements OnDestroy {
  @Input() tile!: BoardDrawing;
  @Input() zoom = 1;
  @Output() deleteDrawing = new EventEmitter<void>();

  @HostBinding('style.zIndex') get hostZIndex() { return this.tile?.zIndex ?? 1; }
  @HostBinding('style.left.px') get hostLeft() { return this.tile?.x ?? 0; }
  @HostBinding('style.top.px') get hostTop() { return this.tile?.y ?? 0; }
  @HostBinding('style.width.px') get hostWidth() { return this.tile?.width ?? 0; }
  @HostBinding('style.height.px') get hostHeight() { return this.tile?.height ?? 0; }
  @HostBinding('style.--board-zoom') get boardZoomVar() { return String(this.zoom); }
  @HostBinding('attr.data-item-id') get itemIdAttr() { return this.tile?.id ?? null; }

  get isSelected(): boolean { return this.selection.isSelected(this.tile); }

  isFocused = false;
  deleteConfirmPending = false;

  private deleteConfirmTimeout?: ReturnType<typeof setTimeout>;
  private isDraggingTile = false;
  private gestureBefore: { x: number; y: number; width: number; height: number } | null = null;

  constructor(
    private host: ElementRef<HTMLElement>,
    private snap: BoardSnapService,
    private history: BoardHistoryService,
    private selection: BoardSelectionService,
    private main: BoardMainService,
    private cdr: ChangeDetectorRef,
  ) {
    this.externalChanges = merge(
      this.main.itemsChanged$,
      this.selection.changed$,
    ).subscribe(() => this.cdr.markForCheck());
  }

  private externalChanges: Subscription;

  private rectSnapshot() {
    return { x: this.tile.x, y: this.tile.y, width: this.tile.width, height: this.tile.height };
  }

  ngOnDestroy() {
    this.externalChanges.unsubscribe();
    clearTimeout(this.deleteConfirmTimeout);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent) {
    const path = (ev.composedPath?.() ?? []) as EventTarget[];
    if (path.includes(this.host.nativeElement)) return;
    this.isFocused = false;
    if (!this.isDraggingTile) {
      this.tile.forceToRender = false;
    }
  }

  onSurfaceClick() {
    // Ctrl+click selection is handled centrally by BoardComponent; a plain click
    // just focuses (shows the controls bar).
    this.isFocused = true;
  }

  /** Widened, invisible hit stroke so the thin line is easy to grab — the grab
   *  zone hugs the stroke shape rather than filling the bounding box. */
  hitWidth(s: SubStroke): number {
    return Math.max(s.width + 14, 18);
  }

  // ── Move / delete ──────────────────────────────────────────────────────────

  onPosChange(p: Position) {
    if (this.selection.isGroupMoving(this.tile)) {
      const c = this.snap.snapGroupMove(
        this.selection.items,
        p.x - this.tile.x,
        p.y - this.tile.y,
        p.lockedAxis,
      );
      this.selection.moveGroupTo(this.tile, this.tile.x + c.dx, this.tile.y + c.dy, p.lockedAxis);
      this.main.bumpGeometry();
      return;
    }
    const s = this.snap.snapMove(
      { x: p.x, y: p.y, width: this.tile.width, height: this.tile.height },
      this.tile.id,
      p.lockedAxis,
    );
    this.tile.x = s.x; this.tile.y = s.y;
    this.main.bumpGeometry();
  }

  onMoveStart() {
    this.selection.beginGroupMove(this.tile);
    this.main.beginElementDrag([this.tile.id]);
    this.isDraggingTile = true;
    this.tile.forceToRender = true;
    this.gestureBefore = this.rectSnapshot();
  }
  onMoveEnd() {
    const wasGroup = this.selection.isGroupMoving(this.tile);
    this.main.endElementDrag();
    this.isDraggingTile = false;
    this.tile.forceToRender = false;
    this.snap.clearGuides();
    if (wasGroup) {
      this.selection.endGroupMove();
      this.gestureBefore = null;
      return;
    }
    if (this.gestureBefore) { this.history.pushRect(this.tile, this.gestureBefore); this.gestureBefore = null; }
  }

  onDeleteClick(event: MouseEvent) {
    event.stopPropagation();
    this.triggerDelete();
  }

  /** Two-step delete: first call arms the confirm ("Delete?"), second deletes. */
  private triggerDelete() {
    if (this.deleteConfirmPending) {
      clearTimeout(this.deleteConfirmTimeout);
      this.deleteConfirmPending = false;
      this.deleteDrawing.emit();
    } else {
      this.deleteConfirmPending = true;
      this.deleteConfirmTimeout = setTimeout(() => { this.deleteConfirmPending = false; }, 2500);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent) {
    if (!this.isFocused) return;
    if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
    if (isTextEditingActive()) return;
    ev.preventDefault();
    this.triggerDelete();
  }
}

/** True when focus is in a text field / rich-text editor, so Delete/Backspace
 *  should edit text rather than remove the board element. */
function isTextEditingActive(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA')
  );
}
