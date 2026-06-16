import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
  OnDestroy,
  HostListener,
  ViewChildren,
  QueryList,
  ChangeDetectorRef,
  AfterViewInit,
  TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../../helpers/navbar/navbar.component';
import { BoardItem } from './board-item/board-item.data';
import { BoardNote } from './board-note/board-note.data';
import { BoardNoteComponent } from './board-note/board-note.component';
import { NavbarService } from '../../helpers/navbar/navbar.service';
import { BoardMainService } from './board-main.service';
import { BoardApiService } from './board-api.service';
import { Observable, Subject, takeUntil } from 'rxjs';
import { SvgIconComponent } from '../../helpers/svg-icon/svg-icon.component';
import { Board } from './models/board.model';
import {
  ContextMenuComponent,
  ContextMenuItem,
} from '../common/context-menu/context-menu.component';
import { StorageService } from '../../service/storage.service';
import { AspectGuide, BoardSnapService, SnapGuides } from './board-snap.service';
import { BoardHistoryService } from './board-history.service';
import { BoardSelectionService } from './board-selection.service';
import { BoardSectionComponent } from './board-section/board-section.component';
import { BoardSection } from './board-section/board-section.data';
import { BoardImageComponent } from './board-image/board-image.component';
import { BoardImage } from './board-image/board-image.data';
import { extractPlainText } from '../../helpers/rich-text.util';
import {
  BoardDrawing,
  DrawPoint,
  buildStrokePath,
} from './board-draw.data';
import { ColorPaletteComponent } from '../common/color-palette/color-palette.component';
import { BoardDrawingComponent } from './board-drawing/board-drawing.component';
import { BoardAiService } from './board-ai.service';
import { BoardLinkService } from './board-link.service';
import type {
  FactCheckResult,
  QuizQuestion,
  QuizGenerateResponse,
} from './models/ai.model';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule,
    NavbarComponent,
    FormsModule,
    BoardNoteComponent,
    BoardSectionComponent,
    BoardImageComponent,
    SvgIconComponent,
    ContextMenuComponent,
    ColorPaletteComponent,
    BoardDrawingComponent,
  ],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss'],
})
export class BoardComponent implements OnInit, AfterViewInit, OnDestroy {
  SELECTED_BOARD_KEY = 'SELECTED_BOARD' as const;
  @ViewChild('board', { static: true }) boardRef!: ElementRef<HTMLDivElement>;
  @ViewChild('viewport', { static: false })
  viewportRef!: ElementRef<HTMLDivElement>;
  @ViewChild('navbar', { static: true, read: ElementRef })
  navbarRef!: ElementRef;
  @ViewChild('defaultNavbarTemplate', { static: true })
  defaultNavbarTemplate!: TemplateRef<any>;
  @ViewChild('drawNavbarTemplate', { static: true })
  drawNavbarTemplate!: TemplateRef<any>;
  @ViewChild('selectionNavbarTemplate', { static: true })
  selectionNavbarTemplate!: TemplateRef<any>;
  @ViewChild('aiNavbarTemplate', { static: true })
  aiNavbarTemplate!: TemplateRef<any>;
  @ViewChild('quizNavbarTemplate', { static: true })
  quizNavbarTemplate!: TemplateRef<any>;
  @ViewChildren(BoardNoteComponent)
  noteComponents!: QueryList<BoardNoteComponent>;
  @ViewChild('newBoardNameInput', { static: false })
  nameInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('searchInput', { static: false })
  searchInputRef?: ElementRef<HTMLInputElement>;

  boards$!: Observable<Board[] | null>;
  snapGuides$!: Observable<SnapGuides>;
  aspectGuide$!: Observable<AspectGuide | null>;
  isSearchOpen = true;
  isCreateOpen = false;
  newBoardName = '';
  newBoardNameTouched = false;
  newBoardDescription = '';
  searchQuery = '';
  zoom = 1;
  private readonly destroy$ = new Subject<void>();

  notes: BoardNote[] = [];
  notesMap: Map<string, BoardItem> = new Map();
  sections: BoardSection[] = [];
  images: BoardImage[] = [];
  /** Elements marked for deletion — sent to server on next save. */
  pendingDeletes: BoardItem[] = [];

  // ── Board-link picking (link selected note text to an element) ─────────────
  /** True while choosing the element a text selection should link to. */
  linkPicking = false;
  /** The element currently chosen as the link target (awaiting confirm). */
  linkCandidate: BoardItem | null = null;
  /** Enter-hold-to-confirm progress (0–1). */
  linkEnterProgress = 0;
  private linkEnterHolding = false;
  private linkEnterStart = 0;
  private linkEnterTimer: ReturnType<typeof setInterval> | null = null;
  private readonly LINK_ENTER_HOLD_MS = 2000;

  // ── Draw mode (toggle with B) ──────────────────────────────────────────────
  drawMode = false;
  drawTool: 'pen' | 'eraser' = 'pen';
  drawColor = '#ffd54f';
  drawWidth = 4; // baseline thickness in *screen* px; world width = this / zoom
  isDrawPaletteVisible = false;
  drawings: BoardDrawing[] = [];
  // In-progress pen stroke (absolute world points), rendered in the capture
  // overlay until it's committed to a BoardDrawing element on pointer up.
  activePoints: DrawPoint[] = [];
  activeStrokeD = '';
  drawing = false;
  // Brush cursor preview (screen px relative to the board container).
  cursorX = 0;
  cursorY = 0;
  cursorInside = false;
  // Hold Space to temporarily pan instead of draw.
  spaceHeld = false;
  // Snapshot of the stroke list taken when an eraser drag starts, so the whole
  // drag collapses into a single undo step.
  private eraserBefore: BoardDrawing[] | null = null;

  get activeStrokeWidth(): number {
    return this.drawWidth / this.mainBoardService.zoom;
  }

  /** Brush preview diameter in screen px. Pen world width is drawWidth/zoom, so
   *  on screen it's exactly drawWidth; the eraser shows a fixed ring. */
  get brushCursorSize(): number {
    return this.drawTool === 'eraser' ? 18 : Math.max(this.drawWidth, 4);
  }

  selectedBoard: Board | null = null;
  private activeNavbarNote: BoardItem | null = null;

  deleteBoardPending: { id: string; name: string } | null = null;
  deleteConfirmInput = '';

  get deleteConfirmChars(): Array<{
    char: string;
    status: 'ghost' | 'correct' | 'wrong';
  }> {
    if (!this.deleteBoardPending) return [];
    const name = this.deleteBoardPending.name;
    const typed = this.deleteConfirmInput;
    const len = Math.max(name.length, typed.length);
    return Array.from({ length: len }, (_, i) => {
      const nameChar = name[i] ?? '';
      const typedChar = typed[i];
      if (typedChar === undefined)
        return { char: nameChar, status: 'ghost' as const };
      if (typedChar === nameChar)
        return { char: typedChar, status: 'correct' as const };
      return { char: typedChar, status: 'wrong' as const };
    });
  }

  get deleteConfirmValid(): boolean {
    return (
      !!this.deleteBoardPending &&
      this.deleteConfirmInput === this.deleteBoardPending.name
    );
  }

  ctxMenu = {
    visible: false,
    x: 0,
    y: 0,
    items: [] as ContextMenuItem[],
  };

  private lastWorldX = 0;
  private lastWorldY = 0;
  private zCounter = 1;
  private sectionZCounter = 1;

  bringToFront(tile: BoardItem) {
    tile.zIndex = ++this.zCounter;
  }

  // Sections stack among themselves; the sections layer always renders
  // below the notes layer, so they can never cover a note.
  bringSectionToFront(section: BoardItem) {
    section.zIndex = ++this.sectionZCounter;
  }

  private buildDefaultNavbarContext() {
    return {
      getIsSearchOpen: () => this.isSearchOpen,
      toggleSearch: () => this.toggleSearchState(),
    };
  }

