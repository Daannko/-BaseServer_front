import { Component, Input } from '@angular/core';
import { BoardTile } from './board-tile.data';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CKEditorModule } from '@ckeditor/ckeditor5-angular';
import * as ClassicEditor from '@ckeditor/ckeditor5-build-classic';

@Component({
  selector: 'app-board-tile',
  standalone: true,
  imports: [CommonModule, FormsModule, CKEditorModule],
  templateUrl: './board-tile.component.html',
  styleUrl: './board-tile.component.scss'
})
export class BoardTileComponent {
  @Input() tile!: BoardTile;

  // ClassicEditor build may be exported as default or as module; normalize here
  constRaw: any = (ClassicEditor as any);
  public Editor: any = this.constRaw && this.constRaw.default ? this.constRaw.default : this.constRaw;
  public editorAvailable: boolean = !!(this.Editor && this.Editor.create);

  onContextMenu(event: MouseEvent){
    event.preventDefault();
    console.log('tile context menu');
  }

}
