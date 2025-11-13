import { Component, Input } from '@angular/core';
import { BoardTile } from './board-tile.data';

@Component({
  selector: 'app-board-tile',
  standalone: true,
  imports: [],
  templateUrl: './board-tile.component.html',
  styleUrl: './board-tile.component.scss'
})
export class BoardTileComponent {
  @Input() tile!: BoardTile;
}
