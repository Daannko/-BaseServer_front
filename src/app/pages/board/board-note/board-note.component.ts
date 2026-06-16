import {
  Component,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  OnDestroy,
  AfterViewInit,
  TemplateRef,
  HostListener,
  HostBinding,
} from '@angular/core';
import { BoardItem } from '../board-item/board-item.data';
import { BoardNote, NoteOptions, DEFAULT_NOTE_OPTIONS } from './board-note.data';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Editor } from '@tiptap/core';
import { SvgIconComponent } from '../../../helpers/svg-icon/svg-icon.component';
import { QuerySelectComponent } from '../../common/query-select/query-select.component';
import { ColorPaletteComponent } from '../../common/color-palette/color-palette.component';
import { ItemRect, ItemResizeDirective } from '../board-item/item.resize.directive';
import { ItemMoveDirective, Position } from '../board-item/item.move.directive';
import { TiptapService } from '../board-item/tiptap.service';
import { BoardSnapService } from '../board-snap.service';
import { BoardHistoryService } from '../board-history.service';
import { BoardSelectionService } from '../board-selection.service';

@Component({
  selector: 'app-board-note',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SvgIconComponent,
    QuerySelectComponent,
    ColorPaletteComponent,
    ItemResizeDirective,
    ItemMoveDirective,
  ],
  providers: [TiptapService],
  templateUrl: './board-note.component.html',
  styleUrl: './board-note.component.scss',
})
export class BoardNoteComponent implements OnDestroy, AfterViewInit {
  @Input() tile!: BoardItem;
  @Input() zoom = 1;
  @Output() navbarChange = new EventEmitter<{ template: TemplateRef<any>; context: any }>();
  @Output() deleteTile = new EventEmitter<void>();
  @ViewChild('contentElement', { static: false }) contentElement!: ElementRef;
  @ViewChild('navbarContentTemplate', { static: false }) navbarContentTemplate!: TemplateRef<any>;

  @HostBinding('style.zIndex') get hostZIndex() { return this.tile?.zIndex ?? 1; }
  @HostBinding('style.left.px') get hostLeft() { return this.tile?.x ?? 0; }
  @HostBinding('style.top.px') get hostTop() { return this.tile?.y ?? 0; }
  @HostBinding('style.width.px') get hostWidth() { return this.tile?.width ?? 0; }
  @HostBinding('style.height.px') get hostHeight() { return this.tile?.height ?? 0; }
  @HostBinding('style.--tile-min') get hostTileMin() {
    return Math.max(this.tile?.width ?? 0, this.tile?.height ?? 0) + 'px';
  }
  @HostBinding('attr.data-item-id') get itemIdAttr() { return this.tile?.id ?? null; }

  get isSelected(): boolean { return this.selection.isSelected(this.tile); }

  isColorPaletteVisible = false;
  isBgPaletteVisible = false;
  deleteConfirmPending = false;
  isFocused = false;
  isOptionsPanelOpen = false;

  get noteOptions(): NoteOptions {
    return (this.tile as BoardNote).options ?? DEFAULT_NOTE_OPTIONS;
  }

  setNoteOption<K extends keyof NoteOptions>(key: K, value: NoteOptions[K]): void {
    (this.tile as BoardNote).options[key] = value;
  }

  onOptionNumberInput(key: 'padding', event: Event) {
    const val = (event.target as HTMLInputElement).value.trim();
    const num = parseFloat(val);
    this.setNoteOption(key, val === '' || isNaN(num) ? null : Math.max(0, num));
  }

  @HostBinding('style.--board-zoom') get boardZoomVar() {
    return String(this.zoom);
  }

  // Frozen at note creation (see BoardNote.fontSize); resizing won't rescale it.
  @HostBinding('style.--note-font-size') get noteFontSize() {
    return `${(this.tile as BoardNote).fontSize ?? 42}px`;
  }

  @HostBinding('style.--note-pad-v') get notePadV() {
    const p = this.noteOptions.padding;
    if (p != null) return `${p}px`;
    const m = Math.min(this.tile?.width ?? 0, this.tile?.height ?? 0);
    return `${m / 25}px`;
  }
  @HostBinding('style.--note-pad-h') get notePadH() {
    const p = this.noteOptions.padding;
    if (p != null) return `${p}px`;
    const m = Math.min(this.tile?.width ?? 0, this.tile?.height ?? 0);
    return `${m / 19}px`;
  }

