import { Component, ElementRef, ViewChild, OnInit, HostListener, ViewChildren, QueryList, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from "@angular/forms";
import { NavbarComponent } from '../../helpers/navbar/navbar.component';
import { BoardTile } from './board-tile/board-tile.data';
import { BoardTileComponent } from './board-tile/board-tile.component';
import { BoardConnector } from './board-connector/board-connector';
import { BoardConnectorComponent } from './board-connector/board-connector.component';
import { read } from 'fs';
import { NavbarService } from '../../service/navbar.service';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, NavbarComponent, FormsModule, BoardTileComponent, BoardConnectorComponent],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss']
  
})
export class BoardComponent implements OnInit {
  @ViewChild('board', {static: true}) boardRef!: ElementRef<HTMLDivElement>;
  @ViewChild('navbar', { static: true, read: ElementRef }) navbarRef!: ElementRef;
  @ViewChildren(BoardConnectorComponent) connectorComponents!: QueryList<BoardConnectorComponent>;
  @ViewChildren(BoardTileComponent) tileComponents!: QueryList<BoardTileComponent>

  constructor(private navBarService: NavbarService, private cdr: ChangeDetectorRef ){}

  private isDragging = false;
  private startX = 0;
  private startY = 0;

  cameraX = 0; // top-left of viewport in world coords
  cameraY = 0;
  zoom = 1;

  tiles = [
    new BoardTile(100, 100, 400, 300, new Set(), 0, 'Item A'),
    new BoardTile(1200, 150, 500, 360, new Set(), 0, 'Item B'),
    new BoardTile(2100, 1100, 360, 400, new Set(), 0, 'Item CSSSSS'),
    new BoardTile(2800, 350, 440, 320, new Set(), 0, 'Item D'),
    new BoardTile(1400, 1800, 380, 340, new Set(), 0, 'Item E')
  ];

  connectors: Array<BoardConnector> = [];

  ngOnInit() {
    this.tiles[0].addConnector(this.tiles[1]); // A -> B
    this.tiles[1].addConnector(this.tiles[2]); // B -> C
    this.tiles[2].addConnector(this.tiles[3]); // C -> D
    this.tiles[3].addConnector(this.tiles[4]); // D -> E
    this.tiles[4].addConnector(this.tiles[0]); // E -> A (circular)
    this.tiles[0].addConnector(this.tiles[3]); // A -> D
    this.tiles[1].addConnector(this.tiles[4]); // B -> E
    this.tiles[2].addConnector(this.tiles[0]); // C -> A

    this.tiles.forEach(item => {
      this.connectors.push(...Array.from(item.connectors))
    })
    this.centerOnItem(this.tiles[0])
    this.setupListeners()
    this.updateBoard();
  }

  ngAfterViewInit(){
    Promise.resolve().then(() => {
      this.connectorComponents.forEach(item => {
      item.updateSize()
     })
    }).then(() => {
      this.updateBoard()
    })
    
      
  }

  private updateBoard() {
    const board = this.boardRef.nativeElement;

    // Update background scaling
    board.style.backgroundSize = `scale(${this.zoom})`;
    board.style.backgroundPosition = `${-this.cameraX}px ${-this.cameraY}px`;

    // Update items positions in screen pixels
    this.tiles.forEach(item => {    
      item.updateSize(this.zoom)
      item.updatePosition(this.cameraX,this.cameraY,this.zoom)
      item.connectors.forEach(connector => {
        connector.updateSize(this.zoom)
        connector.updatePosition(this.zoom)
      })
    })
  }

  isItemVisible(item: any): boolean {
    const boardWidth = this.boardRef.nativeElement.offsetWidth / this.zoom;
    const boardHeight = this.boardRef.nativeElement.offsetHeight / this.zoom;

    return (
      item.forceToRender ||
      (item.screenX > -item.screenWidth &&
      (item.screenX / this.zoom) < boardWidth &&
      item.screenY > -item.screenHeight &&
      (item.screenY / this.zoom) < boardHeight)
    )
  }

  centerOnItem(item:any) {
    const board = this.boardRef.nativeElement;
    const viewportWidth = board.offsetWidth 
    const viewportHeight = board.offsetHeight

    this.cameraX = item.getCenterX() - (viewportWidth / (2 * this.zoom));
    this.cameraY = (item.getCenterY()) - (viewportHeight / (2 * this.zoom));

    this.updateBoard()
  }

moveToItem(item: BoardTile){
  item.forceToRender = true
  this.cdr.detectChanges()
  this.centerOnItem(item);
  this.updateBoard();

  Promise.resolve().then(() => {
    const centerTile = this.tileComponents.find(tile => tile.tile.label === item.label);
    if (centerTile) {
      centerTile.setNavbarContext(centerTile.navbarContentTemplate);
    }
    item.forceToRender = false
  });

}



  setupListeners(){
    const board = this.boardRef.nativeElement;

    board.addEventListener('wheel', (event: WheelEvent) => {
      event.preventDefault();
      const board = this.boardRef.nativeElement;
      const rect = board.getBoundingClientRect();

      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const newZoom = this.zoom + (event.deltaY < 0 ? 0.05 : -0.05);
      if (newZoom < 0.1 || newZoom > 5) return;

      // Keep mouse position fixed during zoom
      const worldMouseX = (mouseX / this.zoom) + this.cameraX;
      const worldMouseY = (mouseY / this.zoom) + this.cameraY;

      this.zoom = newZoom

      this.cameraX = worldMouseX - (mouseX / this.zoom);
      this.cameraY = worldMouseY - (mouseY / this.zoom);

      this.updateBoard();
    })


    board.addEventListener('mousedown', (event: MouseEvent) => {
      // Only start dragging if clicking directly on the board, not on tiles or their children
      if (event.target !== board) return;
      
      this.navBarService.clear()
      this.isDragging = true;
      this.startX = event.clientX;
      this.startY = event.clientY;
      board.style.cursor = 'grabbing';
    });

    board.addEventListener('mousemove', (event: MouseEvent) => {
      if (!this.isDragging) return;

      // Calculate delta in screen pixels
      const deltaX = event.clientX - this.startX;
      const deltaY = event.clientY - this.startY;

      // Convert delta to world coordinates by dividing by zoom
      this.cameraX -= deltaX / this.zoom;
      this.cameraY -= deltaY / this.zoom;

      this.startX = event.clientX;
      this.startY = event.clientY;

      board.style.backgroundPosition = `${-this.cameraX}px ${-this.cameraY}px`;

      this.tiles.forEach(item => {
        item.updatePosition(this.cameraX,this.cameraY,this.zoom)
        item.connectors.forEach(connector => {
          connector.updatePosition(this.zoom)
        })

      })
    });

    board.addEventListener('mouseup', () => {
      this.isDragging = false;
      board.style.cursor = 'grab';
    });
  }
  

}
