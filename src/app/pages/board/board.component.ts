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
import { Topic } from './models/topic.model';
import {
  ContextMenuComponent,
  ContextMenuItem,
} from '../common/context-menu/context-menu.component';
import { StorageService } from '../../service/storage.service';
import { AspectGuide, BoardSnapService, SnapGuides } from './board-snap.service';
import { BoardHistoryService } from './board-history.service';
import { BoardSectionComponent } from './board-section/board-section.component';
import { BoardSection, SECTION_MARKER } from './board-section/board-section.data';
import { BoardImageComponent } from './board-image/board-image.component';
import { BoardImage, IMAGE_MARKER } from './board-image/board-image.data';
import { extractPlainText } from '../../helpers/rich-text.util';

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
  @ViewChildren(BoardNoteComponent)
  noteComponents!: QueryList<BoardNoteComponent>;
  @ViewChild('newBoardNameInput', { static: false })
  nameInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('searchInput', { static: false })
  searchInputRef?: ElementRef<HTMLInputElement>;

  boards$!: Observable<Board[] | null>;
  topics$!: Observable<Topic[] | null>;
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
    if (this.activeNavbarNote) {
      this.activeNavbarNote.forceToRender = false;
      this.activeNavbarNote = null;
    }
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
  ) {
    this.boards$ = this.boardSearchService.boards$;
    this.topics$ = this.boardSearchService.topics$;
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
      this.boardSearchService.clearTopics();

      const topics = await this.boardSearchService.getTopicsByIds(
        board.topics,
        false,
      );
      for (const topic of topics) {
        if (topic.note === SECTION_MARKER) {
          this.addBoardSection(topic);
        } else if (topic.note === IMAGE_MARKER) {
          this.addBoardImage(topic);
        } else {
          this.addBoardNote(topic);
        }
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
    if (this.notes.length > 0) {
      this.mainBoardService.centerOnItem(this.notes[0]);
    }

    Promise.resolve().then(() => this.mainBoardService.updateBoard());
  }

  addBoardNote(topic: Topic) {
    const note = BoardNote.fromNoteTopic(topic);
    this.notes.push(note);
    this.notesMap.set(note.id, note);
  }

  addBoardSection(topic: Topic) {
    const section = BoardSection.fromSectionTopic(topic);
    this.sections.push(section);
  }

  addBoardImage(topic: Topic) {
    const image = BoardImage.fromImageTopic(topic);
    this.images.push(image);
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
        await this.boardSearchService.deleteTopic(section.serverId);
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
        await this.boardSearchService.deleteTopic(image.serverId);
      } catch {
        return;
      }
    }
    this.recordDelete(image, this.images);
    this.removeFromList(image, this.images);
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
        const reader = new FileReader();
        reader.onload = () => {
          const src = reader.result as string;
          if (src) this.addImageFromSrc(src);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }

  /** Create an image element from a data URL, sized from its natural dimensions
   *  and placed at the center of the current viewport. */
  private addImageFromSrc(src: string): void {
    if (!this.selectedBoard) return;

    const probe = new Image();
    probe.onload = () => {
      const MAX_SCREEN = 600;
      let sw = probe.naturalWidth || 400;
      let sh = probe.naturalHeight || 300;
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
        src,
      );
      image.setNatural(probe.naturalWidth, probe.naturalHeight);

      this.images.push(image);
      this.bringToFront(image);
      this.recordCreate(image, this.images);
      this.cdr.detectChanges();
    };
    probe.src = src;
  }

  async onDeleteNote(tile: BoardItem): Promise<void> {
    if (tile.serverId) {
      try {
        await this.boardSearchService.deleteTopic(tile.serverId);
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
    const allItems: BoardItem[] = [...this.notes, ...this.sections, ...this.images];
    const tilesToCreate = allItems.filter((t) => !t.serverId);

    if (tilesToCreate.length > 0) {
      const createdTopics = await Promise.all(
        tilesToCreate.map((t) =>
          this.boardSearchService.createTopic(
            t,
            boardId,
            t instanceof BoardSection
              ? SECTION_MARKER
              : t instanceof BoardImage
                ? IMAGE_MARKER
                : '__note__',
          ),
        ),
      );
      for (let i = 0; i < createdTopics.length; i++) {
        const created = createdTopics[i];
        if (!created) continue;
        tilesToCreate[i].serverId = created.id;
      }
    }

    await Promise.all(
      allItems.filter(t => Boolean(t.serverId)).map(t => this.boardSearchService.saveTopic(t)),
    );
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
