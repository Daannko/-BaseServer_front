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
import { Router } from '@angular/router';
import { NavbarComponent } from '../../helpers/navbar/navbar.component';
import { BoardItem, BoardItemSnapshot } from './board-item/board-item.data';
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
import { BoardPersistenceService } from './board-persistence.service';
import { EditorPrefsService } from './board-editor-prefs.service';
import type {
  FactCheckResult,
  QuizQuestion,
  QuizGenerateResponse,
  ChatMessage,
  NoteContextInput,
  BoardAiAction,
} from './models/ai.model';
import type { JSONContent } from '@tiptap/core';

/** One AI-proposed action plus its approval state in the chat thread. */
interface ProposedAction {
  action: BoardAiAction;
  status: 'pending' | 'applied' | 'rejected';
  /** Previous body, captured on apply of an update so it can be reverted. */
  prevContent?: JSONContent;
}

/** One entry in the chat thread (user turn or assistant turn + its actions). */
interface ChatThreadEntry {
  role: 'user' | 'assistant';
  content: string;
  actions?: ProposedAction[];
}

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
  @ViewChild('importFileInput', { static: false })
  importFileInputRef?: ElementRef<HTMLInputElement>;

  boards$!: Observable<Board[] | null>;
  snapGuides$!: Observable<SnapGuides>;
  aspectGuide$!: Observable<AspectGuide | null>;
  isSearchOpen = true;
  isCreateOpen = false;
  optionsOpen = false;
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
    private persistence: BoardPersistenceService,
    private editorPrefs: EditorPrefsService,
    private router: Router,
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

  // ── Copy / paste of board elements ─────────────────────────────────────────

  /** Buffer of elements captured on Ctrl+C. Cloned (not referenced) on paste. */
  private clipboard: BoardItem[] = [];

  /** Ctrl+C — snapshot the current selection into the clipboard. */
  copySelection(): void {
    const items = this.selection.items;
    if (!items.length) return;
    this.clipboard = items.slice();
  }

  /** Ctrl+V — clone the buffered elements onto the board centered on the mouse
   *  (relative layout preserved), and select the freshly pasted copies. */
  pasteClipboard(): void {
    if (!this.selectedBoard || !this.clipboard.length) return;

    // Bounding-box center of the buffered group, in world units.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of this.clipboard) {
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + s.width);
      maxY = Math.max(maxY, s.y + s.height);
    }
    const groupCx = (minX + maxX) / 2;
    const groupCy = (minY + maxY) / 2;

    // Target: the world point under the cursor when it's over the board,
    // otherwise the viewport center.
    const board = this.boardRef.nativeElement as HTMLElement;
    const rect = board.getBoundingClientRect();
    const mouseInside =
      this.lastMouseClientX >= rect.left &&
      this.lastMouseClientX <= rect.right &&
      this.lastMouseClientY >= rect.top &&
      this.lastMouseClientY <= rect.bottom;
    const target = mouseInside
      ? this.screenToWorld(this.lastMouseClientX, this.lastMouseClientY)
      : this.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);

    const dx = target.x - groupCx;
    const dy = target.y - groupCy;

    const pasted: BoardItem[] = [];
    for (const src of this.clipboard) {
      let copy: BoardItem | null = null;
      if (src instanceof BoardNote) {
        copy = src.clone(dx, dy);
        this.notes.push(copy as BoardNote);
        this.notesMap.set(copy.id, copy);
        this.bringToFront(copy);
      } else if (src instanceof BoardSection) {
        copy = src.clone(dx, dy);
        this.sections.push(copy as BoardSection);
        this.bringSectionToFront(copy);
      } else if (src instanceof BoardImage) {
        copy = src.clone(dx, dy);
        this.images.push(copy as BoardImage);
        this.bringToFront(copy);
      } else if (src instanceof BoardDrawing) {
        copy = src.clone(dx, dy);
        this.drawings.push(copy as BoardDrawing);
        this.bringToFront(copy);
      }
      if (copy) pasted.push(copy);
    }

    if (!pasted.length) return;
    // One history entry for the whole paste, so a single Ctrl+Z removes them all.
    this.history.pushCreate(pasted.map((i) => i.id));
    this.selection.set(pasted);
    this.cdr.detectChanges();
    this.mainBoardService.noteComponents = this.noteComponents?.toArray() ?? [];
  }

  resetNewBoardForm() {
    this.newBoardName = '';
    this.newBoardDescription = '';
  }

  // ── Options popup (export / import / logout) ──────────────────────────────

  openOptions() {
    this.optionsOpen = true;
  }

  closeOptions() {
    this.optionsOpen = false;
  }

  logoutFromOptions() {
    this.closeOptions();
    this.router.navigate(['../logout']);
  }

  /** Serialize the currently selected board (metadata + every element) to a
   *  JSON file and trigger a download. JSON keeps the full ProseMirror content
   *  and all element types losslessly. */
  exportBoard() {
    if (!this.selectedBoard) return;
    const payload = {
      format: 'baseserver-board',
      version: 1,
      exportedAt: new Date().toISOString(),
      board: {
        name: this.selectedBoard.name,
        description: this.selectedBoard.description ?? '',
      },
      items: this.allItems().map((i) => i.toSnapshot()),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.safeFileName(this.selectedBoard.name)}.board.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.closeOptions();
  }

  private safeFileName(name: string): string {
    const cleaned = (name || 'board').replace(/[^a-z0-9-_ ]/gi, '').trim();
    return cleaned.length ? cleaned : 'board';
  }

  /** Open the OS file picker for board import. */
  triggerImport() {
    this.importFileInputRef?.nativeElement?.click();
  }

  onImportFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so selecting the same file again still fires `change`.
    input.value = '';
    if (file) this.importBoardFromFile(file);
  }

  /** Parse an exported board file, create a fresh board from it, recreate its
   *  elements with new ids, and persist them to the server. */
  private async importBoardFromFile(file: File) {
    let data: any;
    try {
      data = JSON.parse(await file.text());
    } catch {
      console.error('Import failed: file is not valid JSON');
      return;
    }
    if (!data || data.format !== 'baseserver-board' || !Array.isArray(data.items)) {
      console.error('Import failed: unrecognized board file');
      return;
    }

    const name = String(data.board?.name ?? 'Imported board');
    const description = String(data.board?.description ?? '');

    const board = await this.boardSearchService.createBoard(
      name,
      description,
      null,
      null,
    );
    if (!board) return;

    // Load the (empty) new board into view, then drop the imported elements in.
    await this.selectBoard(board.id);

    for (const snap of data.items as BoardItemSnapshot[]) {
      // Fresh id + no serverId so saveBoard() creates them as new elements.
      const fresh: BoardItemSnapshot = {
        ...snap,
        id: globalThis.crypto.randomUUID(),
        serverId: undefined,
        syncState: 'local',
        positionUpdated: true,
        sizeUpdated: true,
        contentUpdated: true,
        nameUpdated: true,
      };
      const item = this.itemFromSnapshot(fresh);
      if (item) this.addRecreated(item);
    }

    this.cdr.detectChanges();
    this.mainBoardService.noteComponents = this.noteComponents?.toArray() ?? [];
    await this.saveBoard();
    if (this.notes.length > 0) {
      this.mainBoardService.centerOnItem(this.notes[0]);
    }
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

      // Offer to recover any local changes that never reached the DB.
      this.maybeOfferRestore(board.id);

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
    // Copy / paste selected elements. While a text editor is focused, let the
    // browser handle Ctrl+C/V for the text itself.
    if (mod && (event.key === 'c' || event.key === 'C')) {
      // Only defer to the browser when there's actual highlighted text to copy.
      // A selected note keeps a *collapsed* caret in its contentEditable body,
      // which made isTextEditingActive() true and silently swallowed Ctrl+C —
      // so the element never reached the clipboard until you blurred the editor.
      if (isTextEditingActive() && hasActiveTextSelection()) return;
      this.copySelection();
      return;
    }
    if (mod && (event.key === 'v' || event.key === 'V')) {
      if (isTextEditingActive()) return;
      // Only intercept when we have board elements buffered; otherwise fall
      // through so the window:paste handler can still paste images.
      if (this.clipboard.length) {
        event.preventDefault();
        this.pasteClipboard();
      }
      return;
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
    // Persist a final snapshot, then stop the background timers.
    if (this.selectedBoard) {
      this.persistence.save(
        this.selectedBoard.id,
        this.allItems().map((i) => i.toSnapshot()),
      );
      this.persistence.flush();
    }
    this.stopDurableSaving();
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

    this.startDurableSaving();

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
      this.editorPrefs.lastFontSize,
    );

    this.notes.push(note);
    this.notesMap.set(note.id, note);
    this.recordCreate(note, this.notes, this.notesMap);

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

  /** Sync all local changes to the server. Triggered by Ctrl+S and the 5-min
   *  auto-save. Each element saves independently — one failure never blocks the
   *  others (Promise.allSettled), and an element's dirty flags are cleared only
   *  on its own confirmed success (see BoardApiService.patchIfDirty). */
  async saveBoard(): Promise<void> {
    if (!this.selectedBoard) return;
    // Never overlap two save cycles (manual press during an auto-save, etc.).
    if (this.saveInFlight) return;
    this.saveInFlight = true;
    this.setSaveStatus('saving');

    const boardId = this.selectedBoard.id;
    const allItems = this.allItems();
    let anyFailed = false;

    try {
      // 1. Delete elements marked for removal (sent to server, then dropped).
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

      // 2. Create new elements (no serverId yet). Each is isolated.
      const toCreate = allItems.filter((t) => !t.serverId);
      for (const t of toCreate) t.syncState = 'syncing';
      if (toCreate.length > 0) {
        const created = await Promise.allSettled(
          toCreate.map((t) =>
            this.boardSearchService.createElement(t, boardId),
          ),
        );
        for (let i = 0; i < created.length; i++) {
          const res = created[i];
          const item = toCreate[i];
          if (res.status === 'fulfilled' && res.value) {
            item.serverId = res.value.id;
            item.saved();
          } else {
            anyFailed = true;
            item.syncState = 'error';
            item.lastSyncError =
              res.status === 'rejected'
                ? String((res.reason as any)?.message ?? res.reason)
                : 'Server did not return an id';
          }
        }
      }

      // 3. Update dirty existing elements. Each is isolated.
      const toUpdate = allItems.filter((t) => t.serverId && t.toBeUpdated());
      for (const t of toUpdate) t.syncState = 'syncing';
      if (toUpdate.length > 0) {
        const updated = await Promise.allSettled(
          toUpdate.map((t) => this.boardSearchService.saveElement(t)),
        );
        for (let i = 0; i < updated.length; i++) {
          const res = updated[i];
          const item = toUpdate[i];
          // saveElement → patchIfDirty already called item.saved() on success.
          if (res.status === 'rejected') {
            anyFailed = true;
            item.syncState = 'error';
            item.lastSyncError = String((res.reason as any)?.message ?? res.reason);
          }
        }
      }

      this.setSaveStatus(anyFailed ? 'partial' : 'saved');

      // Only drop the local safety net once the DB truly holds everything.
      if (!anyFailed) {
        this.persistence.clear(boardId);
      } else {
        this.scheduleLocalSave();
      }
    } catch {
      this.setSaveStatus('failed');
      this.scheduleLocalSave();
    } finally {
      this.saveInFlight = false;
      this.cdr.detectChanges();
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

  // ── Local persistence (survives refresh / browser close) ─────────────────

  /** Start the background timers: a frequent localStorage snapshot and a
   *  5-min push of dirty elements to the server. Idempotent. */
  private startDurableSaving(): void {
    if (this.snapshotTimer === null) {
      this.snapshotTimer = setInterval(
        () => this.scheduleLocalSave(),
        this.SNAPSHOT_MS,
      );
    }
    if (this.autoSaveTimer === null) {
      this.autoSaveTimer = setInterval(() => {
        if (
          this.selectedBoard &&
          this.allItems().some((i) => i.syncState !== 'synced')
        ) {
          this.saveBoard();
        }
      }, this.AUTO_SAVE_MS);
    }
  }

  private stopDurableSaving(): void {
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    if (this.snapshotTimer !== null) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  /** Mirror the whole board to localStorage (debounced inside the service). */
  private scheduleLocalSave(): void {
    if (!this.selectedBoard) return;
    const items = this.allItems().map((i) => i.toSnapshot());
    this.persistence.save(this.selectedBoard.id, items);
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    if (!this.selectedBoard) return;
    // Synchronous write so nothing is lost when the tab/window closes.
    this.persistence.save(
      this.selectedBoard.id,
      this.allItems().map((i) => i.toSnapshot()),
    );
    this.persistence.flush();
  }

  /** After server elements load, offer to restore any newer local changes that
   *  never reached the DB (e.g. saves that failed on an expired token). */
  private maybeOfferRestore(boardId: string): void {
    const local = this.persistence.load(boardId);
    if (!local) return;
    const hasUnsynced = local.items.some((i) => i.syncState !== 'synced');
    if (!hasUnsynced) {
      this.persistence.clear(boardId);
      return;
    }
    this.restorePrompt = local;
    this.cdr.detectChanges();
  }

  /** Accept the restore: overlay local snapshots onto the loaded board. */
  restoreLocal(): void {
    const local = this.restorePrompt;
    this.restorePrompt = null;
    if (!local || !this.selectedBoard) return;

    for (const snap of local.items) {
      if (snap.syncState === 'synced') continue; // DB copy already loaded
      const existing = this.itemByIdMap(snap.id);
      if (existing) {
        this.applySnapshot(existing, snap);
      } else {
        const recreated = this.itemFromSnapshot(snap);
        if (recreated) this.addRecreated(recreated);
      }
    }
    this.cdr.detectChanges();
    this.mainBoardService.noteComponents = this.noteComponents?.toArray() ?? [];
  }

  /** Decline the restore: drop the local copy and keep the DB version. */
  discardLocal(): void {
    const id = this.selectedBoard?.id;
    this.restorePrompt = null;
    if (id) this.persistence.clear(id);
  }

  /** Relative "x minutes ago" label for the restore prompt. */
  get restoreAgeLabel(): string {
    if (!this.restorePrompt) return '';
    const mins = Math.round((Date.now() - this.restorePrompt.savedAt) / 60000);
    if (mins < 1) return 'less than a minute ago';
    if (mins === 1) return '1 minute ago';
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.round(mins / 60);
    return hrs === 1 ? '1 hour ago' : `${hrs} hours ago`;
  }

  /** Overlay a local snapshot's fields + dirty flags onto a loaded DB item. */
  private applySnapshot(item: BoardItem, s: BoardItemSnapshot): void {
    item.x = s.x; item.y = s.y; item.width = s.width; item.height = s.height;
    (item as any).zIndex = s.zIndex;
    (item as any).bgColor = s.bgColor;
    (item as any).borderColor = s.borderColor;
    (item as any).borderWidth = s.borderWidth;
    item.name = s.name;
    item.content = s.content;
    if (item instanceof BoardNote) {
      item.fontSize = s.fontSize ?? item.fontSize;
      item.options.padding = s.padding ?? null;
    }
    // Restore the exact dirty state captured locally — these were unsaved.
    item.positionUpdated = s.positionUpdated;
    item.sizeUpdated = s.sizeUpdated;
    item.contentUpdated = s.contentUpdated;
    item.nameUpdated = s.nameUpdated;
    item.syncState = s.syncState;
  }

  private itemFromSnapshot(s: BoardItemSnapshot): BoardItem | null {
    switch (s.type) {
      case 'note': return BoardNote.fromSnapshot(s);
      case 'section': return BoardSection.fromSnapshot(s);
      case 'image': return BoardImage.fromSnapshot(s);
      case 'drawing': return BoardDrawing.fromSnapshot(s);
      default: return null;
    }
  }

  private addRecreated(item: BoardItem): void {
    if (item instanceof BoardNote) { this.notes.push(item); this.notesMap.set(item.id, item); }
    else if (item instanceof BoardSection) this.sections.push(item);
    else if (item instanceof BoardImage) this.images.push(item);
    else if (item instanceof BoardDrawing) this.drawings.push(item);
  }

  // ── Sync-status panel (what's in the DB vs. only local) ──────────────────

  toggleSyncPanel(): void {
    this.syncPanelOpen = !this.syncPanelOpen;
  }

  /** Count of elements not confirmed in the DB — drives the button badge. */
  get unsyncedCount(): number {
    return this.allItems().filter((i) => i.syncState !== 'synced').length;
  }

  /** In the DB and unchanged since. */
  get syncedItems(): BoardItem[] {
    return this.allItems().filter((i) => i.syncState === 'synced');
  }

  /** Never saved to the DB (no serverId). */
  get localOnlyItems(): BoardItem[] {
    return this.allItems().filter(
      (i) => i.syncState !== 'error' && !i.serverId,
    );
  }

  /** In the DB but changed locally since the last successful save. */
  get modifiedItems(): BoardItem[] {
    return this.allItems().filter(
      (i) => i.syncState !== 'synced' && i.syncState !== 'error' && !!i.serverId,
    );
  }

  /** Last save attempt for these failed. */
  get erroredItems(): BoardItem[] {
    return this.allItems().filter((i) => i.syncState === 'error');
  }

  jumpToSyncItem(item: BoardItem): void {
    item.forceToRender = true;
    this.mainBoardService.centerOnItem(item);
    Promise.resolve().then(() => (item.forceToRender = false));
  }

  itemKindLabel(item: BoardItem): string {
    if (item instanceof BoardNote) return 'Note';
    if (item instanceof BoardSection) return 'Section';
    if (item instanceof BoardImage) return 'Image';
    if (item instanceof BoardDrawing) return 'Drawing';
    return 'Item';
  }

  itemPreview(item: BoardItem): string {
    if (item instanceof BoardNote) {
      return extractPlainText(item.content as any).slice(0, 40) || '(empty note)';
    }
    if (item instanceof BoardSection) {
      return extractPlainText(item.name as any).slice(0, 40) || '(section)';
    }
    if (item instanceof BoardImage) return 'image';
    if (item instanceof BoardDrawing) return 'drawing';
    return '';
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

  // 'partial' = some elements saved, some failed — never reported as 'saved'.
  saveStatus: 'idle' | 'saving' | 'saved' | 'partial' | 'failed' = 'idle';
  private saveDots = 0;
  private saveDotsTimer: ReturnType<typeof setInterval> | null = null;

  // ── Durable saving (auto-save + local persistence) ─────────────────────────
  /** Guards against a save cycle overlapping itself (timer vs. manual). */
  private saveInFlight = false;
  /** Pushes dirty elements to the server every 5 min. */
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  /** Mirrors board state to localStorage every few seconds. */
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private readonly AUTO_SAVE_MS = 5 * 60 * 1000;
  private readonly SNAPSHOT_MS = 5 * 1000;

  /** Pending local-restore offer surfaced on board load. */
  restorePrompt: { savedAt: number; items: BoardItemSnapshot[] } | null = null;
  /** Whether the sync-status panel is expanded. */
  syncPanelOpen = false;

  /** Every element across all four layers, in one array. */
  private allItems(): BoardItem[] {
    return [...this.notes, ...this.sections, ...this.images, ...this.drawings];
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
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
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

  // ── AI chat (conversational assistant) ────────────────────────────────────

  /** Whether the chat panel is open. */
  chatOpen = false;
  /** What the user is typing. */
  chatInput = '';
  /** True while a chat request is in flight. */
  chatLoading = false;
  /** The full conversation (user + assistant turns, with proposed actions). */
  chatThread: ChatThreadEntry[] = [];
  /** Maps a response's create_note tempIds → the freshly created note, so a
   *  sibling action in the same response can reference it. Reset per send. */
  private chatTempIdMap = new Map<string, BoardNote>();

  toggleChat(): void {
    this.chatOpen = !this.chatOpen;
    this.cdr.detectChanges();
    if (this.chatOpen) {
      setTimeout(() =>
        (document.querySelector('.ai-chat-input') as HTMLTextAreaElement | null)?.focus(),
      );
    }
  }

  closeChat(): void {
    this.chatOpen = false;
    this.cdr.detectChanges();
  }

  /** Notes currently attached as context (chips above the input). */
  get chatContextNotes(): BoardNote[] {
    return this.selectedNotes;
  }

  /** Build the enriched selection context (notes only, with geometry). */
  private buildChatSelection(): NoteContextInput[] {
    return this.selectedNotes.map((n) => ({
      id: n.serverId ?? n.id,
      type: 'note' as const,
      content: n.content,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }));
  }

  async sendChat(): Promise<void> {
    const text = this.chatInput.trim();
    if (!text || this.chatLoading || !this.selectedBoard) return;

    this.chatThread.push({ role: 'user', content: text });
    this.chatInput = '';
    this.chatLoading = true;
    this.cdr.detectChanges();
    this.scrollChatToBottom();

    const messages: ChatMessage[] = this.chatThread.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    this.chatTempIdMap.clear();
    const res = await this.aiService.chat({
      boardId: this.selectedBoard.id,
      messages,
      selection: this.buildChatSelection(),
    });
    this.chatLoading = false;

    if (res) {
      this.chatThread.push({
        role: 'assistant',
        content: res.message,
        actions: (res.actions ?? []).map((action) => ({
          action,
          status: 'pending' as const,
        })),
      });
    }
    this.cdr.detectChanges();
    this.scrollChatToBottom();
  }

  private scrollChatToBottom(): void {
    setTimeout(() => {
      const el = document.querySelector('.ai-chat-thread');
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  /** Resolve a note referenced by an action id (serverId, local id, or a
   *  tempId minted earlier in the same response). */
  private resolveNote(ref: string): BoardNote | null {
    const mapped = this.chatTempIdMap.get(ref);
    if (mapped) return mapped;
    return (
      this.notes.find((n) => n.serverId === ref || n.id === ref) ?? null
    );
  }

  /** World-space geometry for a created note, defaulting to viewport center. */
  private resolveCreateGeometry(a: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): { x: number; y: number; width: number; height: number } {
    const zoom = this.mainBoardService.zoom;
    const width = a.width ?? 450 / zoom;
    const height = a.height ?? 450 / zoom;
    if (a.x != null && a.y != null) {
      return { x: a.x, y: a.y, width, height };
    }
    const board = this.boardRef.nativeElement as HTMLElement;
    const rect = board.getBoundingClientRect();
    const c = this.screenToWorld(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return { x: c.x - width / 2, y: c.y - height / 2, width, height };
  }

  /** Human-readable preview of an action's note body for the approval card. */
  actionPreview(a: BoardAiAction): string {
    if (a.type === 'delete_note') return '';
    if (a.type === 'move_note') {
      return `→ (${Math.round(a.x)}, ${Math.round(a.y)})`;
    }
    return extractPlainText(a.content as any).slice(0, 120);
  }

  actionLabel(a: BoardAiAction): string {
    switch (a.type) {
      case 'create_note': return 'Add note';
      case 'update_note': return 'Edit note';
      case 'move_note': return 'Move note';
      case 'delete_note': return 'Delete note';
    }
  }

  /** Apply a single proposed action to the board. Create/move/delete go onto the
   *  undo history (Ctrl+Z reverts); update captures the previous body so the card
   *  can revert it (text edits aren't part of the board undo stack). */
  applyAction(pa: ProposedAction): void {
    if (pa.status !== 'pending' || !this.selectedBoard) return;
    const a = pa.action;

    switch (a.type) {
      case 'create_note': {
        const g = this.resolveCreateGeometry(a);
        const note = BoardNote.newNote(
          g.x, g.y, g.width, g.height, this.editorPrefs.lastFontSize,
        );
        note.content = structuredClone(a.content);
        this.notes.push(note);
        this.notesMap.set(note.id, note);
        this.bringToFront(note);
        this.history.pushCreate([note.id]);
        this.chatTempIdMap.set(a.tempId, note);
        Promise.resolve().then(() => {
          this.cdr.detectChanges();
          this.mainBoardService.noteComponents =
            this.noteComponents?.toArray() ?? [];
        });
        break;
      }
      case 'update_note': {
        const note = this.resolveNote(a.id);
        if (!note) { pa.status = 'rejected'; this.cdr.detectChanges(); return; }
        pa.prevContent = note.content;
        note.content = structuredClone(a.content);
        break;
      }
      case 'move_note': {
        const note = this.resolveNote(a.id);
        if (!note) { pa.status = 'rejected'; this.cdr.detectChanges(); return; }
        const before = { x: note.x, y: note.y, width: note.width, height: note.height };
        note.updatePosition(a.x, a.y);
        this.history.pushRect(note.id, before, {
          x: a.x, y: a.y, width: note.width, height: note.height,
        });
        break;
      }
      case 'delete_note': {
        const note = this.resolveNote(a.id);
        if (!note) { pa.status = 'rejected'; this.cdr.detectChanges(); return; }
        this.onDeleteNote(note);
        break;
      }
    }

    pa.status = 'applied';
    this.cdr.detectChanges();
  }

  rejectAction(pa: ProposedAction): void {
    if (pa.status !== 'pending') return;
    pa.status = 'rejected';
    this.cdr.detectChanges();
  }

  /** Revert an applied `update_note` (not tracked by the board undo stack). */
  revertAction(pa: ProposedAction): void {
    if (pa.status !== 'applied') return;
    const a = pa.action;
    if (a.type === 'update_note' && pa.prevContent !== undefined) {
      const note = this.resolveNote(a.id);
      if (note) note.content = pa.prevContent;
      pa.status = 'pending';
      this.cdr.detectChanges();
    }
  }

  /** Apply every still-pending action in an assistant turn. */
  applyAllActions(entry: ChatThreadEntry): void {
    for (const pa of entry.actions ?? []) {
      if (pa.status === 'pending') this.applyAction(pa);
    }
  }

  hasPendingActions(entry: ChatThreadEntry): boolean {
    return (entry.actions ?? []).some((pa) => pa.status === 'pending');
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

/** True when there's a non-collapsed text selection in the document — i.e. the
 *  user has actually highlighted text (so Ctrl+C should copy that text, not the
 *  selected board element). A bare caret in a note's editor is collapsed and
 *  returns false. */
function hasActiveTextSelection(): boolean {
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && sel.toString().length > 0;
}