  onNoteNavbarChange(event: { template: TemplateRef<any>; context: any }) {
    if (!event?.template) return;

    const nextTile = (event.context as any)?.tile as BoardItem | undefined;
    if (nextTile && nextTile !== this.activeNavbarNote) {
      if (this.activeNavbarNote) {
        this.activeNavbarNote.forceToRender = false;
      }
      nextTile.forceToRender = true;
      this.activeNavbarNote = nextTile;
    }

    this.navBarService.setTemplate(event.template, event.context);
  }

  private onBackgroundMouseDown() {
    this.closeContextMenu();
    // While drawing (incl. Space-pan), keep the draw bar in the navbar.
    if (this.drawMode) {
      this.navBarService.setTemplate(this.drawNavbarTemplate);
      return;
    }
    if (this.activeNavbarNote) {
      this.activeNavbarNote.forceToRender = false;
      this.activeNavbarNote = null;
    }
    this.selection.clear();
    this.navBarService.setTemplate(
      this.defaultNavbarTemplate,
      this.buildDefaultNavbarContext(),
    );
  }

  private resetState(): void {
    this.notes.length = 0;
    this.notesMap.clear();
    this.sections.length = 0;
    this.images.length = 0;
    this.drawings.length = 0;
    this.pendingDeletes.length = 0;
    this.selection.clear();
    this.history.clear();
  }

  get isCreateNameValid(): boolean {
    return this.newBoardName.trim().length > 0;
  }

  constructor(
    private navBarService: NavbarService,
    private cdr: ChangeDetectorRef,
    private mainBoardService: BoardMainService,
    private boardSearchService: BoardApiService,
    private storageSerice: StorageService,
    private snapService: BoardSnapService,
    private history: BoardHistoryService,
    private selection: BoardSelectionService,
    private aiService: BoardAiService,
    private linkService: BoardLinkService,
  ) {
    this.boards$ = this.boardSearchService.boards$;
    this.snapGuides$ = this.snapService.guides$;
    this.aspectGuide$ = this.snapService.aspectGuide$;
    this.history.onChange = () => this.cdr.detectChanges();

    // Wire serializable history callbacks
    this.history.getItemById = (id: string) => this.itemByIdMap(id);
    this.history.onRestoreDelete = (id) => this.restoreDeletedItem(id);
    this.history.onRedoDelete = (id) => this.redoDeletedItem(id);
    this.history.onUndoCreate = (id) => this.undoCreateItem(id);
    this.history.onRedoCreate = (id) => this.redoCreateItem(id);
  }

  /** Look up any element by id across all arrays. */
  private itemByIdMap(id: string): BoardItem | null {
    return (
      this.notesMap.get(id) ??
      this.sections.find((s) => s.id === id) ??
      this.images.find((i) => i.id === id) ??
      this.drawings.find((d) => d.id === id) ??
      null
    ) as BoardItem | null;
  }

  // ── History callbacks (undo/redo restore/delete/create) ──────────────────

  /** Find item in pendingDeletes by id and restore it to the correct list. */
  private restoreDeletedItem(id: string): void {
    const item = this.pendingDeletes.find((el) => el.id === id);
    if (!item) return;
    this.pendingDeletes.splice(this.pendingDeletes.indexOf(item), 1);
    if (item instanceof BoardNote) this.addToList(item, this.notes, this.notesMap);
    else if (item instanceof BoardSection) this.addToList(item, this.sections);
    else if (item instanceof BoardImage) this.addToList(item, this.images);
    else if (item instanceof BoardDrawing) this.addToList(item, this.drawings);
  }

  /** Move item from active list to pendingDeletes. */
  private redoDeletedItem(id: string): void {
    const item = this.itemByIdMap(id);
    if (!item) return;
    this.pendingDeletes.push(item);
    if (item instanceof BoardNote) this.removeFromList(item, this.notes, this.notesMap);
    else if (item instanceof BoardSection) this.removeFromList(item, this.sections);
    else if (item instanceof BoardImage) this.removeFromList(item, this.images);
    else if (item instanceof BoardDrawing) this.removeFromList(item, this.drawings);
  }

  /** Move created item to pendingDeletes. */
  private undoCreateItem(id: string): void {
    this.redoDeletedItem(id);
  }

  /** Restore a created item from pendingDeletes. */
  private redoCreateItem(id: string): void {
    this.restoreDeletedItem(id);
  }

  // ── Element list mutation helpers (used by history commands) ───────────────

  private addToList(item: BoardItem, list: BoardItem[], map?: Map<string, BoardItem>): void {
    if (!list.includes(item)) list.push(item);
    map?.set(item.id, item);
    this.cdr.detectChanges();
  }

  private removeFromList(item: BoardItem, list: BoardItem[], map?: Map<string, BoardItem>): void {
    const i = list.indexOf(item);
    if (i >= 0) list.splice(i, 1);
    map?.delete(item.id);
    this.cdr.detectChanges();
  }

  private recordCreate(item: BoardItem, _list?: BoardItem[], _map?: Map<string, BoardItem>): void {
    this.history.pushCreate([item.id]);
  }

  resetNewBoardForm() {
    this.newBoardName = '';
    this.newBoardDescription = '';
  }

  toggleSearchState() {
    this.isSearchOpen = !this.isSearchOpen;
    if (this.isSearchOpen) {
      this.focusSearchInput();
    }
  }

  toggleCreateState() {
    const willOpen = !this.isCreateOpen;
    this.isCreateOpen = willOpen;
    if (willOpen) {
      this.focusCreateNameInput();
    } else {
      this.focusSearchInput();
    }
  }

  private focusSearchInput() {
    setTimeout(() => this.searchInputRef?.nativeElement?.focus());
  }

  private focusCreateNameInput() {
    setTimeout(() => this.nameInputRef?.nativeElement?.focus());
  }

  clearSearchQuery() {
    this.searchQuery = '';
    this.focusSearchInput();
  }

  onSearchWindowClick(event: MouseEvent) {
    if (this.isCreateOpen) return;

    const path = (event.composedPath?.() ?? []) as EventTarget[];
    const isInteractive = (target: EventTarget) =>
      target instanceof HTMLElement &&
      ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(target.tagName);

    if (path.some(isInteractive)) return;
    this.focusSearchInput();
  }

  openCreateFromSearch(boards: Board[] | null | undefined) {
    this.isCreateOpen = true;
    const query = this.searchQuery.trim();
    if (!query) {
      this.focusCreateNameInput();
      return;
    }

    const matches = this.filteredBoards(boards).some(
      (b) => String(b?.name ?? '').toLowerCase() === query.toLowerCase(),
    );
    if (!matches) {
      this.newBoardName = query;
      this.newBoardNameTouched = false;
    }
    this.focusCreateNameInput();
  }

  onSearchEnter(boards: Board[] | null | undefined) {
    const query = this.searchQuery.trim();
    if (!query) return;

    const hasResults = this.filteredBoards(boards).length > 0;
    if (!hasResults) {
      this.openCreateFromSearch(boards);
    }
  }

  async selectBoard(id: string) {
    try {
      const board = await this.boardSearchService.getBoard(id);
      this.selectedBoard = board;

      const defaultNavbarContext = this.buildDefaultNavbarContext();

      // Drop history from previous board, then reset local state
      if (this.selectedBoard) this.history.dropStored();
      this.resetState();

      const elements = await this.boardSearchService.getBoardElements(board.id);
      for (const note of elements.notes) {
        this.addBoardNote(note);
      }
      for (const section of elements.sections) {
        this.addBoardSection(section);
      }
      for (const image of elements.images) {
        this.addBoardImage(image);
      }
      for (const drawing of elements.drawings) {
        this.addBoardDrawing(drawing);
      }

      // Restore undo/redo history from browser storage (survives page refresh)
      this.history.restore();

      await Promise.resolve();
      this.cdr.detectChanges();

      this.mainBoardService.initialize({
        boardRef: this.boardRef,
        viewportRef: this.viewportRef,
        notes: this.notes,
        sections: this.sections,
        images: this.images,
        drawings: this.drawings,
        noteComponents: this.noteComponents?.toArray() ?? [],
        cdr: this.cdr,
        onBackgroundMouseDown: () =>
          this.navBarService.setTemplate(
            this.defaultNavbarTemplate,
            defaultNavbarContext,
          ),
      });
      this.isSearchOpen = false;

      this.storageSerice.setVariable(this.SELECTED_BOARD_KEY, id);

      this.navBarService.setTemplate(
        this.defaultNavbarTemplate,
        defaultNavbarContext,
      );
      if (this.notes.length > 0) {
        this.mainBoardService.centerOnItem(this.notes[0]);
      }
    } catch (e) {
      console.error('Failed to load board', e);
    }
  }