  private static readonly DEFAULT_RECENT_BG_COLORS: string[] = [
    'rgba(255, 213, 79, 0.13)',
    'rgba(100, 190, 255, 0.13)',
    'rgba(100, 210, 120, 0.12)',
    'rgba(255, 100, 100, 0.12)',
  ];

  private static readonly DEFAULT_RECENT_BORDER_COLORS: string[] = [
    'rgba(255, 213, 79, 0.6)',
    'rgba(100, 190, 255, 0.6)',
    'rgba(100, 210, 120, 0.55)',
    'rgba(255, 100, 100, 0.55)',
  ];

  recentBgColors: string[] = [...BoardNoteComponent.DEFAULT_RECENT_BG_COLORS];
  recentBorderColors: string[] = [...BoardNoteComponent.DEFAULT_RECENT_BORDER_COLORS];

  get noteBgColor(): string | null {
    return (this.tile as BoardNote).bgColor ?? null;
  }

  setBgColor(color: string | null): void {
    (this.tile as BoardNote).bgColor = color;
    if (color !== null) {
      this.recentBgColors = [color, ...this.recentBgColors.filter(c => c !== color)].slice(0, 4);
    }
  }

  get noteBorderColor(): string | null {
    return (this.tile as BoardNote).borderColor ?? null;
  }

  setBorderColor(color: string | null): void {
    (this.tile as BoardNote).borderColor = color;
    if (color !== null) {
      this.recentBorderColors = [color, ...this.recentBorderColors.filter(c => c !== color)].slice(0, 4);
    }
  }

  onBgPaletteChange(color: string | null): void {
    (this.tile as BoardNote).bgColor = color;
  }

  onBorderPaletteChange(color: string | null): void {
    (this.tile as BoardNote).borderColor = color;
  }

  onTextColorPick(color: string | null): void {
    if (color !== null) this.tiptap.setTextColor(color, this.contentEditor);
  }

  onHighlightPick(color: string | null): void {
    if (color === null) {
      this.tiptap.unsetHighlight(this.contentEditor);
    } else {
      this.tiptap.setHighlight(color, this.contentEditor);
    }
  }

  get noteBorderWidth(): number {
    return (this.tile as BoardNote).borderWidth ?? 1;
  }

  onBorderWidthInput(event: Event): void {
    (this.tile as BoardNote).borderWidth = parseFloat((event.target as HTMLInputElement).value);
  }

  /** Clear = no background, no border color, no text. Gets a visible outline so it stays findable. */
  get isClear(): boolean {
    return (
      this.noteBgColor === null &&
      this.noteBorderColor === null &&
      (this.tiptap.contentEditor?.isEmpty ?? true)
    );
  }

  get noteBorderGlow(): string | null {
    const match = this.noteBorderColor?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return null;
    const alpha = Math.min(1, parseFloat(match[4] ?? '1') * 0.28);
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
  }

  private navbarPinned = false;
  private isDraggingTile = false;
  private deleteConfirmTimeout?: ReturnType<typeof setTimeout>;
  private resizeObserver?: ResizeObserver;

  constructor(
    private host: ElementRef<HTMLElement>,
    public tiptap: TiptapService,
    private snap: BoardSnapService,
    private history: BoardHistoryService,
    private selection: BoardSelectionService,
  ) {}

  // Rect snapshot at the start of a move/resize gesture, for history.
  private gestureBefore: { x: number; y: number; width: number; height: number } | null = null;
  private rectSnapshot() {
    return { x: this.tile.x, y: this.tile.y, width: this.tile.width, height: this.tile.height };
  }

  get contentEditor(): Editor { return this.tiptap.contentEditor!; }

  clearSelectionHighlight() { this.tiptap.clearSelectionHighlight(); }

