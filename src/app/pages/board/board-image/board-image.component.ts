import {
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
import { BoardImage } from './board-image.data';
import { ItemRect, ItemResizeDirective } from '../board-item/item.resize.directive';
import { ItemMoveDirective, Position } from '../board-item/item.move.directive';
import { BoardSnapService } from '../board-snap.service';
import { BoardHistoryService } from '../board-history.service';
import { BoardSelectionService } from '../board-selection.service';
import { SvgIconComponent } from '../../../helpers/svg-icon/svg-icon.component';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-board-image',
  standalone: true,
  imports: [
    CommonModule,
    ItemResizeDirective,
    ItemMoveDirective,
    SvgIconComponent,
  ],
  templateUrl: './board-image.component.html',
  styleUrl: './board-image.component.scss',
})
export class BoardImageComponent implements OnDestroy {
  @Input() tile!: BoardImage;
  @Input() zoom = 1;
  @Output() deleteImage = new EventEmitter<void>();

  @HostBinding('style.zIndex') get hostZIndex() { return this.tile?.zIndex ?? 1; }
  @HostBinding('style.left.px') get hostLeft() { return this.tile?.x ?? 0; }
  @HostBinding('style.top.px') get hostTop() { return this.tile?.y ?? 0; }
  @HostBinding('style.width.px') get hostWidth() { return this.tile?.width ?? 0; }
  @HostBinding('style.height.px') get hostHeight() { return this.tile?.height ?? 0; }
  @HostBinding('style.--board-zoom') get boardZoomVar() { return String(this.zoom); }
  @HostBinding('style.--tile-w') get tileWVar() { return (this.tile?.width ?? 0) + 'px'; }
  @HostBinding('style.--tile-h') get tileHVar() { return (this.tile?.height ?? 0) + 'px'; }
  @HostBinding('attr.data-item-id') get itemIdAttr() { return this.tile?.id ?? null; }

  get isSelected(): boolean { return this.selection.isSelected(this.tile); }

  /** Stored src is a relative media path (e.g. /media/boards/...); resolve it
   *  against the API host so the <img> doesn't 404 against the dev origin.
   *  Already-absolute (http/data/blob) srcs pass through unchanged. */
  get imgSrc(): string {
    const s = this.tile?.src ?? '';
    if (!s || /^(https?:|data:|blob:)/i.test(s)) return s;
    const base = environment.apiUrl.replace(/\/$/, '');
    return base + (s.startsWith('/') ? s : '/' + s);
  }

  isFocused = false;
  isOptionsPanelOpen = false;
  deleteConfirmPending = false;

  private deleteConfirmTimeout?: ReturnType<typeof setTimeout>;
  private isDraggingTile = false;

  constructor(
    private host: ElementRef<HTMLElement>,
    private snap: BoardSnapService,
    private history: BoardHistoryService,
    private selection: BoardSelectionService,
  ) {}

  // Rect snapshot at the start of a move/resize gesture, for history.
  private gestureBefore: { x: number; y: number; width: number; height: number } | null = null;
  private rectSnapshot() {
    return { x: this.tile.x, y: this.tile.y, width: this.tile.width, height: this.tile.height };
  }

  ngOnDestroy() {
    clearTimeout(this.deleteConfirmTimeout);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent) {
    const path = (ev.composedPath?.() ?? []) as EventTarget[];
    if (path.includes(this.host.nativeElement)) return;
    this.isFocused = false;
    this.isOptionsPanelOpen = false;
    if (!this.isDraggingTile) {
      this.tile.forceToRender = false;
    }
  }

  onSurfaceClick() { this.isFocused = true; }

  /** Record the source image's true aspect ratio once it loads (covers images
   *  restored from the server, where natural size isn't known up front). */
  onImgLoad(ev: Event) {
    const el = ev.target as HTMLImageElement;
    this.tile.setNatural(el.naturalWidth, el.naturalHeight);
  }

  /** Restore the element height to match the original image aspect ratio,
   *  keeping the current width. */
  resetRatio() {
    const before = this.rectSnapshot();
    const ratio = this.tile.naturalRatio || 1;
    this.tile.height = Math.round(this.tile.width / ratio);
    this.history.pushRect(this.tile, before);
    this.isOptionsPanelOpen = false;
  }

  // ── Move / resize / delete ───────────────────────────────────────────────

  onRectChange(r: ItemRect) {
    const prev: ItemRect = {
      x: this.tile.x,
      y: this.tile.y,
      width: this.tile.width,
      height: this.tile.height,
    };
    if (!this.gestureBefore) this.gestureBefore = prev;
    // Snap free stretches back to the original ratio + show the reference guide.
    const s = this.snap.snapImageAspect(r, prev, this.tile.naturalRatio, 'original ratio');
    this.tile.x = s.x; this.tile.y = s.y;
    this.tile.width = s.width; this.tile.height = s.height;
  }

  onResizeEnd() {
    this.snap.clearAspectGuide();
    if (this.gestureBefore) { this.history.pushRect(this.tile, this.gestureBefore); this.gestureBefore = null; }
  }

  onPosChange(p: Position) {
    if (this.selection.isGroupMoving(this.tile)) {
      this.selection.moveGroupTo(this.tile, p.x, p.y);
      return;
    }
    const s = this.snap.snapMove(
      { x: p.x, y: p.y, width: this.tile.width, height: this.tile.height },
      this.tile.id,
    );
    this.tile.x = s.x; this.tile.y = s.y;
  }

  onMoveStart() {
    this.selection.beginGroupMove(this.tile);
    this.isDraggingTile = true;
    this.tile.forceToRender = true;
    this.gestureBefore = this.rectSnapshot();
  }
  onMoveEnd() {
    const wasGroup = this.selection.isGroupMoving(this.tile);
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
      this.deleteImage.emit();
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
