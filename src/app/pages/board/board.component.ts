import { booleanAttribute, Component, ElementRef, ViewChild } from '@angular/core';
import { NavbarComponent } from '../../helpers/navbar/navbar.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from "@angular/forms"; // Import CommonModule

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, NavbarComponent, FormsModule],
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss'
})
export class BoardComponent {
@ViewChild('board', { static: true }) boardRef!: ElementRef<HTMLDivElement>;

  private isDragging = false;
  private startX = 0;
  private startY = 0;
  boardX = 0;
  boardY = 0;
  scale = 1
  zoom = 1;

  items = [
    { x: 100, y: 100, label: 'Item 1' , scale:1, width: 100, height: 50},
    { x: 300, y: 200, label: 'Item 2' , scale:1, width: 100, height: 50},
    { x: 500, y: 400, label: 'Item 3' , scale:1, width: 100, height: 50}
  ];

  ngOnInit() {
    const board = this.boardRef.nativeElement;

    this.boardX = 0
    this.boardY = 0

    board.addEventListener('mousedown', (event: MouseEvent) => {
      this.isDragging = true;
      this.startX = event.clientX; // Use the exact mouse position
      this.startY = event.clientY;
      board.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (event: MouseEvent) => {
      if (!this.isDragging) return;

      const deltaX = event.clientX - this.startX;
      const deltaY = event.clientY - this.startY;

      this.boardX += deltaX;
      this.boardY += deltaY;

      this.boardRef.nativeElement.style.backgroundPosition = `${this.boardX}px ${this.boardY}px`;

      this.items.forEach(item => {
        item.x += deltaX;
        item.y += deltaY;
      });

      this.startX = event.clientX;
      this.startY = event.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      board.style.cursor = 'grab';
    });

  }

onWheel(event: WheelEvent) {
  event.preventDefault(); // Prevent default browser zoom

  const zoomChange = event.deltaY < 0 ? 0.1 : -0.1;
  if (this.zoom + zoomChange < 0.5 || this.zoom + zoomChange > 2) return; // Clamp zoom level

  const newZoom = this.zoom + zoomChange;
  const zoomFactor = newZoom / this.zoom;

  const board = this.boardRef.nativeElement;
  const rect = board.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  // Adjust item positions and scale to keep them relative to the zoom center
  this.items.forEach(item => {
    item.x = mouseX + (item.x - mouseX) * zoomFactor;
    item.y = mouseY + (item.y - mouseY) * zoomFactor;
    item.scale *= zoomFactor; // Adjust item scale
  });

  // Update the zoom level
  this.zoom = newZoom;

  // Apply the zoom to the board background
  this.boardRef.nativeElement.style.backgroundSize = `${this.zoom * 100}%`;
  this.boardRef.nativeElement.style.backgroundPosition = 'center';
}

  isItemvisible(item: { x: number; y: number; scale: number; width: number; height: number }): boolean {
    const boardWidth = this.boardRef.nativeElement.offsetWidth / this.zoom; // Adjust for zoom level
    const boardHeight = this.boardRef.nativeElement.offsetHeight / this.zoom; // Adjust for zoom level

    // Adjust visibility check to account for item scale and dimensions
    const itemWidth = item.width * item.scale;
    const itemHeight = item.height * item.scale;

    return (
      item.x + itemWidth / 2 > this.boardX &&
      item.x - itemWidth / 2 < this.boardX + boardWidth &&
      item.y + itemHeight / 2 > this.boardY &&
      item.y - itemHeight / 2 < this.boardY + boardHeight
    );
  }

}