  focus() {
    this.isFocused = true;
    this.tile.forceToRender = true;
    this.tiptap.contentEditor?.commands.focus('end');
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent) {
    const path = (ev.composedPath?.() ?? []) as EventTarget[];
    if (path.includes(this.host.nativeElement)) return;
    this.isFocused = false;
    this.isOptionsPanelOpen = false;
    this.navbarPinned = false;
    // Clear any text selection anchored in this note. Background panning
    // calls preventDefault(), so the browser never clears it on its own —
    // and a lingering selection would re-pin the note navbar on mouseup.
    const selection = window.getSelection();
    if (
      selection &&
      this.contentElement?.nativeElement?.contains(selection.anchorNode)
    ) {
      selection.removeAllRanges();
      this.tiptap.clearSelectionHighlight();
    }
    if (!this.isDraggingTile && !this.tiptap.hasActiveSelection) {
      this.tile.forceToRender = false;
    }
  }

  ngAfterViewInit() {
    this.tiptap.initEditors({
      tile: this.tile,
      contentElement: this.contentElement.nativeElement,
    });

    const contentRoot = this.contentElement.nativeElement as HTMLElement;
    contentRoot.addEventListener('click', () => {
      this.isFocused = true;
      this.requestNavbar(this.navbarContentTemplate);
    });

    this.tiptap.onFocusCallback = () => {
      if (!this.navbarPinned && !this.isDraggingTile) {
        this.tile.forceToRender = false;
      }
    };

    const onDocumentMouseUp = () => {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        if (contentRoot.contains(selection.anchorNode)) {
          this.requestNavbar(this.navbarContentTemplate);
        }
      }
    };
    document.addEventListener('mouseup', onDocumentMouseUp);
    this.removeDocumentMouseUp = () =>
      document.removeEventListener('mouseup', onDocumentMouseUp);

    contentRoot.addEventListener('mousemove', (e: MouseEvent) => {
      const el = (e.target as HTMLElement) || null;
      if (el?.tagName === 'IMG') { contentRoot.style.cursor = 'grab'; return; }
      const path = (e.composedPath?.() ?? []) as EventTarget[];
      const anchor = path.find((p): p is HTMLAnchorElement => p instanceof HTMLAnchorElement);
      if (anchor) { contentRoot.style.cursor = 'pointer'; return; }
      contentRoot.style.cursor = 'text';
    });

    this.resizeObserver = new ResizeObserver(() => {
      const el = contentRoot;
      const st = el.scrollTop;
      el.scrollTop = st + 1;
      el.scrollTop = st;
    });
    this.resizeObserver.observe(contentRoot);
  }

  onTileWorldRectChange(r: ItemRect) {
    const prev: ItemRect = {
      x: this.tile.x,
      y: this.tile.y,
      width: this.tile.width,
      height: this.tile.height,
    };
    if (!this.gestureBefore) this.gestureBefore = prev;
    const s = this.snap.snapResize(r, prev, this.tile.id);
    this.tile.x = s.x; this.tile.y = s.y;
    this.tile.width = s.width; this.tile.height = s.height;
  }

  onTileWorldPosChange(p: Position) {
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

  onDeleteClick(event: MouseEvent) {
    event.stopPropagation();
    this.triggerDelete();
  }

  /** Two-step delete: first call arms the confirm ("Delete?"), second deletes. */
  private triggerDelete() {
    if (this.deleteConfirmPending) {
      clearTimeout(this.deleteConfirmTimeout);
      this.deleteConfirmPending = false;
      this.deleteTile.emit();
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

  private removeDocumentMouseUp?: () => void;

  ngOnDestroy() {
    clearTimeout(this.deleteConfirmTimeout);
    this.removeDocumentMouseUp?.();
    this.resizeObserver?.disconnect();
    this.tiptap.destroyEditors();
  }

  requestNavbar(template: TemplateRef<any>) {
    if (!template) return;
    this.navbarPinned = true;
    this.tile.forceToRender = true;
    this.navbarChange.emit({ template, context: { tile: this.tile } });
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
    if (!this.navbarPinned) this.tile.forceToRender = false;
    this.snap.clearGuides();
    if (wasGroup) {
      // The selection service records one undo step for the whole group.
      this.selection.endGroupMove();
      this.gestureBefore = null;
      return;
    }
    if (this.gestureBefore) { this.history.pushRect(this.tile, this.gestureBefore); this.gestureBefore = null; }
  }

  onResizeEnd() {
    this.snap.clearGuides();
    if (this.gestureBefore) { this.history.pushRect(this.tile, this.gestureBefore); this.gestureBefore = null; }
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
