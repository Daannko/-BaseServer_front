import { Component, ElementRef, ViewChild, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from "@angular/forms";
import { NavbarComponent } from '../../helpers/navbar/navbar.component';
import { BoardTile } from './board-tile/board-tile.data';
import { BoardTileComponent } from './board-tile/board-tile.component';

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

  items = [
    new BoardTile(100, 0, 300, 150, new Set(), 0, 'Item A'),
    new BoardTile(500, 200, 400, 200, new Set(), 0, 'Item B'),
    new BoardTile(1000, 100, 250, 250, new Set(), 0, 'Item C'),
    new BoardTile(150, 500, 350, 300, new Set(), 0, 'Item D'),
    new BoardTile(800, 400, 500, 100, new Set(), 0, 'Item E')
  ];
Array: any;




  ngOnInit() {
    const board = this.boardRef.nativeElement;
    this.items[0].addLink(this.items[1])
    this.items[3].addLink(this.items[2])


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
    this.items.forEach(item => {
      item.screenX = (item.realX - this.cameraX) * this.zoom;
      item.screenY = (item.realY - this.cameraY) * this.zoom;
      item.width = item.realWidth * this.zoom;
      item.height = item.realHeight * this.zoom;
    });
  }

  isItemVisible(item: any): boolean {
    const boardWidth = this.boardRef.nativeElement.offsetWidth / this.zoom;
    const boardHeight = this.boardRef.nativeElement.offsetHeight / this.zoom;

    return (
      item.screenX > -item.width &&
      (item.screenX / this.zoom) < boardWidth &&
      item.screenY > -item.height &&
      (item.screenY / this.zoom) < boardHeight 
    )
  }

  centerOnItem(item:any) {
    const board = this.boardRef.nativeElement;
    const navbar = this.navbarRef.nativeElement;
    const viewportWidth = board.offsetWidth 
    const viewportHeight = board.offsetHeight 

    // Center of the item in world coordinates
    const itemCenterX = item.realX + item.realWidth / 2;
    const itemCenterY = item.realY + item.realHeight / 2;
    // Set camera so that item center is at viewport center
    this.cameraX = itemCenterX - (viewportWidth / 2) / this.zoom;
    this.cameraY = itemCenterY - (viewportHeight / 2) / this.zoom + navbar.offsetHeight;

    this.updateBoard();
  }

  getFirstLink(item: any): any {
    if (item.links && item.links.size > 0) {
      return item.links.values().next().value;
    }
    return item;
  }
}
