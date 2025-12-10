import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
  HostListener,
  ViewChildren,
  QueryList,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../../helpers/navbar/navbar.component';
import { BoardTile } from './board-tile/board-tile.data';
import { BoardTileComponent } from './board-tile/board-tile.component';
import { BoardConnector } from './board-connector/board-connector';
import { BoardConnectorComponent } from './board-connector/board-connector.component';
import { read } from 'fs';
import { NavbarService } from '../../service/navbar.service';
import { BoardMainService } from './board.main.service';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule,
    NavbarComponent,
    FormsModule,
    BoardTileComponent,
    BoardConnectorComponent,
  ],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss'],
})
export class BoardComponent implements OnInit {
  @ViewChild('board', { static: true }) boardRef!: ElementRef<HTMLDivElement>;
  @ViewChild('navbar', { static: true, read: ElementRef })
  navbarRef!: ElementRef;
  @ViewChildren(BoardConnectorComponent)
  connectorComponents!: QueryList<BoardConnectorComponent>;
  @ViewChildren(BoardTileComponent)
  tileComponents!: QueryList<BoardTileComponent>;

  constructor(
    private navBarService: NavbarService,
    private cdr: ChangeDetectorRef,
    private mainBoardService: BoardMainService
  ) {}

  cameraX = 0; // top-left of viewport in world coords
  cameraY = 0;
  zoom = 1;

  tiles = [
    new BoardTile(100, 100, 400, 300, new Set(), 0, 'Item A'),
    new BoardTile(1200, 150, 500, 360, new Set(), 0, 'Item B'),
    new BoardTile(2100, 1100, 360, 400, new Set(), 0, 'Item CSSSSS'),
    new BoardTile(2800, 350, 440, 320, new Set(), 0, 'Item D'),
    new BoardTile(1400, 1800, 380, 340, new Set(), 0, 'Item E'),
  ];

  connectors: Array<BoardConnector> = [];

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

  ngOnInit() {
    this.tiles[0].addConnector(this.tiles[1]); // A -> B
    this.tiles[1].addConnector(this.tiles[2]); // B -> C
    this.tiles[2].addConnector(this.tiles[3]); // C -> D
    this.tiles[3].addConnector(this.tiles[4]); // D -> E
    this.tiles[4].addConnector(this.tiles[0]); // E -> A (circular)
    this.tiles[0].addConnector(this.tiles[3]); // A -> D
    this.tiles[1].addConnector(this.tiles[4]); // B -> E
    this.tiles[2].addConnector(this.tiles[0]); // C -> A

    this.tiles.forEach((item) => {
      this.connectors.push(...Array.from(item.connectors));
    });
  }

  ngAfterViewInit() {
    this.mainBoardService.initialize({
      boardRef: this.boardRef,
      tiles: this.tiles,
      tileComponents: this.tileComponents ? this.tileComponents.toArray() : [],
      cdr: this.cdr,
      navBarService: this.navBarService,
      zoom: 1,
      cameraX: 0,
      cameraY: 0,
    });
    this.mainBoardService.setupListeners();
    this.mainBoardService.centerOnItem(this.tiles[0]);

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
}
