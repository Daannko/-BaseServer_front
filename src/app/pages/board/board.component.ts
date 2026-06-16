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
  ) {
    this.boards$ = this.boardSearchService.boards$;
    this.snapGuides$ = this.snapService.guides$;
    this.aspectGuide$ = this.snapService.aspectGuide$;
    this.history.onChange = () => this.cdr.detectChanges();
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

  private recordCreate(item: BoardItem, list: BoardItem[], map?: Map<string, BoardItem>): void {
    this.history.push({
      undo: () => this.removeFromList(item, list, map),
      redo: () => this.addToList(item, list, map),
    });
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

      await Promise.resolve();
      this.cdr.detectChanges();

      this.mainBoardService.initialize({
        boardRef: this.boardRef,
        viewportRef: this.viewportRef,
        notes: this.notes,
        sections: this.sections,
        images: this.images,
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
  }

  @HostListener('window:keyup', ['$event'])
  onGlobalKeyup(event: KeyboardEvent) {
    if (event.code === 'Space' && this.spaceHeld) {
      this.spaceHeld = false;
      if (this.drawMode) this.mainBoardService.drawMode = true;
      this.cdr.detectChanges();
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
        this.cdr.detectChanges();
      });

    // Pan runs outside Angular zone, so camera changes never trigger CD on their own.
    // Without this, tiles that scroll into view stay hidden until the next zoom event.
    this.mainBoardService.camera$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.cdr.detectChanges();
      });

    // Selection changes drive the merge/unmerge navbar.
    this.selection.changed$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateSelectionNavbar();
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
    const boardEl = this.boardRef?.nativeElement;
    boardEl?.removeEventListener('pointerdown', this.onBoardPointerDownCapture as EventListener, true);
    boardEl?.removeEventListener('click', this.onBoardClickCapture as EventListener, true);
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

  async onDeleteSection(section: BoardSection): Promise<void> {
    if (section.serverId) {
      try {
        await this.boardSearchService.deleteElement(section);
      } catch {
        return;
      }
    }

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

  async onDeleteImage(image: BoardImage): Promise<void> {
    if (image.serverId) {
      try {
        await this.boardSearchService.deleteElement(image);
      } catch {
        return;
      }
    }
    this.recordDelete(image, this.images);
    this.removeFromList(image, this.images);
  }

  async onDeleteDrawing(drawing: BoardDrawing): Promise<void> {
    if (drawing.serverId) {
      try {
        await this.boardSearchService.deleteElement(drawing);
      } catch {
        return;
      }
    }
    if (this.selection.isSelected(drawing)) {
      this.selection.set(this.selection.items.filter((i) => i !== drawing));
    }
    this.recordDelete(drawing, this.drawings);
    this.removeFromList(drawing, this.drawings);
  }

  /** Records an element removal so Ctrl+Z restores it. The restored item loses
   *  its serverId (the topic was already deleted) and is marked dirty so the
   *  next save re-creates it. */
  private recordDelete(item: BoardItem, list: BoardItem[], map?: Map<string, BoardItem>): void {
    this.history.push({
      undo: () => {
        item.serverId = undefined;
        item.positionUpdated = true;
        item.sizeUpdated = true;
        item.contentUpdated = true;
        item.nameUpdated = true;
        this.addToList(item, list, map);
      },
      redo: () => this.removeFromList(item, list, map),
    });
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

  /** Upload an image blob and place the element at viewport center. */
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
    const center = this.screenToWorld(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );

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

  async onDeleteNote(tile: BoardItem): Promise<void> {
    if (tile.serverId) {
      try {
        await this.boardSearchService.deleteElement(tile);
      } catch {
        return;
      }
    }

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

  async saveBoard(): Promise<void> {
    if (!this.selectedBoard) return;

    const boardId = this.selectedBoard.id;
    const allItems: BoardItem[] = [
      ...this.notes,
      ...this.sections,
      ...this.images,
      ...this.drawings,
    ];
    const tilesToCreate = allItems.filter((t) => !t.serverId);

    if (tilesToCreate.length > 0) {
      const createdElements = await Promise.all(
        tilesToCreate.map((t) =>
          this.boardSearchService.createElement(t, boardId),
        ),
      );
      for (let i = 0; i < createdElements.length; i++) {
        const created = createdElements[i];
        if (!created) continue;
        tilesToCreate[i].serverId = created.id;
      }
    }

    await Promise.all(
      allItems.filter(t => Boolean(t.serverId)).map(t => this.boardSearchService.saveElement(t)),
    );
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
      // Restore/redo by rebuilding the list in place (template binds the array
      // reference, so it must never be reassigned).
      const restore = (snapshot: BoardDrawing[]) => {
        this.drawings.length = 0;
        this.drawings.push(...snapshot);
        this.cdr.detectChanges();
      };
      this.history.push({
        undo: () => restore(before),
        redo: () => restore(after),
      });
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
    this.drawings.length = 0;
    this.history.push({
      undo: () => {
        this.drawings.push(...removed);
        this.cdr.detectChanges();
      },
      redo: () => {
        this.drawings.length = 0;
        this.cdr.detectChanges();
      },
    });
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
    const item = this.itemById(this.findItemHost(ev)?.getAttribute('data-item-id') ?? null);

    if (ev.ctrlKey || ev.metaKey) {
      if (!item) return;
      // Take over the gesture so the element doesn't move/focus on a Ctrl+click.
      ev.preventDefault();
      ev.stopPropagation();
      this.selection.toggle(item, true);
      return;
    }
    // Plain press clears the selection unless you're grabbing a selected item
    // (which begins a group move).
    if (!item || !this.selection.isSelected(item)) {
      this.selection.clear();
    }
  };

  private onBoardClickCapture = (ev: MouseEvent): void => {
    if (this.drawMode) return;
    if (!(ev.ctrlKey || ev.metaKey)) return;
    if (!this.findItemHost(ev)) return;
    // Swallow the click that follows a Ctrl+press so nothing focuses.
    ev.preventDefault();
    ev.stopPropagation();
  };

  get selectionCount(): number {
    return this.selection.size;
  }

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
    this.drawings.splice(i, 1, ...singles);
    this.selection.set(singles);
    this.pushDrawingsSnapshot(before, this.drawings.slice());
    this.cdr.detectChanges();
  }

  /** One undo step that swaps the whole drawing list between two snapshots,
   *  rebuilt in place (the template binds the array reference). */
  private pushDrawingsSnapshot(before: BoardDrawing[], after: BoardDrawing[]): void {
    const restore = (snap: BoardDrawing[]) => {
      this.drawings.length = 0;
      this.drawings.push(...snap);
      this.selection.clear();
      this.cdr.detectChanges();
    };
    this.history.push({
      undo: () => restore(before),
      redo: () => restore(after),
    });
  }

  /** Show the merge/unmerge bar while drawings are selected; otherwise restore
   *  the default navbar. No-op while draw mode owns the navbar. */
  private updateSelectionNavbar(): void {
    if (this.drawMode) return;
    if (this.selection.size) {
      this.navBarService.setTemplate(this.selectionNavbarTemplate);
    } else {
      this.navBarService.setTemplate(
        this.defaultNavbarTemplate,
        this.buildDefaultNavbarContext(),
      );
    }
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
