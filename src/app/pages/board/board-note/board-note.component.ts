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
  ChangeDetectorRef,
} from '@angular/core';
import { BoardItem } from '../board-item/board-item.data';
import { BoardNote, NoteOptions, DEFAULT_NOTE_OPTIONS } from './board-note.data';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Editor } from '@tiptap/core';
import { SvgIconComponent } from '../../../helpers/svg-icon/svg-icon.component';
import { QuerySelectComponent } from '../../common/query-select/query-select.component';
import { ColorPaletteComponent, DEFAULT_PALETTE_COLORS } from '../../common/color-palette/color-palette.component';
import { ItemRect, ItemResizeDirective } from '../board-item/item.resize.directive';
import { ItemMoveDirective, Position } from '../board-item/item.move.directive';
import { TiptapService } from '../board-item/tiptap.service';
import { BoardMainService } from '../board-main.service';
import { BoardSnapService } from '../board-snap.service';
import { BoardHistoryService } from '../board-history.service';
import { BoardSelectionService } from '../board-selection.service';
import { EditorPrefsService } from '../board-editor-prefs.service';
import { BoardDebugService } from '../board-debug.service';
import { extractPlainText } from '../../../helpers/rich-text.util';
import { NoteRenderService } from './note-render.service';
import type { SafeHtml } from '@angular/platform-browser';

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

  @HostBinding('style.--note-pad-v') get notePadV() {
    return `${this.noteOptions.padding ?? 0}px`;
  }
  @HostBinding('style.--note-pad-h') get notePadH() {
    return `${this.noteOptions.padding ?? 0}px`;
  }

  /** Per-corner border-radius (TL TR BR BL). A corner that sits flush against
   *  an aligned neighbour is squared off so touching items read as one block;
   *  every free corner keeps the normal radius. Recomputed live, so it updates
   *  while dragging/snapping. */
  // Cache for noteRadius: this getter is bound in the template and scans every
  // board element, so without a cache it costs O(N) per note per CD pass —
  // O(N²) board-wide every frame during pan/zoom. The corner-squaring only
  // depends on element geometry, so we recompute only when the board's
  // geometryVersion changes or this note's own rect moves.
  private radiusCache = '';
  private radiusVer = -1;
  private radiusSig = '';

  get noteRadius(): string {
    const a = this.tile;
    if (!a) return '0px';
    const sig = `${a.x},${a.y},${a.width},${a.height}`;
    if (this.radiusVer === this.main.geometryVersion && this.radiusSig === sig) {
      return this.radiusCache;
    }
    this.radiusVer = this.main.geometryVersion;
    this.radiusSig = sig;
    this.radiusCache = this.computeNoteRadius();
    return this.radiusCache;
  }

  private computeNoteRadius(): string {
    const a = this.tile;
    const R = (a?.width ?? 0) * 0.02;
    if (!a) return `${R}px`;
    const px = (square: boolean) => (square ? '0px' : `${R}px`);

    const aL = a.x, aR = a.x + a.width, aT = a.y, aB = a.y + a.height;
    const eps = 1; // world-px tolerance (snapped edges are equal after rounding)

    let tl = false, tr = false, br = false, bl = false;
    const items = [...this.main.notes, ...this.main.sections, ...this.main.images];
    for (const o of items) {
      if (o.id === a.id) continue;
      const oL = o.x, oR = o.x + o.width, oT = o.y, oB = o.y + o.height;
      const coversY = (y: number) => oT <= y + eps && oB >= y - eps;
      const coversX = (x: number) => oL <= x + eps && oR >= x - eps;
      const onRight = Math.abs(oL - aR) <= eps;
      const onLeft = Math.abs(oR - aL) <= eps;
      const onTop = Math.abs(oB - aT) <= eps;
      const onBottom = Math.abs(oT - aB) <= eps;

      if ((onLeft && coversY(aT)) || (onTop && coversX(aL))) tl = true;
      if ((onRight && coversY(aT)) || (onTop && coversX(aR))) tr = true;
      if ((onRight && coversY(aB)) || (onBottom && coversX(aR))) br = true;
      if ((onLeft && coversY(aB)) || (onBottom && coversX(aL))) bl = true;
    }
    return `${px(tl)} ${px(tr)} ${px(br)} ${px(bl)}`;
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
  recentTextColors: string[] = [...DEFAULT_PALETTE_COLORS];

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

  /** Final pick — prepend to the text-color recents (mirrors bg/border). */
  rememberTextColor(color: string | null): void {
    if (color === null) return;
    this.recentTextColors = [
      color,
      ...this.recentTextColors.filter(c => c !== color),
    ].slice(0, 9);
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
    const empty = this.isEditing
      ? (this.tiptap.contentEditor?.isEmpty ?? true)
      : this.plainText.trim() === '';
    return (
      this.noteBgColor === null &&
      this.noteBorderColor === null &&
      empty
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
    private main: BoardMainService,
    private snap: BoardSnapService,
    private history: BoardHistoryService,
    private selection: BoardSelectionService,
    public debug: BoardDebugService,
    private noteRender: NoteRenderService,
    private editorPrefs: EditorPrefsService,
    private cdr: ChangeDetectorRef,
  ) {}

  /** Base font size for text with no explicit size mark — the user-configurable
   *  default (Options popup). Explicit per-run fontSize marks still override it. */
  @HostBinding('style.--note-font-size') get noteBaseFontSize() {
    return `${this.editorPrefs.defaultNoteFontSize}px`;
  }

  /** True while a live tiptap editor is mounted on this note (i.e. it's being
   *  edited). Unfocused notes render static HTML instead — see renderedHtml. */
  isEditing = false;

  /** Static rendered HTML of the note content, identical to the editor. Memoized
   *  by content reference so it only re-renders when the content actually
   *  changes (the getter is bound in the template). */
  private _htmlCache: SafeHtml = '';
  private _htmlSrc: unknown = undefined;
  get renderedHtml(): SafeHtml {
    const doc = (this.tile as BoardNote).content;
    if (this._htmlSrc === doc) return this._htmlCache;
    this._htmlSrc = doc;
    this._htmlCache = this.noteRender.render(doc);
    return this._htmlCache;
  }

  /** Plain-text fallback shown when the rich-text editor is disabled for
   *  performance debugging. Derived from the note's content document.
   *  Memoized by content reference — the getter is bound in the template, so
   *  without the cache extractPlainText() would re-traverse the whole doc on
   *  every change-detection pass (96× per tick during pan). */
  private _plainTextCache = '';
  private _plainTextSrc: unknown = undefined;
  get plainText(): string {
    const doc = (this.tile as BoardNote).content;
    if (this._plainTextSrc === doc) return this._plainTextCache;
    this._plainTextSrc = doc;
    this._plainTextCache = extractPlainText(doc as any);
    return this._plainTextCache;
  }

  // Rect snapshot at the start of a move/resize gesture, for history.
  private gestureBefore: { x: number; y: number; width: number; height: number } | null = null;
  private rectSnapshot() {
    return { x: this.tile.x, y: this.tile.y, width: this.tile.width, height: this.tile.height };
  }

  get contentEditor(): Editor { return this.tiptap.contentEditor!; }

  clearSelectionHighlight() { this.tiptap.clearSelectionHighlight(); }

  focus() {
    this.enterEditMode();
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent) {
    const path = (ev.composedPath?.() ?? []) as EventTarget[];
    if (path.includes(this.host.nativeElement)) return;
    this.isFocused = false;
    this.isOptionsPanelOpen = false;
    this.navbarPinned = false;
    // Keep the selection highlight alive only while interacting with this
    // note's toolbar — the font/color pickers live in the shared navbar
    // (outside the host), and the persistent decoration is what keeps the
    // selection visible there. Any other outside click drops the highlight.
    const onToolbar = path.some(
      (t) =>
        t instanceof HTMLElement &&
        !!t.closest('.navbar-tile-controls, .table-controls, .color-palette'),
    );
    if (!onToolbar) {
      // Background panning calls preventDefault(), so the browser never clears
      // the DOM selection on its own; drop it together with the persistent
      // highlight decoration (which survives blur until told otherwise).
      const selection = window.getSelection();
      if (
        selection &&
        this.contentElement?.nativeElement?.contains(selection.anchorNode)
      ) {
        selection.removeAllRanges();
      }
      this.tiptap.clearSelectionHighlight();
      // Clicking anywhere outside this note (and not on its toolbar) ends
      // editing: save the content and tear down the live editor back to static.
      if (this.isEditing && !this.tiptap.hasActiveSelection) {
        this.exitEditMode();
        return;
      }
    }
    if (!this.isDraggingTile && !this.tiptap.hasActiveSelection) {
      this.tile.forceToRender = false;
    }
  }

  ngAfterViewInit() {
    this.debug.tickMount();
    // No editor is created up front: unfocused notes render static HTML
    // (see renderedHtml / template). A live editor is mounted only on demand in
    // enterEditMode() — so the board holds at most one contentEditable at a time
    // instead of one per note.
  }

  /** Click on the static note body: follow a board-link, else enter edit mode. */
  onStaticClick(e: MouseEvent): void {
    const path = (e.composedPath?.() ?? []) as EventTarget[];
    const linkEl = path.find(
      (p): p is HTMLElement =>
        p instanceof HTMLElement && p.hasAttribute('data-board-link'),
    );
    const targetId = linkEl?.getAttribute('data-board-link');
    if (targetId) {
      e.preventDefault();
      this.main.navigateToLink(targetId);
      return;
    }
    this.enterEditMode(e);
  }

  /** Mount a live tiptap editor on this note and focus it. No-op if already
   *  editing or if a perf-debug flag disables editors. `event` is the click that
   *  opened the editor, so the caret can land where the user clicked. */
  enterEditMode(event?: MouseEvent): void {
    if (this.isEditing) return;
    if (
      this.debug.renderFlatSquares ||
      this.debug.renderBareSquares ||
      this.debug.disableEditor
    )
      return;

    this.isEditing = true;
    this.isFocused = true;
    this.tile.forceToRender = true;
    // Render the editor host element (*ngIf="isEditing") before mounting.
    this.cdr.detectChanges();
    this.setupEditor();

    // Focus WITHOUT scrolling. The note/board are clipped (overflow: clip) so
    // they aren't scroll containers, but scrollIntoView:false also stops
    // ProseMirror from trying to reveal the caret — which otherwise scrolled an
    // ancestor and shifted the whole board (camera drift, notes culling out).
    const ed = this.tiptap.contentEditor;
    if (ed) {
      const coords = event
        ? ed.view.posAtCoords({ left: event.clientX, top: event.clientY })
        : null;
      if (coords) {
        ed.chain().setTextSelection(coords.pos).focus(undefined, { scrollIntoView: false }).run();
      } else {
        ed.chain().focus('end', { scrollIntoView: false }).run();
      }
    }
    this.requestNavbar(this.navbarContentTemplate);
  }

  /** Save content, tear down the live editor, and fall back to static HTML. */
  exitEditMode(): void {
    if (!this.isEditing) return;
    const ed = this.tiptap.contentEditor;
    // Only write back when the doc actually changed during this edit session.
    // getJSON() always returns a fresh object, so an unconditional assign would
    // trip the reference-equality content setter and mark the note dirty on
    // every click-away — re-saving notes that were never edited. Compare against
    // the snapshot taken at edit start (same editor → same normalization).
    if (ed && JSON.stringify(ed.getJSON()) !== this.editInitialJson) {
      this.tile.content = ed.getJSON();
    }
    this.editInitialJson = null;
    this.removeDocumentMouseUp?.();
    this.removeDocumentMouseUp = undefined;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.tiptap.destroyEditors();
    this.isEditing = false;
    this.isFocused = false;
    this._htmlSrc = undefined; // force a fresh static render of the new content
    if (!this.navbarPinned) this.tile.forceToRender = false;
    this.cdr.detectChanges();
  }

  /** Wire the live editor + its DOM listeners. Runs only while editing, so the
   *  content host (#contentElement) exists. */
  /** Doc JSON snapshot taken when editing starts, so exitEditMode can tell
   *  whether the content actually changed (vs. a no-op focus/blur). */
  private editInitialJson: string | null = null;

  private setupEditor(): void {
    this.tiptap.initEditors({
      tile: this.tile,
      contentElement: this.contentElement.nativeElement,
    });
    this.editInitialJson = JSON.stringify(
      this.tiptap.contentEditor?.getJSON() ?? null,
    );

    const contentRoot = this.contentElement.nativeElement as HTMLElement;
    contentRoot.addEventListener('click', (e: MouseEvent) => {
      // Clicking board-linked text jumps the camera to its target element.
      const path = (e.composedPath?.() ?? []) as EventTarget[];
      const linkEl = path.find(
        (p): p is HTMLElement =>
          p instanceof HTMLElement && p.hasAttribute('data-board-link'),
      );
      const targetId = linkEl?.getAttribute('data-board-link');
      if (targetId) {
        e.preventDefault();
        this.main.navigateToLink(targetId);
        return;
      }
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
    this.main.bumpGeometry();
  }

  onTileWorldPosChange(p: Position) {
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
    this.debug.tickDestroy();
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
    this.main.beginElementDrag([this.tile.id]);
    this.isDraggingTile = true;
    this.tile.forceToRender = true;
    this.gestureBefore = this.rectSnapshot();
  }
  onMoveEnd() {
    const wasGroup = this.selection.isGroupMoving(this.tile);
    this.main.endElementDrag();
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
