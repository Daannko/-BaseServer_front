import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
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
import { BoardTile } from './board-tile/board-tile.data';
import { BoardTileComponent } from './board-tile/board-tile.component';
import { BoardConnector } from './board-connector/board-connector';
import { BoardConnectorComponent } from './board-connector/board-connector.component';
import { NavbarService } from '../../helpers/navbar/navbar.service';
import { BoardMainService } from './board.main.service';
import { BoardSearchService } from './board.search.service';
import { Observable } from 'rxjs';
import { SvgIconComponent } from '../../helpers/svg-icon/svg-icon.component';
import { Board } from './models/board.model';
import { Topic } from './models/topic.model';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule,
    NavbarComponent,
    FormsModule,
    BoardTileComponent,
    BoardConnectorComponent,
    SvgIconComponent,
  ],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss'],
})
export class BoardComponent implements OnInit, AfterViewInit {
  @ViewChild('board', { static: true }) boardRef!: ElementRef<HTMLDivElement>;
  @ViewChild('navbar', { static: true, read: ElementRef })
  navbarRef!: ElementRef;
  @ViewChild('defaultNavbarTemplate', { static: true })
  defaultNavbarTemplate!: TemplateRef<any>;
  @ViewChildren(BoardConnectorComponent)
  connectorComponents!: QueryList<BoardConnectorComponent>;
  @ViewChildren(BoardTileComponent)
  tileComponents!: QueryList<BoardTileComponent>;
  @ViewChild('newBoardNameInput', { static: true })
  nameInputRef!: ElementRef<HTMLInputElement>;

  boards$!: Observable<Board[] | null>;
  topics$!: Observable<Topic[] | null>;
  isSearchOpen = true;
  isCreateOpen = false;
  newBoardName = '';
  newBoardNameTouched = false;
  newBoardDescription = '';
  searchQuery = '';

  tiles: BoardTile[] = [];
  connectors: Array<BoardConnector> = [];
  tilesMap: Map<string, BoardTile> = new Map();
  requiredConnectors: Map<string, string[]> = new Map();

  selectedBoard: Board | null = null;

  private buildDefaultNavbarContext() {
    return {
      getIsSearchOpen: () => this.isSearchOpen,
      toggleSearch: () => this.toggleSearchState(),
    };
  }

  private resetTileState(): void {
    this.tiles.length = 0;
    this.connectors.length = 0;
    this.tilesMap.clear();
    this.requiredConnectors.clear();
  }

  private rebuildConnectors(): void {
    this.connectors.length = 0;
    for (const tile of this.tiles) {
      this.connectors.push(...Array.from(tile.connectors));
    }
  }

  get isCreateNameValid(): boolean {
    return this.newBoardName.trim().length > 0;
  }

  constructor(
    private navBarService: NavbarService,
    private cdr: ChangeDetectorRef,
    private mainBoardService: BoardMainService,
    private boardSearchService: BoardSearchService
  ) {
    this.boards$ = this.boardSearchService.boards$;
    this.topics$ = this.boardSearchService.topics$;
  }

  resetNewBoardForm() {
    this.newBoardName = '';
    this.newBoardDescription = '';
  }

  toggleSearchState() {
    this.isSearchOpen = !this.isSearchOpen;
  }

  toggleCreateState() {
    this.isCreateOpen = !this.isCreateOpen;
  }

  async selectBoard(id: string) {
    try {
      const board = await this.boardSearchService.getBoard(id);
      this.selectedBoard = board;

      const defaultNavbarContext = this.buildDefaultNavbarContext();

      this.resetTileState();
      this.boardSearchService.clearTopics();

      const topics = await this.boardSearchService.getTopicsByIds(
        board.topics,
        false
      );
      for (const topic of topics) {
        this.addBoardTile(topic);
      }
      this.rebuildConnectors();

      // Let Angular render tiles/connectors, then refresh board + connector sizes.
      await Promise.resolve();
      this.cdr.detectChanges();

      this.mainBoardService.initialize({
        boardRef: this.boardRef,
        tiles: this.tiles,
        tileComponents: this.tileComponents
          ? this.tileComponents.toArray()
          : [],
        cdr: this.cdr,
        navBarService: this.navBarService,
        defaultNavbarTemplate: this.defaultNavbarTemplate,
        defaultNavbarContext,
      });
      this.isSearchOpen = false;

      // ensure navbar updates even if it was showing the default template
      this.navBarService.setTemplate(
        this.defaultNavbarTemplate,
        defaultNavbarContext
      );
      this.connectorComponents?.forEach((c) => c.updateSize());
      if (this.tiles.length > 0) {
        this.mainBoardService.centerOnItem(this.tiles[0]);
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
        .includes(query)
    );
  }

  isItemVisible(item: BoardTile): boolean {
    return this.mainBoardService
      ? this.mainBoardService.isItemVisible(item)
      : false;
  }

  moveToItem(item: BoardTile) {
    if (!this.mainBoardService) return;
    this.mainBoardService.moveToItem(item);
  }

  centerOnItem(item: BoardTile) {
    if (!this.mainBoardService) return;
    this.mainBoardService.centerOnItem(item);
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
      viewportHeight
    );
    if (board != null) {
      this.resetNewBoardForm();
      this.isCreateOpen = false;
      this.selectBoard(board.id);
    }
  }

  ngOnInit() {}

  ngAfterViewInit() {
    this.boardSearchService.refreshBoards();

    const defaultNavbarContext = this.buildDefaultNavbarContext();

    this.mainBoardService.initialize({
      boardRef: this.boardRef,
      tiles: this.tiles,
      tileComponents: this.tileComponents ? this.tileComponents.toArray() : [],
      cdr: this.cdr,
      navBarService: this.navBarService,
      zoom: 1,
      cameraX: 0,
      cameraY: 0,
      defaultNavbarTemplate: this.defaultNavbarTemplate,
      defaultNavbarContext,
    });

    this.navBarService.setTemplate(
      this.defaultNavbarTemplate,
      defaultNavbarContext
    );
    this.mainBoardService.setupListeners();
    if (this.tiles.length > 0) {
      this.mainBoardService.centerOnItem(this.tiles[0]);
    }

    Promise.resolve()
      .then(() => {
        this.connectorComponents.forEach((item) => {
          item.updateSize();
        });
      })
      .then(() => {
        this.mainBoardService.updateBoard();
      });
  }

  addBoardTile(topic: Topic) {
    const tile = BoardTile.fromTopic(topic);

    this.tiles.push(tile);
    this.tilesMap.set(tile.id, tile);

    const waitingIds = this.requiredConnectors.get(tile.id) ?? [];
    for (const waitingId of waitingIds) {
      const waitingTile = this.tilesMap.get(waitingId);
      if (waitingTile) {
        waitingTile.addConnector(tile);
      }
    }
    if (waitingIds.length) {
      this.requiredConnectors.delete(tile.id);
    }

    for (const relatedTopicId of topic.relatedTopics ?? []) {
      if (!relatedTopicId || relatedTopicId === tile.id) continue;

      const relatedTile = this.tilesMap.get(relatedTopicId);
      if (relatedTile) {
        tile.addConnector(relatedTile);
        continue;
      }

      const pending = this.requiredConnectors.get(relatedTopicId) ?? [];
      pending.push(tile.id);
      this.requiredConnectors.set(relatedTopicId, pending);
    }
  }
}
