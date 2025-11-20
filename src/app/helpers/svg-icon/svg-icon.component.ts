import { Component, HostBinding, Input } from '@angular/core';


@Component({
  selector: 'app-svg-icon',
  standalone: true,
  imports: [],
  templateUrl: './svg-icon.component.html',
  styleUrl: './svg-icon.component.scss'
})
export class SvgIconComponent {
    @HostBinding('style.-webkit-mask-image')
    public _path!: string;

  @Input()
  public set icon(icon: string){
    switch(icon){
      case 'editor-bold': 
        this._path = "url(assets/board_icons/editor-bold-svgrepo-com.svg)";
        break;
      case 'editor-italic-svgrepo-com': 
        this._path = "url(assets/board_icons/editor-italic-svgrepo-com.svg)";
        break;
      case 'editor-ul-svgrepo-com': 
        this._path = "url(assets/board_icons/editor-ul-svgrepo-com.svg)";
        break;
      case 'editor-table-svgrepo-com': 
        this._path = "url(assets/board_icons/editor-table-svgrepo-com.svg)";
        break;
    }
  }

}
