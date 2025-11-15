import { Component, ElementRef, ViewChild, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from "@angular/forms";
import { NavbarComponent } from '../../helpers/navbar/navbar.component';
import { BoardTile } from './board-tile/board-tile.data';
import { BoardTileComponent } from './board-tile/board-tile.component';
import { BoardConnector } from './board-connector/board-connector';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, NavbarComponent, FormsModule, BoardTileComponent],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss']
})
export class BoardComponent implements OnInit {
  @ViewChild('board', { static: true }) boardRef!: ElementRef<HTMLDivElement>;
  @ViewChild('navbar', { static: true, read: ElementRef }) navbarRef!: ElementRef;

  private isDragging = false;
  private startX = 0;
  private startY = 0;

  cameraX = 0; // top-left of viewport in world coords
  cameraY = 0;
  zoom = 1;

  tiles = [
    new BoardTile(100, 100, 300, 150, new Set(), 0, 'Item A'),
    new BoardTile(7000, 1000, 400, 200, new Set(), 0, 'Item B'),
    new BoardTile(14000, 1000, 250, 250, new Set(), 0, 'Item C'),
    new BoardTile(1000, 6000, 350, 300, new Set(), 0, 'Item D'),
    new BoardTile(7000, 6000, 500, 100, new Set(), 0, 'Item E')
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

    this.setupListeners()
    this.updateBoard();
  }

  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent) {
    event.preventDefault();
    const board = this.boardRef.nativeElement;
    const rect = board.getBoundingClientRect();

    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const newZoom = this.zoom + (event.deltaY < 0 ? 0.1 : -0.1);
    if (newZoom < 0.1 || newZoom > 5) return;

    // Keep mouse position fixed during zoom
    const worldMouseX = (mouseX / this.zoom) + this.cameraX;
    const worldMouseY = (mouseY / this.zoom) + this.cameraY;

    this.zoom = Math.round(newZoom * 10) / 10;

    this.cameraX = worldMouseX - (mouseX / this.zoom);
    this.cameraY = worldMouseY - (mouseY / this.zoom);

    this.updateBoard();
  }

  private updateBoard() {
    const board = this.boardRef.nativeElement;

    // Update background scaling
    board.style.backgroundSize = `scale(${this.zoom})`;
    board.style.backgroundPosition = `${-this.cameraX}px ${-this.cameraY}px`;

    // Update items positions in screen pixels
    this.tiles
    .forEach(item => {
      item.screenX = (item.x - this.cameraX) * this.zoom;
      item.screenY = (item.y - this.cameraY) * this.zoom;
      item.screenWidth = item.width * this.zoom;
      item.screenHeight = item.height * this.zoom;
    });

    // Update drawn squares positions
    this.connectors
    .forEach(square => {
      square.screenX = (square.x - this.cameraX) * this.zoom;
      square.screenY = (square.y - this.cameraY) * this.zoom;
      square.screenWidth = square.width * this.zoom * 100;
      square.screenHeight = square.height * this.zoom * 100;
    });

  }

  isItemVisible(item: any): boolean {
    const boardWidth = this.boardRef.nativeElement.offsetWidth / this.zoom;
    const boardHeight = this.boardRef.nativeElement.offsetHeight / this.zoom;

    return (
      item.screenX > -item.screenWidth &&
      (item.screenX / this.zoom) < boardWidth &&
      item.screenY > -item.screenHeight &&
      (item.screenY / this.zoom) < boardHeight 
    )
  }

  centerOnItem(item:any) {
    const board = this.boardRef.nativeElement;
    const navbar = this.navbarRef.nativeElement;
    const viewportWidth = board.offsetWidth 
    const viewportHeight = board.offsetHeight

    // Set camera so that item center is at viewport center
    this.zoom = 1
    this.cameraX = item.getCenterX() - (viewportWidth / 2) / this.zoom;
    this.cameraY = item.getCenterY() - (viewportHeight / 2) / this.zoom + navbar.offsetHeight;

    this.updateBoard();
  }

  setupListeners(){
    const board = this.boardRef.nativeElement;
    board.addEventListener('mousedown', (event: MouseEvent) => {
      this.isDragging = true;
      this.startX = event.clientX;
      this.startY = event.clientY;
      board.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (event: MouseEvent) => {
      if (!this.isDragging) return;

      // Calculate delta in screen pixels
      const deltaX = event.clientX - this.startX;
      const deltaY = event.clientY - this.startY;

      // Convert delta to world coordinates by dividing by zoom
      this.cameraX -= deltaX / this.zoom;
      this.cameraY -= deltaY / this.zoom;

      this.startX = event.clientX;
      this.startY = event.clientY;

      this.updateBoard();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      board.style.cursor = 'grab';
    });
  }
  

}