  filteredBoards(boards: any[] | null | undefined): any[] {
    const safeBoards = boards ?? [];
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return safeBoards;

    return safeBoards.filter((b) =>
      String(b?.name ?? '')
        .toLowerCase()
        .includes(query),
    );
  }

  isItemVisible(item: BoardItem): boolean {
    return this.mainBoardService
      ? this.mainBoardService.isItemVisible(item)
      : false;
  }

  moveToItem(item: BoardItem) {
    if (!this.mainBoardService) return;
    this.mainBoardService.moveToItem(item);
  }

  centerOnItem(item: BoardItem) {
    if (!this.mainBoardService) return;
    this.mainBoardService.centerOnItem(item);
  }

  onNoteDblClick(event: MouseEvent, item: BoardItem): void {
    const path = (event.composedPath?.() ?? []) as EventTarget[];
    const tileEl = path.find(
      (p): p is HTMLElement =>
        p instanceof HTMLElement &&
        p.tagName === 'APP-BOARD-NOTE',
    ) as HTMLElement | undefined;
    if (!tileEl) return;
    const r = tileEl.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    ) {
      return;
    }
    this.centerOnItem(item);
  }

  openDeleteBoardConfirm(board: Board, event: MouseEvent) {
    event.stopPropagation();
    this.deleteBoardPending = { id: board.id, name: board.name };
    this.deleteConfirmInput = '';
  }

  cancelDeleteBoard() {
    this.deleteBoardPending = null;
    this.deleteConfirmInput = '';
  }

  async confirmDeleteBoard() {
    if (!this.deleteConfirmValid || !this.deleteBoardPending) return;
    const { id } = this.deleteBoardPending;
    this.deleteBoardPending = null;
    this.deleteConfirmInput = '';
    await this.boardSearchService.deleteBoard(id);
    if (this.selectedBoard?.id === id) {
      this.selectedBoard = null;
      this.resetState();
    }
  }

  setRowHoverX(event: MouseEvent) {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    el.style.setProperty('--hover-x', String(x));
  }

  clearRowHoverX(event: MouseEvent) {
    (event.currentTarget as HTMLElement).style.removeProperty('--hover-x');
  }

  async submitNewBoardRequest() {
    if (!this.isCreateNameValid) {
      return;
    }
    var viewportWidth: number | null = null;
    var viewportHeight: number | null = null;

    if (this.boardRef) {
      const board = this.boardRef.nativeElement as HTMLElement;
      viewportWidth = board.offsetWidth * 0.25;
      viewportHeight = board.offsetHeight * 0.8;
    }

    const board = await this.boardSearchService.createBoard(
      this.newBoardName,
      this.newBoardDescription,
      viewportWidth,
      viewportHeight,
    );
    if (board != null) {
      this.resetNewBoardForm();
      this.isCreateOpen = false;
      this.selectBoard(board.id);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent) {
    const mod = event.ctrlKey || event.metaKey;
    // Link-picking mode owns Escape (cancel) and Enter-hold (confirm).
    if (this.linkPicking) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.cancelLink();
        return;
      }
      if (event.key === 'Enter' && this.linkCandidate) {
        event.preventDefault();
        this.startLinkEnterHold();
        return;
      }
    }
    // Toggle draw mode with a bare "b" — but not while typing in a note/input.
    if (!mod && !event.altKey && (event.key === 'b' || event.key === 'B')) {
      if (isTextEditingActive()) return;
      event.preventDefault();
      this.toggleDrawMode();
      return;
    }
    if (this.drawMode && event.key === 'Escape') {
      event.preventDefault();
      this.toggleDrawMode();
      return;
    }
    // Hold Space in draw mode to pan instead of draw.
    if (this.drawMode && event.code === 'Space') {
      if (isTextEditingActive()) return;
      event.preventDefault();
      if (!this.spaceHeld) {
        this.spaceHeld = true;
        this.mainBoardService.drawMode = false; // let the board pan
        this.cdr.detectChanges();
      }
      return;
    }
    if (mod && (event.key === 's' || event.key === 'S')) {
      event.preventDefault();
      this.saveBoard();
      return;
    }
    if (mod && (event.key === 'f' || event.key === 'F')) {
      event.preventDefault();
      this.openGlobalSearch();
      return;
    }
    // Undo / redo for board actions. While a text editor is focused, let tiptap
    // handle Ctrl+Z/Y itself (its keymap fires on the editor) and do nothing here.
    if (mod && (event.key === 'z' || event.key === 'Z')) {
      if (isTextEditingActive()) return;
      event.preventDefault();
      if (event.shiftKey) this.history.redo();
      else this.history.undo();
      return;
    }
    if (mod && (event.key === 'y' || event.key === 'Y')) {
      if (isTextEditingActive()) return;
      event.preventDefault();
      this.history.redo();
    }
    // Delete key — delete selected elements
    if (event.key === 'Delete' || event.key === 'Del') {
      if (isTextEditingActive()) return;
      event.preventDefault();
      this.deleteSelectedPress();
    }
  }

  @HostListener('window:keyup', ['$event'])
  onGlobalKeyup(event: KeyboardEvent) {
    if (event.key === 'Enter' && this.linkEnterProgress > 0) {
      this.stopLinkEnterHold();
    }
    if (event.code === 'Space' && this.spaceHeld) {
      this.spaceHeld = false;
      if (this.drawMode) this.mainBoardService.drawMode = true;
      this.cdr.detectChanges();
    }
    // Release delete hold
    if (event.key === 'Delete' || event.key === 'Del') {
      this.deleteSelectedRelease();
    }
  }

  // ── Global content search (notes text + section names) ───────────────────

  globalSearchQuery = '';
  globalSearchOpen = false;
  globalSearchResults: Array<{
    item: BoardItem;
    kind: 'note' | 'section';
    match: { before: string; hit: string; after: string };
  }> = [];

  // Extracted plain text per item, invalidated by document reference —
  // tiptap produces a new JSON object on every edit, so a reference compare
  // is a correct and cheap dirty check.
  private searchTextCache = new WeakMap<
    BoardItem,
    { src: unknown; raw: string; lower: string }
  >();

  private itemSearchText(item: BoardItem, doc: unknown): { raw: string; lower: string } {
    const cached = this.searchTextCache.get(item);
    if (cached && cached.src === doc) return cached;
    const raw = extractPlainText(doc as any).replace(/\s+/g, ' ').trim();
    const entry = { src: doc, raw, lower: raw.toLowerCase() };
    this.searchTextCache.set(item, entry);
    return entry;
  }

  openGlobalSearch() {
    // Make sure the default navbar (which hosts the search box) is shown.
    this.navBarService.setTemplate(
      this.defaultNavbarTemplate,
      this.buildDefaultNavbarContext(),
    );
    this.isSearchOpen = false;
    this.globalSearchOpen = true;
    this.cdr.detectChanges();
    (document.querySelector('.global-search-input') as HTMLInputElement | null)?.focus();
  }

  closeGlobalSearch() {
    this.globalSearchOpen = false;
    this.globalSearchQuery = '';
    this.globalSearchResults = [];
  }

  onGlobalSearchInput() {
    const q = this.globalSearchQuery.trim().toLowerCase();
    if (!q) {
      this.globalSearchResults = [];
      return;
    }

    const results: typeof this.globalSearchResults = [];
    const MAX_RESULTS = 8;

    for (const section of this.sections) {
      if (results.length >= MAX_RESULTS) break;
      const { raw, lower } = this.itemSearchText(section, section.name);
      const idx = lower.indexOf(q);
      if (idx >= 0) {
        results.push({ item: section, kind: 'section', match: this.searchMatch(raw, idx, q.length) });
      }
    }
    for (const note of this.notes) {
      if (results.length >= MAX_RESULTS) break;
      const { raw, lower } = this.itemSearchText(note, note.content);
      const idx = lower.indexOf(q);
      if (idx >= 0) {
        results.push({ item: note, kind: 'note', match: this.searchMatch(raw, idx, q.length) });
      }
    }
    this.globalSearchResults = results;
  }

  // A few chars of context before the match (empty if the match is at the
  // start), the matched text itself (highlighted in the template), and the
  // full remainder. The trailing text is clipped by the element width in CSS.
  private searchMatch(
    text: string,
    idx: number,
    matchLen: number,
  ): { before: string; hit: string; after: string } {
    const PREFIX = 8;
    const start = Math.max(0, idx - PREFIX);
    return {
      before: (start > 0 ? '…' : '') + text.slice(start, idx),
      hit: text.slice(idx, idx + matchLen),
      after: text.slice(idx + matchLen),
    };
  }

  goToGlobalResult(result: { item: BoardItem; kind: 'note' | 'section' }) {
    this.closeGlobalSearch();
    if (result.kind === 'note') {
      this.mainBoardService.moveToItem(result.item);
    } else {
      this.bringSectionToFront(result.item);
      result.item.forceToRender = true;
      this.mainBoardService.centerOnItem(result.item);
      Promise.resolve().then(() => (result.item.forceToRender = false));
    }
    this.cdr.detectChanges();
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDownForSearch(event: MouseEvent) {
    if (!this.globalSearchOpen) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.global-search')) return;
    this.globalSearchOpen = false;
  }

  ngOnInit() {
    this.mainBoardService.zoom$
      .pipe(takeUntil(this.destroy$))
      .subscribe((z) => {
        this.zoom = z;
        this.showCameraZoom(this.zoom);
        this.cdr.detectChanges();
      });

    // Pan runs outside Angular zone, so camera changes never trigger CD on their own.
    // Without this, tiles that scroll into view stay hidden until the next zoom event.
    this.mainBoardService.camera$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.showCameraPos(
          this.mainBoardService.cameraX,
          this.mainBoardService.cameraY,
        );
        this.cdr.detectChanges();
      });

    // Selection changes drive the merge/unmerge navbar.
    this.selection.changed$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateSelectionNavbar();
        this.cdr.detectChanges();
      });

    this.linkService.picking$
      .pipe(takeUntil(this.destroy$))
      .subscribe((picking) => {
        this.linkPicking = picking;
        if (!picking) {
          this.linkCandidate = null;
          this.stopLinkEnterHold();
        }
        this.cdr.detectChanges();
      });

    this.mainBoardService.contextMenu$
      .pipe(takeUntil(this.destroy$))
      .subscribe((req) => {
        this.lastWorldX = req.worldX;
        this.lastWorldY = req.worldY;

        this.ctxMenu.x = req.clientX;
        this.ctxMenu.y = req.clientY;
        this.ctxMenu.items = [
          { id: 'create-note', label: 'Create note here' },
          { id: 'create-section', label: 'Create section here' },
          { id: 'save', label: 'Save board', shortcut: 'Ctrl+S' },
        ];
        this.ctxMenu.visible = true;
      });
    if (this.storageSerice.hasKey(this.SELECTED_BOARD_KEY)) {
      this.isSearchOpen = false;
      this.selectBoard(
        this.storageSerice.getVariable(this.SELECTED_BOARD_KEY)!!,
      );
    }
  }

  ngOnDestroy(): void {
    this.stopSaveDots();
    this.stopDeleteHold();
    this.stopLinkEnterHold();
    if (this.cameraZoomTimer !== null) { clearTimeout(this.cameraZoomTimer); this.cameraZoomTimer = null; }
    if (this.cameraPosTimer !== null) { clearTimeout(this.cameraPosTimer); this.cameraPosTimer = null; }
    // Clean up group drag listeners if mid-drag
    window.removeEventListener('pointermove', this.onGroupDragMove);
    window.removeEventListener('pointerup', this.onGroupDragUp);
    window.removeEventListener('pointercancel', this.onGroupDragUp);
    const boardEl = this.boardRef?.nativeElement;
    boardEl?.removeEventListener('pointerdown', this.onBoardPointerDownCapture as EventListener, true);
    boardEl?.removeEventListener('click', this.onBoardClickCapture as EventListener, true);
    window.removeEventListener('mousemove', this.trackMouse);
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit() {
    this.boardSearchService.refreshBoards();

    const defaultNavbarContext = this.buildDefaultNavbarContext();

    this.mainBoardService.initialize({
      boardRef: this.boardRef,
      viewportRef: this.viewportRef,
      notes: this.notes,
      sections: this.sections,
      images: this.images,
      drawings: this.drawings,
      noteComponents: this.noteComponents?.toArray() ?? [],
      cdr: this.cdr,
      zoom: this.zoom,
      cameraX: 0,
      cameraY: 0,
      onBackgroundMouseDown: () => this.onBackgroundMouseDown(),
    });

    this.navBarService.setTemplate(
      this.defaultNavbarTemplate,
      defaultNavbarContext,
    );
    this.mainBoardService.setupListeners();

    // Ctrl+click selection is handled centrally (capture phase) so it works for
    // every element type without each component knowing about it.
    const boardEl = this.boardRef.nativeElement;
    boardEl.addEventListener('pointerdown', this.onBoardPointerDownCapture as EventListener, true);
    boardEl.addEventListener('click', this.onBoardClickCapture as EventListener, true);
    window.addEventListener('mousemove', this.trackMouse, { passive: true });

    if (this.notes.length > 0) {
      this.mainBoardService.centerOnItem(this.notes[0]);
    }

    Promise.resolve().then(() => this.mainBoardService.updateBoard());
  }

  addBoardNote(el: import('./models/element.model').Note) {
    const note = BoardNote.fromNoteElement(el);
    this.notes.push(note);
    this.notesMap.set(note.id, note);
  }

  addBoardSection(el: import('./models/element.model').Section) {
    const section = BoardSection.fromSectionElement(el);
    this.sections.push(section);
  }

  addBoardImage(el: import('./models/element.model').Image) {
    const image = BoardImage.fromImageElement(el);
    this.images.push(image);
  }

  addBoardDrawing(el: import('./models/element.model').Drawing) {
    const drawing = BoardDrawing.fromDrawingElement(el);
    this.drawings.push(drawing);
  }

  private createSectionAt(worldX: number, worldY: number): void {
    if (!this.selectedBoard) return;

    const zoom = this.mainBoardService.zoom;
    const width = 1350 / zoom;
    const height = 900 / zoom;
    const section = BoardSection.newSection(
      worldX - width / 2,
      worldY - height / 2,
      width,
      height,
    );

    this.sections.push(section);
    this.bringSectionToFront(section);
    this.recordCreate(section, this.sections);
    this.cdr.detectChanges();
  }

  onDeleteSection(section: BoardSection): void {
    this.pendingDeletes.push(section);
    this.recordDelete(section, this.sections);
    this.removeFromList(section, this.sections);
  }

  private createNoteAt(worldX: number, worldY: number): void {
    if (!this.selectedBoard) return;

    const zoom = this.mainBoardService.zoom;
    const size = 450 / zoom;
    const note = BoardNote.newNote(
      worldX - size / 2,
      worldY - size / 2,
      size,
      size,
    );

    this.notes.push(note);
    this.notesMap.set(note.id, note);
    this.recordCreate(note, this.notes, this.notesMap);
    this.centerOnItem(note);

    Promise.resolve().then(() => {
      this.cdr.detectChanges();
      this.mainBoardService.noteComponents = this.noteComponents?.toArray() ?? [];
      const noteComp = this.noteComponents?.find(c => c.tile.id === note.id);
      noteComp?.focus();
    });
  }

  onDeleteImage(image: BoardImage): void {
    this.pendingDeletes.push(image);
    this.recordDelete(image, this.images);
    this.removeFromList(image, this.images);
  }

  onDeleteDrawing(drawing: BoardDrawing): void {
    if (this.selection.isSelected(drawing)) {
      this.selection.set(this.selection.items.filter((i) => i !== drawing));
    }
    this.pendingDeletes.push(drawing);
    this.recordDelete(drawing, this.drawings);
    this.removeFromList(drawing, this.drawings);
  }

  /** Records an element removal so Ctrl+Z restores it. */
  private recordDelete(item: BoardItem, _list?: BoardItem[], _map?: Map<string, BoardItem>): void {
    this.history.pushDelete([item.id]);
  }

  // ── Paste image (Ctrl+V) ──────────────────────────────────────────────────

  @HostListener('window:paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    if (!this.selectedBoard) return;
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (!file) continue;
        event.preventDefault();
        this.addImageFromFile(file);
        return;
      }
    }
  }

  /** Last known mouse position (screen px), so a pasted image drops under the
   *  cursor instead of viewport center. */
  private lastMouseClientX = 0;
  private lastMouseClientY = 0;
  private trackMouse = (e: MouseEvent): void => {
    this.lastMouseClientX = e.clientX;
    this.lastMouseClientY = e.clientY;
  };

  /** Upload an image blob and place it centered on the cursor. */
  private async addImageFromFile(file: File): Promise<void> {
    if (!this.selectedBoard) return;
    const boardId = this.selectedBoard.id;

    const result = await this.boardSearchService.uploadImage(
      boardId,
      file,
      file.name || 'paste.png',
    );
    if (!result) return;

    const MAX_SCREEN = 600;
    let sw = result.width || 400;
    let sh = result.height || 300;
    if (sw > MAX_SCREEN || sh > MAX_SCREEN) {
      const k = Math.min(MAX_SCREEN / sw, MAX_SCREEN / sh);
      sw *= k;
      sh *= k;
    }

    const zoom = this.mainBoardService.zoom;
    const worldW = sw / zoom;
    const worldH = sh / zoom;

    const board = this.boardRef.nativeElement as HTMLElement;
    const rect = board.getBoundingClientRect();
    // Drop at the cursor when its position is known and inside the board;
    // otherwise fall back to viewport center.
    const mouseInside =
      this.lastMouseClientX >= rect.left &&
      this.lastMouseClientX <= rect.right &&
      this.lastMouseClientY >= rect.top &&
      this.lastMouseClientY <= rect.bottom;
    const center = mouseInside
      ? this.screenToWorld(this.lastMouseClientX, this.lastMouseClientY)
      : this.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);

    const image = BoardImage.newImage(
      center.x - worldW / 2,
      center.y - worldH / 2,
      worldW,
      worldH,
      result.url,
    );
    image.setNatural(result.width, result.height);

    this.images.push(image);
    this.bringToFront(image);
    this.recordCreate(image, this.images);
    this.cdr.detectChanges();
  }

  onDeleteNote(tile: BoardItem): void {
    this.pendingDeletes.push(tile);
    this.recordDelete(tile, this.notes, this.notesMap);
    this.removeFromList(tile, this.notes, this.notesMap);
  }

  private screenToWorld(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const board = this.boardRef.nativeElement as HTMLElement;
    const rect = board.getBoundingClientRect();
    const zoom = this.mainBoardService.zoom;
    return {
      x: (clientX - rect.left) / zoom + this.mainBoardService.cameraX,
      y: (clientY - rect.top) / zoom + this.mainBoardService.cameraY,
    };
  }

  /** Sync all local changes to the server. Called only on Ctrl+S.
   *  All mutations are local-only until this runs. */
  async saveBoard(): Promise<void> {
    if (!this.selectedBoard) return;

    this.setSaveStatus('saving');

    const boardId = this.selectedBoard.id;
    const allItems: BoardItem[] = [
      ...this.notes,
      ...this.sections,
      ...this.images,
      ...this.drawings,
    ];

    try {
      // 1. Delete elements marked for removal (sent to server, then dropped)
      if (this.pendingDeletes.length > 0) {
        const toDelete = this.pendingDeletes.filter((d) => d.serverId);
        if (toDelete.length > 0) {
          await Promise.all(
            toDelete.map((d) =>
              this.boardSearchService.deleteElement(d).catch(() => {}),
            ),
          );
        }
        this.pendingDeletes.length = 0;
      }

      // 2. Create new elements (no serverId yet)
      const toCreate = allItems.filter((t) => !t.serverId);
      if (toCreate.length > 0) {
        const created = await Promise.all(
          toCreate.map((t) =>
            this.boardSearchService.createElement(t, boardId),
          ),
        );
        for (let i = 0; i < created.length; i++) {
          if (created[i]) toCreate[i].serverId = created[i]!.id;
        }
      }

      // 3. Update dirty existing elements
      const toUpdate = allItems.filter(
        (t) => t.serverId && t.toBeUpdated(),
      );
      if (toUpdate.length > 0) {
        await Promise.all(
          toUpdate.map((t) => this.boardSearchService.saveElement(t)),
        );
      }

      this.setSaveStatus('saved');
    } catch {
      this.setSaveStatus('failed');
    }
  }

  // ── Save indicator helpers ────────────────────────────────────────────────

  private setSaveStatus(s: typeof this.saveStatus): void {
    this.saveStatus = s;
    this.stopSaveDots();

    if (s === 'saving') {
      this.saveDots = 1;
      this.saveDotsTimer = setInterval(() => {
        this.saveDots = (this.saveDots % 3) + 1;
        this.cdr.detectChanges();
      }, 400);
    } else {
      // Auto-hide success/failure after 2.5 s
      setTimeout(() => {
        if (this.saveStatus === s) this.saveStatus = 'idle';
        this.cdr.detectChanges();
      }, 2500);
    }
    this.cdr.detectChanges();
  }

  private stopSaveDots(): void {
    if (this.saveDotsTimer !== null) {
      clearInterval(this.saveDotsTimer);
      this.saveDotsTimer = null;
    }
  }

  get saveDotsText(): string {
    return '.'.repeat(this.saveDots);
  }

  // ── Camera info (top-left, fades after 1s) ───────────────────────────────

  /** Separate timers so zoom and position fade independently. */
  cameraZoomVisible = false;
  cameraPosVisible = false;
  cameraZoomVal: number | null = null;
  cameraPosVal: { x: number; y: number } | null = null;
  private cameraZoomTimer: ReturnType<typeof setTimeout> | null = null;
  private cameraPosTimer: ReturnType<typeof setTimeout> | null = null;

  /** Zoom % with one decimal when below 1×, integer otherwise. */
  get cameraZoomPct(): string {
    if (this.cameraZoomVal === null) return '';
    const pct = this.cameraZoomVal * 100;
    return pct >= 1 ? pct.toFixed(0) : pct.toFixed(1);
  }

  private showCameraZoom(zoom: number): void {
    this.cameraZoomVal = zoom;
    this.cameraZoomVisible = true;
    if (this.cameraZoomTimer !== null) clearTimeout(this.cameraZoomTimer);
    this.cameraZoomTimer = setTimeout(() => {
      this.cameraZoomVisible = false;
      this.cameraZoomTimer = null;
      this.cdr.detectChanges();
    }, 1500);
    this.cdr.detectChanges();
  }

  private showCameraPos(camX: number, camY: number): void {
    this.cameraPosVal = { x: camX, y: camY };
    this.cameraPosVisible = true;
    if (this.cameraPosTimer !== null) clearTimeout(this.cameraPosTimer);
    this.cameraPosTimer = setTimeout(() => {
      this.cameraPosVisible = false;
      this.cameraPosTimer = null;
      this.cdr.detectChanges();
    }, 1500);
    this.cdr.detectChanges();
  }

  // ── Draw mode ──────────────────────────────────────────────────────────────

  toggleDrawMode(): void {
    this.drawMode = !this.drawMode;
    this.spaceHeld = false;
    this.cursorInside = false;
    // Suppress board pan/context-menu while drawing (see BoardMainService).
    this.mainBoardService.drawMode = this.drawMode;
    if (this.drawMode) {
      // Selection is a no-draw-mode concept; clear it so the draw bar owns the navbar.
      this.selection.clear();
      // Show the draw controls in the navbar, like the note editing menu.
      this.navBarService.setTemplate(this.drawNavbarTemplate);
    } else {
      this.drawing = false;
      this.activePoints = [];
      this.activeStrokeD = '';
      this.eraserBefore = null;
      this.navBarService.setTemplate(
        this.defaultNavbarTemplate,
        this.buildDefaultNavbarContext(),
      );
    }
    this.cdr.detectChanges();
  }

  onDrawColorChange(color: string | null): void {
    if (color) this.drawColor = color;
    // Picking a color implies you want to paint.
    this.drawTool = 'pen';
  }

  setDrawTool(tool: 'pen' | 'eraser'): void {
    this.drawTool = tool;
  }

  toggleEraser(): void {
    this.drawTool = this.drawTool === 'eraser' ? 'pen' : 'eraser';
  }

  private updateCursor(event: PointerEvent): void {
    const rect = (this.boardRef.nativeElement as HTMLElement).getBoundingClientRect();
    this.cursorX = event.clientX - rect.left;
    this.cursorY = event.clientY - rect.top;
    this.cursorInside = true;
  }

  onDrawPointerDown(event: PointerEvent): void {
    if (!this.drawMode || this.spaceHeld || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.updateCursor(event);

    this.drawing = true;

    if (this.drawTool === 'eraser') {
      this.eraserBefore = this.drawings.slice();
      this.eraseAt(event.clientX, event.clientY);
      return;
    }

    const p = this.screenToWorld(event.clientX, event.clientY);
    this.activePoints = [p];
    this.activeStrokeD = buildStrokePath(this.activePoints);
  }

  onDrawPointerMove(event: PointerEvent): void {
    this.updateCursor(event);
    if (!this.drawing) return;

    if (this.drawTool === 'eraser') {
      this.eraseAt(event.clientX, event.clientY);
      return;
    }

    const p = this.screenToWorld(event.clientX, event.clientY);
    const last = this.activePoints[this.activePoints.length - 1];
    // Drop sub-2px (screen) moves so strokes stay light without visible faceting.
    const minDist = 2 / this.mainBoardService.zoom;
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < minDist) return;
    this.activePoints.push(p);
    this.activeStrokeD = buildStrokePath(this.activePoints);
  }

  onDrawPointerUp(): void {
    if (!this.drawing) return;
    this.drawing = false;

    if (this.drawTool === 'eraser') {
      const before = this.eraserBefore;
      this.eraserBefore = null;
      if (!before) return;
      const after = this.drawings.slice();
      if (sameStrokes(before, after)) return;
      const deletedIds = before.filter((d) => !after.includes(d)).map((d) => d.id);
      if (deletedIds.length) this.history.pushDelete(deletedIds);
      return;
    }

    const pts = this.activePoints;
    this.activePoints = [];
    this.activeStrokeD = '';
    if (!pts.length) return;

    // Commit the transient stroke to a positioned, movable BoardDrawing element.
    const stroke = BoardDrawing.newDrawing(
      pts,
      this.drawColor,
      this.drawWidth / this.mainBoardService.zoom,
    );
    this.drawings.push(stroke);
    this.recordCreate(stroke, this.drawings);
  }

  /** Whole-stroke eraser: remove every stroke whose painted line sits under the
   *  cursor (sampled with a small radius so thin lines are easy to hit). */
  private eraseAt(clientX: number, clientY: number): void {
    const radius = 6;
    const samples: Array<[number, number]> = [
      [clientX, clientY],
      [clientX - radius, clientY],
      [clientX + radius, clientY],
      [clientX, clientY - radius],
      [clientX, clientY + radius],
    ];
    const hitIds = new Set<string>();
    for (const [x, y] of samples) {
      for (const el of document.elementsFromPoint(x, y)) {
        const id = el.getAttribute?.('data-stroke-id');
        if (id) hitIds.add(id);
      }
    }
    if (!hitIds.size) return;

    let changed = false;
    for (const id of hitIds) {
      const i = this.drawings.findIndex((d) => d.id === id);
      if (i >= 0) {
        this.drawings.splice(i, 1);
        changed = true;
      }
    }
    if (changed) this.cdr.detectChanges();
  }

  /** Remove every stroke that has not yet been persisted to the server, with a
   *  single undo step. Already-saved strokes are left to the delete flow. */
  clearDrawing(): void {
    if (!this.drawings.length) return;
    const removed = this.drawings.slice();
    for (const d of removed) {
      this.pendingDeletes.push(d);
    }
    this.drawings.length = 0;
    this.history.pushDelete(removed.map((d) => d.id));
    this.cdr.detectChanges();
  }

  // ── Selection (Ctrl+click) & drawing merge ──────────────────────────────────

  /** Map a host element's data-item-id back to its board item. */
  private itemById(id: string | null): BoardItem | null {
    if (!id) return null;
    return (
      this.notes.find((n) => n.id === id) ??
      this.sections.find((s) => s.id === id) ??
      this.images.find((i) => i.id === id) ??
      this.drawings.find((d) => d.id === id) ??
      null
    );
  }

  /** Nearest ancestor in the event path that is a board element host. */
  private findItemHost(ev: Event): HTMLElement | null {
    const path = (ev.composedPath?.() ?? []) as EventTarget[];
    for (const t of path) {
      if (t instanceof HTMLElement && t.hasAttribute('data-item-id')) return t;
    }
    return null;
  }

  private onBoardPointerDownCapture = (ev: PointerEvent): void => {
    if (ev.button !== 0 || this.drawMode) return;

    // Link-picking mode: a left click on an element chooses it as the link
    // target instead of panning/selecting/focusing.
    if (this.linkPicking) {
      const target = this.itemById(
        this.findItemHost(ev)?.getAttribute('data-item-id') ?? null,
      );
      if (target) {
        ev.preventDefault();
        ev.stopPropagation();
        this.pickLinkTarget(target);
      }
      return;
    }

    const item = this.itemById(this.findItemHost(ev)?.getAttribute('data-item-id') ?? null);

    if (ev.ctrlKey || ev.metaKey) {
      if (!item) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.toggleSelection(item);
      return;
    }

    // Clicking a selected item → start group drag (no pan, no focus)
    if (item && this.selection.isSelected(item)) {
      ev.preventDefault();
      ev.stopPropagation();
      this.startGroupDrag(item, ev);
      return;
    }

    // Plain press on unselected item / empty space → clear selection
    if (!item || !this.selection.isSelected(item)) {
      this.selection.clear();
    }
  };

  // ── Group drag (selected items move together) ────────────────────────────

  private groupDragActive = false;
  private groupDragAnchor: BoardItem | null = null;
  private groupDragStartX = 0;
  private groupDragStartY = 0;
  private groupDragStarts = new Map<BoardItem, { x: number; y: number }>();

  private startGroupDrag(anchor: BoardItem, ev: PointerEvent): void {
    const sel = this.selection.items;
    this.groupDragActive = true;
    this.groupDragAnchor = anchor;
    this.groupDragStartX = ev.clientX;
    this.groupDragStartY = ev.clientY;
    this.groupDragStarts.clear();
    for (const it of sel) {
      this.groupDragStarts.set(it, { x: it.x, y: it.y });
    }

    const board = this.boardRef.nativeElement as HTMLElement;
    try { board.setPointerCapture(ev.pointerId); } catch {}

    window.addEventListener('pointermove', this.onGroupDragMove, { passive: false });
    window.addEventListener('pointerup', this.onGroupDragUp);
    window.addEventListener('pointercancel', this.onGroupDragUp);
  }

  private onGroupDragMove = (ev: PointerEvent): void => {
    if (!this.groupDragActive) return;
    ev.preventDefault();

    const dxPx = ev.clientX - this.groupDragStartX;
    const dyPx = ev.clientY - this.groupDragStartY;
    const z = this.zoom || 1;
    const dxW = dxPx / z;
    const dyW = dyPx / z;

    for (const it of this.groupDragStarts.keys()) {
      const s = this.groupDragStarts.get(it);
      if (!s) continue;
      it.x = Math.round(s.x + dxW);
      it.y = Math.round(s.y + dyW);
    }
    this.cdr.detectChanges();
  };

  private onGroupDragUp = (): void => {
    if (!this.groupDragActive) return;
    this.groupDragActive = false;

    try {
      const board = this.boardRef.nativeElement as HTMLElement;
      board.releasePointerCapture?.(1);
    } catch {}

    window.removeEventListener('pointermove', this.onGroupDragMove);
    window.removeEventListener('pointerup', this.onGroupDragUp);
    window.removeEventListener('pointercancel', this.onGroupDragUp);

    // Record one undo step (positionUpdated is set by the x/y setters during drag)
    this.pushGroupDragUndo();
    this.groupDragStarts.clear();
    this.groupDragAnchor = null;
    this.cdr.detectChanges();
  };

  private pushGroupDragUndo(): void {
    const moves: Array<{ id: string; bx: number; by: number; ax: number; ay: number }> = [];
    for (const [it, before] of this.groupDragStarts) {
      if (before.x !== it.x || before.y !== it.y) {
        moves.push({ id: it.id, bx: before.x, by: before.y, ax: it.x, ay: it.y });
      }
    }
    if (moves.length === 0) return;
    this.history.pushGroupMove(moves);
  }

  /** Toggle an item in/out of the selection. When toggling a section in, also
   *  select every element fully contained inside it; when toggling out, deselect
   *  its contained elements. Works recursively for nested sections. */
  private toggleSelection(item: BoardItem): void {
    const adding = !this.selection.isSelected(item);
    this.selection.toggle(item, true);

    if (item instanceof BoardSection) {
      this.toggleSectionContents(item, adding);
    }
  }

  /** Recursively toggle all elements (notes, images, drawings, sections) that
   *  are fully inside `section`. */
  private toggleSectionContents(section: BoardSection, adding: boolean): void {
    const candidates: BoardItem[] = [
      ...this.notes,
      ...this.images,
      ...this.drawings,
      ...this.sections,
    ];

    for (const el of candidates) {
      if (el === section) continue;
      if (!this.isInside(el, section)) continue;

      const selected = this.selection.isSelected(el);
      if (adding && !selected) {
        this.selection.toggle(el, true);
      } else if (!adding && selected) {
        this.selection.toggle(el, true);
      }

      // Recurse into nested sections
      if (el instanceof BoardSection) {
        this.toggleSectionContents(el, adding);
      }
    }
  }

  /** True when `el` is fully inside `section`. */
  private isInside(el: BoardItem, section: BoardSection): boolean {
    return (
      el.x >= section.x &&
      el.y >= section.y &&
      (el.x + el.width) <= (section.x + section.width) &&
      (el.y + el.height) <= (section.y + section.height)
    );
  }

  private onBoardClickCapture = (ev: MouseEvent): void => {
    if (this.drawMode) return;
    // While picking a link target, swallow clicks so notes don't focus/edit.
    if (this.linkPicking) {
      if (this.findItemHost(ev)) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      return;
    }
    if (!(ev.ctrlKey || ev.metaKey)) return;
    if (!this.findItemHost(ev)) return;
    // Swallow the click that follows a Ctrl+press so nothing focuses.
    ev.preventDefault();
    ev.stopPropagation();
  };

  // ── Board-link picking actions ─────────────────────────────────────────────

  /** Mark an element as the pending link target (highlighted, awaiting confirm). */
  pickLinkTarget(item: BoardItem): void {
    this.linkCandidate = item;
    this.cdr.detectChanges();
  }

  /** Commit the link to the chosen target and exit picking mode. */
  confirmLink(): void {
    const target = this.linkCandidate;
    if (!target) return;
    this.linkService.confirm(target.serverId ?? target.id);
  }

  /** Abort link picking without applying anything. */
  cancelLink(): void {
    this.linkService.cancel();
  }

  private startLinkEnterHold(): void {
    if (this.linkEnterHolding) return;
    this.linkEnterHolding = true;
    this.linkEnterStart = Date.now();
    this.linkEnterProgress = 0;
    this.linkEnterTimer = setInterval(() => {
      const elapsed = Date.now() - this.linkEnterStart;
      this.linkEnterProgress = Math.min(1, elapsed / this.LINK_ENTER_HOLD_MS);
      if (this.linkEnterProgress >= 1) {
        this.stopLinkEnterHold();
        this.confirmLink();
      }
      this.cdr.detectChanges();
    }, 50);
  }

  private stopLinkEnterHold(): void {
    if (this.linkEnterTimer !== null) {
      clearInterval(this.linkEnterTimer);
      this.linkEnterTimer = null;
    }
    this.linkEnterHolding = false;
    this.linkEnterProgress = 0;
  }

  get selectionCount(): number {
    return this.selection.size;
  }

  // ── Delete selected elements ──────────────────────────────────────────────

  deleteHolding = false;
  deleteHoldStart = 0;
  deleteHoldProgress = 0; // 0-1
  private deleteHoldTimer: ReturnType<typeof setInterval> | null = null;
  private readonly DELETE_HOLD_MS = 3000; // hold duration for >3 items

  get canDeleteSelected(): boolean {
    return this.selection.size > 0;
  }

  get deleteRequiresHold(): boolean {
    return this.selection.size > 3;
  }

  deleteSelectedPress(): void {
    if (!this.canDeleteSelected) return;

    if (!this.deleteRequiresHold) {
      // ≤3 items — immediate delete
      this.deleteSelectedNow();
      return;
    }

    // >3 items — start hold
    this.deleteHolding = true;
    this.deleteHoldStart = Date.now();
    this.deleteHoldProgress = 0;
    this.deleteHoldTimer = setInterval(() => {
      const elapsed = Date.now() - this.deleteHoldStart;
      this.deleteHoldProgress = Math.min(1, elapsed / this.DELETE_HOLD_MS);
      if (this.deleteHoldProgress >= 1) {
        this.stopDeleteHold();
        this.deleteSelectedNow();
      }
      this.cdr.detectChanges();
    }, 50);
  }

  deleteSelectedRelease(): void {
    this.stopDeleteHold();
  }

  private stopDeleteHold(): void {
    if (this.deleteHoldTimer !== null) {
      clearInterval(this.deleteHoldTimer);
      this.deleteHoldTimer = null;
    }
    this.deleteHolding = false;
    this.deleteHoldProgress = 0;
  }

  private async deleteSelectedNow(): Promise<void> {
    const items = this.selection.items.slice();
    this.selection.clear();

    // Remove from local arrays only — no server call yet.
    // Items are collected in pendingDeletes; saveBoard() sends the DELETEs.
    for (const item of items) {
      this.pendingDeletes.push(item);
      if (item instanceof BoardNote) this.removeFromList(item, this.notes, this.notesMap);
      else if (item instanceof BoardSection) this.removeFromList(item, this.sections);
      else if (item instanceof BoardImage) this.removeFromList(item, this.images);
      else if (item instanceof BoardDrawing) this.removeFromList(item, this.drawings);
    }

    // Single undo step to restore all
    this.history.pushDelete(items.map((it) => it.id));

    this.cdr.detectChanges();
  }

  // ── AI state ──────────────────────────────────────────────────────────────

  /** True while an AI request is in flight. */
  aiLoading = false;
  /** Fact-check results keyed by noteId. */
  factCheckResults = new Map<string, FactCheckResult>();
  /** Show fact-check details for this noteId. */
  factCheckExpanded: string | null = null;

  /** Quiz generation result. */
  quiz: QuizGenerateResponse | null = null;
  /** Current question index. */
  quizIndex = 0;
  /** Coverage slider value (0–1). */
  quizCoverage = 0.75;
  /** User's answers keyed by question id. */
  quizAnswers = new Map<string, string>();
  /** True once the quiz is submitted and scored. */
  quizSubmitted = false;
  /** Score summary after evaluation. */
  quizScore: { score: string; percentage: number } | null = null;

  /** True when all selected items are notes. */
  get selectedNotes(): BoardNote[] {
    return this.selection.items.filter(
      (i): i is BoardNote => i instanceof BoardNote,
    );
  }

  get canFactCheck(): boolean {
    return !this.aiLoading && this.selectedNotes.length >= 1;
  }

  get canGenerateQuiz(): boolean {
    return !this.aiLoading && this.selectedNotes.length >= 1;
  }

  get quizCurrentQuestion(): QuizQuestion | null {
    return this.quiz?.questions[this.quizIndex] ?? null;
  }

  get quizProgress(): string {
    if (!this.quiz) return '';
    return `${this.quizIndex + 1} / ${this.quiz.questions.length}`;
  }

  // ── Save indicator ────────────────────────────────────────────────────────

  saveStatus: 'idle' | 'saving' | 'saved' | 'failed' = 'idle';
  private saveDots = 0;
  private saveDotsTimer: ReturnType<typeof setInterval> | null = null;

  private get selectedDrawings(): BoardDrawing[] {
    return this.selection.items.filter((i): i is BoardDrawing => i instanceof BoardDrawing);
  }

  get canMergeDrawings(): boolean {
    const sel = this.selection.items;
    return sel.length >= 2 && sel.every((i) => i instanceof BoardDrawing);
  }

  get canUnmergeDrawing(): boolean {
    return (
      this.selection.size === 1 &&
      this.selection.items[0] instanceof BoardDrawing &&
      (this.selection.items[0] as BoardDrawing).isMerged
    );
  }

  mergeSelectedDrawings(): void {
    const sel = this.selectedDrawings;
    if (sel.length < 2 || !this.canMergeDrawings) return;

    const before = this.drawings.slice();
    const merged = BoardDrawing.fromAbsolute(sel.flatMap((d) => d.toAbsolute()));
    for (const d of sel) {
      const i = this.drawings.indexOf(d);
      if (i >= 0) this.drawings.splice(i, 1);
      this.pendingDeletes.push(d);
    }
    this.drawings.push(merged);
    this.bringToFront(merged);
    this.selection.set([merged]);
    this.pushDrawingsSnapshot(before, this.drawings.slice());
    this.cdr.detectChanges();
  }

  unmergeSelectedDrawing(): void {
    const d = this.selection.items[0];
    if (!(d instanceof BoardDrawing) || !d.isMerged) return;
    const i = this.drawings.indexOf(d);
    if (i < 0) return;

    const before = this.drawings.slice();
    const singles = d.toAbsolute().map((s) => BoardDrawing.fromAbsolute([s]));
    this.drawings.splice(i, 1);
    this.pendingDeletes.push(d);
    for (const s of singles) this.drawings.push(s);
    this.selection.set(singles);
    this.pushDrawingsSnapshot(before, this.drawings.slice());
    this.cdr.detectChanges();
  }

  /** One undo step that swaps the whole drawing list between two snapshots. */
  private pushDrawingsSnapshot(before: BoardDrawing[], after: BoardDrawing[]): void {
    const deleted = before.filter((d) => !after.includes(d));
    const created = after.filter((d) => !before.includes(d));
    if (deleted.length) {
      this.history.pushDelete(deleted.map((d) => d.id));
    }
    if (created.length) {
      this.history.pushCreate(created.map((d) => d.id));
    }
  }

  /** Show AI controls for note selections, merge/unmerge for drawings,
   *  otherwise the default navbar. No-op while draw mode owns the navbar. */
  private updateSelectionNavbar(): void {
    if (this.drawMode) return;
    if (this.quiz) {
      this.navBarService.setTemplate(this.quizNavbarTemplate);
    } else if (this.selectedNotes.length === this.selection.size && this.selection.size > 0) {
      this.navBarService.setTemplate(this.aiNavbarTemplate);
    } else if (this.selection.size) {
      this.navBarService.setTemplate(this.selectionNavbarTemplate);
    } else {
      this.navBarService.setTemplate(
        this.defaultNavbarTemplate,
        this.buildDefaultNavbarContext(),
      );
    }
  }

  // ── AI actions ───────────────────────────────────────────────────────────

  private selectedNoteInputs() {
    return this.selectedNotes.map((n) => ({
      id: n.serverId ?? n.id,
      content: n.content,
    }));
  }

  async runFactCheck(): Promise<void> {
    if (!this.canFactCheck) return;
    this.aiLoading = true;
    this.factCheckResults.clear();
    this.cdr.detectChanges();

    const req = { notes: this.selectedNoteInputs() };
    const res = await this.aiService.factCheck(req);
    this.aiLoading = false;

    if (res) {
      for (const r of res.results) {
        this.factCheckResults.set(r.noteId, r);
      }
    }
    this.cdr.detectChanges();
  }

  clearFactChecks(): void {
    this.factCheckResults.clear();
    this.factCheckExpanded = null;
    this.cdr.detectChanges();
  }

  async startQuiz(): Promise<void> {
    if (!this.canGenerateQuiz) return;
    this.aiLoading = true;
    this.quiz = null;
    this.quizIndex = 0;
    this.quizAnswers.clear();
    this.quizSubmitted = false;
    this.quizScore = null;
    this.cdr.detectChanges();

    const req = {
      notes: this.selectedNoteInputs(),
      coverage: this.quizCoverage,
    };
    const res = await this.aiService.generateQuiz(req);
    this.aiLoading = false;

    if (res?.questions?.length) {
      this.quiz = res;
      this.updateSelectionNavbar();
    }
    this.cdr.detectChanges();
  }

  quizPrev(): void {
    if (this.quizIndex > 0) this.quizIndex--;
  }

  quizNext(): void {
    if (this.quiz && this.quizIndex < this.quiz.questions.length - 1) {
      this.quizIndex++;
    }
  }

  quizSelectAnswer(answer: string): void {
    const q = this.quizCurrentQuestion;
    if (!q) return;
    this.quizAnswers.set(q.id, answer);
    // Auto-advance on multiple-choice selection
    if (q.type === 'MULTIPLE_CHOICE' && this.quizIndex < (this.quiz?.questions.length ?? 0) - 1) {
      setTimeout(() => this.quizNext(), 300);
    }
  }

  async submitQuiz(): Promise<void> {
    if (!this.quiz) return;
    const questions = Array.from(this.quizAnswers.entries()).map(
      ([id, answer]) => ({ id, answer }),
    );
    const res = await this.aiService.evaluateQuiz({ questions });
    if (res) {
      this.quizScore = { score: res.score, percentage: res.percentage };
      this.quizSubmitted = true;
    }
    this.cdr.detectChanges();
  }

  closeQuiz(): void {
    this.quiz = null;
    this.quizIndex = 0;
    this.quizAnswers.clear();
    this.quizSubmitted = false;
    this.quizScore = null;
    // Restore selection navbar
    this.updateSelectionNavbar();
    this.cdr.detectChanges();
  }

  closeContextMenu() {
    this.ctxMenu.visible = false;
  }

  onContextMenuItem(item: ContextMenuItem) {
    this.closeContextMenu();

    switch (item.id) {
      case 'save':
        this.saveBoard();
        return;
      case 'create-note':
        this.createNoteAt(this.lastWorldX, this.lastWorldY);
        return;
      case 'create-section':
        this.createSectionAt(this.lastWorldX, this.lastWorldY);
        return;
      default:
        console.log(item.label);
        return;
    }
  }
}

/** Shallow reference-equality of two stroke lists (same items, same order). */
function sameStrokes(a: BoardDrawing[], b: BoardDrawing[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** True when focus is in a text field / rich-text editor, so Ctrl+Z/Y should be
 *  handled by that editor rather than the board history. */
function isTextEditingActive(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA')
  );
}
