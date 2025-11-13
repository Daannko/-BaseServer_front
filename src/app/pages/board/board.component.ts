import { Component, ElementRef, ViewChild, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from "@angular/forms";
import { NavbarComponent } from '../../helpers/navbar/navbar.component';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, NavbarComponent, FormsModule],
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
    { realX: 100, realY: 0, realWidth: 300, realHeight: 150, label: 'Item A', screenX: 0, screenY: 0, width: 0, height: 0 , isVisible: true},
    { realX: 500, realY: 200, realWidth: 400, realHeight: 200, label: 'Item B', screenX: 0, screenY: 0, width: 0, height: 0 , isVisible: true},
    { realX: 1000, realY: 100, realWidth: 250, realHeight: 250, label: 'Item C', screenX: 0, screenY: 0, width: 0, height: 0 , isVisible: true},
    { realX: 150, realY: 500, realWidth: 350, realHeight: 300, label: 'Item D', screenX: 0, screenY: 0, width: 0, height: 0 , isVisible: true},
    { realX: 800, realY: 400, realWidth: 500, realHeight: 100, label: 'Item E', screenX: 0, screenY: 0, width: 0, height: 0 , isVisible: true}
  ];

  ngOnInit() {
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
}
